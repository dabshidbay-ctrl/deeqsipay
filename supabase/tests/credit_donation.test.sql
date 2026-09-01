-- credit_donation() idempotency.
--
-- This function is the ONLY thing permitted to move campaigns.raised_minor, and it is
-- reachable from more than one place, so it must be safe to call twice for the same
-- donation. A second call that credited again would inflate a public total with money
-- that was never given — the single worst failure this schema can have.
--
-- Run with: pnpm test:db   (supabase start must be up first)

begin;
create extension if not exists pgtap;
select plan(14);

-- Fixtures ------------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'organiser@test.local', '', now(), now(), now());

insert into public.campaigns (id, owner_id, title, description, category, goal_minor, currency, status)
values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000001',
        'A title long enough', 'A description that clears the twenty character minimum.',
        'Medical', 100000, 'USD', 'active');

insert into public.donations (id, campaign_id, donor_id, amount_minor, currency, status, idempotency_key)
values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', null,
        2500, 'USD', 'pending', 'key-first');

-- Baseline ------------------------------------------------------------------------------
select is((select raised_minor from public.campaigns where id = '00000000-0000-0000-0000-0000000000c1'),
          0::bigint, 'campaign starts at zero raised');
select is((select donor_count from public.campaigns where id = '00000000-0000-0000-0000-0000000000c1'),
          0, 'campaign starts at zero donors');

-- First credit --------------------------------------------------------------------------
select lives_ok($$ select public.credit_donation('00000000-0000-0000-0000-0000000000d1', 'PROV-1') $$,
                'first credit succeeds');

select is((select status from public.donations where id = '00000000-0000-0000-0000-0000000000d1'),
          'succeeded', 'donation is marked succeeded');
select is((select provider_reference from public.donations where id = '00000000-0000-0000-0000-0000000000d1'),
          'PROV-1', 'provider reference is recorded');
select is((select raised_minor from public.campaigns where id = '00000000-0000-0000-0000-0000000000c1'),
          2500::bigint, 'raised_minor moved by exactly the donation amount');
select is((select donor_count from public.campaigns where id = '00000000-0000-0000-0000-0000000000c1'),
          1, 'donor_count moved by one');
select is((select count(*) from public.ledger_entries where donation_id = '00000000-0000-0000-0000-0000000000d1'),
          1::bigint, 'exactly one ledger entry was written');

-- Replay: the whole point ---------------------------------------------------------------
select lives_ok($$ select public.credit_donation('00000000-0000-0000-0000-0000000000d1', 'PROV-1') $$,
                'a replay does not raise');
select lives_ok($$ select public.credit_donation('00000000-0000-0000-0000-0000000000d1', 'PROV-DIFFERENT') $$,
                'a replay under a different provider reference does not raise either');

select is((select raised_minor from public.campaigns where id = '00000000-0000-0000-0000-0000000000c1'),
          2500::bigint, 'raised_minor is UNCHANGED after two replays');
select is((select donor_count from public.campaigns where id = '00000000-0000-0000-0000-0000000000c1'),
          1, 'donor_count is UNCHANGED after two replays');
select is((select count(*) from public.ledger_entries where donation_id = '00000000-0000-0000-0000-0000000000d1'),
          1::bigint, 'still exactly one ledger entry after two replays');

-- A donation that never succeeded must not be creditable by a late call -----------------
insert into public.donations (id, campaign_id, donor_id, amount_minor, currency, status, idempotency_key)
values ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c1', null,
        9900, 'USD', 'failed', 'key-second');

select public.credit_donation('00000000-0000-0000-0000-0000000000d2', 'PROV-2');
select is((select raised_minor from public.campaigns where id = '00000000-0000-0000-0000-0000000000c1'),
          2500::bigint, 'crediting a failed donation is a no-op');

select * from finish();
rollback;
