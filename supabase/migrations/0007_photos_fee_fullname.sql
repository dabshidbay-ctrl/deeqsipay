-- kindred migration 0007: campaign photos, fee percent, profile full name.
--
-- Adds support for multiple campaign photos, a configurable platform fee
-- percentage, and a separate full_name field on profiles.
--
-- Idempotent: safe to re-run.

-- Campaign photos array ------------------------------------------------------------
-- Stores public URLs for up to 30 photos per campaign. The first photo in the
-- array is the cover; image_url remains as the single-image fallback.
alter table public.campaigns add column if not exists photos text[] not null default '{}'::text[];

-- Platform fee percent ----------------------------------------------------------------
-- Default 6% platform fee. The net amount an organiser receives is
-- raised_minor - round(raised_minor * fee_percent / 100).
alter table public.campaigns add column if not exists fee_percent integer not null default 6
  check (fee_percent >= 0 and fee_percent <= 100);

-- Increase description limit from 5000 to 10000 -----------------------------------------
alter table public.campaigns drop constraint if exists campaigns_description_check;
alter table public.campaigns
  add constraint campaigns_description_check
  check (char_length(description) between 20 and 10000);

-- Profile full name --------------------------------------------------------------------
-- Separate from display_name. full_name is the legal/organization name shown
-- on the campaign page; display_name remains the casual/screen name.
alter table public.profiles add column if not exists full_name text;

-- Column grants: allow owners to insert/update the new campaign columns ----------------
revoke insert, update on public.campaigns from anon, authenticated;
grant insert (owner_id, title, description, category, goal_minor, currency, image_url, photos, fee_percent, ends_at, status, contact_phones)
  on public.campaigns to authenticated;
grant update (title, description, category, goal_minor, image_url, photos, ends_at, status, contact_phones)
  on public.campaigns to authenticated;

-- Allow authenticated users to update their own full_name --------------------------------
grant update (display_name, avatar_url, full_name) on public.profiles to authenticated;