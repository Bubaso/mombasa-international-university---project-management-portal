-- Identity, roles and the confidentiality model.
--
-- Until now the portal had no authentication at all: a client-side switchRole()
-- call made anyone a trustee, and the Supabase anon key reached every table
-- with no row level security behind it. This migration lays the ground for
-- access to be decided in the database, which is the only place a browser
-- cannot argue with.
--
-- Requirements: M1-01, M1-04, M1-05, M1-06, M1-07.

create schema if not exists app;
comment on schema app is
  'Internal helpers for access control. Not exposed through the API.';

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------

-- Two groups, and the split matters: external roles can never be granted the
-- restricted tier, whatever else is configured for them (see app.max_clearance).
create type app_role as enum (
  -- internal
  'admin',
  'project_director',
  'field_team',
  'trustee',
  'board_director',
  'audit_committee',
  -- external
  'legal_counsel',
  'contractor',
  'quantity_surveyor',
  'external_auditor',
  'donor',
  'observer',
  'consultant'
);

create or replace function app.is_internal_role(r app_role)
returns boolean
language sql
immutable
as $$
  select r in (
    'admin', 'project_director', 'field_team',
    'trustee', 'board_director', 'audit_committee'
  );
$$;

-- ---------------------------------------------------------------------------
-- Confidentiality
-- ---------------------------------------------------------------------------

create type confidentiality as enum (
  'public',        -- anyone signed in, including donors and observers
  'internal',      -- the default: core team plus the relevant external party
  'confidential',  -- core team, or an explicit per-record grant
  'restricted'     -- named individuals only; never external, never indexed
);

create or replace function app.clearance_rank(c confidentiality)
returns int
language sql
immutable
as $$
  select case c
    when 'public' then 0
    when 'internal' then 1
    when 'confidential' then 2
    when 'restricted' then 3
  end;
$$;

-- The ceiling a role may be given. A misconfigured profile therefore cannot
-- hand an external party restricted material: the cap is applied on read, not
-- only when the profile is written.
create or replace function app.max_clearance(r app_role)
returns confidentiality
language sql
immutable
as $$
  select case
    when r in ('admin', 'project_director', 'trustee', 'board_director')
      then 'restricted'::confidentiality
    when r in ('field_team', 'audit_committee')
      then 'confidential'::confidentiality
    when r in ('donor', 'observer')
      then 'public'::confidentiality
    else 'internal'::confidentiality
  end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role app_role not null,
  organization text,
  -- The clearance actually granted to this person, capped by their role.
  clearance confidentiality not null default 'internal',
  is_active boolean not null default true,
  -- Consultants and observers are time-boxed (M1-09); null means open-ended.
  expires_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),

  constraint profiles_clearance_within_role
    check (app.clearance_rank(clearance) <= app.clearance_rank(app.max_clearance(role)))
);

comment on column profiles.clearance is
  'Highest tier this person may read. Capped by their role; see app.max_clearance.';

create index profiles_role_idx on profiles (role);

-- ---------------------------------------------------------------------------
-- Caller helpers
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER so policies can read the caller's own profile without
-- recursing through the policies on profiles itself.
create or replace function app.current_profile()
returns profiles
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.* from profiles p
  where p.id = auth.uid()
    and p.is_active
    and (p.expires_at is null or p.expires_at > now());
$$;

create or replace function app.current_role_name()
returns app_role
language sql
stable
as $$
  select (app.current_profile()).role;
$$;

-- The effective ceiling: the lower of what the person was granted and what
-- their role is ever allowed to see.
create or replace function app.current_clearance()
returns confidentiality
language sql
stable
as $$
  select case
    when p.id is null then null
    when app.clearance_rank(p.clearance) <= app.clearance_rank(app.max_clearance(p.role))
      then p.clearance
    else app.max_clearance(p.role)
  end
  from app.current_profile() p;
$$;

create or replace function app.is_internal()
returns boolean
language sql
stable
as $$
  select coalesce(app.is_internal_role(app.current_role_name()), false);
$$;

create or replace function app.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(app.current_role_name() = 'admin', false);
$$;

-- ---------------------------------------------------------------------------
-- Per-record sharing (M1-05)
-- ---------------------------------------------------------------------------

create type grant_permission as enum ('read', 'write');

create table record_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  permission grant_permission not null default 'read',
  granted_by uuid not null references profiles (id),
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  reason text,

  unique (user_id, entity_type, entity_id, permission)
);

create index record_grants_lookup_idx on record_grants (user_id, entity_type, entity_id);

create or replace function app.has_grant(
  p_entity_type text,
  p_entity_id uuid,
  p_permission grant_permission default 'read'
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from record_grants g
    where g.user_id = auth.uid()
      and g.entity_type = p_entity_type
      and g.entity_id = p_entity_id
      and (g.permission = p_permission or g.permission = 'write')
      and (g.expires_at is null or g.expires_at > now())
  );
$$;

-- ---------------------------------------------------------------------------
-- Scope for external parties (M1-06)
-- ---------------------------------------------------------------------------

-- A legal counsel sees the cases assigned to them and nothing else; a
-- contractor sees their own blocks. Rows outside that scope are not filtered
-- in the UI — they never leave the database.
create table case_assignments (
  user_id uuid not null references profiles (id) on delete cascade,
  legal_case_id uuid not null,
  assigned_by uuid not null references profiles (id),
  assigned_at timestamptz not null default now(),
  primary key (user_id, legal_case_id)
);

create table block_assignments (
  user_id uuid not null references profiles (id) on delete cascade,
  construction_block_id uuid not null,
  assigned_by uuid not null references profiles (id),
  assigned_at timestamptz not null default now(),
  primary key (user_id, construction_block_id)
);

create or replace function app.is_assigned_case(p_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from case_assignments a
    where a.user_id = auth.uid() and a.legal_case_id = p_case_id
  );
$$;

create or replace function app.is_assigned_block(p_block_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from block_assignments a
    where a.user_id = auth.uid() and a.construction_block_id = p_block_id
  );
$$;

-- ---------------------------------------------------------------------------
-- Audit log (M1-07)
-- ---------------------------------------------------------------------------

create table audit_log (
  id bigserial primary key,
  actor_id uuid references profiles (id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);

create index audit_log_entity_idx on audit_log (entity_type, entity_id, at desc);
create index audit_log_actor_idx on audit_log (actor_id, at desc);

comment on table audit_log is
  'Append-only. Updates and deletes are refused by trigger, including for the '
  'table owner, so a compromised account cannot erase its own trail.';

create or replace function app.refuse_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log is append-only (attempted %)', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_log_no_update
  before update on audit_log
  for each row execute function app.refuse_audit_mutation();

create trigger audit_log_no_delete
  before delete on audit_log
  for each row execute function app.refuse_audit_mutation();

create or replace function app.record_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entity_id uuid;
begin
  v_entity_id := case tg_op when 'DELETE' then (to_jsonb(old) ->> 'id')::uuid
                            else (to_jsonb(new) ->> 'id')::uuid end;

  insert into audit_log (actor_id, action, entity_type, entity_id, before, after)
  values (
    auth.uid(),
    tg_op,
    tg_table_name,
    v_entity_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );

  return case tg_op when 'DELETE' then old else new end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Shared columns on domain tables
-- ---------------------------------------------------------------------------

create or replace function app.touch_row()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    new.created_at := coalesce(new.created_at, now());
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch
  before insert or update on profiles
  for each row execute function app.touch_row();

create trigger profiles_audit
  after insert or update or delete on profiles
  for each row execute function app.record_audit();
