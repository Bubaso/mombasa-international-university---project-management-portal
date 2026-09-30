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

reset role;
\echo ''
\echo 'All policy tests passed.'
