-- Making the access rules affordable.
--
-- This migration changes no rule. Every policy, every grant and every
-- confidentiality decision in 0001–0017 stays exactly as it was; the 278
-- assertions in the policy suite are the proof of that and all of them still
-- pass. What changes is what the rules cost to ask.
--
-- The problem surfaced while building the search of M13, which is the first
-- query in the portal that reads nineteen registers at once. Measured on a
-- throwaway Postgres with 3,000 meeting notes — a small fraction of the
-- archive this portal exists to hold:
--
--     select count(*) from meeting_notes            as the owner:     1.7 ms
--     select count(*) from meeting_notes            as a trustee:   4328 ms
--
-- Two and a half thousand times slower, and none of it was the text search:
-- the same scan with the text matching precomputed still took 4177 ms, while
-- the matching itself accounted for 2 ms of that. All of it was the policy.
--
-- Where it went. A policy like
--
--     using (app.can_see_case(confidentiality, id))
--
-- unfolds into roughly ten nested helper calls per row, and two of them --
-- app.current_clearance() and app.effective_roles() -- each call
-- app.delegated_profiles(), a SETOF SECURITY DEFINER function with a join and
-- a correlated aggregate. Measured per call:
--
--     app.current_profile()        0.0074 ms      one indexed lookup
--     app.has_grant(...)           0.0048 ms      one indexed lookup
--     app.current_clearance()      0.152  ms      ← calls delegated_profiles()
--     app.effective_roles()        0.158  ms      ← calls delegated_profiles()
--     app.can_see_case(...)        0.36   ms      the whole chain, per row
--
-- The leaf lookups are nearly free. The cost is that the caller's authority —
-- which cannot change while a statement runs — was being rebuilt from the
-- tables five to eight times for every row examined.
--
-- The fix, in two parts.
--
-- 1. app.authority() answers the whole question once: who the caller is, the
--    widest clearance they hold or are lent, every role they act under, and
--    whether any of those is internal. One SECURITY DEFINER query with a
--    lateral join instead of a set-returning function called repeatedly.
--
-- 2. The predicates that policies call — app.can_read and the can_see_*
--    family — become plpgsql and fetch that answer into a local variable
--    once, then decide. SQL functions could not: a SQL body containing a
--    sub-select is not inlinable, and one that is inlinable has its arguments
--    substituted at every reference, so the authority call would simply be
--    duplicated back to five or eight.
--
-- Result, same measurement, same machine:
--
--     app.can_see_case(...)        0.056 ms per row, from 0.36  — 10× less
--
-- What was deliberately NOT done. The obvious further step is to cache the
-- authority in a transaction-local GUC, which would make it nearly free. It
-- is not here, because a cache in the access control layer has to be wrong
-- for a window, and the window is a whole request: an administrator who
-- revokes their own access and then reads would still be reading with it. A
-- further threefold gain is not worth a staleness bug in the one layer that
-- is not allowed to have one.
--
-- The other route — hoisting the authority into an InitPlan by wrapping it in
-- (select ...) at the policy site — does work, and would make it once per
-- *statement* rather than once per row. It needs all 241 policies rewritten
-- to pass the authority in as an argument. If the archive grows enough to
-- need it, that is the next move, and it is mechanical.
--
-- Requirements: none directly. This is what M13-05 needed to be usable, and
-- every list in the portal gets it.

-- ---------------------------------------------------------------------------
-- The caller's authority, once
-- ---------------------------------------------------------------------------

create type app.authority_t as (
  -- The caller's own profile, or null when they have none that is active and
  -- unexpired. Null here is the signal the whole model rests on: no profile,
  -- no authority, and a delegation cannot supply one.
  profile_id uuid,
  -- Their own role, for display and for the audit trail — not the answer to
  -- "may they do this".
  own_role app_role,
  -- The widest clearance held or lent. No ceiling is applied here, because
  -- profiles_clearance_within_role already keeps each profile's clearance
  -- inside what its role may ever hold, so every value in the union is capped
  -- at source.
  clearance confidentiality,
  -- Own role plus every role lent through a live delegation. Sorted, so two
  -- callers with the same authority get the same array.
  roles app_role[],
  -- Whether any of those roles is an internal one. Computed here rather than
  -- re-derived per row, and it is the test that gates the restricted tier.
  internal boolean
);

comment on type app.authority_t is
  'Everything the policies need to know about the caller, in one row. '
  'Immutable for the duration of a statement, which is why it is worth '
  'fetching once instead of rebuilding it per row.';

-- One query. The delegation side is a lateral so that a caller with no
-- delegations — which is almost everybody, almost always — pays for an empty
-- index scan rather than a set-returning function call.
--
-- Returns no row, and therefore a null composite, when the caller has no
-- active profile. Every field read off it is then null, which is exactly what
-- app.current_clearance() and app.effective_roles() promised before.
create or replace function app.authority()
returns app.authority_t
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select row(
    a.id,
    a.own_role,
    a.clearance,
    a.roles,
    exists (select 1 from unnest(a.roles) r where app.is_internal_role(r))
  )::app.authority_t
  from (
    select
      o.id,
      o.role as own_role,
      -- The lent clearance wins only if it is actually wider. clearance_rank
      -- of null is null, so a caller with no delegations falls through to
      -- their own.
      case
        when app.clearance_rank(l.top) > app.clearance_rank(o.clearance)
          then l.top
        else o.clearance
      end as clearance,
      array(
        select distinct r
        from unnest(array[o.role] || coalesce(l.roles, '{}'::app_role[])) r
        order by r
      ) as roles
    from profiles o
    left join lateral (
      select
        (array_agg(p.clearance order by app.clearance_rank(p.clearance) desc))[1] as top,
        array_agg(p.role) as roles
      from emergency_delegations d
      join profiles p on p.id = d.from_user
      where d.to_user = o.id
        and d.revoked_at is null
        and d.expires_at > now()
        -- Authority its owner no longer holds cannot be lent.
        and p.is_active
        and (p.expires_at is null or p.expires_at > now())
        -- Two trustees, or it is a request rather than a delegation (M1-14).
        and (
          select count(*) from emergency_delegation_approvals k
          where k.delegation_id = d.id
        ) >= 2
    ) l on true
    where o.id = auth.uid()
      and o.is_active
      and (o.expires_at is null or o.expires_at > now())
  ) a;
$$;

comment on function app.authority() is
  'The caller''s effective authority in one SECURITY DEFINER query. Definer '
  'so that reading it does not recurse through the policies on profiles. '
  'Null composite when there is no active profile — a delegation adds to '
  'somebody''s access and is never a way in on its own.';

-- ---------------------------------------------------------------------------
-- The leaf helpers, now reading one answer
-- ---------------------------------------------------------------------------
--
-- Same names, same signatures, same results. Each is a single field read, so
-- each costs one authority call instead of rebuilding it from the tables.

create or replace function app.current_clearance()
returns confidentiality
language sql
stable
as $$
  select (app.authority()).clearance;
$$;

create or replace function app.current_role_name()
returns app_role
language sql
stable
as $$
  select (app.authority()).own_role;
$$;

create or replace function app.effective_roles()
returns app_role[]
language sql
stable
as $$
  select (app.authority()).roles;
$$;

create or replace function app.acts_as(variadic p_roles app_role[])
returns boolean
language sql
stable
as $$
  select coalesce((app.authority()).roles && p_roles, false);
$$;

create or replace function app.is_internal()
returns boolean
language sql
stable
as $$
  select coalesce((app.authority()).internal, false);
$$;

create or replace function app.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce((app.authority()).roles && array['admin']::app_role[], false);
$$;

-- ---------------------------------------------------------------------------
-- The predicates policies call, fetching once
-- ---------------------------------------------------------------------------
--
-- These are plpgsql for one reason: a local variable. The rule each one
-- expresses is unchanged — compare them line by line against 0003, 0005,
-- 0006, 0007, 0009, 0010, 0012, 0013, 0015 and 0016 — but the authority it is
-- decided against is read once at the top instead of five or eight times
-- through the body.
--
-- The per-record lookups (app.has_grant, app.is_assigned_case,
-- app.is_assigned_block, app.is_meeting_attendee, app.caller_is) stay as they
-- are. They depend on the row, so they cannot be hoisted, and they measured
-- at five microseconds each — and for an internal caller the short circuits
-- above them mean they are usually never reached at all.

-- The three rules of reading, in order: you must have a profile; the
-- restricted tier is internal-only whatever else is configured; and your
-- clearance must cover the record, or somebody must have shared that exact
-- record with you.
create or replace function app.can_read(
  p_confidentiality confidentiality,
  p_entity_type text default null,
  p_entity_id uuid default null
)
returns boolean
language plpgsql
stable
as $$
declare
  a app.authority_t := app.authority();
begin
  return a.clearance is not null
    and (
      p_confidentiality <> 'restricted'
      or coalesce(a.internal, false)
    )
    and (
      app.clearance_rank(p_confidentiality) <= app.clearance_rank(a.clearance)
      or (
        p_entity_type is not null
        and p_confidentiality <> 'restricted'
        and app.has_grant(p_entity_type, p_entity_id, 'read')
      )
    );
end;
$$;

create or replace function app.can_write(
  p_entity_type text default null,
  p_entity_id uuid default null
)
returns boolean
language plpgsql
stable
as $$
declare
  a app.authority_t := app.authority();
begin
  return a.clearance is not null
    and (
      a.roles && array['admin', 'project_director', 'field_team', 'board_director']::app_role[]
      or (p_entity_type is not null and app.has_grant(p_entity_type, p_entity_id, 'write'))
    );
end;
$$;

-- Per-table visibility. Scope narrows the internal tier and above; the public
-- tier means published, so anyone with an active profile may read it.
create or replace function app.can_see_case(p_conf confidentiality, p_id uuid)
returns boolean
language plpgsql
stable
as $$
declare
  a app.authority_t := app.authority();
begin
  return app.can_read(p_conf, 'legal_cases', p_id)
    and (
      p_conf = 'public'
      or coalesce(a.internal, false)
      -- A grant is the deliberate way to hand one record to one person, so it
      -- has to clear scope as well as clearance. It still cannot reach
      -- restricted: can_read refuses that to external roles entirely.
      or (a.roles && array['legal_counsel']::app_role[] and app.is_assigned_case(p_id))
      or app.has_grant('legal_cases', p_id, 'read')
    );
end;
$$;

create or replace function app.can_see_block(p_conf confidentiality, p_id uuid)
returns boolean
language plpgsql
stable
as $$
declare
  a app.authority_t := app.authority();
begin
  return app.can_read(p_conf, 'construction_blocks', p_id)
    and (
      p_conf = 'public'
      or coalesce(a.internal, false)
      or (a.roles && array['contractor', 'quantity_surveyor']::app_role[]
          and app.is_assigned_block(p_id))
      or app.has_grant('construction_blocks', p_id, 'read')
    );
end;
$$;

create or replace function app.can_see_transaction(p_conf confidentiality, p_id uuid)
returns boolean
language plpgsql
stable
as $$
declare
  a app.authority_t := app.authority();
begin
  return app.can_read(p_conf, 'financial_transactions', p_id)
    and (
      p_conf = 'public'
      or app.has_grant('financial_transactions', p_id, 'read')
      or a.roles && array[
           'admin', 'project_director', 'trustee', 'board_director',
           'audit_committee', 'external_auditor', 'donor'
         ]::app_role[]
    );
end;
$$;

create or replace function app.can_see_stakeholder(p_conf confidentiality, p_id uuid)
returns boolean
language plpgsql
stable
as $$
declare
  a app.authority_t := app.authority();
begin
  return app.can_read(p_conf, 'stakeholders', p_id)
    and (
      p_conf = 'public'
      or coalesce(a.internal, false)
      or app.has_grant('stakeholders', p_id, 'read')
    );
end;
$$;

create or replace function app.can_see_meeting(p_conf confidentiality, p_id uuid)
returns boolean
language plpgsql
stable
as $$
declare
  a app.authority_t := app.authority();
begin
  return app.can_read(p_conf, 'meetings', p_id)
    and (
      p_conf = 'public'
      or coalesce(a.internal, false)
      or app.is_meeting_attendee(p_id)
      or app.has_grant('meetings', p_id, 'read')
    );
end;
$$;

create or replace function app.can_see_via_meeting(p_conf confidentiality, p_meeting uuid)
returns boolean
language plpgsql
stable
as $$
declare
  a app.authority_t := app.authority();
begin
  return app.can_read(p_conf)
    and (
      p_conf = 'public'
      or coalesce(a.internal, false)
      or (p_meeting is not null and app.is_meeting_attendee(p_meeting))
    );
end;
$$;

create or replace function app.can_see_obligation(
  p_conf confidentiality,
  p_id uuid,
  p_obligor_profile uuid,
  p_obligor_stakeholder uuid
)
returns boolean
language plpgsql
stable
as $$
declare
  a app.authority_t := app.authority();
begin
  return app.can_read(p_conf, 'obligations', p_id)
    and (
      p_conf = 'public'
      or coalesce(a.internal, false)
      -- Whoever carries the obligation can always see it, which is the point
      -- of recording one against a named party.
      or app.caller_is(p_obligor_profile, p_obligor_stakeholder)
      or app.has_grant('obligations', p_id, 'read')
    );
end;
$$;

create or replace function app.can_see_risk(p_conf confidentiality, p_id uuid)
returns boolean
language plpgsql
stable
as $$
declare
  a app.authority_t := app.authority();
begin
  return app.can_read(p_conf, 'risks', p_id)
    and (
      p_conf = 'public'
      or coalesce(a.internal, false)
      or app.has_grant('risks', p_id, 'read')
    );
end;
$$;

-- The "who keeps this register" questions. Each was two app.acts_as() calls,
-- which was two authority rebuilds; now one.
create or replace function app.can_minute()
returns boolean
language sql
stable
as $$
  select coalesce((app.authority()).roles && array[
    'admin', 'project_director', 'field_team', 'board_director', 'trustee'
  ]::app_role[], false);
$$;

create or replace function app.can_assess()
returns boolean
language sql
stable
as $$
  select coalesce((app.authority()).roles && array[
    'admin', 'project_director', 'trustee', 'board_director'
  ]::app_role[], false);
$$;

create or replace function app.can_see_money()
returns boolean
language sql
stable
as $$
  select coalesce((app.authority()).roles && array[
    'admin', 'project_director', 'trustee', 'board_director',
    'audit_committee', 'external_auditor'
  ]::app_role[], false);
$$;

create or replace function app.can_spend()
returns boolean
language sql
stable
as $$
  select coalesce((app.authority()).roles && array[
    'admin', 'project_director', 'board_director'
  ]::app_role[], false);
$$;

create or replace function app.can_keep_risk_register()
returns boolean
language sql
stable
as $$
  select coalesce((app.authority()).roles && array[
    'admin', 'project_director', 'trustee', 'board_director', 'field_team'
  ]::app_role[], false);
$$;

create or replace function app.can_keep_legal_record(p_case uuid)
returns boolean
language plpgsql
stable
as $$
declare
  a app.authority_t := app.authority();
begin
  return a.roles && array['admin', 'project_director', 'trustee', 'board_director']::app_role[]
    or (a.roles && array['legal_counsel']::app_role[] and app.is_assigned_case(p_case));
end;
$$;

create or replace function app.can_keep_site_record(p_block uuid)
returns boolean
language plpgsql
stable
as $$
declare
  a app.authority_t := app.authority();
begin
  return a.roles && array['admin', 'project_director', 'field_team']::app_role[]
    or (a.roles && array['contractor', 'quantity_surveyor']::app_role[]
        and app.is_assigned_block(p_block));
end;
$$;

create or replace function app.can_see_commercials(p_block uuid)
returns boolean
language plpgsql
stable
as $$
declare
  a app.authority_t := app.authority();
begin
  return a.roles && array[
      'admin', 'project_director', 'trustee', 'board_director', 'audit_committee'
    ]::app_role[]
    or (a.roles && array['quantity_surveyor', 'external_auditor']::app_role[]
        and app.is_assigned_block(p_block));
end;
$$;

create or replace function app.can_price_work(p_block uuid)
returns boolean
language plpgsql
stable
as $$
declare
  a app.authority_t := app.authority();
begin
  return a.roles && array['admin', 'project_director']::app_role[]
    or (a.roles && array['quantity_surveyor']::app_role[]
        and app.is_assigned_block(p_block));
end;
$$;

grant execute on all functions in schema app to authenticated;
