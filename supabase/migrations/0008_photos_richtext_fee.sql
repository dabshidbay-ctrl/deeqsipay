-- kindred migration 0007: campaign photos gallery, rich-text description, fee display.
--
-- 1. Campaigns get a photos[] array (up to 30 URLs) for a gallery view.
-- 2. Description CHECK is relaxed to 10000 characters (roughly 10k words).
-- 3. fee_percent column (default 6) for transparent fee display.
-- 4. profiles.full_name for the organizer's full legal name.
--
-- Idempotent: safe to re-run.

-- profiles.full_name ---------------------------------------------------------------
-- The legal name shown on the campaign page. Separate from display_name (which is the
-- public-facing handle). An organizer may have their full_name shown on their campaigns.
alter table public.profiles add column if not exists full_name text;
alter table public.profiles
  drop constraint if exists profiles_full_name_check;
alter table public.profiles
  add constraint profiles_full_name_check
  check (full_name is null or char_length(full_name) between 2 and 200);

-- Campaign photos gallery -----------------------------------------------------------
-- Array of public image URLs, up to 30. The first photo (index 0) is the cover/primary.
-- image_url remains as the single canonical cover for backward compatibility.
alter table public.campaigns add column if not exists photos text[] not null default '{}'::text[];

-- Enforce max 30 photos via CHECK constraint.
alter table public.campaigns
  drop constraint if exists campaigns_photos_check;
alter table public.campaigns
  add constraint campaigns_photos_check
  check (array_length(photos, 1) is null or array_length(photos, 1) between 0 and 30);

-- Fee percent (default 6%) ---------------------------------------------------------
-- Display-only: the actual fee is whatever the payment provider charges. This column
-- lets the UI show "You'll receive ~94% after fees" without hardcoding the number.
alter table public.campaigns add column if not exists fee_percent numeric(4,1) not null default 6.0;
alter table public.campaigns
  drop constraint if exists campaigns_fee_percent_check;
alter table public.campaigns
  add constraint campaigns_fee_percent_check
  check (fee_percent >= 0 and fee_percent <= 100);

-- Relax description limit to 10000 chars (roughly 10k words) -----------------------
-- The old limit was 5000. We keep a minimum of 20.
alter table public.campaigns drop constraint if exists campaigns_description_check;
alter table public.campaigns
  add constraint campaigns_description_check
  check (char_length(description) between 20 and 10000);

-- Update column grants to include new fields ---------------------------------------
-- Re-issue grants so the new columns are writable by authenticated users.
revoke insert, update on public.campaigns from anon, authenticated;
grant insert (owner_id, title, description, category, goal_minor, currency, image_url, photos, ends_at, status, contact_phones, fee_percent)
  on public.campaigns to authenticated;
grant update (title, description, category, goal_minor, image_url, photos, ends_at, status, contact_phones, fee_percent)
  on public.campaigns to authenticated;

-- Allow authenticated users to update their own full_name.
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url, full_name) on public.profiles to authenticated;