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
  (select count(*) from stakeholders), 5::bigint);

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


reset role;

\echo ''
\echo 'All policy tests passed.'
