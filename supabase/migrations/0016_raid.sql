-- Risk, issue, assumption and dependency (M6).
--
-- The evaluation listed risk management as one of three things missing
-- outright. What exists instead is people knowing: somebody remembers that
-- the lease has to hold, somebody else remembers that the partner foundation
-- has to keep funding the appeal, and nobody has written down what happens
-- when one of those stops being true.
--
-- A risk in somebody's head is not a managed risk. It has no owner, no
-- trigger, no plan, and no way of being wrong in public — which is what makes
-- it comfortable and useless.
--
-- Four registers, and the joins between them are the point:
--
--   * a **risk** is something that has not happened;
--   * an **issue** is something that has. A risk that materialises becomes
--     one and keeps the link, so "we did not see this coming" is checkable
--     (M6-04, M6-05);
--   * an **assumption** is something a plan rests on without anybody having
--     confirmed it. When one collapses the database raises a risk itself,
--     because the moment an assumption fails is exactly the moment nobody has
--     the attention to spare for filing one (M6-06);
--   * a **dependency** is "Y cannot start without X". On this project that
--     chain is a court ruling, then construction, then accreditation, and its
--     links are records the portal already holds (M6-07).
--
-- Requirements: M6-01 … M6-08. M6-09 falls out of the score history the
-- escalation trigger needs anyway.

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

-- ---------------------------------------------------------------------------
-- Vocabulary (M6-01)
-- ---------------------------------------------------------------------------

-- The categories are this project's, not a template's: a partner withdrawing
-- and a monsoon season are both live concerns here, and neither appears on a
-- generic risk register.
create type risk_category as enum (
  'legal',
  'political',
  'financial',
  'reputational',
  'site_safety',
  'construction',
  'accreditation',
  'partnership',
  'climate'
);

create type risk_state as enum (
  'open',
  'mitigating',
  -- It happened. The risk stays, pointing at the issue it became.
  'materialised',
  'closed'
);

-- M6-02. The four things anybody can do about a risk.
create type risk_response as enum ('avoid', 'reduce', 'transfer', 'accept');

create type issue_state as enum ('open', 'in_progress', 'resolved', 'closed');

create type assumption_state as enum (
  -- Nobody has checked.
  'unverified',
  'holding',
  -- Checked, and there is reason to doubt it.
  'shaky',
  'broken'
);

-- ---------------------------------------------------------------------------
-- Risks (M6-01, M6-02, M6-03)
-- ---------------------------------------------------------------------------

create table risks (
  id uuid primary key default gen_random_uuid(),
  title_en text not null,
  title_tr text,
  detail_en text,
  detail_tr text,
  category risk_category not null,

  likelihood int not null check (likelihood between 1 and 5),
  impact int not null check (impact between 1 and 5),
  -- Generated, so the score is never a third number somebody maintains
  -- alongside the two it comes from.
  score int generated always as (likelihood * impact) stored,

  owner_profile_id uuid references profiles (id) on delete set null,
  state risk_state not null default 'open',

  response risk_response,
  response_plan_en text,
  response_plan_tr text,

  -- M6-03. The distinction that makes a register usable: a risk without a
  -- trigger is a worry, and nobody can tell you whether it is happening.
  trigger_en text,
  trigger_tr text,
  early_warning_en text,
  early_warning_tr text,

  -- Where it came from, when it came from somewhere.
  source_legal_case_id uuid references legal_cases (id) on delete set null,
  source_obligation_id uuid references obligations (id) on delete set null,
  source_assumption_id uuid,

  review_on date,

  -- Choosing to accept a risk is a decision, and a decision with no reasoning
  -- attached is indistinguishable from not having noticed.
  constraint risks_acceptance_is_reasoned check (
    response <> 'accept' or response_plan_en is not null or response_plan_tr is not null
  )
);
select app.add_common_columns('risks');

create index risks_score_idx on risks (score desc) where state in ('open', 'mitigating');
create index risks_category_idx on risks (category);

-- M6-02. The plan is the actions, not the paragraph. A response strategy
-- nobody owns a task for is a sentence in a document.
create table risk_actions (
  risk_id uuid not null references risks (id) on delete cascade,
  action_item_id uuid not null references action_items (id) on delete cascade,
  primary key (risk_id, action_item_id)
);

alter table risk_actions enable row level security;
alter table risk_actions force row level security;

-- ---------------------------------------------------------------------------
-- How a score moved, and when it crossed the line (M6-08, M6-09)
-- ---------------------------------------------------------------------------

-- A register that only shows today's score cannot answer the one question
-- worth asking of it: is this getting worse? Written by a trigger and
-- editable by nobody, for the same reason the stance log is.
create table risk_score_changes (
  id bigserial primary key,
  risk_id uuid not null references risks (id) on delete cascade,
  from_likelihood int,
  from_impact int,
  from_score int,
  to_likelihood int not null,
  to_impact int not null,
  to_score int not null,
  changed_by uuid references profiles (id) default auth.uid(),
  changed_at timestamptz not null default now(),
  note text
);

create index risk_score_changes_risk_idx on risk_score_changes (risk_id, changed_at desc);

alter table risk_score_changes enable row level security;
alter table risk_score_changes force row level security;

-- Above this, the trustees are told. Fifteen is three of five on one axis and
-- five of five on the other — the point at which a risk stops being something
-- the people running the project can carry on their own.
--
-- A constant rather than a table because M6-10 (escalation rules a board can
-- configure) is a later requirement; when it arrives this becomes a lookup
-- and nothing else has to change.
create or replace function app.risk_escalation_threshold()
returns int
language sql
immutable
as $$ select 15; $$;

-- Crossing it is an event, recorded once, not a property of the row. A risk
-- that goes over and comes back has crossed twice, and both crossings matter.
create table risk_escalations (
  id bigserial primary key,
  risk_id uuid not null references risks (id) on delete cascade,
  score int not null,
  threshold int not null,
  escalated_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references profiles (id),
  note text
);

create index risk_escalations_risk_idx on risk_escalations (risk_id, escalated_at desc);

alter table risk_escalations enable row level security;
alter table risk_escalations force row level security;

create or replace function app.record_risk_score()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old_score int;
  v_new_score int;
begin
  v_new_score := new.likelihood * new.impact;
  v_old_score := case when tg_op = 'INSERT' then null else old.likelihood * old.impact end;

  if tg_op = 'INSERT' or v_old_score is distinct from v_new_score then
    insert into risk_score_changes
      (risk_id, from_likelihood, from_impact, from_score,
       to_likelihood, to_impact, to_score)
    values
      (new.id,
       case when tg_op = 'INSERT' then null else old.likelihood end,
       case when tg_op = 'INSERT' then null else old.impact end,
       v_old_score,
       new.likelihood, new.impact, v_new_score);

    -- Only on the way up, and only on the crossing. A risk that sits above
    -- the line does not escalate again every time somebody edits its title.
    if v_new_score >= app.risk_escalation_threshold()
       and (v_old_score is null or v_old_score < app.risk_escalation_threshold()) then
      insert into risk_escalations (risk_id, score, threshold)
      values (new.id, v_new_score, app.risk_escalation_threshold());
    end if;
  end if;

  return new;
end;
$$;

create trigger risks_score_recorded after insert or update on risks
  for each row execute function app.record_risk_score();

create or replace function app.refuse_risk_history_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'the risk history is written by the system and kept (attempted %)', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger risk_score_changes_no_update before update on risk_score_changes
  for each row execute function app.refuse_risk_history_mutation();
create trigger risk_score_changes_no_delete before delete on risk_score_changes
  for each row execute function app.refuse_risk_history_mutation();
create trigger risk_escalations_no_delete before delete on risk_escalations
  for each row execute function app.refuse_risk_history_mutation();

-- ---------------------------------------------------------------------------
-- Issues (M6-04, M6-05)
-- ---------------------------------------------------------------------------

create table issues (
  id uuid primary key default gen_random_uuid(),
  title_en text not null,
  title_tr text,
  detail_en text,
  detail_tr text,
  category risk_category not null,
  severity int not null check (severity between 1 and 5),
  owner_profile_id uuid references profiles (id) on delete set null,
  state issue_state not null default 'open',
  opened_on date not null default current_date,

  -- M6-05. The trace. A risk that materialised keeps pointing at the issue it
  -- became, and the issue points back, so nobody has to take "we could not
  -- have known" on trust.
  materialised_from_risk_id uuid references risks (id) on delete set null,

  resolved_at timestamptz,
  resolution_en text,
  resolution_tr text,

  constraint issues_resolution_is_whole check (
    (resolved_at is null) or (resolution_en is not null or resolution_tr is not null)
  )
);
select app.add_common_columns('issues');

create index issues_state_idx on issues (state, severity desc);

-- Turning a risk into an issue is one act, so it is one function: the issue
-- is created, the risk is moved to `materialised`, and neither can happen
-- without the other.
create or replace function public.materialise_risk(
  p_risk uuid,
  p_detail_en text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_risk risks;
  v_issue uuid;
begin
  select * into v_risk from risks where id = p_risk;
  if v_risk.id is null then
    raise exception 'no such risk' using errcode = 'no_data_found';
  end if;

  -- Definer rights bypass the policies, so both halves are checked here.
  if not app.can_see_risk(v_risk.confidentiality, v_risk.id) then
    raise exception 'no such risk, or it is not yours to see'
      using errcode = 'insufficient_privilege';
  end if;
  if not app.can_keep_risk_register() then
    raise exception 'this is not yours to record' using errcode = 'insufficient_privilege';
  end if;

  if v_risk.state = 'materialised' then
    raise exception 'this risk has already been recorded as an issue'
      using errcode = 'check_violation';
  end if;

  insert into issues
    (title_en, title_tr, detail_en, category, severity, owner_profile_id,
     materialised_from_risk_id, confidentiality)
  values
    (v_risk.title_en, v_risk.title_tr, coalesce(p_detail_en, v_risk.detail_en),
     v_risk.category, v_risk.impact, v_risk.owner_profile_id,
     v_risk.id, v_risk.confidentiality)
  returning id into v_issue;

  update risks set state = 'materialised' where id = p_risk;

  return v_issue;
end;
$$;

-- ---------------------------------------------------------------------------
-- Assumptions (M6-06)
-- ---------------------------------------------------------------------------

-- "The lease will remain valid." "The partner foundation will continue the
-- appeal." These are the load-bearing beliefs of the plan, and the reason to
-- write them down is that nobody argues with an assumption nobody has stated.
create table assumptions (
  id uuid primary key default gen_random_uuid(),
  statement_en text not null,
  statement_tr text,
  -- Which kind of risk it becomes if it fails, so the raised risk arrives
  -- classified rather than as "other".
  risk_category risk_category not null,
  state assumption_state not null default 'unverified',
  owner_profile_id uuid references profiles (id) on delete set null,
  review_on date,
  last_checked_on date,
  note text,

  -- Filled by the trigger below when the assumption breaks.
  raised_risk_id uuid references risks (id) on delete set null,

  constraint assumptions_checked_states check (
    state = 'unverified' or last_checked_on is not null
  )
);
select app.add_common_columns('assumptions');

alter table risks
  add constraint risks_source_assumption_fkey
  foreign key (source_assumption_id) references assumptions (id) on delete set null;

-- A collapsed assumption raises a risk by itself.
--
-- This is the one piece of automation in the schema that creates a record
-- nobody asked for, and it earns that: the moment an assumption fails is
-- exactly the moment everybody is busy dealing with the consequences, and a
-- risk filed later is a risk filed after it mattered. Likelihood is 5 because
-- it has already happened; impact is left at 3 for a person to correct, since
-- the database has no way of knowing.
create or replace function app.raise_risk_for_broken_assumption()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_risk uuid;
begin
  if new.state = 'broken' and old.state is distinct from 'broken'
     and new.raised_risk_id is null then
    insert into risks
      (title_en, detail_en, category, likelihood, impact, state,
       owner_profile_id, source_assumption_id, confidentiality, created_by)
    values
      ('An assumption the plan rests on has failed: ' || new.statement_en,
       'Raised automatically when the assumption was recorded as broken. '
         || 'The likelihood is five because it has already happened; the impact '
         || 'is a placeholder for somebody to set.',
       new.risk_category, 5, 3, 'open',
       new.owner_profile_id, new.id, new.confidentiality, auth.uid())
    returning id into v_risk;

    new.raised_risk_id := v_risk;
  end if;

  return new;
end;
$$;

create trigger assumptions_raise_risk before update on assumptions
  for each row execute function app.raise_risk_for_broken_assumption();

-- ---------------------------------------------------------------------------
-- Dependencies (M6-07)
-- ---------------------------------------------------------------------------

-- "Y cannot start without X." Each side points at a record the portal already
-- holds, or names something it does not yet — accreditation has no module, and
-- a register that could not mention it would be describing a different
-- project.
create table dependencies (
  id uuid primary key default gen_random_uuid(),

  blocker_legal_case_id uuid references legal_cases (id) on delete cascade,
  blocker_site_task_id uuid references site_tasks (id) on delete cascade,
  blocker_obligation_id uuid references obligations (id) on delete cascade,
  blocker_risk_id uuid references risks (id) on delete cascade,
  blocker_label text,

  dependent_site_task_id uuid references site_tasks (id) on delete cascade,
  dependent_obligation_id uuid references obligations (id) on delete cascade,
  dependent_legal_case_id uuid references legal_cases (id) on delete cascade,
  dependent_label text,

  note_en text,
  note_tr text,

  constraint dependencies_one_blocker check (
    (blocker_legal_case_id is not null)::int
      + (blocker_site_task_id is not null)::int
      + (blocker_obligation_id is not null)::int
      + (blocker_risk_id is not null)::int
      + (blocker_label is not null)::int = 1
  ),
  constraint dependencies_one_dependent check (
    (dependent_site_task_id is not null)::int
      + (dependent_obligation_id is not null)::int
      + (dependent_legal_case_id is not null)::int
      + (dependent_label is not null)::int = 1
  )
);
select app.add_common_columns('dependencies');

-- Whether the thing on the blocking side has actually been settled.
--
-- Left null for a label and for a case, because neither has a state this can
-- read honestly: "the case is active" says nothing about whether the ruling
-- the construction is waiting for has come.
create view dependency_status with (security_invoker = true) as
select
  d.id,
  d.blocker_legal_case_id,
  d.blocker_site_task_id,
  d.blocker_obligation_id,
  d.blocker_risk_id,
  d.blocker_label,
  d.dependent_site_task_id,
  d.dependent_obligation_id,
  d.dependent_legal_case_id,
  d.dependent_label,
  d.note_en,
  d.note_tr,
  d.confidentiality,
  coalesce(
    (select t.state = 'completed' from site_tasks t where t.id = d.blocker_site_task_id),
    (select o.state = 'fulfilled' from obligations o where o.id = d.blocker_obligation_id),
    (select r.state = 'closed' from risks r where r.id = d.blocker_risk_id)
  ) as blocker_settled
from dependencies d;

comment on view dependency_status is
  'What is waiting on what, and whether the blocking side is settled (M6-07). '
  'Null means the portal cannot say: a court case has no state that answers '
  '"has the ruling come", and a label is something outside the portal.';

-- ---------------------------------------------------------------------------
-- The matrix (M6-08)
-- ---------------------------------------------------------------------------

-- Five by five, counted. Empty cells come back as zero rather than as missing
-- rows, so a heat map is a join-free read and a cell nobody is in is visibly
-- empty rather than absent.
create view risk_matrix with (security_invoker = true) as
select
  l.likelihood,
  i.impact,
  l.likelihood * i.impact as score,
  count(r.id) as risk_count
from generate_series(1, 5) as l(likelihood)
cross join generate_series(1, 5) as i(impact)
left join risks r
  on r.likelihood = l.likelihood
  and r.impact = i.impact
  and r.state in ('open', 'mitigating')
group by l.likelihood, i.impact;

-- ---------------------------------------------------------------------------
-- Who may do what
-- ---------------------------------------------------------------------------

create or replace function app.can_see_risk(p_conf confidentiality, p_id uuid)
returns boolean
language sql
stable
as $$
  select app.can_read(p_conf, 'risks', p_id)
    and (p_conf = 'public' or app.is_internal() or app.has_grant('risks', p_id, 'read'));
$$;

-- The register is a statement about what could go wrong with this project,
-- including things about partners and politics. It belongs inside.
create or replace function app.can_keep_risk_register()
returns boolean
language sql
stable
as $$
  select app.acts_as('admin', 'project_director', 'trustee', 'board_director', 'field_team');
$$;

alter table risks enable row level security;
alter table risks force row level security;

create policy risks_read on risks
  for select using (app.can_see_risk(confidentiality, id));
create policy risks_insert on risks
  for insert with check (app.can_read(confidentiality) and app.can_keep_risk_register());
create policy risks_update on risks
  for update using (app.can_see_risk(confidentiality, id) and app.can_keep_risk_register())
  with check (app.can_keep_risk_register());
create policy risks_delete on risks
  for delete using (app.can_see_risk(confidentiality, id) and app.acts_as('admin', 'project_director'));

create policy risk_actions_read on risk_actions
  for select using (
    exists (select 1 from risks r where r.id = risk_id and app.can_see_risk(r.confidentiality, r.id))
  );
create policy risk_actions_write on risk_actions
  for insert with check (app.can_keep_risk_register());
create policy risk_actions_delete on risk_actions
  for delete using (app.can_keep_risk_register());

create policy risk_score_changes_read on risk_score_changes
  for select using (
    exists (select 1 from risks r where r.id = risk_id and app.can_see_risk(r.confidentiality, r.id))
  );

create policy risk_escalations_read on risk_escalations
  for select using (
    exists (select 1 from risks r where r.id = risk_id and app.can_see_risk(r.confidentiality, r.id))
  );
-- Acknowledging one is the only thing anybody does to it, and only the people
-- it was escalated to.
create policy risk_escalations_update on risk_escalations
  for update
  using (
    exists (select 1 from risks r where r.id = risk_id and app.can_see_risk(r.confidentiality, r.id))
    and app.acts_as('admin', 'trustee', 'board_director')
  )
  with check (app.acts_as('admin', 'trustee', 'board_director'));

alter table issues enable row level security;
alter table issues force row level security;

create policy issues_read on issues
  for select using (app.can_read(confidentiality) and (confidentiality = 'public' or app.is_internal()));
create policy issues_insert on issues
  for insert with check (app.can_read(confidentiality) and app.can_keep_risk_register());
create policy issues_update on issues
  for update using (app.can_read(confidentiality) and app.can_keep_risk_register())
  with check (app.can_keep_risk_register());

alter table assumptions enable row level security;
alter table assumptions force row level security;

create policy assumptions_read on assumptions
  for select using (app.can_read(confidentiality) and (confidentiality = 'public' or app.is_internal()));
create policy assumptions_insert on assumptions
  for insert with check (app.can_read(confidentiality) and app.can_keep_risk_register());
create policy assumptions_update on assumptions
  for update using (app.can_read(confidentiality) and app.can_keep_risk_register())
  with check (app.can_keep_risk_register());

alter table dependencies enable row level security;
alter table dependencies force row level security;

create policy dependencies_read on dependencies
  for select using (app.can_read(confidentiality));
create policy dependencies_insert on dependencies
  for insert with check (app.can_read(confidentiality) and app.can_keep_risk_register());
create policy dependencies_update on dependencies
  for update using (app.can_read(confidentiality) and app.can_keep_risk_register())
  with check (app.can_keep_risk_register());
create policy dependencies_delete on dependencies
  for delete using (app.can_read(confidentiality) and app.can_keep_risk_register());

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on risks, issues, assumptions, dependencies to authenticated;
grant select, insert, delete on risk_actions to authenticated;

-- Written by the trigger, kept by everybody. 0003's default privileges would
-- otherwise leave the refusal triggers unreachable, so a rewrite would fail
-- silently with zero rows instead of saying no.
revoke all on risk_score_changes from authenticated;
grant select on risk_score_changes to authenticated;
revoke all on risk_escalations from authenticated;
grant select, update on risk_escalations to authenticated;

grant select on risk_matrix, dependency_status to authenticated;
grant execute on all functions in schema app to authenticated;
grant execute on function public.materialise_risk(uuid, text) to authenticated;

drop function app.add_common_columns(regclass);
