# TASK: Migration 0004 — append-only ledger and refunds

Produce ONE file: `supabase/migrations/0004_ledger_refunds.sql`

Existing schema you are extending (read all of it — names are fixed by these files):

@include supabase/migrations/0001_init.sql
@include supabase/migrations/0002_admin_payouts.sql

## Why this exists

`campaigns.raised_minor` is a mutable counter that only ever increases. There is no way
to reverse a donation, and no independent record to audit the counter against. This
migration adds an append-only ledger as the source of truth for money movement, and a
refund path that writes to it.

## 1. `ledger_entries` — append-only

```
id            uuid pk default gen_random_uuid()
campaign_id   uuid not null references campaigns(id) on delete cascade
donation_id   uuid references donations(id) on delete set null
payout_id     uuid references payouts(id) on delete set null
kind          text not null check (kind in ('donation','refund','payout','adjustment'))
amount_minor  bigint not null           -- SIGNED: positive credits the campaign, negative debits it
currency      char(3) not null default 'USD'
note          text
created_by    uuid references profiles(id) on delete set null
created_at    timestamptz not null default now()
```
- CHECK that the sign matches the kind: `donation` and positive `adjustment` are > 0;
  `refund` and `payout` are < 0.
- Index on `(campaign_id, created_at desc)`.
- Unique partial index so one donation can only ever be credited once and refunded once:
  `(donation_id, kind) where donation_id is not null`.

**Immutability.** Enable RLS. No insert/update/delete policies at all. On top of that add a
trigger that raises on UPDATE or DELETE:
```
create or replace function public.ledger_immutable() returns trigger ... 
  raise exception 'ledger_entries is append-only';
```
Attach it `before update or delete on ledger_entries for each row`. RLS alone is not
enough — the service role bypasses RLS, and this table must resist our own code too.
SELECT policy: campaign owner sees their campaign's entries; `is_staff()` sees all.

## 2. Refunds

Add `'refunded'` to the `donations.status` CHECK (drop and re-add the constraint;
it is named `donations_status_check`).

```
refund_donation(p_donation_id uuid, p_admin_id uuid, p_note text) returns void
```
`security definer`, `set search_path = public`. In order:
1. Verify `(select role from profiles where id = p_admin_id) = 'admin'`, else raise.
2. `SELECT ... FOR UPDATE` the donation.
3. Raise unless its status is exactly `'succeeded'`. A pending or already-refunded
   donation must never be refundable.
4. Set status `'refunded'`, `updated_at = now()`.
5. Insert a `refund` ledger entry with `amount_minor = -donation.amount_minor`.
6. `update campaigns set raised_minor = raised_minor - amount, donor_count = greatest(0, donor_count - 1)`.

## 3. Make the balance refund-aware — THIS IS THE IMPORTANT PART

Replace `campaign_available_minor` so it derives from the LEDGER, not from summing
donations directly:

```
available = greatest(0, coalesce(sum(amount_minor) from ledger_entries where campaign_id = X, 0)
                        - coalesce(sum(amount_minor) from payouts
                                   where campaign_id = X and status in ('requested','approved'), 0))
```
Note carefully: `paid` payouts are ALREADY in the ledger as negative entries, so counting
them again from the payouts table would double-debit. Only `requested` and `approved`
payouts are reservations not yet written to the ledger.

Also add:
```
campaign_balance_minor(p_campaign_id uuid) returns bigint
```
Identical but WITHOUT the `greatest(0, ...)` clamp. Refunding a donation whose money has
already been paid out legitimately drives a campaign negative, and an admin must be able
to see that. `request_payout` keeps using the clamped `campaign_available_minor`.

## 4. Backfill and wiring

- `credit_donation` must ALSO insert a `donation` ledger entry (positive) when it credits.
  Keep it idempotent — the unique `(donation_id, kind)` index must not be violated on a
  replay; use `on conflict do nothing`.
- `mark_payout_paid` must ALSO insert a `payout` ledger entry (negative).
- Backfill existing rows: insert `donation` entries for every already-succeeded donation
  and `payout` entries for every already-paid payout, `on conflict do nothing`, so the
  ledger is consistent with counters that predate it.

## 5. Grants

Revoke execute on every new function from public/anon/authenticated; grant to
`service_role` only.

Idempotent DDL throughout. Comment each section with WHY.
