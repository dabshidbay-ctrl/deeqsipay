-- Campaign verification: organiser identity document, campaign photo, contact numbers.
-- Idempotent: safe to re-run.

-- Columns ----------------------------------------------------------------------------
-- image_url already exists (public campaign photo, an https URL).
--
-- identity_document_path is a STORAGE PATH, never a URL. The document is a passport or
-- NIRA card: publishing it would be an identity-theft kit. It lives in a private bucket
-- and is only ever surfaced to an admin through a short-lived signed URL.
alter table public.campaigns add column if not exists identity_document_path text;
alter table public.campaigns add column if not exists identity_verified_at timestamptz;

-- At least two reachable numbers before a campaign may be submitted, so a reviewer can
-- actually verify a human is behind it.
alter table public.campaigns add column if not exists contact_phones text[] not null default '{}'::text[];

alter table public.campaigns drop constraint if exists campaigns_contact_phones_check;
alter table public.campaigns
  add constraint campaigns_contact_phones_check
  check (
    -- Only enforced once a campaign leaves 'draft': it must carry >= 2 distinct numbers,
    -- each plausibly a phone number, and no more than 5.
    status = 'draft'
    or (
      array_length(contact_phones, 1) between 2 and 5
      and array_length(contact_phones, 1) = (select count(distinct phone) from unnest(contact_phones) as phone)
      and not exists (select 1 from unnest(contact_phones) as phone where phone !~ '^\+?[1-9][0-9]{7,14}$')
    )
  );

-- An organiser must not be able to mark their own identity as verified.
revoke insert, update on public.campaigns from anon, authenticated;
grant insert (owner_id, title, description, category, goal_minor, currency, image_url, ends_at, status, contact_phones)
  on public.campaigns to authenticated;
grant update (title, description, category, goal_minor, image_url, ends_at, status, contact_phones)
  on public.campaigns to authenticated;

-- Storage ----------------------------------------------------------------------------
-- Two buckets with deliberately different visibility.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campaign-images', 'campaign-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

-- PRIVATE. public=false means no anonymous URL can ever read these objects.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('identity-documents', 'identity-documents', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf'];

-- Campaign images: world-readable, but an authenticated user may only write inside a
-- folder named for their own uid, so nobody can overwrite another organiser's photo.
drop policy if exists campaign_images_read on storage.objects;
create policy campaign_images_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'campaign-images');

drop policy if exists campaign_images_write_own on storage.objects;
create policy campaign_images_write_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'campaign-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- Identity documents: NO select policy for anon or authenticated at all — not even for
-- the uploader. Reads happen exclusively through the service role, which signs a
-- short-lived URL for an admin. RLS with no read policy fails closed.
drop policy if exists identity_documents_write_own on storage.objects;
create policy identity_documents_write_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'identity-documents' and (storage.foldername(name))[1] = auth.uid()::text);

-- Deliberately absent: any policy granting SELECT on 'identity-documents'.
-- Adding one would expose organisers' passports. Do not add one.
