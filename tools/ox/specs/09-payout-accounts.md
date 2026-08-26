# TASK: Migration 0005 — payout accounts, payout audit trail, in-app notifications

Produce ONE file: `supabase/migrations/0005_payout_accounts_notifications.sql`

Existing schema you are extending (read all of it — names, patterns and grant style must match):

@include supabase/migrations/0002_admin_payouts.sql
@include supabase/migrations/0004_ledger_refunds.sql

## Why this migration exists

Payouts are executed MANUALLY by an admin in the Sifalo/bank portal. Today the payouts
table records an amount and an approval but NO DESTINATION — so nobody knows where to
send the money. This adds the destination, the proof, and the audit trail.

## 1. `payout_accounts`

```
id                uuid pk default gen_random_uuid()
owner_id          uuid not null -> profiles(id) on delete cascade
wallet            text not null check (wallet in ('zaad','edahab','pbwallet','bank'))
account_number    text not null
account_name      text not null            -- the account HOLDER's name
bank_name         text                     -- only meaningful when wallet='bank'
is_verified       boolean not null default false
verified_by       uuid -> profiles(id) on delete set null
verified_at       timestamptz
archived_at       timestamptz
created_at        timestamptz not null default now()
```
- CHECK: `account_number` matches `^[A-Za-z0-9+\-]{6,34}$`, `account_name` length 2..120.
- Partial unique index: one active account per (owner_id, wallet, account_number)
  where `archived_at is null`.
- Index on `(owner_id) where archived_at is null`.

**Verification is admin-only.** Add a `verify_payout_account(p_account_id uuid, p_admin_id uuid)`
function: checks `profiles.role = 'admin'` INSIDE the function, sets is_verified/verified_by/
verified_at. An owner must never be able to verify their own account — enforce with column
grants exactly like profiles.role: revoke insert/update on payout_accounts from
authenticated entirely (all writes go through service-role functions).

## 2. `payouts` — new columns

```
payout_account_id            uuid -> payout_accounts(id) on delete set null
destination_wallet           text
destination_account_number   text
destination_account_name     text
request_note                 text
paid_at                      timestamptz
paid_by                      uuid -> profiles(id) on delete set null
receipt_path                 text        -- storage path, private bucket
```

**CRITICAL — the destination snapshot must be immutable.** Once a payout row exists, the
four `destination_*` columns must never change. If they were mutable, an attacker could get
$900 approved to one number and swap the destination before the admin executes the transfer.
Enforce with a BEFORE UPDATE trigger that raises if any destination_* value differs from its
OLD value (allow the transition from NULL only if the OLD value was NULL).

## 3. `payout_events` — append-only audit trail

```
id          uuid pk default gen_random_uuid()
payout_id   uuid not null -> payouts(id) on delete cascade
event       text not null check (event in ('requested','approved','rejected','paid','cancelled'))
actor_id    uuid -> profiles(id) on delete set null
note        text
created_at  timestamptz not null default now()
```
- Immutable exactly like `ledger_entries`: RLS on with NO write policies, a BEFORE UPDATE
  OR DELETE row trigger that raises, AND a BEFORE TRUNCATE statement trigger.
- SELECT policy: campaign owner of the payout's campaign, or `is_staff()`.
- Index on `(payout_id, created_at)`.

## 4. Rewrite the payout functions

Keep every existing guard (admin checks inside functions, FOR UPDATE row lock, legal
transitions, ownership checks). Add:

- `request_payout(p_campaign_id uuid, p_owner_id uuid, p_amount_minor bigint, p_account_id uuid, p_note text)`
  - Everything it does today (lock campaign row FOR UPDATE, then derive available, then check).
  - PLUS: load the account and RAISE unless it belongs to p_owner_id, `is_verified = true`,
    and `archived_at is null`. An unverified account must never receive money.
  - Snapshot wallet/account_number/account_name into the destination_* columns.
  - Store p_note in request_note.
  - Insert a `payout_events` row: event='requested', actor=p_owner_id, note=p_note.
- `decide_payout(...)` — unchanged behaviour, PLUS a payout_events row
  ('approved'|'rejected', actor=p_admin_id, note=p_note).
- `mark_payout_paid(p_payout_id uuid, p_admin_id uuid, p_reference text, p_receipt_path text)`
  - Sets status='paid', provider_reference, **paid_at = now(), paid_by = p_admin_id**,
    receipt_path. Note: paid_at is DISTINCT from reviewed_at — approval time and payment
    time are different facts and conflating them destroys the audit trail.
  - Keeps writing the negative ledger entry it already writes.
  - Insert a payout_events row ('paid', actor=p_admin_id, note=p_reference).
- `cancel_payout(...)` — unchanged, PLUS a payout_events row ('cancelled', actor=p_owner_id).

## 5. `notifications`

```
id           uuid pk default gen_random_uuid()
user_id      uuid not null -> profiles(id) on delete cascade
kind         text not null check (kind in ('donation_received','campaign_approved','campaign_rejected','payout_approved','payout_rejected','payout_paid'))
title        text not null
body         text not null
link         text
campaign_id  uuid -> campaigns(id) on delete cascade
read_at      timestamptz
created_at   timestamptz not null default now()
```
- Index on `(user_id, created_at desc) where read_at is null`.
- RLS: SELECT own rows only. UPDATE own rows but ONLY the read_at column (column grant) —
  a user may mark their own notification read and nothing else. NO insert/delete policies;
  all writes come from service-role functions.

**Emitting a donation notification — the anonymity rule.**
Modify `credit_donation` so that after a successful credit it inserts a notification for the
campaign owner. The body MUST respect `donations.is_anonymous`:
- if `is_anonymous` is true → body says "Anonymous" and the donor's real name MUST NOT be
  written into the row at all.
- otherwise → the donor's `profiles.display_name` (fall back to "Someone" if blank).
A notification row is durable and readable later, so writing the real name for an anonymous
gift would permanently break the promise the donate form makes. Do not store it and mask on
read — never store it.
Do NOT notify when the campaign owner donates to their own campaign.

## 6. Storage bucket for receipts

Add a PRIVATE bucket `payout-receipts` (public=false, 10MB, jpeg/png/webp/pdf), exactly like
`identity-documents` in 0003: an INSERT policy scoped to a uid-named folder, and
**deliberately NO select policy** — reads happen only via service-role signed URLs.

## Constraints
- Idempotent DDL throughout (`if not exists`, `create or replace`, `drop policy if exists`,
  `drop trigger if exists`).
- Every new function: `security definer`, `set search_path = public`, revoked from
  public/anon/authenticated, granted to `service_role` only.
- Dropping and recreating a function with a changed signature: `drop function if exists` the
  OLD signature explicitly so the new one is unambiguous.
- Comment each section with WHY, not what.
