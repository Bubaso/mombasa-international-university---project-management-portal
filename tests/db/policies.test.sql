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


-- ===========================================================================
-- The stakeholder register (M4)
-- ===========================================================================
--
-- This is the project's political map: who is with us, who influences whom,
-- and what the project privately thinks of them. Clearance alone is not
-- enough to protect it — an advocate and a contractor both hold 'internal'
-- clearance — so it carries a scope rule of its own.

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');  -- trustee
select pg_temp.check('an internal role sees the whole register',
  (select count(*) from stakeholders), 6::bigint);

select pg_temp.act_as('77777777-7777-7777-7777-777777777777');  -- contractor
select pg_temp.check('an external role sees only what was published',
  (select count(*) from stakeholders), 1::bigint);
select pg_temp.check('and that one is the public record',
  (select full_name from stakeholders), 'Community Elder'::text);

-- Not even their own contact record, which carries the influence, interest and
-- stance the project has assigned to them.
select pg_temp.check(
  'a person cannot read the assessment the register makes of them',
  (select count(*) from stakeholders
    where profile_id = '77777777-7777-7777-7777-777777777777'),
  0::bigint);

select pg_temp.check('nor the contact log, at any tier',
  (select count(*) from stakeholder_interactions), 0::bigint);
select pg_temp.check('nor the private assessments',
  (select count(*) from stakeholder_assessments), 0::bigint);

-- Sharing one stakeholder deliberately is the way to widen that.
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- project director
insert into record_grants (user_id, entity_type, entity_id, permission, granted_by) values
  ('55555555-5555-5555-5555-555555555555', 'stakeholders',
   '0b000000-0000-0000-0000-000000000001', 'read',
   '22222222-2222-2222-2222-222222222222');

select pg_temp.act_as('55555555-5555-5555-5555-555555555555');  -- advocate one
select pg_temp.check('a grant opens one stakeholder to an external role',
  (select count(*) from stakeholders), 2::bigint);
select pg_temp.check(
  'but the private assessment of them stays shut',
  (select count(*) from stakeholder_assessments
    where stakeholder_id = '0b000000-0000-0000-0000-000000000001'),
  0::bigint);
-- An edge is only visible when both of its ends are.
select pg_temp.check(
  'and half a relationship is not shown',
  (select count(*) from stakeholder_relationships), 0::bigint);

-- ---------------------------------------------------------------------------
-- How a stance moved (M4-03)
-- ---------------------------------------------------------------------------

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select pg_temp.check('a stance is dated from the moment it is first recorded',
  (select count(*) from stakeholder_stance_changes
    where stakeholder_id = '0b000000-0000-0000-0000-000000000001'),
  1::bigint);

update stakeholders set stance = 'sceptic'
where id = '0b000000-0000-0000-0000-000000000001';

select pg_temp.check('and a change appends rather than overwrites',
  (select count(*) from stakeholder_stance_changes
    where stakeholder_id = '0b000000-0000-0000-0000-000000000001'),
  2::bigint);
select pg_temp.check('the move is recorded both ways round',
  (select from_stance || '→' || to_stance from stakeholder_stance_changes
    where stakeholder_id = '0b000000-0000-0000-0000-000000000001'
      and from_stance is not null),
  'supporter→sceptic'::text);
select pg_temp.check('and it names who moved it',
  (select changed_by from stakeholder_stance_changes
    where stakeholder_id = '0b000000-0000-0000-0000-000000000001'
      and from_stance is not null),
  '22222222-2222-2222-2222-222222222222'::uuid);

-- Written by the trigger, by nobody else. Like the audit log, a history that
-- can be tidied afterwards is worth nothing.
do $$
declare n int;
begin
  begin
    update stakeholder_stance_changes set to_stance = 'champion';
    get diagnostics n = row_count;
    if n <> 0 then
      raise exception 'FAIL a stance history row was edited';
    end if;
    raise notice 'ok   a stance history cannot be rewritten';
  exception
    when insufficient_privilege then
      raise notice 'ok   a stance history cannot be rewritten (refused)';
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- What needs attention (M4-05, M4-07)
-- ---------------------------------------------------------------------------

select pg_temp.check(
  'a stakeholder nobody keeps is flagged',
  (select needs_an_owner from stakeholder_attention
    where id = '0b000000-0000-0000-0000-000000000005'),
  true);
select pg_temp.check(
  'and so is one nobody has spoken to',
  (select has_gone_quiet from stakeholder_attention
    where id = '0b000000-0000-0000-0000-000000000005'),
  true);
select pg_temp.check(
  'a recent conversation is not a warning',
  (select has_gone_quiet from stakeholder_attention
    where id = '0b000000-0000-0000-0000-000000000001'),
  false);
select pg_temp.check(
  'the quiet window narrows as influence rises',
  (select quiet_after_days from stakeholder_attention
    where id = '0b000000-0000-0000-0000-000000000001'),
  30);

-- The view must not become a way around the table's own rules.
select pg_temp.act_as('77777777-7777-7777-7777-777777777777');  -- contractor
select pg_temp.check(
  'the attention view answers to the same policies as the register',
  (select count(*) from stakeholder_attention), 1::bigint);

-- ===========================================================================
-- Meetings, decisions and actions (M3)
-- ===========================================================================

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');  -- trustee
select pg_temp.check('an internal role sees every meeting',
  (select count(*) from meetings), 4::bigint);

select pg_temp.act_as('55555555-5555-5555-5555-555555555555');  -- advocate one
-- Present at the legal meeting, so they read it; and the briefing was
-- published. The trustee session is not theirs and never will be.
select pg_temp.check('being in the room is what an outsider reads a meeting by',
  (select count(*) from meetings), 2::bigint);
select pg_temp.check('the meeting they attended',
  (select count(*) from meetings where id = '0e000000-0000-0000-0000-000000000001'),
  1::bigint);
select pg_temp.check('a session they were not at stays closed',
  (select count(*) from meetings where id = '0e000000-0000-0000-0000-000000000002'),
  0::bigint);
-- Attendance is scope. Scope narrows; it never lifts a clearance ceiling.
select pg_temp.check(
  'attending a meeting above their clearance does not open it',
  (select count(*) from meetings where id = '0e000000-0000-0000-0000-000000000004'),
  0::bigint);

select pg_temp.check('they read the note of the meeting they were at',
  (select count(*) from meeting_notes), 1::bigint);
select pg_temp.check('and the decision that came out of it',
  (select count(*) from decisions), 1::bigint);
select pg_temp.check('they can see who else was in the room',
  (select count(*) from meeting_attendees
    where meeting_id = '0e000000-0000-0000-0000-000000000001'),
  2::bigint);

select pg_temp.act_as('77777777-7777-7777-7777-777777777777');  -- contractor
select pg_temp.check('someone who was at none of them sees only what was published',
  (select count(*) from meetings), 1::bigint);
select pg_temp.check('and no decisions at all',
  (select count(*) from decisions), 0::bigint);

-- ---------------------------------------------------------------------------
-- An action reaches its owner (M3-05, M3-06)
-- ---------------------------------------------------------------------------

-- The contractor cannot see the meeting the action came out of, and must
-- still see what they undertook to do.
select pg_temp.check(
  'an action reaches its owner even when the meeting behind it does not',
  (select count(*) from action_items), 1::bigint);
select pg_temp.check('and it is theirs',
  (select text_en from action_items),
  'Secure the site boundary markers.'::text);

-- Reporting on it is theirs to do.
update action_items set status = 'done' where id = '11000000-0000-0000-0000-000000000001';
select pg_temp.check('the owner may report it finished',
  (select status::text from action_items where id = '11000000-0000-0000-0000-000000000001'),
  'done'::text);
select pg_temp.check('and the closing date is stamped rather than typed',
  (select completed_at is not null from action_items
    where id = '11000000-0000-0000-0000-000000000001'),
  true);

-- Redefining it is not.
do $$
begin
  begin
    update action_items set due_date = current_date + 90
    where id = '11000000-0000-0000-0000-000000000001';
    raise exception 'FAIL an owner moved their own deadline';
  exception
    when insufficient_privilege then
      raise notice 'ok   an owner may report on an action, not redefine it';
  end;
end;
$$;

do $$
begin
  begin
    update action_items
    set owner_stakeholder_id = '0b000000-0000-0000-0000-000000000003'
    where id = '11000000-0000-0000-0000-000000000001';
    raise exception 'FAIL an owner handed their action to someone else';
  exception
    when insufficient_privilege then
      raise notice 'ok   an action cannot be passed on by the person holding it';
  end;
end;
$$;

select pg_temp.check('and someone else''s action stays invisible',
  (select count(*) from action_items where id = '11000000-0000-0000-0000-000000000002'),
  0::bigint);

-- The project director may do both, which is the point of the distinction.
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
update action_items set due_date = current_date + 30
where id = '11000000-0000-0000-0000-000000000001';
select pg_temp.check('whoever runs the meeting may move the date',
  (select due_date = current_date + 30 from action_items
    where id = '11000000-0000-0000-0000-000000000001'),
  true);

-- ---------------------------------------------------------------------------
-- An action must have exactly one owner (M3-05)
-- ---------------------------------------------------------------------------

do $$
begin
  begin
    insert into action_items (text_en, due_date) values ('Nobody''s job', current_date + 1);
    raise exception 'FAIL an action was created with no owner';
  exception
    when check_violation then
      raise notice 'ok   an action with no owner is refused';
  end;
end;
$$;

do $$
begin
  begin
    insert into action_items
      (text_en, due_date, owner_profile_id, owner_stakeholder_id)
    values ('Everyone''s job', current_date + 1,
            '44444444-4444-4444-4444-444444444444',
            '0b000000-0000-0000-0000-000000000004');
    raise exception 'FAIL an action was created with two owners';
  exception
    when check_violation then
      raise notice 'ok   an action shared between two owners is refused';
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Minutes (M3-15)
-- ---------------------------------------------------------------------------

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');  -- trustee
do $$
begin
  begin
    update meeting_notes set body = 'quietly corrected'
    where id = '0f000000-0000-0000-0000-000000000002';
    raise exception 'FAIL a final minute was edited';
  exception
    when insufficient_privilege then
      raise notice 'ok   a minute that has been made final cannot be edited';
  end;
end;
$$;

do $$
begin
  begin
    delete from meeting_notes where id = '0f000000-0000-0000-0000-000000000002';
    raise exception 'FAIL a final minute was deleted';
  exception
    when insufficient_privilege then
      raise notice 'ok   nor deleted';
  end;
end;
$$;

do $$
begin
  begin
    update meetings set minutes_status = 'draft'
    where id = '0e000000-0000-0000-0000-000000000002';
    raise exception 'FAIL final minutes were reopened';
  exception
    when insufficient_privilege then
      raise notice 'ok   nor reopened by putting the meeting back into draft';
  end;
end;
$$;

-- A draft is still a draft.
update meeting_notes set body = 'Appeal timetable, record of appeal, and costs.'
where id = '0f000000-0000-0000-0000-000000000001';
select pg_temp.check('a draft minute is still editable',
  (select body like '%costs.' from meeting_notes
    where id = '0f000000-0000-0000-0000-000000000001'),
  true);

-- ---------------------------------------------------------------------------
-- Who may record a decision
-- ---------------------------------------------------------------------------

select pg_temp.act_as('44444444-4444-4444-4444-444444444444');  -- field team
insert into meetings (id, title, held_at, kind)
values ('0e000000-0000-0000-0000-000000000005', 'Site walk', now(), 'site');
select pg_temp.check('the field team may minute a site meeting',
  (select count(*) from meetings where id = '0e000000-0000-0000-0000-000000000005'),
  1::bigint);

do $$
begin
  begin
    insert into decisions (text_en, organ) values ('We proceed.', 'Board of Trustees');
    raise exception 'FAIL the field team recorded a board decision';
  exception
    when insufficient_privilege then
      raise notice 'ok   minuting a meeting is not the same as taking a decision';
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- The agenda builds itself (M3-07)
-- ---------------------------------------------------------------------------

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');  -- trustee
select pg_temp.check(
  'everything still open lands on the next agenda',
  (select count(*) from meeting_agenda_candidates), 2::bigint);
select pg_temp.check(
  'a finished action drops off it',
  (select count(*) from meeting_agenda_candidates
    where id = '11000000-0000-0000-0000-000000000001'),
  0::bigint);
select pg_temp.check(
  'and an unanswered question is on it alongside the actions',
  (select count(*) from meeting_agenda_candidates where item_kind = 'question'),
  1::bigint);

select pg_temp.act_as('77777777-7777-7777-7777-777777777777');  -- contractor
select pg_temp.check(
  'the agenda view answers to the same policies as its tables',
  (select count(*) from meeting_agenda_candidates), 0::bigint);


-- ===========================================================================
-- Suggestions and provenance (0008)
-- ===========================================================================

-- The suggestion box is internal business, with one exception: whoever made a
-- suggestion can see what happened to it. A box you post into and never hear
-- from again is not a box, it is a bin.
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');  -- trustee
select pg_temp.check('an internal role sees every suggestion',
  (select count(*) from suggestions), 2::bigint);

select pg_temp.act_as('77777777-7777-7777-7777-777777777777');  -- contractor
select pg_temp.check(
  'somebody outside sees the one they proposed, and no others',
  (select count(*) from suggestions), 1::bigint);
select pg_temp.check('and it is theirs',
  (select title from suggestions), 'Invite the county education office'::text);

-- Anyone signed in may propose something — and can then see what became of
-- it, because the proposer defaults to whoever is asking.
insert into suggestions (title, kind)
values ('Ask the surveyor about the boundary markers', 'meeting_topic');
select pg_temp.check('anyone signed in may put something in the box',
  (select count(*) from suggestions), 2::bigint);
select pg_temp.check('and a suggestion box you cannot read back is a bin',
  (select count(*) from suggestions
    where title = 'Ask the surveyor about the boundary markers'),
  1::bigint);

-- Answering one is a decision about the project's own plan.
do $$
declare n int;
begin
  update suggestions set status = 'approved'
  where id = '13000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL a contractor approved their own suggestion';
  end if;
  raise notice 'ok   proposing something is not the same as approving it';
end;
$$;

select pg_temp.act_as('44444444-4444-4444-4444-444444444444');  -- field team
do $$
declare n int;
begin
  update suggestions set status = 'rejected'
  where id = '13000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL the field team answered a suggestion';
  end if;
  raise notice 'ok   nor is being on the team';
end;
$$;

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- project director
update suggestions set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
where id = '13000000-0000-0000-0000-000000000001';
select pg_temp.check('the project director answers it',
  (select status::text from suggestions where id = '13000000-0000-0000-0000-000000000001'),
  'approved'::text);

-- A suggestion with nobody behind it at all is refused. A signed-in caller
-- always has one by default, so this is the case that matters: the import,
-- writing with no session, where the free-text name is the only attribution
-- there is.
do $$
begin
  begin
    insert into suggestions (title, kind, suggested_by_profile_id)
    values ('From nobody', 'other', null);
    raise exception 'FAIL a suggestion with no proposer was accepted';
  exception
    when check_violation then
      raise notice 'ok   a suggestion always says who made it';
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- The import can be run twice
-- ---------------------------------------------------------------------------
--
-- "One time" is about the direction of the migration, not the number of
-- attempts. Nobody gets an import right first go.

select pg_temp.check('an imported record remembers where it came from',
  (select source_url is null and source_id = 'notion-page-id-1' from stakeholders
    where id = '0b000000-0000-0000-0000-000000000006'),
  true);

do $$
begin
  begin
    insert into stakeholders (full_name, category, source_system, source_id)
    values ('Imported Contact (again)', 'other', 'notion', 'notion-page-id-1');
    raise exception 'FAIL the same page was imported twice';
  exception
    when unique_violation then
      raise notice 'ok   the same page cannot arrive twice';
  end;
end;
$$;

-- And records made in the portal, which have no source, are unaffected by it.
insert into stakeholders (full_name, category) values ('Made Here', 'other');
insert into stakeholders (full_name, category) values ('Made Here Too', 'other');
select pg_temp.check(
  'while records made in the portal are unaffected by that rule',
  (select count(*) from stakeholders where source_id is null and full_name like 'Made Here%'),
  2::bigint);


-- ===========================================================================
-- The legal register (M5)
-- ===========================================================================
--
-- M5-16 is the rule everything here turns on: an outside advocate reaches
-- their own files and nothing else — not the other cases, and not the money.
-- Eight tables hang off a case, and they all have to answer the same way.

select pg_temp.act_as('55555555-5555-5555-5555-555555555555');  -- advocate one, on the case
select pg_temp.check('the advocate on a case reads its orders',
  (select count(*) from legal_orders), 1::bigint);
select pg_temp.check('its hearings',
  (select count(*) from hearings), 1::bigint);
select pg_temp.check('its filings',
  (select count(*) from filings), 1::bigint);
select pg_temp.check('its exhibits',
  (select count(*) from exhibits), 1::bigint);
select pg_temp.check('and the chain of custody behind them',
  (select count(*) from exhibit_custody), 1::bigint);

select pg_temp.act_as('66666666-6666-6666-6666-666666666666');  -- advocate two, on nothing
select pg_temp.check('an advocate on another matter reads none of it',
  (select count(*) from legal_orders)
  + (select count(*) from hearings)
  + (select count(*) from filings)
  + (select count(*) from exhibits)
  + (select count(*) from exhibit_custody),
  0::bigint);

-- Writing on your own file is the reason an advocate has an account at all.
select pg_temp.act_as('55555555-5555-5555-5555-555555555555');
insert into filings (legal_case_id, kind, title, due_on, state)
values ('aaaa0000-0000-0000-0000-000000000002', 'submission', 'Written submissions',
        current_date + 12, 'drafting');
select pg_temp.check('the advocate on a case may file on it',
  (select count(*) from filings), 2::bigint);

-- But not on somebody else's.
select pg_temp.act_as('66666666-6666-6666-6666-666666666666');
do $$
begin
  begin
    insert into filings (legal_case_id, kind, title, state)
    values ('aaaa0000-0000-0000-0000-000000000002', 'submission', 'Not mine', 'planned');
    raise exception 'FAIL an advocate filed on a case they are not on';
  exception
    when insufficient_privilege then
      raise notice 'ok   an advocate cannot act on a file that is not theirs';
  end;
end;
$$;

-- Nor put themselves on record: who represents the project is the project's
-- decision.
select pg_temp.act_as('55555555-5555-5555-5555-555555555555');
do $$
begin
  begin
    insert into case_counsel (legal_case_id, stakeholder_id, state)
    values ('aaaa0000-0000-0000-0000-000000000001',
            '0b000000-0000-0000-0000-000000000003', 'on_record');
    raise exception 'FAIL an advocate put themselves on record';
  exception
    when insufficient_privilege then
      raise notice 'ok   who is on record is not the advocate''s to decide';
  end;
end;
$$;

-- A filing that claims to have been made says when.
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
do $$
begin
  begin
    insert into filings (legal_case_id, kind, title, state)
    values ('aaaa0000-0000-0000-0000-000000000002', 'notice', 'Filed, apparently', 'filed');
    raise exception 'FAIL a filing claimed to be filed with no date';
  exception
    when check_violation then
      raise notice 'ok   a filing cannot say it was made without saying when';
  end;
end;
$$;

-- The chain of custody is evidence about evidence.
select pg_temp.act_as('55555555-5555-5555-5555-555555555555');
do $$
begin
  begin
    update exhibit_custody set to_party = 'someone else'
    where id = '18000000-0000-0000-0000-000000000001';
    raise exception 'FAIL a chain of custody entry was edited';
  exception
    when insufficient_privilege then
      raise notice 'ok   a chain of custody cannot be rewritten';
  end;
end;
$$;

do $$
begin
  begin
    delete from exhibit_custody where id = '18000000-0000-0000-0000-000000000001';
    raise exception 'FAIL a chain of custody entry was deleted';
  exception
    when insufficient_privilege then
      raise notice 'ok   nor broken by deleting a link from it';
  end;
end;
$$;

-- ===========================================================================
-- The obligations register (M2)
-- ===========================================================================

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');  -- trustee
-- Lease, court order, contract and a promise made in a meeting, in one list.
-- That is the whole idea: they are the same kind of thing.
select pg_temp.check('the register holds every source together',
  (select count(distinct source) from obligations), 4::bigint);

-- ---------------------------------------------------------------------------
-- M2-02: verified means a document is attached, and nothing else
-- ---------------------------------------------------------------------------

select pg_temp.check(
  'an obligation with no paper behind it is marked unverified',
  (select bool_and(not verified) from obligations), true);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- project director
do $$
begin
  begin
    update obligations set verified = true
    where id = '19000000-0000-0000-0000-000000000001';
    raise exception 'FAIL verified was set by hand';
  exception
    when others then
      raise notice 'ok   verified is computed from the document, not asserted';
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- M2-04: done without evidence is a claim, not a record
-- ---------------------------------------------------------------------------

do $$
begin
  begin
    update obligations set state = 'fulfilled'
    where id = '19000000-0000-0000-0000-000000000001';
    raise exception 'FAIL an obligation was fulfilled with no evidence';
  exception
    when insufficient_privilege then
      raise notice 'ok   an obligation cannot be closed without evidence';
  end;
end;
$$;

insert into obligation_evidence (obligation_id, description, observed_on)
values ('19000000-0000-0000-0000-000000000001', 'Foundation laid; photographs filed',
        current_date);
update obligations set state = 'fulfilled'
where id = '19000000-0000-0000-0000-000000000001';
select pg_temp.check('and can once there is some',
  (select state::text from obligations where id = '19000000-0000-0000-0000-000000000001'),
  'fulfilled'::text);

-- ---------------------------------------------------------------------------
-- M2-01: a court order obligation names its order
-- ---------------------------------------------------------------------------

do $$
begin
  begin
    insert into obligations (title_en, source, obligor_name)
    values ('Something a court said, apparently', 'court_order', 'AUTK');
    raise exception 'FAIL a court-order obligation was recorded with no order';
  exception
    when check_violation then
      raise notice 'ok   an obligation from a court names the order it came from';
  end;
end;
$$;

do $$
begin
  begin
    insert into obligations (title_en, source, obligor_name)
    values ('Somebody promised something', 'personal_commitment', 'The Minister');
    raise exception 'FAIL a commitment was recorded with no meeting';
  exception
    when check_violation then
      raise notice 'ok   and a promise names the meeting it was made in';
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- M2-07: who may write which kind
-- ---------------------------------------------------------------------------

select pg_temp.act_as('44444444-4444-4444-4444-444444444444');  -- field team
insert into obligations
  (title_en, source, source_meeting_id, obligor_name, obligor_stakeholder_id)
values ('Walk the boundary with the surveyor', 'personal_commitment',
        '0e000000-0000-0000-0000-000000000001', 'Contractor Lead',
        '0b000000-0000-0000-0000-000000000004');
select pg_temp.check(
  'whoever is minuting can write down a promise while it is being made',
  (select count(*) from obligations where source = 'personal_commitment'), 4::bigint);

do $$
begin
  begin
    insert into obligations (title_en, source, obligor_name)
    values ('Something the lease requires', 'lease', 'AUTK');
    raise exception 'FAIL the field team declared a lease obligation';
  exception
    when insufficient_privilege then
      raise notice 'ok   but what the lease requires is not theirs to declare';
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- An obligor outside the organisation
-- ---------------------------------------------------------------------------

select pg_temp.act_as('77777777-7777-7777-7777-777777777777');  -- contractor
select pg_temp.check(
  'somebody outside sees what they owe, and only that',
  (select count(*) from obligations), 2::bigint);
select pg_temp.check('one of them being the one they undertook',
  (select count(*) from obligations
    where id = '19000000-0000-0000-0000-000000000006'),
  1::bigint);

-- And can show that they did it, which is the part that matters to them.
insert into obligation_evidence (obligation_id, description, observed_on)
values ('19000000-0000-0000-0000-000000000006', 'Markers reset and photographed',
        current_date);
select pg_temp.check('and may put evidence against it',
  (select count(*) from obligation_evidence
    where obligation_id = '19000000-0000-0000-0000-000000000006'),
  1::bigint);

-- Declaring it done is somebody else's call.
do $$
declare n int;
begin
  update obligations set state = 'fulfilled'
  where id = '19000000-0000-0000-0000-000000000006';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL an obligor closed their own obligation';
  end if;
  raise notice 'ok   showing you did it is not the same as being signed off';
end;
$$;

-- ---------------------------------------------------------------------------
-- M2-06: proceeding anyway is recorded, not prevented
-- ---------------------------------------------------------------------------

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');  -- trustee
select pg_temp.check('a live prohibition is findable before work is opened',
  (select count(*) from active_prohibitions), 1::bigint);

insert into obligation_overrides
  (id, obligation_id, construction_block_id, note_of_what, reason, acknowledged_by)
values ('1a000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000003',
        'bbbb0000-0000-0000-0000-000000000001',
        'Continuing structural work on Block A1',
        'Board decided unanimously that preservation outweighs the risk.',
        '33333333-3333-3333-3333-333333333333');
select pg_temp.check('and proceeding in spite of it is recorded rather than blocked',
  (select count(*) from obligation_overrides), 1::bigint);

do $$
begin
  begin
    update obligation_overrides set reason = 'never mind'
    where id = '1a000000-0000-0000-0000-000000000001';
    raise exception 'FAIL a recorded override was edited';
  exception
    when insufficient_privilege then
      raise notice 'ok   a deliberate risk cannot be unrecorded afterwards';
  end;
end;
$$;

-- Somebody has to put their own name to it.
select pg_temp.act_as('44444444-4444-4444-4444-444444444444');  -- field team
do $$
begin
  begin
    insert into obligation_overrides
      (obligation_id, note_of_what, reason, acknowledged_by)
    values ('19000000-0000-0000-0000-000000000003', 'Carrying on',
            'It seemed fine', '33333333-3333-3333-3333-333333333333');
    raise exception 'FAIL an override was recorded in somebody else''s name';
  exception
    when insufficient_privilege then
      raise notice 'ok   an override carries the name of whoever took it';
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- M2-08: of what somebody undertook, how much did they do
-- ---------------------------------------------------------------------------

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select pg_temp.check('the register counts what a person undertook',
  (select undertaken from stakeholder_commitments
    where stakeholder_id = '0b000000-0000-0000-0000-000000000001'),
  3::bigint);
select pg_temp.check('and what became of it',
  (select kept || '/' || broken || '/' || outstanding from stakeholder_commitments
    where stakeholder_id = '0b000000-0000-0000-0000-000000000001'),
  '1/1/1'::text);
-- Settled one way or the other, not counting the open ones: otherwise the
-- number measures how long you have been waiting, not the person.
select pg_temp.check('as a rate over what is settled, not over what is pending',
  (select kept_percent from stakeholder_commitments
    where stakeholder_id = '0b000000-0000-0000-0000-000000000001'),
  50::numeric);
select pg_temp.check(
  'and nothing settled reads as unknown rather than as zero',
  (select kept_percent is null from stakeholder_commitments
    where stakeholder_id = '0b000000-0000-0000-0000-000000000004'),
  true);

-- ---------------------------------------------------------------------------
-- M2-09: the reminder bands
-- ---------------------------------------------------------------------------

select pg_temp.check('an obligation due this week is in the seven-day band',
  (select threshold_days from obligation_deadlines
    where id = '19000000-0000-0000-0000-000000000004'),
  7);
select pg_temp.check('one due next month is in the sixty-day band',
  (select threshold_days from obligation_deadlines
    where id = '19000000-0000-0000-0000-000000000001' or
          id = '19000000-0000-0000-0000-000000000006'
    order by due_on limit 1),
  30);
select pg_temp.check('and a closed one has left the list',
  (select count(*) from obligation_deadlines
    where id = '19000000-0000-0000-0000-000000000007'),
  0::bigint);


-- ===========================================================================
-- One calendar over everything with a date (M15-03)
-- ===========================================================================
--
-- The view reads six tables at once, which makes it the easiest place in the
-- schema to accidentally build a way around all six. security_invoker is what
-- stops that, and this is the proof.
--
-- These assert the rule rather than the arithmetic: the counts here depend on
-- what the tests above have already changed, and a calendar test that breaks
-- when an unrelated test files a document is a test about the fixture.

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');  -- trustee
select pg_temp.check('the calendar draws from every register at once',
  (select count(distinct kind) from project_calendar), 6::bigint);

-- Overdue is shown, never hidden: a deadline that has passed is exactly the
-- one somebody has to see.
select pg_temp.check('everything past its date is flagged, and only that',
  (select count(*) from project_calendar where needs_attention and not (due_on < current_date)),
  0::bigint);

-- --- and the part that matters: it is not a hole in the registers ---------

select pg_temp.act_as('55555555-5555-5555-5555-555555555555');  -- advocate one
select pg_temp.check(
  'an advocate sees the court dates on their own file',
  (select count(*) > 0 from project_calendar where kind in ('hearing', 'filing')),
  true);

select pg_temp.act_as('66666666-6666-6666-6666-666666666666');  -- advocate two
select pg_temp.check(
  'and an advocate on no case sees nothing at all',
  (select count(*) from project_calendar), 0::bigint);

select pg_temp.act_as('77777777-7777-7777-7777-777777777777');  -- contractor
select pg_temp.check('the contractor sees the obligation that is theirs',
  (select count(*) from project_calendar
    where kind = 'obligation' and id = '19000000-0000-0000-0000-000000000006'),
  1::bigint);
select pg_temp.check(
  'and no court date belonging to anybody else',
  (select count(*) from project_calendar where kind in ('hearing', 'filing')),
  0::bigint);

-- Structural, so it holds whatever the fixtures become: every obligation on
-- an external party's calendar is one they owe.
select pg_temp.check(
  'every dated thing they can see is something of their own',
  (select count(*) from project_calendar c
    where c.kind = 'obligation'
      and not exists (
        select 1 from obligations o
        where o.id = c.id
          and o.obligor_stakeholder_id = '0b000000-0000-0000-0000-000000000004')),
  0::bigint);

-- ===========================================================================
-- The document vault (M9)
-- ===========================================================================
--
-- The module this replaces claimed encryption and a verified digest on a
-- screen with no file upload. The claims are now properties the database
-- either enforces or does not let anyone assert.

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');  -- trustee

-- ---------------------------------------------------------------------------
-- M9-02: the digest is computed, never stated
-- ---------------------------------------------------------------------------
--
-- Not a policy and not a trigger: `authenticated` has no privilege on the
-- column, so there is no expression to get wrong.

do $$
begin
  begin
    insert into document_versions
      (document_id, storage_path, file_name, sha256, digest_computed_at)
    values ('1b000000-0000-0000-0000-000000000001', 'made/up/path', 'claimed.pdf',
            'deadbeef', now());
    raise exception 'FAIL a client wrote the digest';
  exception
    when insufficient_privilege then
      raise notice 'ok   a client cannot state a digest, only the server computes one';
  end;
end;
$$;

select pg_temp.check(
  'a version whose digest has not been computed says so rather than nothing',
  (select sha256 is null from document_versions
    where id = '1c000000-0000-0000-0000-000000000003'),
  true);

-- ---------------------------------------------------------------------------
-- M9-04: a version is written once, and superseded rather than replaced
-- ---------------------------------------------------------------------------

select pg_temp.check('the newest upload is the one in force',
  (select current_version_id from document_vault
    where id = '1b000000-0000-0000-0000-000000000001'),
  '1c000000-0000-0000-0000-000000000002'::uuid);

select pg_temp.check('and the one it replaced is still there',
  (select count(*) from document_versions
    where document_id = '1b000000-0000-0000-0000-000000000001'),
  2::bigint);

select pg_temp.check('numbered in the order they arrived',
  (select string_agg(version_no::text, ',' order by version_no)
    from document_versions where document_id = '1b000000-0000-0000-0000-000000000001'),
  '1,2'::text);

do $$
begin
  begin
    update document_versions set file_name = 'renamed.pdf'
    where id = '1c000000-0000-0000-0000-000000000001';
    raise exception 'FAIL a version was edited';
  exception
    when insufficient_privilege then
      raise notice 'ok   a version cannot be edited after it is written';
  end;
end;
$$;

do $$
begin
  begin
    delete from document_versions where id = '1c000000-0000-0000-0000-000000000001';
    raise exception 'FAIL a version was deleted';
  exception
    when insufficient_privilege then
      raise notice 'ok   nor deleted, however many newer ones there are';
  end;
end;
$$;

-- A trustee reads the vault but does not fill it: writing documents is the
-- operational set from 0003 (app.can_write), the same rule that governs the
-- document record itself. A trustee who needs one in asks the director.
do $$
begin
  begin
    insert into document_versions (document_id, storage_path, file_name)
    values ('1b000000-0000-0000-0000-000000000001', 'trustee/upload', 'board.pdf');
    raise exception 'FAIL a trustee uploaded into the vault';
  exception
    when insufficient_privilege then
      raise notice 'ok   reading the vault is not the same as filling it';
  end;
end;
$$;

-- A new upload is how a document changes, and it takes over as the one in
-- force without anyone having to remember to say so.
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- project director
insert into document_versions (id, document_id, storage_path, file_name)
values ('1c000000-0000-0000-0000-000000000004', '1b000000-0000-0000-0000-000000000001',
        '1b000000-0000-0000-0000-000000000001/1c000000-0000-0000-0000-000000000004',
        'title-copy-v3.pdf');

select pg_temp.check('a new upload becomes the version in force by itself',
  (select current_version_id from document_vault
    where id = '1b000000-0000-0000-0000-000000000001'),
  '1c000000-0000-0000-0000-000000000004'::uuid);
select pg_temp.check('and is numbered after the last',
  (select version_no from document_versions
    where id = '1c000000-0000-0000-0000-000000000004'),
  3);
select pg_temp.check('arriving unverified, because nothing has read the bytes yet',
  (select sha256 is null from document_versions
    where id = '1c000000-0000-0000-0000-000000000004'),
  true);

-- ---------------------------------------------------------------------------
-- M9-07: the access log is not something a client can decline to write
-- ---------------------------------------------------------------------------

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');  -- trustee
do $$
begin
  begin
    insert into document_access (document_id, profile_id, action)
    values ('1b000000-0000-0000-0000-000000000001', auth.uid(), 'downloaded');
    raise exception 'FAIL a client wrote its own access record';
  exception
    when insufficient_privilege then
      raise notice 'ok   only the server records a reading, so it cannot be skipped';
  end;
end;
$$;

do $$
begin
  begin
    delete from document_access;
    raise exception 'FAIL an access record was deleted';
  exception
    when insufficient_privilege then
      raise notice 'ok   and what was read cannot be unread afterwards';
  end;
end;
$$;

select pg_temp.check('those who answer for the project can see who read what',
  (select count(*) > 0 from document_access), true);

-- ---------------------------------------------------------------------------
-- M9-06: a version is visible exactly when its document is
-- ---------------------------------------------------------------------------

select pg_temp.act_as('44444444-4444-4444-4444-444444444444');  -- field team
select pg_temp.check(
  'somebody below the tier sees neither the restricted document nor its versions',
  (select count(*) from document_versions
    where document_id = '1b000000-0000-0000-0000-000000000002'),
  0::bigint);
select pg_temp.check('while the one they may read brings its versions with it',
  (select count(*) from document_versions
    where document_id = '1b000000-0000-0000-0000-000000000001') > 0,
  true);

select pg_temp.act_as('77777777-7777-7777-7777-777777777777');  -- contractor
select pg_temp.check(
  'and somebody outside sees only their own reading history',
  (select count(*) from document_access), 0::bigint);


reset role;

\echo ''
\echo 'All policy tests passed.'
