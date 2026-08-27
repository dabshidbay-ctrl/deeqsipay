-- Donating must not require an account.
--
-- Anyone can give; if the donor happens to be signed in we attach the donation to them so
-- it shows in their history. Requiring a login before someone can help is a conversion
-- killer and has no security value — the payment provider is what authorises money, not
-- our session.

-- 1. donor_id becomes optional -----------------------------------------------------------
alter table public.donations alter column donor_id drop not null;

-- Optional contact for guests, so an organiser can thank them and support can trace a
-- disputed payment. Never required, and never shown publicly (the donor list already
-- renders 'Anonymous' unless a display_name exists).
alter table public.donations add column if not exists guest_name text;
alter table public.donations add column if not exists guest_contact text;
alter table public.donations
  drop constraint if exists donations_guest_fields_check;
alter table public.donations
  add constraint donations_guest_fields_check
  check (
    (guest_name is null or char_length(guest_name) between 1 and 120)
    and (guest_contact is null or char_length(guest_contact) between 3 and 120)
  );

-- 2. Idempotency must still work without a donor -----------------------------------------
-- The old unique was (donor_id, idempotency_key). With a NULL donor_id that constraint
-- stops working entirely, because NULL is never equal to NULL in a unique index — so two
-- guest donations with the SAME key would both insert and the replay guard would silently
-- disappear. Make the key globally unique instead: it is a client-generated UUID, so
-- collisions across donors are not a practical concern, and the guard now holds for guests.
alter table public.donations drop constraint if exists donations_donor_id_idempotency_key_key;
drop index if exists donations_donor_id_idempotency_key_key;
create unique index if not exists donations_idempotency_key_idx
  on public.donations (idempotency_key);

-- 3. Visibility ---------------------------------------------------------------------------
-- A guest donation has no owner, so nobody can read it back through RLS. That is correct:
-- the donor sees their result via the return page, which is driven by a server-verified
-- provider reference and not by a session.
drop policy if exists donations_select_own_or_campaign_owner on public.donations;
create policy donations_select_own_or_campaign_owner on public.donations
  for select to authenticated
  using (
    (donor_id is not null and donor_id = auth.uid())
    or exists (
      select 1 from public.campaigns c
      where c.id = donations.campaign_id
        and c.owner_id = auth.uid()
    )
  );

-- 4. credit_donation must tolerate a null donor ------------------------------------------
-- The notification it emits is addressed to the CAMPAIGN OWNER, and the donor name it
-- embeds must still respect is_anonymous. A guest simply has no profile to read, so the
-- name falls back the same way an anonymous gift does.
comment on column public.donations.donor_id is
  'Null for guest donations. Never assume a donor row exists when joining from donations.';
