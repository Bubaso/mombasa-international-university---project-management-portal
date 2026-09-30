-- Row level security.
--
-- Every rule below is enforced by Postgres, not by the client. The anon key
-- is public by design and anyone can issue arbitrary queries with it, so a
-- filter written in React is decoration. This file is the actual boundary.
--
-- Requirements: M1-03, M1-04, M1-06.

-- ---------------------------------------------------------------------------
-- The read rule
-- ---------------------------------------------------------------------------

-- A caller may read a record when all of these hold:
--   1. they have an active, unexpired profile;
--   2. the record's tier is within their effective clearance, OR they hold an
--      explicit grant on that record;
--   3. restricted records additionally require an internal role — an external
--      party cannot reach them even with a grant, by mistake or otherwise;
--   4. external roles with a defined scope (legal counsel, contractor,
--      quantity surveyor) only see records inside that scope.
--
-- Grants deliberately do not override rule 3. Sharing one confidential record
-- with an outside lawyer is routine; sharing a restricted one should require a
-- deliberate reclassification, not a checkbox.
create or replace function app.can_read(
  p_confidentiality confidentiality,
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
      p_confidentiality <> 'restricted'
      or app.is_internal()
    )
    and (
      app.clearance_rank(p_confidentiality) <= app.clearance_rank(app.current_clearance())
      or (
        p_entity_type is not null
        and p_confidentiality <> 'restricted'
        and app.has_grant(p_entity_type, p_entity_id, 'read')
      )
    );
$$;

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
      app.current_role_name() in (
        'admin', 'project_director', 'field_team', 'board_director'
      )
      or (p_entity_type is not null and app.has_grant(p_entity_type, p_entity_id, 'write'))
    );
$$;

-- Per-table visibility. Named once, because the mutating policies must gate
-- on exactly the same predicate: being allowed to edit is never a way to see
-- something you could not otherwise read.
--
-- Scope narrows the internal tier and above. The public tier means published:
-- anyone with an active profile may read it, including donors and observers,
-- which is what distinguishes it from internal. Nothing becomes public by
-- accident — the column defaults to internal and reclassifying is deliberate.
create or replace function app.can_see_case(p_conf confidentiality, p_id uuid)
returns boolean language sql stable as $$
  select app.can_read(p_conf, 'legal_cases', p_id)
    and (
      p_conf = 'public'
      or app.is_internal()
      or (app.current_role_name() = 'legal_counsel' and app.is_assigned_case(p_id))
      -- A grant is the deliberate way to hand one record to one person, so it
      -- has to clear scope as well as clearance — otherwise sharing a file
      -- with an outside adviser would be impossible for exactly the roles
      -- scope exists to contain. It still cannot reach restricted: can_read
      -- refuses that above, for external roles entirely.
      or app.has_grant('legal_cases', p_id, 'read')
    );
$$;

create or replace function app.can_see_block(p_conf confidentiality, p_id uuid)
returns boolean language sql stable as $$
  select app.can_read(p_conf, 'construction_blocks', p_id)
    and (
      p_conf = 'public'
      or app.is_internal()
      or (app.current_role_name() in ('contractor', 'quantity_surveyor')
          and app.is_assigned_block(p_id))
      or app.has_grant('construction_blocks', p_id, 'read')
    );
$$;

create or replace function app.can_see_transaction(p_conf confidentiality, p_id uuid)
returns boolean language sql stable as $$
  select app.can_read(p_conf, 'financial_transactions', p_id)
    and (
      p_conf = 'public'
      or app.has_grant('financial_transactions', p_id, 'read')
      or app.current_role_name() in (
        'admin', 'project_director', 'trustee', 'board_director',
        'audit_committee', 'external_auditor', 'donor'
      )
    );
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;
alter table profiles force row level security;

-- Everyone signed in can see who else is in the portal: name, role,
-- organization. That is the directory, and hiding it helps nobody.
create policy profiles_read on profiles
  for select using (app.current_clearance() is not null);

create policy profiles_self_update on profiles
  for update using (id = auth.uid())
  with check (
    id = auth.uid()
    -- A person may edit their own name, not their own authority.
    and role = (select role from app.current_profile())
    and clearance = (select clearance from app.current_profile())
    and is_active = (select is_active from app.current_profile())
  );

create policy profiles_admin_all on profiles
  for all using (app.is_admin()) with check (app.is_admin());

-- ---------------------------------------------------------------------------
-- record_grants
-- ---------------------------------------------------------------------------

alter table record_grants enable row level security;
alter table record_grants force row level security;

create policy record_grants_read on record_grants
  for select using (user_id = auth.uid() or app.is_internal());

-- Only the roles that can classify can share. Notably a grant holder cannot
-- pass their access on.
create policy record_grants_manage on record_grants
  for all
  using (app.current_role_name() in ('admin', 'project_director'))
  with check (app.current_role_name() in ('admin', 'project_director'));

-- ---------------------------------------------------------------------------
-- Assignments
-- ---------------------------------------------------------------------------

alter table case_assignments enable row level security;
alter table case_assignments force row level security;

create policy case_assignments_read on case_assignments
  for select using (user_id = auth.uid() or app.is_internal());

create policy case_assignments_manage on case_assignments
  for all
  using (app.current_role_name() in ('admin', 'project_director'))
  with check (app.current_role_name() in ('admin', 'project_director'));

alter table block_assignments enable row level security;
alter table block_assignments force row level security;

create policy block_assignments_read on block_assignments
  for select using (user_id = auth.uid() or app.is_internal());

create policy block_assignments_manage on block_assignments
  for all
  using (app.current_role_name() in ('admin', 'project_director'))
  with check (app.current_role_name() in ('admin', 'project_director'));

-- ---------------------------------------------------------------------------
-- audit_log
-- ---------------------------------------------------------------------------

alter table audit_log enable row level security;
alter table audit_log force row level security;

-- Readable by those who answer for the project; written only by the triggers,
-- which run as definer. No policy grants insert, update or delete to anyone.
create policy audit_log_read on audit_log
  for select using (
    app.current_role_name() in ('admin', 'project_director', 'trustee', 'audit_committee')
  );

-- ---------------------------------------------------------------------------
-- legal_cases
-- ---------------------------------------------------------------------------

alter table legal_cases enable row level security;
alter table legal_cases force row level security;

-- An advocate sees their own files. Everything else is invisible, not merely
-- filtered out of the list.
create policy legal_cases_read on legal_cases
  for select using (app.can_see_case(confidentiality, id));

create policy legal_cases_insert on legal_cases
  for insert with check (app.can_write('legal_cases', id));

create policy legal_cases_update on legal_cases
  for update
  using (
    app.can_see_case(confidentiality, id)
    and (app.can_write('legal_cases', id)
         or (app.current_role_name() = 'legal_counsel' and app.is_assigned_case(id)))
  )
  with check (
    app.can_write('legal_cases', id)
    or (app.current_role_name() = 'legal_counsel' and app.is_assigned_case(id))
  );

create policy legal_cases_delete on legal_cases
  for delete
  using (app.can_see_case(confidentiality, id) and app.can_write('legal_cases', id));

-- ---------------------------------------------------------------------------
-- construction_blocks
-- ---------------------------------------------------------------------------

alter table construction_blocks enable row level security;
alter table construction_blocks force row level security;

create policy construction_blocks_read on construction_blocks
  for select using (app.can_see_block(confidentiality, id));

create policy construction_blocks_insert on construction_blocks
  for insert with check (app.can_write('construction_blocks', id));

create policy construction_blocks_update on construction_blocks
  for update
  using (
    app.can_see_block(confidentiality, id)
    and (app.can_write('construction_blocks', id)
         or (app.current_role_name() in ('contractor', 'quantity_surveyor')
             and app.is_assigned_block(id)))
  )
  with check (
    app.can_write('construction_blocks', id)
    or (app.current_role_name() in ('contractor', 'quantity_surveyor')
        and app.is_assigned_block(id))
  );

create policy construction_blocks_delete on construction_blocks
  for delete
  using (app.can_see_block(confidentiality, id) and app.can_write('construction_blocks', id));

-- ---------------------------------------------------------------------------
-- document_vault
-- ---------------------------------------------------------------------------

alter table document_vault enable row level security;
alter table document_vault force row level security;

create policy document_vault_read on document_vault
  for select using (app.can_read(confidentiality, 'document_vault', id));

create policy document_vault_insert on document_vault
  for insert with check (app.can_write('document_vault', id));

create policy document_vault_update on document_vault
  for update
  using (app.can_read(confidentiality, 'document_vault', id) and app.can_write('document_vault', id))
  with check (app.can_write('document_vault', id));

create policy document_vault_delete on document_vault
  for delete
  using (app.can_read(confidentiality, 'document_vault', id) and app.can_write('document_vault', id));

-- ---------------------------------------------------------------------------
-- financial_transactions
-- ---------------------------------------------------------------------------

alter table financial_transactions enable row level security;
alter table financial_transactions force row level security;

-- Money is not part of a contractor's or an advocate's world. Auditors read
-- everything within their clearance; donors see only what was published.
create policy financial_transactions_read on financial_transactions
  for select using (app.can_see_transaction(confidentiality, id));

create policy financial_transactions_insert on financial_transactions
  for insert
  with check (app.current_role_name() in ('admin', 'project_director', 'board_director'));

create policy financial_transactions_update on financial_transactions
  for update
  using (
    app.can_see_transaction(confidentiality, id)
    and app.current_role_name() in ('admin', 'project_director', 'board_director')
  )
  with check (app.current_role_name() in ('admin', 'project_director', 'board_director'));

create policy financial_transactions_delete on financial_transactions
  for delete
  using (
    app.can_see_transaction(confidentiality, id)
    and app.current_role_name() in ('admin', 'project_director', 'board_director')
  );

-- ---------------------------------------------------------------------------
-- trustee_members
-- ---------------------------------------------------------------------------

alter table trustee_members enable row level security;
alter table trustee_members force row level security;

create policy trustee_members_read on trustee_members
  for select using (app.can_read(confidentiality, 'trustee_members', id));

create policy trustee_members_insert on trustee_members
  for insert with check (app.current_role_name() in ('admin', 'project_director'));

create policy trustee_members_update on trustee_members
  for update
  using (app.can_read(confidentiality, 'trustee_members', id)
         and app.current_role_name() in ('admin', 'project_director'))
  with check (app.current_role_name() in ('admin', 'project_director'));

create policy trustee_members_delete on trustee_members
  for delete
  using (app.can_read(confidentiality, 'trustee_members', id)
         and app.current_role_name() in ('admin', 'project_director'));

-- ---------------------------------------------------------------------------
-- communication_threads and messages
-- ---------------------------------------------------------------------------

alter table communication_threads enable row level security;
alter table communication_threads force row level security;

create policy communication_threads_read on communication_threads
  for select using (app.can_read(confidentiality, 'communication_threads', id));

create policy communication_threads_insert on communication_threads
  for insert with check (app.can_write('communication_threads', id));

create policy communication_threads_update on communication_threads
  for update
  using (app.can_read(confidentiality, 'communication_threads', id)
         and app.can_write('communication_threads', id))
  with check (app.can_write('communication_threads', id));

create policy communication_threads_delete on communication_threads
  for delete
  using (app.can_read(confidentiality, 'communication_threads', id)
         and app.can_write('communication_threads', id));

alter table thread_messages enable row level security;
alter table thread_messages force row level security;

-- A message is readable exactly when its thread is.
create policy thread_messages_read on thread_messages
  for select using (
    exists (
      select 1 from communication_threads t
      where t.id = thread_messages.thread_id
        and app.can_read(t.confidentiality, 'communication_threads', t.id)
    )
  );

-- You may post as yourself, into a thread you can read, and you may not
-- rewrite what you or anyone else already said.
create policy thread_messages_insert on thread_messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from communication_threads t
      where t.id = thread_messages.thread_id
        and app.can_read(t.confidentiality, 'communication_threads', t.id)
    )
  );

-- ---------------------------------------------------------------------------
-- deadline_notifications
-- ---------------------------------------------------------------------------

alter table deadline_notifications enable row level security;
alter table deadline_notifications force row level security;

create policy deadline_notifications_read on deadline_notifications
  for select using (
    app.can_read(confidentiality, 'deadline_notifications', id)
    and (
      target_roles = '{}'::app_role[]
      or app.current_role_name() = any (target_roles)
    )
  );

create policy deadline_notifications_insert on deadline_notifications
  for insert with check (app.current_role_name() in ('admin', 'project_director'));

create policy deadline_notifications_update on deadline_notifications
  for update
  using (app.can_read(confidentiality, 'deadline_notifications', id)
         and app.current_role_name() in ('admin', 'project_director'))
  with check (app.current_role_name() in ('admin', 'project_director'));

create policy deadline_notifications_delete on deadline_notifications
  for delete
  using (app.can_read(confidentiality, 'deadline_notifications', id)
         and app.current_role_name() in ('admin', 'project_director'));

alter table deadline_acknowledgements enable row level security;
alter table deadline_acknowledgements force row level security;

-- Acknowledging is personal: you may record and withdraw your own, and you
-- cannot touch anyone else's.
create policy deadline_acknowledgements_own on deadline_acknowledgements
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Default privileges
-- ---------------------------------------------------------------------------

-- RLS only narrows what a grant already allows, so the grants stay coarse and
-- the policies do the work. Nothing is granted to anon: every table in this
-- schema requires a signed-in caller.
-- Policies call these helpers as the caller, so without usage on the schema
-- every policy fails closed and the whole portal reads as empty.
grant usage on schema app to authenticated;
grant execute on all functions in schema app to authenticated;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

revoke all on audit_log from authenticated;
grant select on audit_log to authenticated;

-- Tables added by later migrations inherit the same coarse grant, so a new
-- table is governed by its policies rather than silently unreachable.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;
alter default privileges in schema app
  grant execute on functions to authenticated;
