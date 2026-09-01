-- request_payout(): the reservation guard that stops a campaign being withdrawn twice.
--
-- The function locks the campaign row, RE-DERIVES the available figure inside the same
-- transaction, and raises if the amount does not fit. That re-derivation is what makes two
-- concurrent requests for the whole balance impossible to both satisfy. A single pgTAP
-- session cannot run two statements at literally the same instant, so what is asserted
-- here is the observable consequence of the guard: an outstanding request is a
-- RESERVATION, and the balance it holds is gone for every later request until it is
-- rejected or cancelled. If that were ever untrue, concurrency would double-spend.
--
-- Run with: pnpm test:db   (supabase start must be up first)

begin;
create extension if not exists pgtap;
select plan(12);

-- Fixtures ------------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'organiser@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stranger@test.local', '', now(), now(), now());

update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000002';

insert into public.campaigns (id, owner_id, title, description, category, goal_minor, currency, status)
values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000001',
        'A title long enough', 'A description that clears the twenty character minimum.',
        'Medical', 100000, 'USD', 'active');

-- 10,000 minor units actually raised, through the only path that may move the counter.
insert into public.donations (id, campaign_id, donor_id, amount_minor, currency, status, idempotency_key)
values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', null,
        10000, 'USD', 'pending', 'key-first');
select public.credit_donation('00000000-0000-0000-0000-0000000000d1', 'PROV-1');

insert into public.payout_accounts (id, owner_id, wallet, account_number, account_name)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001',
        'zaad', '252615551234', 'Test Organiser');

select is(public.campaign_available_minor('00000000-0000-0000-0000-0000000000c1'), 10000::bigint,
          'the credited donation is available');

-- An UNVERIFIED account may not be paid to ------------------------------------------------
select throws_ok(
  $$ select public.request_payout('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000001', 5000, '00000000-0000-0000-0000-0000000000a1', null) $$,
  'P0001', null, 'an unverified destination account is refused');

select lives_ok(
  $$ select public.verify_payout_account('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000002') $$,
  'an admin can verify the account');

-- Ownership ------------------------------------------------------------------------------
select throws_ok(
  $$ select public.request_payout('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000003', 1000, '00000000-0000-0000-0000-0000000000a1', null) $$,
  'P0001', null, 'a stranger cannot request a payout from someone else''s campaign');

-- Over-spend in a single request ----------------------------------------------------------
select throws_ok(
  $$ select public.request_payout('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000001', 10001, '00000000-0000-0000-0000-0000000000a1', null) $$,
  'P0001', null, 'requesting more than the balance is refused');

-- The reservation ---------------------------------------------------------------------------
select lives_ok(
  $$ select public.request_payout('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000001', 10000, '00000000-0000-0000-0000-0000000000a1', 'first') $$,
  'the owner may request the whole balance once');

select is(public.campaign_available_minor('00000000-0000-0000-0000-0000000000c1'), 0::bigint,
          'the outstanding request has reserved the entire balance');

-- THE test: a second request for the same money must fail, which is what a lost race
-- would look like if the lock and re-derivation were not there.
select throws_ok(
  $$ select public.request_payout('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000001', 10000, '00000000-0000-0000-0000-0000000000a1', 'second') $$,
  'P0001', null, 'a second request for the whole balance is refused');

select throws_ok(
  $$ select public.request_payout('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000001', 100, '00000000-0000-0000-0000-0000000000a1', 'third') $$,
  'P0001', null, 'even a minimal second request is refused while one is outstanding');

select is((select count(*) from public.payouts where campaign_id = '00000000-0000-0000-0000-0000000000c1'),
          1::bigint, 'exactly one payout row exists');

-- Cancelling returns the money to the pool --------------------------------------------------
select lives_ok(
  $$ select public.cancel_payout((select id from public.payouts where campaign_id = '00000000-0000-0000-0000-0000000000c1'), '00000000-0000-0000-0000-000000000001') $$,
  'the owner can cancel their own request');

select is(public.campaign_available_minor('00000000-0000-0000-0000-0000000000c1'), 10000::bigint,
          'cancelling releases the reservation');

select * from finish();
rollback;
