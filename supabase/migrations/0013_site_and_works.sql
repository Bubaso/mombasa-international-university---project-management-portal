-- Construction and the site (M7).
--
-- The module this replaces was a list of blocks with a percentage on each.
-- The percentage was a number somebody typed. Nothing said where it came
-- from, nobody could tell a survey from an estimate from a guess, and the
-- figure that told the trustees how far along the project was had exactly the
-- same standing as the figure that told them the weather.
--
-- So the central decision here is that **there is no progress column**.
-- `construction_blocks.progress_percent` is dropped. Progress is a log of
-- reports, each of which carries a document — a photograph, a survey, an
-- engineer's note — and the foreign key is `not null`, so there is nowhere to
-- put a number without putting the evidence with it (M7-03). What a block is
-- at is then computed from its tasks rather than asserted about the block.
--
-- The second decision is that a site task is never only a site task. On this
-- project a task is simultaneously a thing a court may have forbidden, a line
-- in a bill of quantities, and a condition of accreditation. So a task can be
-- `legally_suspended`, a preservation task must record the legal basis that
-- justifies it, and opening work against a live prohibition is recorded
-- through the same override register that M2-06 already uses: the portal
-- warns and writes it down, it does not refuse.
--
-- Requirements: M7-01 … M7-11.

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
-- Vocabulary
-- ---------------------------------------------------------------------------

create type work_state as enum (
  'planned',
  'in_progress',
  'completed',
  -- A court stopped this. Not the same as nobody having got to it, and the
  -- distinction is the whole reason the project keeps a legal register.
  'legally_suspended',
  -- Work on a structure that is standing open, done to stop it deteriorating
  -- rather than to advance it.
  'emergency_preservation',
  -- Waiting on something else: a dependency, a payment, a permit.
  'blocked'
);

-- M7-11. Preservation is tracked apart from construction because the two
-- answer different questions. "How far along are we" must not be flattered by
-- money spent stopping a roof from failing.
create type work_kind as enum ('construction', 'preservation');

create type valuation_state as enum (
  'draft',
  'qs_certified',
  'director_approved',
  'paid',
  'rejected'
);

create type boq_state as enum ('draft', 'issued', 'superseded');

-- Donors are in Türkiye, the spending is in Kenya, the audit is somewhere
-- else (M8-03). Every amount in this schema and the next says which of these
-- it is in, because an amount without one is not a number.
create type currency_code as enum ('KES', 'USD', 'TRY');

-- ---------------------------------------------------------------------------
-- The work breakdown (M7-01)
-- ---------------------------------------------------------------------------

-- Phase → block → work package → task. The old flat list of blocks could not
-- say that a task belonged to a package that belonged to a contract.
create table project_phases (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_en text not null,
  name_tr text,
  sequence int not null,
  starts_on date,
  ends_on date,
  constraint project_phases_dates_ordered check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
select app.add_common_columns('project_phases');

-- M7-09. The contractor as an organisation the project has a contract with,
-- rather than a name typed into a block row. `organization_id` points at the
-- register from M4 so the firm is one entity across the portal.
create table contractors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations (id) on delete set null,
  name text not null,
  contract_reference text,
  scope_en text,
  scope_tr text,
  starts_on date,
  ends_on date,
  bond_amount numeric(14, 2),
  bond_currency currency_code,
  -- A judgement, so it carries who formed it and when, the way a stakeholder
  -- assessment does.
  performance_note text,
  performance_noted_by uuid references profiles (id),
  performance_noted_at timestamptz,
  constraint contractors_bond_has_currency check (
    (bond_amount is null) = (bond_currency is null)
  ),
  constraint contractors_dates_ordered check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
select app.add_common_columns('contractors');

-- The block, rebuilt (M7-02).
--
-- What comes off: the typed progress percentage (evidence now carries it),
-- the two money columns (M8 owns budgets, and a block cannot be its own
-- ledger), the free-text engineer and contractor (now people and firms), the
-- jsonb `items` bag (now work packages and tasks), the preservation flags
-- (now a kind of task, with its legal basis attached) and the last inspection
-- date (now derived from the inspections themselves, which is the only way it
-- can be trusted).
alter table construction_blocks
  drop column if exists progress_percent,
  drop column if exists budget_kshs,
  drop column if exists spent_kshs,
  drop column if exists lead_engineer,
  drop column if exists contractor,
  drop column if exists items,
  drop column if exists urgent_preservation_needed,
  drop column if exists preservation_action_en,
  drop column if exists preservation_action_tr,
  drop column if exists last_inspection_date;

alter table construction_blocks
  add column phase_id uuid references project_phases (id) on delete set null,
  add column purpose_en text,
  add column purpose_tr text,
  add column state work_state not null default 'planned',
  add column started_on date,
  add column target_completion date,
  add column lead_engineer_profile_id uuid references profiles (id) on delete set null,
  add column contractor_id uuid references contractors (id) on delete set null;

alter table construction_blocks
  add constraint construction_blocks_dates_ordered check (
    target_completion is null or started_on is null or target_completion >= started_on
  );

-- `status` was free text. Keep it for now only as a label; `state` is what
-- anything reasons about.
comment on column construction_blocks.state is
  'The state the portal reasons about. The older free-text status column is a '
  'label only.';

create table work_packages (
  id uuid primary key default gen_random_uuid(),
  construction_block_id uuid not null references construction_blocks (id) on delete cascade,
  code text not null,
  title_en text not null,
  title_tr text,
  contractor_id uuid references contractors (id) on delete set null,
  planned_start date,
  planned_end date,
  constraint work_packages_dates_ordered check (
    planned_end is null or planned_start is null or planned_end >= planned_start
  ),
  constraint work_packages_code_unique unique (construction_block_id, code)
);
select app.add_common_columns('work_packages');

create table site_tasks (
  id uuid primary key default gen_random_uuid(),
  work_package_id uuid not null references work_packages (id) on delete cascade,
  title_en text not null,
  title_tr text,
  kind work_kind not null default 'construction',
  state work_state not null default 'planned',
  planned_start date,
  planned_end date,
  owner_profile_id uuid references profiles (id) on delete set null,

  -- M7-11. A preservation task exists because of something — a court order
  -- that stopped the main works, a season, a ruling. Saying which is the
  -- difference between a protected structure and an unexplained expense.
  legal_basis_en text,
  legal_basis_tr text,
  source_legal_order_id uuid references legal_orders (id) on delete set null,

  constraint site_tasks_preservation_is_justified check (
    kind <> 'preservation' or legal_basis_en is not null or source_legal_order_id is not null
  ),
  constraint site_tasks_dates_ordered check (
    planned_end is null or planned_start is null or planned_end >= planned_start
  )
);
select app.add_common_columns('site_tasks');

create index site_tasks_package_idx on site_tasks (work_package_id);
create index work_packages_block_idx on work_packages (construction_block_id);

-- Resolves the block a task belongs to without going back through the
-- policies of the tables in between, which would recurse. Authorisation is
-- still done by the caller, against the block id this returns.
create or replace function app.block_of_task(p_task uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select wp.construction_block_id
  from site_tasks t
  join work_packages wp on wp.id = t.work_package_id
  where t.id = p_task;
$$;

create or replace function app.block_of_package(p_package uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select construction_block_id from work_packages where id = p_package;
$$;

-- ---------------------------------------------------------------------------
-- Progress, which cannot be asserted (M7-03)
-- ---------------------------------------------------------------------------

-- The point of this table is the `not null` on document_id. There is no route
-- to recording progress that does not also record what the claim rests on.
--
-- Append-only, for the same reason the custody chain is: a progress history
-- that can be tidied afterwards tells you what somebody currently wishes had
-- happened, which is not what a history is for.
create table task_progress (
  id uuid primary key default gen_random_uuid(),
  site_task_id uuid not null references site_tasks (id) on delete cascade,
  percent_complete int not null check (percent_complete between 0 and 100),

  -- The evidence. Not optional, not nullable, not "recommended".
  document_id uuid not null references document_vault (id),

  -- When the photograph or survey was taken, which is not when it was filed.
  -- A picture from six weeks ago attached today is still a picture from six
  -- weeks ago, and the gap is exactly what a reader needs to see.
  captured_at timestamptz,
  captured_lat numeric(9, 6),
  captured_lng numeric(9, 6),

  note text,
  reported_by uuid not null references profiles (id) default auth.uid(),
  reported_at timestamptz not null default now(),

  constraint task_progress_location_is_a_pair check (
    (captured_lat is null) = (captured_lng is null)
  )
);

create index task_progress_task_idx on task_progress (site_task_id, reported_at desc);

create or replace function app.refuse_progress_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'a progress report is append-only; file a newer one instead (attempted %)', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger task_progress_no_update before update on task_progress
  for each row execute function app.refuse_progress_mutation();
create trigger task_progress_no_delete before delete on task_progress
  for each row execute function app.refuse_progress_mutation();

alter table task_progress enable row level security;
alter table task_progress force row level security;

-- Where a block has got to, computed rather than stored.
--
-- The average is over tasks, taking each task's most recent report. It is
-- deliberately unweighted: weighting by value would make progress a function
-- of the bill of quantities, and the bill of quantities is a thing under
-- negotiation. An unweighted number that everyone understands beats a
-- weighted one that moves when a rate is renegotiated.
create view block_progress with (security_invoker = true) as
with latest as (
  select distinct on (p.site_task_id)
    p.site_task_id,
    p.percent_complete,
    p.reported_at,
    p.captured_at
  from task_progress p
  order by p.site_task_id, p.reported_at desc
)
select
  b.id as construction_block_id,
  b.code,
  b.name,
  b.state,
  b.confidentiality,
  count(t.id) filter (where t.kind = 'construction') as construction_tasks,
  count(t.id) filter (where t.kind = 'preservation') as preservation_tasks,
  count(l.site_task_id) as tasks_with_evidence,
  -- Null, not zero, when nothing has been evidenced. Nobody has said this
  -- block is at nought; nobody has said anything about it at all.
  round(avg(l.percent_complete) filter (where t.kind = 'construction'))::int as percent_complete,
  max(l.reported_at) as last_reported_at,
  max(l.captured_at) as last_captured_at
from construction_blocks b
left join work_packages wp on wp.construction_block_id = b.id
left join site_tasks t on t.work_package_id = wp.id
left join latest l on l.site_task_id = t.id
group by b.id, b.code, b.name, b.state, b.confidentiality;

comment on view block_progress is
  'What a block is at, computed from evidenced task reports (M7-03). Null '
  'means nothing has been reported, which is not the same as zero.';

-- ---------------------------------------------------------------------------
-- Inspection (M7-04)
-- ---------------------------------------------------------------------------

-- An inspection report is evidence. It gets signed, and after that it is
-- fixed: findings are added while it is open and frozen when it is signed,
-- exactly as minutes are.
create table site_inspections (
  id uuid primary key default gen_random_uuid(),
  construction_block_id uuid not null references construction_blocks (id) on delete cascade,
  inspected_on date not null,
  inspector_profile_id uuid not null references profiles (id) default auth.uid(),
  inspector_name text,
  summary_en text,
  summary_tr text,
  -- Signing is one-way. There is no column for unsigning, and a trigger
  -- refuses the transition.
  signed_off_at timestamptz,
  signed_off_by uuid references profiles (id),
  constraint site_inspections_signature_is_whole check (
    (signed_off_at is null) = (signed_off_by is null)
  )
);
select app.add_common_columns('site_inspections');

create index site_inspections_block_idx on site_inspections (construction_block_id, inspected_on desc);

create table inspection_findings (
  id uuid primary key default gen_random_uuid(),
  site_inspection_id uuid not null references site_inspections (id) on delete cascade,
  description_en text not null,
  description_tr text,
  -- A non-conformity is a finding with consequences: it is the thing a
  -- contractor is asked to put right, and the thing an auditor looks for.
  is_nonconformity boolean not null default false,
  severity int check (severity between 1 and 5),
  document_id uuid references document_vault (id) on delete set null,
  resolved_at timestamptz,
  resolution_note text,
  constraint inspection_findings_resolution_is_whole check (
    (resolved_at is null) or (resolution_note is not null)
  )
);

create index inspection_findings_inspection_idx on inspection_findings (site_inspection_id);

alter table inspection_findings enable row level security;
alter table inspection_findings force row level security;

create or replace function app.refuse_signed_inspection_edit()
returns trigger
language plpgsql
as $$
declare
  v_signed timestamptz;
  v_inspection uuid;
begin
  v_inspection := coalesce(new.site_inspection_id, old.site_inspection_id);
  select signed_off_at into v_signed from site_inspections where id = v_inspection;

  if v_signed is not null then
    -- Closing out a finding is not editing the report: the finding stands,
    -- and what is being added is what was done about it.
    if tg_op = 'UPDATE'
       and new.description_en is not distinct from old.description_en
       and new.description_tr is not distinct from old.description_tr
       and new.is_nonconformity is not distinct from old.is_nonconformity
       and new.severity is not distinct from old.severity then
      return new;
    end if;

    raise exception 'this inspection is signed; its findings are fixed (attempted %)', tg_op
      using errcode = 'insufficient_privilege';
  end if;

  return case tg_op when 'DELETE' then old else new end;
end;
$$;

create trigger inspection_findings_frozen
  before insert or update or delete on inspection_findings
  for each row execute function app.refuse_signed_inspection_edit();

create or replace function app.refuse_inspection_reopening()
returns trigger
language plpgsql
as $$
begin
  if old.signed_off_at is not null then
    if new.signed_off_at is null then
      raise exception 'a signed inspection report cannot be unsigned'
        using errcode = 'insufficient_privilege';
    end if;

    if new.summary_en is distinct from old.summary_en
       or new.summary_tr is distinct from old.summary_tr
       or new.inspected_on is distinct from old.inspected_on
       or new.inspector_profile_id is distinct from old.inspector_profile_id then
      raise exception 'a signed inspection report cannot be edited'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$$;

create trigger site_inspections_one_way before update on site_inspections
  for each row execute function app.refuse_inspection_reopening();

-- ---------------------------------------------------------------------------
-- Working against a prohibition (M7-06)
-- ---------------------------------------------------------------------------

-- Which blocks a prohibition actually covers. Nothing can infer this from the
-- text of an order, and a system that guessed would be worse than one that
-- asks: somebody who has read the order says which blocks it reaches, once,
-- and after that the check cannot be forgotten.
create table obligation_blocks (
  obligation_id uuid not null references obligations (id) on delete cascade,
  construction_block_id uuid not null references construction_blocks (id) on delete cascade,
  note text,
  primary key (obligation_id, construction_block_id)
);

alter table obligation_blocks enable row level security;
alter table obligation_blocks force row level security;

-- The override register already records proceeding in spite of an obligation
-- and already points at a block. A task is the finer-grained answer to the
-- same question, so it joins the same table rather than getting its own.
alter table obligation_overrides
  add column site_task_id uuid references site_tasks (id) on delete set null;

-- Every live prohibition that reaches a task, and whether somebody has
-- already said out loud that the work proceeds anyway.
create view site_task_conflicts with (security_invoker = true) as
select
  t.id as site_task_id,
  t.title_en as task_title_en,
  t.title_tr as task_title_tr,
  t.state as task_state,
  t.kind as task_kind,
  wp.construction_block_id,
  o.id as obligation_id,
  o.title_en as obligation_title_en,
  o.title_tr as obligation_title_tr,
  o.source as obligation_source,
  o.source_legal_order_id,
  exists (
    select 1
    from obligation_overrides ov
    where ov.obligation_id = o.id
      and (ov.site_task_id = t.id or ov.construction_block_id = wp.construction_block_id)
  ) as acknowledged,
  greatest(t.confidentiality, o.confidentiality) as confidentiality
from site_tasks t
join work_packages wp on wp.id = t.work_package_id
join obligation_blocks ob on ob.construction_block_id = wp.construction_block_id
join obligations o on o.id = ob.obligation_id
where o.prohibits
  and o.state in ('open', 'in_progress', 'at_risk')
  and t.state <> 'completed';

comment on view site_task_conflicts is
  'Open work that a live prohibition reaches, and whether it has been '
  'acknowledged (M7-06, M2-06). Recorded, not blocked: the project did once '
  'resolve unanimously to continue building under an order, and a portal that '
  'refused to record that would only have removed the trace.';

-- ---------------------------------------------------------------------------
-- Bills of quantities (M7-07)
-- ---------------------------------------------------------------------------

-- The old screen kept these in component state, so they were gone on reload.
-- A bill of quantities is a negotiating position and later a contractual
-- document; it is versioned, and an issued version does not change.
create table boq_versions (
  id uuid primary key default gen_random_uuid(),
  construction_block_id uuid not null references construction_blocks (id) on delete cascade,
  version_no int not null,
  state boq_state not null default 'draft',
  prepared_by uuid references profiles (id) default auth.uid(),
  prepared_on date not null default current_date,
  currency currency_code not null default 'KES',
  note text,
  constraint boq_versions_number_unique unique (construction_block_id, version_no)
);
select app.add_common_columns('boq_versions');

create table boq_items (
  id uuid primary key default gen_random_uuid(),
  boq_version_id uuid not null references boq_versions (id) on delete cascade,
  work_package_id uuid references work_packages (id) on delete set null,
  item_code text,
  description_en text not null,
  description_tr text,
  unit text not null,
  quantity numeric(14, 3) not null check (quantity >= 0),
  unit_rate numeric(14, 2) not null check (unit_rate >= 0),
  -- Generated, so the line total cannot disagree with its own parts. This is
  -- the same reasoning as `obligations.verified`: a fact that follows from
  -- other facts is not something anybody gets to assert separately.
  amount numeric(16, 2) generated always as (round(quantity * unit_rate, 2)) stored
);

create index boq_items_version_idx on boq_items (boq_version_id);

alter table boq_items enable row level security;
alter table boq_items force row level security;

create or replace function app.assign_boq_version_number()
returns trigger
language plpgsql
as $$
begin
  if new.version_no is null then
    select coalesce(max(version_no), 0) + 1 into new.version_no
    from boq_versions
    where construction_block_id = new.construction_block_id;
  end if;
  return new;
end;
$$;

create trigger boq_versions_numbered before insert on boq_versions
  for each row execute function app.assign_boq_version_number();

alter table boq_versions alter column version_no drop not null;

create or replace function app.refuse_issued_boq_edit()
returns trigger
language plpgsql
as $$
declare
  v_state boq_state;
  v_version uuid;
begin
  v_version := coalesce(new.boq_version_id, old.boq_version_id);
  select state into v_state from boq_versions where id = v_version;

  if v_state <> 'draft' then
    raise exception 'this bill of quantities is issued; raise a new version (attempted %)', tg_op
      using errcode = 'insufficient_privilege';
  end if;

  return case tg_op when 'DELETE' then old else new end;
end;
$$;

create trigger boq_items_frozen_once_issued
  before insert or update or delete on boq_items
  for each row execute function app.refuse_issued_boq_edit();

create or replace function app.refuse_boq_unissuing()
returns trigger
language plpgsql
as $$
begin
  if old.state <> 'draft' and new.state = 'draft' then
    raise exception 'an issued bill of quantities cannot go back to draft'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger boq_versions_one_way before update on boq_versions
  for each row execute function app.refuse_boq_unissuing();

create view boq_totals with (security_invoker = true) as
select
  v.id as boq_version_id,
  v.construction_block_id,
  v.version_no,
  v.state,
  v.currency,
  v.confidentiality,
  count(i.id) as line_count,
  coalesce(sum(i.amount), 0)::numeric(16, 2) as total
from boq_versions v
left join boq_items i on i.boq_version_id = v.id
group by v.id;

-- ---------------------------------------------------------------------------
-- Interim valuations (M7-08)
-- ---------------------------------------------------------------------------

-- Hakediş. What a contractor is owed for a period, certified by the quantity
-- surveyor and then approved by the director. Two signatures, and a
-- constraint that they belong to two people: an approval chain where one
-- person can be both links is not a chain.
create table valuations (
  id uuid primary key default gen_random_uuid(),
  construction_block_id uuid not null references construction_blocks (id) on delete cascade,
  contractor_id uuid references contractors (id) on delete set null,
  boq_version_id uuid references boq_versions (id) on delete set null,
  period_start date not null,
  period_end date not null,
  amount numeric(16, 2) not null check (amount >= 0),
  currency currency_code not null default 'KES',
  state valuation_state not null default 'draft',
  summary text,

  qs_certified_by uuid references profiles (id),
  qs_certified_at timestamptz,
  director_approved_by uuid references profiles (id),
  director_approved_at timestamptz,

  -- Filled by M8 when the payment is raised. Nullable here on purpose: this
  -- table does not claim anything about money leaving the account.
  paid_at timestamptz,

  constraint valuations_period_ordered check (period_end >= period_start),
  constraint valuations_certification_is_whole check (
    (qs_certified_by is null) = (qs_certified_at is null)
  ),
  constraint valuations_approval_is_whole check (
    (director_approved_by is null) = (director_approved_at is null)
  ),
  constraint valuations_two_people check (
    qs_certified_by is null
    or director_approved_by is null
    or qs_certified_by <> director_approved_by
  )
);
select app.add_common_columns('valuations');

create index valuations_block_idx on valuations (construction_block_id, period_end desc);

-- The order of the signatures is part of what they mean. A director approving
-- a valuation the surveyor has not certified is approving a number nobody
-- measured.
create or replace function app.require_certification_before_approval()
returns trigger
language plpgsql
as $$
begin
  if new.director_approved_at is not null and new.qs_certified_at is null then
    raise exception
      'this valuation has not been certified by a quantity surveyor yet'
      using errcode = 'check_violation';
  end if;

  if new.state = 'paid' and new.director_approved_at is null then
    raise exception 'a valuation cannot be paid before it is approved'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' and old.state = 'paid' and new.state <> 'paid' then
    raise exception 'a valuation that has been paid cannot be taken back'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger valuations_signed_in_order before insert or update on valuations
  for each row execute function app.require_certification_before_approval();

-- ---------------------------------------------------------------------------
-- Who may do what
-- ---------------------------------------------------------------------------

-- Everything below narrows. None of it lifts: being assigned to a block does
-- not raise a contractor's clearance, which is why can_read runs first in
-- every one of these.

create or replace function app.can_see_block_child(p_conf confidentiality, p_block uuid)
returns boolean
language sql
stable
as $$
  select app.can_read(p_conf)
    and exists (
      select 1 from construction_blocks b
      where b.id = p_block and app.can_see_block(b.confidentiality, b.id)
    );
$$;

-- Who keeps the site record: the people who run the works, plus the firm and
-- the surveyor on that particular block.
create or replace function app.can_keep_site_record(p_block uuid)
returns boolean
language sql
stable
as $$
  select app.acts_as('admin', 'project_director', 'field_team')
    or (app.acts_as('contractor', 'quantity_surveyor') and app.is_assigned_block(p_block));
$$;

-- M7-10, the read half. A contractor reports progress and reads their own
-- blocks; the commercial papers are not theirs to see. The surveyor's whole
-- job is those papers, so they are.
create or replace function app.can_see_commercials(p_block uuid)
returns boolean
language sql
stable
as $$
  select app.acts_as('admin', 'project_director', 'trustee', 'board_director', 'audit_committee')
    or (app.acts_as('quantity_surveyor', 'external_auditor') and app.is_assigned_block(p_block));
$$;

create or replace function app.can_price_work(p_block uuid)
returns boolean
language sql
stable
as $$
  select app.acts_as('admin', 'project_director')
    or (app.acts_as('quantity_surveyor') and app.is_assigned_block(p_block));
$$;

-- Phases and contractors are project-level facts, not block-level ones.
alter table project_phases enable row level security;
alter table project_phases force row level security;

create policy project_phases_read on project_phases
  for select using (app.can_read(confidentiality));
create policy project_phases_insert on project_phases
  for insert with check (app.acts_as('admin', 'project_director'));
create policy project_phases_update on project_phases
  for update using (app.can_read(confidentiality) and app.acts_as('admin', 'project_director'))
  with check (app.acts_as('admin', 'project_director'));
create policy project_phases_delete on project_phases
  for delete using (app.can_read(confidentiality) and app.acts_as('admin', 'project_director'));

alter table contractors enable row level security;
alter table contractors force row level security;

create policy contractors_read on contractors
  for select using (app.can_read(confidentiality));
create policy contractors_insert on contractors
  for insert with check (app.acts_as('admin', 'project_director'));
create policy contractors_update on contractors
  for update using (app.can_read(confidentiality) and app.acts_as('admin', 'project_director'))
  with check (app.acts_as('admin', 'project_director'));
create policy contractors_delete on contractors
  for delete using (app.can_read(confidentiality) and app.acts_as('admin', 'project_director'));

alter table work_packages enable row level security;
alter table work_packages force row level security;

create policy work_packages_read on work_packages
  for select using (app.can_see_block_child(confidentiality, construction_block_id));
create policy work_packages_insert on work_packages
  for insert with check (
    app.can_read(confidentiality) and app.acts_as('admin', 'project_director', 'field_team')
  );
create policy work_packages_update on work_packages
  for update
  using (
    app.can_see_block_child(confidentiality, construction_block_id)
    and app.acts_as('admin', 'project_director', 'field_team')
  )
  with check (app.acts_as('admin', 'project_director', 'field_team'));
create policy work_packages_delete on work_packages
  for delete using (
    app.can_see_block_child(confidentiality, construction_block_id)
    and app.acts_as('admin', 'project_director', 'field_team')
  );

alter table site_tasks enable row level security;
alter table site_tasks force row level security;

create policy site_tasks_read on site_tasks
  for select using (app.can_see_block_child(confidentiality, app.block_of_task(id)));
create policy site_tasks_insert on site_tasks
  for insert with check (
    app.can_read(confidentiality)
    and app.acts_as('admin', 'project_director', 'field_team')
    and app.can_see_block_child(confidentiality, app.block_of_package(work_package_id))
  );
create policy site_tasks_update on site_tasks
  for update
  using (
    app.can_see_block_child(confidentiality, app.block_of_task(id))
    and app.acts_as('admin', 'project_director', 'field_team')
  )
  with check (app.acts_as('admin', 'project_director', 'field_team'));
create policy site_tasks_delete on site_tasks
  for delete using (
    app.can_see_block_child(confidentiality, app.block_of_task(id))
    and app.acts_as('admin', 'project_director', 'field_team')
  );

-- Progress: read where the block is readable, write where the work is yours.
-- There is no update or delete policy at all, and the privileges below take
-- them away too, so the append-only triggers are reachable.
create policy task_progress_read on task_progress
  for select using (app.can_see_block_child('internal', app.block_of_task(site_task_id)));
create policy task_progress_insert on task_progress
  for insert with check (
    app.can_see_block_child('internal', app.block_of_task(site_task_id))
    and app.can_keep_site_record(app.block_of_task(site_task_id))
    and reported_by = auth.uid()
  );

alter table site_inspections enable row level security;
alter table site_inspections force row level security;

create policy site_inspections_read on site_inspections
  for select using (app.can_see_block_child(confidentiality, construction_block_id));
create policy site_inspections_insert on site_inspections
  for insert with check (
    app.can_read(confidentiality)
    and app.acts_as('admin', 'project_director', 'field_team', 'quantity_surveyor', 'external_auditor')
  );
create policy site_inspections_update on site_inspections
  for update
  using (
    app.can_see_block_child(confidentiality, construction_block_id)
    and app.acts_as('admin', 'project_director', 'field_team', 'quantity_surveyor', 'external_auditor')
  )
  with check (
    app.acts_as('admin', 'project_director', 'field_team', 'quantity_surveyor', 'external_auditor')
  );
-- No delete policy. An inspection that found something is not deletable by
-- the people it found something about.

create policy inspection_findings_read on inspection_findings
  for select using (
    exists (
      select 1 from site_inspections i
      where i.id = site_inspection_id
        and app.can_see_block_child(i.confidentiality, i.construction_block_id)
    )
  );
create policy inspection_findings_write on inspection_findings
  for insert with check (
    app.acts_as('admin', 'project_director', 'field_team', 'quantity_surveyor', 'external_auditor')
  );
create policy inspection_findings_update on inspection_findings
  for update
  using (
    exists (
      select 1 from site_inspections i
      where i.id = site_inspection_id
        and app.can_see_block_child(i.confidentiality, i.construction_block_id)
    )
    and app.acts_as('admin', 'project_director', 'field_team', 'quantity_surveyor')
  )
  with check (app.acts_as('admin', 'project_director', 'field_team', 'quantity_surveyor'));

create policy obligation_blocks_read on obligation_blocks
  for select using (
    exists (
      select 1 from construction_blocks b
      where b.id = construction_block_id and app.can_see_block(b.confidentiality, b.id)
    )
  );
create policy obligation_blocks_insert on obligation_blocks
  for insert with check (app.acts_as('admin', 'project_director', 'legal_counsel'));
create policy obligation_blocks_delete on obligation_blocks
  for delete using (app.acts_as('admin', 'project_director', 'legal_counsel'));

alter table boq_versions enable row level security;
alter table boq_versions force row level security;

create policy boq_versions_read on boq_versions
  for select using (
    app.can_see_block_child(confidentiality, construction_block_id)
    and app.can_see_commercials(construction_block_id)
  );
create policy boq_versions_insert on boq_versions
  for insert with check (
    app.can_read(confidentiality) and app.can_price_work(construction_block_id)
  );
create policy boq_versions_update on boq_versions
  for update
  using (
    app.can_see_block_child(confidentiality, construction_block_id)
    and app.can_price_work(construction_block_id)
  )
  with check (app.can_price_work(construction_block_id));

create policy boq_items_read on boq_items
  for select using (
    exists (
      select 1 from boq_versions v
      where v.id = boq_version_id
        and app.can_see_block_child(v.confidentiality, v.construction_block_id)
        and app.can_see_commercials(v.construction_block_id)
    )
  );
create policy boq_items_write on boq_items
  for insert with check (
    exists (
      select 1 from boq_versions v
      where v.id = boq_version_id and app.can_price_work(v.construction_block_id)
    )
  );
create policy boq_items_update on boq_items
  for update
  using (
    exists (
      select 1 from boq_versions v
      where v.id = boq_version_id
        and app.can_see_block_child(v.confidentiality, v.construction_block_id)
        and app.can_price_work(v.construction_block_id)
    )
  )
  with check (
    exists (
      select 1 from boq_versions v
      where v.id = boq_version_id and app.can_price_work(v.construction_block_id)
    )
  );
create policy boq_items_delete on boq_items
  for delete using (
    exists (
      select 1 from boq_versions v
      where v.id = boq_version_id
        and app.can_see_block_child(v.confidentiality, v.construction_block_id)
        and app.can_price_work(v.construction_block_id)
    )
  );

alter table valuations enable row level security;
alter table valuations force row level security;

create policy valuations_read on valuations
  for select using (
    app.can_see_block_child(confidentiality, construction_block_id)
    and app.can_see_commercials(construction_block_id)
  );
create policy valuations_insert on valuations
  for insert with check (
    app.can_read(confidentiality) and app.can_price_work(construction_block_id)
  );
-- Certifying and approving are both updates, and both are gated on being one
-- of the people whose signature means something. The trigger above decides
-- the order; this decides who.
create policy valuations_update on valuations
  for update
  using (
    app.can_see_block_child(confidentiality, construction_block_id)
    and (
      app.can_price_work(construction_block_id)
      or app.acts_as('admin', 'project_director')
    )
  )
  with check (
    app.can_price_work(construction_block_id)
    or app.acts_as('admin', 'project_director')
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on
  project_phases, contractors, work_packages, site_tasks,
  site_inspections, inspection_findings, boq_versions, boq_items, valuations
  to authenticated;

grant select, insert, delete on obligation_blocks to authenticated;

-- 0003's default privileges hand insert, update and delete to every new
-- table. That is right for the tables above and wrong for this one: it would
-- leave the append-only triggers unreachable, so an attempt to rewrite a
-- progress report would match no policy and fail silently with zero rows
-- instead of saying no.
revoke all on task_progress from authenticated;
grant select, insert on task_progress to authenticated;

grant select on block_progress, site_task_conflicts, boq_totals to authenticated;
grant execute on all functions in schema app to authenticated;

drop function app.add_common_columns(regclass);
