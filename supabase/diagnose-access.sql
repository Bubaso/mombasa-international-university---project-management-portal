-- Why a verified sign-in still gets no access.
--
-- Paste the whole file into the Supabase SQL editor, with the address changed
-- in the one place marked below. It runs as the project owner, so parts 1-3
-- see everything; part 4 then puts on the caller's own role and JWT and asks
-- the questions the browser asks, which is the only part that proves
-- anything. Nothing is written: the last statement rolls back.
--
-- Read the four parts in order and stop at the first that looks wrong.

\set address 'burhanbasoglu4@gmail.com'

-- ---------------------------------------------------------------------------
-- 1. Is the account there, and is the profile keyed to it?
-- ---------------------------------------------------------------------------
--
-- A profile is keyed on auth.users.id. The email in `profiles` is a label:
-- two rows can agree on the address and still not be the same person to the
-- database. `profile_id` null means no row carries this account's id.

select
  u.id                as auth_user_id,
  u.email             as auth_email,
  u.email_confirmed_at is not null as email_confirmed,
  p.id                as profile_id,
  p.role,
  p.clearance,
  p.is_active,
  p.expires_at,
  p.expires_at is not null and p.expires_at <= now() as expired
from auth.users u
full outer join public.profiles p on p.id = u.id
where u.email = :'address' or p.email = :'address';

-- ---------------------------------------------------------------------------
-- 2. Did every migration actually land?
-- ---------------------------------------------------------------------------
--
-- The commonest way a healthy-looking project refuses everybody is a
-- migration that stopped part-way. Every policy in this schema calls a
-- function in the `app` schema, so if the grants at the end of 0003 did not
-- run, every policy raises "permission denied for schema app" and the portal
-- sees an error rather than an empty result.

select
  has_schema_privilege('authenticated', 'app', 'usage')            as app_schema_usable,
  has_function_privilege('authenticated', 'app.current_clearance()', 'execute')
                                                                    as can_call_clearance,
  has_table_privilege('authenticated', 'public.profiles', 'select') as can_select_profiles,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'profiles')         as profile_policies,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and policyname = 'profiles_read_self')                        as has_0014;

-- Every policy on profiles, so a missing or mangled one is visible.
select policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'profiles'
order by policyname;

-- Which migrations are in. If this is short, that is the answer.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'profiles', 'record_grants', 'emergency_delegations', 'stakeholders',
    'meetings', 'obligations', 'legal_cases', 'document_versions',
    'site_tasks', 'task_progress'
  )
order by table_name;

-- ---------------------------------------------------------------------------
-- 3. Does the caller's own profile resolve?
-- ---------------------------------------------------------------------------
--
-- app.current_profile() is SECURITY DEFINER, so it should see the row
-- regardless of policy. If this is empty while part 1 showed a healthy row,
-- the function is the problem, not the data.

select (app.current_profile()).id is not null as resolves_as_owner;

-- ---------------------------------------------------------------------------
-- 4. What a real request sees
-- ---------------------------------------------------------------------------
--
-- This is the part that decides. It takes the caller's seat exactly as
-- PostgREST does — the `authenticated` role, with a JWT whose `sub` is the
-- account from part 1 — and asks what the portal asks.
--
-- Expected: seen_as matches auth_user_id, clearance is not null, own_row is 1.
--
--   clearance null, own_row 1  → 0014 is in and the row is inactive or past
--                                its date; part 1 says which.
--   own_row 0                  → no row that this caller may read carries
--                                this id.
--   an error instead of rows   → read it. It is the answer, and it is the
--                                thing the portal used to swallow.

begin;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select u.id from auth.users u where u.email = :'address'),
    'role', 'authenticated'
  )::text,
  true
);

set local role authenticated;

select
  auth.uid()                                                as seen_as,
  app.current_clearance()                                   as clearance,
  (select count(*) from public.profiles where id = auth.uid()) as own_row,
  (select count(*) from public.profiles)                    as directory_rows;

rollback;

-- ---------------------------------------------------------------------------
-- If all four parts are healthy
-- ---------------------------------------------------------------------------
--
-- Then the database is not refusing anybody and the deployed build is talking
-- to a different project. The sign-in screen prints the id it looked up:
-- compare it with auth_user_id from part 1. A different id means a different
-- project, and the fix is the VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
-- the bundle was built with — they are baked in at build time, so changing
-- them means building and deploying again, not editing anything live.
