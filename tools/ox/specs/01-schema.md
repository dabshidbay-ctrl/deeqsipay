# TASK: Supabase schema + RLS + credit_donation function

Produce ONE file: `supabase/migrations/0001_init.sql`

This schema must exactly satisfy the existing API routes below. Read them carefully — the column names are dictated by these queries, not by your preference.

@include app/api/campaigns/route.ts
@include app/api/donations/route.ts
@include app/api/webhooks/sifalo/route.ts

## Hard requirements

**Extensions:** enable `pgcrypto` for `gen_random_uuid()`.

**`profiles`** — mirrors auth.users. Columns: `id uuid primary key references auth.users(id) on delete cascade`, `display_name text not null default ''`, `avatar_url text`, `created_at timestamptz not null default now()`. Add a trigger on `auth.users` insert that creates the profile row.

**`campaigns`** — `id uuid pk default gen_random_uuid()`, `owner_id uuid not null references profiles(id) on delete cascade`, `title text not null`, `description text not null`, `category text not null`, `goal_minor bigint not null`, `raised_minor bigint not null default 0`, `donor_count integer not null default 0`, `currency char(3) not null default 'USD'`, `status text not null default 'active'`, `image_url text`, `ends_at timestamptz`, `created_at timestamptz not null default now()`.
- CHECK constraints mirroring the API validation: title length 8..120, description length 20..5000, `goal_minor >= 100`, `raised_minor >= 0`.
- category CHECK in ('Medical','Emergency','Community','Nonprofit','Education').
- status CHECK in ('draft','active','paused','completed','removed').
- Index on `(status, created_at desc)` — the GET route orders by exactly this.

**`donations`** — `id uuid pk default gen_random_uuid()`, `campaign_id uuid not null references campaigns(id) on delete cascade`, `donor_id uuid not null references profiles(id) on delete cascade`, `amount_minor bigint not null check (amount_minor >= 100)`, `status text not null default 'pending'`, `provider_reference text`, `idempotency_key text not null`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`.
- status CHECK in ('pending','succeeded','failed','expired').
- **UNIQUE (donor_id, idempotency_key)** — this is what makes the API's idempotency replay check correct.
- Index on `(campaign_id, status)`.

**`payment_attempts`** — `id uuid pk default gen_random_uuid()`, `donation_id uuid not null references donations(id) on delete cascade`, **`provider text not null default 'sifalo'`**, `provider_reference text not null`, `phone_last4 text`, `status text not null`, `raw_status text`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`.
- CRITICAL: the donations route inserts WITHOUT a `provider` value, but the webhook route looks rows up with `.eq('provider','sifalo')`. The `default 'sifalo'` above is what makes that lookup succeed. Do not omit it.
- **UNIQUE (provider, provider_reference)** — the webhook does a `.maybeSingle()` on this pair and must never get a multi-row error.

**`webhook_events`** — `id uuid pk default gen_random_uuid()`, `provider text not null`, `event_id text not null`, `payload_hash text not null`, `received_at timestamptz not null default now()`, `processed_at timestamptz`.
- **UNIQUE (provider, event_id)** — this unique violation IS the replay-protection mechanism.

**`saved_campaigns`** — `user_id uuid references profiles(id) on delete cascade`, `campaign_id uuid references campaigns(id) on delete cascade`, `created_at timestamptz not null default now()`, PRIMARY KEY (user_id, campaign_id).

## `credit_donation(p_donation_id uuid, p_provider_reference text)`

`security definer`, `set search_path = public`, returns void. Semantics, in this order, in one transaction:
1. `SELECT ... FOR UPDATE` the donation row.
2. If it does not exist → raise exception.
3. **If its status is already 'succeeded' → RETURN immediately without touching anything.** This function is called from both the donation route and the webhook and MUST be idempotent — double-crediting a campaign is the worst possible bug here.
4. If status is not 'pending' → RETURN (do not resurrect failed/expired donations).
5. Otherwise: set status='succeeded', provider_reference=p_provider_reference, updated_at=now(); and `UPDATE campaigns SET raised_minor = raised_minor + <that donation's amount_minor>, donor_count = donor_count + 1 WHERE id = <campaign_id>`.

## RLS

Enable RLS on every table. Policies:
- `campaigns`: SELECT allowed to anon+authenticated **only where status='active'**; INSERT/UPDATE only where `owner_id = auth.uid()`.
- `donations`: SELECT only where `donor_id = auth.uid()` OR the caller owns the campaign. No client INSERT/UPDATE at all (writes go through the service role).
- `payment_attempts`, `webhook_events`: no policies whatsoever — service-role only. Add a SQL comment saying so explicitly.
- `profiles`: SELECT public; UPDATE only own row.
- `saved_campaigns`: full CRUD only where `user_id = auth.uid()`.

Also grant `execute` on `credit_donation` to `service_role` only; revoke from `anon` and `authenticated`.

Write idempotent DDL (`create table if not exists`, `create or replace function`, `drop policy if exists` before each `create policy`). Comment each section briefly.
