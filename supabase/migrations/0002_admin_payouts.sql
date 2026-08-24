-- kindred migration 0002: roles, campaign moderation lifecycle, payouts.
--
-- Core invariant: a campaign balance is DERIVED, never stored. There is no
-- balance column anywhere; readers call campaign_available_minor(), which
-- subtracts requested/approved/paid payouts (the reservation set) from
-- succeeded donations. Reserving at request time is what makes a double
-- payout impossible rather than merely unlikely.
--
-- Idempotent: safe to re-run.

-- profiles.role ----------------------------------------------------------------
-- Role gates every admin/moderator capability downstream. RLS gates ROWS, not
-- COLUMNS: without the column-level revoke below, the existing
-- profiles_update_own policy would let any user set role='admin' on their own
-- row straight from the browser. This revoke/grant pair is the point of the
-- whole section.
alter table public.profiles add column if not exists role text not null default 'user';

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('user','moderator','admin'));

create index if not exists profiles_role_idx on public.profiles (role);

revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

-- campaigns moderation lifecycle -------------------------------------------------
-- Seven-state lifecycle replaces the old five-state one. New campaigns land in
-- 'under_review' so nothing is publicly visible before a decision; only
-- 'active' is public. Legacy 'draft' rows have no equivalent in the new
-- lifecycle and become 'under_review' rather than failing the tightened CHECK.
alter table public.campaigns drop constraint if exists campaigns_status_check;

update public.campaigns set status = 'under_review' where status = 'draft';

alter table public.campaigns
  add constraint campaigns_status_check
  check (status in ('under_review','active','paused','hidden','completed','rejected','removed'));

alter table public.campaigns alter column status set default 'under_review';

-- Moderation metadata. Deliberately absent from the owner column grant below:
-- review decisions are service-role facts, not owner-editable fields.
alter table public.campaigns add column if not exists review_note text;
alter table public.campaigns add column if not exists reviewed_at timestamptz;
alter table public.campaigns add column if not exists reviewed_by uuid references public.profiles(id);

-- Restated so 'status' stays owner-writable: the API layer restricts WHICH
-- statuses an owner may set (active <-> paused only); the grant must not narrow.
grant update (title, description, category, goal_minor, image_url, ends_at, status)
  on public.campaigns to authenticated;

-- payouts -------------------------------------------------------------------------
-- Money out. A payout in status requested/approved/paid RESERVES funds: it is
-- subtracted by campaign_available_minor immediately, so one balance can never
-- fund two payouts. rejected/cancelled fall out of the reserved set and release
-- the reservation. No balance column here either, for the same reason.
create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  amount_minor bigint not null check (amount_minor >= 100),
  currency char(3) not null default 'USD',
  status text not null default 'requested'
    check (status in ('requested','approved','rejected','paid','cancelled')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  decision_note text,
  provider_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payouts_campaign_status_idx
  on public.payouts (campaign_id, status);

-- Admin payout list filters by status, newest first.
create index if not exists payouts_status_created_at_idx
  on public.payouts (status, created_at desc);

-- At most one open request per campaign: the reservation model assumes a
-- single outstanding request, and the owner flow links to it.
create unique index if not exists payouts_one_open_request_idx
  on public.payouts (campaign_id) where status = 'requested';

-- is_staff --------------------------------------------------------------------------
-- Shared predicate for staff-visible RLS policies. Security definer so the
-- profiles lookup neither recurses through profiles' own RLS nor depends on the
-- caller having any profiles visibility. Executable by authenticated because
-- policies evaluate as the calling user; grants tightened further below.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid()
       and role in ('admin','moderator')
  )
$$;

-- Balance ---------------------------------------------------------------------------
-- Derived, clamped at zero: reservations can momentarily exceed succeeded
-- donations only through data bugs, and a negative "available" would invite
-- creative accounting downstream.
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
      select sum(d.amount_minor)::bigint
        from public.donations d
       where d.campaign_id = p_campaign_id
         and d.status = 'succeeded'
    ), 0::bigint)
    -
    coalesce((
      select sum(p.amount_minor)::bigint
        from public.payouts p
       where p.campaign_id = p_campaign_id
         and p.status in ('requested','approved','paid')
    ), 0::bigint)
  );
$$;

-- request_payout ----------------------------------------------------------------------
-- Locks the campaign row FOR UPDATE *before* deriving the balance: two
-- concurrent requests must serialise on that row, or each sees the full
-- balance and both succeed — the exact double-spend this design exists to
-- prevent. Ownership, minimum amount and affordability are all checked here,
-- never trusted from the caller.
create or replace function public.request_payout(p_campaign_id uuid, p_owner_id uuid, p_amount_minor bigint)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_currency char(3);
  v_available bigint;
  v_payout_id uuid;
begin
  select owner_id, currency
    into v_owner_id, v_currency
    from public.campaigns
   where id = p_campaign_id
   for update;

  if not found then
    raise exception 'campaign % not found', p_campaign_id;
  end if;

  if v_owner_id is distinct from p_owner_id then
    raise exception 'profile % does not own campaign %', p_owner_id, p_campaign_id;
  end if;

  if p_amount_minor < 100 then
    raise exception 'payout amount % is below the 100 minor-unit minimum', p_amount_minor;
  end if;

  -- Computed only AFTER the lock: it must reflect any reservation committed
  -- by a request that was holding this row a moment ago.
  v_available := public.campaign_available_minor(p_campaign_id);

  if p_amount_minor > v_available then
    raise exception 'requested % exceeds available %', p_amount_minor, v_available;
  end if;

  insert into public.payouts (campaign_id, requested_by, amount_minor, currency, status)
  values (p_campaign_id, p_owner_id, p_amount_minor, v_currency, 'requested')
  returning id into v_payout_id;

  return v_payout_id;
end;
$$;

-- decide_payout ------------------------------------------------------------------------
-- Approve/refuse a payout. The actor's admin role is re-checked inside the
-- function: a leaked or forged route call must not be able to move money.
-- Legal decides: requested -> approved|rejected, and approved -> rejected
-- (an approved-but-unpaid payout can still be refused). Anything else,
-- including any move out of a terminal state, raises.
create or replace function public.decide_payout(p_payout_id uuid, p_admin_id uuid, p_decision text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if (select role from public.profiles where id = p_admin_id) is distinct from 'admin' then
    raise exception 'profile % is not an admin', p_admin_id;
  end if;

  if p_decision not in ('approved','rejected') then
    raise exception 'invalid decision %, expected approved or rejected', p_decision;
  end if;

  select status
    into v_status
    from public.payouts
   where id = p_payout_id
   for update;

  if not found then
    raise exception 'payout % not found', p_payout_id;
  end if;

  if not (
    (v_status = 'requested' and p_decision in ('approved','rejected'))
    or (v_status = 'approved' and p_decision = 'rejected')
  ) then
    raise exception 'illegal payout transition % -> %', v_status, p_decision;
  end if;

  update public.payouts
     set status = p_decision,
         reviewed_by = p_admin_id,
         reviewed_at = now(),
         decision_note = p_note,
         updated_at = now()
   where id = p_payout_id;
end;
$$;

-- mark_payout_paid -----------------------------------------------------------------------
-- Settles an approved payout with the provider reference. approved -> paid is
-- the only legal move; terminal states stay terminal.
create or replace function public.mark_payout_paid(p_payout_id uuid, p_admin_id uuid, p_reference text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if (select role from public.profiles where id = p_admin_id) is distinct from 'admin' then
    raise exception 'profile % is not an admin', p_admin_id;
  end if;

  select status
    into v_status
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
end;
$$;

-- cancel_payout ----------------------------------------------------------------------------
-- Owner-side escape hatch for a request that has not been decided yet. Only
-- the requester may cancel, and only while the payout is still 'requested':
-- once approved, the money is committed to review and only an admin can
-- refuse it.
create or replace function public.cancel_payout(p_payout_id uuid, p_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_requested_by uuid;
begin
  select status, requested_by
    into v_status, v_requested_by
    from public.payouts
   where id = p_payout_id
   for update;

  if not found then
    raise exception 'payout % not found', p_payout_id;
  end if;

  if v_requested_by is distinct from p_owner_id then
    raise exception 'payout % was not requested by %', p_payout_id, p_owner_id;
  end if;

  if v_status <> 'requested' then
    raise exception 'illegal payout transition % -> cancelled', v_status;
  end if;

  update public.payouts
     set status = 'cancelled',
         updated_at = now()
   where id = p_payout_id;
end;
$$;

-- set_campaign_status -----------------------------------------------------------------------
-- Admin-only moderation moves. Owners never come through here: the owner path
-- is the ordinary column-granted UPDATE restricted by the API to
-- active <-> paused. Target status is validated against the full lifecycle.
create or replace function public.set_campaign_status(p_campaign_id uuid, p_admin_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select role from public.profiles where id = p_admin_id) is distinct from 'admin' then
    raise exception 'profile % is not an admin', p_admin_id;
  end if;

  if p_status not in ('under_review','active','paused','hidden','completed','rejected','removed') then
    raise exception 'invalid campaign status %', p_status;
  end if;

  update public.campaigns
     set status = p_status
   where id = p_campaign_id;

  if not found then
    raise exception 'campaign % not found', p_campaign_id;
  end if;
end;
$$;

-- Function grants -----------------------------------------------------------------------------
-- Postgres grants EXECUTE to PUBLIC by default; without these revokes every
-- browser session could rpc request_payout against someone else's campaign or
-- approve its own payout. Service role only — these are called from server
-- routes — except is_staff, which RLS evaluates as the calling user.
revoke execute on function public.campaign_available_minor(uuid) from public, anon, authenticated;
grant execute on function public.campaign_available_minor(uuid) to service_role;

revoke execute on function public.request_payout(uuid, uuid, bigint) from public, anon, authenticated;
grant execute on function public.request_payout(uuid, uuid, bigint) to service_role;

revoke execute on function public.decide_payout(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.decide_payout(uuid, uuid, text, text) to service_role;

revoke execute on function public.mark_payout_paid(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.mark_payout_paid(uuid, uuid, text) to service_role;

revoke execute on function public.cancel_payout(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancel_payout(uuid, uuid) to service_role;

revoke execute on function public.set_campaign_status(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.set_campaign_status(uuid, uuid, text) to service_role;

revoke execute on function public.is_staff() from public, anon, authenticated;
grant execute on function public.is_staff() to authenticated;

-- Row level security ----------------------------------------------------------------------------
alter table public.payouts enable row level security;

-- Owners see payouts on their own campaigns; staff see everything. There are
-- deliberately NO insert/update/delete policies: a policy can gate rows but
-- cannot enforce role checks, ownership proofs or legal transitions — every
-- write goes through the SECURITY DEFINER functions above, and with RLS on
-- and no write policies, direct client writes fail closed.
drop policy if exists payouts_select_owner_or_staff on public.payouts;
create policy payouts_select_owner_or_staff on public.payouts
  for select to authenticated
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = payouts.campaign_id
        and c.owner_id = auth.uid()
    )
    or public.is_staff()
  );

-- Admin/moderator screens read campaigns and donations in any state. These OR
-- into the existing 0001 policies; public/owner visibility is unchanged.
drop policy if exists campaigns_select_staff on public.campaigns;
create policy campaigns_select_staff on public.campaigns
  for select to authenticated
  using (public.is_staff());

drop policy if exists donations_select_staff on public.donations;
create policy donations_select_staff on public.donations
  for select to authenticated
  using (public.is_staff());
