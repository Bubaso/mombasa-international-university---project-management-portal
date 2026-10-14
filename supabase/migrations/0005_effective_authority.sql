-- Authority as a union, not a replacement (fixes M1-14), plus the audit trail
-- for sharing and scope, and one function the client can ask "what may I do".
--
-- Why this exists
-- ---------------
-- 0004 decided the caller's role by comparing clearance ceilings: a delegated
-- role only took effect if its ceiling was higher than the caller's own. That
-- reads plausibly and is wrong in the case the feature exists for. A trustee
-- already holds the highest ceiling, so handing a trustee the project
-- director's authority changed nothing at all — while the director's role is
-- what carries the right to record a payment, to share a record and to assign
-- an advocate to a case. The delegation would have been approved by two
-- trustees, shown as live, and done nothing.
--
-- Authority is not a ladder. A trustee may approve a delegation and a director
-- may not; a director may write finance and a trustee may not. Neither
-- contains the other, so the caller now acts under the *set* of roles they
-- hold: their own, plus every role lent to them by a live delegation. Every
-- policy asks whether that set contains a role that may act, rather than
-- asking for a single winning role.

-- ---------------------------------------------------------------------------
-- The effective set
-- ---------------------------------------------------------------------------

-- Every profile whose authority the caller currently carries. A delegation
-- from a deactivated or expired profile carries nothing: authority that its
-- owner no longer has cannot be lent.
create or replace function app.delegated_profiles()
returns setof profiles
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.*
  from emergency_delegations d
  join profiles p on p.id = d.from_user
  where d.to_user = auth.uid()
    and d.revoked_at is null
    and d.expires_at > now()
    and p.is_active
    and (p.expires_at is null or p.expires_at > now())
    and (
      select count(*) from emergency_delegation_approvals a
      where a.delegation_id = d.id
    ) >= 2;
$$;

drop function if exists app.delegated_profile();

-- Null for anyone without an active profile of their own: a delegation is an
-- addition to someone's access, never a way in on its own.
--
-- app.current_profile() returns a row, not a set, so selecting from it always
-- yields exactly one row — a row of nulls when there is no profile. The
-- explicit test for that is the only thing keeping this from answering
-- '{NULL}' to a caller who is not signed in.
create or replace function app.effective_roles()
returns app_role[]
language sql
stable
as $$
  select case
    when own.id is null then null
    else array(
      select own.role
      union
      select d.role from app.delegated_profiles() d
    )
  end
  from app.current_profile() own;
$$;

-- The question every policy actually asks.
create or replace function app.acts_as(variadic p_roles app_role[])
returns boolean
language sql
stable
as $$
  select coalesce(app.effective_roles() && p_roles, false);
$$;

create or replace function app.is_internal()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from unnest(app.effective_roles()) r where app.is_internal_role(r)
  );
$$;

create or replace function app.is_admin()
returns boolean
language sql
stable
as $$
  select app.acts_as('admin');
$$;

-- The caller's own role, for display and for the audit trail. It is no longer
-- the answer to "may they do this" — app.acts_as is.
create or replace function app.current_role_name()
returns app_role
language sql
stable
as $$
  select (app.current_profile()).role;
$$;

-- The widest clearance the caller holds or is lent. No separate ceiling is
-- applied: profiles_clearance_within_role already keeps every row's clearance
-- inside what its role may ever hold, so each value in this union is capped at
-- source.
create or replace function app.current_clearance()
returns confidentiality
language sql
stable
as $$
  select case
    when own.id is null then null
    else (
      select c.clearance
      from (
        select own.clearance
        union all
        select d.clearance from app.delegated_profiles() d
      ) c
      order by app.clearance_rank(c.clearance) desc
      limit 1
    )
  end
  from app.current_profile() own;
$$;

-- ---------------------------------------------------------------------------
-- The read and write rules, asked of the set
-- ---------------------------------------------------------------------------

create or replace function app.can_write(
  p_entity_type text default null,
  p_entity_id uuid default null
)
returns boolean
language sql
stable
as $$
  select
    app.current_clearance() is not null
    and (
      app.acts_as('admin', 'project_director', 'field_team', 'board_director')
      or (p_entity_type is not null and app.has_grant(p_entity_type, p_entity_id, 'write'))
    );
$$;

create or replace function app.can_see_case(p_conf confidentiality, p_id uuid)
returns boolean language sql stable as $$
  select app.can_read(p_conf, 'legal_cases', p_id)
    and (
      p_conf = 'public'
      or app.is_internal()
      or (app.acts_as('legal_counsel') and app.is_assigned_case(p_id))
      or app.has_grant('legal_cases', p_id, 'read')
    );
$$;

create or replace function app.can_see_block(p_conf confidentiality, p_id uuid)
returns boolean language sql stable as $$
  select app.can_read(p_conf, 'construction_blocks', p_id)
    and (
      p_conf = 'public'
      or app.is_internal()
      or (app.acts_as('contractor', 'quantity_surveyor') and app.is_assigned_block(p_id))
      or app.has_grant('construction_blocks', p_id, 'read')
    );
$$;

create or replace function app.can_see_transaction(p_conf confidentiality, p_id uuid)
returns boolean language sql stable as $$
  select app.can_read(p_conf, 'financial_transactions', p_id)
    and (
      p_conf = 'public'
      or app.has_grant('financial_transactions', p_id, 'read')
      or app.acts_as(
        'admin', 'project_director', 'trustee', 'board_director',
        'audit_committee', 'external_auditor', 'donor'
      )
    );
$$;

-- ---------------------------------------------------------------------------
-- Policies that name roles directly
-- ---------------------------------------------------------------------------
--
-- A policy stores the expression it was created with, so redefining a function
-- is not enough where the role list was written into the policy itself. These
-- are recreated verbatim apart from the test.

drop policy if exists record_grants_manage on record_grants;
create policy record_grants_manage on record_grants
  for all
  using (app.acts_as('admin', 'project_director'))
  with check (app.acts_as('admin', 'project_director'));

drop policy if exists case_assignments_manage on case_assignments;
create policy case_assignments_manage on case_assignments
  for all
  using (app.acts_as('admin', 'project_director'))
  with check (app.acts_as('admin', 'project_director'));

drop policy if exists block_assignments_manage on block_assignments;
create policy block_assignments_manage on block_assignments
  for all
  using (app.acts_as('admin', 'project_director'))
  with check (app.acts_as('admin', 'project_director'));

drop policy if exists audit_log_read on audit_log;
create policy audit_log_read on audit_log
  for select using (app.acts_as('admin', 'project_director', 'trustee', 'audit_committee'));

drop policy if exists legal_cases_update on legal_cases;
create policy legal_cases_update on legal_cases
  for update
  using (
    app.can_see_case(confidentiality, id)
    and app.can_write('legal_cases', id)
  )
  with check (
    app.can_write('legal_cases', id)
  );

drop policy if exists construction_blocks_update on construction_blocks;
create policy construction_blocks_update on construction_blocks
  for update
  using (
    app.can_see_block(confidentiality, id)
    and app.can_write('construction_blocks', id)
  )
  with check (
    app.can_write('construction_blocks', id)
  );

drop policy if exists financial_transactions_insert on financial_transactions;
create policy financial_transactions_insert on financial_transactions
  for insert
  with check (app.acts_as('admin', 'project_director', 'board_director'));

drop policy if exists financial_transactions_update on financial_transactions;
create policy financial_transactions_update on financial_transactions
  for update
  using (
    app.can_see_transaction(confidentiality, id)
    and app.acts_as('admin', 'project_director', 'board_director')
  )
  with check (app.acts_as('admin', 'project_director', 'board_director'));

drop policy if exists financial_transactions_delete on financial_transactions;
create policy financial_transactions_delete on financial_transactions
  for delete
  using (
    app.can_see_transaction(confidentiality, id)
    and app.acts_as('admin', 'project_director', 'board_director')
  );

drop policy if exists trustee_members_insert on trustee_members;
create policy trustee_members_insert on trustee_members
  for insert with check (app.acts_as('admin', 'project_director'));

drop policy if exists trustee_members_update on trustee_members;
create policy trustee_members_update on trustee_members
  for update
  using (app.can_read(confidentiality, 'trustee_members', id)
         and app.acts_as('admin', 'project_director'))
  with check (app.acts_as('admin', 'project_director'));

drop policy if exists trustee_members_delete on trustee_members;
create policy trustee_members_delete on trustee_members
  for delete
  using (app.can_read(confidentiality, 'trustee_members', id)
         and app.acts_as('admin', 'project_director'));

-- A deadline aimed at trustees reaches anyone acting with a trustee's
-- authority, which is the point of aiming it at the role rather than at people.
drop policy if exists deadline_notifications_read on deadline_notifications;
create policy deadline_notifications_read on deadline_notifications
  for select using (
    app.can_read(confidentiality, 'deadline_notifications', id)
    and (
      target_roles = '{}'::app_role[]
      or app.effective_roles() && target_roles
    )
  );

drop policy if exists deadline_notifications_insert on deadline_notifications;
create policy deadline_notifications_insert on deadline_notifications
  for insert with check (app.acts_as('admin', 'project_director'));

drop policy if exists deadline_notifications_update on deadline_notifications;
create policy deadline_notifications_update on deadline_notifications
  for update
  using (app.can_read(confidentiality, 'deadline_notifications', id)
         and app.acts_as('admin', 'project_director'))
  with check (app.acts_as('admin', 'project_director'));

drop policy if exists deadline_notifications_delete on deadline_notifications;
create policy deadline_notifications_delete on deadline_notifications
  for delete
  using (app.can_read(confidentiality, 'deadline_notifications', id)
         and app.acts_as('admin', 'project_director'));

-- Raising and revoking a delegation stays with the caller's own role: a
-- delegation may not be used to mint further delegations.
drop policy if exists emergency_delegations_insert on emergency_delegations;
create policy emergency_delegations_insert on emergency_delegations
  for insert with check (
    requested_by = auth.uid()
    and app.current_role_name() in ('trustee', 'admin')
  );

drop policy if exists emergency_delegations_revoke on emergency_delegations;
create policy emergency_delegations_revoke on emergency_delegations
  for update
  using (app.current_role_name() in ('trustee', 'admin'))
  with check (app.current_role_name() in ('trustee', 'admin'));

-- ---------------------------------------------------------------------------
-- Sharing and scope are now audited
-- ---------------------------------------------------------------------------
--
-- Who was given sight of a confidential record, and who put an outside advocate
-- on a case, are exactly the decisions an audit trail is for. They were the
-- only writes in the access model that left no trace. The assignment tables
-- have no id column, so the entity_id stays null and the row itself is the
-- record — which is why record_audit captures before and after in full.

create trigger record_grants_audit
  after insert or update or delete on record_grants
  for each row execute function app.record_audit();

create trigger case_assignments_audit
  after insert or update or delete on case_assignments
  for each row execute function app.record_audit();

create trigger block_assignments_audit
  after insert or update or delete on block_assignments
  for each row execute function app.record_audit();

-- ---------------------------------------------------------------------------
-- What the client is allowed to believe about itself
-- ---------------------------------------------------------------------------
--
-- The browser has always been able to read its own profile row, but that row
-- does not mention a delegation, so a person acting for someone else would see
-- a portal that hides controls the database would have accepted. This is the
-- one authoritative answer, computed by the same functions the policies use.
-- It shapes the interface only; nothing is permitted because this said so.

create or replace function public.current_authority()
returns jsonb
language sql
stable
as $$
  select case when own.id is null then null else jsonb_build_object(
    'role', app.current_role_name(),
    'roles', to_jsonb(app.effective_roles()),
    'clearance', app.current_clearance(),
    'isInternal', app.is_internal(),
    'isAdmin', app.is_admin(),
    'delegations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'lenderId', d.id,
        'lenderName', d.full_name,
        'role', d.role,
        'clearance', d.clearance
      ))
      from app.delegated_profiles() d
    ), '[]'::jsonb)
  ) end
  from app.current_profile() own;
$$;

comment on function public.current_authority() is
  'The caller''s effective authority, delegation included. Null when they have '
  'no active profile.';

grant execute on function public.current_authority() to authenticated;
grant execute on all functions in schema app to authenticated;
