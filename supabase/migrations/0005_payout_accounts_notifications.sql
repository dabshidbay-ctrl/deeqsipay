-- kindred migration 0005: payout destinations, receipts, audit trail, notifications.
--
-- Core invariant: a payout's destination is SNAPSHOTTED at request time and is
-- immutable from then on. Payouts are executed by hand in the Sifalo/bank
-- portal, so destination_* IS the payment instruction the paying admin acts on.
-- Were it editable, an attacker could win approval toward one account number
-- and swap in another before the transfer executes. The BEFORE UPDATE trigger
-- below binds every role INCLUDING service_role — RLS cannot constrain our own
-- backend. Every transition also appends to payout_events, an append-only trail
-- that answers who did what, when, without trusting the mutable payouts row.
--
-- Idempotent: safe to re-run.

-- payout_accounts -----------------------------------------------------------------
-- Where money GOES. Owners register destination accounts; only an admin can
-- flip is_verified, and only through verify_payout_account below — an owner
-- must never be able to bless their own account. Verification is therefore
-- enforced twice, like profiles.role in 0002: the role check lives INSIDE the
-- function, and the table's write grants are stripped from clients entirely.
create table if not exists public.payout_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  wallet text not null check (wallet in ('zaad','edahab','pbwallet','bank')),
  account_number text not null,
  account_name text not null,
  bank_name text,
  is_verified boolean not null default false,
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint payout_accounts_wallet_check
    check (wallet in ('zaad','edahab','pbwallet','bank')),
  constraint payout_accounts_account_number_check
    check (account_number ~ '^[A-Za-z0-9+-]{6,34}$'),
  constraint payout_accounts_account_name_check
    check (char_length(account_name) between 2 and 120)
);

-- One ACTIVE registration per (owner, wallet, number); archiving frees the
-- tuple so the same account can be re-registered later without losing history.
create unique index if not exists payout_accounts_one_active_idx
  on public.payout_accounts (owner_id, wallet, account_number)
  where archived_at is null;

-- Owner's account-picker listing.
create index if not exists payout_accounts_owner_active_idx
  on public.payout_accounts (owner_id)
  where archived_at is null;

-- No write policies and no write grants: with RLS on, client writes fail
-- closed, and every write goes through the service-role function below.
revoke insert on public.payout_accounts from anon, authenticated;
revoke update on public.payout_accounts from anon, authenticated;
revoke delete on public.payout_accounts from anon, authenticated;

drop policy if exists payout_accounts_select_owner_or_staff on public.payout_accounts;
create policy payout_accounts_select_owner_or_staff on public.payout_accounts
  for select to authenticated
  using (
    owner_id = auth.uid()
    or public.is_staff()
  );

-- verify_payout_account ---------------------------------------------------------------------
-- The ONLY path to is_verified = true. The admin role is re-checked inside the
-- function: a leaked or forged route call must not be able to bless a
-- destination. Deliberately no unverify — a mistaken verification is corrected
-- by archiving the account, which request_payout refuses to pay to.
create or replace function public.verify_payout_account(p_account_id uuid, p_admin_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select role from public.profiles where id = p_admin_id) is distinct from 'admin' then
    raise exception 'profile % is not an admin', p_admin_id;
  end if;

  update public.payout_accounts
     set is_verified = true,
         verified_by = p_admin_id,
         verified_at = now()
   where id = p_account_id;

  if not found then
    raise exception 'payout account % not found', p_account_id;
  end if;
end;
$$;

-- payouts: destination snapshot + settlement facts -------------------------------------------
-- destination_* are a COPY of the account taken at request time, not a live
-- join: the instruction an admin executes must survive the account being
-- edited, archived or deleted afterwards. paid_at/paid_by are DISTINCT from
-- reviewed_at/reviewed_by — approval time and payment time are different
-- facts, and conflating them destroys the audit trail.
alter table public.payouts add column if not exists payout_account_id uuid references public.payout_accounts(id) on delete set null;
alter table public.payouts add column if not exists destination_wallet text;
alter table public.payouts add column if not exists destination_account_number text;
alter table public.payouts add column if not exists destination_account_name text;
alter table public.payouts add column if not exists request_note text;
alter table public.payouts add column if not exists paid_at timestamptz;
alter table public.payouts add column if not exists paid_by uuid references public.profiles(id) on delete set null;
alter table public.payouts add column if not exists receipt_path text;

-- Destination immutability --------------------------------------------------------------------
-- Populate-once, never move, for all four destination facts (account reference
-- plus the wallet/number/name snapshot). A NULL may be filled in — legacy rows
-- predate the snapshot — but a value that is PRESENT may never change: not by
-- owners, not by admins, not by the service role. A row-level BEFORE UPDATE
-- trigger is the only mechanism that reaches every role, because the service
-- role bypasses RLS entirely.
create or replace function public.payouts_destination_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.payout_account_id is not null
     and new.payout_account_id is distinct from old.payout_account_id then
    raise exception 'payout % payout_account_id is immutable', old.id;
  end if;

  if old.destination_wallet is not null
     and new.destination_wallet is distinct from old.destination_wallet then
    raise exception 'payout % destination_wallet is immutable', old.id;
  end if;

  if old.destination_account_number is not null
     and new.destination_account_number is distinct from old.destination_account_number then
    raise exception 'payout % destination_account_number is immutable', old.id;
  end if;

  if old.destination_account_name is not null
     and new.destination_account_name is distinct from old.destination_account_name then
    raise exception 'payout % destination_account_name is immutable', old.id;
  end if;

  return new;
end;
$$;

drop trigger if exists payouts_destination_immutable on public.payouts;
create trigger payouts_destination_immutable
  before update on public.payouts
  for each row execute function public.payouts_destination_immutable();

-- payout_events ----------------------------------------------------------------------------------
-- Append-only audit trail. Immutable exactly like ledger_entries: RLS on with
-- NO write policies (direct client writes fail closed), a row trigger rejects
-- UPDATE/DELETE for every role including service_role, and a statement trigger
-- catches TRUNCATE, which row-level triggers never fire for.
create table if not exists public.payout_events (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references public.payouts(id) on delete cascade,
  event text not null check (event in ('requested','approved','rejected','paid','cancelled')),
  actor_id uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists payout_events_payout_created_at_idx
  on public.payout_events (payout_id, created_at);

create or replace function public.payout_events_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'payout_events is append-only';
end;
$$;

drop trigger if exists payout_events_immutable on public.payout_events;
create trigger payout_events_immutable
  before update or delete on public.payout_events
  for each row execute function public.payout_events_immutable();

drop trigger if exists payout_events_no_truncate on public.payout_events;
create trigger payout_events_no_truncate
  before truncate on public.payout_events
  for each statement execute function public.payout_events_immutable();

alter table public.payout_events enable row level security;

drop policy if exists payout_events_select_owner_or_staff on public.payout_events;
create policy payout_events_select_owner_or_staff on public.payout_events
  for select to authenticated
  using (
    exists (
      select 1
        from public.payouts p
        join public.campaigns c on c.id = p.campaign_id
       where p.id = payout_events.payout_id
         and c.owner_id = auth.uid()
    )
    or public.is_staff()
  );

-- Payout functions ---------------------------------------------------------------------------------
-- Same contracts and guards as 0002/0004 (role checks INSIDE the function, FOR
-- UPDATE before trusting state, legal transitions only, ownership proven not
-- trusted), extended with the destination snapshot at request time and one
-- payout_events row per transition. Signatures that changed drop the OLD
-- signature explicitly — dropping also removes its ACLs, so no revoke is
-- needed first and the new signature resolves unambiguously on re-runs.
drop function if exists public.request_payout(uuid, uuid, bigint);

create or replace function public.request_payout(p_campaign_id uuid, p_owner_id uuid, p_amount_minor bigint, p_account_id uuid, p_note text)
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
  v_account_owner uuid;
  v_account_verified boolean;
  v_account_archived_at timestamptz;
  v_wallet text;
  v_account_number text;
  v_account_name text;
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

  -- Derived only AFTER the lock, exactly as in 0002: concurrent requests must
  -- serialise on the campaign row or both see the full balance.
  v_available := public.campaign_available_minor(p_campaign_id);

  if p_amount_minor > v_available then
    raise exception 'requested % exceeds available %', p_amount_minor, v_available;
  end if;

  -- The destination is PROVEN here, never trusted from the caller: it must be
  -- the owner's own account, admin-verified, and not archived. An unverified
  -- account must never be able to receive money.
  select owner_id, is_verified, archived_at, wallet, account_number, account_name
    into v_account_owner, v_account_verified, v_account_archived_at, v_wallet, v_account_number, v_account_name
    from public.payout_accounts
   where id = p_account_id;

  if not found then
    raise exception 'payout account % not found', p_account_id;
  end if;

  if v_account_owner is distinct from p_owner_id then
    raise exception 'payout account % does not belong to profile %', p_account_id, p_owner_id;
  end if;

  if not v_account_verified then
    raise exception 'payout account % is not verified', p_account_id;
  end if;

  if v_account_archived_at is not null then
    raise exception 'payout account % is archived', p_account_id;
  end if;

  -- The snapshot lands with the INSERT, so the immutability trigger never has
  -- to permit a post-hoc destination write on a real row.
  insert into public.payouts
    (campaign_id, requested_by, amount_minor, currency, status,
     payout_account_id, destination_wallet, destination_account_number, destination_account_name, request_note)
  values
    (p_campaign_id, p_owner_id, p_amount_minor, v_currency, 'requested',
     p_account_id, v_wallet, v_account_number, v_account_name, p_note)
  returning id into v_payout_id;

  insert into public.payout_events (payout_id, event, actor_id, note)
  values (v_payout_id, 'requested', p_owner_id, p_note);

  return v_payout_id;
end;
$$;

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

  insert into public.payout_events (payout_id, event, actor_id, note)
  values (p_payout_id, p_decision, p_admin_id, p_note);
end;
$$;

drop function if exists public.mark_payout_paid(uuid, uuid, text);

create or replace function public.mark_payout_paid(p_payout_id uuid, p_admin_id uuid, p_reference text, p_receipt_path text)
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

  -- paid_at/paid_by record the SETTLEMENT, reviewed_at/reviewed_by the
  -- APPROVAL; they happen at different moments by different hands and must
  -- never overwrite one another.
  update public.payouts
     set status = 'paid',
         provider_reference = p_reference,
         paid_at = now(),
         paid_by = p_admin_id,
         receipt_path = p_receipt_path,
         reviewed_by = p_admin_id,
         reviewed_at = now(),
         updated_at = now()
   where id = p_payout_id;

  -- Reservation becomes spent money in the ledger, same transaction.
  insert into public.ledger_entries
    (campaign_id, payout_id, kind, amount_minor, currency, created_by)
  values
    (v_campaign_id, p_payout_id, 'payout', -v_amount_minor, v_currency, p_admin_id);

  insert into public.payout_events (payout_id, event, actor_id, note)
  values (p_payout_id, 'paid', p_admin_id, p_reference);
end;
$$;

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

  insert into public.payout_events (payout_id, event, actor_id)
  values (p_payout_id, 'cancelled', p_owner_id);
end;
$$;

-- notifications --------------------------------------------------------------------------------------
-- In-app inbox. Rows are created ONLY by service-role functions (no insert/
-- delete policies: with RLS on, client writes fail closed). A user reads their
-- own rows and may set read_at and NOTHING else — the column grant below is
-- what stops a user rewriting titles/bodies or re-pointing a row at another
-- user_id; the RLS policy alone would happily permit both.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('donation_received','campaign_approved','campaign_rejected','payout_approved','payout_rejected','payout_paid')),
  title text not null,
  body text not null,
  link text,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Unread badge query: newest unread first; read rows drop out of the index.
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- credit_donation -------------------------------------------------------------------------------------
-- Same contract as 0004 (idempotent, pending-only, ledger entry in-transaction),
-- plus an owner notification emitted only on the path that actually credits.
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
  v_donor_id uuid;
  v_is_anonymous boolean;
  v_owner_id uuid;
  v_donor_name text;
  v_amount_text text;
begin
  select status, campaign_id, amount_minor, currency, donor_id, is_anonymous
    into v_status, v_campaign_id, v_amount_minor, v_currency, v_donor_id, v_is_anonymous
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

  insert into public.ledger_entries
    (campaign_id, donation_id, kind, amount_minor, currency)
  values
    (v_campaign_id, p_donation_id, 'donation', v_amount_minor, v_currency)
  on conflict do nothing;

  -- Owner notification. Anonymity is decided AT WRITE TIME: a notification row
  -- is durable and readable long after the donate form's promise is forgotten,
  -- so for an anonymous gift the donor's real name is never placed in the row
  -- at all — masking on read would not undo having stored it. A self-donation
  -- notifies no one.
  select owner_id
    into v_owner_id
    from public.campaigns
   where id = v_campaign_id;

  if v_owner_id is distinct from v_donor_id then
    -- Minor units rendered for prose only; integer math throughout.
    v_amount_text :=
      (v_amount_minor / 100)::text || '.' || lpad((v_amount_minor % 100)::text, 2, '0');

    if v_is_anonymous then
      v_donor_name := 'An anonymous donor';
    else
      v_donor_name := coalesce((
        select nullif(btrim(coalesce(display_name, '')), '')
          from public.profiles
         where id = v_donor_id
      ), 'Someone');
    end if;

    insert into public.notifications
      (user_id, kind, title, body, link, campaign_id)
    values
      (v_owner_id, 'donation_received',
       'Donation received',
       v_donor_name || ' gave ' || v_currency || ' ' || v_amount_text || ' to your campaign.',
       '/campaigns/' || v_campaign_id::text,
       v_campaign_id);
  end if;
end;
$$;

-- payout-receipts bucket -------------------------------------------------------------------------------
-- PRIVATE: receipts carry banking details. Owners upload into their uid-named
-- folder; there is deliberately NO select policy — reads happen only through
-- service-role signed URLs, so no browser session can browse anyone's receipts.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payout-receipts',
  'payout-receipts',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists receipts_insert_own_folder on storage.objects;
create policy receipts_insert_own_folder on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payout-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Function grants ----------------------------------------------------------------------------------------
-- Postgres grants EXECUTE to PUBLIC by default; without these revokes every
-- browser session could rpc request_payout against someone else's campaign,
-- approve its own payout, or verify its own account. Service role only — all
-- of these are called from server routes. Restated for replaced bodies so this
-- file is self-contained.
revoke execute on function public.verify_payout_account(uuid, uuid) from public, anon, authenticated;
grant execute on function public.verify_payout_account(uuid, uuid) to service_role;

revoke execute on function public.request_payout(uuid, uuid, bigint, uuid, text) from public, anon, authenticated;
grant execute on function public.request_payout(uuid, uuid, bigint, uuid, text) to service_role;

revoke execute on function public.decide_payout(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.decide_payout(uuid, uuid, text, text) to service_role;

revoke execute on function public.mark_payout_paid(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.mark_payout_paid(uuid, uuid, text, text) to service_role;

revoke execute on function public.cancel_payout(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancel_payout(uuid, uuid) to service_role;

revoke execute on function public.credit_donation(uuid, text) from public, anon, authenticated;
grant execute on function public.credit_donation(uuid, text) to service_role;

revoke execute on function public.payouts_destination_immutable() from public, anon, authenticated;
grant execute on function public.payouts_destination_immutable() to service_role;

revoke execute on function public.payout_events_immutable() from public, anon, authenticated;
grant execute on function public.payout_events_immutable() to service_role;
