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

-- ---------------------------------------------------------------------------
-- A stand-in for Supabase Storage
-- ---------------------------------------------------------------------------
--
-- Only enough of the storage schema for the migrations to apply and for their
-- policies to be created and reasoned about. It stores nothing and behaves
-- like nothing: uploads, signed URLs and the object lifecycle are Supabase's,
-- and none of that is exercised here.
--
-- The columns are the ones Supabase's storage.objects actually has, so a
-- policy that compiles against this compiles against the real thing. What it
-- cannot tell us is whether the policy does the right thing at runtime — that
-- has to be checked against a real project.

create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  owner_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(),
  metadata jsonb
);

grant usage on schema storage to authenticated, anon, service_role;
