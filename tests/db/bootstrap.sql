-- Local-only shim for the primitives Supabase provides.
--
-- The migrations are written against a real Supabase project, which already
-- has an auth schema, an auth.users table, auth.uid() and the anon /
-- authenticated / service_role roles. Plain Postgres has none of that, so this
-- file stands in for them and lets the policy tests run anywhere.
--
-- It is never applied to a real database: Supabase would already own these.

create extension if not exists pgcrypto;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Supabase reads the caller's id out of the request's JWT claims, which are
-- carried in a GUC. Matching that exactly means a test sets the same setting a
-- real request would, rather than a substitute the policies would not see.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(current_setting('request.jwt.claim.role', true), 'authenticated');
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$$;

grant usage on schema auth to authenticated, anon;
grant select on auth.users to authenticated;
