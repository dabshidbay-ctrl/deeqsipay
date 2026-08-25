-- kindred migration 0004: append-only ledger and refunds.
--
-- Core invariant: campaigns.raised_minor is a mutable counter that only ever
-- increased. There was no way to reverse a donation and no independent record
-- to audit the counter against. ledger_entries is the new source of truth for
-- money movement: SIGNED entries (positive credits the campaign, negative
-- debits it) appended by the same functions that move the counters. Balances
-- derive from the ledger; paid payouts live in the ledger as negative entries,
-- so only requested/approved payouts remain outstanding reservations.
--
-- Idempotent: safe to re-run.

-- ledger_entries -----------------------------------------------------------------
-- Append-only money log. RLS deliberately has NO insert/update/delete policies
-- (direct client writes fail closed), and a trigger rejects UPDATE/DELETE
-- outright: RLS alone cannot resist the service role, which bypasses it, and
-- this table must resist our own code too.
create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  donation_id uuid references public.donations(id) on delete set null,
  payout_id uuid references public.payouts(id) on delete set null,
  kind text not null check (kind in ('donation','refund','payout','adjustment')),
  -- SIGNED: positive credits the campaign, negative debits it. Sign is a
  -- property of the kind; enforced here so a stray row cannot flip it.
  amount_minor bigint not null,
  currency char(3) not null default 'USD',
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint ledger_entries_kind_sign_check check (
    (kind = 'donation' and amount_minor > 0)
    -- Adjustments are the correction escape hatch and must work in BOTH directions;
    -- restricting them to credits would leave no way to undo an over-credit.
    or (kind = 'adjustment' and amount_minor <> 0)
    or (kind = 'refund' and amount_minor < 0)
    or (kind = 'payout' and amount_minor < 0)
  )
);

-- Per-campaign history, newest first.
create index if not exists ledger_entries_campaign_created_at_idx
  on public.ledger_entries (campaign_id, created_at desc);

-- One donation can only ever be credited once and refunded once. This index is
-- what makes credit_donation's on-conflict idempotency and the backfill real.
create unique index if not exists ledger_entries_donation_kind_idx
  on public.ledger_entries (donation_id, kind) where donation_id is not null;

-- Immutability ---------------------------------------------------------------------
-- Raises on any UPDATE or DELETE, for every role including service_role.
create or replace function public.ledger_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'ledger_entries is append-only';
end;
$$;

drop trigger if exists ledger_entries_immutable on public.ledger_entries;
create trigger ledger_entries_immutable
  before update or delete on public.ledger_entries
  for each row execute function public.ledger_immutable();

-- Row-level triggers do not fire for TRUNCATE, which would empty the ledger without
-- tripping the guard above. A statement-level trigger is the only thing that catches it.
drop trigger if exists ledger_entries_no_truncate on public.ledger_entries;
create trigger ledger_entries_no_truncate
  before truncate on public.ledger_entries
  for each statement execute function public.ledger_immutable();

alter table public.ledger_entries enable row level security;

-- Read visibility mirrors payouts: campaign owners see their campaigns'
-- entries, staff see everything. NO insert/update/delete policies: with RLS on
-- and none defined, client writes fail closed; every write goes through the
-- service-role functions below.
drop policy if exists ledger_entries_select_owner_or_staff on public.ledger_entries;
create policy ledger_entries_select_owner_or_staff on public.ledger_entries
  for select to authenticated
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = ledger_entries.campaign_id
        and c.owner_id = auth.uid()
    )
    or public.is_staff()
  );

-- donations.status += 'refunded' ------------------------------------------------------
-- The 0001 CHECK was an unnamed inline constraint, so Postgres named it
-- donations_status_check. Drop-and-readd: create-table-if-not-exists would
-- never widen it on a re-run.
alter table public.donations drop constraint if exists donations_status_check;
alter table public.donations
  add constraint donations_status_check
  check (status in ('pending','succeeded','failed','expired','refunded'));

-- refund_donation ----------------------------------------------------------------------
-- Admin-only reversal of a succeeded donation. Order matters: the donation row
-- is locked FOR UPDATE before its status is trusted; only 'succeeded' is
-- refundable (never resurrect-or-double-refund pending/refunded rows); the
-- ledger entry lands in the same transaction as the counter moves, so the
-- ledger can never drift from the counters.
create or replace function public.refund_donation(p_donation_id uuid, p_admin_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_campaign_id uuid;
  v_amount_minor bigint;
  v_currency char(3);
begin
  if (select role from public.profiles where id = p_admin_id) is distinct from 'admin' then
    raise exception 'profile % is not an admin', p_admin_id;
  end if;

  select status, campaign_id, amount_minor, currency
    into v_status, v_campaign_id, v_amount_minor, v_currency
    from public.donations
   where id = p_donation_id
   for update;

  if not found then
    raise exception 'donation % not found', p_donation_id;
  end if;

  if v_status <> 'succeeded' then
    raise exception 'illegal donation transition % -> refunded', v_status;
  end if;

  update public.donations
     set status = 'refunded',
         updated_at = now()
   where id = p_donation_id;

  insert into public.ledger_entries
    (campaign_id, donation_id, kind, amount_minor, currency, note, created_by)
  values
    (v_campaign_id, p_donation_id, 'refund', -v_amount_minor, v_currency, p_note, p_admin_id);

  update public.campaigns
     set raised_minor = raised_minor - v_amount_minor,
         donor_count = greatest(0, donor_count - 1)
   where id = v_campaign_id;
end;
$$;

-- Balances --------------------------------------------------------------------------------
-- Derived from the LEDGER now, not from re-summing donations. paid payouts are
-- ALREADY negative ledger entries; counting them again from the payouts table
-- would double-debit. Only requested/approved payouts are reservations that
-- have not yet been written to the ledger.
--
-- campaign_available_minor stays CLAMPED at zero: request_payout spends against
-- it, and a negative "available" would invite creative accounting downstream.
create or replace function public.campaign_available_minor(p_campaign_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    0::bigint,
    coalesce((
      select sum(le.amount_minor)::bigint
        from public.ledger_entries le
       where le.campaign_id = p_campaign_id
    ), 0::bigint)
    -
    coalesce((
      select sum(p.amount_minor)::bigint
        from public.payouts p
       where p.campaign_id = p_campaign_id
         and p.status in ('requested','approved')
    ), 0::bigint)
  );
$$;

-- UNCLAMPED twin: refunding a donation whose money has already been paid out
-- legitimately drives a campaign negative, and an admin must be able to SEE
-- that. Audit/reporting reads this; request_payout keeps the clamped one.
create or replace function public.campaign_balance_minor(p_campaign_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((
      select sum(le.amount_minor)::bigint
        from public.ledger_entries le
       where le.campaign_id = p_campaign_id
    ), 0::bigint)
    -
    coalesce((
      select sum(p.amount_minor)::bigint
        from public.payouts p
       where p.campaign_id = p_campaign_id
         and p.status in ('requested','approved')
    ), 0::bigint);
$$;

-- credit_donation ----------------------------------------------------------------------------
-- Same contract as 0001 (idempotent, pending-only), plus a positive ledger
-- entry written in the same transaction as the counter move. on conflict do
-- nothing: the unique (donation_id, kind) index turns a replayed credit into a
-- no-op instead of a unique-violation crash.
create or replace function public.credit_donation(p_donation_id uuid, p_provider_reference text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_campaign_id uuid;
  v_amount_minor bigint;
  v_currency char(3);
begin
  select status, campaign_id, amount_minor, currency
    into v_status, v_campaign_id, v_amount_minor, v_currency
    from public.donations
   where id = p_donation_id
   for update;

  if not found then
    raise exception 'donation % not found', p_donation_id;
  end if;

  -- Already credited: replay, do nothing.
  if v_status = 'succeeded' then
    return;
  end if;

  -- Only pending donations may be credited.
  if v_status <> 'pending' then
    return;
  end if;

  update public.donations
     set status = 'succeeded',
         provider_reference = p_provider_reference,
         updated_at = now()
   where id = p_donation_id;

  update public.campaigns
     set raised_minor = raised_minor + v_amount_minor,
         donor_count = donor_count + 1
   where id = v_campaign_id;

  -- Ledger entry for the credit. created_by stays NULL: there is no acting
  -- principal here, the payment pipeline is speaking.
  insert into public.ledger_entries
    (campaign_id, donation_id, kind, amount_minor, currency)
  values
    (v_campaign_id, p_donation_id, 'donation', v_amount_minor, v_currency)
  on conflict do nothing;
end;
$$;

-- mark_payout_paid -----------------------------------------------------------------------------
-- Same contract as 0002 (approved -> paid is the only legal move), plus the
-- negative ledger entry that converts the payout from "reservation" into spent
-- money. The state machine already makes this fire at most once per payout: a
-- replay finds status 'paid', fails the transition check, and raises before
-- the insert.
create or replace function public.mark_payout_paid(p_payout_id uuid, p_admin_id uuid, p_reference text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_campaign_id uuid;
  v_amount_minor bigint;
  v_currency char(3);
begin
  if (select role from public.profiles where id = p_admin_id) is distinct from 'admin' then
    raise exception 'profile % is not an admin', p_admin_id;
  end if;

  select status, campaign_id, amount_minor, currency
    into v_status, v_campaign_id, v_amount_minor, v_currency
    from public.payouts
   where id = p_payout_id
   for update;

  if not found then
    raise exception 'payout % not found', p_payout_id;
  end if;

  if v_status <> 'approved' then
    raise exception 'illegal payout transition % -> paid', v_status;
  end if;

  update public.payouts
     set status = 'paid',
         provider_reference = p_reference,
         reviewed_by = p_admin_id,
         reviewed_at = now(),
         updated_at = now()
   where id = p_payout_id;

  insert into public.ledger_entries
    (campaign_id, payout_id, kind, amount_minor, currency, created_by)
  values
    (v_campaign_id, p_payout_id, 'payout', -v_amount_minor, v_currency, p_admin_id);
end;
$$;

-- Backfill ---------------------------------------------------------------------------------------
-- Rows that predate the ledger: every already-succeeded donation and
-- already-paid payout must appear as an entry, or every derived balance
-- silently forgets that money ever moved.
--
-- Donations: the unique (donation_id, kind) index makes a re-run a no-op.
insert into public.ledger_entries (campaign_id, donation_id, kind, amount_minor, currency)
select d.campaign_id, d.id, 'donation', d.amount_minor, d.currency
  from public.donations d
 where d.status = 'succeeded'
on conflict do nothing;

-- Payouts: no unique index covers payout_id, so guard with NOT EXISTS to stay
-- re-run safe.
insert into public.ledger_entries (campaign_id, payout_id, kind, amount_minor, currency)
select p.campaign_id, p.id, 'payout', -p.amount_minor, p.currency
  from public.payouts p
 where p.status = 'paid'
   and not exists (
         select 1
           from public.ledger_entries le
          where le.payout_id = p.id
            and le.kind = 'payout'
       );

-- Function grants ----------------------------------------------------------------------------------
-- Postgres grants EXECUTE to PUBLIC by default; without these revokes every
-- browser session could rpc refund_donation or read unclamped balances.
-- Service role only — all of these are called from server routes. Restated for
-- credit_donation / mark_payout_paid / campaign_available_minor so this file
-- is self-contained after replacing their bodies.
revoke execute on function public.ledger_immutable() from public, anon, authenticated;
grant execute on function public.ledger_immutable() to service_role;

revoke execute on function public.refund_donation(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.refund_donation(uuid, uuid, text) to service_role;

revoke execute on function public.campaign_available_minor(uuid) from public, anon, authenticated;
grant execute on function public.campaign_available_minor(uuid) to service_role;

revoke execute on function public.campaign_balance_minor(uuid) from public, anon, authenticated;
grant execute on function public.campaign_balance_minor(uuid) to service_role;

revoke execute on function public.credit_donation(uuid, text) from public;
revoke execute on function public.credit_donation(uuid, text) from anon;
revoke execute on function public.credit_donation(uuid, text) from authenticated;
grant execute on function public.credit_donation(uuid, text) to service_role;

revoke execute on function public.mark_payout_paid(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.mark_payout_paid(uuid, uuid, text) to service_role;

