# SHARED CONTRACT — admin, moderation, and payouts

Every workstream builds against this. Do not invent names that differ from it.

## Non-negotiable security rules

1. **A campaign balance is DERIVED, never stored.** There is no `balance` column anywhere.
   Any code that reads a balance calls `campaign_available_minor(campaign_id)`. A stored
   balance is a number an attacker can desynchronise; a derived one cannot be.

   ```
   available = SUM(donations.amount_minor WHERE status='succeeded')
             - SUM(payouts.amount_minor  WHERE status IN ('requested','approved','paid'))
   ```
   Requested and approved payouts are **reserved** — they subtract immediately, so a user
   cannot request $900 twice against a $900 balance.

2. **The client never sends a balance or an approval.** It sends an amount only. The
   server re-derives the balance inside the same transaction that inserts the payout,
   with `SELECT ... FOR UPDATE` on the campaign row so two concurrent requests serialise.

3. **Role is not self-assignable.** `profiles.role` is revoked from `authenticated` at the
   column level. Only `service_role` writes it.

4. **All payout state transitions go through SECURITY DEFINER functions** granted to
   `service_role` only. No API route ever UPDATEs `payouts.status` directly.

5. **Semi-admin (`moderator`) is read-only.** Enforced server-side in every mutating
   route, not by hiding buttons.

## Roles — `profiles.role`

| Role | Meaning |
|---|---|
| `user` | default |
| `moderator` | semi-admin: sees everything, may perform NOTHING |
| `admin` | sees everything, may moderate campaigns and decide payouts |

## Campaign status lifecycle

`campaigns.status` CHECK in: `under_review`, `active`, `paused`, `hidden`, `completed`, `rejected`, `removed`

- New campaigns are created as **`under_review`** (changed from the old default `active`).
- Only **`active`** is publicly visible. Everything else 404s on the public detail page
  and is excluded from all public lists — a hidden campaign's link must stop working.
- Owner may move between `active` and `paused` only. Owner may NEVER set
  `under_review`, `hidden`, `rejected`, or `removed`.
- Admin may set any status.

## `payouts` table

```
id                uuid pk
campaign_id       uuid not null -> campaigns(id)
requested_by      uuid not null -> profiles(id)
amount_minor      bigint not null check (amount_minor >= 100)
currency          char(3) not null default 'USD'
status            text not null default 'requested'
                  check (status in ('requested','approved','rejected','paid','cancelled'))
reviewed_by       uuid -> profiles(id)
reviewed_at       timestamptz
decision_note     text
provider_reference text
created_at        timestamptz not null default now()
updated_at        timestamptz not null default now()
```

Transitions (any other transition must raise):
- `requested` → `approved` | `rejected` | `cancelled`
- `approved`  → `paid` | `rejected`
- `paid`, `rejected`, `cancelled` are terminal.

`rejected` and `cancelled` release the reservation (they are not in the reserved set).

## SQL functions — all `security definer`, `set search_path = public`, granted to `service_role` ONLY

| Function | Behaviour |
|---|---|
| `campaign_available_minor(p_campaign_id uuid) returns bigint` | The formula above. Never negative — clamp at 0. |
| `request_payout(p_campaign_id uuid, p_owner_id uuid, p_amount_minor bigint) returns uuid` | Locks the campaign row `FOR UPDATE`. Raises if the campaign does not exist, if `owner_id <> p_owner_id`, if amount < 100, or if amount > available. Inserts `requested`, returns its id. |
| `decide_payout(p_payout_id uuid, p_admin_id uuid, p_decision text, p_note text) returns void` | `p_decision` in ('approved','rejected'). Raises unless the actor's `profiles.role = 'admin'` — check it inside the function, do not trust the caller. Raises on an illegal transition. |
| `mark_payout_paid(p_payout_id uuid, p_admin_id uuid, p_reference text) returns void` | `approved` → `paid`. Same admin check. |
| `cancel_payout(p_payout_id uuid, p_owner_id uuid) returns void` | Owner cancels their own still-`requested` payout. |
| `set_campaign_status(p_campaign_id uuid, p_admin_id uuid, p_status text, p_note text default null) returns void` | Admin-only, validates the target status, and records `review_note`/`reviewed_by`/`reviewed_at` in the same statement so the audit trail cannot drift from the decision. |

## API routes

All admin routes: 401 if unauthenticated, **403 if role is not admin/moderator**, and a
second 403 on any mutation if role is `moderator`. Never leak existence via 404-vs-403.

| Route | Method | Who | Notes |
|---|---|---|---|
| `/api/admin/campaigns` | GET | admin+moderator | all statuses, `?status=&q=&limit=&offset=` |
| `/api/admin/campaigns/[id]` | PATCH | admin only | `{ status, note }` → `set_campaign_status` |
| `/api/admin/transactions` | GET | admin+moderator | donations across all campaigns, `?status=&campaignId=` |
| `/api/admin/profiles` | GET | admin+moderator | organisers: campaign count, total raised. **Never return emails of non-organisers.** |
| `/api/admin/payouts` | GET | admin+moderator | all payouts, filterable by status |
| `/api/admin/payouts/[id]` | PATCH | admin only | `{ decision: 'approved'\|'rejected'\|'paid', note?, reference? }` |
| `/api/campaigns/[id]/balance` | GET | campaign owner only | `{ availableMinor, raisedMinor, reservedMinor, currency }` |
| `/api/campaigns/[id]/payouts` | GET, POST | campaign owner only | POST `{ amountMinor }` → `request_payout` |
| `/api/payouts/[id]` | DELETE | requester only | → `cancel_payout` |

Error shape everywhere: `{ error: string }` with the right status. Amounts are always
integer minor units, in and out.

## Helper you must use, not reimplement

`lib/server/auth.ts` exports:
- `requireRole(request, roles: ('admin'|'moderator')[])` → `{ user, role } | null`
- Routes call it first and return 403 `{ error: 'Forbidden' }` on null.
