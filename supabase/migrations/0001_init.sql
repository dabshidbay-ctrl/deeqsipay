-- kindred initial schema: tables, indexes, credit_donation(), RLS.
-- Idempotent: safe to re-run.

-- Extensions -----------------------------------------------------------------
-- gen_random_uuid()
create extension if not exists pgcrypto;

-- profiles -------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Mirror every new auth user into profiles.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- campaigns ------------------------------------------------------------------
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 8 and 120),
  description text not null check (char_length(description) between 20 and 5000),
  category text not null check (category in ('Medical','Emergency','Community','Nonprofit','Education')),
  goal_minor bigint not null check (goal_minor >= 100),
  raised_minor bigint not null default 0 check (raised_minor >= 0),
  donor_count integer not null default 0,
  currency char(3) not null default 'USD',
  status text not null default 'active' check (status in ('draft','active','paused','completed','removed')),
  image_url text,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

-- Matches the GET /api/campaigns ordering exactly.
create index if not exists campaigns_status_created_at_idx
  on public.campaigns (status, created_at desc);

-- donations ------------------------------------------------------------------
create table if not exists public.donations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  donor_id uuid not null references public.profiles(id) on delete cascade,
  amount_minor bigint not null check (amount_minor >= 100),
  status text not null default 'pending' check (status in ('pending','succeeded','failed','expired')),
  provider_reference text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Backs the idempotent-replay lookup in POST /api/donations.
  unique (donor_id, idempotency_key)
);

create index if not exists donations_campaign_status_idx
  on public.donations (campaign_id, status);

-- payment_attempts -----------------------------------------------------------
-- provider defaults to 'sifalo' because POST /api/donations inserts without a
-- provider value while the webhook filters on eq('provider', 'sifalo').
create table if not exists public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null references public.donations(id) on delete cascade,
  provider text not null default 'sifalo',
  provider_reference text not null,
  phone_last4 text,
  status text not null,
  raw_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Guarantees the webhook's .maybeSingle() lookup never sees multiple rows.
  unique (provider, provider_reference)
);

-- webhook_events -------------------------------------------------------------
-- unique (provider, event_id): a replayed event violates this constraint, the
-- insert errors, and the webhook treats that as "already processed".
create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  payload_hash text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_id)
);

-- saved_campaigns ------------------------------------------------------------
create table if not exists public.saved_campaigns (
  user_id uuid references public.profiles(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, campaign_id)
);

-- credit_donation ------------------------------------------------------------
-- Marks a pending donation succeeded and credits its campaign atomically.
-- Called from both POST /api/donations and the Sifalo webhook, so it MUST be
-- idempotent: already-succeeded donations return untouched, and failed or
-- expired donations are never resurrected.
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
begin
  select status, campaign_id, amount_minor
    into v_status, v_campaign_id, v_amount_minor
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
end;
$$;

-- Service role only. Revoke from public too: Postgres grants EXECUTE on
-- functions to PUBLIC by default, which would otherwise leak through.
revoke execute on function public.credit_donation(uuid, text) from public;
revoke execute on function public.credit_donation(uuid, text) from anon;
revoke execute on function public.credit_donation(uuid, text) from authenticated;
grant execute on function public.credit_donation(uuid, text) to service_role;

-- Row level security ---------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.campaigns enable row level security;
alter table public.donations enable row level security;
alter table public.payment_attempts enable row level security;
alter table public.webhook_events enable row level security;
alter table public.saved_campaigns enable row level security;

-- profiles: publicly readable; each user updates only their own row.
drop policy if exists profiles_select_public on public.profiles;
create policy profiles_select_public on public.profiles
  for select to anon, authenticated
  using (true);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- campaigns: anyone reads active campaigns; owners insert/update their own.
drop policy if exists campaigns_select_active on public.campaigns;
create policy campaigns_select_active on public.campaigns
  for select to anon, authenticated
  using (status = 'active');

drop policy if exists campaigns_insert_own on public.campaigns;
create policy campaigns_insert_own on public.campaigns
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists campaigns_update_own on public.campaigns;
create policy campaigns_update_own on public.campaigns
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- donations: donors read their own; campaign owners read donations made to
-- their campaigns. Deliberately NO insert/update/delete policies — all writes
-- go through the service role.
drop policy if exists donations_select_own_or_campaign_owner on public.donations;
create policy donations_select_own_or_campaign_owner on public.donations
  for select to authenticated
  using (
    donor_id = auth.uid()
    or exists (
      select 1 from public.campaigns c
      where c.id = donations.campaign_id
        and c.owner_id = auth.uid()
    )
  );

-- payment_attempts and webhook_events: intentionally NO policies. With RLS
-- enabled and zero permissive policies, anon/authenticated have no access;
-- the service role bypasses RLS entirely. These tables are service-role only.
-- Do not add policies here without a security review.

-- saved_campaigns: full CRUD restricted to the owning user.
drop policy if exists saved_campaigns_all_own on public.saved_campaigns;
create policy saved_campaigns_all_own on public.saved_campaigns
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Column privileges ----------------------------------------------------------
-- RLS gates ROWS, not COLUMNS: campaigns_update_own would otherwise let an
-- owner set raised_minor/donor_count to anything from the browser client.
-- Money-derived columns are writable only by credit_donation (service role).
revoke insert, update on public.campaigns from anon, authenticated;
grant insert (owner_id, title, description, category, goal_minor, currency, image_url, ends_at, status)
  on public.campaigns to authenticated;
grant update (title, description, category, goal_minor, image_url, ends_at, status)
  on public.campaigns to authenticated;

-- campaigns_select_active alone hides an owner's own draft/paused/completed campaigns
-- from them, which breaks the profile dashboard. Policies are OR'd, so this adds
-- owner-visibility without widening public access.
drop policy if exists campaigns_select_own on public.campaigns;
create policy campaigns_select_own on public.campaigns
  for select to authenticated
  using (owner_id = auth.uid());
