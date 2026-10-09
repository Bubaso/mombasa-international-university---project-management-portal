-- 0026 — the anon key is given nothing
--
-- 0003 says, in a comment over its grants: "Nothing is granted to anon: every
-- table in this schema requires a signed-in caller." That sentence was not
-- true. It granted nothing to anon, which is a different thing from anon
-- having nothing, because Supabase ships default privileges of its own:
--
--   alter default privileges in schema public
--     grant all on tables to anon, authenticated, service_role
--
-- So every table the migrations created — all 95 of them, plus 28 views and
-- every function in public — arrived with select, insert, update and delete
-- granted to anon, and the comment claiming otherwise made it unlikely anyone
-- would look.
--
-- What saved it is the layer underneath. Measured on the live project before
-- this migration:
--
--   tables in public with RLS enabled and no policy      0
--   policies whose rule mentions neither an app helper
--     nor auth.uid() — i.e. that a caller with no
--     identity could satisfy                             0
--   security definer functions in public without an
--     authority check as their first statement            0
--
-- app.authority() reads the caller's profile by auth.uid(), which is null for
-- the anon key, so every helper answers false and every policy and function
-- refuses. Nothing was reachable. But "reachable only because every one of
-- 311 policies happens to ask who you are" is not a boundary; it is a streak.
-- One policy written `using (true)` for a deliberately public register —
-- exactly the sort of thing a public prospectus page would want — would have
-- turned the anon key into a key.
--
-- This migration makes the sentence true, and the test block for it asserts
-- the privilege is absent rather than asserting that the policies hold.
--
-- Nothing in the portal signs in as anon. Authentication is GoTrue on the
-- auth schema, and the client reads nothing over PostgREST before a session
-- exists, so there is no behaviour on the other side of this revoke.

-- ---------------------------------------------------------------------------
-- What anon already holds
-- ---------------------------------------------------------------------------

revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;

-- Functions need the second line. Postgres grants EXECUTE on a new function
-- to PUBLIC unless told otherwise, so revoking anon by name leaves it able to
-- call everything here as a member of PUBLIC — and the seven security definer
-- functions in this schema run as the owner, which means a missing authority
-- check inside one of them is a bypass of row level security itself rather
-- than a refusal. Each of the seven does check, as the test block asserts by
-- calling one as nobody; the grant is removed so that the next one added does
-- not have to.
revoke all privileges on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated, service_role;

-- The helpers live here, and the policies call them as the caller. Measured
-- on the live project, anon was never granted usage on this schema, so these
-- functions were unreachable even while 98 of them were executable by it on
-- paper. Both lines are closed anyway: the schema grant is the only thing
-- that was standing between the anon key and app.can_read().
revoke all privileges on all functions in schema app from anon, public;
revoke usage on schema app from anon;

-- ---------------------------------------------------------------------------
-- What anon would otherwise be given next
-- ---------------------------------------------------------------------------
--
-- The revokes above cover what exists today; these cover migration 0027. A
-- role can only alter its own default privileges, and the migrations run as
-- the project owner, so this governs every object they create from here. The
-- entries Supabase's own admin role owns are not ours to change and do not
-- apply to anything the migrations make.

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges in schema public grant execute on functions to authenticated, service_role;
alter default privileges in schema app revoke all on functions from anon;

-- PUBLIC is deliberately absent from the four lines above, because it cannot
-- be done there. A default ACL is MERGED with Postgres's built-in defaults
-- rather than replacing them, and the built-in default for a function is
-- EXECUTE to PUBLIC. Revoking it here removes the entry from pg_default_acl
-- and changes nothing: the next function created still comes out with
-- `=X/postgres` in its ACL. Measured, not assumed —
--
--   alter default privileges in schema public revoke execute on functions from public;
--   create function f2() ...;
--   select proacl from pg_proc where proname = 'f2';
--     {=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--
-- So each migration that creates a function in public or app ends with the
-- three lines below, repeated for what it added. That is a convention, and a
-- convention nobody checks is a comment — which is why the policy tests
-- assert that anon can execute nothing, and a migration that forgets the
-- tail fails them rather than shipping.

-- A table whose grants were written by hand rather than inherited. Listed
-- explicitly because a future reader checking this migration's coverage
-- should not have to wonder whether the loop above reached it.
revoke all privileges on audit_log from anon;
