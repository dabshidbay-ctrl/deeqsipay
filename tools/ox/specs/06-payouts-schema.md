# TASK: Migration 0002 — roles, campaign moderation statuses, payouts, balance functions

Produce ONE file: `supabase/migrations/0002_admin_payouts.sql`

Read the contract in full and implement its schema section exactly. Names, statuses and
function signatures are fixed by it — do not rename anything.

@include tools/ox/specs/CONTRACT.md

The existing schema you are extending:

@include supabase/migrations/0001_init.sql

## What 0002 must do

1. `alter table profiles add column if not exists role text not null default 'user'`
   with a CHECK in ('user','moderator','admin'), plus an index on role.
   **Then revoke the column from clients**: `revoke update on public.profiles from authenticated`
   followed by a column-level `grant update (display_name, avatar_url)`. Role must be
   unreachable from the browser — this is the single most important line in the file.

2. Replace the campaigns status CHECK with the seven-value list from the contract
   (`alter table ... drop constraint if exists ...` then add the new one — find the real
   constraint name, it was created inline so it is `campaigns_status_check`).
   Change the column default to `'under_review'`.
   Add `review_note text` and `reviewed_at timestamptz` and `reviewed_by uuid references profiles(id)`.
   Update the owner column-level UPDATE grant so `status` is still writable by owners
   (the API restricts WHICH statuses; the grant stays).

3. Create the `payouts` table exactly as specified, with:
   - index on `(campaign_id, status)` and on `(status, created_at desc)`
   - a partial unique index preventing more than one `requested` payout per campaign at a
     time: `create unique index if not exists payouts_one_open_request_idx on payouts (campaign_id) where status = 'requested'`

4. Implement all six functions from the contract. Requirements that must not be missed:
   - `campaign_available_minor` clamps at 0 with `greatest(0, ...)`.
   - `request_payout` MUST `select ... from campaigns where id = p_campaign_id for update`
     BEFORE computing the available amount. Without that lock two concurrent requests can
     each see the full balance and both succeed — that is the double-spend this whole
     design exists to prevent. Compute available AFTER taking the lock.
   - `decide_payout` and `mark_payout_paid` and `set_campaign_status` must each verify
     `(select role from profiles where id = p_admin_id) = 'admin'` inside the function and
     `raise exception` otherwise. Do not trust the caller to have checked.
   - Every illegal status transition raises, with a message naming the from/to states.
   - `cancel_payout` only touches a payout whose status is still 'requested' AND whose
     `requested_by = p_owner_id`.

5. RLS:
   - Enable RLS on `payouts`.
   - SELECT policy: the campaign owner sees their own campaign's payouts; a user whose
     `profiles.role` is 'admin' or 'moderator' sees all.
   - NO insert/update/delete policies at all — every write goes through the functions.
   - Add a `campaigns` SELECT policy so admin/moderator can read campaigns in any status.
   - Add a `donations` SELECT policy so admin/moderator can read all donations.
   Write these role checks as a helper: `create or replace function public.is_staff() returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from profiles where id = auth.uid() and role in ('admin','moderator')) $$;` and use `is_staff()` in the policies.

6. Grants: revoke execute on every new function from public/anon/authenticated, grant to
   service_role only. `is_staff()` is the exception — it must be executable by
   `authenticated` because RLS policies evaluate it as the calling user.

Idempotent DDL throughout (`if not exists`, `create or replace`, `drop policy if exists`).
Comment each section with WHY, not what.
