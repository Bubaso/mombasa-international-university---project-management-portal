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
  update construction_blocks set name = 'Renamed by somebody else'
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
-- Targeted deadlines: replaced rather than removed
-- ===========================================================================
--
-- Two assertions used to live here, over deadline_notifications and its
-- target_roles array. 0024 drops that table, so they are gone with it — and
-- the reason is worth recording rather than leaving as a silent deletion.
--
-- It held dates somebody typed, with no record behind them, and decided who
-- saw them from an array of roles rather than from the policies. Both halves
-- were the thing Faz 0 spent itself removing: a date with no query behind it,
-- and a second access mechanism weaker than the first.
--
-- What falls due now comes from project_calendar, computed from eight
-- registers, and the equivalent assertions are stronger because they test
-- the policies rather than an array: see "the calendar draws from every
-- register at once", "an advocate sees the court dates on their own file"
-- and "an advocate on no case sees nothing at all" further down.

select pg_temp.check('the hand-typed deadline register is gone',
  (select count(*) from pg_tables
    where schemaname = 'public' and tablename = 'deadline_notifications'), 0::bigint);

-- ===========================================================================
-- Threads
-- ===========================================================================

-- Named rather than counted: 0027 adds channel fixtures of its own further
-- down, and a bare count(*) here would start measuring those instead of the
-- clearance rule these two assertions are about.
select pg_temp.act_as('44444444-4444-4444-4444-444444444444');  -- field team
select pg_temp.check('field team does not see the restricted thread',
  (select count(*) from communication_threads
    where id in ('dddd0000-0000-0000-0000-000000000001',
                 'dddd0000-0000-0000-0000-000000000002')), 1::bigint);

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');  -- trustee
select pg_temp.check('trustee sees both threads',
  (select count(*) from communication_threads
    where id in ('dddd0000-0000-0000-0000-000000000001',
                 'dddd0000-0000-0000-0000-000000000002')), 2::bigint);

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
    insert into financial_transactions (reference_no, date, category, amount, confidentiality)
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
insert into financial_transactions (reference_no, date, category, amount, confidentiality)
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
    insert into financial_transactions (reference_no, date, category, amount, confidentiality)
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
-- Seven since a donor with an account of their own was seeded, so M8-12's
-- "the donor reads their own report" could be checked rather than asserted.
select pg_temp.check('an internal role sees the whole register',
  (select count(*) from stakeholders), 7::bigint);

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


-- ===========================================================================
-- The site: progress, inspection, quantities, valuations (M7)
-- ===========================================================================

select pg_temp.act_as('44444444-4444-4444-4444-444444444444');  -- field team

-- M7-03. The whole design of this table is the not-null on document_id: there
-- is no route to a percentage that does not also carry what it rests on.
do $$
begin
  begin
    insert into task_progress (site_task_id, percent_complete)
    values ('1c000000-0000-0000-0000-000000000030', 40);
    raise exception 'FAIL progress was recorded with no evidence';
  exception
    when not_null_violation then
      raise notice 'ok   a percentage cannot be recorded without the evidence for it';
  end;
end;
$$;

insert into task_progress (site_task_id, percent_complete, document_id, captured_at, note)
values ('1c000000-0000-0000-0000-000000000030', 40,
        '1b000000-0000-0000-0000-000000000001', now() - interval '2 days',
        'Raft poured to gridline 4');

select pg_temp.check('and with it, the report stands',
  (select count(*) from task_progress
    where site_task_id = '1c000000-0000-0000-0000-000000000030'), 1::bigint);

-- What the block is at is computed from that, not typed on the block.
select pg_temp.check('a block is at what its evidence says it is at',
  (select percent_complete from block_progress
    where construction_block_id = 'bbbb0000-0000-0000-0000-000000000001'), 40);

select pg_temp.check('and one nobody has reported on reads as unknown, not as nought',
  (select percent_complete from block_progress
    where construction_block_id = 'bbbb0000-0000-0000-0000-000000000002'), null::int);

-- M7-11. Preservation is counted apart, so money spent stopping a slab from
-- failing never reads as the project having advanced.
select pg_temp.check('preservation work is counted apart from construction',
  (select preservation_tasks from block_progress
    where construction_block_id = 'bbbb0000-0000-0000-0000-000000000001'), 1::bigint);

do $$
begin
  begin
    insert into site_tasks (work_package_id, title_en, kind)
    values ('1c000000-0000-0000-0000-000000000020', 'Unexplained protection works',
            'preservation');
    raise exception 'FAIL preservation work was opened with no reason';
  exception
    when check_violation then
      raise notice 'ok   preservation work has to say what justifies it';
  end;
end;
$$;

-- A history that can be tidied afterwards is not a history.
do $$
declare
  n int;
begin
  begin
    update task_progress set percent_complete = 95
    where site_task_id = '1c000000-0000-0000-0000-000000000030';
    get diagnostics n = row_count;
    if n <> 0 then
      raise exception 'FAIL a progress report was edited after the fact';
    end if;
  exception
    when insufficient_privilege then
      null;
  end;
  raise notice 'ok   a progress report cannot be revised afterwards';
end;
$$;

do $$
declare
  n int;
begin
  begin
    delete from task_progress where site_task_id = '1c000000-0000-0000-0000-000000000030';
    get diagnostics n = row_count;
    if n <> 0 then
      raise exception 'FAIL a progress report was deleted';
    end if;
  exception
    when insufficient_privilege then
      null;
  end;
  raise notice 'ok   nor withdrawn once it is filed';
end;
$$;

-- M7-10. The firm reports on its own work.
select pg_temp.act_as('77777777-7777-7777-7777-777777777777');  -- contractor

insert into task_progress (site_task_id, percent_complete, document_id)
values ('1c000000-0000-0000-0000-000000000030', 55,
        '1b000000-0000-0000-0000-000000000001');

select pg_temp.check('the firm reports progress on the block it is on',
  (select percent_complete from block_progress
    where construction_block_id = 'bbbb0000-0000-0000-0000-000000000001'), 55);

do $$
declare
  n int;
begin
  begin
    insert into task_progress (site_task_id, percent_complete, document_id)
    values ('1c000000-0000-0000-0000-000000000032', 10,
            '1b000000-0000-0000-0000-000000000001');
    raise exception 'FAIL contractor reported on a block they are not on';
  exception
    when insufficient_privilege then
      raise notice 'ok   and on no other block, because it is not their work';
  end;
end;
$$;

select pg_temp.check('nor can they see a block they were never assigned',
  (select count(*) from site_tasks
    where id = '1c000000-0000-0000-0000-000000000032'), 0::bigint);

-- M7-06. A live prohibition reaching the block surfaces against the open work.
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- director

select pg_temp.check('open work under a live prohibition is findable',
  (select count(*) from site_task_conflicts
    where site_task_id = '1c000000-0000-0000-0000-000000000030') > 0, true);

-- A second order, raised here rather than in the fixtures so that what it
-- proves is the transition and not an arithmetic about the seed: the M2-06
-- case above has already acknowledged the first one.
insert into obligations
  (id, title_en, source, source_legal_order_id, obligor_name, state, prohibits, confidentiality)
values ('1c000000-0000-0000-0000-000000000070',
        'Do not break ground on the second block', 'court_order',
        '14000000-0000-0000-0000-000000000001', 'AUTK', 'open', true, 'internal');

insert into obligation_blocks (obligation_id, construction_block_id)
values ('1c000000-0000-0000-0000-000000000070', 'bbbb0000-0000-0000-0000-000000000002');

select pg_temp.check('and reads as unacknowledged until somebody says otherwise',
  (select acknowledged from site_task_conflicts
    where obligation_id = '1c000000-0000-0000-0000-000000000070'), false);

insert into obligation_overrides
  (obligation_id, site_task_id, note_of_what, reason, acknowledged_by)
values ('1c000000-0000-0000-0000-000000000070',
        '1c000000-0000-0000-0000-000000000032',
        'Setting out continues on Block B2',
        'Resolved unanimously at the April sitting; the programme cannot absorb another season.',
        '22222222-2222-2222-2222-222222222222');

select pg_temp.check('proceeding in spite of it is recorded rather than blocked',
  (select acknowledged from site_task_conflicts
    where obligation_id = '1c000000-0000-0000-0000-000000000070'), true);

-- M7-04. An inspection report is evidence, so signing it fixes it.
insert into site_inspections
  (id, construction_block_id, inspected_on, inspector_profile_id, summary_en)
values ('1c000000-0000-0000-0000-000000000040', 'bbbb0000-0000-0000-0000-000000000001',
        current_date - 1, '22222222-2222-2222-2222-222222222222',
        'Walked the raft and the sheeting.');

insert into inspection_findings
  (id, site_inspection_id, description_en, is_nonconformity, severity)
values ('1c000000-0000-0000-0000-000000000041', '1c000000-0000-0000-0000-000000000040',
        'Cover to reinforcement short in two bays', true, 4);

update site_inspections
set signed_off_at = now(), signed_off_by = '22222222-2222-2222-2222-222222222222'
where id = '1c000000-0000-0000-0000-000000000040';

do $$
begin
  begin
    update site_inspections set signed_off_at = null, signed_off_by = null
    where id = '1c000000-0000-0000-0000-000000000040';
    raise exception 'FAIL a signed inspection was unsigned';
  exception
    when insufficient_privilege then
      raise notice 'ok   a signed inspection report cannot be unsigned';
  end;
end;
$$;

do $$
begin
  begin
    update site_inspections set summary_en = 'Everything was fine'
    where id = '1c000000-0000-0000-0000-000000000040';
    raise exception 'FAIL a signed inspection was rewritten';
  exception
    when insufficient_privilege then
      raise notice 'ok   nor rewritten after the fact';
  end;
end;
$$;

do $$
begin
  begin
    update inspection_findings set severity = 1
    where id = '1c000000-0000-0000-0000-000000000041';
    raise exception 'FAIL a finding on a signed report was softened';
  exception
    when insufficient_privilege then
      raise notice 'ok   and a finding on it cannot be softened';
  end;
end;
$$;

-- Closing a finding out is not editing the report: the finding stands, and
-- what is added is what was done about it.
update inspection_findings
set resolved_at = now(), resolution_note = 'Bays broken out and recast; re-inspected.'
where id = '1c000000-0000-0000-0000-000000000041';

select pg_temp.check('though what was done about it can still be recorded',
  (select resolved_at is not null from inspection_findings
    where id = '1c000000-0000-0000-0000-000000000041'), true);

-- M7-07. The bill of quantities, which used to live in component state and
-- was gone on reload.
select pg_temp.act_as('cccc1111-1111-1111-1111-111111111111');  -- quantity surveyor

insert into boq_versions (id, construction_block_id, currency)
values ('1c000000-0000-0000-0000-000000000050', 'bbbb0000-0000-0000-0000-000000000001', 'KES');

select pg_temp.check('a bill of quantities is numbered by the database',
  (select version_no from boq_versions where id = '1c000000-0000-0000-0000-000000000050'), 1);

insert into boq_items
  (boq_version_id, description_en, unit, quantity, unit_rate)
values ('1c000000-0000-0000-0000-000000000050', 'Mass concrete in raft', 'm3', 120, 18500);

select pg_temp.check('and a line total is computed, never stated',
  (select amount from boq_items where boq_version_id = '1c000000-0000-0000-0000-000000000050'),
  2220000.00::numeric(16, 2));

select pg_temp.check('which the total reads straight off',
  (select total from boq_totals where boq_version_id = '1c000000-0000-0000-0000-000000000050'),
  2220000.00::numeric(16, 2));

update boq_versions set state = 'issued' where id = '1c000000-0000-0000-0000-000000000050';

do $$
begin
  begin
    update boq_items set unit_rate = 12000
    where boq_version_id = '1c000000-0000-0000-0000-000000000050';
    raise exception 'FAIL an issued bill of quantities was repriced in place';
  exception
    when insufficient_privilege then
      raise notice 'ok   an issued bill of quantities is repriced by raising another';
  end;
end;
$$;

do $$
begin
  begin
    update boq_versions set state = 'draft' where id = '1c000000-0000-0000-0000-000000000050';
    raise exception 'FAIL an issued bill of quantities went back to draft';
  exception
    when insufficient_privilege then
      raise notice 'ok   and cannot quietly go back to being a draft';
  end;
end;
$$;

-- M7-08. Two signatures, in order, belonging to two people.
insert into valuations
  (id, construction_block_id, contractor_id, period_start, period_end, amount, currency)
values ('1c000000-0000-0000-0000-000000000060', 'bbbb0000-0000-0000-0000-000000000001',
        '1c000000-0000-0000-0000-000000000010', current_date - 30, current_date, 1850000, 'KES');

do $$
begin
  begin
    update valuations
    set director_approved_by = '22222222-2222-2222-2222-222222222222',
        director_approved_at = now()
    where id = '1c000000-0000-0000-0000-000000000060';
    raise exception 'FAIL a valuation was approved before it was measured';
  exception
    when check_violation then
      raise notice 'ok   a valuation cannot be approved before it is certified';
  end;
end;
$$;

update valuations
set qs_certified_by = 'cccc1111-1111-1111-1111-111111111111',
    qs_certified_at = now(),
    state = 'qs_certified'
where id = '1c000000-0000-0000-0000-000000000060';

do $$
begin
  begin
    update valuations
    set director_approved_by = 'cccc1111-1111-1111-1111-111111111111',
        director_approved_at = now()
    where id = '1c000000-0000-0000-0000-000000000060';
    raise exception 'FAIL one person was both signatures';
  exception
    when check_violation then
      raise notice 'ok   and the two signatures cannot be the same person';
  end;
end;
$$;

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- director

do $$
begin
  begin
    update valuations set state = 'paid' where id = '1c000000-0000-0000-0000-000000000060';
    raise exception 'FAIL a valuation was paid before approval';
  exception
    when check_violation then
      raise notice 'ok   nor paid before it is approved';
  end;
end;
$$;

update valuations
set director_approved_by = '22222222-2222-2222-2222-222222222222',
    director_approved_at = now(),
    state = 'director_approved'
where id = '1c000000-0000-0000-0000-000000000060';

select pg_temp.check('with both, the valuation stands approved',
  (select state::text from valuations where id = '1c000000-0000-0000-0000-000000000060'),
  'director_approved');

-- M7-10, the other half. The firm on the block reports progress and reads its
-- own work; what it is being paid, and what the job was priced at, are not
-- its to read here.
select pg_temp.act_as('77777777-7777-7777-7777-777777777777');  -- contractor

select pg_temp.check('the firm sees the work packages on its own block',
  (select count(*) from work_packages
    where construction_block_id = 'bbbb0000-0000-0000-0000-000000000001'), 1::bigint);

select pg_temp.check('but not the bill of quantities behind them',
  (select count(*) from boq_versions), 0::bigint);

select pg_temp.check('nor the lines in it',
  (select count(*) from boq_items), 0::bigint);

select pg_temp.check('nor the valuations raised against them',
  (select count(*) from valuations), 0::bigint);

select pg_temp.check('while the surveyor, whose job that is, reads all three',
  (select count(*) from site_tasks
    where work_package_id = '1c000000-0000-0000-0000-000000000020'), 2::bigint);

select pg_temp.act_as('cccc1111-1111-1111-1111-111111111111');  -- quantity surveyor
select pg_temp.check('the surveyor reads the commercial papers on their block',
  (select count(*) from boq_versions) > 0 and (select count(*) from valuations) > 0, true);


-- ===========================================================================
-- Being locked out is answerable (M1-01)
-- ===========================================================================
--
-- The expired consultant is the case this exists for: their access ran out,
-- so app.current_clearance() is null, so every policy in the schema closes on
-- them — including, before 0014, the one on the row that says why.

select pg_temp.act_as('99999999-9999-9999-9999-999999999999');  -- expired

select pg_temp.check('somebody whose access ran out can still read their own row',
  (select count(*) from profiles
    where id = '99999999-9999-9999-9999-999999999999'), 1::bigint);

select pg_temp.check('and can see that it is the date, not a missing profile',
  (select expires_at < now() from profiles
    where id = '99999999-9999-9999-9999-999999999999'), true);

select pg_temp.check('while still seeing nobody else in the directory',
  (select count(*) from profiles
    where id <> '99999999-9999-9999-9999-999999999999'), 0::bigint);

select pg_temp.check('and nothing else in the portal at all',
  (select count(*) from legal_cases) + (select count(*) from construction_blocks)
    + (select count(*) from document_vault), 0::bigint);

-- Reading it is not the same as being able to fix it. The self-update policy
-- compares against app.current_profile(), which is empty for this caller, so
-- the check cannot pass however the row is addressed.
do $$
declare
  n int;
begin
  begin
    update profiles set expires_at = now() + interval '1 year'
    where id = '99999999-9999-9999-9999-999999999999';
    get diagnostics n = row_count;
    if n <> 0 then
      raise exception 'FAIL an expired profile extended itself';
    end if;
  exception
    when insufficient_privilege then
      null;
  end;
  raise notice 'ok   but cannot extend its own access by reading it';
end;
$$;


-- ===========================================================================
-- Money: the budget, the vouchers, the badge, the pledge (M8)
-- ===========================================================================

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- director

-- M8-03. An amount carries the rate it was converted at, and the base figure
-- is generated from the two, so it cannot disagree with them.
select pg_temp.check('a foreign amount converts at the rate on its own row',
  (select amount_kes from budget_lines where id = '1d000000-0000-0000-0000-000000000011'),
  2600000.00::numeric(18, 2));

do $$
begin
  begin
    insert into budget_lines
      (budget_category_id, title_en, amount, currency, fx_rate_to_kes)
    values ('1d000000-0000-0000-0000-000000000001', 'Bad rate', 100, 'KES', 7);
    raise exception 'FAIL the base currency was given a rate other than one';
  exception
    when check_violation then
      raise notice 'ok   and the base currency cannot be given a rate of its own';
  end;
end;
$$;

-- M8-02. Four figures, none of them stored beside the others.
select pg_temp.check('a line with nothing drawn on it is entirely remaining',
  (select remaining_kes from budget_position
    where budget_line_id = '1d000000-0000-0000-0000-000000000010'),
  10000000.00::numeric(18, 2));

insert into payment_vouchers
  (id, reference_no, budget_line_id, payee, purpose, amount, currency, confidentiality)
values ('1d000000-0000-0000-0000-000000000030', 'PV-1001',
        '1d000000-0000-0000-0000-000000000010', 'Coast Engineering',
        'Substructure, first claim', 2000000, 'KES', 'internal');

-- M8-05, and the reason an approval chain exists at all.
do $$
begin
  begin
    update payment_vouchers set state = 'approved'
    where id = '1d000000-0000-0000-0000-000000000030';
    raise exception 'FAIL the requester approved their own voucher';
  exception
    when insufficient_privilege then
      raise notice 'ok   the person who raised a voucher cannot rule on it';
  end;
end;
$$;

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');  -- admin
update payment_vouchers set state = 'approved'
where id = '1d000000-0000-0000-0000-000000000030';

select pg_temp.check('an approved voucher is committed, not yet spent',
  (select committed_kes from budget_position
    where budget_line_id = '1d000000-0000-0000-0000-000000000010'),
  2000000.00::numeric(18, 2));

select pg_temp.check('and it comes off what is left before the money moves',
  (select remaining_kes from budget_position
    where budget_line_id = '1d000000-0000-0000-0000-000000000010'),
  8000000.00::numeric(18, 2));

-- The budget check is part of the record, not a screen somebody saw.
select pg_temp.check('what the line had left is written down at the decision',
  (select budget_remaining_at_decision from payment_vouchers
    where id = '1d000000-0000-0000-0000-000000000030'),
  10000000.00::numeric(18, 2));

select pg_temp.check('and the ruling itself is kept, with who made it',
  (select count(*) from voucher_approvals
    where payment_voucher_id = '1d000000-0000-0000-0000-000000000030'), 1::bigint);

do $$
declare
  n int;
begin
  begin
    update voucher_approvals set note = 'never mind'
    where payment_voucher_id = '1d000000-0000-0000-0000-000000000030';
    get diagnostics n = row_count;
    if n <> 0 then
      raise exception 'FAIL a recorded approval was edited';
    end if;
  exception
    when insufficient_privilege then
      null;
  end;
  raise notice 'ok   which cannot be rewritten afterwards';
end;
$$;

update payment_vouchers set state = 'paid'
where id = '1d000000-0000-0000-0000-000000000030';

select pg_temp.check('once paid it moves from committed to spent',
  (select committed_kes = 0 and spent_kes = 2000000.00
   from budget_position where budget_line_id = '1d000000-0000-0000-0000-000000000010'),
  true);

do $$
begin
  begin
    update payment_vouchers set state = 'requested'
    where id = '1d000000-0000-0000-0000-000000000030';
    raise exception 'FAIL a paid voucher was taken back';
  exception
    when insufficient_privilege then
      raise notice 'ok   and a paid voucher cannot be taken back';
  end;
end;
$$;

-- M8-05 again, at the size where the board has to be the one signing.
insert into payment_vouchers
  (id, reference_no, budget_line_id, payee, purpose, amount, currency, confidentiality)
values ('1d000000-0000-0000-0000-000000000031', 'PV-1002',
        '1d000000-0000-0000-0000-000000000010', 'Coast Engineering',
        'A very large claim', 30000000, 'KES', 'internal');

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- director
do $$
begin
  begin
    update payment_vouchers set state = 'approved'
    where id = '1d000000-0000-0000-0000-000000000031';
    raise exception 'FAIL a director approved a trustee-sized payment';
  exception
    when insufficient_privilege then
      raise notice 'ok   a payment above the band needs the people the band names';
  end;
end;
$$;

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');  -- trustee
update payment_vouchers set state = 'approved'
where id = '1d000000-0000-0000-0000-000000000031';
select pg_temp.check('and goes through when one of them rules on it',
  (select state::text from payment_vouchers
    where id = '1d000000-0000-0000-0000-000000000031'), 'approved');

-- M8-06. The badge nobody can award themselves.
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- director
do $$
declare
  n int;
begin
  begin
    update financial_transactions set audited_at = now(), audited_by = auth.uid()
    where id = 'cccc0000-0000-0000-0000-000000000001';
    get diagnostics n = row_count;
    if n <> 0 then
      raise exception 'FAIL a director marked a transaction audited';
    end if;
  exception
    when insufficient_privilege then
      null;
  end;
  raise notice 'ok   nobody can write the audited columns, whatever their role';
end;
$$;

do $$
begin
  begin
    perform public.mark_audited('cccc0000-0000-0000-0000-000000000001');
    raise exception 'FAIL a director marked a transaction audited through the function';
  exception
    when insufficient_privilege then
      raise notice 'ok   and the one function that can refuses anyone but the auditors';
  end;
end;
$$;

select pg_temp.act_as('dddd1111-1111-1111-1111-111111111111');  -- external auditor
select public.mark_audited('cccc0000-0000-0000-0000-000000000001', 'Vouched to invoice.');

select pg_temp.check('the auditor signing it is what produces the badge',
  (select audited_at is not null from financial_transactions
    where id = 'cccc0000-0000-0000-0000-000000000001'), true);

select pg_temp.check('and it carries their name, not the spender''s',
  (select audited_by = 'dddd1111-1111-1111-1111-111111111111' from financial_transactions
    where id = 'cccc0000-0000-0000-0000-000000000001'), true);

-- M8-07. Paper or no paper, it is recorded — and it says which.
select pg_temp.check('a transaction with nothing attached reads as unverified',
  (select verified from financial_transactions
    where id = 'cccc0000-0000-0000-0000-000000000001'), false);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- director
update financial_transactions set document_id = '1b000000-0000-0000-0000-000000000001'
where id = 'cccc0000-0000-0000-0000-000000000001';

select pg_temp.check('and attaching the invoice is what makes it verified',
  (select verified from financial_transactions
    where id = 'cccc0000-0000-0000-0000-000000000001'), true);

-- M8-08. A pledge is not a receipt.
select pg_temp.check('a pledge is counted at what was promised',
  (select pledged_amount_kes from donation_position
    where donation_id = '1d000000-0000-0000-0000-000000000020'),
  4000000.00::numeric(18, 2));

select pg_temp.check('what has arrived is counted separately',
  (select received_kes from donation_position
    where donation_id = '1d000000-0000-0000-0000-000000000020'),
  1200000.00::numeric(18, 2));

select pg_temp.check('and the difference is named rather than netted away',
  (select outstanding_kes from donation_position
    where donation_id = '1d000000-0000-0000-0000-000000000020'),
  2800000.00::numeric(18, 2));

-- M8-09. The distribution is a query, not a constant.
select pg_temp.check('the spend distribution comes from the lines themselves',
  (select spent_kes from category_spend
    where budget_category_id = '1d000000-0000-0000-0000-000000000001'),
  2000000.00::numeric(18, 2));

-- Money is not part of a contractor's world, and a budget is not either.
select pg_temp.act_as('77777777-7777-7777-7777-777777777777');  -- contractor
select pg_temp.check('somebody outside sees no budget lines',
  (select count(*) from budget_lines), 0::bigint);
select pg_temp.check('nor any donation',
  (select count(*) from donations), 0::bigint);

-- But anybody may ask to be paid, and read their own request back.
insert into payment_vouchers (reference_no, payee, purpose, amount, currency, confidentiality)
values ('PV-2001', 'Coast Engineering', 'Reimbursement', 40000, 'KES', 'internal');

select pg_temp.check('though anybody may ask to be paid, and see their own request',
  (select count(*) from payment_vouchers where reference_no = 'PV-2001'), 1::bigint);

select pg_temp.check('and no request but their own',
  (select count(*) from payment_vouchers), 1::bigint);

do $$
begin
  begin
    update payment_vouchers set state = 'approved' where reference_no = 'PV-2001';
    raise exception 'FAIL an outside party approved their own payment';
  exception
    when insufficient_privilege then
      raise notice 'ok   asking to be paid is not the same as approving it';
  end;
end;
$$;


-- ===========================================================================
-- RAID: risk, issue, assumption, dependency (M6)
-- ===========================================================================

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- director

-- M6-01. The score is the two numbers it comes from, and nothing else.
select pg_temp.check('a risk score is the product, not a third number',
  (select score from risks where id = '1e000000-0000-0000-0000-000000000001'), 12);

do $$
begin
  begin
    update risks set score = 25 where id = '1e000000-0000-0000-0000-000000000001';
    raise exception 'FAIL a score was set by hand';
  exception
    when generated_always then
      raise notice 'ok   and cannot be written over by hand';
  end;
end;
$$;

-- M6-09, which the escalation rule needs anyway: is this getting worse?
select pg_temp.check('every risk starts with its score on the record',
  (select count(*) from risk_score_changes
    where risk_id = '1e000000-0000-0000-0000-000000000001'), 1::bigint);

update risks set likelihood = 4 where id = '1e000000-0000-0000-0000-000000000001';

select pg_temp.check('and a movement is recorded with where it came from',
  (select from_score = 12 and to_score = 16 from risk_score_changes
    where risk_id = '1e000000-0000-0000-0000-000000000001'
    order by changed_at desc limit 1), true);

-- M6-08. Crossing the line is an event, not a property.
select pg_temp.check('crossing the threshold raises an escalation',
  (select count(*) from risk_escalations
    where risk_id = '1e000000-0000-0000-0000-000000000001'), 1::bigint);

update risks set likelihood = 4, impact = 5 where id = '1e000000-0000-0000-0000-000000000001';
select pg_temp.check('going further up while already over does not raise another',
  (select count(*) from risk_escalations
    where risk_id = '1e000000-0000-0000-0000-000000000001'), 1::bigint);

update risks set likelihood = 2, impact = 2 where id = '1e000000-0000-0000-0000-000000000001';
update risks set likelihood = 4, impact = 4 where id = '1e000000-0000-0000-0000-000000000001';
select pg_temp.check('but coming back down and rising again is a second crossing',
  (select count(*) from risk_escalations
    where risk_id = '1e000000-0000-0000-0000-000000000001'), 2::bigint);

do $$
declare
  n int;
begin
  begin
    update risk_score_changes set to_score = 1
    where risk_id = '1e000000-0000-0000-0000-000000000001';
    get diagnostics n = row_count;
    if n <> 0 then
      raise exception 'FAIL the risk history was rewritten';
    end if;
  exception
    when insufficient_privilege then
      null;
  end;
  raise notice 'ok   a risk history cannot be rewritten to look better';
end;
$$;

-- M6-02. Choosing to live with something is a decision, and a decision with
-- no reasoning is indistinguishable from not having noticed.
do $$
begin
  begin
    update risks set response = 'accept'
    where id = '1e000000-0000-0000-0000-000000000002';
    raise exception 'FAIL a risk was accepted with no reasoning';
  exception
    when check_violation then
      raise notice 'ok   accepting a risk requires saying why';
  end;
end;
$$;

update risks
set response = 'accept',
    response_plan_en = 'Sheeting is cheaper than the programme delay; reviewed each season.'
where id = '1e000000-0000-0000-0000-000000000002';
select pg_temp.check('and goes through once it does',
  (select response::text from risks where id = '1e000000-0000-0000-0000-000000000002'),
  'accept');

-- M6-04, M6-05. What happened, and the trace back to having foreseen it.
do $$
declare
  v_issue uuid;
begin
  v_issue := public.materialise_risk('1e000000-0000-0000-0000-000000000001',
                                     'The landlord served notice this morning.');
  if v_issue is null then
    raise exception 'FAIL materialising a risk produced no issue';
  end if;
  raise notice 'ok   a risk that happens becomes an issue in one act';
end;
$$;

select pg_temp.check('the issue points back at the risk it came from',
  (select count(*) from issues
    where materialised_from_risk_id = '1e000000-0000-0000-0000-000000000001'), 1::bigint);

select pg_temp.check('and the risk is marked as having happened',
  (select state::text from risks where id = '1e000000-0000-0000-0000-000000000001'),
  'materialised');

do $$
begin
  begin
    perform public.materialise_risk('1e000000-0000-0000-0000-000000000001');
    raise exception 'FAIL the same risk materialised twice';
  exception
    when check_violation then
      raise notice 'ok   and it cannot happen twice';
  end;
end;
$$;

-- M6-06. The one piece of automation that files a record nobody asked for.
update assumptions set state = 'broken', last_checked_on = current_date
where id = '1e000000-0000-0000-0000-000000000010';

select pg_temp.check('an assumption that collapses raises a risk by itself',
  (select raised_risk_id is not null from assumptions
    where id = '1e000000-0000-0000-0000-000000000010'), true);

select pg_temp.check('classified as the kind of risk it always was',
  (select r.category::text from risks r
    join assumptions a on a.raised_risk_id = r.id
    where a.id = '1e000000-0000-0000-0000-000000000010'), 'partnership');

select pg_temp.check('at a likelihood of five, because it has already happened',
  (select r.likelihood from risks r
    join assumptions a on a.raised_risk_id = r.id
    where a.id = '1e000000-0000-0000-0000-000000000010'), 5);

select pg_temp.check('and pointing back at the assumption that failed',
  (select r.source_assumption_id = '1e000000-0000-0000-0000-000000000010' from risks r
    join assumptions a on a.raised_risk_id = r.id
    where a.id = '1e000000-0000-0000-0000-000000000010'), true);

-- M6-07. What is waiting on what.
do $$
begin
  begin
    insert into dependencies (blocker_label, blocker_risk_id, dependent_label)
    values ('Something', '1e000000-0000-0000-0000-000000000002', 'Something else');
    raise exception 'FAIL a dependency was given two blockers';
  exception
    when check_violation then
      raise notice 'ok   a dependency has exactly one thing on each side';
  end;
end;
$$;

select pg_temp.check('a dependency on unfinished work reads as unsettled',
  (select blocker_settled from dependency_status
    where id = '1e000000-0000-0000-0000-000000000021'), false);

-- The court is the honest null: a case being open says nothing about whether
-- the particular ruling the work waits on has come.
select pg_temp.check('and one on a court case says it cannot tell',
  (select blocker_settled from dependency_status
    where id = '1e000000-0000-0000-0000-000000000020'), null::boolean);

-- M6-08. Twenty-five cells, including the empty ones.
select pg_temp.check('the matrix has a cell for every combination',
  (select count(*) from risk_matrix), 25::bigint);

select pg_temp.check('and an empty cell says nought rather than going missing',
  (select risk_count from risk_matrix where likelihood = 1 and impact = 1), 0::bigint);

-- Scope. The register names partners and politics; it belongs inside.
select pg_temp.act_as('77777777-7777-7777-7777-777777777777');  -- contractor
select pg_temp.check('somebody outside the organisation sees no risks',
  (select count(*) from risks), 0::bigint);
select pg_temp.check('nor the assumptions the plan rests on',
  (select count(*) from assumptions), 0::bigint);
select pg_temp.check('nor what was recorded as having gone wrong',
  (select count(*) from issues), 0::bigint);

do $$
begin
  begin
    insert into risks (title_en, category, likelihood, impact)
    values ('Made up by an outsider', 'legal', 5, 5);
    raise exception 'FAIL an outside party wrote to the risk register';
  exception
    when insufficient_privilege then
      raise notice 'ok   and cannot put anything into the register';
  end;
end;
$$;

-- The site team carries the risks it can see first.
select pg_temp.act_as('44444444-4444-4444-4444-444444444444');  -- field team
insert into risks (id, title_en, category, likelihood, impact, confidentiality)
values ('1e000000-0000-0000-0000-000000000030', 'Access road washes out', 'climate',
        3, 3, 'internal');
select pg_temp.check('the site team keeps the register for what it sees',
  (select count(*) from risks where id = '1e000000-0000-0000-0000-000000000030'), 1::bigint);


-- ===========================================================================
-- The storage rule survived being made non-fatal
-- ===========================================================================
--
-- 0012 wraps its two storage statements so that a project where the migration
-- role cannot write to Supabase's storage schema does not lose the other
-- twelve migrations over it. The cost of that handler is that it could hide a
-- real failure, so here the harness — where the statements are permitted —
-- insists they actually ran.

-- As the owner, not as a caller: these are facts about the schema rather than
-- rows anybody is entitled to read. `authenticated` has no privilege on
-- storage.buckets at all, which is itself correct.
reset role;

select pg_temp.check('the private documents bucket exists',
  (select count(*) from storage.buckets where id = 'documents' and not public), 1::bigint);

select pg_temp.check('the upload policy was created, not swallowed by the handler',
  (select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and cmd = 'INSERT'), 1::bigint);

-- The absence is the mechanism: with no select policy the bytes are
-- unreachable from a browser, so every read has to go through the function
-- that writes the access log (M9-07).
select pg_temp.check('and there is still no way to read the bucket directly',
  (select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and cmd in ('SELECT', 'ALL')), 0::bigint);



-- ===========================================================================
-- Search, and the narrower door the model gets (M13-02, M13-03, M13-05, M13-06)
-- ===========================================================================
--
-- The storage section above finished with `reset role`, which makes the owner
-- the caller — and the owner bypasses row level security. Everything below is
-- about what a caller may see, so the role has to come back first. Without
-- this line these assertions pass for the wrong reason.
set role authenticated;
--
-- Two things are being proved here, and only one of them is about matching.
-- The first is that search adds no access: whatever a person can find, they
-- could already read. The second is that the assistant's retrieval is
-- strictly narrower than the person's own — restricted material is excluded
-- from it for everybody, including the people who may read it on screen.

-- Bilingual material to search, written by the director so it is ordinary
-- internal-tier content. The Turkish is inflected on purpose: "Duruşmalar"
-- has to be found by somebody typing "duruşma", which is the only reason to
-- carry a Turkish stemming configuration at all.
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- director
insert into risks (id, title_en, title_tr, detail_en, detail_tr,
                   category, likelihood, impact, confidentiality)
values ('1e000000-0000-0000-0000-000000000040',
        'Hearings keep being adjourned',
        'Duruşmalar sürekli erteleniyor',
        'The permit cannot be renewed while the matter is pending.',
        'Dava sürerken inşaat ruhsatı yenilenemiyor.',
        'legal', 4, 4, 'internal');

-- And one at the top tier, which is the one the assistant must never see.
insert into risks (id, title_en, title_tr, category, likelihood, impact, confidentiality)
values ('1e000000-0000-0000-0000-000000000041',
        'Hearings bench may be approached', 'Duruşma heyetine yaklaşılabilir',
        'legal', 3, 3, 'restricted');

-- --- Matching -------------------------------------------------------------

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');  -- trustee

-- Turkish stemming. The query is the stem; the record carries the plural.
select pg_temp.check('a Turkish query finds an inflected Turkish record',
  (select count(*) from search_records('duruşma')
    where id = '1e000000-0000-0000-0000-000000000040'), 1::bigint);

-- English stemming, same record, because the record is bilingual. This is
-- what M13-06 actually buys: not a translated query, a bilingual archive.
select pg_temp.check('and an English query finds the same record',
  (select count(*) from search_records('adjourned')
    where id = '1e000000-0000-0000-0000-000000000040'), 1::bigint);

-- Folding. Somebody on a keyboard without the Turkish letters still finds it.
select pg_temp.check('typing without the Turkish letters still finds it',
  (select count(*) from search_records('durusmalar')
    where id = '1e000000-0000-0000-0000-000000000040'), 1::bigint);

-- Identifiers. to_tsvector makes one token of ELC/134/2013, so the stem of a
-- partial case number matches nothing and only the literal branch saves it.
select pg_temp.check('a partial case number finds its case',
  (select count(*) from search_records('ELC/134')
    where id = 'aaaa0000-0000-0000-0000-000000000002'), 1::bigint);

select pg_temp.check('and it does not matter how it is capitalised',
  (select count(*) from search_records('elc/134/2013')
    where id = 'aaaa0000-0000-0000-0000-000000000002'), 1::bigint);

-- One box, several registers: the word "case" appears in the legal register
-- and in an obligation, and both come back.
select pg_temp.check('one query reaches more than one register',
  (select count(distinct kind) from search_records('case') where kind is not null) > 1, true);

-- The kind filter narrows it without changing what is visible.
select pg_temp.check('and can be narrowed to one register',
  (select count(distinct kind) from search_records('case', array['legal_case']::search_kind[])),
  1::bigint);

-- A query that is too short matches nothing rather than everything. The
-- literal branch would otherwise turn '%%' into the whole archive.
select pg_temp.check('an empty query returns nothing',
  (select count(*) from search_records('')), 0::bigint);
select pg_temp.check('and a single character returns nothing',
  (select count(*) from search_records('a')), 0::bigint);

-- A wildcard is a character somebody typed, not an instruction.
select pg_temp.check('a per cent sign does not match everything',
  (select count(*) from search_records('%%%')), 0::bigint);

-- --- Search adds no access ------------------------------------------------

-- The trustee may read the restricted risk, so their search finds it.
select pg_temp.check('a trustee searching reaches restricted material',
  (select count(*) from search_records('duruşma')
    where id = '1e000000-0000-0000-0000-000000000041'), 1::bigint);

-- The field team may not, and their search does not — the same query, the
-- same function, a different caller.
select pg_temp.act_as('44444444-4444-4444-4444-444444444444');  -- field team
select pg_temp.check('the field team searching does not',
  (select count(*) from search_records('duruşma')
    where id = '1e000000-0000-0000-0000-000000000041'), 0::bigint);

-- A donor sees published material, plus the one confidential case an earlier
-- test shared with them by name (M1-05), and nothing else. That is the better
-- assertion than "only public": search hands back exactly what the policies
-- already allow, including a deliberate exception, and nothing by accident.
select pg_temp.act_as('88888888-8888-8888-8888-888888888888');  -- donor
select pg_temp.check('a donor searching finds the published case',
  (select count(*) from search_records('case')
    where confidentiality = 'public'), 1::bigint);
select pg_temp.check('and the one record shared with them by name',
  (select count(*) from search_records('case')
    where id = 'aaaa0000-0000-0000-0000-000000000003'), 1::bigint);
select pg_temp.check('and nothing else at all',
  (select count(*) from search_records('case')), 2::bigint);
-- A grant cannot reach the top tier, and search is not a way round that.
select pg_temp.check('nor anything restricted, which no grant can reach',
  (select count(*) from search_records('MIC/103')), 0::bigint);

-- An external advocate's scope holds inside search too.
select pg_temp.act_as('55555555-5555-5555-5555-555555555555');  -- advocate one
select pg_temp.check('an advocate searching finds the case assigned to them',
  (select count(*) from search_records('ELC/134')
    where id = 'aaaa0000-0000-0000-0000-000000000002'), 1::bigint);
select pg_temp.check('and nothing restricted, whatever they type',
  (select count(*) from search_records('MIC/103')), 0::bigint);
select pg_temp.check('nor the risk register, which is not theirs at all',
  (select count(*) from search_records('duruşma')), 0::bigint);

-- --- The model's door is narrower (M13-03) --------------------------------

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');  -- trustee

-- The same caller, the same query, through the other function.
select pg_temp.check('the trustee''s own search returns the restricted risk',
  (select count(*) from search_records('duruşma')
    where confidentiality = 'restricted'), 1::bigint);
select pg_temp.check('and the assistant''s retrieval returns none of it',
  (select count(*) from ai_context('duruşma')
    where confidentiality = 'restricted'), 0::bigint);

-- Not an empty answer, though: the point is that it is narrower, not that it
-- is useless.
select pg_temp.check('while still returning what may be summarised',
  (select count(*) from ai_context('duruşma')) > 0, true);

-- The strongest form of it. An administrator may read everything in the
-- portal; they still cannot route restricted material into a prompt, because
-- the exclusion is about where the text is going.
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');  -- admin
select pg_temp.check('an administrator sees the restricted risk',
  (select count(*) from search_records('duruşma')
    where confidentiality = 'restricted'), 1::bigint);
select pg_temp.check('and cannot get it into the model''s context either',
  (select count(*) from ai_context('duruşma')
    where confidentiality = 'restricted'), 0::bigint);
select pg_temp.check('nor by asking for more rows than there are',
  (select count(*) from ai_context('duruşma', 40)
    where confidentiality = 'restricted'), 0::bigint);

-- --- The searchable text is derived, not written ---------------------------

-- The generated columns are the single definition of what text of a record is
-- searchable. Nobody gets to disagree with them by hand — which is also what
-- stops a record being quietly made unfindable.
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- director
do $$
begin
  begin
    update risks set search_document = 'nothing to see here'
     where id = '1e000000-0000-0000-0000-000000000040';
    raise exception 'FAIL the searchable text was written by hand';
  exception
    when generated_always then
      raise notice 'ok   the searchable text cannot be written by hand';
  end;
end;
$$;

-- And it follows the record. Renaming the risk changes what finds it.
update risks set title_tr = 'Keşif tarihi değişti'
 where id = '1e000000-0000-0000-0000-000000000040';
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select pg_temp.check('rewording a record changes what finds it',
  (select count(*) from search_records('keşif')
    where id = '1e000000-0000-0000-0000-000000000040'), 1::bigint);
select pg_temp.check('and the old wording stops finding it',
  (select count(*) from search_records('erteleniyor')
    where id = '1e000000-0000-0000-0000-000000000040'), 0::bigint);

-- --- The usage log (M13-10) -----------------------------------------------

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');  -- trustee
insert into ai_queries (task, question, source_count, model)
values ('archive_question', 'What did the board decide about the permit?', 4, 'test');

select pg_temp.check('somebody sees their own questions',
  (select count(*) from ai_queries where asked_by = '33333333-3333-3333-3333-333333333333'),
  1::bigint);

-- Note on the handler below, and on every append-only test in this file.
--
-- It catches insufficient_privilege ONLY. An earlier version also caught
-- raise_exception, which is the SQLSTATE of this file's own
-- `raise exception 'FAIL ...'` — so when the refusal stopped working, the
-- FAIL was swallowed by its own handler and the test reported ok. Six tests
-- were vacuous that way. app.refuse_audit_mutation raises
-- insufficient_privilege and a withdrawn privilege raises it too, so the
-- narrow code is both correct and strict.
do $$
begin
  begin
    update ai_queries set question = 'something more flattering'
     where asked_by = '33333333-3333-3333-3333-333333333333';
    raise exception 'FAIL the AI usage log was rewritten';
  exception
    when insufficient_privilege then
      raise notice 'ok   and cannot rewrite them afterwards';
  end;
end;
$$;

do $$
begin
  begin
    delete from ai_queries where asked_by = '33333333-3333-3333-3333-333333333333';
    raise exception 'FAIL the AI usage log was deleted';
  exception
    when insufficient_privilege then
      raise notice 'ok   nor delete them';
  end;
end;
$$;

-- Asking in somebody else's name is refused, which is what makes the log
-- worth reading.
do $$
begin
  begin
    insert into ai_queries (asked_by, task, question)
    values ('11111111-1111-1111-1111-111111111111', 'translation', 'not mine');
    raise exception 'FAIL a question was logged against somebody else';
  exception
    when insufficient_privilege then
      raise notice 'ok   and cannot log a question in somebody else''s name';
  end;
end;
$$;

-- The auditors read the lot, because cost and conduct are what the log is for.
select pg_temp.act_as('dddd1111-1111-1111-1111-111111111111');  -- external auditor
select pg_temp.check('an auditor reads everybody''s',
  (select count(*) from ai_queries), 1::bigint);

-- The field team does not.
select pg_temp.act_as('44444444-4444-4444-4444-444444444444');
select pg_temp.check('a colleague reads none of them',
  (select count(*) from ai_queries), 0::bigint);

-- --- Saved searches are private (M13-11) ----------------------------------

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
insert into saved_searches (name, query, kinds)
values ('Permit matters', 'ruhsat', array['legal_case','obligation']::search_kind[]);
select pg_temp.check('a saved search belongs to whoever saved it',
  (select count(*) from saved_searches), 1::bigint);

-- Including from the administrator. The other registers here are
-- institutional records; what somebody repeatedly looks for is not one.
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');  -- admin
select pg_temp.check('and not even an administrator reads it',
  (select count(*) from saved_searches), 0::bigint);



-- ===========================================================================
-- Governance, compliance and academic readiness (M10)
-- ===========================================================================
--
-- The screen this replaces kept its resolutions in a React useState — three
-- of them, typed in, one allocating "34.3M KShs" — and its compliance section
-- was a paragraph. So the assertions below are mostly about the four rules
-- that make the registers worth keeping: a quorum that can be tested, a
-- resolution that closes when signed, a decision nobody actioned that is
-- called neither done nor outstanding, and nothing reaching "met" without a
-- document behind it.

set role authenticated;

select pg_temp.check('the old trustee table is gone, not left as a second answer',
  (select count(*) from pg_tables where schemaname = 'public' and tablename = 'trustee_members'),
  0::bigint);

select pg_temp.check('and the three organs are on the books',
  (select count(*) from governance_organs), 3::bigint);

-- --- the trustee register (M10-01) ----------------------------------------

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');  -- trustee

insert into trustees (id, full_name, appointing_body, appointed_on, term_ends_on,
                      seat_en, email, confidentiality)
values
  ('a0000000-0000-0000-0000-000000000001', 'Trustee', 'Universal Education Foundation',
   '2025-05-27', '2030-05-27', 'Chair', 'trustee@example.test', 'internal'),
  ('a0000000-0000-0000-0000-000000000002', 'Trustee Two', 'Africa Foundation',
   '2025-05-27', '2030-05-27', 'Member', 'trustee2@example.test', 'internal'),
  ('a0000000-0000-0000-0000-000000000003', 'Trustee Three', 'Shahbal Foundation',
   '2025-05-27', '2030-05-27', 'Member', 'trustee3@example.test', 'internal');

select pg_temp.check('the register records who appointed each trustee',
  (select count(*) from trustees where appointing_body <> ''), 3::bigint);

-- Emptying a seat without saying when would quietly change every quorum
-- computed over the register.
do $$
begin
  begin
    update trustees set active = false
     where id = 'a0000000-0000-0000-0000-000000000003';
    raise exception 'FAIL a trustee stood down with no date';
  exception
    when check_violation then
      raise notice 'ok   standing down has to be dated';
  end;
end;
$$;

update trustees set active = false, stood_down_on = current_date
 where id = 'a0000000-0000-0000-0000-000000000003';
select pg_temp.check('and goes through once it is',
  (select count(*) from trustees where not active and stood_down_on is not null), 1::bigint);

-- The register is the board's, not the site's.
select pg_temp.act_as('44444444-4444-4444-4444-444444444444');  -- field team
do $$
begin
  begin
    insert into trustees (full_name, appointing_body)
    values ('Somebody the site appointed', 'Nowhere');
    raise exception 'FAIL the site team wrote to the trustee register';
  exception
    when insufficient_privilege then
      raise notice 'ok   the site team does not appoint trustees';
  end;
end;
$$;

select pg_temp.act_as('77777777-7777-7777-7777-777777777777');  -- contractor
select pg_temp.check('and somebody outside sees no trustee register at all',
  (select count(*) from trustees), 0::bigint);

-- --- quorum, as data (M10-02) ---------------------------------------------

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');  -- trustee

-- Two of the three seats, which is the rule this trust's deed would state.
-- It is set here rather than seeded by the migration, because the migration
-- has no business inventing a quorum.
update governance_organs set quorum_members = 2, cadence = 'quarterly'
 where kind = 'board_of_trustees';

insert into organ_memberships (organ_id, profile_id, seat, voting, started_on, confidentiality)
select o.id, p.id, p.seat, true, '2025-05-27'::date, 'internal'
from governance_organs o
cross join (values
  ('33333333-3333-3333-3333-333333333333'::uuid, 'Chair'),
  ('aaaa1111-1111-1111-1111-111111111111'::uuid, 'Member'),
  ('bbbb1111-1111-1111-1111-111111111111'::uuid, 'Member')
) as p(id, seat)
where o.kind = 'board_of_trustees';

-- A sitting one short of the rule.
insert into meetings (id, title, held_at, kind, governance_organ_id, confidentiality)
select '0e000000-0000-0000-0000-0000000000a1', 'Board sitting, one attended',
       now() - interval '20 days', 'trustee', o.id, 'internal'
from governance_organs o where o.kind = 'board_of_trustees';
insert into meeting_attendees (meeting_id, profile_id, attended)
values ('0e000000-0000-0000-0000-0000000000a1', '33333333-3333-3333-3333-333333333333', true);

-- And one that met it.
insert into meetings (id, title, held_at, kind, governance_organ_id, confidentiality)
select '0e000000-0000-0000-0000-0000000000a2', 'Board sitting, two attended',
       now() - interval '10 days', 'trustee', o.id, 'internal'
from governance_organs o where o.kind = 'board_of_trustees';
insert into meeting_attendees (meeting_id, profile_id, attended) values
  ('0e000000-0000-0000-0000-0000000000a2', '33333333-3333-3333-3333-333333333333', true),
  ('0e000000-0000-0000-0000-0000000000a2', 'aaaa1111-1111-1111-1111-111111111111', true);

select pg_temp.check('the quorum rule is read from the organ, not remembered',
  (select quorum_required from governance_sitting_quorum
    where meeting_id = '0e000000-0000-0000-0000-0000000000a1'), 2);
select pg_temp.check('a sitting one short is not competent to decide',
  (select quorum_met from governance_sitting_quorum
    where meeting_id = '0e000000-0000-0000-0000-0000000000a1'), false);
select pg_temp.check('and one that met the rule is',
  (select quorum_met from governance_sitting_quorum
    where meeting_id = '0e000000-0000-0000-0000-0000000000a2'), true);
select pg_temp.check('seats are counted as at the day of the sitting',
  (select seats_held from governance_sitting_quorum
    where meeting_id = '0e000000-0000-0000-0000-0000000000a2'), 3);

-- Somebody invited and absent is not somebody present, which is the whole
-- point of keeping the two facts apart.
insert into meeting_attendees (meeting_id, profile_id, attended)
values ('0e000000-0000-0000-0000-0000000000a1', 'aaaa1111-1111-1111-1111-111111111111', false);
select pg_temp.check('an absent member does not make up the numbers',
  (select quorum_met from governance_sitting_quorum
    where meeting_id = '0e000000-0000-0000-0000-0000000000a1'), false);

-- The organ nobody wrote a rule for. Null, not false: "we never recorded the
-- quorum" is a different failure from "the sitting was short", and reporting
-- the first as the second would send somebody looking for the wrong problem.
insert into organ_memberships (organ_id, profile_id, voting, started_on, confidentiality)
select o.id, '11111111-1111-1111-1111-111111111111', true, '2025-05-27'::date, 'internal'
from governance_organs o where o.kind = 'audit_committee';
insert into meetings (id, title, held_at, kind, governance_organ_id, confidentiality)
select '0e000000-0000-0000-0000-0000000000a3', 'Audit committee, no rule recorded',
       now() - interval '5 days', 'official', o.id, 'internal'
from governance_organs o where o.kind = 'audit_committee';
insert into meeting_attendees (meeting_id, profile_id, attended)
values ('0e000000-0000-0000-0000-0000000000a3', '11111111-1111-1111-1111-111111111111', true);

select pg_temp.check('an organ with no recorded quorum says it cannot tell',
  (select quorum_met from governance_sitting_quorum
    where meeting_id = '0e000000-0000-0000-0000-0000000000a3'), null::boolean);

-- --- the formal decision register (M10-03) --------------------------------

insert into decisions (id, meeting_id, reference_no, text_en, text_tr, organ,
                       governance_organ_id, decided_on, status, confidentiality)
select '0f000000-0000-0000-0000-0000000000b1', '0e000000-0000-0000-0000-0000000000a2',
       'BOT/2026/01', 'Renew the ground lease before the next intake',
       'Kira sözleşmesini sonraki alımdan önce yenile',
       'Board of Trustees', o.id, current_date - 30, 'in_force', 'internal'
from governance_organs o where o.kind = 'board_of_trustees';

select pg_temp.check('a resolution is unsigned until somebody signs it',
  (select count(*) from decisions
    where id = '0f000000-0000-0000-0000-0000000000b1' and signed_at is null), 1::bigint);

select public.sign_resolution('0f000000-0000-0000-0000-0000000000b1');
select pg_temp.check('signing records who did it, not who filled the form',
  (select signed_by from decisions where id = '0f000000-0000-0000-0000-0000000000b1'),
  '33333333-3333-3333-3333-333333333333'::uuid);

do $$
begin
  begin
    update decisions set text_en = 'Something the board finds easier to defend'
     where id = '0f000000-0000-0000-0000-0000000000b1';
    raise exception 'FAIL a signed resolution was rewritten';
  exception
    when check_violation then
      raise notice 'ok   a signed resolution cannot be rewritten afterwards';
  end;
end;
$$;

-- Everything administrative around it stays editable, or the register becomes
-- unusable the moment somebody mistypes a status.
update decisions set status = 'implemented'
 where id = '0f000000-0000-0000-0000-0000000000b1';
select pg_temp.check('though its status still moves',
  (select status::text from decisions where id = '0f000000-0000-0000-0000-0000000000b1'),
  'implemented');
update decisions set status = 'in_force'
 where id = '0f000000-0000-0000-0000-0000000000b1';

do $$
begin
  begin
    perform public.sign_resolution('0f000000-0000-0000-0000-0000000000b1');
    raise exception 'FAIL a resolution was signed twice';
  exception
    when unique_violation then
      raise notice 'ok   and cannot be signed a second time';
  end;
end;
$$;

-- A decision that belongs to no organ is not a resolution of one.
insert into decisions (id, meeting_id, text_en, decided_on, status, confidentiality)
values ('0f000000-0000-0000-0000-0000000000b2', '0e000000-0000-0000-0000-000000000005',
        'Move the site hut', current_date, 'in_force', 'internal');
do $$
begin
  begin
    perform public.sign_resolution('0f000000-0000-0000-0000-0000000000b2');
    raise exception 'FAIL a decision of no organ was signed into the register';
  exception
    when check_violation then
      raise notice 'ok   only an organ''s resolution goes into the formal register';
  end;
end;
$$;

select pg_temp.act_as('44444444-4444-4444-4444-444444444444');  -- field team
do $$
begin
  begin
    perform public.sign_resolution('0f000000-0000-0000-0000-0000000000b1');
    raise exception 'FAIL the site team signed a board resolution';
  exception
    when insufficient_privilege or unique_violation then
      raise notice 'ok   and only the board or an administrator signs one';
  end;
end;
$$;

-- --- was it carried out? (M10-04) -----------------------------------------

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');  -- trustee

-- The state that matters. Nobody has said what carrying this resolution out
-- would consist of, so it is neither done nor outstanding.
select pg_temp.check('a resolution nobody actioned is called exactly that',
  (select implementation::text from decision_implementation
    where decision_id = '0f000000-0000-0000-0000-0000000000b1'),
  'no_actions_recorded');

insert into action_items (id, meeting_id, decision_id, text_en, due_date, status,
                          owner_profile_id, confidentiality)
values ('0a000000-0000-0000-0000-0000000000c1', '0e000000-0000-0000-0000-0000000000a2',
        '0f000000-0000-0000-0000-0000000000b1', 'Write to the county lands office',
        current_date - 5, 'open', '22222222-2222-2222-2222-222222222222', 'internal');

select pg_temp.check('once it has one, it is outstanding',
  (select implementation::text from decision_implementation
    where decision_id = '0f000000-0000-0000-0000-0000000000b1'), 'outstanding');
select pg_temp.check('and the overdue one is counted as overdue',
  (select overdue from decision_implementation
    where decision_id = '0f000000-0000-0000-0000-0000000000b1'), 1);

update action_items set status = 'done'
 where id = '0a000000-0000-0000-0000-0000000000c1';
select pg_temp.check('when everything is done it reads as implemented',
  (select implementation::text from decision_implementation
    where decision_id = '0f000000-0000-0000-0000-0000000000b1'), 'implemented');

-- Cancelling the only action is not carrying the resolution out, and it is
-- not leaving it outstanding either. Somebody decided not to do it.
update action_items set status = 'cancelled'
 where id = '0a000000-0000-0000-0000-0000000000c1';
select pg_temp.check('and a resolution whose actions were all cancelled is abandoned',
  (select implementation::text from decision_implementation
    where decision_id = '0f000000-0000-0000-0000-0000000000b1'), 'abandoned');

-- --- the compliance calendar (M10-05) -------------------------------------

-- The date arithmetic first, because the calendar rests on it.
select pg_temp.check('an annual duty whose date has passed rolls to next year',
  app.next_compliance_due('annual', 3, 31, null, '2026-06-01'::date),
  '2027-03-31'::date);
select pg_temp.check('and one still to come this year does not',
  app.next_compliance_due('annual', 11, 30, null, '2026-06-01'::date),
  '2026-11-30'::date);
-- make_date would simply raise on the 31st of February. A statutory deadline
-- on the last day of the month is a real thing and has to land somewhere.
select pg_temp.check('a deadline on the 31st lands on the last day of a short month',
  app.next_compliance_due('monthly', null, 31, null, '2027-02-01'::date),
  '2027-02-28'::date);
select pg_temp.check('a quarterly duty steps three months at a time',
  app.next_compliance_due('quarterly', 1, 15, null, '2026-02-01'::date),
  '2026-04-15'::date);
-- A one-off that was missed stays missed. Rolling it forward would hide it.
select pg_temp.check('and a missed one-off deadline is not quietly moved',
  app.next_compliance_due('once', null, null, '2020-01-01'::date, '2026-06-01'::date),
  '2020-01-01'::date);

insert into compliance_requirements
  (id, regime, reference, title_en, title_tr, recurrence, due_month, due_day,
   responsible_profile_id, confidentiality)
values
  ('0c000000-0000-0000-0000-0000000000d1', 'cap_164', 'Cap 164 s.5',
   'Annual return of trustees', 'Mütevelli yıllık beyanı',
   'annual', 3, 31, '22222222-2222-2222-2222-222222222222', 'internal'),
  ('0c000000-0000-0000-0000-0000000000d2', 'kra', 'Exemption renewal',
   'Renew the income tax exemption', 'Gelir vergisi muafiyeti yenilemesi',
   'annual', 6, 30, '22222222-2222-2222-2222-222222222222', 'internal');

select pg_temp.check('a duty with no obligation behind it says so',
  (select count(*) from compliance_calendar where not_yet_raised), 2::bigint);

select public.raise_compliance_obligation('0c000000-0000-0000-0000-0000000000d1');

select pg_temp.check('raising one puts it in the obligations register',
  (select count(*) from obligations ob
    join compliance_instances i on i.obligation_id = ob.id
    where i.requirement_id = '0c000000-0000-0000-0000-0000000000d1'
      and ob.source = 'statute'), 1::bigint);
select pg_temp.check('and the calendar stops saying it is unraised',
  (select not_yet_raised from compliance_calendar
    where requirement_id = '0c000000-0000-0000-0000-0000000000d1'), false);

-- A screen with a button on it will have that button pressed twice.
select pg_temp.check('raising it again returns the same obligation',
  (select count(distinct public.raise_compliance_obligation('0c000000-0000-0000-0000-0000000000d1'))
   from generate_series(1, 3)), 1::bigint);
select pg_temp.check('and does not file the return twice',
  (select count(*) from compliance_instances
    where requirement_id = '0c000000-0000-0000-0000-0000000000d1'), 1::bigint);

select pg_temp.act_as('77777777-7777-7777-7777-777777777777');  -- contractor
do $$
begin
  begin
    perform public.raise_compliance_obligation('0c000000-0000-0000-0000-0000000000d2');
    raise exception 'FAIL an outside party raised a statutory obligation';
  exception
    when insufficient_privilege then
      raise notice 'ok   an outside party does not raise the trust''s statutory duties';
  end;
end;
$$;

-- --- the CUE checklist (M10-06) -------------------------------------------

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- director

insert into accreditation_requirements
  (id, code, title_en, title_tr, state, target_on, responsible_profile_id, confidentiality)
values ('0b000000-0000-0000-0000-0000000000e1', 'CUE/STD/3.2',
        'Library holdings per programme', 'Program başına kütüphane kaynakları',
        'in_progress', current_date + 90, '22222222-2222-2222-2222-222222222222', 'internal');

do $$
begin
  begin
    update accreditation_requirements
      set state = 'met', met_on = current_date
     where id = '0b000000-0000-0000-0000-0000000000e1';
    raise exception 'FAIL an accreditation box was ticked with no evidence';
  exception
    when check_violation then
      raise notice 'ok   nothing reaches met without the document behind it';
  end;
end;
$$;

update accreditation_requirements
  set state = 'met', met_on = current_date,
      evidence_document_id = '1b000000-0000-0000-0000-000000000001'
 where id = '0b000000-0000-0000-0000-0000000000e1';
select pg_temp.check('and goes through once there is one',
  (select state::text from accreditation_requirements
    where id = '0b000000-0000-0000-0000-0000000000e1'), 'met');

-- --- the charter road map (M10-07) ----------------------------------------

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');  -- trustee

insert into charter_stages (id, sequence, title_en, title_tr, state, target_on,
                            completed_on, confidentiality)
values
  ('0d100000-0000-0000-0000-0000000000f1', 1, 'Trust deed registered under Cap 164',
   'Vakıf senedinin Fasıl 164 kapsamında tescili', 'done', current_date - 400,
   current_date - 400, 'internal'),
  ('0d100000-0000-0000-0000-0000000000f2', 2, 'Letter of interim authority from CUE',
   'CUE geçici yetki yazısı', 'not_started', current_date + 120, null, 'internal');

update charter_stages set depends_on_stage_id = '0d100000-0000-0000-0000-0000000000f1'
 where id = '0d100000-0000-0000-0000-0000000000f2';

select pg_temp.check('a stage whose predecessor is finished is not blocked',
  (select blocked_by_predecessor from charter_roadmap
    where id = '0d100000-0000-0000-0000-0000000000f2'), false);

update charter_stages set state = 'in_progress', completed_on = null
 where id = '0d100000-0000-0000-0000-0000000000f1';
select pg_temp.check('and one whose predecessor is not, is — computed, not stored',
  (select blocked_by_predecessor from charter_roadmap
    where id = '0d100000-0000-0000-0000-0000000000f2'), true);

-- A road map with a loop in it will be read as one that can be walked.
do $$
begin
  begin
    update charter_stages set depends_on_stage_id = '0d100000-0000-0000-0000-0000000000f2'
     where id = '0d100000-0000-0000-0000-0000000000f1';
    raise exception 'FAIL the road map was allowed to close a loop';
  exception
    when check_violation then
      raise notice 'ok   a road map stage cannot depend on itself, however indirectly';
  end;
end;
$$;

-- --- academic programmes (M10-08) -----------------------------------------

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- director

insert into academic_programmes
  (id, name_en, name_tr, degree, state, required_academic_staff,
   appointed_academic_staff, target_intake_year, confidentiality)
values ('0e100000-0000-0000-0000-000000000001', 'Business Administration',
        'İşletme Yönetimi', 'BBA', 'curriculum_drafted', 8, 2, 2027, 'internal');

select pg_temp.check('the staffing gap is the shortfall, not the headcount',
  (select staff_gap from academic_programmes
    where id = '0e100000-0000-0000-0000-000000000001'), 6);

-- An unknown requirement is not a satisfied one.
insert into academic_programmes
  (id, name_en, degree, state, appointed_academic_staff, confidentiality)
values ('0e100000-0000-0000-0000-000000000002', 'Nursing', 'BSc', 'proposed', 0, 'internal');
select pg_temp.check('and where nobody has established it, the gap is unknown',
  (select staff_gap from academic_programmes
    where id = '0e100000-0000-0000-0000-000000000002'), null::int);

do $$
begin
  begin
    update academic_programmes set state = 'approved'
     where id = '0e100000-0000-0000-0000-000000000001';
    raise exception 'FAIL a programme was approved with no curriculum';
  exception
    when check_violation then
      raise notice 'ok   an approved programme has its curriculum in the vault';
  end;
end;
$$;

-- --- quantified obligations (M10-09, M10-10) ------------------------------

-- The lease-derived undertakings. The twenty per cent scholarship share and
-- the campus mosque are the same shape — a duty with a number — so they use
-- one mechanism rather than two tables.
insert into obligations (id, title_en, title_tr, source, obligor_name, due_on, confidentiality)
values
  ('0f100000-0000-0000-0000-000000000001', 'Full scholarships for a fifth of each intake',
   'Her alımın beşte birine tam burs', 'lease', 'African University Trust of Kenya',
   '2027-09-30', 'internal'),
  ('0f100000-0000-0000-0000-000000000002', 'Build the campus mosque',
   'Kampüs camisini inşa et', 'lease', 'African University Trust of Kenya',
   '2028-06-30', 'internal');

insert into obligation_targets (id, obligation_id, basis_en, target_value, unit,
                                period_label, confidentiality)
values
  ('0f200000-0000-0000-0000-000000000001', '0f100000-0000-0000-0000-000000000001',
   'Twenty per cent of the 2027 intake, full scholarship', 60, 'students',
   '2027 intake', 'internal'),
  ('0f200000-0000-0000-0000-000000000002', '0f100000-0000-0000-0000-000000000002',
   'One mosque on the campus', 1, 'building', null, 'internal');

select pg_temp.check('a target with nothing recorded against it is at nought',
  (select coalesce(percent_of_target, -1) from obligation_progress
    where target_id = '0f200000-0000-0000-0000-000000000001'), 0.0::numeric);

-- Refused twice over, and the order is worth knowing: the policy insists the
-- evidence be a document this person can actually see, so a null one fails
-- the access rule before it reaches the not-null column. Either refusal is
-- the right answer; catching both is what keeps the test honest if the policy
-- is ever relaxed.
do $$
begin
  begin
    insert into obligation_achievements (target_id, value, document_id)
    values ('0f200000-0000-0000-0000-000000000001', 25, null);
    raise exception 'FAIL an achievement was recorded with no evidence';
  exception
    when not_null_violation or insufficient_privilege then
      raise notice 'ok   a reported achievement names the document behind it';
  end;
end;
$$;

select pg_temp.check('and the column itself refuses a null, not only the policy',
  (select is_nullable from information_schema.columns
    where table_schema = 'public' and table_name = 'obligation_achievements'
      and column_name = 'document_id'), 'NO');

-- The policy also insists the evidence be a document the reporter can open,
-- which is what makes the null case above fail as an access error. It is not
-- asserted separately here because every role that may keep this register
-- holds restricted clearance in the seed, so there is no actor who can report
-- an achievement and not read the restricted document — a test that cannot
-- fail is worse than no test.

insert into obligation_achievements (id, target_id, period_label, value, document_id, confidentiality)
values ('0f300000-0000-0000-0000-000000000001', '0f200000-0000-0000-0000-000000000001',
        '2027 intake', 15, '1b000000-0000-0000-0000-000000000001', 'internal');

select pg_temp.check('and once evidenced it counts towards the target',
  (select percent_of_target from obligation_progress
    where target_id = '0f200000-0000-0000-0000-000000000001'), 25.0::numeric);
select pg_temp.check('with the shortfall named rather than left to arithmetic',
  (select shortfall from obligation_progress
    where target_id = '0f200000-0000-0000-0000-000000000001'), 45.00::numeric);

-- A number that was reported and evidenced cannot be quietly walked back.
do $$
begin
  begin
    update obligation_achievements set value = 60
     where id = '0f300000-0000-0000-0000-000000000001';
    raise exception 'FAIL a recorded achievement was revised';
  exception
    when insufficient_privilege then
      raise notice 'ok   a recorded achievement is corrected by a new entry, not an edit';
  end;
end;
$$;

-- --- conflicts of interest (M10-11) ---------------------------------------

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- director

insert into conflict_declarations (id, profile_id, interest_en, interest_tr, declared_on)
values ('0f400000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
        'My brother-in-law is a director of one of the tendering contractors',
        'Kayınbiraderim ihaleye giren müteahhitlerden birinin yöneticisi', current_date);

select pg_temp.check('anybody may declare their own interest',
  (select count(*) from conflict_declarations
    where id = '0f400000-0000-0000-0000-000000000001'), 1::bigint);
select pg_temp.check('and a declaration is confidential by default',
  (select confidentiality::text from conflict_declarations
    where id = '0f400000-0000-0000-0000-000000000001'), 'confidential');

-- What somebody declares about their own affairs is for audit, not for
-- colleagues to read.
select pg_temp.act_as('44444444-4444-4444-4444-444444444444');  -- field team
select pg_temp.check('a colleague does not read it',
  (select count(*) from conflict_declarations), 0::bigint);

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');  -- trustee
select pg_temp.check('the board does, because that is what the register is for',
  (select count(*) from conflict_declarations), 1::bigint);

-- And an outside auditor does not, which is the more interesting half. These
-- rows are confidential, an external role is capped at internal whatever is
-- configured for it, so an audit of the declarations is something somebody
-- hands over by name rather than a standing subscription to what colleagues
-- have disclosed about themselves.
select pg_temp.act_as('dddd1111-1111-1111-1111-111111111111');  -- external auditor
select pg_temp.check('but an outside auditor needs it handed to them',
  (select count(*) from conflict_declarations), 0::bigint);

-- --- the first intake board (M10-12) --------------------------------------

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- director
select pg_temp.check('the readiness board draws every strand from a real register',
  (select count(*) from intake_readiness), 4::bigint);
select pg_temp.check('and counts the staff it has against the posts it needs',
  (select total from intake_readiness where strand = 'academic_staff'), 8);
select pg_temp.check('counting a programme with no established requirement as impeded',
  (select impeded from intake_readiness where strand = 'academic_staff'), 1);
select pg_temp.check('a drafted curriculum is not an approved one',
  (select ready from intake_readiness where strand = 'curriculum'), 0);



-- ===========================================================================
-- Procurement and contracts (M14)
-- ===========================================================================
--
-- The requirement says why this is not a convenience feature: "Bir vakıfta bu
-- sadece verimlilik meselesi değil — bağışçıya ve denetime hesap
-- verebilirliktir." So most of what is asserted below is about reasons being
-- recorded at the moment the decision is taken, and about the money bands
-- being the same ones that govern a payment.

set role authenticated;

-- --- the request, and who may commit the trust (M14-01) -------------------

select pg_temp.act_as('44444444-4444-4444-4444-444444444444');  -- field team

-- A need without a reason is a purchase somebody will later reconstruct a
-- reason for.
do $$
begin
  begin
    insert into procurement_requests (kind, need_en, justification_en, estimated_amount)
    values ('consultant', 'Somebody to look at the drainage', '   ', 400000);
    raise exception 'FAIL a procurement was raised with no justification';
  exception
    when check_violation then
      raise notice 'ok   a procurement request has to say why';
  end;
end;
$$;

insert into procurement_requests
  (id, reference_no, kind, need_en, need_tr, justification_en, estimated_amount,
   estimated_currency, needed_by, confidentiality)
values
  ('a1000000-0000-0000-0000-000000000001', 'PR-2026-01', 'legal_counsel',
   'Lead counsel for the appeal',
   'Temyiz için baş avukat',
   'The present advocate is retiring and the appeal is listed for February.',
   3000000, 'KES', current_date + 60, 'internal'),
  ('a1000000-0000-0000-0000-000000000002', 'PR-2026-02', 'contractor',
   'Main contractor for the second phase',
   'İkinci faz için ana müteahhit',
   'Phase one is complete and the preservation works cannot wait on a tender.',
   40000000, 'KES', current_date + 120, 'internal');

select pg_temp.check('anybody inside may ask for what they need',
  (select count(*) from procurement_requests), 2::bigint);

-- Somebody outside the approval band cannot approve at all, which is the
-- money rule rather than the separation rule.
do $$
begin
  begin
    perform public.approve_procurement('a1000000-0000-0000-0000-000000000001');
    raise exception 'FAIL the field team approved a three million commitment';
  exception
    when insufficient_privilege then
      raise notice 'ok   somebody outside the band cannot approve at all';
  end;
end;
$$;

-- Asking and approving are two acts, and this is the assertion that proves
-- it: the director IS in the band for three million, so the only thing that
-- can refuse them is the separation rule. Catching insufficient_privilege
-- here as well would let the test pass on the money rule and never notice if
-- the separation rule were removed.
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- director
insert into procurement_requests
  (id, reference_no, kind, need_en, justification_en, estimated_amount,
   estimated_currency, confidentiality)
values ('a1000000-0000-0000-0000-000000000003', 'PR-2026-03', 'supplier',
        'Site stationery and printing',
        'The site office has been buying ad hoc against no budget line.',
        120000, 'KES', 'internal');

do $$
begin
  begin
    perform public.approve_procurement('a1000000-0000-0000-0000-000000000003');
    raise exception 'FAIL the requester approved their own procurement';
  exception
    when check_violation then
      raise notice 'ok   the person who asked cannot be the one who approves';
  end;
end;
$$;

-- Three million is routine spending, which 0015 puts with the admin and the
-- director. A trustee is not in that band — and that is the point of reading
-- the band rather than assuming the most senior role may do everything.
-- Request 01 was raised by the field team, so the director approving it is
-- two people, as it should be.
select public.approve_procurement('a1000000-0000-0000-0000-000000000001',
  'Four candidates to be invited.');
select pg_temp.check('a routine commitment is approved by the director',
  (select state::text from procurement_requests
    where id = 'a1000000-0000-0000-0000-000000000001'), 'approved');
select pg_temp.check('and the approval carries their name',
  (select approved_by from procurement_requests
    where id = 'a1000000-0000-0000-0000-000000000001'),
  '22222222-2222-2222-2222-222222222222'::uuid);

-- Forty million is the trustees' band, and the director is not in it. The
-- same thresholds that decide who may approve a payment decide who may
-- commit the trust to a contract.
do $$
begin
  begin
    perform public.approve_procurement('a1000000-0000-0000-0000-000000000002');
    raise exception 'FAIL the director committed forty million';
  exception
    when insufficient_privilege then
      raise notice 'ok   forty million needs the band 0015 says it needs';
  end;
end;
$$;

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');  -- trustee
select public.approve_procurement('a1000000-0000-0000-0000-000000000002', 'Tender to proceed.');
select pg_temp.check('and a trustee may approve it',
  (select state::text from procurement_requests
    where id = 'a1000000-0000-0000-0000-000000000002'), 'approved');

do $$
begin
  begin
    perform public.approve_procurement('a1000000-0000-0000-0000-000000000002');
    raise exception 'FAIL a procurement was approved twice';
  exception
    when unique_violation then
      raise notice 'ok   and cannot approve it a second time';
  end;
end;
$$;

-- --- the candidate comparison (M14-02) ------------------------------------

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- director

-- The four advocates the requirement is actually about.
insert into procurement_candidates
  (id, request_id, name, scope_en, fee_amount, fee_currency, fee_basis,
   strengths_en, weaknesses_en, score, confidentiality)
values
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
   'Mwangi & Co Advocates', 'Appeal, from record to judgment', 2800000, 'KES', 'fixed',
   'Argued two ELC appeals last year', 'No Mombasa office', 82, 'internal'),
  ('a2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001',
   'Coast Legal LLP', 'Appeal and the contempt application', 3400000, 'KES', 'fixed',
   'On the ground in Mombasa', 'Acted for the county in 2019', 71, 'internal'),
  ('a2000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001',
   'Otieno Advocates', 'Appeal only', 2200000, 'KES', 'fixed',
   'Cheapest proposal', 'No appellate record in land matters', 54, 'internal'),
  ('a2000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001',
   'Nairobi Chambers', 'Appeal, with a second counsel', 5600000, 'KES', 'hourly',
   'Senior counsel available', 'Fee basis is hourly with no cap', 66, 'internal');

select pg_temp.check('four candidates can be compared side by side',
  (select count(*) from procurement_candidates
    where request_id = 'a1000000-0000-0000-0000-000000000001'), 4::bigint);

-- --- a candidate who has not quoted (0029) --------------------------------
--
-- Found by importing the real archive: of seven advocates approached, one had
-- quoted. The fee was NOT NULL, so the other six would have appeared on the
-- comparison offering to work for nothing.

insert into procurement_candidates
  (id, request_id, name, scope_en, fee_amount, fee_basis, confidentiality)
values
  ('a2000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001',
   'Asked and has not answered', 'Appeal', null, 'fixed', 'internal');

select pg_temp.check('a candidate who has not quoted a fee has no fee, not nought',
  (select fee_amount is null and fee_amount_kes is null from procurement_candidates
    where id = 'a2000000-0000-0000-0000-000000000005'), true);

-- But the price has to be known at the moment the work is awarded.
do $$
begin
  begin
    update procurement_candidates set outcome = 'selected',
      decision_note_en = 'Chosen on the strength of the appellate record'
     where id = 'a2000000-0000-0000-0000-000000000005';
    raise exception 'FAIL work was awarded at a price nobody had quoted';
  exception
    when check_violation then
      raise notice 'ok   but nobody is selected at a price they never quoted (0029)';
  end;
end;
$$;


-- The half that went missing in the meeting notes: why the other three were
-- not chosen.
do $$
begin
  begin
    update procurement_candidates
      set outcome = 'rejected', decided_on = current_date
     where id = 'a2000000-0000-0000-0000-000000000003';
    raise exception 'FAIL a candidate was rejected with no reason';
  exception
    when check_violation then
      raise notice 'ok   a rejection has to say why, not only a selection';
  end;
end;
$$;

update procurement_candidates
  set outcome = 'rejected', decided_on = current_date,
      decision_note_en = 'No appellate record in land matters, which is the whole brief.'
 where id = 'a2000000-0000-0000-0000-000000000003';
select pg_temp.check('and goes through once it does',
  (select count(*) from procurement_candidates where outcome = 'rejected'), 1::bigint);

-- Awarding is one act over two tables, so there is no window in which two
-- candidates are both selected.
select public.award_procurement('a2000000-0000-0000-0000-000000000001',
  'Only candidate with an ELC appellate record; fee within the estimate.');

select pg_temp.check('the award selects the candidate',
  (select outcome::text from procurement_candidates
    where id = 'a2000000-0000-0000-0000-000000000001'), 'selected');
select pg_temp.check('and closes the request in the same act',
  (select state::text from procurement_requests
    where id = 'a1000000-0000-0000-0000-000000000001'), 'awarded');

-- "We selected two of them" is a request that was never decided.
do $$
begin
  begin
    update procurement_candidates
      set outcome = 'selected', decided_on = current_date,
          decision_note_en = 'Also good.'
     where id = 'a2000000-0000-0000-0000-000000000002';
    raise exception 'FAIL two candidates were selected for one request';
  exception
    when unique_violation then
      raise notice 'ok   one request has one winner';
  end;
end;
$$;

do $$
begin
  begin
    perform public.award_procurement('a2000000-0000-0000-0000-000000000002', 'Changed our minds.');
    raise exception 'FAIL a closed request was awarded again';
  exception
    when unique_violation then
      raise notice 'ok   and a closed request cannot be awarded again';
  end;
end;
$$;

-- An award with no reasoning is the thing this module exists to prevent.
do $$
begin
  begin
    perform public.award_procurement('a2000000-0000-0000-0000-000000000004', '  ');
    raise exception 'FAIL an award was made with no reasoning';
  exception
    when check_violation then
      raise notice 'ok   an award without a reason is refused outright';
  end;
end;
$$;

-- --- the contract register (M14-03) ---------------------------------------

-- A register of contracts whose contracts are not attached is a list of
-- assertions, which is the same rule M2, M9 and M10 already run on.
do $$
begin
  begin
    insert into contracts (counterparty_name, subject_en, value_amount, state, signed_on)
    values ('Mwangi & Co Advocates', 'Appeal retainer', 2800000, 'active', current_date);
    raise exception 'FAIL an active contract was recorded with no document';
  exception
    when check_violation then
      raise notice 'ok   a contract past draft has its document in the vault';
  end;
end;
$$;

insert into contracts
  (id, reference_no, request_id, candidate_id, counterparty_name, stakeholder_id,
   subject_en, subject_tr, value_amount, value_currency, value_basis,
   signed_on, starts_on, ends_on, renewal_on, notice_days,
   termination_en, document_id, state, confidentiality)
values
  ('a3000000-0000-0000-0000-000000000001', 'CT-2026-01',
   'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001',
   'Mwangi & Co Advocates', '0b000000-0000-0000-0000-000000000003',
   'Conduct of the ELC appeal', 'ELC temyizinin yürütülmesi',
   2800000, 'KES', 'fixed',
   current_date - 10, current_date - 10, current_date + 20, current_date + 5, 30,
   'Either party on thirty days written notice.',
   '1b000000-0000-0000-0000-000000000001', 'active', 'internal');

select pg_temp.check('the contract register holds the term and the renewal date',
  (select count(*) from contracts where renewal_on is not null and ends_on is not null),
  1::bigint);

do $$
begin
  begin
    update contracts set ends_on = starts_on - 1
     where id = 'a3000000-0000-0000-0000-000000000001';
    raise exception 'FAIL a contract ended before it started';
  exception
    when check_violation then
      raise notice 'ok   a contract cannot end before it starts';
  end;
end;
$$;

do $$
begin
  begin
    update contracts set state = 'terminated'
     where id = 'a3000000-0000-0000-0000-000000000001';
    raise exception 'FAIL a contract was torn up with no reason or date';
  exception
    when check_violation then
      raise notice 'ok   tearing one up needs the date and the reason';
  end;
end;
$$;

-- --- the term becomes an obligation (M14-04) ------------------------------

insert into contract_terms
  (id, contract_id, clause, title_en, title_tr, detail_en, owed_by, due_on, confidentiality)
values
  ('a4000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001',
   'cl. 4.1', 'File the record of appeal', 'Temyiz dosyasını sun',
   'Within sixty days of the retainer.', 'counterparty', current_date + 50, 'internal'),
  ('a4000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000001',
   'cl. 6.2', 'Pay the retainer on signature', 'İmzada vekâlet ücretini öde',
   null, 'us', current_date - 5, 'internal');

select pg_temp.check('a contract term lands in the obligations register by itself',
  (select count(*) from contract_terms ct
    join obligations o on o.id = ct.obligation_id
    where ct.contract_id = 'a3000000-0000-0000-0000-000000000001'
      and o.source = 'contract'), 2::bigint);

-- Which side owes it decides who the obligor is, and getting that backwards
-- would put the trust's own duties on the advocate's list.
select pg_temp.check('a duty the other side owes names them as the obligor',
  (select o.obligor_name from contract_terms ct
    join obligations o on o.id = ct.obligation_id
    where ct.id = 'a4000000-0000-0000-0000-000000000001'),
  'Mwangi & Co Advocates');
select pg_temp.check('and one we owe names the trust',
  (select o.obligor_name from contract_terms ct
    join obligations o on o.id = ct.obligation_id
    where ct.id = 'a4000000-0000-0000-0000-000000000002'),
  'African University Trust of Kenya');
select pg_temp.check('the obligation carries the contract document as its source',
  (select o.source_document_id from contract_terms ct
    join obligations o on o.id = ct.obligation_id
    where ct.id = 'a4000000-0000-0000-0000-000000000001'),
  '1b000000-0000-0000-0000-000000000001'::uuid);

-- --- the 90/60/30 warning (M14-05) ---------------------------------------

select pg_temp.check('the renewal date lands in the nearest band',
  (select renewal_band::text from contract_alerts
    where contract_id = 'a3000000-0000-0000-0000-000000000001'), 'within_30');
select pg_temp.check('and so does the end of the term',
  (select expiry_band::text from contract_alerts
    where contract_id = 'a3000000-0000-0000-0000-000000000001'), 'within_30');
select pg_temp.check('nobody has drafted the successor yet',
  (select renewal_drafted from contract_alerts
    where contract_id = 'a3000000-0000-0000-0000-000000000001'), false);

-- A renewal somebody has already written is not a worry, and the alert stops
-- saying it is.
insert into contracts
  (id, reference_no, counterparty_name, subject_en, value_amount, value_basis,
   supersedes_contract_id, state, confidentiality)
values ('a3000000-0000-0000-0000-000000000002', 'CT-2027-01', 'Mwangi & Co Advocates',
        'Conduct of the ELC appeal, renewed', 3000000, 'fixed',
        'a3000000-0000-0000-0000-000000000001', 'draft', 'internal');

select pg_temp.check('once a successor is drafted the alert says so',
  (select renewal_drafted from contract_alerts
    where contract_id = 'a3000000-0000-0000-0000-000000000001'), true);

-- Both dates reach the one calendar anybody looks at a week in, as two rows,
-- because deciding about a renewal and the contract ending are two different
-- things to do.
select pg_temp.check('a contract with both dates puts two rows on the calendar',
  (select count(*) from project_calendar
    where kind = 'contract' and id = 'a3000000-0000-0000-0000-000000000001'), 2::bigint);

-- --- supplier performance (M14-06) ---------------------------------------

insert into supplier_reviews
  (id, contract_id, stakeholder_id, period_start, period_end,
   quality, timeliness, cost_control, cooperation, note_en, confidentiality)
values ('a5000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001',
        '0b000000-0000-0000-0000-000000000003', current_date - 90, current_date,
        4, 2, 5, 4, 'Sound on the law, late with the record twice.', 'internal');

select pg_temp.check('the overall score is the average of the four, not a seventh number',
  (select overall from supplier_reviews
    where id = 'a5000000-0000-0000-0000-000000000001'), 3.75::numeric);

-- A review the person it embarrasses can revise is not evidence.
do $$
begin
  begin
    update supplier_reviews set timeliness = 5
     where id = 'a5000000-0000-0000-0000-000000000001';
    raise exception 'FAIL a performance review was revised after the fact';
  exception
    when insufficient_privilege then
      raise notice 'ok   a performance review is corrected by a new one, not an edit';
  end;
end;
$$;

-- Both parties exist, so this fails on the rule rather than on a dangling
-- reference: a review about two suppliers is a review about neither.
do $$
begin
  begin
    insert into supplier_reviews
      (stakeholder_id, contractor_id, quality, timeliness, cost_control, cooperation, note_en)
    values ('0b000000-0000-0000-0000-000000000003',
            '1c000000-0000-0000-0000-000000000010', 3, 3, 3, 3, 'Who is this about?');
    raise exception 'FAIL a review named two parties';
  exception
    when check_violation then
      raise notice 'ok   a review is about exactly one party';
  end;
end;
$$;

-- And none at all is the same mistake from the other side.
do $$
begin
  begin
    insert into supplier_reviews
      (quality, timeliness, cost_control, cooperation, note_en)
    values (3, 3, 3, 3, 'About nobody in particular.');
    raise exception 'FAIL a review named no party';
  exception
    when check_violation then
      raise notice 'ok   and never about none';
  end;
end;
$$;

-- --- the payment schedule (M14-07) ---------------------------------------

insert into contract_milestones
  (id, contract_id, sequence, title_en, due_on, amount, currency, state, confidentiality)
values
  ('a6000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001',
   1, 'On signature', current_date - 10, 1400000, 'KES', 'planned', 'internal'),
  ('a6000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000001',
   2, 'On judgment', current_date + 200, 1400000, 'KES', 'planned', 'internal');

select pg_temp.check('the schedule adds up to the contract value',
  (select scheduled_kes from contract_settlement
    where contract_id = 'a3000000-0000-0000-0000-000000000001'), 2800000.00::numeric);
select pg_temp.check('and nothing is over-committed yet',
  (select over_committed from contract_settlement
    where contract_id = 'a3000000-0000-0000-0000-000000000001'), false);

-- Paid, with no voucher, would be a schedule that disagrees with the ledger.
do $$
begin
  begin
    update contract_milestones set state = 'paid'
     where id = 'a6000000-0000-0000-0000-000000000001';
    raise exception 'FAIL a milestone was marked paid with no voucher';
  exception
    when check_violation then
      raise notice 'ok   a milestone marked paid has to name its voucher';
  end;
end;
$$;

-- A variation that raises the price is a real thing, so over-committing is
-- reported rather than refused — blocking it only moves the true figure into
-- a spreadsheet.
insert into contract_milestones
  (contract_id, sequence, title_en, amount, currency, state, confidentiality)
values ('a3000000-0000-0000-0000-000000000001', 3, 'Variation: contempt application',
        900000, 'KES', 'planned', 'internal');
select pg_temp.check('a schedule that outgrows the contract is named, not blocked',
  (select over_committed from contract_settlement
    where contract_id = 'a3000000-0000-0000-0000-000000000001'), true);

-- --- who sees the commercial detail --------------------------------------

-- The module exists to be answerable to the auditors, so they are named in
-- the rule rather than left to a per-record grant.
select pg_temp.act_as('dddd1111-1111-1111-1111-111111111111');  -- external auditor
select pg_temp.check('an outside auditor reads the procurement register',
  (select count(*) from procurement_requests), 3::bigint);
-- Five by now: the four advocates plus the one who was asked and has not
-- answered, which 0029 lets the register hold.
select pg_temp.check('and the candidate comparison with its fees',
  (select count(*) from procurement_candidates
    where request_id = 'a1000000-0000-0000-0000-000000000001'), 5::bigint);
select pg_temp.check('and the contracts',
  (select count(*) from contracts), 2::bigint);
-- Reading is not keeping: an auditor does not award contracts.
do $$
begin
  begin
    insert into procurement_requests (kind, need_en, justification_en, estimated_amount)
    values ('supplier', 'Something the auditor wants', 'Because.', 100);
    raise exception 'FAIL an auditor raised a procurement';
  exception
    when insufficient_privilege then
      raise notice 'ok   but does not run a procurement of their own';
  end;
end;
$$;

-- A contractor is inside the internal tier but this is none of their
-- business; the fees of rival bidders least of all.
select pg_temp.act_as('77777777-7777-7777-7777-777777777777');  -- contractor
select pg_temp.check('a contractor sees no procurement register',
  (select count(*) from procurement_requests), 0::bigint);
select pg_temp.check('nor the fees their rivals quoted',
  (select count(*) from procurement_candidates), 0::bigint);

-- The advocate the contract is with sees their own engagement, because the
-- counterparty is a person in the stakeholder register with a profile.
select pg_temp.act_as('55555555-5555-5555-5555-555555555555');  -- advocate one
select pg_temp.check('the counterparty reads their own contract',
  (select count(*) from contracts where id = 'a3000000-0000-0000-0000-000000000001'),
  1::bigint);
select pg_temp.check('and its terms',
  (select count(*) from contract_terms
    where contract_id = 'a3000000-0000-0000-0000-000000000001'), 2::bigint);
select pg_temp.check('but not the comparison that chose them',
  (select count(*) from procurement_candidates), 0::bigint);



-- ===========================================================================
-- The project backbone: phases, milestones, baselines, chronology (M15)
-- ===========================================================================
--
-- "Şu anda portalda 'proje planı' diye bir şey yok — sadece modüller var."
-- So what is asserted here is mostly about the time axis holding two numbers
-- apart that a single status field would collapse: how far a date has been
-- moved, and how late the thing actually was.

set role authenticated;
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- director

-- --- milestones (M15-01) --------------------------------------------------

insert into milestones
  (id, code, phase_id, title_en, title_tr, target_on, state, critical,
   owner_profile_id, confidentiality)
values
  ('b1000000-0000-0000-0000-000000000001', 'MS-01', '1c000000-0000-0000-0000-000000000001',
   'Court lifts the prohibition on Block A1', 'Mahkeme A1 blokundaki yasağı kaldırır',
   current_date + 40, 'planned', true,
   '22222222-2222-2222-2222-222222222222', 'internal'),
  ('b1000000-0000-0000-0000-000000000002', 'MS-02', '1c000000-0000-0000-0000-000000000001',
   'Block A1 roof watertight', 'A1 blok çatısı su almaz',
   current_date - 30, 'planned', true,
   '44444444-4444-4444-4444-444444444444', 'internal'),
  ('b1000000-0000-0000-0000-000000000003', 'MS-03', null,
   'First intake enrolled', 'İlk öğrenci alımı tamamlandı',
   current_date + 400, 'planned', false,
   '22222222-2222-2222-2222-222222222222', 'internal');

select pg_temp.check('the plan has milestones with a target and an owner',
  (select count(*) from milestones), 3::bigint);

-- Achieved means achieved. The same rule as a fulfilled obligation, a met
-- accreditation standard and reported site progress: there has to be
-- something in the vault.
do $$
begin
  begin
    update milestones set state = 'achieved', achieved_on = current_date
     where id = 'b1000000-0000-0000-0000-000000000002';
    raise exception 'FAIL a milestone was marked achieved with no evidence';
  exception
    when check_violation then
      raise notice 'ok   a milestone cannot be achieved without the document';
  end;
end;
$$;

-- Nor can a date be missed that was never set.
do $$
begin
  begin
    insert into milestones (title_en, state, confidentiality)
    values ('Something that was always vague', 'missed', 'internal');
    raise exception 'FAIL a milestone was missed with no target date';
  exception
    when check_violation then
      raise notice 'ok   nor missed if there was never a date to miss';
  end;
end;
$$;

-- Abandoning one needs a reason, so a quietly dropped milestone is not a
-- state anybody can reach.
do $$
begin
  begin
    update milestones set state = 'abandoned'
     where id = 'b1000000-0000-0000-0000-000000000003';
    raise exception 'FAIL a milestone was abandoned with no reason';
  exception
    when check_violation then
      raise notice 'ok   and abandoning one has to say why';
  end;
end;
$$;

-- The slip is the subtraction, stored, because it is the number anybody
-- actually wants and two screens computing it is how they come to disagree.
update milestones
  set state = 'achieved',
      achieved_on = current_date - 5,
      evidence_document_id = '1b000000-0000-0000-0000-000000000001'
 where id = 'b1000000-0000-0000-0000-000000000002';

select pg_temp.check('the slip is the subtraction of the two dates',
  (select slip_days from milestones where id = 'b1000000-0000-0000-0000-000000000002'), 25);

-- Early is a negative number, not a zero. A project that reports nought for
-- everything delivered early has thrown away half its own history.
insert into milestones
  (id, title_en, target_on, achieved_on, state, evidence_document_id, confidentiality)
values ('b1000000-0000-0000-0000-000000000004', 'Bond lodged',
        current_date, current_date - 10, 'achieved',
        '1b000000-0000-0000-0000-000000000001', 'internal');
select pg_temp.check('and something delivered early reads as negative, not nought',
  (select slip_days from milestones where id = 'b1000000-0000-0000-0000-000000000004'), -10);

-- A milestone with only one of the two dates has an unknown slip, which is
-- not the same as no slip.
select pg_temp.check('a milestone not yet delivered has no slip, not a slip of nought',
  (select slip_days from milestones where id = 'b1000000-0000-0000-0000-000000000001'),
  null::int);

-- --- one dependency mechanism (M15-01, M15-05) ---------------------------

-- The chain the requirement asks for: a ruling, then the works, then the
-- intake. It goes in 0016's table rather than a parallel one, which is what
-- makes it a single walk.
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');  -- trustee
insert into dependencies
  (blocker_legal_case_id, dependent_milestone_id, note_en, confidentiality)
values ('aaaa0000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001',
        'The prohibition is lifted by the ELC, or it is not lifted at all.', 'internal');
insert into dependencies
  (blocker_milestone_id, dependent_milestone_id, note_en, confidentiality)
values ('b1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003',
        'No intake into a building nobody is allowed to finish.', 'internal');

select pg_temp.check('a milestone can wait on a case and on another milestone',
  (select count(*) from dependency_status
    where dependent_milestone_id is not null), 2::bigint);

-- Still three-valued where the blocker is a court case: 0016 was right to
-- refuse to guess, and adding milestones did not change that.
select pg_temp.check('a milestone waiting on a court case still says it cannot tell',
  (select blocker_settled from dependency_status
    where blocker_legal_case_id = 'aaaa0000-0000-0000-0000-000000000002'
      and dependent_milestone_id = 'b1000000-0000-0000-0000-000000000001'),
  null::boolean);
select pg_temp.check('while one waiting on an unachieved milestone reads as unsettled',
  (select blocker_settled from dependency_status
    where blocker_milestone_id = 'b1000000-0000-0000-0000-000000000001'), false);

do $$
begin
  begin
    insert into dependencies (blocker_milestone_id, dependent_milestone_id, confidentiality)
    values ('b1000000-0000-0000-0000-000000000001',
            'b1000000-0000-0000-0000-000000000001', 'internal');
    raise exception 'FAIL a milestone was made to wait on itself';
  exception
    when check_violation then
      raise notice 'ok   a milestone cannot wait on itself';
  end;
end;
$$;

do $$
begin
  begin
    insert into dependencies
      (blocker_milestone_id, blocker_legal_case_id, dependent_milestone_id, confidentiality)
    values ('b1000000-0000-0000-0000-000000000002',
            'aaaa0000-0000-0000-0000-000000000002',
            'b1000000-0000-0000-0000-000000000003', 'internal');
    raise exception 'FAIL a dependency named two blockers';
  exception
    when check_violation then
      raise notice 'ok   and exactly one thing sits on each side';
  end;
end;
$$;

-- --- baselines (M15-06) ---------------------------------------------------

select public.take_baseline('Board plan, this sitting', 'Frozen for the trustee pack.');

select pg_temp.check('a baseline freezes every milestone that is still live',
  (select count(*) from baseline_milestones bm
    join plan_baselines b on b.id = bm.baseline_id
    where b.name = 'Board plan, this sitting'), 4::bigint);

-- Now the plan moves, which is the thing a baseline exists to catch.
update milestones set target_on = current_date + 120
 where id = 'b1000000-0000-0000-0000-000000000001';

select pg_temp.check('and the variance says how far the date was moved',
  (select target_moved_days from baseline_variance
    where milestone_id = 'b1000000-0000-0000-0000-000000000001'), 80);

-- Two different numbers, held apart. A project that moves its target four
-- times and reports on time is exploiting exactly this conflation.
select pg_temp.check('which is a different number from how late delivery was',
  (select delivery_slip_days from baseline_variance
    where milestone_id = 'b1000000-0000-0000-0000-000000000002'), 25);
select pg_temp.check('and a date nobody moved shows no movement',
  (select target_moved_days from baseline_variance
    where milestone_id = 'b1000000-0000-0000-0000-000000000003'), 0);

-- A baseline that can be edited is the current plan wearing an old date.
do $$
begin
  begin
    update plan_baselines set taken_on = current_date - 180
     where name = 'Board plan, this sitting';
    raise exception 'FAIL a baseline was back-dated';
  exception
    when insufficient_privilege then
      raise notice 'ok   a baseline cannot be back-dated afterwards';
  end;
end;
$$;

do $$
begin
  begin
    update baseline_milestones set target_on = current_date + 500
     where milestone_id = 'b1000000-0000-0000-0000-000000000001';
    raise exception 'FAIL a frozen target was rewritten';
  exception
    when insufficient_privilege then
      raise notice 'ok   nor can a frozen target be rewritten';
  end;
end;
$$;

do $$
begin
  begin
    perform public.take_baseline('   ');
    raise exception 'FAIL an unnamed baseline was taken';
  exception
    when check_violation then
      raise notice 'ok   and a baseline needs a name to be referred to by';
  end;
end;
$$;

select pg_temp.act_as('77777777-7777-7777-7777-777777777777');  -- contractor
do $$
begin
  begin
    perform public.take_baseline('Contractor plan');
    raise exception 'FAIL an outside party baselined the project plan';
  exception
    when insufficient_privilege then
      raise notice 'ok   an outside party does not baseline the project plan';
  end;
end;
$$;

-- --- the chronology (M15-07) ---------------------------------------------

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- director

-- "her olay kaynağa bağlı". The requirement gives the reason: institutional
-- memory AND legal evidence. An entry nobody can trace is neither.
do $$
begin
  begin
    insert into chronology_entries (occurred_on, category, title_en, confidentiality)
    values ('1993-06-01', 'founding', 'Something everybody remembers differently', 'internal');
    raise exception 'FAIL a chronology entry was recorded with no source';
  exception
    when check_violation then
      raise notice 'ok   every chronology entry names where it comes from';
  end;
end;
$$;

-- A 1993 event known only to the year. Recording it as the first of January
-- and printing that would invent a fact somebody later reads as one.
insert into chronology_entries
  (id, occurred_on, precision, category, title_en, title_tr, source_note, confidentiality)
values ('b2000000-0000-0000-0000-000000000001', '1993-01-01', 'year', 'founding',
        'The trust is constituted', 'Vakıf kuruluyor',
        'Recited in the 2025 amended trust deed, recital 2.', 'internal');

select pg_temp.check('a date known only to the year says so',
  (select precision::text from chronology_entries
    where id = 'b2000000-0000-0000-0000-000000000001'), 'year');

-- And a document is the better source where one exists.
insert into chronology_entries
  (occurred_on, category, title_en, document_id, confidentiality)
values ('2013-04-02', 'legal', 'ELC/134/2013 filed',
        '1b000000-0000-0000-0000-000000000001', 'internal');

select pg_temp.check('the chronology joins the hand-recorded years to the registers',
  (select count(distinct source) from project_chronology) >= 2, true);
select pg_temp.check('and reaches back before the registers existed',
  (select min(occurred_on) from project_chronology), '1993-01-01'::date);

-- Only things that happened. A target date is a plan, and a chronology of
-- intentions is how a project talks itself into believing its schedule.
select pg_temp.check('an achieved milestone is in the chronology',
  (select count(*) from project_chronology
    where source = 'milestone' and id = 'b1000000-0000-0000-0000-000000000002'), 1::bigint);
select pg_temp.check('but one that is merely planned is not',
  (select count(*) from project_chronology
    where source = 'milestone' and id = 'b1000000-0000-0000-0000-000000000001'), 0::bigint);

-- Nothing in the future, and nothing before the trust could have existed.
do $$
begin
  begin
    insert into chronology_entries (occurred_on, category, title_en, source_note, confidentiality)
    values (current_date + 30, 'other', 'Something that has not happened', 'A guess.', 'internal');
    raise exception 'FAIL the chronology accepted a future event';
  exception
    when check_violation then
      raise notice 'ok   a chronology records what happened, not what is planned';
  end;
end;
$$;

-- --- phases, with what is actually in them (M15-02) ----------------------

update project_phases
set scope_en = 'Substructure and frame for blocks A1 and B2.',
    objective_en = 'Weatherproof shells before the long rains.'
where id = '1c000000-0000-0000-0000-000000000001';

select pg_temp.check('a phase says what it covers',
  (select scope_en is not null from phase_position
    where phase_id = '1c000000-0000-0000-0000-000000000001'), true);
select pg_temp.check('and what is counted in it comes from the registers',
  (select milestones from phase_position
    where phase_id = '1c000000-0000-0000-0000-000000000001'), 2);
select pg_temp.check('with the blocks counted the same way',
  (select blocks from phase_position
    where phase_id = '1c000000-0000-0000-0000-000000000001') >= 1, true);

-- --- the countdown strip (M15-04) ----------------------------------------

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');  -- trustee

-- A court date is critical whatever anybody marks: nobody sets it and nobody
-- can move it.
select pg_temp.check('court dates are on the critical strip by their nature',
  (select count(*) from critical_dates where kind = 'hearing') >= 1, true);

-- A milestone whose target passed while it was still open is flagged by the
-- calendar, so it reaches the strip without anybody marking it.
insert into milestones
  (id, title_en, target_on, state, critical, confidentiality)
values ('b1000000-0000-0000-0000-000000000005', 'Bond renewed',
        current_date - 3, 'planned', true, 'internal');
select pg_temp.check('a target that passed with the milestone still open reaches it too',
  (select count(*) from critical_dates
    where kind = 'milestone' and id = 'b1000000-0000-0000-0000-000000000005'), 1::bigint);
select pg_temp.check('and the strip says how far away each date is, signed',
  (select days_away from critical_dates
    where kind = 'milestone' and id = 'b1000000-0000-0000-0000-000000000005'), -3);

-- Acknowledging takes it off YOUR strip. The banner this replaces had a
-- dismiss button that deleted the court date for every user of the portal.
insert into calendar_acknowledgements (kind, entry_id)
values ('milestone', 'b1000000-0000-0000-0000-000000000005');
select pg_temp.check('acknowledging a date takes it off your own strip',
  (select count(*) from critical_dates
    where kind = 'milestone' and id = 'b1000000-0000-0000-0000-000000000005'), 0::bigint);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- director
select pg_temp.check('and leaves it on everybody else''s',
  (select count(*) from critical_dates
    where kind = 'milestone' and id = 'b1000000-0000-0000-0000-000000000005'), 1::bigint);
select pg_temp.check('nor can anybody read whose acknowledgement it was',
  (select count(*) from calendar_acknowledgements), 0::bigint);

-- --- who may move the plan ------------------------------------------------

select pg_temp.act_as('44444444-4444-4444-4444-444444444444');  -- field team
-- The site team own site milestones and move them, which is the point of
-- recording an owner.
update milestones set target_on = current_date + 10
 where id = 'b1000000-0000-0000-0000-000000000005';
select pg_temp.check('the site team may move the plan they keep',
  (select target_on from milestones where id = 'b1000000-0000-0000-0000-000000000005'),
  (current_date + 10)::date);

select pg_temp.act_as('77777777-7777-7777-7777-777777777777');  -- contractor
select pg_temp.check('an outside party sees no milestones',
  (select count(*) from milestones), 0::bigint);
do $$
begin
  begin
    insert into milestones (title_en, target_on, confidentiality)
    values ('A date the contractor would prefer', current_date + 500, 'internal');
    raise exception 'FAIL an outside party wrote to the project plan';
  exception
    when insufficient_privilege then
      raise notice 'ok   nor writes to the project plan';
  end;
end;
$$;


-- --- a reference number is a label, not an event (0030) --------------------

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');  -- trustee
select pg_temp.check('a numbered resolution still says what was decided',
  (select title_en from project_chronology
    where source = 'decision' and id = '10000000-0000-0000-0000-000000000001'),
  'D-2026-01 — File our own Record of Appeal.');


-- --- a meeting minuted in two languages is one meeting (G-02, 0028) ---------
--
-- The Notion Meeting Hub keeps the same 22 meetings in an English database
-- and a Turkish one. Imported as two sources they would have become 44
-- meetings, and this column is what let them be merged into 22 without
-- throwing away the title the Turkish-speaking half of the team reads.

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- director
select pg_temp.check('a meeting carries both of its titles',
  (select title_tr from meetings where id = '0e000000-0000-0000-0000-000000000001'),
  'Hukuk stratejisi');
select pg_temp.check('and one minuted in a single language says so with a null',
  (select title_tr is null from meetings where id = '0e000000-0000-0000-0000-000000000002'),
  true);
-- The English title is the one that is never absent, which is why the client
-- falls back to it rather than to the empty string.
select pg_temp.check('the English title is not nullable',
  (select is_nullable from information_schema.columns
    where table_schema = 'public' and table_name = 'meetings' and column_name = 'title'),
  'NO');


-- ===========================================================================
-- Communication and notification (M11)
-- ===========================================================================

set role authenticated;

-- --- channels (M11-04) ----------------------------------------------------
--
-- Membership WIDENS the role default, which is the design decision this block
-- is really about: a membership table that decided visibility on its own
-- would start empty and hide every existing thread from everybody.

select pg_temp.act_as('44444444-4444-4444-4444-444444444444');  -- field team
select pg_temp.check('the field team is not in the trustee channel',
  (select count(*) from communication_threads
    where id = '1f000000-0000-0000-0000-000000000001'), 0::bigint);
-- And it is the channel keeping them out, not their clearance: the thread is
-- internal and their clearance is confidential, which is higher.
select pg_temp.check('though their clearance would have let them read it',
  app.can_read('internal'::confidentiality), true);

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');  -- trustee
select pg_temp.check('a trustee is in it by role, with nobody adding them',
  (select count(*) from communication_threads
    where id = '1f000000-0000-0000-0000-000000000001'), 1::bigint);

select pg_temp.act_as('cccc1111-1111-1111-1111-111111111111');  -- quantity surveyor
select pg_temp.check('and an outside person added by name is in it too',
  (select count(*) from communication_threads
    where id = '1f000000-0000-0000-0000-000000000001'), 1::bigint);
select pg_temp.check('which is the only way they are in it',
  app.in_channel('finance'::comm_channel), false);

select pg_temp.act_as('77777777-7777-7777-7777-777777777777');  -- contractor
select pg_temp.check('the general channel holds everybody, inside and out',
  app.in_channel('general'::comm_channel), true);

-- --- a thread takes the visibility of what it is about (M11-05) ------------

-- The contractor is in the general channel and the thread is internal, so the
-- restricted case behind it is the only thing that can keep them out.
select pg_temp.check('a thread on a case you cannot see is not visible either',
  (select count(*) from communication_threads
    where id = '1f000000-0000-0000-0000-000000000002'), 0::bigint);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- director
select pg_temp.check('while somebody who may see the case reads it',
  (select count(*) from communication_threads
    where id = '1f000000-0000-0000-0000-000000000002'), 1::bigint);

-- --- announcements are one-way (M11-11) -----------------------------------

select pg_temp.act_as('44444444-4444-4444-4444-444444444444');  -- field team
do $$
begin
  begin
    insert into thread_messages (thread_id, sender_id, body)
    values ('1f000000-0000-0000-0000-000000000003',
            '44444444-4444-4444-4444-444444444444', 'Noted, thanks');
    raise exception 'FAIL an announcement was replied to';
  exception
    when insufficient_privilege then
      raise notice 'ok   an announcement cannot be replied to (M11-11)';
  end;
end;
$$;

-- But it can be acknowledged, which is the mechanism that replaces replying.
insert into announcement_receipts (thread_id, user_id)
values ('1f000000-0000-0000-0000-000000000003', '44444444-4444-4444-4444-444444444444');
select pg_temp.check('it is acknowledged instead, and that is recorded (M11-08)',
  (select count(*) from announcement_receipts
    where thread_id = '1f000000-0000-0000-0000-000000000003'), 1::bigint);

-- Who saw it is for whoever announced it, not for colleagues to browse.
select pg_temp.check('and one person cannot read whose acknowledgement it was',
  (select count(*) from announcement_receipts
    where user_id <> '44444444-4444-4444-4444-444444444444'), 0::bigint);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- director
select pg_temp.check('the announcer sees the reach, against who could see it',
  (select seen from announcement_reach
    where thread_id = '1f000000-0000-0000-0000-000000000003'), 1::bigint);
select pg_temp.check('with a denominator that is the audience, not everybody',
  (select could_see > 0 from announcement_reach
    where thread_id = '1f000000-0000-0000-0000-000000000003'), true);

-- --- a message is a record, not a draft (M11-02, M11-03) -------------------

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');  -- trustee
do $$
begin
  begin
    update thread_messages set body = 'What I meant to say'
     where id = '1f000000-0000-0000-0000-000000000011';
    raise exception 'FAIL a message was edited after the fact';
  exception
    when insufficient_privilege then
      raise notice 'ok   a message cannot be edited after it is sent';
  end;
end;
$$;

-- --- critical notifications cannot be switched off (M11-07) ---------------

insert into notification_preferences (user_id, topic, medium, enabled)
values ('33333333-3333-3333-3333-333333333333', 'digest', 'email', false);
select pg_temp.check('an ordinary topic can be turned off',
  (select enabled from notification_preferences
    where user_id = '33333333-3333-3333-3333-333333333333'
      and topic = 'digest' and medium = 'email'), false);

do $$
begin
  begin
    insert into notification_preferences (user_id, topic, medium, enabled)
    values ('33333333-3333-3333-3333-333333333333', 'hearing', 'in_app', false);
    raise exception 'FAIL a hearing notification was switched off';
  exception
    when check_violation then
      raise notice 'ok   a hearing cannot be switched off in the portal (M11-07)';
  end;
end;
$$;

-- The rule is about the floor, not about every medium: somebody may decline
-- to be messaged on WhatsApp about a hearing and still be told.
insert into notification_preferences (user_id, topic, medium, enabled)
values ('33333333-3333-3333-3333-333333333333', 'hearing', 'whatsapp', false);
select pg_temp.check('but the medium above the floor is theirs to choose',
  app.medium_is_on('33333333-3333-3333-3333-333333333333', 'hearing', 'whatsapp'), false);
select pg_temp.check('and the floor stays on whatever they have said',
  app.medium_is_on('33333333-3333-3333-3333-333333333333', 'hearing', 'in_app'), true);

-- Preferences are nobody else's business, an administrator's included.
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');  -- admin
select pg_temp.check('an administrator cannot read how somebody is reached',
  (select count(*) from notification_preferences
    where user_id = '33333333-3333-3333-3333-333333333333'), 0::bigint);

-- --- the outbox tells the truth about what was sent (M11-06) --------------

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- director
select public.raise_notification(
  'hearing', 'The appeal is listed for 12 February',
  array['33333333-3333-3333-3333-333333333333']::uuid[],
  'Temyiz 12 Şubat''a verildi', null, true);

select pg_temp.check('an in-app delivery is queued, because that one works',
  (select state::text from notification_deliveries d
    join notifications n on n.id = d.notification_id
   where d.recipient_id = '33333333-3333-3333-3333-333333333333'
     and d.medium = 'in_app' and n.topic = 'hearing'), 'queued');

select pg_temp.check('and one with no provider is recorded unconfigured, not sent',
  (select state::text from notification_deliveries d
    join notifications n on n.id = d.notification_id
   where d.recipient_id = '33333333-3333-3333-3333-333333333333'
     and d.medium = 'email' and n.topic = 'hearing'), 'unconfigured');

-- The medium the trustee switched off two assertions ago.
select pg_temp.check('a medium somebody declined produces no delivery at all',
  (select count(*) from notification_deliveries d
    join notifications n on n.id = d.notification_id
   where d.recipient_id = '33333333-3333-3333-3333-333333333333'
     and d.medium = 'whatsapp' and n.topic = 'hearing'), 0::bigint);

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');  -- trustee
select pg_temp.check('the recipient finds it in their inbox',
  (select count(*) from my_notifications where topic = 'hearing'), 1::bigint);
select pg_temp.check('and the inbox says which media were never going to arrive',
  (select 'email' = any (awaiting_a_provider) from my_notifications
    where topic = 'hearing'), true);

-- A recipient may say they have read it. They may not rewrite what the
-- provider did, which is the only other thing on the row.
update notification_deliveries set read_at = now()
 where recipient_id = '33333333-3333-3333-3333-333333333333' and medium = 'in_app';
select pg_temp.check('marking your own delivery read is yours to do',
  (select count(*) from notification_deliveries
    where recipient_id = '33333333-3333-3333-3333-333333333333'
      and medium = 'in_app' and read_at is not null), 1::bigint);

do $$
begin
  begin
    update notification_deliveries set state = 'delivered'
     where recipient_id = '33333333-3333-3333-3333-333333333333' and medium = 'email';
    raise exception 'FAIL a recipient rewrote a delivery state';
  exception
    when insufficient_privilege then
      raise notice 'ok   but the delivery state is the provider''s answer, not theirs';
  end;
end;
$$;

select pg_temp.act_as('77777777-7777-7777-7777-777777777777');  -- contractor
do $$
begin
  begin
    perform public.raise_notification(
      'announcement', 'Everyone please approve my claim',
      array['33333333-3333-3333-3333-333333333333']::uuid[]);
    raise exception 'FAIL an outside party wrote into somebody''s inbox';
  exception
    when insufficient_privilege then
      raise notice 'ok   an outside party cannot raise one under the portal''s name';
  end;
end;
$$;

select pg_temp.check('nor read a notification addressed to somebody else',
  (select count(*) from notifications), 0::bigint);

-- --- official correspondence (M11-12) -------------------------------------

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- director
select pg_temp.check('an unacknowledged letter is on the register as exactly that',
  (select delivery_confirmed_on is null from correspondence
    where id = '1f000000-0000-0000-0000-000000000030'), true);

do $$
begin
  begin
    insert into correspondence
      (direction, route, subject_en, sent_on, counterparty_name, confidentiality)
    values ('outgoing', 'letter', 'A letter with no letter', current_date,
            'County Government of Mombasa', 'internal');
    raise exception 'FAIL an outgoing letter was filed without the letter';
  exception
    when check_violation then
      raise notice 'ok   an outgoing letter is not filed without the letter itself';
  end;
end;
$$;

do $$
begin
  begin
    update correspondence set delivery_confirmed_on = current_date
     where id = '1f000000-0000-0000-0000-000000000030';
    raise exception 'FAIL delivery was confirmed with nothing behind it';
  exception
    when check_violation then
      raise notice 'ok   nor is delivery confirmed without evidence or a note';
  end;
end;
$$;

select pg_temp.act_as('77777777-7777-7777-7777-777777777777');  -- contractor
select pg_temp.check('and the correspondence register is internal',
  (select count(*) from correspondence), 0::bigint);

-- --- the weekly digest differs by audience (M11-10) -----------------------
--
-- The point is not that the donor's is shorter. It is that the donor's is
-- computed from a different rule, so a bug in the client cannot widen it.

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');  -- trustee
select pg_temp.check('the trustee digest carries what is waiting on them',
  (select count(*) > 0 from public.weekly_digest('trustee', current_date - 400, current_date)
    where section = 'waiting on you'), true);
select pg_temp.check('the field digest does not — it is not theirs to decide',
  (select count(*) from public.weekly_digest('field', current_date - 400, current_date)
    where section = 'waiting on you'), 0::bigint);
select pg_temp.check('and a trustee previewing the donor digest sees only what is published',
  (select count(*) from public.weekly_digest('donor', current_date - 4000, current_date)
    where confidentiality <> 'public'), 0::bigint);

reset role;

-- ===========================================================================
-- Action candidates (M3-05, M3-07, G-04)
-- ===========================================================================
--
-- The Notion archive brought 103 lines of action text. Three name both a
-- person and a date; eighty-five name neither. An action here requires both,
-- so these are the honest third thing: a queue that only goes down when a
-- person decides.

set role authenticated;
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- director

insert into action_candidates
  (id, meeting_id, sequence, text_en, text_tr, suggested_owner_stakeholder_id,
   suggested_due_on, confidentiality)
values
  ('a4000000-0000-0000-0000-000000000001', '0e000000-0000-0000-0000-000000000001', 1,
   'Mr. Tariq to deliver the engineering report by Saturday 25 April',
   'Mr. Tariq mühendislik raporunu 25 Nisan Cumartesi''ye kadar teslim etsin',
   '0b000000-0000-0000-0000-000000000004', '2026-04-25', 'internal'),
  ('a4000000-0000-0000-0000-000000000002', '0e000000-0000-0000-0000-000000000001', 2,
   'Explore discreet channels to communicate diplomatic pressure', null,
   null, null, 'internal');

select pg_temp.check('a candidate is not an action and is not counted as one',
  (select count(*) from action_items where meeting_id = '0e000000-0000-0000-0000-000000000001'
     and text_en like 'Mr. Tariq to deliver%'), 0::bigint);
select pg_temp.check('the queue says how many are waiting',
  (select count(*) from action_triage where state = 'pending'), 2::bigint);
select pg_temp.check('and which of them arrived with anything to go on',
  (select count(*) from action_triage where names_an_owner and names_a_date), 1::bigint);

-- --- the sentence is the record ------------------------------------------

do $$
begin
  begin
    update action_candidates set text_en = 'Something I would rather it said'
     where id = 'a4000000-0000-0000-0000-000000000002';
    raise exception 'FAIL a line from a minute was rewritten';
  exception
    when insufficient_privilege then
      raise notice 'ok   a candidate is a sentence from a minute and cannot be rewritten';
  end;
end;
$$;

-- --- adopting needs the two fields that make it an action -----------------
--
-- Both rules are enforced twice on purpose: adopt_action_candidate refuses
-- them with a sentence somebody can act on, and action_items refuses them
-- again with NOT NULL and its exactly-one-party check. The handlers below
-- accept either, because what is being tested is the rule and not which
-- layer caught it; removing one layer leaves these passing, and removing
-- both makes them fail.

do $$
begin
  begin
    perform public.adopt_action_candidate(
      'a4000000-0000-0000-0000-000000000002', null,
      '22222222-2222-2222-2222-222222222222', null);
    raise exception 'FAIL an action was created without a date';
  exception
    when check_violation or not_null_violation then
      raise notice 'ok   an action cannot be adopted without a date (M3-05)';
  end;
end;
$$;

do $$
begin
  begin
    perform public.adopt_action_candidate(
      'a4000000-0000-0000-0000-000000000002', current_date + 14, null, null);
    raise exception 'FAIL an action was created with nobody owning it';
  exception
    when check_violation or not_null_violation then
      raise notice 'ok   nor without exactly one owner';
  end;
end;
$$;

do $$
begin
  begin
    perform public.adopt_action_candidate(
      'a4000000-0000-0000-0000-000000000002', current_date + 14,
      '22222222-2222-2222-2222-222222222222', '0b000000-0000-0000-0000-000000000004');
    raise exception 'FAIL an action was created with two owners';
  exception
    when check_violation then
      raise notice 'ok   and not with two, because "exactly one" is the rule';
  end;
end;
$$;

-- With both, it becomes an action and the candidate stops being pending.
select public.adopt_action_candidate(
  'a4000000-0000-0000-0000-000000000001', '2026-04-25',
  null, '0b000000-0000-0000-0000-000000000004', 'high');

select pg_temp.check('with an owner and a date it becomes a real action',
  (select count(*) from action_items
    where text_en like 'Mr. Tariq to deliver%'
      and due_date = '2026-04-25'
      and owner_stakeholder_id = '0b000000-0000-0000-0000-000000000004'), 1::bigint);
select pg_temp.check('and the candidate points at what it became',
  (select action_item_id is not null and state = 'adopted' from action_candidates
    where id = 'a4000000-0000-0000-0000-000000000001'), true);
select pg_temp.check('so the queue is one shorter',
  (select count(*) from action_triage where state = 'pending'), 1::bigint);

do $$
begin
  begin
    perform public.adopt_action_candidate(
      'a4000000-0000-0000-0000-000000000001', current_date + 1,
      '22222222-2222-2222-2222-222222222222', null);
    raise exception 'FAIL the same candidate became two actions';
  exception
    when check_violation then
      raise notice 'ok   and cannot be adopted a second time';
  end;
end;
$$;

-- --- dropping one is a decision somebody signs ---------------------------

-- Enforced twice as well: the function refuses a blank reason, and the
-- table's own check refuses a dismissal without one.
do $$
begin
  begin
    perform public.dismiss_action_candidate('a4000000-0000-0000-0000-000000000002', '   ');
    raise exception 'FAIL a candidate was dropped without a reason';
  exception
    when check_violation then
      raise notice 'ok   a candidate cannot be dropped without a reason (M3-07)';
  end;
end;
$$;

select public.dismiss_action_candidate(
  'a4000000-0000-0000-0000-000000000002',
  'Superseded by the diplomatic track agreed with the Ambassador on 16 April.');
select pg_temp.check('with one, it is dropped and the reason stays on the record',
  (select dismissed_reason is not null and state = 'dismissed' and settled_by is not null
     from action_candidates where id = 'a4000000-0000-0000-0000-000000000002'), true);
select pg_temp.check('and the queue is empty without anything having vanished',
  (select count(*) from action_triage where state = 'pending'), 0::bigint);

-- --- somebody who does not minute does not triage -------------------------

select pg_temp.act_as('77777777-7777-7777-7777-777777777777');  -- contractor
do $$
begin
  begin
    perform public.dismiss_action_candidate(
      'a4000000-0000-0000-0000-000000000001', 'Not my concern');
    raise exception 'FAIL an outside party settled a candidate';
  exception
    when no_data_found or insufficient_privilege or check_violation then
      raise notice 'ok   somebody outside the minute-takers cannot settle one';
  end;
end;
$$;

reset role;

-- ===========================================================================
-- Re-sending a capture (M3-11)
-- ===========================================================================
--
-- A meeting written down with no connection is sent when the connection
-- returns, and the interesting failure is the partial one: the meeting goes,
-- the link drops, the lines do not. The next attempt therefore repeats all
-- three writes, which is only safe if repeating them cannot double anything.
--
-- That safety is not in the client. It is these three keys, and this section
-- exists so the claim is a tested fact rather than a comment in a TypeScript
-- file: the meeting's own primary key, the note's (meeting, section,
-- language), and the candidate's (meeting, sequence).

set role authenticated;
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- director

-- The device picks the id, which is what lets a retry recognise its own work.
insert into meetings (id, title, held_at, kind, status, minutes_status, confidentiality)
values ('0e000000-0000-0000-0000-00000000ca91', 'Saha toplantısı — bağlantısız',
        '2026-04-20 09:00+03', 'internal', 'completed', 'draft', 'internal');

select pg_temp.check('a capture may name its own meeting id',
  (select count(*) from meetings where id = '0e000000-0000-0000-0000-00000000ca91'), 1::bigint);

do $$
begin
  begin
    insert into meetings (id, title, held_at, kind, status, minutes_status, confidentiality)
    values ('0e000000-0000-0000-0000-00000000ca91', 'Saha toplantısı — bağlantısız',
            '2026-04-20 09:00+03', 'internal', 'completed', 'draft', 'internal');
    raise exception 'FAIL re-sending a capture made a second meeting';
  exception
    when unique_violation then
      raise notice 'ok   re-sending one does not make a second meeting (M3-11)';
  end;
end;
$$;

-- The minute: upserted on its own key, so sending it twice leaves one note
-- holding the later text rather than two notes disagreeing.
insert into meeting_notes (meeting_id, section, language, body)
values ('0e000000-0000-0000-0000-00000000ca91', 'discussed', 'tr', 'Jeneratör arızası görüşüldü.')
on conflict (meeting_id, section, language) do update set body = excluded.body;

insert into meeting_notes (meeting_id, section, language, body)
values ('0e000000-0000-0000-0000-00000000ca91', 'discussed', 'tr',
        'Jeneratör arızası ve beton dökümü gecikmesi görüşüldü.')
on conflict (meeting_id, section, language) do update set body = excluded.body;

select pg_temp.check('the minute arrives once however many times it is sent',
  (select count(*) from meeting_notes
    where meeting_id = '0e000000-0000-0000-0000-00000000ca91'), 1::bigint);

-- The action lines. A second send inserts the same (meeting, sequence) pairs
-- and must add nothing — and must not rewrite what is there either, because
-- the sentence is the record.
insert into action_candidates (meeting_id, sequence, text_tr, confidentiality)
values ('0e000000-0000-0000-0000-00000000ca91', 1,
        'Mühendislik raporu Cumartesiye kadar teslim edilecek', 'internal'),
       ('0e000000-0000-0000-0000-00000000ca91', 2,
        'Jeneratör için teklif alınacak', 'internal');

insert into action_candidates (meeting_id, sequence, text_tr, confidentiality)
values ('0e000000-0000-0000-0000-00000000ca91', 1,
        'Mühendislik raporu Cumartesiye kadar teslim edilecek', 'internal'),
       ('0e000000-0000-0000-0000-00000000ca91', 2,
        'Jeneratör için teklif alınacak', 'internal')
on conflict (meeting_id, sequence) do nothing;

select pg_temp.check('and the lines arrive once, not twice',
  (select count(*) from action_candidates
    where meeting_id = '0e000000-0000-0000-0000-00000000ca91'), 2::bigint);

do $$
begin
  begin
    insert into action_candidates (meeting_id, sequence, text_tr, confidentiality)
    values ('0e000000-0000-0000-0000-00000000ca91', 1, 'Başka bir cümle', 'internal');
    raise exception 'FAIL two candidates took the same place in one minute';
  exception
    when unique_violation then
      raise notice 'ok   without the on-conflict clause the second send is refused outright';
  end;
end;
$$;

-- What the whole arrangement is for: the lines came off a device with no
-- signal and they are candidates, not actions. Nobody invented an owner or a
-- date in a room with no network.
select pg_temp.check('a captured line is a candidate and not an action',
  (select count(*) from action_items
    where meeting_id = '0e000000-0000-0000-0000-00000000ca91'), 0::bigint);
select pg_temp.check('waiting in the queue with nothing to go on',
  (select count(*) from action_triage
    where meeting_id = '0e000000-0000-0000-0000-00000000ca91'
      and state = 'pending' and not names_an_owner and not names_a_date), 2::bigint);

reset role;

-- ===========================================================================
-- Compiled reports (M12-06 … M12-09)
-- ===========================================================================

set role authenticated;

-- --- a report is compiled, not typed --------------------------------------

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- director
select public.open_report('board_pack', 'February board pack', null, null,
  '0e000000-0000-0000-0000-000000000002', null);

select pg_temp.check('a board pack is compiled from the registers',
  (select count(*) from report_runs where kind = 'board_pack'), 1::bigint);

-- The six sections M3-13 lists. Not all of them have rows in this fixture
-- set; the ones that matter are that the meeting is named and the figures
-- carry a source.
select pg_temp.check('and arrives with its sections, not as one blob',
  (select count(distinct e->>'section') > 2 from report_runs r,
     jsonb_array_elements(r.content) e
    where r.kind = 'board_pack'), true);

-- The measure the requirement sets: no material figure without its source.
select pg_temp.check('every figure in it names the register it came from',
  (select count(*) from report_runs r, jsonb_array_elements(r.content) e
    where r.kind = 'board_pack'
      and e->>'value_number' is not null
      and coalesce(btrim(e->>'source_note'), '') = ''), 0::bigint);

-- --- an empty compilation is a finding, not a document --------------------

do $$
begin
  begin
    perform public.open_report('status_report', 'The year 1850', '1850-01-01', '1850-12-31');
    raise notice 'ok   a period with records in it compiles';
  exception
    when no_data_found then
      raise notice 'ok   a report that could compile nothing says so rather than saving a blank';
  end;
end;
$$;

do $$
begin
  begin
    perform public.open_report('status_report', '   ', current_date - 30, current_date);
    raise exception 'FAIL a report was saved with no name';
  exception
    when check_violation then
      raise notice 'ok   and one with no name is refused';
  end;
end;
$$;

-- --- approval freezes the figures ----------------------------------------
--
-- This is the rule the module turns on. An approval that does not fix what
-- was approved is a signature on a moving document.

select public.approve_report(
  (select id from report_runs where kind = 'board_pack' limit 1));

select pg_temp.check('approval carries the name and the moment',
  (select approved_by is not null and approved_at is not null and state = 'approved'
     from report_runs where kind = 'board_pack'), true);

do $$
declare v_id uuid := (select id from report_runs where kind = 'board_pack' limit 1);
begin
  begin
    update report_runs set content = '[]'::jsonb where id = v_id;
    raise exception 'FAIL the figures changed under an approval';
  exception
    when insufficient_privilege then
      raise notice 'ok   the figures cannot be changed once somebody has approved them';
  end;
end;
$$;

-- The title is not a figure: a typo in it can still be corrected.
update report_runs set title = 'February board pack (final)'
 where kind = 'board_pack';
select pg_temp.check('though a typo in the title can still be fixed',
  (select title from report_runs where kind = 'board_pack'),
  'February board pack (final)');

-- --- publication goes through approval ------------------------------------
--
-- The rule is enforced twice on purpose: publish_report refuses it, and the
-- table's own check refuses a published_at without an approved_at. Removing
-- either one alone leaves the assertion below passing, which is the point of
-- having both; removing both makes it fail.

select public.open_report('status_report', 'Quarter to date', current_date - 60, current_date);

do $$
declare v_id uuid := (select id from report_runs where kind = 'status_report' limit 1);
begin
  begin
    perform public.publish_report(v_id);
    raise exception 'FAIL an unapproved report was published';
  exception
    when check_violation then
      raise notice 'ok   an unapproved report cannot be published (M8-12)';
  end;
end;
$$;

-- --- a donor report is approved by somebody else --------------------------
--
-- It leaves the trust, so the separation the payment bands and the
-- procurement award require applies here too.

select public.open_report('donor_report', 'Foundation — annual account', current_date - 365,
  current_date, null, '0b000000-0000-0000-0000-000000000007');

do $$
declare v_id uuid := (select id from report_runs where kind = 'donor_report' limit 1);
begin
  begin
    perform public.approve_report(v_id);
    raise exception 'FAIL the person who compiled a donor report approved it themselves';
  exception
    when check_violation then
      raise notice 'ok   a donor report is not approved by whoever compiled it';
  end;
end;
$$;

-- A second person in the band can.
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');  -- trustee
select public.approve_report((select id from report_runs where kind = 'donor_report' limit 1));
select pg_temp.check('a second pair of eyes in the band can approve it',
  (select state::text from report_runs where kind = 'donor_report'), 'approved');

-- --- publishing a donor report is what declassifies it -------------------

select pg_temp.check('while in draft it is the trust''s own document',
  (select confidentiality::text from report_runs where kind = 'donor_report'), 'internal');

select public.publish_report((select id from report_runs where kind = 'donor_report' limit 1));
select pg_temp.check('publishing it is the act that makes it public',
  (select confidentiality::text || ' ' || state::text from report_runs where kind = 'donor_report'),
  'public published');

-- And the donor, who is outside and cleared only for public material, reads
-- their own account — which is the whole point of M8-12.
select pg_temp.act_as('88888888-8888-8888-8888-888888888888');  -- donor
select pg_temp.check('the donor can read their own published account',
  (select count(*) from report_runs where kind = 'donor_report'), 1::bigint);
select pg_temp.check('and nothing else in the report register',
  (select count(*) from report_runs), 1::bigint);

do $$
begin
  begin
    perform public.open_report('status_report', 'A report of my own', current_date - 30, current_date);
    raise exception 'FAIL somebody outside the organisation compiled a report';
  exception
    when insufficient_privilege or no_data_found then
      raise notice 'ok   but cannot compile one of their own';
  end;
end;
$$;

-- --- withdrawal is reasoned ----------------------------------------------

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- director
do $$
declare v_id uuid := (select id from report_runs where kind = 'status_report' limit 1);
begin
  begin
    perform public.withdraw_report(v_id, '  ');
    raise exception 'FAIL a report was withdrawn without a reason';
  exception
    when check_violation then
      raise notice 'ok   a report pulled without a reason is a gap in the record';
  end;
end;
$$;

reset role;

-- ===========================================================================
-- Notifications that arrive (0033)
-- ===========================================================================
--
-- 0027 built the model and nothing raised one. These test the half that was
-- missing, and the assertions are written against this section's own dedupe
-- keys rather than against totals, because totals shift every time somebody
-- adds a fixture — which has already broken assertions in this file twice.

set role authenticated;
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- director

-- --- the clearance guard, first, because it is the one that could leak -----
--
-- The sweep runs as the owner and therefore reads restricted matters, and it
-- puts titles into notification bodies. app.cleared is the whole defence.

select pg_temp.check('somebody cleared for a tier may be told about it',
  (select '22222222-2222-2222-2222-222222222222' = any (
     app.cleared(array['22222222-2222-2222-2222-222222222222'::uuid], 'restricted'))), true);
select pg_temp.check('and somebody who is not, is dropped before the notification exists',
  (select cardinality(
     app.cleared(array['55555555-5555-5555-5555-555555555555'::uuid], 'restricted'))), 0);
select pg_temp.check('an expired account is dropped too, clearance notwithstanding',
  (select cardinality(
     app.cleared(array['99999999-9999-9999-9999-999999999999'::uuid], 'internal'))), 0);

-- Addressed to nobody: not raised, rather than raised into the void.
select pg_temp.check('a notification nobody may hear is not raised at all',
  (select app.raise_once('test:void', 'deadline', 'Nobody may hear this', null,
     null, false, 'obligation', null, '{}'::uuid[])), false);
select pg_temp.check('and leaves nothing behind',
  (select count(*) from notifications where dedupe_key = 'test:void'), 0::bigint);

-- --- the sweep is not reachable from a session ----------------------------
--
-- It is unguarded, because the schedule has no identity to check, so the
-- privilege is what keeps it out of reach. The role dance below each
-- 'schedule' sweep is this rule being obeyed, not a test artefact.

do $$
begin
  begin
    perform app.sweep_notifications('schedule');
    raise exception 'FAIL a session reached the unguarded sweep';
  exception
    when insufficient_privilege then
      raise notice 'ok   the unguarded sweep is the schedule''s alone';
  end;
end;
$$;

-- --- M2-09: the five thresholds -------------------------------------------

insert into obligations
  (id, title_en, title_tr, source, obligor_name, obligor_profile_id, due_on, state,
   confidentiality)
values
  ('b1000000-0000-0000-0000-00000000f001', 'File the compliance return',
   'Uyum beyanını ver', 'statute', 'AUTK',
   '22222222-2222-2222-2222-222222222222', current_date + 25, 'open', 'internal'),
  -- Restricted, and the obligor is cleared only to internal. The notification
  -- must exist for the director and must NOT reach the obligor.
  ('b1000000-0000-0000-0000-00000000f002', 'Settle the restricted undertaking',
   'Kısıtlı taahhüdü kapat', 'statute', 'Counsel',
   '55555555-5555-5555-5555-555555555555', current_date + 25, 'open', 'restricted');

select public.run_notification_sweep();

select pg_temp.check('an obligation 25 days out raises at the 30-day threshold (M2-09)',
  (select count(*) from notifications
    where dedupe_key = 'obligation:b1000000-0000-0000-0000-00000000f001:30'
      and topic = 'deadline'), 1::bigint);
select pg_temp.check('and not at the thresholds it has not reached',
  (select count(*) from notifications
    where dedupe_key in (
      'obligation:b1000000-0000-0000-0000-00000000f001:60',
      'obligation:b1000000-0000-0000-0000-00000000f001:14',
      'obligation:b1000000-0000-0000-0000-00000000f001:7',
      'obligation:b1000000-0000-0000-0000-00000000f001:1')), 0::bigint);

-- The leak test. The restricted obligation raised, and the person without the
-- clearance has no delivery for it.
select pg_temp.check('a restricted obligation still warns whoever may see it',
  (select count(*) from notifications
    where dedupe_key = 'obligation:b1000000-0000-0000-0000-00000000f002:30'), 1::bigint);
select pg_temp.check('but it does not name itself to somebody without the clearance',
  (select count(*) from notification_deliveries d
     join notifications n on n.id = d.notification_id
    where n.dedupe_key = 'obligation:b1000000-0000-0000-0000-00000000f002:30'
      and d.recipient_id = '55555555-5555-5555-5555-555555555555'), 0::bigint);
select pg_temp.check('while the one at the ordinary tier does reach them',
  (select count(*) > 0 from notification_deliveries d
     join notifications n on n.id = d.notification_id
    where n.dedupe_key = 'obligation:b1000000-0000-0000-0000-00000000f001:30'
      and d.recipient_id = '22222222-2222-2222-2222-222222222222'), true);

-- --- running it again raises nothing --------------------------------------

reset role;
select app.sweep_notifications('schedule');
set role authenticated;
reset role;
select app.sweep_notifications('schedule');
set role authenticated;

select pg_temp.check('sweeping three times raises one notification, not three',
  (select count(*) from notifications
    where dedupe_key = 'obligation:b1000000-0000-0000-0000-00000000f001:30'), 1::bigint);

-- --- crossing the next threshold raises again -----------------------------

update obligations set due_on = current_date + 1
 where id = 'b1000000-0000-0000-0000-00000000f001';
reset role;
select app.sweep_notifications('schedule');
set role authenticated;

select pg_temp.check('crossing the next threshold raises again, with its own key',
  (select count(*) from notifications
    where dedupe_key = 'obligation:b1000000-0000-0000-0000-00000000f001:1'), 1::bigint);
select pg_temp.check('and that one is marked urgent, because tomorrow is',
  (select urgent from notifications
    where dedupe_key = 'obligation:b1000000-0000-0000-0000-00000000f001:1'), true);

-- A threshold that passed while nobody was sweeping stays unraised. This one
-- is recorded four days before it is due and has therefore sailed past 60, 30
-- and 14 unobserved; saying "60 days left" now would be a lie about the
-- calendar, so only the tightest band crossed is raised.
insert into obligations
  (id, title_en, title_tr, source, obligor_name, obligor_profile_id, due_on, state,
   confidentiality)
values
  ('b1000000-0000-0000-0000-00000000f003', 'Recorded four days before it falls due',
   'Vadesine dört gün kalmışken kaydedildi', 'statute', 'AUTK',
   '22222222-2222-2222-2222-222222222222', current_date + 4, 'open', 'internal');
reset role;
select app.sweep_notifications('schedule');
set role authenticated;

select pg_temp.check('the tightest band crossed is the one raised',
  (select count(*) from notifications
    where dedupe_key = 'obligation:b1000000-0000-0000-0000-00000000f003:7'), 1::bigint);
select pg_temp.check('and the thresholds it sailed past unobserved stay unraised',
  (select count(*) from notifications
    where dedupe_key in (
      'obligation:b1000000-0000-0000-0000-00000000f003:60',
      'obligation:b1000000-0000-0000-0000-00000000f003:30',
      'obligation:b1000000-0000-0000-0000-00000000f003:14')), 0::bigint);

-- --- a record that names nobody ------------------------------------------
--
-- Measured on the live database: of the eight open obligations carried in
-- from the Notion archive, none has an owner profile and none has a
-- created_by, because they were loaded server-side where auth.uid() is null.
-- A strict reading says there is nobody to tell and the right output is
-- silence — which is backwards, because a deadline nobody owns is the more
-- urgent kind. It goes to the directors, through the same clearance filter,
-- and says that is why they are the ones hearing it.

insert into obligations
  (id, title_en, title_tr, source, obligor_name, due_on, state, confidentiality)
values
  ('b1000000-0000-0000-0000-00000000f004', 'An obligation nobody owns',
   'Sahibi olmayan bir yükümlülük', 'statute', 'Somebody outside',
   current_date + 25, 'open', 'internal');
update obligations set created_by = null
 where id = 'b1000000-0000-0000-0000-00000000f004';

reset role;
select app.sweep_notifications('schedule');
set role authenticated;

select pg_temp.check('an obligation naming nobody is still raised',
  (select count(*) from notifications
    where dedupe_key = 'obligation:b1000000-0000-0000-0000-00000000f004:30'), 1::bigint);
select pg_temp.check('to whoever runs the project',
  (select count(*) from notification_deliveries d
     join notifications n on n.id = d.notification_id
    where n.dedupe_key = 'obligation:b1000000-0000-0000-0000-00000000f004:30'
      and d.recipient_id = '22222222-2222-2222-2222-222222222222'
      and d.medium = 'in_app'), 1::bigint);
select pg_temp.check('and it says that is why they are the ones hearing it',
  (select body like '%Nobody in the portal is named on this record%' from notifications
    where dedupe_key = 'obligation:b1000000-0000-0000-0000-00000000f004:30'), true);

-- The fallback goes through the clearance filter too, so it is not a way
-- around the guard: a restricted record that names nobody reaches only those
-- directors cleared for it, and never anybody else.
select pg_temp.check('the fallback is still filtered by clearance',
  (select count(*) from notification_deliveries d
     join notifications n on n.id = d.notification_id
    where n.dedupe_key = 'obligation:b1000000-0000-0000-0000-00000000f002:30'
      and d.recipient_id = '55555555-5555-5555-5555-555555555555'), 0::bigint);

-- --- M11-06: what is actually sent ----------------------------------------
--
-- A deadline is critical, so every medium is on by default. Three of the four
-- have no provider, and that is recorded rather than skipped.

select pg_temp.check('the inbox is the one medium that delivers',
  (select state::text from notification_deliveries d
     join notifications n on n.id = d.notification_id
    where n.dedupe_key = 'obligation:b1000000-0000-0000-0000-00000000f001:30'
      and d.recipient_id = '22222222-2222-2222-2222-222222222222'
      and d.medium = 'in_app'), 'queued');
select pg_temp.check('and the other three are recorded as having no sender',
  (select count(*) from notification_deliveries d
     join notifications n on n.id = d.notification_id
    where n.dedupe_key = 'obligation:b1000000-0000-0000-0000-00000000f001:30'
      and d.medium <> 'in_app'
      and d.state = 'unconfigured'), 3::bigint);
select pg_temp.check('nothing anywhere claims to have been sent',
  (select count(*) from notification_deliveries where state = 'sent'), 0::bigint);

-- --- M6-08 and M6-10: the score and the escalation ------------------------

insert into risks
  (id, title_en, title_tr, category, likelihood, impact, state, owner_profile_id,
   confidentiality)
values
  ('b6000000-0000-0000-0000-00000000f001', 'Attention-level risk', 'Dikkat seviyesi risk',
   'legal', 4, 4, 'open', '22222222-2222-2222-2222-222222222222', 'internal'),
  ('b6000000-0000-0000-0000-00000000f002', 'Escalation-level risk', 'Tırmandırma seviyesi risk',
   'legal', 5, 5, 'open', '22222222-2222-2222-2222-222222222222', 'internal');

reset role;
select app.sweep_notifications('schedule');
set role authenticated;

select pg_temp.check('a risk over the attention threshold raises (M6-08)',
  (select count(*) from notifications
    where dedupe_key = 'risk:b6000000-0000-0000-0000-00000000f001:band:15'), 1::bigint);
select pg_temp.check('and one over the escalation threshold reaches the board (M6-10)',
  (select count(*) from notification_deliveries d
     join notifications n on n.id = d.notification_id
    where n.dedupe_key = 'risk:b6000000-0000-0000-0000-00000000f002:band:20'
      and d.recipient_id = '33333333-3333-3333-3333-333333333333'
      and d.medium = 'in_app'), 1::bigint);
select pg_temp.check('while the one below it does not',
  (select count(*) from notification_deliveries d
     join notifications n on n.id = d.notification_id
    where n.dedupe_key = 'risk:b6000000-0000-0000-0000-00000000f001:band:15'
      and d.recipient_id = '33333333-3333-3333-3333-333333333333'), 0::bigint);

-- A score moving within its band does not raise again; crossing does.
update risks set likelihood = 5 where id = 'b6000000-0000-0000-0000-00000000f001';
reset role;
select app.sweep_notifications('schedule');
set role authenticated;
select pg_temp.check('crossing into the escalation band raises once more',
  (select count(*) from notifications
    where dedupe_key = 'risk:b6000000-0000-0000-0000-00000000f001:band:20'), 1::bigint);

-- --- the run log, which is what makes an empty inbox explainable ----------

select pg_temp.check('every sweep is written down',
  (select count(*) > 5 from notification_sweeps), true);
select pg_temp.check('and a hand-run sweep is attributed to the person who ran it',
  (select ran_by = '22222222-2222-2222-2222-222222222222' from notification_sweeps
    where trigger_source = 'manual' order by ran_at limit 1), true);
select pg_temp.check('while a scheduled one names nobody, because nobody ran it',
  (select bool_and(ran_by is null) from notification_sweeps
    where trigger_source = 'schedule'), true);
select pg_temp.check('the health view says the schedule is not stopped',
  (select looks_stopped from notification_health), false);
select pg_temp.check('and names the three media still without a provider',
  (select cardinality(media_without_a_provider) from notification_health), 3);

-- --- who may run it -------------------------------------------------------

select pg_temp.act_as('77777777-7777-7777-7777-777777777777');  -- contractor
do $$
begin
  begin
    perform public.run_notification_sweep();
    raise exception 'FAIL somebody outside the minute-takers ran the sweep';
  exception
    when insufficient_privilege then
      raise notice 'ok   running the sweep is not everybody''s to do';
  end;
end;
$$;

-- And the inbox stays each person's own: the contractor sees none of what the
-- sweep raised for the director.
select pg_temp.check('a swept notification lands in its recipient''s inbox only',
  (select count(*) from my_notifications
    where title_en like 'Obligation%'), 0::bigint);

reset role;

-- ===========================================================================
-- Machine translation, marked as such (0034)
-- ===========================================================================
--
-- 55 of the portal's 149 filled bilingual fields hold one language only, so
-- translating automatically is worth doing. The danger is exact: a machine
-- translation indistinguishable from the record IS the record as far as any
-- reader can tell, which is the "SHA-256 verified" badge in a different
-- column. These test the marking, not the translating.

set role authenticated;
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- director

-- --- the whitelist --------------------------------------------------------
--
-- The review function builds dynamic SQL from a table and column name, so what
-- counts as a bilingual field has to be decided somewhere narrow.

select pg_temp.check('a half of a bilingual pair is translatable',
  (select app.translatable('obligations', 'detail_tr')), true);
select pg_temp.check('and meetings.title_tr, which does not follow the convention',
  (select app.translatable('meetings', 'title_tr')), true);
select pg_temp.check('a column that is not one half of a pair is not',
  (select app.translatable('obligations', 'due_on')), false);
select pg_temp.check('nor is something that is not a column at all',
  (select app.translatable('obligations', 'detail_tr; drop table profiles')), false);

do $$
begin
  begin
    perform public.record_machine_translation(
      'obligations', '0b000000-0000-0000-0000-000000000001', 'state',
      'tr', 'en', 'test-model', 'bir şey');
    raise exception 'FAIL a non-bilingual column was marked as translated';
  exception
    when check_violation then
      raise notice 'ok   only a bilingual field can be marked as translated';
  end;
end;
$$;

-- --- the marker and what it is for ----------------------------------------

insert into obligations
  (id, title_en, title_tr, detail_en, source, obligor_name, due_on, state, confidentiality)
values
  ('b1000000-0000-0000-0000-00000000f101', 'Register the lease variation',
   'Kira tadilini tescil et', 'The variation must be lodged with the registry.',
   'lease', 'AUTK', current_date + 120, 'open', 'internal');

-- The text is written by the ordinary update; the marker records where it came
-- from. Both halves are needed, and the test does them in that order because
-- that is the order the client does them in.
update obligations
   set detail_tr = 'Tadilin tapu siciline tevdi edilmesi gerekir.'
 where id = 'b1000000-0000-0000-0000-00000000f101';

select public.record_machine_translation(
  'obligations', 'b1000000-0000-0000-0000-00000000f101', 'detail_tr',
  'tr', 'en', 'gemini-2.5-flash', 'Tadilin tapu siciline tevdi edilmesi gerekir.');

select pg_temp.check('a translated field is marked, and unapproved',
  (select approved_at is null from machine_translations
    where entity_table = 'obligations' and column_name = 'detail_tr'
      and entity_id = 'b1000000-0000-0000-0000-00000000f101'), true);
select pg_temp.check('and the review queue shows it beside what the field now says',
  (select still_the_machines_words from public.translation_review()
    where entity_id = 'b1000000-0000-0000-0000-00000000f101'
      and column_name = 'detail_tr'), true);

-- --- an ordinary edit resolves the review --------------------------------
--
-- Nobody has to mark anything: if the field no longer says what the machine
-- said, a person has been here.

update obligations
   set detail_tr = 'Tadilin tapu siciline şerh edilmesi gerekir.'
 where id = 'b1000000-0000-0000-0000-00000000f101';

select pg_temp.check('a field edited by hand is no longer the machine''s words',
  (select still_the_machines_words from public.translation_review()
    where entity_id = 'b1000000-0000-0000-0000-00000000f101'
      and column_name = 'detail_tr'), false);

-- --- approving is a person's act, and attributed -------------------------

select public.approve_translation(
  (select id from machine_translations
    where entity_id = 'b1000000-0000-0000-0000-00000000f101'
      and column_name = 'detail_tr'));

select pg_temp.check('approval carries the name and the moment',
  (select approved_by = '22222222-2222-2222-2222-222222222222' and approved_at is not null
     from machine_translations
    where entity_id = 'b1000000-0000-0000-0000-00000000f101'
      and column_name = 'detail_tr'), true);

do $$
begin
  begin
    perform public.approve_translation(
      (select id from machine_translations
        where entity_id = 'b1000000-0000-0000-0000-00000000f101'
          and column_name = 'detail_tr'));
    raise exception 'FAIL the same translation was approved twice';
  exception
    when no_data_found then
      raise notice 'ok   an approved translation is not approved again';
  end;
end;
$$;

-- --- re-translating withdraws the approval -------------------------------
--
-- Approval is of a wording, not of a field. A second pass at the same field is
-- a new wording and nobody has stood behind it yet.

select public.record_machine_translation(
  'obligations', 'b1000000-0000-0000-0000-00000000f101', 'detail_tr',
  'tr', 'en', 'gemini-2.5-flash', 'Tadil tapuya şerh edilmelidir.');

select pg_temp.check('a re-translation is unapproved again',
  (select approved_at is null and not corrected from machine_translations
    where entity_id = 'b1000000-0000-0000-0000-00000000f101'
      and column_name = 'detail_tr'), true);
select pg_temp.check('and there is still one marker for the field, not two',
  (select count(*) from machine_translations
    where entity_id = 'b1000000-0000-0000-0000-00000000f101'
      and column_name = 'detail_tr'), 1::bigint);

-- --- the backlog this is meant to bring down -----------------------------

-- A record with English detail and no Turkish: exactly what the 53 look like.
insert into obligations
  (id, title_en, title_tr, detail_en, source, obligor_name, due_on, state, confidentiality)
values
  ('b1000000-0000-0000-0000-00000000f103', 'English detail only',
   'Yalnız İngilizce ayrıntı', 'Lodged under section 44.', 'statute', 'AUTK',
   current_date + 120, 'open', 'internal');

select pg_temp.check('the backlog counts fields holding one language only',
  (select only_en > 0 from public.translation_backlog()
    where entity_table = 'obligations' and base = 'detail'), true);
select pg_temp.check('and counts the bilingual ones separately rather than as a gap',
  (select in_both > 0 from public.translation_backlog()
    where entity_table = 'obligations' and base = 'detail'), true);

-- --- the review reads under the caller's own visibility ------------------
--
-- A reviewer is not shown the detail of a restricted record by virtue of its
-- being untranslated. This is the whole reason the function is invoker and not
-- definer.

insert into obligations
  (id, title_en, title_tr, detail_en, source, obligor_name, due_on, state, confidentiality)
values
  ('b1000000-0000-0000-0000-00000000f102', 'A restricted undertaking',
   'Kısıtlı bir taahhüt', 'Restricted detail.', 'lease', 'AUTK',
   current_date + 120, 'open', 'restricted');
update obligations set detail_tr = 'Kısıtlı ayrıntı.'
 where id = 'b1000000-0000-0000-0000-00000000f102';
select public.record_machine_translation(
  'obligations', 'b1000000-0000-0000-0000-00000000f102', 'detail_tr',
  'tr', 'en', 'gemini-2.5-flash', 'Kısıtlı ayrıntı.');

select pg_temp.check('a director cleared for it sees it in the queue',
  (select count(*) from public.translation_review()
    where entity_id = 'b1000000-0000-0000-0000-00000000f102'), 1::bigint);

select pg_temp.act_as('55555555-5555-5555-5555-555555555555');  -- counsel, internal
select pg_temp.check('somebody without the clearance does not, text included',
  (select count(*) from public.translation_review()
    where entity_id = 'b1000000-0000-0000-0000-00000000f102'), 0::bigint);

-- And marking one is not everybody's to do.
select pg_temp.act_as('88888888-8888-8888-8888-888888888888');  -- donor
do $$
begin
  begin
    perform public.record_machine_translation(
      'obligations', 'b1000000-0000-0000-0000-00000000f101', 'title_tr',
      'tr', 'en', 'gemini-2.5-flash', 'Bir şey');
    raise exception 'FAIL an outside reader marked a translation';
  exception
    when insufficient_privilege or check_violation then
      raise notice 'ok   marking a translation needs the authority to write records';
  end;
end;
$$;

reset role;

-- ===========================================================================
-- The badge, for every reader (0035)
-- ===========================================================================
--
-- 0034's queue is on the assistant screen and is readable by internal users
-- only. A donor or outside counsel reading a machine-written sentence would
-- see nothing marking it as one, which is the gap. machine_marked answers the
-- badge question and nothing else.

set role authenticated;
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- director

-- It returns exactly two columns, and that is the security property rather
-- than a style choice: a definer function that answers for any id must not be
-- able to hand back wording.
select pg_temp.check('the badge function returns a location and no text',
  (select pg_get_function_result('public.machine_marked(text, uuid[])'::regprocedure)),
  'TABLE(entity_id uuid, column_name text)');

insert into obligations
  (id, title_en, title_tr, detail_en, source, obligor_name, due_on, state, confidentiality)
values
  ('b1000000-0000-0000-0000-00000000f201', 'A public undertaking',
   'Açık bir taahhüt', 'Lodged under section 44.', 'statute', 'AUTK',
   current_date + 200, 'open', 'public');
update obligations set detail_tr = 'Madde 44 uyarınca tevdi edildi.'
 where id = 'b1000000-0000-0000-0000-00000000f201';
select public.record_machine_translation(
  'obligations', 'b1000000-0000-0000-0000-00000000f201', 'detail_tr',
  'tr', 'en', 'gemini-2.5-flash', 'Madde 44 uyarınca tevdi edildi.');

select pg_temp.check('an unapproved field is reported as machine-written',
  (select count(*) from public.machine_marked(
     'obligations', array['b1000000-0000-0000-0000-00000000f201'::uuid])
    where column_name = 'detail_tr'), 1::bigint);

-- The point of the whole migration: the reader who cannot read the marker
-- table still gets the badge.
select pg_temp.act_as('88888888-8888-8888-8888-888888888888');  -- donor
select pg_temp.check('somebody who cannot read the marker table still sees it',
  (select count(*) from machine_translations), 0::bigint);
select pg_temp.check('and is told the field is machine-written anyway (0035)',
  (select count(*) from public.machine_marked(
     'obligations', array['b1000000-0000-0000-0000-00000000f201'::uuid])
    where column_name = 'detail_tr'), 1::bigint);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');

-- A marker must never outlive the text it describes. A backfill wrote three
-- that did: the UPDATE was refused by a trigger — action_candidates.text is a
-- quotation 0032 will not let anybody rewrite — and the marker went in anyway,
-- leaving a claim of machine text in an empty field. The client checks the
-- write before it writes the marker; this asserts the outcome rather than the
-- care, so a second route in cannot reintroduce it.
-- Narrower than it first looked. A marker whose field was EDITED BY HAND is
-- legitimate — the queue shows it as such and somebody will settle it — so the
-- rule is not "the field still says what the machine said". It is that the
-- field says SOMETHING: translation_review() skips a row whose field is null,
-- so a visible marker with no row there is one claiming text that is not
-- there.
select pg_temp.check('no marker claims machine text in a field that is empty',
  (select count(*) from machine_translations m
    where not exists (
      select 1 from public.translation_review() r where r.id = m.id)), 0::bigint);

-- 0036: the whole register at once, which is what a list of a hundred rows
-- needs — the component that draws a badge is handed one row and cannot know
-- the others.
select pg_temp.check('asked about the whole table, it answers for every marker in it',
  (select count(*) > 0 from public.machine_marked('obligations')), true);
select pg_temp.check('and that answer includes the row asked about by id',
  (select count(*) from public.machine_marked('obligations')
    where entity_id = 'b1000000-0000-0000-0000-00000000f201'
      and column_name = 'detail_tr'), 1::bigint);
select pg_temp.check('a table with no markers answers with nothing, not with everything',
  (select count(*) from public.machine_marked('risks')), 0::bigint);

-- Only the ids the caller names, and only those that carry a marker.
select pg_temp.check('a record with no marker is reported as nothing',
  (select count(*) from public.machine_marked(
     'obligations', array['b1000000-0000-0000-0000-00000000f103'::uuid])), 0::bigint);

-- The disclosure this function makes, asserted rather than left incidental:
-- it will say that a RESTRICTED record holds machine text, to a caller with no
-- clearance for it. That is provenance and not content — the function cannot
-- return wording, by its own return type above — and it is the trade 0035
-- makes on purpose, because the alternative is a reader shown machine-written
-- Turkish with nothing to say so.
select pg_temp.act_as('88888888-8888-8888-8888-888888888888');  -- donor
select pg_temp.check('provenance is disclosed where content is not',
  (select count(*) from public.machine_marked(
     'obligations', array['b1000000-0000-0000-0000-00000000f102'::uuid])), 1::bigint);
select pg_temp.check('and the restricted text itself stays unreadable',
  (select count(*) from obligations
    where id = 'b1000000-0000-0000-0000-00000000f102'), 0::bigint);
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select pg_temp.check('and about nothing at all when asked about nothing',
  (select count(*) from public.machine_marked('obligations', '{}'::uuid[])), 0::bigint);

-- Edited by hand: the field holds a person's words now.
update obligations set detail_tr = 'Madde 44 gereğince tapuya tevdi edildi.'
 where id = 'b1000000-0000-0000-0000-00000000f201';
select pg_temp.check('a field edited by hand is no longer badged',
  (select count(*) from public.machine_marked(
     'obligations', array['b1000000-0000-0000-0000-00000000f201'::uuid])), 0::bigint);

-- Approved: it is the approver's wording now, and saying otherwise would be
-- telling the reader something that stopped being true.
update obligations set detail_tr = 'Madde 44 uyarınca tevdi edildi.'
 where id = 'b1000000-0000-0000-0000-00000000f201';
select pg_temp.check('and badged again once the hand edit is reverted',
  (select count(*) from public.machine_marked(
     'obligations', array['b1000000-0000-0000-0000-00000000f201'::uuid])), 1::bigint);

select public.approve_translation(
  (select id from machine_translations
    where entity_id = 'b1000000-0000-0000-0000-00000000f201'));
select pg_temp.check('an approved translation is not badged — it is the approver''s wording',
  (select count(*) from public.machine_marked(
     'obligations', array['b1000000-0000-0000-0000-00000000f201'::uuid])), 0::bigint);

reset role;

-- ---------------------------------------------------------------------------
-- The anon key is given nothing (0026)
-- ---------------------------------------------------------------------------
--
-- Every other assertion in this file tests a rule: who may read what. These
-- test the absence of a privilege, one layer below the rules, and they exist
-- because the rules were doing all the work on their own.
--
-- Before 0026, anon held select, insert, update and delete on all 123 tables
-- and views in public and execute on every function there, inherited from
-- Supabase's default privileges. Nothing leaked, because app.authority()
-- reads the caller's profile by auth.uid() and anon has none, so every policy
-- and every definer function refused. But that made the boundary a property
-- of 311 policies rather than of the grant, and the first policy written
-- `using (true)` — a deliberately public register, say — would have been the
-- breach.
--
-- bootstrap.sql reproduces Supabase's default privileges precisely so these
-- assertions can fail. Without that line the local Postgres grants anon
-- nothing to begin with and all four would pass against a database that was
-- never in the state 0026 fixes.

reset role;

select pg_temp.check('anon holds no privilege on any table or view in public',
  (select count(*) from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     cross join lateral aclexplode(c.relacl) a
    where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')
      and a.grantee = 'anon'::regrole), 0::bigint);

-- Asked the other way round, because a privilege can also arrive by
-- membership in a granted role rather than by a direct grant.
select pg_temp.check('and cannot select from one even by inheritance',
  (select count(*) from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v')
      and has_table_privilege('anon', c.oid, 'select, insert, update, delete')), 0::bigint);

-- The definer functions matter more than the tables: each one runs as the
-- owner, so a missing authority check inside one is a bypass of RLS itself
-- rather than a refusal.
select pg_temp.check('nor execute anything in public, definer functions included',
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and has_function_privilege('anon', p.oid, 'execute')), 0::bigint);

-- The helpers, which are where authority is decided. anon was never granted
-- usage on the app schema — on the live project or here — so an assertion
-- about that grant could not fail and is not made; this one is about the
-- execute privileges behind it, which it did hold.
select pg_temp.check('nor execute a policy helper, where authority is decided',
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app'
      and has_function_privilege('anon', p.oid, 'execute')), 0::bigint);

-- The guard the revoke is a second line behind: every definer function in
-- public refuses a caller with no identity. Asserted by calling one as
-- nobody, rather than by reading its source.
set role authenticated;
-- pg_temp.act_as(null), not set_config(..., true): the `true` makes the
-- setting transaction-local, and under psql's autocommit it is discarded
-- before the next statement runs. This assertion then inherited whichever
-- user acted last and passed because THEY could not take a baseline — which
-- it did, until an M11 block ending as a trustee landed above it.
select pg_temp.act_as(null);
do $$
begin
  begin
    perform public.take_baseline('A baseline from nobody', null);
    raise exception 'FAIL a definer function ran for a caller with no identity';
  exception
    when insufficient_privilege then
      raise notice 'ok   a definer function refuses a caller with no identity';
  end;
end;
$$;
reset role;

-- ===========================================================================
-- The watch book (0037): M7-18, M7-12, M6-11
-- ===========================================================================
--
-- What this section is really testing is the difference between what happened
-- and what somebody wrote down. A watchman's book fails by being filled in
-- afterwards from memory, every round ticked; the assertions below are the
-- places where the schema refuses to let that look like a true record.

-- Back into the application role. The section above finishes as the
-- superuser, and a superuser bypasses row level security outright: every
-- assertion below would pass for the wrong reason, and the ones that test a
-- refusal would have reported the refusal missing.
set role authenticated;

select pg_temp.act_as('44444444-4444-4444-4444-444444444444');  -- field team

-- The gate and the perimeter belong to no block. If the read policy used
-- can_see_block_child, which requires one, the most important watch post on
-- the site would be invisible.
select pg_temp.check(
  'a watch at a post with no block is still readable',
  (select count(*) from watch_shifts where construction_block_id is null),
  2::bigint);

-- Null is not zero. Two rounds against a figure nobody recorded must not
-- read as two short of nought.
select pg_temp.check(
  'no expected count recorded means no shortfall, not a shortfall of nought',
  (select rounds_missing from watch_register
    where watch_shift_id = 'b7000000-0000-0000-0000-000000000002'),
  null::int);
select pg_temp.check(
  'and where a count was recorded the shortfall is counted',
  (select rounds_missing from watch_register
    where watch_shift_id = 'b7000000-0000-0000-0000-000000000001'),
  2::int);
select pg_temp.check(
  'rounds are counted from what was walked, not from what was due',
  (select rounds_recorded from watch_register
    where watch_shift_id = 'b7000000-0000-0000-0000-000000000003'),
  0::bigint);

-- Nothing closes a shift.
select pg_temp.check(
  'a watch left open stays open and is reported as never closed',
  (select never_closed from watch_register
    where watch_shift_id = 'b7000000-0000-0000-0000-000000000002'),
  true);
select pg_temp.check(
  'a watch open for two hours is not yet a watch nobody closed',
  (select never_closed from watch_register
    where watch_shift_id = 'b7000000-0000-0000-0000-000000000003'),
  false);

-- The write-up lag is a measurement, and it exists because recorded_at is
-- the machine's.
select pg_temp.check(
  'the register measures how long after the watch began it was written up',
  (select logged_hours_after_start >= 29.0 from watch_register
    where watch_shift_id = 'b7000000-0000-0000-0000-000000000001'),
  true);

-- An entry with no exit is an entry with no exit. It is not a person on site,
-- and the view carries no column that would let a screen say otherwise.
select pg_temp.check(
  'entries with no exit recorded are listed, not closed',
  (select count(*) from gate_presence),
  2::bigint);
select pg_temp.check(
  'an entry whose watch has ended is flagged as outlasting it',
  (select outlasted_its_watch from gate_presence
    where gate_visit_id = 'b7100000-0000-0000-0000-000000000002'),
  true);
select pg_temp.check(
  'an entry inside a watch that is still running is not',
  (select outlasted_its_watch from gate_presence
    where gate_visit_id = 'b7100000-0000-0000-0000-000000000003'),
  false);
select pg_temp.check(
  'and the view offers no column that claims the person is present',
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'gate_presence'
      and column_name in ('on_site', 'present', 'is_present', 'inside')),
  0::bigint);

-- What the book does not say, counted.
select pg_temp.check(
  'watch_health counts the watches nobody closed',
  (select watches_never_closed from watch_health), 1::bigint);
select pg_temp.check(
  'and the watches with no expected round count at all',
  (select watches_without_an_expected_count from watch_health), 1::bigint);
select pg_temp.check(
  'and the watches short of the rounds they were given',
  (select watches_short_of_their_rounds from watch_health), 2::bigint);
select pg_temp.check(
  'and the entries whose exit was never written down',
  (select entries_without_an_exit from watch_health), 2::bigint);
select pg_temp.check(
  'and the incidents with no evidence filed',
  (select incidents_without_evidence from watch_health), 2::bigint);
select pg_temp.check(
  'and the incidents whose response nobody recorded',
  (select incidents_without_a_response from watch_health), 1::bigint);
select pg_temp.check(
  'and the serious incidents where nobody decided about notifying anyone',
  (select serious_incidents_with_no_notification_decision from watch_health),
  1::bigint);

-- An incident with evidence is not reported as one without it, so the count
-- above is discriminating rather than a row count.
select pg_temp.check(
  'the incident with a police abstract filed counts its evidence',
  (select evidence_count from incident_register
    where site_incident_id = 'b7200000-0000-0000-0000-000000000001'),
  1::bigint);

-- ---------------------------------------------------------------------------
-- "An authority was told" needs the letter
-- ---------------------------------------------------------------------------

do $$
begin
  begin
    insert into site_incidents
      (watch_shift_id, kind, occurred_at, description_en, authority_notice,
       notified_at, recorded_by)
    values
      ('b7000000-0000-0000-0000-000000000003', 'theft', now() - interval '1 hour',
       'Reinforcement bar missing from the store.', 'notified',
       now(), '44444444-4444-4444-4444-444444444444');
    raise exception 'FAIL an authority notification was recorded with no letter behind it';
  exception
    when check_violation then
      raise notice 'ok   claiming an authority was notified requires the notification itself';
  end;
end;
$$;

do $$
begin
  begin
    insert into site_incidents
      (watch_shift_id, kind, occurred_at, description_en, authority_notice,
       notification_document_id, recorded_by)
    values
      ('b7000000-0000-0000-0000-000000000003', 'theft', now() - interval '1 hour',
       'Reinforcement bar missing from the store.', 'notified',
       '1b000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444');
    raise exception 'FAIL an authority notification was recorded with no date';
  exception
    when check_violation then
      raise notice 'ok   and the date it was sent';
  end;
end;
$$;

-- The other direction, so the record cannot be half told: a date and a letter
-- sitting under "unknown" would read as a notification on any screen that
-- showed them.
do $$
begin
  begin
    insert into site_incidents
      (watch_shift_id, kind, occurred_at, description_en, authority_notice,
       notified_at, notification_document_id, recorded_by)
    values
      ('b7000000-0000-0000-0000-000000000003', 'theft', now() - interval '1 hour',
       'Reinforcement bar missing from the store.', 'unknown',
       now(), '1b000000-0000-0000-0000-000000000001',
       '44444444-4444-4444-4444-444444444444');
    raise exception 'FAIL a notification date was stored without the claim it belongs to';
  exception
    when check_violation then
      raise notice 'ok   a notification date with no claim behind it is refused too';
  end;
end;
$$;

-- And the whole thing is accepted when it is whole, so the rule is a rule and
-- not a blanket refusal.
do $$
declare
  v_id uuid;
begin
  insert into site_incidents
    (watch_shift_id, kind, occurred_at, description_en, authority_notice,
     notified_at, notification_document_id, recorded_by)
  values
    ('b7000000-0000-0000-0000-000000000003', 'theft', now() - interval '1 hour',
     'Reinforcement bar missing from the store.', 'notified',
     now(), '1b000000-0000-0000-0000-000000000001',
     '44444444-4444-4444-4444-444444444444')
  returning id into v_id;
  raise notice 'ok   a notification with its date and its letter is accepted';
  perform v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- A near miss is the word for it only because nobody was hurt
-- ---------------------------------------------------------------------------

do $$
begin
  begin
    insert into site_incidents
      (watch_shift_id, kind, occurred_at, description_en, injured_count, recorded_by)
    values
      ('b7000000-0000-0000-0000-000000000003', 'near_miss', now() - interval '1 hour',
       'Board slipped and struck a labourer on the shoulder.', 1,
       '44444444-4444-4444-4444-444444444444');
    raise exception 'FAIL an injury was filed as a near miss';
  exception
    when check_violation then
      raise notice 'ok   a near miss with somebody hurt is refused';
  end;
end;
$$;

-- The same facts as an accident go in, which is the point: the constraint
-- moves the record to the right word rather than refusing the record.
do $$
begin
  insert into site_incidents
    (watch_shift_id, kind, occurred_at, description_en, injured_count, recorded_by)
  values
    ('b7000000-0000-0000-0000-000000000003', 'accident', now() - interval '1 hour',
     'Board slipped and struck a labourer on the shoulder.', 1,
     '44444444-4444-4444-4444-444444444444');
  raise notice 'ok   and the same facts are accepted as an accident';
end;
$$;

-- ---------------------------------------------------------------------------
-- When a thing was written down is the machine's to say
-- ---------------------------------------------------------------------------

do $$
declare
  v_id uuid;
  v_recorded timestamptz;
begin
  insert into watch_shifts (post, on_watch, began_at, recorded_by)
  values ('other', 'Test watch', now() - interval '1 hour',
          '44444444-4444-4444-4444-444444444444')
  returning id into v_id;

  update watch_shifts set recorded_at = timestamptz '1990-01-01 00:00:00+00'
   where id = v_id;
  raise exception 'FAIL the moment a watch was written down was edited';
exception
  when insufficient_privilege then
    raise notice 'ok   when a watch was written down cannot be edited afterwards';
end;
$$;

do $$
declare
  v_recorded timestamptz;
begin
  insert into watch_shifts (post, on_watch, began_at, recorded_at, recorded_by)
  values ('other', 'Backdated watch', now() - interval '1 hour',
          timestamptz '1990-01-01 00:00:00+00',
          '44444444-4444-4444-4444-444444444444')
  returning recorded_at into v_recorded;

  if v_recorded < now() - interval '1 minute' then
    raise exception 'FAIL a watch was written down in 1990';
  end if;
  raise notice 'ok   nor supplied on the way in — the stamp is the machine''s';
end;
$$;

-- ---------------------------------------------------------------------------
-- A round belongs inside its watch, and stays where it was walked
-- ---------------------------------------------------------------------------

do $$
begin
  begin
    insert into watch_rounds (watch_shift_id, walked_at, recorded_by)
    values ('b7000000-0000-0000-0000-000000000001', now() - interval '40 hours',
            '44444444-4444-4444-4444-444444444444');
    raise exception 'FAIL a round was recorded before its watch began';
  exception
    when check_violation then
      raise notice 'ok   a round before its watch began is refused';
  end;
end;
$$;

do $$
begin
  begin
    insert into watch_rounds (watch_shift_id, walked_at, recorded_by)
    values ('b7000000-0000-0000-0000-000000000001', now() - interval '2 hours',
            '44444444-4444-4444-4444-444444444444');
    raise exception 'FAIL a round was recorded after its watch ended';
  exception
    when check_violation then
      raise notice 'ok   and a round after it ended';
  end;
end;
$$;

do $$
begin
  begin
    update watch_rounds set walked_at = now() - interval '23 hours'
     where id = 'b7010000-0000-0000-0000-000000000001';
    raise exception 'FAIL when a round was walked was edited';
  exception
    when insufficient_privilege then
      raise notice 'ok   when a round was walked cannot be edited; another round is recorded';
  end;
end;
$$;

-- Closing a watch earlier than its own last round would leave the book
-- holding a shift whose rounds fall outside it.
do $$
begin
  begin
    update watch_shifts set ended_at = now() - interval '26 hours'
     where id = 'b7000000-0000-0000-0000-000000000001';
    raise exception 'FAIL a watch was closed before a round it already holds';
  exception
    when check_violation then
      raise notice 'ok   a watch cannot be closed before its own last round';
  end;
end;
$$;

-- A watch over a block has to say which block.
do $$
begin
  begin
    insert into watch_shifts (post, on_watch, began_at, recorded_by)
    values ('block', 'Nameless post', now() - interval '1 hour',
            '44444444-4444-4444-4444-444444444444');
    raise exception 'FAIL a block watch was recorded without a block';
  exception
    when check_violation then
      raise notice 'ok   a watch over a block has to name the block';
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- A confirmed incident is fixed, and its response is not
-- ---------------------------------------------------------------------------

do $$
begin
  begin
    update site_incidents
       set description_en = 'Nobody came over the fence after all.'
     where id = 'b7200000-0000-0000-0000-000000000001';
    raise exception 'FAIL a confirmed incident record was rewritten';
  exception
    when insufficient_privilege then
      raise notice 'ok   a confirmed incident record cannot be rewritten';
  end;
end;
$$;

do $$
begin
  update site_incidents
     set intervention_en = intervention_en || ' Fence repaired the same week.'
   where id = 'b7200000-0000-0000-0000-000000000001';
  raise notice 'ok   but what was done about it afterwards can still be added';
end;
$$;

do $$
begin
  begin
    update site_incidents set confirmed_at = null, confirmed_by = null
     where id = 'b7200000-0000-0000-0000-000000000001';
    raise exception 'FAIL a confirmed incident record was unconfirmed';
  exception
    when insufficient_privilege then
      raise notice 'ok   and it cannot be unconfirmed';
  end;
end;
$$;

select pg_temp.check(
  'confirming an incident freezes it and says when',
  (select confirm_incident('b7200000-0000-0000-0000-000000000003') is not null),
  true);

do $$
begin
  begin
    perform confirm_incident('b7200000-0000-0000-0000-000000000003');
    raise exception 'FAIL an incident was confirmed twice';
  exception
    when insufficient_privilege then
      raise notice 'ok   confirming is one way: a second attempt is refused';
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who keeps the book, and what nobody may do to it
-- ---------------------------------------------------------------------------

select pg_temp.act_as('77777777-7777-7777-7777-777777777777');  -- contractor

-- The watch book is AUTK's own record. A contractor reports progress on their
-- own blocks (M7-10); the register that may later be read against them is not
-- theirs to write.
do $$
begin
  begin
    insert into watch_shifts (post, on_watch, began_at, recorded_by)
    values ('main_gate', 'Contractor watch', now() - interval '1 hour',
            '77777777-7777-7777-7777-777777777777');
    raise exception 'FAIL a contractor wrote in the watch book';
  exception
    when insufficient_privilege then
      raise notice 'ok   a contractor cannot write in the watch book';
  end;
end;
$$;

-- Gate entries and incidents default to confidential, and the contractor's
-- clearance stops below it.
select pg_temp.check(
  'a contractor sees no gate entries', (select count(*) from gate_visits), 0::bigint);
select pg_temp.check(
  'nor any incident record', (select count(*) from site_incidents), 0::bigint);

do $$
begin
  begin
    perform confirm_incident('b7200000-0000-0000-0000-000000000002');
    raise exception 'FAIL an incident nobody can see was confirmed';
  exception
    when insufficient_privilege then
      raise notice 'ok   and cannot confirm one they cannot see';
  end;
end;
$$;

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');  -- admin

-- An incident record is the thing somebody would most want gone, which is the
-- reason delete is taken away rather than merely unpoliced: an unpoliced
-- delete fails with zero rows and no error, which reads like success.
do $$
begin
  begin
    delete from site_incidents where id = 'b7200000-0000-0000-0000-000000000002';
    raise exception 'FAIL an incident record was deleted';
  exception
    when insufficient_privilege then
      raise notice 'ok   not even an admin may delete an incident record';
  end;
end;
$$;

do $$
begin
  begin
    delete from watch_shifts where id = 'b7000000-0000-0000-0000-000000000001';
    raise exception 'FAIL a watch was deleted';
  exception
    when insufficient_privilege then
      raise notice 'ok   nor a watch somebody wrote down';
  end;
end;
$$;

-- The letter cited as proof that an authority was told cannot leave the vault
-- while the claim stands. Checked on the constraint rather than by deleting,
-- because document_vault has no delete policy either and a refusal there
-- would prove the wrong thing.
select pg_temp.check(
  'the cited notification letter cannot be removed from the vault',
  (select confdeltype from pg_constraint
    where conrelid = 'site_incidents'::regclass
      and confrelid = 'document_vault'::regclass),
  'r'::"char");
select pg_temp.check(
  'and neither can a document filed as incident evidence',
  (select confdeltype from pg_constraint
    where conrelid = 'incident_evidence'::regclass
      and confrelid = 'document_vault'::regclass),
  'r'::"char");

-- ===========================================================================
-- The other half of the contract-to-valuation match (0038): M14-07
-- ===========================================================================
--
-- 0022 could see from an instalment to the work behind it. These assertions
-- are the four disagreements it could not see, and the one it now refuses.

set role authenticated;
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- director

-- A second firm, so "matched to another firm's work" has another firm to be
-- matched to.
insert into contractors (id, name, contract_reference, starts_on) values
  ('1c000000-0000-0000-0000-000000000011', 'Nyali Builders', 'C-2024-02', current_date - 100);

insert into contracts
  (id, reference_no, counterparty_name, contractor_id, subject_en,
   value_amount, value_currency, value_basis, signed_on, starts_on,
   document_id, state, confidentiality)
values
  ('a3000000-0000-0000-0000-000000000009', 'CT-2026-09', 'Coast Engineering',
   '1c000000-0000-0000-0000-000000000010', 'Substructure of block A1',
   8000000, 'KES', 'fixed', current_date - 150, current_date - 150,
   '1b000000-0000-0000-0000-000000000001', 'active', 'internal');

-- Five more measurements. 0060, already certified and approved above, is the
-- one that agrees.
insert into valuations
  (id, construction_block_id, contractor_id, period_start, period_end, amount, currency)
values
  -- Another firm's work.
  ('1c000000-0000-0000-0000-000000000061', 'bbbb0000-0000-0000-0000-000000000001',
   '1c000000-0000-0000-0000-000000000011', current_date - 60, current_date - 30,
   640000, 'KES'),
  -- Measured at 2,200,000; the instalment below says 2,000,000.
  ('1c000000-0000-0000-0000-000000000062', 'bbbb0000-0000-0000-0000-000000000001',
   '1c000000-0000-0000-0000-000000000010', current_date - 60, current_date - 30,
   2200000, 'KES'),
  -- Measured in dollars. A valuation carries no exchange rate, so this one
  -- cannot be compared with a shilling instalment at all.
  ('1c000000-0000-0000-0000-000000000063', 'bbbb0000-0000-0000-0000-000000000001',
   '1c000000-0000-0000-0000-000000000010', current_date - 90, current_date - 60,
   15000, 'USD'),
  -- Certified, and nothing in the schedule against it.
  ('1c000000-0000-0000-0000-000000000064', 'bbbb0000-0000-0000-0000-000000000001',
   '1c000000-0000-0000-0000-000000000010', current_date - 20, current_date - 10,
   410000, 'KES'),
  -- A draft figure, also unscheduled, which is a different thing.
  ('1c000000-0000-0000-0000-000000000065', 'bbbb0000-0000-0000-0000-000000000001',
   '1c000000-0000-0000-0000-000000000010', current_date - 10, current_date,
   95000, 'KES');

update valuations
set qs_certified_by = 'cccc1111-1111-1111-1111-111111111111',
    qs_certified_at = now(),
    state = 'qs_certified'
where id = '1c000000-0000-0000-0000-000000000064';

-- A rejected measurement is not work owed, so the register must not count it
-- as unscheduled.
insert into valuations
  (id, construction_block_id, contractor_id, period_start, period_end, amount,
   currency, state)
values
  ('1c000000-0000-0000-0000-000000000066', 'bbbb0000-0000-0000-0000-000000000001',
   '1c000000-0000-0000-0000-000000000010', current_date - 40, current_date - 35,
   770000, 'KES', 'rejected');

insert into contract_milestones
  (id, contract_id, sequence, title_en, due_on, amount, currency, state,
   valuation_id, confidentiality)
values
  -- Agrees, and the measurement behind it is certified.
  ('a6000000-0000-0000-0000-000000000011', 'a3000000-0000-0000-0000-000000000009',
   1, 'Substructure, first period', current_date - 25, 1850000, 'KES', 'certified',
   '1c000000-0000-0000-0000-000000000060', 'internal'),
  -- Two numbers for one piece of work.
  ('a6000000-0000-0000-0000-000000000012', 'a3000000-0000-0000-0000-000000000009',
   2, 'Substructure, second period', current_date - 15, 2000000, 'KES', 'planned',
   '1c000000-0000-0000-0000-000000000062', 'internal'),
  -- Two currencies and no rate between them.
  ('a6000000-0000-0000-0000-000000000013', 'a3000000-0000-0000-0000-000000000009',
   3, 'Imported formwork', current_date - 5, 1000000, 'KES', 'planned',
   '1c000000-0000-0000-0000-000000000063', 'internal'),
  -- Certified by the schedule, measured by nobody.
  ('a6000000-0000-0000-0000-000000000014', 'a3000000-0000-0000-0000-000000000009',
   4, 'Site establishment', current_date - 100, 500000, 'KES', 'certified',
   null, 'internal'),
  -- Citing work measured for the other firm.
  ('a6000000-0000-0000-0000-000000000015', 'a3000000-0000-0000-0000-000000000009',
   5, 'Blockwork', current_date, 640000, 'KES', 'planned',
   '1c000000-0000-0000-0000-000000000061', 'internal');

-- Four answers, not two. The first two are the ones 0022 could already have
-- had; the last two are the reason the column is not a boolean.
select pg_temp.check('an instalment that matches its measurement agrees',
  (select amount_verdict from milestone_matching
    where contract_milestone_id = 'a6000000-0000-0000-0000-000000000011'), 'agree');
select pg_temp.check('two numbers for one piece of work is a disagreement',
  (select amount_verdict from milestone_matching
    where contract_milestone_id = 'a6000000-0000-0000-0000-000000000012'), 'disagree');
select pg_temp.check(
  'but two currencies with no rate between them is not — it cannot be compared',
  (select amount_verdict from milestone_matching
    where contract_milestone_id = 'a6000000-0000-0000-0000-000000000013'),
  'different_currencies');
select pg_temp.check('and an instalment with no measurement yet is not a disagreement either',
  (select amount_verdict from milestone_matching
    where contract_milestone_id = 'a6000000-0000-0000-0000-000000000014'), 'unmatched');

-- The schedule claiming a signature the works register does not hold.
select pg_temp.check('a certified instalment with no measurement behind it is named',
  (select claims_a_certification_the_works_do_not from milestone_matching
    where contract_milestone_id = 'a6000000-0000-0000-0000-000000000014'), true);
select pg_temp.check('while one whose surveyor did certify is not',
  (select claims_a_certification_the_works_do_not from milestone_matching
    where contract_milestone_id = 'a6000000-0000-0000-0000-000000000011'), false);
select pg_temp.check('and a planned instalment is never accused of claiming one',
  (select claims_a_certification_the_works_do_not from milestone_matching
    where contract_milestone_id = 'a6000000-0000-0000-0000-000000000012'), false);

select pg_temp.check('an instalment citing another firm''s measurement is named',
  (select matched_to_another_firms_work from milestone_matching
    where contract_milestone_id = 'a6000000-0000-0000-0000-000000000015'), true);
select pg_temp.check('and one citing its own firm''s is not',
  (select matched_to_another_firms_work from milestone_matching
    where contract_milestone_id = 'a6000000-0000-0000-0000-000000000011'), false);

-- The half that was missing: measured work nobody has scheduled a payment
-- for. Two of them, one certified.
select pg_temp.check('measured work with no instalment against it is listed at last',
  (select count(*) from unscheduled_valuations), 2::bigint);
select pg_temp.check('and a rejected measurement is not counted as work owed',
  (select count(*) from unscheduled_valuations
    where valuation_id = '1c000000-0000-0000-0000-000000000066'), 0::bigint);
select pg_temp.check('the certified one is told apart from the draft figure',
  (select count(*) from unscheduled_valuations where certified), 1::bigint);

-- The contract is named only where there is exactly one it could be.
select pg_temp.check('an unscheduled measurement names the one live contract for that firm',
  (select the_only_live_contract_for_that_firm from unscheduled_valuations
    where valuation_id = '1c000000-0000-0000-0000-000000000064'),
  'a3000000-0000-0000-0000-000000000009'::uuid);

insert into contracts
  (id, reference_no, counterparty_name, contractor_id, subject_en,
   value_amount, value_basis, signed_on, starts_on, document_id, state,
   confidentiality)
values
  ('a3000000-0000-0000-0000-000000000010', 'CT-2026-10', 'Coast Engineering',
   '1c000000-0000-0000-0000-000000000010', 'Superstructure of block A1',
   5000000, 'fixed', current_date - 60, current_date - 60,
   '1b000000-0000-0000-0000-000000000001', 'active', 'internal');

select pg_temp.check('and says nothing once there are two it could be',
  (select the_only_live_contract_for_that_firm from unscheduled_valuations
    where valuation_id = '1c000000-0000-0000-0000-000000000064'), null::uuid);

-- One measurement, one instalment. This is the one of the five that is
-- refused rather than reported: there is no reading of two instalments
-- against one measurement that is not an error or a double payment.
do $$
begin
  begin
    insert into contract_milestones
      (contract_id, sequence, title_en, amount, currency, state, valuation_id,
       confidentiality)
    values
      ('a3000000-0000-0000-0000-000000000010', 1, 'The same period again',
       1850000, 'KES', 'planned', '1c000000-0000-0000-0000-000000000060', 'internal');
    raise exception 'FAIL one measurement was scheduled for payment twice';
  exception
    when unique_violation then
      raise notice 'ok   one measurement settles one instalment, not two';
  end;
end;
$$;

-- And the instalments that cite nothing do not collide with each other,
-- which is what the index being partial is for.
do $$
begin
  insert into contract_milestones
    (contract_id, sequence, title_en, amount, currency, state, confidentiality)
  values
    ('a3000000-0000-0000-0000-000000000010', 2, 'Retention', 250000, 'KES',
     'planned', 'internal'),
    ('a3000000-0000-0000-0000-000000000010', 3, 'Final account', 400000, 'KES',
     'planned', 'internal');
  raise notice 'ok   while instalments that cite no measurement do not collide';
end;
$$;

-- Where the two registers disagree, counted.
select pg_temp.check('the disagreements are counted for somebody to work through',
  (select instalments_whose_amount_disagrees from payment_matching_health), 1::bigint);
select pg_temp.check('with the incomparable pair kept apart from them',
  (select instalments_that_cannot_be_compared from payment_matching_health), 1::bigint);
select pg_temp.check('and the schedule claiming an uncertified measurement',
  (select instalments_claiming_an_uncertified_measurement from payment_matching_health),
  1::bigint);
select pg_temp.check('and the one pointing at another firm''s work',
  (select instalments_matched_to_another_firms_work from payment_matching_health),
  1::bigint);
select pg_temp.check('and the settled instalments with nothing measured behind them',
  (select settled_instalments_with_no_measurement from payment_matching_health), 1::bigint);
select pg_temp.check('and the measured work nobody has scheduled',
  (select measured_work_with_no_instalment from payment_matching_health), 2::bigint);
select pg_temp.check('of which the certified half is its own number',
  (select certified_work_with_no_instalment from payment_matching_health), 1::bigint);

-- A planned instalment with no measurement yet is the normal state of a
-- payment plan. Counting it would bury the one that matters.
select pg_temp.check('a planned instalment with nothing measured yet is not a finding',
  (select count(*) from milestone_matching
    where amount_verdict = 'unmatched' and state = 'planned') > 0, true);

-- The firm reads its own schedule; the measurements behind it stay in the
-- commercial register, which M7-10 keeps from it.
select pg_temp.act_as('77777777-7777-7777-7777-777777777777');  -- contractor
select pg_temp.check('a contractor sees no measurement it was not shown before',
  (select count(*) from unscheduled_valuations), 0::bigint);
-- ===========================================================================
-- The close that says what it leaves out (0039): M8-16
-- ===========================================================================
--
-- The whole of this section is about the difference between a total and a
-- statement. A total sums what happens to be recorded; a statement says what
-- it leaves out.

set role authenticated;
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- director

-- A quarter that has ended, and the one running now.
insert into financial_periods (id, code, starts_on, ends_on, confidentiality) values
  ('a9000000-0000-0000-0000-000000000001', '2026-Q1',
   date_trunc('month', current_date - interval '5 months')::date,
   (date_trunc('month', current_date - interval '3 months') - interval '1 day')::date,
   'internal'),
  ('a9000000-0000-0000-0000-000000000002', 'current',
   date_trunc('month', current_date)::date,
   (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date,
   'internal');

-- Two periods cannot both hold one transaction, each with its own frozen
-- figures containing it.
do $$
begin
  begin
    insert into financial_periods (code, starts_on, ends_on, confidentiality)
    values ('overlapping',
            date_trunc('month', current_date - interval '4 months')::date,
            current_date, 'internal');
    raise exception 'FAIL two periods were allowed to overlap';
  exception
    when check_violation then
      raise notice 'ok   two financial periods cannot overlap';
  end;
end;
$$;

-- Three things inside the quarter, each one of them a gap: a payment with no
-- document and no voucher and no audit, a receipt with no receipt, and a
-- voucher nobody ruled on.
insert into financial_transactions
  (id, reference_no, date, category, amount, currency, confidentiality)
values
  ('a9100000-0000-0000-0000-000000000001', 'PV-Q1-1',
   date_trunc('month', current_date - interval '4 months')::date,
   'civil_construction', 450000, 'KES', 'internal'),
  -- Restricted, so the manifest has something to withhold from a reader who
  -- cannot see it.
  ('a9100000-0000-0000-0000-000000000002', 'PV-Q1-2',
   date_trunc('month', current_date - interval '4 months')::date + 5,
   'legal', 300000, 'KES', 'restricted');

insert into payment_vouchers
  (id, reference_no, payee, purpose, amount, currency, requested_by, requested_at,
   confidentiality)
values
  ('a9200000-0000-0000-0000-000000000001', 'VCH-Q1-1', 'Coast Hardware',
   'Cement for block A1', 220000, 'KES', '22222222-2222-2222-2222-222222222222',
   date_trunc('month', current_date - interval '4 months'), 'internal');

-- A period still running cannot be closed: that would freeze figures for days
-- that have not happened.
do $$
begin
  begin
    perform public.close_financial_period('a9000000-0000-0000-0000-000000000002');
    raise exception 'FAIL a period that has not ended was closed';
  exception
    when check_violation then
      raise notice 'ok   a period that is still running cannot be closed';
  end;
end;
$$;

-- Closing is not something everybody does.
select pg_temp.act_as('44444444-4444-4444-4444-444444444444');  -- field team
do $$
begin
  begin
    perform public.close_financial_period('a9000000-0000-0000-0000-000000000001');
    raise exception 'FAIL the field team closed the quarter';
  exception
    when insufficient_privilege then
      raise notice 'ok   closing a period is the director''s or the administrator''s';
  end;
end;
$$;

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- director

select pg_temp.check('the close reports what it leaves out, not just its total',
  (select (public.close_financial_period('a9000000-0000-0000-0000-000000000001')
            -> 'ledger_entries_with_no_document')::int), 2);
select pg_temp.check('and the voucher nobody ruled on',
  (select (gaps -> 'vouchers_never_decided')::int from financial_periods
    where id = 'a9000000-0000-0000-0000-000000000001'), 1);
select pg_temp.check('and the entries with no voucher behind them',
  (select (gaps -> 'ledger_entries_with_no_voucher')::int from financial_periods
    where id = 'a9000000-0000-0000-0000-000000000001'), 2);
select pg_temp.check('and the ones nobody audited',
  (select (gaps -> 'ledger_entries_never_audited')::int from financial_periods
    where id = 'a9000000-0000-0000-0000-000000000001'), 2);

select pg_temp.check('and the frozen total is stored rather than recomputed',
  (select closing_ledger_kes from financial_periods
    where id = 'a9000000-0000-0000-0000-000000000001'), 750000.00::numeric);

-- The close counts every row, including the ones the closer cannot read. The
-- director above could read all four tiers, so closing as them proves
-- nothing about this: the test needs a closer who is genuinely short of the
-- top tier, which a deputy director is. A close computed under one person's
-- clearance would be a different close for each closer, and the figure would
-- depend on who pressed the button.
reset role;
insert into auth.users (id, email, email_confirmed_at) values
  ('a9900000-0000-0000-0000-000000000001', 'deputy@example.test', now());
insert into profiles
  (id, full_name, email, role, organization, clearance, is_active, expires_at)
values
  ('a9900000-0000-0000-0000-000000000001', 'Deputy Director', 'deputy@example.test',
   'project_director', 'AUTK', 'confidential', true, null);
set role authenticated;

select pg_temp.act_as('a9900000-0000-0000-0000-000000000001');  -- deputy director
select pg_temp.check('the deputy cannot read the restricted payment',
  (select count(*) from financial_transactions
    where id = 'a9100000-0000-0000-0000-000000000002'), 0::bigint);

insert into financial_periods (id, code, starts_on, ends_on, confidentiality) values
  ('a9000000-0000-0000-0000-000000000003', '2025-Q4',
   date_trunc('month', current_date - interval '11 months')::date,
   (date_trunc('month', current_date - interval '9 months') - interval '1 day')::date,
   'internal');

reset role;
insert into financial_transactions
  (id, reference_no, date, category, amount, currency, confidentiality)
values
  ('a9100000-0000-0000-0000-000000000011', 'PV-Q4-1',
   date_trunc('month', current_date - interval '10 months')::date,
   'civil_construction', 200000, 'KES', 'internal'),
  ('a9100000-0000-0000-0000-000000000012', 'PV-Q4-2',
   date_trunc('month', current_date - interval '10 months')::date + 3,
   'legal', 80000, 'KES', 'restricted');
set role authenticated;
select pg_temp.act_as('a9900000-0000-0000-0000-000000000001');  -- deputy director

select pg_temp.check('the deputy sees one of the two payments in that quarter',
  (select count(*) from financial_transactions
    where date between date_trunc('month', current_date - interval '11 months')::date
                   and (date_trunc('month', current_date - interval '9 months') - interval '1 day')::date),
  1::bigint);

-- Taken in its own statement: a function called inside the where clause of
-- the select that reads the result reads the snapshot from before it ran.
do $$
begin
  perform public.close_financial_period('a9000000-0000-0000-0000-000000000003');
end;
$$;

select pg_temp.check('but the close they take counts both',
  (select closing_transactions from financial_periods
    where id = 'a9000000-0000-0000-0000-000000000003'), 2);
select pg_temp.check('and totals both, not only the half they can read',
  (select closing_ledger_kes from financial_periods
    where id = 'a9000000-0000-0000-0000-000000000003'), 280000.00::numeric);
-- And the manifest tells them their own file would be short of one of them.
select pg_temp.check('while their own audit file is reported as short by one row',
  (select rows_withheld from public.audit_file_manifest(
    'a9000000-0000-0000-0000-000000000003')), 1::bigint);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- director

-- Closing twice would overwrite a figure that has been reported.
do $$
begin
  begin
    perform public.close_financial_period('a9000000-0000-0000-0000-000000000001');
    raise exception 'FAIL a closed period was closed again';
  exception
    when insufficient_privilege then
      raise notice 'ok   a period cannot be closed twice';
  end;
end;
$$;

do $$
begin
  begin
    update financial_periods set state = 'open', closed_at = null, closed_by = null
     where id = 'a9000000-0000-0000-0000-000000000001';
    raise exception 'FAIL a closed period was reopened';
  exception
    when insufficient_privilege then
      raise notice 'ok   nor reopened';
  end;
end;
$$;

do $$
begin
  begin
    update financial_periods set closing_ledger_kes = 1
     where id = 'a9000000-0000-0000-0000-000000000001';
    raise exception 'FAIL the figures of a closed period were edited by hand';
  exception
    when insufficient_privilege then
      raise notice 'ok   nor its figures edited by hand';
  end;
end;
$$;

-- A late invoice is a real payment. Accepted, and stamped, so the reported
-- figure and the register can be seen to differ.
insert into financial_transactions
  (id, reference_no, date, category, amount, currency, confidentiality)
values
  ('a9100000-0000-0000-0000-000000000003', 'PV-Q1-LATE',
   date_trunc('month', current_date - interval '4 months')::date + 10,
   'civil_construction', 125000, 'KES', 'internal');

select pg_temp.check('an entry dated inside a closed period is accepted, not refused',
  (select count(*) from financial_transactions
    where id = 'a9100000-0000-0000-0000-000000000003'), 1::bigint);
select pg_temp.check('and stamped with the close it arrived after',
  (select closed_period_id from financial_transactions
    where id = 'a9100000-0000-0000-0000-000000000003'),
  'a9000000-0000-0000-0000-000000000001'::uuid);
select pg_temp.check('so the drift against the reported figure is on the record',
  (select entries_added_after_the_close from financial_close
    where financial_period_id = 'a9000000-0000-0000-0000-000000000001'), 1::bigint);
select pg_temp.check('with the amount it carries',
  (select added_after_the_close_kes from financial_close
    where financial_period_id = 'a9000000-0000-0000-0000-000000000001'), 125000.00::numeric);
select pg_temp.check('while the frozen total stays where it was',
  (select closing_ledger_kes from financial_close
    where financial_period_id = 'a9000000-0000-0000-0000-000000000001'), 750000.00::numeric);

-- A row that was in the close is not retrospectively called a late arrival.
select pg_temp.check('a row that was in the close is not stamped as late',
  (select closed_period_id from financial_transactions
    where id = 'a9100000-0000-0000-0000-000000000001'), null::uuid);

-- Rewriting a closed figure is refused; completing the paperwork is not.
do $$
begin
  begin
    update financial_transactions set amount = 999
     where id = 'a9100000-0000-0000-0000-000000000001';
    raise exception 'FAIL an amount inside a closed period was rewritten';
  exception
    when insufficient_privilege then
      raise notice 'ok   an amount inside a closed period cannot be rewritten';
  end;
end;
$$;

do $$
begin
  begin
    update financial_transactions
       set date = date_trunc('month', current_date)::date
     where id = 'a9100000-0000-0000-0000-000000000001';
    raise exception 'FAIL a transaction was moved out of a closed period';
  exception
    when insufficient_privilege then
      raise notice 'ok   nor moved out of the period it was reported in';
  end;
end;
$$;

do $$
begin
  update financial_transactions
     set document_id = '1b000000-0000-0000-0000-000000000001'
   where id = 'a9100000-0000-0000-0000-000000000001';
  raise notice 'ok   but the document can still be attached afterwards';
end;
$$;

-- The manifest: what a file would hold, and what it would not.
select pg_temp.check('the director reads every row in the period',
  (select rows_you_can_read from public.audit_file_manifest(
    'a9000000-0000-0000-0000-000000000001')), 3::bigint);
select pg_temp.check('and nothing is withheld from them',
  (select rows_withheld from public.audit_file_manifest(
    'a9000000-0000-0000-0000-000000000001')), 0::bigint);

select pg_temp.act_as('44444444-4444-4444-4444-444444444444');  -- field team
select pg_temp.check('somebody below the tier is told how many rows their file would miss',
  (select rows_withheld from public.audit_file_manifest(
    'a9000000-0000-0000-0000-000000000001')), 1::bigint);
select pg_temp.check('and the total they are counted against',
  (select rows_in_the_period from public.audit_file_manifest(
    'a9000000-0000-0000-0000-000000000001')), 3::bigint);
select pg_temp.check('with the tier named, and none of the content',
  (select withheld_by_tier from public.audit_file_manifest(
    'a9000000-0000-0000-0000-000000000001')), '{"restricted": 1}'::jsonb);
select pg_temp.check('the gaps are in the manifest too, so a partial file still carries them',
  (select (gaps -> 'ledger_entries_with_no_voucher')::int from public.audit_file_manifest(
    'a9000000-0000-0000-0000-000000000001')), 2);

-- Reading the period at all is gated the ordinary way: somebody who cannot
-- see it is told nothing about its shape.
update financial_periods set confidentiality = 'restricted'
 where id = 'a9000000-0000-0000-0000-000000000002';
select pg_temp.act_as('88888888-8888-8888-8888-888888888888');  -- donor
do $$
begin
  begin
    perform public.audit_file_manifest('a9000000-0000-0000-0000-000000000002');
    raise exception 'FAIL a manifest was returned for a period nobody may read';
  exception
    when insufficient_privilege then
      raise notice 'ok   a period somebody cannot read has no manifest for them either';
  end;
end;
$$;

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');  -- admin
do $$
begin
  begin
    delete from financial_periods where id = 'a9000000-0000-0000-0000-000000000001';
    raise exception 'FAIL a closed period was deleted';
  exception
    when insufficient_privilege then
      raise notice 'ok   a period that reported a figure cannot be deleted';
  end;
end;
$$;
-- ===========================================================================
-- A scenario that refuses a number (0040): M6-12
-- ===========================================================================
--
-- The one thing this must not do is produce a figure. Likelihood and impact
-- are ordinal scales from one to five, so they cannot be added across risks,
-- and the risks are correlated with nothing recording the correlation, so
-- they cannot be multiplied either. What it can do is say what the risks in
-- a set have in common, and every assertion below is about one of those two
-- halves.

set role authenticated;
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- director

-- An assumption two risks both rest on, so breaking it takes both.
insert into assumptions
  (id, statement_en, risk_category, state, last_checked_on, confidentiality)
values
  ('ab000000-0000-0000-0000-000000000001',
   'The partner trust keeps prosecuting the appeal', 'legal', 'shaky',
   current_date - 14, 'internal');

insert into risks
  (id, title_en, category, likelihood, impact, owner_profile_id, state, response,
   response_plan_en, trigger_en, source_assumption_id, confidentiality)
values
  -- Worst in the set: 4 x 4 = 16.
  ('ac000000-0000-0000-0000-000000000001', 'The partner withdraws from the appeal',
   'legal', 4, 4, '22222222-2222-2222-2222-222222222222', 'open', 'reduce',
   'Brief counsel to be ready to carry it alone',
   'Notice of withdrawal filed', 'ab000000-0000-0000-0000-000000000001', 'internal'),
  -- 3 x 3 = 9, same assumption, same owner.
  ('ac000000-0000-0000-0000-000000000002', 'Costs are awarded against the trust',
   'financial', 3, 3, '22222222-2222-2222-2222-222222222222', 'open', 'accept',
   'Hold a reserve against it', 'A costs ruling is listed',
   'ab000000-0000-0000-0000-000000000001', 'internal'),
  -- 2 x 3 = 6, no owner, no trigger and no response: three things the set
  -- does not know about itself.
  ('ac000000-0000-0000-0000-000000000003', 'An early monsoon floods the open slab',
   'climate', 2, 3, null, 'open', null, null, null, null, 'internal');

insert into risk_scenarios
  (id, name_en, rationale_en, horizon_on, confidentiality)
values
  ('ad000000-0000-0000-0000-000000000001',
   'The appeal collapses in the rainy season',
   'All three rest on the partner continuing, and the costs ruling and the '
   'monsoon fall in the same six weeks.',
   current_date + 60, 'internal');

insert into risk_scenario_members (scenario_id, risk_id) values
  ('ad000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000001'),
  ('ad000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000002'),
  ('ad000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000003');

-- The worst recorded score, and nothing that looks like a combined one.
select pg_temp.check('a scenario reports the worst recorded score in it',
  (select worst_recorded_score from scenario_register
    where scenario_id = 'ad000000-0000-0000-0000-000000000001'), 16);
select pg_temp.check('and the scores themselves, in order',
  (select recorded_scores from scenario_register
    where scenario_id = 'ad000000-0000-0000-0000-000000000001'), '{16,9,6}'::int[]);
-- 16 + 9 + 6 = 31, and 16 x 9 x 6 = 864. Neither appears anywhere in the
-- row, because either would be a number with the shape of a measurement and
-- none of its meaning.
select pg_temp.check(
  'and no column holds the sum of them, which an ordinal scale cannot support',
  (select count(*) from (
    select (to_jsonb(r) - 'recorded_scores') as row_json from scenario_register r
    where r.scenario_id = 'ad000000-0000-0000-0000-000000000001') j,
    jsonb_each_text(j.row_json) f
   where f.value in ('31', '864')), 0::bigint);

-- What the set does not know about itself.
select pg_temp.check('a risk in the set with no owner is counted',
  (select members_without_an_owner from scenario_register
    where scenario_id = 'ad000000-0000-0000-0000-000000000001'), 1);
select pg_temp.check('and one with no trigger, because nobody can tell whether it is happening',
  (select members_without_a_trigger from scenario_register
    where scenario_id = 'ad000000-0000-0000-0000-000000000001'), 1);
select pg_temp.check('and one with no response decided',
  (select members_without_a_response from scenario_register
    where scenario_id = 'ad000000-0000-0000-0000-000000000001'), 1);
select pg_temp.check('three risks make a scenario',
  (select is_a_scenario from scenario_register
    where scenario_id = 'ad000000-0000-0000-0000-000000000001'), true);

-- The overlap. This is the analysis: what makes them land together.
select pg_temp.check('the assumption two of them rest on is reported as shared',
  (select risks_reaching from scenario_overlap
    where scenario_id = 'ad000000-0000-0000-0000-000000000001'
      and kind = 'assumption'), 2);
select pg_temp.check('and named, so a reader knows which assumption to go and check',
  (select target_label from scenario_overlap
    where scenario_id = 'ad000000-0000-0000-0000-000000000001'
      and kind = 'assumption'),
  'The partner trust keeps prosecuting the appeal');
select pg_temp.check('the owner holding two of them is reported too',
  (select risks_reaching from scenario_overlap
    where scenario_id = 'ad000000-0000-0000-0000-000000000001'
      and kind = 'owner'), 2);

-- One mitigation between two risks: if that action slips, both land. This is
-- the overlap nobody finds reading the register risk by risk.
insert into action_items
  (id, text_en, due_date, owner_profile_id, confidentiality)
values
  ('ae000000-0000-0000-0000-000000000001', 'Brief leading counsel to carry the appeal alone',
   current_date + 20, '22222222-2222-2222-2222-222222222222', 'internal');
insert into risk_actions (risk_id, action_item_id) values
  ('ac000000-0000-0000-0000-000000000001', 'ae000000-0000-0000-0000-000000000001'),
  ('ac000000-0000-0000-0000-000000000002', 'ae000000-0000-0000-0000-000000000001');

select pg_temp.check('one action mitigating two of them is named as the single point it is',
  (select risks_reaching from scenario_overlap
    where scenario_id = 'ad000000-0000-0000-0000-000000000001'
      and kind = 'mitigating_action'), 2);

-- A thing two of them block.
insert into dependencies
  (blocker_risk_id, dependent_label, note_en, confidentiality)
values
  ('ac000000-0000-0000-0000-000000000001', 'Handover of the first teaching block',
   'No handover while title is contested', 'internal'),
  ('ac000000-0000-0000-0000-000000000003', 'Handover of the first teaching block',
   'No handover with the slab under water', 'internal');

select pg_temp.check('and the work two of them block is reported as one piece of work',
  (select risks_reaching from scenario_overlap
    where scenario_id = 'ad000000-0000-0000-0000-000000000001'
      and kind = 'blocks the same work'), 2);

-- Something only one risk reaches is not an overlap, which is what makes the
-- rows above mean anything. Both of the new links below are held by exactly
-- one member: an assumption of its own, and an owner of its own. Without
-- them the whole "> 1" rule would be untestable — a register that called
-- every link an overlap would pass.
insert into assumptions
  (id, statement_en, risk_category, state, last_checked_on, confidentiality)
values
  ('ab000000-0000-0000-0000-000000000002',
   'The rains come no earlier than the ten-year mean', 'climate', 'unverified',
   null, 'internal');
update risks set source_assumption_id = 'ab000000-0000-0000-0000-000000000002'
 where id = 'ac000000-0000-0000-0000-000000000003';

insert into risks
  (id, title_en, category, likelihood, impact, owner_profile_id, state, response,
   response_plan_en, trigger_en, confidentiality)
values
  ('ac000000-0000-0000-0000-000000000004', 'A second court lists a conflicting hearing',
   'legal', 2, 2, '11111111-1111-1111-1111-111111111111', 'open', 'accept',
   'Live with the clash', 'Two hearings listed on one day', 'internal');
insert into risk_scenario_members (scenario_id, risk_id) values
  ('ad000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000004');

select pg_temp.check('a link only one risk in the set reaches is not called an overlap',
  (select count(*) from scenario_overlap
    where scenario_id = 'ad000000-0000-0000-0000-000000000001'
      and risks_reaching < 2), 0::bigint);
select pg_temp.check('and the set does hold two such links, so the rule has something to exclude',
  (select count(*) from risks r
    join risk_scenario_members m on m.risk_id = r.id
   where m.scenario_id = 'ad000000-0000-0000-0000-000000000001'
     and (r.source_assumption_id = 'ab000000-0000-0000-0000-000000000002'
          or r.owner_profile_id = '11111111-1111-1111-1111-111111111111')),
  2::bigint);

-- A scenario holding a risk that has already landed is not hypothetical, and
-- the register says so rather than leaving it in the list.
update risks set state = 'materialised'
 where id = 'ac000000-0000-0000-0000-000000000004';
select pg_temp.check('a scenario holding a risk that already happened says so',
  (select members_already_materialised from scenario_register
    where scenario_id = 'ad000000-0000-0000-0000-000000000001'), 1);

-- The honest half of sensitivity: which of them are moving, from the score
-- history rather than from an impression.
-- 3 x 3 becomes 5 x 3, which is 15: a real rise that does not overtake the
-- worst risk in the set.
update risks set likelihood = 5 where id = 'ac000000-0000-0000-0000-000000000002';
select pg_temp.check('a risk rescored upward lately is counted as one that is moving',
  (select members_rescored_upward_lately from scenario_register
    where scenario_id = 'ad000000-0000-0000-0000-000000000001'), 1);
select pg_temp.check('and a rise that does not overtake the worst risk leaves the worst case alone',
  (select worst_recorded_score from scenario_register
    where scenario_id = 'ad000000-0000-0000-0000-000000000001'), 16);

-- 5 x 4 is 20, which does overtake it. The worst case is a maximum of
-- recorded scores, so it follows the register rather than being stored.
update risks set impact = 4 where id = 'ac000000-0000-0000-0000-000000000002';
select pg_temp.check('while one that does overtake it moves the worst case',
  (select worst_recorded_score from scenario_register
    where scenario_id = 'ad000000-0000-0000-0000-000000000001'), 20);
select pg_temp.check('and the scores stay the real ones, in order',
  (select recorded_scores from scenario_register
    where scenario_id = 'ad000000-0000-0000-0000-000000000001'), '{20,16,6,4}'::int[]);

-- A scenario is a reason, not a list.
do $$
begin
  begin
    insert into risk_scenarios (name_en, rationale_en, confidentiality)
    values ('Everything goes wrong', '   ', 'internal');
    raise exception 'FAIL a scenario was recorded with no reasoning';
  exception
    when check_violation then
      raise notice 'ok   a scenario has to say why those risks land together';
  end;
end;
$$;

do $$
begin
  begin
    update risk_scenarios set state = 'retired'
     where id = 'ad000000-0000-0000-0000-000000000001';
    raise exception 'FAIL a scenario was retired with no reason';
  exception
    when check_violation then
      raise notice 'ok   and why it was retired, when it is';
  end;
end;
$$;

-- A scenario must not become a way to learn that a restricted risk exists.
update risks set confidentiality = 'restricted'
 where id = 'ac000000-0000-0000-0000-000000000001';

-- A restricted risk that is not already in the set, so the refusal below is
-- the policy's rather than the primary key's.
insert into risks
  (id, title_en, category, likelihood, impact, state, response, response_plan_en,
   trigger_en, confidentiality)
values
  ('ac000000-0000-0000-0000-000000000005', 'A named individual is approached directly',
   'reputational', 2, 4, 'open', 'avoid', 'Nothing in writing',
   'An approach is reported', 'restricted');

select pg_temp.act_as('44444444-4444-4444-4444-444444444444');  -- field team
select pg_temp.check('somebody below the tier does not see the restricted risk in the set',
  (select count(*) from risk_scenario_members
    where scenario_id = 'ad000000-0000-0000-0000-000000000001'), 3::bigint);
do $$
begin
  begin
    insert into risk_scenario_members (scenario_id, risk_id)
    values ('ad000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000005');
    raise exception 'FAIL a risk nobody may read was added to a scenario';
  exception
    when insufficient_privilege then
      raise notice 'ok   nor can they add one they cannot read';
  end;
end;
$$;

select pg_temp.act_as('77777777-7777-7777-7777-777777777777');  -- contractor
do $$
begin
  begin
    insert into risk_scenarios (name_en, rationale_en, confidentiality)
    values ('Outsider scenario', 'Because.', 'internal');
    raise exception 'FAIL an outside firm wrote a scenario into the register';
  exception
    when insufficient_privilege then
      raise notice 'ok   an outside firm does not write scenarios';
  end;
end;
$$;
-- ===========================================================================
-- The deed says so, or it does not (0041): M10-13
-- ===========================================================================
--
-- This is the page that gets read out to a registrar. Every assertion below
-- is about keeping three things apart that a reference page usually runs
-- together: the deed's words, somebody's paraphrase of them, and whether
-- anybody has opened the file to check.

set role authenticated;
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- director

-- A quotation needs the file it is quoted from.
do $$
begin
  begin
    insert into charter_clauses (reference, quoted_text, confidentiality)
    values ('Clause 9.1',
            'The Board of Trustees shall consist of not fewer than five members.',
            'internal');
    raise exception 'FAIL the deed was quoted with no document behind the quotation';
  exception
    when check_violation then
      raise notice 'ok   quoting the deed requires the deed';
  end;
end;
$$;

-- A paraphrase does not, because it does not claim to be the deed's words.
insert into charter_clauses
  (id, reference, heading_en, summary_en, confidentiality)
values
  ('b1100000-0000-0000-0000-000000000001', 'Clause 9.1', 'Composition of the Board',
   'Somebody''s reading: the Board has at least five members.', 'internal');

select pg_temp.check('a paraphrase can be recorded without the file',
  (select count(*) from charter_clauses
    where id = 'b1100000-0000-0000-0000-000000000001'), 1::bigint);
select pg_temp.check('and is not reported as carrying the deed''s words',
  (select carries_the_deeds_words from charter_reference
    where clause_id = 'b1100000-0000-0000-0000-000000000001'), false);
select pg_temp.check('nor as checked against it',
  (select checked_against_the_deed from charter_reference
    where clause_id = 'b1100000-0000-0000-0000-000000000001'), false);
select pg_temp.check('and the register says the deed is not attached to it',
  (select deed_not_attached from charter_reference
    where clause_id = 'b1100000-0000-0000-0000-000000000001'), true);

-- Checking a citation against the deed means having the deed.
do $$
begin
  begin
    update charter_clauses
       set checked_against_the_deed_at = now(),
           checked_by = '22222222-2222-2222-2222-222222222222'
     where id = 'b1100000-0000-0000-0000-000000000001';
    raise exception 'FAIL a clause was marked checked with no document to check it against';
  exception
    when check_violation then
      raise notice 'ok   checking a clause against the deed requires the deed';
  end;
end;
$$;

-- With the file, both the quotation and the check become possible.
insert into charter_clauses
  (id, reference, heading_en, quoted_text, summary_en, document_id, located_at,
   confidentiality)
values
  ('b1100000-0000-0000-0000-000000000002', 'Clause 14(a)', 'Quorum of the Board',
   'No business shall be transacted unless two thirds of the members are present.',
   'Somebody''s reading: two thirds of the seats, not of those who turned up.',
   '1b000000-0000-0000-0000-000000000001', 'Part III, page 12', 'internal');

select pg_temp.check('a clause with the file behind it carries the deed''s words',
  (select carries_the_deeds_words from charter_reference
    where clause_id = 'b1100000-0000-0000-0000-000000000002'), true);

update charter_clauses
   set checked_against_the_deed_at = now(),
       checked_by = '22222222-2222-2222-2222-222222222222'
 where id = 'b1100000-0000-0000-0000-000000000002';
select pg_temp.check('and can be marked as found in the file',
  (select checked_against_the_deed from charter_reference
    where clause_id = 'b1100000-0000-0000-0000-000000000002'), true);

-- Moving the reference underneath a check would leave the check standing over
-- something nobody verified.
do $$
begin
  begin
    update charter_clauses set reference = 'Clause 14(b)'
     where id = 'b1100000-0000-0000-0000-000000000002';
    raise exception 'FAIL a checked clause was renumbered underneath its check';
  exception
    when insufficient_privilege then
      raise notice 'ok   a checked clause cannot be renumbered underneath the check';
  end;
end;
$$;

do $$
begin
  begin
    update charter_clauses
       set quoted_text = 'No business shall be transacted unless a majority are present.'
     where id = 'b1100000-0000-0000-0000-000000000002';
    raise exception 'FAIL the quotation under a check was rewritten';
  exception
    when insufficient_privilege then
      raise notice 'ok   nor its quotation rewritten';
  end;
end;
$$;

-- But somebody who looks again and cannot find it must be able to say so,
-- otherwise the check is unfalsifiable.
do $$
begin
  update charter_clauses
     set checked_against_the_deed_at = null, checked_by = null
   where id = 'b1100000-0000-0000-0000-000000000002';
  raise notice 'ok   while a check can be withdrawn by somebody who looked again';
end;
$$;
update charter_clauses
   set checked_against_the_deed_at = now(),
       checked_by = '22222222-2222-2222-2222-222222222222'
 where id = 'b1100000-0000-0000-0000-000000000002';

-- A citation names exactly one subject.
do $$
begin
  begin
    insert into charter_citations
      (clause_id, governance_organ_id, subject_label, confidentiality)
    values ('b1100000-0000-0000-0000-000000000002',
            (select id from governance_organs where kind = 'board_of_trustees'),
            'The quorum of the Board', 'internal');
    raise exception 'FAIL a citation named two subjects at once';
  exception
    when check_violation then
      raise notice 'ok   a citation names exactly one subject';
  end;
end;
$$;

-- The organ, and the rule that is not a row anywhere.
insert into charter_citations
  (clause_id, governance_organ_id, note_en, confidentiality)
values
  ('b1100000-0000-0000-0000-000000000001',
   (select id from governance_organs where kind = 'board_of_trustees'),
   'Where the Board comes from', 'internal');
insert into charter_citations
  (clause_id, subject_label, note_en, confidentiality)
values
  ('b1100000-0000-0000-0000-000000000002', 'The quorum of the Board',
   'Two thirds of the seats', 'internal');

select pg_temp.check('the citation register resolves an organ to its name',
  (select subject_label from charter_citation_register
    where clause_id = 'b1100000-0000-0000-0000-000000000001'), 'Board of Trustees');
select pg_temp.check('and keeps a rule that is not a record as the words somebody wrote',
  (select subject_label from charter_citation_register
    where clause_id = 'b1100000-0000-0000-0000-000000000002'), 'The quorum of the Board');
select pg_temp.check('a cited clause counts its citations',
  (select citations from charter_reference
    where clause_id = 'b1100000-0000-0000-0000-000000000001'), 1::bigint);
select pg_temp.check('and says what kind of thing cites it',
  (select cited_for from charter_reference
    where clause_id = 'b1100000-0000-0000-0000-000000000001'), '{organ}'::text[]);

-- The inverse, which is the reason to build the page: a rule with no clause.
-- The Board is now cited; the other two organs are not, and one of them is
-- about to carry a quorum.
-- As the admin: app.can_keep_governance() is admin, trustee and board
-- director, and the project director is not one of them — an update from the
-- seat above would have matched no policy and changed nothing, silently.
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');  -- admin
update governance_organs
   set quorum_fraction = 0.50
 where kind = 'management_board';
select pg_temp.check('the quorum this test needs is actually recorded',
  (select quorum_fraction from governance_organs where kind = 'management_board'),
  0.50::numeric);

select pg_temp.check('an organ with no clause cited against it is listed',
  (select count(*) from governance_without_a_clause
    where subject_kind = 'organ'), 2::bigint);
select pg_temp.check('and the one carrying a rule that will be enforced is marked',
  (select carries_a_rule from governance_without_a_clause
    where subject_kind = 'organ'
      and subject_label = 'Management Board'), true);
select pg_temp.check('while one with no rule recorded is not',
  (select carries_a_rule from governance_without_a_clause
    where subject_kind = 'organ'
      and subject_label = 'Audit Committee'), false);
select pg_temp.check('the cited organ has left the list',
  (select count(*) from governance_without_a_clause
    where subject_kind = 'organ' and subject_label = 'Board of Trustees'), 0::bigint);

-- 0021's free-text hook, reported rather than silently converted.
update governance_organs
   set charter_clause = 'Clause 22'
 where kind = 'audit_committee';
select pg_temp.check('and the free-text clause it needs too',
  (select charter_clause from governance_organs where kind = 'audit_committee'),
  'Clause 22');
select pg_temp.check('an organ naming a clause the register does not hold is reported',
  (select typed_clause_is_not_in_the_register from governance_without_a_clause
    where subject_kind = 'organ' and subject_label = 'Audit Committee'), true);
update governance_organs
   set charter_clause = 'Clause 14(a)'
 where kind = 'audit_committee';
select pg_temp.check('and not reported once the register holds it',
  (select typed_clause_is_not_in_the_register from governance_without_a_clause
    where subject_kind = 'organ' and subject_label = 'Audit Committee'), false);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');  -- director

-- One clause number, one record. Two rows for "Clause 9.1" would mean two
-- answers to the question this page exists to answer.
do $$
begin
  begin
    insert into charter_clauses (reference, summary_en, confidentiality)
    values ('Clause 9.1', 'A second reading of the same clause', 'internal');
    raise exception 'FAIL one clause number got two records';
  exception
    when unique_violation then
      raise notice 'ok   one clause number has one record';
  end;
end;
$$;

-- Who may cite the deed.
select pg_temp.act_as('44444444-4444-4444-4444-444444444444');  -- field team
select pg_temp.check('the field team reads the reference page',
  (select count(*) from charter_reference), 2::bigint);
do $$
begin
  begin
    insert into charter_clauses (reference, summary_en, confidentiality)
    values ('Clause 31', 'Something about the site', 'internal');
    raise exception 'FAIL the field team recorded a clause of the trust deed';
  exception
    when insufficient_privilege then
      raise notice 'ok   but does not record clauses of the trust deed';
  end;
end;
$$;

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');  -- admin
do $$
begin
  begin
    delete from charter_clauses where id = 'b1100000-0000-0000-0000-000000000002';
    raise exception 'FAIL a cited clause was deleted';
  exception
    when insufficient_privilege then
      raise notice 'ok   a clause this page has quoted cannot be deleted';
  end;
end;
$$;
reset role;

\echo ''
\echo 'All policy tests passed.'
