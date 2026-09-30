-- Authorization tests (N-31).
--
-- Each case takes the seat of a specific person by setting the same JWT claim
-- a real request carries, then asserts what they can and cannot reach. A
-- failure raises, so the runner's exit code is the result.
--
-- The decision that external stakeholders sign in directly is what makes these
-- mandatory: the confidentiality model is the only thing standing between a
-- contractor and the trustees' private assessments.

\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

set role authenticated;

-- Session scope, not transaction scope: psql runs each statement in its own
-- transaction, so a local setting would be discarded before the next one.
create or replace function pg_temp.act_as(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), false);
$$;

create or replace function pg_temp.check(p_label text, p_actual anyelement, p_expected anyelement)
returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'FAIL % — expected %, got %', p_label, p_expected, p_actual;
  end if;
  raise notice 'ok   %', p_label;
end;
$$;

create or replace function pg_temp.visible_cases()
returns bigint language sql as $$
  select count(*) from legal_cases;
$$;

-- ===========================================================================
-- Clearance ceilings
-- ===========================================================================

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');  -- trustee
select pg_temp.check('trustee reads all four tiers', pg_temp.visible_cases(), 4::bigint);

select pg_temp.act_as('44444444-4444-4444-4444-444444444444');  -- field team
select pg_temp.check('field team stops below restricted', pg_temp.visible_cases(), 3::bigint);

select pg_temp.act_as('88888888-8888-8888-8888-888888888888');  -- donor
select pg_temp.check('donor sees only public', pg_temp.visible_cases(), 1::bigint);

-- ===========================================================================
-- Restricted is off limits to external roles, grant or no grant
-- ===========================================================================

select pg_temp.act_as('66666666-6666-6666-6666-666666666666');  -- advocate two
select pg_temp.check(
  'granted restricted case stays invisible to an external role',
  (select count(*) from legal_cases where id = 'aaaa0000-0000-0000-0000-000000000004'),
  0::bigint);

-- ===========================================================================
-- External scope (M1-06)
-- ===========================================================================

select pg_temp.act_as('55555555-5555-5555-5555-555555555555');  -- advocate one
select pg_temp.check(
  'advocate sees the case assigned to them',
  (select count(*) from legal_cases where id = 'aaaa0000-0000-0000-0000-000000000002'),
  1::bigint);
-- The public tier is published material; scope gates internal and above.
select pg_temp.check(
  'advocate may read a published case they are not on',
  (select count(*) from legal_cases where id = 'aaaa0000-0000-0000-0000-000000000001'),
  1::bigint);
select pg_temp.check(
  'advocate cannot reach a restricted case',
  (select count(*) from legal_cases where id = 'aaaa0000-0000-0000-0000-000000000004'),
  0::bigint);

select pg_temp.act_as('66666666-6666-6666-6666-666666666666');  -- advocate two
select pg_temp.check(
  'advocate with no assignments sees only the published case',
  pg_temp.visible_cases(), 1::bigint);

select pg_temp.act_as('77777777-7777-7777-7777-777777777777');  -- contractor
select pg_temp.check(
  'contractor sees only their own block',
  (select count(*) from construction_blocks),
  1::bigint);
select pg_temp.check(
  'and it is the assigned one',
  (select code from construction_blocks),
  'A1'::text);
select pg_temp.check(
  'contractor cannot reach finance at all',
  (select count(*) from financial_transactions),
  0::bigint);

-- ===========================================================================
-- Grants
-- ===========================================================================

select pg_temp.act_as('55555555-5555-5555-5555-555555555555');
select pg_temp.check(
  'a grant lifts one confidential case above the clearance ceiling',
  (select count(*) from legal_cases where id = 'aaaa0000-0000-0000-0000-000000000003'),
  1::bigint);

select pg_temp.act_as('66666666-6666-6666-6666-666666666666');
select pg_temp.check(
  'an expired grant no longer counts',
  (select count(*) from legal_cases where id = 'aaaa0000-0000-0000-0000-000000000002'),
  0::bigint);

-- ===========================================================================
-- Profile lifecycle
-- ===========================================================================

select pg_temp.act_as('99999999-9999-9999-9999-999999999999');  -- expired consultant
select pg_temp.check('an expired profile reads nothing', pg_temp.visible_cases(), 0::bigint);

select set_config('request.jwt.claim.sub', '', false);
select pg_temp.check('an anonymous caller reads nothing', pg_temp.visible_cases(), 0::bigint);

-- ===========================================================================
-- Escalation
-- ===========================================================================

select pg_temp.act_as('55555555-5555-5555-5555-555555555555');
do $$
begin
  begin
    update profiles set role = 'admin' where id = auth.uid();
    -- The policy's WITH CHECK makes this affect zero rows rather than raise.
    if (select role from profiles where id = auth.uid()) = 'admin' then
      raise exception 'FAIL self promotion to admin succeeded';
    end if;
    raise notice 'ok   a user cannot promote their own role';
  exception
    when insufficient_privilege or check_violation then
      raise notice 'ok   a user cannot promote their own role (refused)';
  end;
end;
$$;

do $$
begin
  begin
    update profiles set clearance = 'restricted' where id = auth.uid();
    if (select clearance from profiles where id = auth.uid()) = 'restricted' then
      raise exception 'FAIL self promotion of clearance succeeded';
    end if;
    raise notice 'ok   a user cannot raise their own clearance';
  exception
    when insufficient_privilege or check_violation then
      raise notice 'ok   a user cannot raise their own clearance (refused)';
  end;
end;
$$;

-- A contractor writing to a block they were never assigned.
select pg_temp.act_as('77777777-7777-7777-7777-777777777777');
do $$
declare
  n int;
begin
  update construction_blocks set progress_percent = 99
  where id = 'bbbb0000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL contractor updated an unassigned block';
  end if;
  raise notice 'ok   contractor cannot write to an unassigned block';
end;
$$;

-- ===========================================================================
-- Audit log (M1-07)
-- ===========================================================================

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');  -- trustee
do $$
begin
  if (select count(*) from audit_log) = 0 then
    raise exception 'FAIL the audit log recorded nothing during seeding';
  end if;
  raise notice 'ok   the audit log captured the seeded writes';
end;
$$;

do $$
begin
  begin
    update audit_log set action = 'tampered' where id = (select min(id) from audit_log);
    raise exception 'FAIL the audit log accepted an update';
  exception
    when insufficient_privilege then
      raise notice 'ok   the audit log refuses updates';
  end;
end;
$$;

do $$
begin
  begin
    delete from audit_log where id = (select min(id) from audit_log);
    raise exception 'FAIL the audit log accepted a delete';
  exception
    when insufficient_privilege then
      raise notice 'ok   the audit log refuses deletes';
  end;
end;
$$;

select pg_temp.act_as('77777777-7777-7777-7777-777777777777');  -- contractor
select pg_temp.check('contractor cannot read the audit log', (select count(*) from audit_log), 0::bigint);

-- ===========================================================================
-- Targeted deadlines
-- ===========================================================================

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');  -- trustee
select pg_temp.check('trustee sees both deadlines',
  (select count(*) from deadline_notifications), 2::bigint);

select pg_temp.act_as('44444444-4444-4444-4444-444444444444');  -- field team
select pg_temp.check('a trustee-only deadline is not shown to the field team',
  (select count(*) from deadline_notifications), 1::bigint);

-- ===========================================================================
-- Threads
-- ===========================================================================

select pg_temp.act_as('44444444-4444-4444-4444-444444444444');  -- field team
select pg_temp.check('field team does not see the restricted thread',
  (select count(*) from communication_threads), 1::bigint);

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');  -- trustee
select pg_temp.check('trustee sees both threads',
  (select count(*) from communication_threads), 2::bigint);

-- A message must be posted as the sender, not as someone else.
select pg_temp.act_as('44444444-4444-4444-4444-444444444444');
do $$
begin
  begin
    insert into thread_messages (thread_id, sender_id, body)
    values ('dddd0000-0000-0000-0000-000000000001',
            '33333333-3333-3333-3333-333333333333', 'posted as the trustee');
    raise exception 'FAIL a message was posted under another identity';
  exception
    when insufficient_privilege then
      raise notice 'ok   a message cannot be posted under another identity';
  end;
end;
$$;


-- ===========================================================================
-- Emergency delegation (M1-14)
-- ===========================================================================

-- The field team member cannot see the restricted case to begin with.
select pg_temp.act_as('44444444-4444-4444-4444-444444444444');
select pg_temp.check(
  'before any delegation the field team stops below restricted',
  pg_temp.visible_cases(), 3::bigint);

-- A trustee raises a request to hand the director's authority over.
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
insert into emergency_delegations (id, from_user, to_user, reason, requested_by, expires_at)
values ('ffff0000-0000-0000-0000-000000000001',
        '22222222-2222-2222-2222-222222222222',
        '44444444-4444-4444-4444-444444444444',
        'Director unreachable during the hearing week',
        '33333333-3333-3333-3333-333333333333',
        now() + interval '3 days');

select pg_temp.act_as('44444444-4444-4444-4444-444444444444');
select pg_temp.check(
  'an unapproved request grants nothing',
  pg_temp.visible_cases(), 3::bigint);

-- The recipient cannot approve their own delegation.
do $$
begin
  begin
    insert into emergency_delegation_approvals (delegation_id, approver_id)
    values ('ffff0000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444');
    raise exception 'FAIL the recipient approved their own delegation';
  exception
    when insufficient_privilege then
      raise notice 'ok   the recipient cannot approve their own delegation';
  end;
end;
$$;

-- Nor can someone who is not a trustee.
select pg_temp.act_as('55555555-5555-5555-5555-555555555555');  -- advocate
do $$
begin
  begin
    insert into emergency_delegation_approvals (delegation_id, approver_id)
    values ('ffff0000-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555');
    raise exception 'FAIL a non-trustee approved a delegation';
  exception
    when insufficient_privilege then
      raise notice 'ok   only a trustee may approve a delegation';
  end;
end;
$$;

-- One trustee is not enough.
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
insert into emergency_delegation_approvals (delegation_id, approver_id)
values ('ffff0000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333');

select pg_temp.act_as('44444444-4444-4444-4444-444444444444');
select pg_temp.check(
  'one approval is not enough',
  pg_temp.visible_cases(), 3::bigint);

-- The second trustee completes it.
select pg_temp.act_as('aaaa1111-1111-1111-1111-111111111111');
insert into emergency_delegation_approvals (delegation_id, approver_id)
values ('ffff0000-0000-0000-0000-000000000001', 'aaaa1111-1111-1111-1111-111111111111');

select pg_temp.act_as('44444444-4444-4444-4444-444444444444');
select pg_temp.check(
  'two trustees together transfer the authority',
  pg_temp.visible_cases(), 4::bigint);

-- Revoking takes it straight back.
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
update emergency_delegations
set revoked_by = '33333333-3333-3333-3333-333333333333', revoked_at = now()
where id = 'ffff0000-0000-0000-0000-000000000001';

select pg_temp.act_as('44444444-4444-4444-4444-444444444444');
select pg_temp.check(
  'revoking a delegation withdraws the authority',
  pg_temp.visible_cases(), 3::bigint);

-- ===========================================================================
-- Authority is a union, not a ladder (M1-14, corrected in 0005)
-- ===========================================================================
--
-- The case that mattered and did not work: a trustee already holds the highest
-- clearance, so under the old rule a delegation to a trustee changed nothing —
-- and the director's role, not the ceiling, is what carries the right to
-- record a payment.

select pg_temp.act_as('bbbb1111-1111-1111-1111-111111111111');  -- trustee three
do $$
begin
  begin
    insert into financial_transactions (reference_no, date, category, amount_kshs, confidentiality)
    values ('PV-002', current_date, 'civil_construction', 250000, 'internal');
    raise exception 'FAIL a trustee recorded a payment with no delegation';
  exception
    when insufficient_privilege then
      raise notice 'ok   overseeing the project is not the same as spending its money';
  end;
end;
$$;

-- Two trustees hand the director's authority over.
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
insert into emergency_delegations (id, from_user, to_user, reason, requested_by, expires_at)
values ('ffff0000-0000-0000-0000-000000000002',
        '22222222-2222-2222-2222-222222222222',
        'bbbb1111-1111-1111-1111-111111111111',
        'Director on leave during the disbursement window',
        '33333333-3333-3333-3333-333333333333',
        now() + interval '2 days');
insert into emergency_delegation_approvals (delegation_id, approver_id)
values ('ffff0000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333');

select pg_temp.act_as('aaaa1111-1111-1111-1111-111111111111');
insert into emergency_delegation_approvals (delegation_id, approver_id)
values ('ffff0000-0000-0000-0000-000000000002', 'aaaa1111-1111-1111-1111-111111111111');

select pg_temp.act_as('bbbb1111-1111-1111-1111-111111111111');
insert into financial_transactions (reference_no, date, category, amount_kshs, confidentiality)
values ('PV-002', current_date, 'civil_construction', 250000, 'internal');
select pg_temp.check(
  'a lent directorship lets a trustee record the payment',
  (select count(*) from financial_transactions where reference_no = 'PV-002'),
  1::bigint);

select pg_temp.check(
  'and they keep their own role alongside it',
  (select count(*) from unnest(app.effective_roles()) r
    where r in ('trustee', 'project_director')),
  2::bigint);

-- ---------------------------------------------------------------------------
-- A delegation adds authority; it does not add the right to delegate
-- ---------------------------------------------------------------------------

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
insert into emergency_delegations (id, from_user, to_user, reason, requested_by, expires_at)
values ('ffff0000-0000-0000-0000-000000000003',
        '11111111-1111-1111-1111-111111111111',
        '44444444-4444-4444-4444-444444444444',
        'Administrator unreachable',
        '33333333-3333-3333-3333-333333333333',
        now() + interval '2 days');
insert into emergency_delegation_approvals (delegation_id, approver_id)
values ('ffff0000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333');

-- One approval so far: nothing has moved yet.
select pg_temp.act_as('44444444-4444-4444-4444-444444444444');
do $$
declare n int;
begin
  update profiles set organization = 'Should not stick'
  where id = '88888888-8888-8888-8888-888888888888';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL the field team edited another profile on one approval';
  end if;
  raise notice 'ok   one approval lends no administrative authority';
end;
$$;

select pg_temp.act_as('aaaa1111-1111-1111-1111-111111111111');
insert into emergency_delegation_approvals (delegation_id, approver_id)
values ('ffff0000-0000-0000-0000-000000000003', 'aaaa1111-1111-1111-1111-111111111111');

select pg_temp.act_as('44444444-4444-4444-4444-444444444444');
update profiles set organization = 'AUTK (acting)'
where id = '88888888-8888-8888-8888-888888888888';
select pg_temp.check(
  'a lent administratorship lets them edit a profile',
  (select organization from profiles where id = '88888888-8888-8888-8888-888888888888'),
  'AUTK (acting)'::text);

-- But raising a delegation is still read from their own role, so borrowed
-- authority cannot be used to borrow more.
do $$
begin
  begin
    insert into emergency_delegations (from_user, to_user, reason, requested_by, expires_at)
    values ('22222222-2222-2222-2222-222222222222',
            '77777777-7777-7777-7777-777777777777',
            'Chained delegation',
            '44444444-4444-4444-4444-444444444444',
            now() + interval '1 day');
    raise exception 'FAIL a delegation was used to raise another delegation';
  exception
    when insufficient_privilege then
      raise notice 'ok   borrowed authority cannot be used to borrow more';
  end;
end;
$$;

-- Revoking takes the lent administratorship straight back.
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
update emergency_delegations
set revoked_by = '33333333-3333-3333-3333-333333333333', revoked_at = now()
where id = 'ffff0000-0000-0000-0000-000000000003';

select pg_temp.act_as('44444444-4444-4444-4444-444444444444');
do $$
declare n int;
begin
  update profiles set organization = 'Should not stick'
  where id = '88888888-8888-8888-8888-888888888888';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL a revoked delegation still lent its authority';
  end if;
  raise notice 'ok   revoking withdraws the lent administratorship too';
end;
$$;

-- ---------------------------------------------------------------------------
-- Authority its owner no longer holds cannot be lent
-- ---------------------------------------------------------------------------

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');  -- administrator
update profiles set is_active = false where id = '22222222-2222-2222-2222-222222222222';

select pg_temp.act_as('bbbb1111-1111-1111-1111-111111111111');
do $$
begin
  begin
    insert into financial_transactions (reference_no, date, category, amount_kshs, confidentiality)
    values ('PV-003', current_date, 'civil_construction', 10000, 'internal');
    raise exception 'FAIL a deactivated profile still lent its authority';
  exception
    when insufficient_privilege then
      raise notice 'ok   deactivating someone withdraws what they had lent out';
  end;
end;
$$;

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
update profiles set is_active = true where id = '22222222-2222-2222-2222-222222222222';

-- ===========================================================================
-- Sharing and scope leave a trace (M1-07)
-- ===========================================================================

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- project director
insert into record_grants (user_id, entity_type, entity_id, permission, granted_by)
values ('88888888-8888-8888-8888-888888888888', 'legal_cases',
        'aaaa0000-0000-0000-0000-000000000003', 'read',
        '22222222-2222-2222-2222-222222222222');
insert into case_assignments (user_id, legal_case_id, assigned_by)
values ('66666666-6666-6666-6666-666666666666',
        'aaaa0000-0000-0000-0000-000000000001',
        '22222222-2222-2222-2222-222222222222');

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');  -- trustee
select pg_temp.check(
  'handing someone sight of a record is recorded',
  (select count(*) from audit_log
    where entity_type = 'record_grants' and action = 'INSERT'
      and after ->> 'user_id' = '88888888-8888-8888-8888-888888888888'),
  1::bigint);
select pg_temp.check(
  'and so is putting an advocate on a case',
  (select count(*) from audit_log
    where entity_type = 'case_assignments' and action = 'INSERT'
      and after ->> 'user_id' = '66666666-6666-6666-6666-666666666666'),
  1::bigint);
select pg_temp.check(
  'the trail names who did it',
  (select actor_id from audit_log
    where entity_type = 'case_assignments' and action = 'INSERT'
      and after ->> 'user_id' = '66666666-6666-6666-6666-666666666666'),
  '22222222-2222-2222-2222-222222222222'::uuid);

-- ===========================================================================
-- What the client is told about itself
-- ===========================================================================

select pg_temp.act_as('bbbb1111-1111-1111-1111-111111111111');
select pg_temp.check(
  'current_authority names the caller''s own role',
  (public.current_authority() ->> 'role'),
  'trustee'::text);
select pg_temp.check(
  'current_authority includes the role lent to them',
  (public.current_authority() -> 'roles') @> '["project_director"]'::jsonb,
  true);
select pg_temp.check(
  'current_authority says who lent it',
  (public.current_authority() -> 'delegations' -> 0 ->> 'lenderName'),
  'Project Director'::text);

select pg_temp.act_as('77777777-7777-7777-7777-777777777777');  -- contractor
select pg_temp.check(
  'an external role is reported as external',
  (public.current_authority() -> 'isInternal')::text,
  'false'::text);

select set_config('request.jwt.claim.sub', '', false);
select pg_temp.check(
  'and nothing at all is reported to a caller with no profile',
  public.current_authority(),
  null::jsonb);


-- ===========================================================================
-- The console's own operations
-- ===========================================================================
--
-- The console's premise is that it never draws a control the database would
-- refuse. That is only worth anything if the refusals are real, so each one it
-- relies on to decide what to draw is pinned here.

-- The directory is open to everyone signed in, on purpose: hiding who else is
-- in the portal helps nobody, and the names of the project's own stakeholders
-- are not the secret. What they can reach is.
select pg_temp.act_as('77777777-7777-7777-7777-777777777777');  -- contractor
select pg_temp.check(
  'an external party can read the directory',
  (select count(*) > 5 from profiles),
  true);

-- But not anyone else's scope or anyone else's shared records.
select pg_temp.check(
  'an external party sees only their own scope',
  (select count(*) from block_assignments where user_id <> auth.uid()),
  0::bigint);
select pg_temp.check(
  'an external party sees only what was shared with them',
  (select count(*) from record_grants where user_id <> auth.uid()),
  0::bigint);

-- Sharing is the decision that hands someone sight of a confidential record,
-- so it stays with the two roles that classify.
select pg_temp.act_as('44444444-4444-4444-4444-444444444444');  -- field team
do $$
begin
  begin
    insert into record_grants (user_id, entity_type, entity_id, permission, granted_by)
    values ('77777777-7777-7777-7777-777777777777', 'legal_cases',
            'aaaa0000-0000-0000-0000-000000000003', 'read',
            '44444444-4444-4444-4444-444444444444');
    raise exception 'FAIL the field team shared a confidential case';
  exception
    when insufficient_privilege then
      raise notice 'ok   being on the team is not the same as deciding who sees what';
  end;
end;
$$;

do $$
begin
  begin
    insert into case_assignments (user_id, legal_case_id, assigned_by)
    values ('55555555-5555-5555-5555-555555555555',
            'aaaa0000-0000-0000-0000-000000000004',
            '44444444-4444-4444-4444-444444444444');
    raise exception 'FAIL the field team put an advocate on a case';
  exception
    when insufficient_privilege then
      raise notice 'ok   the field team cannot widen anyone''s scope';
  end;
end;
$$;

-- A grant holder cannot pass their access on.
select pg_temp.act_as('55555555-5555-5555-5555-555555555555');  -- advocate one
do $$
begin
  begin
    insert into record_grants (user_id, entity_type, entity_id, permission, granted_by)
    values ('66666666-6666-6666-6666-666666666666', 'legal_cases',
            'aaaa0000-0000-0000-0000-000000000003', 'read',
            '55555555-5555-5555-5555-555555555555');
    raise exception 'FAIL a grant holder passed their access on';
  exception
    when insufficient_privilege then
      raise notice 'ok   a shared record cannot be shared onward by its recipient';
  end;
end;
$$;

-- Revoking a grant is the console's other write on that table, and it is
-- bounded the same way: a delete the policy refuses matches no rows.
select pg_temp.act_as('77777777-7777-7777-7777-777777777777');  -- contractor
do $$
declare n int;
begin
  delete from record_grants
  where user_id = '55555555-5555-5555-5555-555555555555';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL a contractor revoked someone else''s access';
  end if;
  raise notice 'ok   nobody can quietly revoke access they did not grant';
end;
$$;

-- The project director may do both, which is what the console draws for them.
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
insert into record_grants (user_id, entity_type, entity_id, permission, granted_by, expires_at)
values ('77777777-7777-7777-7777-777777777777', 'construction_blocks',
        'bbbb0000-0000-0000-0000-000000000002', 'read',
        '22222222-2222-2222-2222-222222222222', now() + interval '30 days');
select pg_temp.check(
  'the project director may share a record',
  (select count(*) from record_grants
    where user_id = '77777777-7777-7777-7777-777777777777'),
  1::bigint);

-- And the contractor can now reach the block they were never assigned, which
-- is what makes sharing worth having for exactly the roles scope contains.
select pg_temp.act_as('77777777-7777-7777-7777-777777777777');
select pg_temp.check(
  'a shared block reaches a contractor outside their scope',
  (select count(*) from construction_blocks),
  2::bigint);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
delete from record_grants where user_id = '77777777-7777-7777-7777-777777777777';
select pg_temp.act_as('77777777-7777-7777-7777-777777777777');
select pg_temp.check(
  'and revoking takes it straight back',
  (select count(*) from construction_blocks),
  1::bigint);


reset role;

\echo ''
\echo 'All policy tests passed.'
