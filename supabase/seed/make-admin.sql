-- Grant admin (or moderator) to an existing account.
--
-- Run this in the Supabase SQL editor, which executes as postgres. It CANNOT be done
-- from the app: migration 0002 revokes UPDATE on profiles from `authenticated` and grants
-- back only (display_name, avatar_url), so nobody can promote themselves through the API
-- even if every route check were bypassed. That is the point.
--
-- STEP 1: sign up in the app first, at /login -> "Create an account".
--         A profiles row is created automatically by the on_auth_user_created trigger.
-- STEP 2: put your email below and run.
-- STEP 3: reload /admin. The role is read server-side on every request, so no re-login
--         is needed — a refresh is enough.

-- ⬇ change this
\set target_email 'you@example.com'

-- Safety net: create the profile row if the trigger never fired for this user
-- (e.g. the account predates migration 0001).
insert into public.profiles (id)
select u.id from auth.users u
where u.email = :'target_email'
on conflict (id) do nothing;

update public.profiles p
   set role = 'admin'          -- or 'moderator' for read-only staff access
  from auth.users u
 where u.id = p.id
   and u.email = :'target_email';

-- Confirm it took. Expect exactly one row showing your email and 'admin'.
select u.email, p.role
  from public.profiles p
  join auth.users u on u.id = p.id
 where u.email = :'target_email';
