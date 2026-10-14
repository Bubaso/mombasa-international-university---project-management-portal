-- Scenario and sensitivity analysis (M6-12).
--
-- The dangerous thing a scenario tool wants to do is produce a figure. "If
-- the partner withdraws from the appeal, the monsoon starts early and the
-- accreditation timetable slips, the project loses fourteen months and three
-- hundred million shillings." That sentence is what people want and this
-- portal cannot honestly produce any part of it.
--
-- Two reasons, and both are about the data rather than the arithmetic:
--
--   * `risks.likelihood` and `risks.impact` are ordinal scales from one to
--     five. A 4 is not twice a 2 and a 5 is not five times a 1. They can be
--     ranked and they cannot be added or multiplied across risks, so a
--     combined score would be a number with the shape of a measurement and
--     none of its meaning. The register therefore reports the *highest*
--     recorded score in a scenario, and nothing in these views holds a sum.
--
--   * Even if they were probabilities, these risks are not independent. An
--     early monsoon and a site security incident share a cause; a withdrawn
--     appeal and a slipped accreditation timetable share a calendar. Nothing
--     anywhere records the correlation, so multiplying likelihoods would
--     understate every scenario in the register by an unknown amount. The
--     screen says this in words rather than leaving it to be inferred from
--     an absent column.
--
-- What the portal can say honestly is better than a made-up figure, and it
-- is the thing a scenario is actually for: **what these risks have in
-- common**. Two risks resting on the same assumption fail together. Two
-- risks blocking the same work package stop the same thing. Two risks
-- mitigated by the same action item have one mitigation between them, so if
-- that action slips, both land. Two risks owned by the same person compete
-- for the same attention on the week they arrive. All four of those are
-- recorded links, computed rather than estimated, and none of them needs a
-- probability.
--
-- So: a scenario is a named set somebody chose, with a reason, and the
-- analysis is the overlap plus what the set does not know about itself —
-- members with no trigger (nobody can tell whether that one is happening),
-- no response, no owner, and members that have already materialised, because
-- a scenario containing a risk that has already landed is not hypothetical.
--
-- Requirements: M6-12.

create or replace function app.add_common_columns(p_table regclass)
returns void
language plpgsql
as $$
begin
  execute format($f$
    alter table %s
      add column if not exists confidentiality confidentiality not null default 'internal',
      add column if not exists created_by uuid references profiles (id),
      add column if not exists created_at timestamptz not null default now(),
      add column if not exists updated_by uuid references profiles (id),
      add column if not exists updated_at timestamptz not null default now();
  $f$, p_table);

  execute format(
    'create trigger %I before insert or update on %s for each row execute function app.touch_row()',
    'touch_' || p_table::text, p_table);

  execute format(
    'create trigger %I after insert or update or delete on %s for each row execute function app.record_audit()',
    'audit_' || p_table::text, p_table);
end;
$$;

create type scenario_state as enum ('considered', 'retired');

create table risk_scenarios (
  id uuid primary key default gen_random_uuid(),
  name_en text not null check (btrim(name_en) <> ''),
  name_tr text,

  -- Why somebody thinks these land together. Not optional: a scenario with
  -- no reasoning is a list of risks, and the reasoning is the only part of
  -- it that is not already in the register.
  rationale_en text not null check (btrim(rationale_en) <> ''),
  rationale_tr text,

  -- When, where the scenario is tied to a date — a hearing, the monsoon, an
  -- accreditation deadline. Null where it is not; nothing is inferred from
  -- the absence.
  horizon_on date,

  state scenario_state not null default 'considered',
  retired_reason text,

  constraint risk_scenarios_retirement_is_reasoned check (
    state <> 'retired' or btrim(coalesce(retired_reason, '')) <> ''
  )
);
select app.add_common_columns('risk_scenarios');

comment on table risk_scenarios is
  'A set of risks somebody thinks could land together, and why (M6-12). The '
  'reasoning is required because it is the only part that is not already in '
  'the risk register.';

create table risk_scenario_members (
  scenario_id uuid not null references risk_scenarios (id) on delete cascade,
  risk_id uuid not null references risks (id) on delete cascade,
  -- Why this one is in the set, where that is not obvious from the risk.
  note text,
  primary key (scenario_id, risk_id)
);

alter table risk_scenario_members enable row level security;
alter table risk_scenario_members force row level security;

create index risk_scenario_members_risk_idx on risk_scenario_members (risk_id);

-- A scenario with fewer than two risks is not a scenario. Reported rather
-- than refused: the row has to exist before its members can be added, so a
-- constraint would make the first insert impossible, and a deferred check
-- would still refuse the state somebody is in halfway through typing.
-- The register names it instead.

-- ---------------------------------------------------------------------------
-- What the register can say about a scenario
-- ---------------------------------------------------------------------------

create view scenario_register with (security_invoker = true) as
select
  s.id as scenario_id,
  s.name_en,
  s.name_tr,
  s.rationale_en,
  s.rationale_tr,
  s.horizon_on,
  s.state,
  s.retired_reason,
  count(r.id)::int as members,
  -- Two risks or it is not a scenario. Said, not refused.
  (count(r.id) >= 2) as is_a_scenario,

  -- The highest recorded score, and the scores themselves. There is no sum
  -- and no product in this view: likelihood and impact are ordinal, so a
  -- combined figure would have the shape of a measurement and none of its
  -- meaning. A reader who wants to compare two scenarios compares the worst
  -- risk in each, which is a comparison the data supports.
  max(r.score)::int as worst_recorded_score,
  array_remove(array_agg(r.score order by r.score desc), null) as recorded_scores,

  -- What the set does not know about itself.
  count(r.id) filter (where r.owner_profile_id is null)::int as members_without_an_owner,
  count(r.id) filter (
    where r.trigger_en is null and r.trigger_tr is null
  )::int as members_without_a_trigger,
  count(r.id) filter (where r.response is null)::int as members_without_a_response,
  -- A scenario holding a risk that has already landed is not hypothetical.
  count(r.id) filter (where r.state = 'materialised')::int as members_already_materialised,
  -- Which of them are moving, from the recorded score history rather than
  -- from an impression. This is the honest half of "sensitivity": the
  -- scenario's worst case is set by one risk, and these are the ones whose
  -- score has been revised upward lately.
  count(r.id) filter (
    where exists (
      select 1 from risk_score_changes c
      where c.risk_id = r.id
        and c.changed_at > now() - interval '180 days'
        and c.from_score is not null
        and c.to_score > c.from_score
    )
  )::int as members_rescored_upward_lately,

  greatest(
    s.confidentiality,
    coalesce(max(r.confidentiality), 'internal'::confidentiality)
  ) as confidentiality
from risk_scenarios s
left join risk_scenario_members m on m.scenario_id = s.id
left join risks r on r.id = m.risk_id
group by s.id;

comment on view scenario_register is
  'A scenario, the worst recorded score in it, and what the set does not '
  'know about itself (M6-12). No column holds a combined likelihood or a '
  'summed score: the scales are ordinal and the risks are correlated, so '
  'either figure would be invented.';

-- ---------------------------------------------------------------------------
-- What the risks in a scenario have in common
-- ---------------------------------------------------------------------------

-- The actual analysis. Every row is a thing that more than one risk in the
-- scenario reaches, so it is the thing that makes them land together rather
-- than separately — and every one of them is a recorded link.
create view scenario_overlap with (security_invoker = true) as
with members as (
  select m.scenario_id, r.*
  from risk_scenario_members m
  join risks r on r.id = m.risk_id
)
-- Risks resting on one assumption fail together when it breaks.
select
  m.scenario_id,
  'assumption'::text as kind,
  m.source_assumption_id as target_id,
  (select a.statement_en from assumptions a where a.id = m.source_assumption_id) as target_label,
  count(*)::int as risks_reaching,
  array_agg(m.id) as risk_ids
from members m
where m.source_assumption_id is not null
group by m.scenario_id, m.source_assumption_id
having count(*) > 1

union all

-- Risks out of one case move with that case.
select
  m.scenario_id,
  'legal_case',
  m.source_legal_case_id,
  (select c.title from legal_cases c where c.id = m.source_legal_case_id),
  count(*)::int,
  array_agg(m.id)
from members m
where m.source_legal_case_id is not null
group by m.scenario_id, m.source_legal_case_id
having count(*) > 1

union all

select
  m.scenario_id,
  'obligation',
  m.source_obligation_id,
  (select o.title_en from obligations o where o.id = m.source_obligation_id),
  count(*)::int,
  array_agg(m.id)
from members m
where m.source_obligation_id is not null
group by m.scenario_id, m.source_obligation_id
having count(*) > 1

union all

-- One person holding two of them has one week's attention between the two.
select
  m.scenario_id,
  'owner',
  m.owner_profile_id,
  (select p.full_name from profiles p where p.id = m.owner_profile_id),
  count(*)::int,
  array_agg(m.id)
from members m
where m.owner_profile_id is not null
group by m.scenario_id, m.owner_profile_id
having count(*) > 1

union all

-- One action item mitigating two of them means there is one mitigation
-- between the two: if that action slips, both land. This is the overlap
-- nobody finds by reading the register risk by risk.
select
  m.scenario_id,
  'mitigating_action',
  ra.action_item_id,
  (select a.text_en from action_items a where a.id = ra.action_item_id),
  count(distinct m.id)::int,
  array_agg(distinct m.id)
from members m
join risk_actions ra on ra.risk_id = m.id
group by m.scenario_id, ra.action_item_id
having count(distinct m.id) > 1

union all

-- Two of them blocking the same thing stop the same thing.
select
  m.scenario_id,
  'blocks the same work',
  coalesce(d.dependent_site_task_id, d.dependent_obligation_id, d.dependent_legal_case_id),
  coalesce(
    (select t.title_en from site_tasks t where t.id = d.dependent_site_task_id),
    (select o.title_en from obligations o where o.id = d.dependent_obligation_id),
    (select c.title from legal_cases c where c.id = d.dependent_legal_case_id),
    d.dependent_label
  ),
  count(distinct m.id)::int,
  array_agg(distinct m.id)
from members m
join dependencies d on d.blocker_risk_id = m.id
group by
  m.scenario_id,
  coalesce(d.dependent_site_task_id, d.dependent_obligation_id, d.dependent_legal_case_id),
  coalesce(
    (select t.title_en from site_tasks t where t.id = d.dependent_site_task_id),
    (select o.title_en from obligations o where o.id = d.dependent_obligation_id),
    (select c.title from legal_cases c where c.id = d.dependent_legal_case_id),
    d.dependent_label
  )
having count(distinct m.id) > 1;

comment on view scenario_overlap is
  'What more than one risk in a scenario reaches: a shared assumption, case, '
  'obligation, owner, mitigating action or blocked piece of work (M6-12). '
  'This is the analysis — every row is a recorded link, and none of it needs '
  'a probability.';

-- ---------------------------------------------------------------------------
-- Who may do what
-- ---------------------------------------------------------------------------

alter table risk_scenarios enable row level security;
alter table risk_scenarios force row level security;

create policy risk_scenarios_read on risk_scenarios
  for select using (app.can_read(confidentiality));
create policy risk_scenarios_insert on risk_scenarios
  for insert with check (
    app.can_read(confidentiality)
    and app.acts_as('admin', 'project_director', 'trustee', 'board_director', 'legal_counsel')
  );
create policy risk_scenarios_update on risk_scenarios
  for update
  using (
    app.can_read(confidentiality)
    and app.acts_as('admin', 'project_director', 'trustee', 'board_director', 'legal_counsel')
  )
  with check (
    app.acts_as('admin', 'project_director', 'trustee', 'board_director', 'legal_counsel')
  );

-- Membership follows the scenario, and adding a risk to one requires being
-- able to read that risk: a scenario must not become a way to learn that a
-- restricted risk exists.
create policy risk_scenario_members_read on risk_scenario_members
  for select using (
    exists (
      select 1 from risk_scenarios s
      where s.id = scenario_id and app.can_read(s.confidentiality)
    )
    and exists (
      select 1 from risks r where r.id = risk_id and app.can_read(r.confidentiality)
    )
  );
create policy risk_scenario_members_insert on risk_scenario_members
  for insert with check (
    app.acts_as('admin', 'project_director', 'trustee', 'board_director', 'legal_counsel')
    and exists (
      select 1 from risk_scenarios s
      where s.id = scenario_id and app.can_read(s.confidentiality)
    )
    and exists (
      select 1 from risks r where r.id = risk_id and app.can_read(r.confidentiality)
    )
  );
create policy risk_scenario_members_delete on risk_scenario_members
  for delete using (
    app.acts_as('admin', 'project_director', 'trustee', 'board_director', 'legal_counsel')
    and exists (
      select 1 from risk_scenarios s
      where s.id = scenario_id and app.can_read(s.confidentiality)
    )
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on risk_scenarios, risk_scenario_members from authenticated;
grant select, insert, update on risk_scenarios to authenticated;
grant select, insert, delete on risk_scenario_members to authenticated;

grant select on scenario_register, scenario_overlap to authenticated;

drop function app.add_common_columns(regclass);

select app.reset_function_grants();
