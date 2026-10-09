-- The project's backbone: phases, milestones, baselines and the chronology
-- (M15).
--
-- The requirement's complaint is structural: "Şu anda portalda 'proje planı'
-- diye bir şey yok — sadece modüller var." Fifteen modules, each keeping its
-- own register, and no time axis joining them. A hearing, a block, an
-- accreditation standard and an intake date are all dated, and nothing in the
-- portal says which of them waits on which.
--
-- Four things this adds, and one it fixes.
--
--   1. MILESTONES, with the plan and what happened side by side. target_on
--      and achieved_on are two columns, and `slip_days` is the subtraction —
--      because on a project that has been slipping for a decade, the slip is
--      the number, not the date.
--
--   2. ONE DEPENDENCY MECHANISM. 0016 already models "this waits on that"
--      across cases, tasks, obligations and risks. Milestones join that table
--      rather than getting a parallel one, so the chain M15-05 asks for — a
--      ruling, then the works, then accreditation, then an intake — is
--      walkable in a single structure.
--
--   3. BASELINES. "6 ay önce ne demiştik, şimdi neredeyiz?" is answerable
--      only if somebody wrote down what was said six months ago, so a
--      baseline is a frozen copy of every milestone's target, append-only. A
--      baseline that can be edited is not a baseline; it is the current plan
--      wearing a date.
--
--   4. A CHRONOLOGY back to 1993, which the registers cannot supply because
--      they start in 2024. Every entry names its source — the requirement
--      says so, and it says why: this is institutional memory AND legal
--      evidence. An undated, unsourced assertion is neither. Where an event
--      is known only to the year, the precision is recorded rather than a
--      1 January invented for it.
--
-- And the fix: the countdown banner read `deadline_notifications`, a
-- hand-typed register of dates, while every other screen read the calendar
-- computed from eight registers. Two answers to "what falls due" is the bug
-- this project keeps producing, so the hand-typed one goes. Dismissing an
-- alert becomes a per-user acknowledgement against the calendar entry — which
-- is what the old banner's own comment said it was waiting for, and better
-- than its original behaviour of DELETING the court date for everybody.
--
-- Requirements: M15-01, M15-02, M15-04, M15-05, M15-06, M15-07.

-- ---------------------------------------------------------------------------
-- Shared helpers, as the earlier migrations define them
-- ---------------------------------------------------------------------------

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

-- Who keeps the plan. The same people who keep the risk register: the plan is
-- the project's own account of itself, and the site team move milestones they
-- own as surely as the director does.
create or replace function app.can_keep_plan()
returns boolean
language sql
stable
as $$
  select coalesce((app.authority()).roles && array[
    'admin', 'project_director', 'trustee', 'board_director', 'field_team'
  ]::app_role[], false);
$$;

-- ---------------------------------------------------------------------------
-- Phases get a scope (M15-02)
-- ---------------------------------------------------------------------------

-- 0013 created project_phases with a code, a name and dates, which is enough
-- to hang a block off but not enough to answer "what is in this phase". The
-- requirement asks for the scope of each one.
alter table project_phases
  add column scope_en text,
  add column scope_tr text,
  add column objective_en text,
  add column objective_tr text;

comment on column project_phases.scope_en is
  'What this phase covers (M15-02). Prose, because a phase boundary is a '
  'judgement; the countable contents are in the phase_position view.';

-- ---------------------------------------------------------------------------
-- Milestones (M15-01)
-- ---------------------------------------------------------------------------

-- Named `milestone_progress` because `milestone_state` is already taken by
-- 0022's contract instalments, which are a different thing entirely.
create type milestone_progress as enum (
  'planned',
  'in_progress',
  'achieved',
  -- A date that passed without the thing happening. Distinct from 'planned'
  -- with a date in the past, because somebody has to say which it is.
  'missed',
  'abandoned'
);

create table milestones (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  phase_id uuid references project_phases (id) on delete set null,
  title_en text not null check (btrim(title_en) <> ''),
  title_tr text,
  detail_en text,
  detail_tr text,
  -- The plan and the fact, side by side. Keeping them in one column with a
  -- status beside it is how a decade of slipping dates becomes invisible.
  target_on date,
  achieved_on date,
  -- The subtraction, stored, because it is the number anybody actually wants
  -- and computing it on every screen is how two screens come to disagree.
  -- Null where either date is missing; negative where it came in early.
  slip_days int generated always as (achieved_on - target_on) stored,
  state milestone_progress not null default 'planned',
  -- Feeds the countdown strip of M15-04. Not every milestone belongs at the
  -- top of every screen, and marking them all critical is the same as
  -- marking none.
  critical boolean not null default false,
  owner_profile_id uuid references profiles (id),
  evidence_document_id uuid references document_vault (id),
  note text,

  -- Achieved means achieved: a date, and something in the vault that shows
  -- it. The same rule as a fulfilled obligation, a met accreditation
  -- standard and reported site progress.
  constraint milestones_achieved_is_evidenced check (
    state <> 'achieved'
    or (achieved_on is not null and evidence_document_id is not null)
  ),
  -- A date cannot be missed if there was never a date.
  constraint milestones_missed_had_a_target
    check (state <> 'missed' or target_on is not null),
  constraint milestones_abandoned_is_reasoned
    check (state <> 'abandoned' or btrim(coalesce(note, '')) <> '')
);
select app.add_common_columns('milestones');

create index milestones_phase_idx on milestones (phase_id, target_on);
create index milestones_critical_idx on milestones (target_on) where critical;

comment on table milestones is
  'The project''s milestones (M15-01): target, outcome, owner, dependencies '
  'and evidence. target_on and achieved_on are separate columns and '
  'slip_days is the subtraction, because on this project the slip is the '
  'number that matters.';

comment on column milestones.slip_days is
  'achieved_on minus target_on, stored. Negative means early. Null means one '
  'of the two dates is not known yet, which is not the same as nought.';

-- ---------------------------------------------------------------------------
-- One dependency mechanism (M15-01, M15-05)
-- ---------------------------------------------------------------------------

-- 0016 built this table for the RAID register and got the shape right:
-- exactly one thing on each side, drawn from any register. Milestones join it
-- rather than getting their own, which is what makes the chain of M15-05 — a
-- ruling, then the works, then accreditation, then an intake — a single walk
-- instead of four joins across two models.
alter table dependencies
  add column blocker_milestone_id uuid references milestones (id) on delete cascade,
  add column dependent_milestone_id uuid references milestones (id) on delete cascade;

alter table dependencies drop constraint dependencies_one_blocker;
alter table dependencies drop constraint dependencies_one_dependent;

alter table dependencies add constraint dependencies_one_blocker check (
  (blocker_legal_case_id is not null)::int
    + (blocker_site_task_id is not null)::int
    + (blocker_obligation_id is not null)::int
    + (blocker_risk_id is not null)::int
    + (blocker_milestone_id is not null)::int
    + (blocker_label is not null)::int = 1
);

alter table dependencies add constraint dependencies_one_dependent check (
  (dependent_site_task_id is not null)::int
    + (dependent_obligation_id is not null)::int
    + (dependent_legal_case_id is not null)::int
    + (dependent_milestone_id is not null)::int
    + (dependent_label is not null)::int = 1
);

-- A milestone cannot wait on itself.
alter table dependencies add constraint dependencies_not_self check (
  blocker_milestone_id is null
  or dependent_milestone_id is null
  or blocker_milestone_id <> dependent_milestone_id
);

-- The existing columns keep their positions, which is what create or replace
-- requires; the two milestone columns are appended and `blocker_settled`
-- learns about them.
create or replace view dependency_status with (security_invoker = true) as
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
  -- Still three-valued. Null means the portal cannot tell — a dependency on
  -- a court case is the case in point, and 0016 was right to refuse to guess.
  coalesce(
    (select t.state = 'completed' from site_tasks t where t.id = d.blocker_site_task_id),
    (select o.state = 'fulfilled' from obligations o where o.id = d.blocker_obligation_id),
    (select r.state = 'closed' from risks r where r.id = d.blocker_risk_id),
    (select m.state = 'achieved' from milestones m where m.id = d.blocker_milestone_id)
  ) as blocker_settled,
  d.blocker_milestone_id,
  d.dependent_milestone_id
from dependencies d;

comment on view dependency_status is
  'Every recorded dependency with whether its blocker has been settled, '
  'including milestones (M15-01, M15-05). blocker_settled stays '
  'three-valued: null where the portal cannot tell, which is what a '
  'dependency on a live court case is.';

-- ---------------------------------------------------------------------------
-- Baselines (M15-06)
-- ---------------------------------------------------------------------------

create table plan_baselines (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  taken_on date not null default current_date,
  taken_by uuid not null references profiles (id) default auth.uid(),
  note text,
  unique (name)
);
select app.add_common_columns('plan_baselines');

create table baseline_milestones (
  baseline_id uuid not null references plan_baselines (id) on delete cascade,
  milestone_id uuid not null references milestones (id) on delete cascade,
  -- The frozen copy. Deliberately a copy and not a reference: the whole point
  -- is to hold what the plan said then, after the plan has changed.
  target_on date,
  state milestone_progress not null,
  title_en text not null,
  primary key (baseline_id, milestone_id)
);
select app.add_common_columns('baseline_milestones');

comment on table plan_baselines is
  'What the plan said on a given day (M15-06), so "six months ago we said X" '
  'is a query rather than a memory. Append-only: a baseline that can be '
  'edited is the current plan wearing an old date.';

-- Append-only, both tables. The refusal is a trigger and the privilege is
-- withdrawn, because 0003 grants update and delete on every new table in this
-- schema and a rule that depends on a trigger still being attached is the
-- weaker of the two.
create trigger plan_baselines_append_only
  before update or delete on plan_baselines
  for each row execute function app.refuse_audit_mutation();

create trigger baseline_milestones_append_only
  before update or delete on baseline_milestones
  for each row execute function app.refuse_audit_mutation();

revoke update, delete on plan_baselines from authenticated;
revoke update, delete on baseline_milestones from authenticated;

-- Taking a baseline is one act over two tables, so it is one function.
--
-- Definer, because it writes the frozen rows — but it reads the milestones
-- under the caller's own visibility, so a baseline only ever contains what
-- the person taking it could see. A baseline that silently includes
-- restricted milestones would make the variance report a disclosure.
create or replace function public.take_baseline(
  p_name text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_baseline uuid;
  v_count int;
begin
  if not app.can_keep_plan() then
    raise exception 'taking a baseline is not yours to do'
      using errcode = 'insufficient_privilege';
  end if;

  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'a baseline needs a name, so it can be referred to later'
      using errcode = 'check_violation';
  end if;

  insert into plan_baselines (name, note) values (btrim(p_name), p_note)
  returning id into v_baseline;

  insert into baseline_milestones (baseline_id, milestone_id, target_on, state, title_en,
                                   confidentiality)
  select v_baseline, m.id, m.target_on, m.state, m.title_en, m.confidentiality
  from milestones m
  where app.can_read(m.confidentiality, 'milestones', m.id)
    and m.state not in ('abandoned');

  select count(*) into v_count from baseline_milestones where baseline_id = v_baseline;
  if v_count = 0 then
    raise exception 'there are no milestones to baseline yet'
      using errcode = 'no_data_found';
  end if;

  return v_baseline;
end;
$$;

comment on function public.take_baseline(text, text) is
  'Freezes every milestone the caller can see (M15-06). Definer so it can '
  'write the frozen rows, but it reads under the caller''s own visibility: a '
  'baseline that quietly included restricted milestones would turn the '
  'variance report into a disclosure.';

-- What we said then, against where we are now.
create view baseline_variance with (security_invoker = true) as
select
  b.id as baseline_id,
  b.name as baseline_name,
  b.taken_on,
  m.id as milestone_id,
  m.code,
  coalesce(m.title_en, bm.title_en) as title_en,
  m.title_tr,
  bm.target_on as baseline_target,
  m.target_on as current_target,
  -- The slip in the PLAN, which is a different number from the slip in
  -- delivery: this is how far the date has been moved, not how late the thing
  -- was. Both matter, and conflating them is how a project reports on time
  -- having moved its target four times.
  (m.target_on - bm.target_on) as target_moved_days,
  bm.state as baseline_state,
  m.state as current_state,
  m.achieved_on,
  m.slip_days as delivery_slip_days,
  m.confidentiality
from baseline_milestones bm
join plan_baselines b on b.id = bm.baseline_id
join milestones m on m.id = bm.milestone_id;

comment on view baseline_variance is
  'Each milestone''s target then against its target now (M15-06). '
  'target_moved_days is how far the date has been moved; delivery_slip_days '
  'is how late the thing actually was. A project that moves its target four '
  'times and reports on time is exploiting the difference.';

-- ---------------------------------------------------------------------------
-- The chronology (M15-07)
-- ---------------------------------------------------------------------------

-- A 1993 event may be known only to the year, and recording it as the first
-- of January is an invention that will later be read as a fact.
create type date_precision as enum ('day', 'month', 'year');

create type chronology_category as enum (
  'founding',
  'land',
  'legal',
  'construction',
  'governance',
  'funding',
  'academic',
  'other'
);

create table chronology_entries (
  id uuid primary key default gen_random_uuid(),
  occurred_on date not null,
  precision date_precision not null default 'day',
  category chronology_category not null,
  title_en text not null check (btrim(title_en) <> ''),
  title_tr text,
  detail_en text,
  detail_tr text,
  -- "her olay kaynağa bağlı". The requirement gives the reason: this is both
  -- institutional memory and legal evidence, and an entry nobody can trace is
  -- neither. The document is preferred; where it is not digitised yet, saying
  -- in writing where the knowledge comes from is the minimum.
  document_id uuid references document_vault (id),
  source_note text,
  legal_case_id uuid references legal_cases (id) on delete set null,

  constraint chronology_entries_has_a_source check (
    document_id is not null or btrim(coalesce(source_note, '')) <> ''
  ),
  -- Nothing before the trust's own beginnings, and nothing in the future: a
  -- chronology is a record of what happened.
  constraint chronology_entries_plausible_date
    check (occurred_on >= date '1960-01-01' and occurred_on <= current_date + 1)
);
select app.add_common_columns('chronology_entries');

create index chronology_entries_when_idx on chronology_entries (occurred_on);

comment on table chronology_entries is
  'Events from before the portal''s registers existed (M15-07), each tied to '
  'a source. `precision` carries how well the date is known, because '
  'recording a 1993 event as the first of January invents a fact that will '
  'later be read as one.';

-- ---------------------------------------------------------------------------
-- Acknowledging a date, per person (M15-04)
-- ---------------------------------------------------------------------------

-- The banner this replaces had a dismiss button that DELETED the row —
-- removing a court date from every user of the portal. Faz 0 made the
-- dismissal session-local with a comment saying it would stay that way until
-- per-user acknowledgements were stored. They are stored now, against the
-- calendar entry rather than against a hand-typed deadline row.
create table calendar_acknowledgements (
  kind calendar_kind not null,
  entry_id uuid not null,
  user_id uuid not null references profiles (id) on delete cascade default auth.uid(),
  acknowledged_at timestamptz not null default now(),
  primary key (kind, entry_id, user_id)
);

comment on table calendar_acknowledgements is
  'Who has seen which date (M15-04). Per user, so dismissing one takes it off '
  'your strip and nobody else''s — the opposite of the old banner, whose '
  'dismiss button deleted the deadline for everyone.';

alter table calendar_acknowledgements enable row level security;
alter table calendar_acknowledgements force row level security;

-- Yours and nobody else's, in both directions. Un-acknowledging is a delete
-- of your own row, which is harmless; there is nothing here anybody else
-- needs to read.
create policy calendar_acknowledgements_own on calendar_acknowledgements
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- The hand-typed register goes. "What falls due" had two answers — this
-- table, read by the banner, and project_calendar, computed from eight
-- registers and read by everything else. Two answers to one question is the
-- defect this portal keeps producing.
drop table if exists deadline_acknowledgements;
drop table if exists deadline_notifications;

-- ---------------------------------------------------------------------------
-- What is in each phase (M15-02)
-- ---------------------------------------------------------------------------

-- The prose scope says what a phase covers; this says what is actually in it,
-- counted from the registers. The gap between the two is the interesting part.
create view phase_position with (security_invoker = true) as
select
  p.id as phase_id,
  p.code,
  p.name_en,
  p.name_tr,
  p.sequence,
  p.starts_on,
  p.ends_on,
  p.scope_en,
  p.scope_tr,
  p.objective_en,
  p.objective_tr,
  blocks.total as blocks,
  blocks.complete as blocks_complete,
  stones.total as milestones,
  stones.achieved as milestones_achieved,
  stones.missed as milestones_missed,
  stones.next_target,
  money.budget_kes,
  (p.ends_on is not null and p.ends_on < current_date
   and (stones.total = 0 or stones.achieved < stones.total)) as overran,
  p.confidentiality
from project_phases p
cross join lateral (
  select
    count(*)::int as total,
    count(*) filter (where b.state = 'completed')::int as complete
  from construction_blocks b
  where b.phase_id = p.id
) blocks
cross join lateral (
  select
    count(*)::int as total,
    count(*) filter (where m.state = 'achieved')::int as achieved,
    count(*) filter (where m.state = 'missed')::int as missed,
    min(m.target_on) filter (where m.state in ('planned', 'in_progress')) as next_target
  from milestones m
  where m.phase_id = p.id
) stones
cross join lateral (
  select sum(l.amount_kes) as budget_kes
  from budget_lines l
  where l.phase_id = p.id
) money;

comment on view phase_position is
  'Each phase with what is actually in it (M15-02): blocks, milestones and '
  'budget, counted from the registers rather than described. `overran` is '
  'computed, so a phase whose end date has passed with work outstanding says '
  'so without anybody updating a status.';

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

alter table milestones enable row level security;
alter table milestones force row level security;

-- The plan is internal. A contractor sees their own work through M7's site
-- tasks and work packages, which are scoped to their blocks; a milestone is a
-- board-level marker, and `can_read` alone would hand the whole plan to
-- anybody with internal clearance. 0021's rule is the one that already says
-- this, so it is reused rather than restated.
create policy milestones_read on milestones for select to authenticated
  using (app.can_see_governance_record(confidentiality, 'milestones', id));

create policy milestones_insert on milestones for insert to authenticated
  with check (app.can_read(confidentiality) and app.can_keep_plan());

-- The owner of a milestone may move it; everybody else who keeps the plan may
-- too. What nobody may do is mark it achieved without the evidence, and that
-- is a check constraint rather than a policy.
create policy milestones_update on milestones for update to authenticated
  using (
    app.can_see_governance_record(confidentiality, 'milestones', id)
    and (app.can_keep_plan() or owner_profile_id = auth.uid())
  )
  with check (app.can_keep_plan() or owner_profile_id = auth.uid());

create policy milestones_delete on milestones for delete to authenticated
  using (app.is_admin());

alter table plan_baselines enable row level security;
alter table plan_baselines force row level security;

create policy plan_baselines_read on plan_baselines for select to authenticated
  using (app.can_see_governance_record(confidentiality, 'plan_baselines', id));

create policy plan_baselines_insert on plan_baselines for insert to authenticated
  with check (app.can_read(confidentiality) and app.can_keep_plan());

alter table baseline_milestones enable row level security;
alter table baseline_milestones force row level security;

-- A frozen row is readable with the milestone it froze, so a baseline cannot
-- become a way to read a milestone that has since been reclassified.
create policy baseline_milestones_read on baseline_milestones for select to authenticated
  using (
    app.can_read(confidentiality)
    and exists (
      select 1 from milestones m
      where m.id = milestone_id
        and app.can_see_governance_record(m.confidentiality, 'milestones', m.id)
    )
  );

create policy baseline_milestones_insert on baseline_milestones for insert to authenticated
  with check (app.can_keep_plan());

alter table chronology_entries enable row level security;
alter table chronology_entries force row level security;

-- Internal, with one deliberate exception: an entry tied to a case is
-- visible to whoever may see that case. The requirement calls the chronology
-- legal evidence as well as institutional memory, and for the advocate on a
-- matter the history of that matter is precisely the evidence — withholding
-- it and then asking them to argue the appeal is self-defeating.
create policy chronology_entries_read on chronology_entries for select to authenticated
  using (
    app.can_see_governance_record(confidentiality, 'chronology_entries', id)
    or (
      legal_case_id is not null
      and exists (
        select 1 from legal_cases c
        where c.id = legal_case_id and app.can_see_case(c.confidentiality, c.id)
      )
    )
  );

create policy chronology_entries_insert on chronology_entries for insert to authenticated
  with check (app.can_read(confidentiality) and app.can_keep_plan());

create policy chronology_entries_update on chronology_entries for update to authenticated
  using (
    app.can_see_governance_record(confidentiality, 'chronology_entries', id)
    and app.can_keep_plan()
  )
  with check (app.can_keep_plan());

create policy chronology_entries_delete on chronology_entries for delete to authenticated
  using (app.is_admin());

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select on phase_position to authenticated;
grant select on baseline_variance to authenticated;
grant execute on all functions in schema app to authenticated;

-- ---------------------------------------------------------------------------
-- The calendar needs a word for a milestone
-- ---------------------------------------------------------------------------

-- Added here, used in 0025, for the same reason 0022 and 0023 were split:
-- Postgres refuses to use a new enum value in the transaction that created
-- it, and a migration file is one transaction.
alter type calendar_kind add value if not exists 'milestone';
