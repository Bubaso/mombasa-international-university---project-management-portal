-- Governance, statutory compliance and academic readiness (M10).
--
-- The requirement's reasoning is blunt: the trust has three organs, and
-- their not working properly is written into the evaluation report as a
-- reason this project failed. Meanwhile the portal's governance screen held
-- its resolutions in a React useState — three of them, typed into the
-- component, one allocating "34.3M KShs" — and its compliance section was
-- prose. The trustee register was the one real thing on it, and it stored a
-- national identity number in a text column.
--
-- And the thing the requirement is most pointed about: "Akademik hazırlık
-- bugün portalda hiç yok. Oysa projenin amacı bir üniversite; inşaat sadece
-- aracı." A portal for a university project with no idea what degrees it
-- intends to offer is tracking the scaffolding and not the building.
--
-- Four spines run through this migration, and each is the same idea the rest
-- of the portal already runs on:
--
--   1. A quorum rule is DATA, so a sitting can be checked against it instead
--      of somebody remembering what it was (M10-02). governance_sitting_quorum
--      answers "was this organ entitled to decide" from the attendance.
--
--   2. A decision that nobody has turned into an action is NOT implemented,
--      and it is not outstanding either — it is unknown, and
--      decision_implementation says so in a third state rather than guessing
--      (M10-04). This is the same refusal to invent as block_progress
--      returning null where nothing is reported.
--
--   3. A statutory duty is an OBLIGATION (M10-05). The requirement says so —
--      "Her biri M2'de yükümlülük olarak yaşar" — and it is the right shape:
--      M2 already carries evidence, breach states and a calendar. What is new
--      here is the recurrence rule, because a Cap 164 annual return is a rule
--      that generates obligations, not one obligation.
--
--   4. Nothing is MET without evidence (M10-06, M10-09, M10-10). Same trigger
--      shape as 0010's require_evidence_before_fulfilled and 0013's demand
--      that progress point at a document. A checklist whose boxes can be
--      ticked without a document is a list of hopes.
--
-- Requirements: M10-01 … M10-12.

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

-- Who keeps the governance registers. The organs' own membership, the
-- resolutions and the compliance calendar are the board's record of itself,
-- so the board and the administrator keep them — not the site team, and not
-- the project director acting alone.
create or replace function app.can_keep_governance()
returns boolean
language sql
stable
as $$
  select coalesce((app.authority()).roles && array[
    'admin', 'trustee', 'board_director'
  ]::app_role[], false);
$$;

-- Accreditation, the compliance calendar and the academic registers are run
-- day to day rather than deliberated, so the director is in.
create or replace function app.can_keep_readiness()
returns boolean
language sql
stable
as $$
  select coalesce((app.authority()).roles && array[
    'admin', 'project_director', 'trustee', 'board_director'
  ]::app_role[], false);
$$;

-- ---------------------------------------------------------------------------
-- The three organs (M10-02)
-- ---------------------------------------------------------------------------

create type governance_organ_kind as enum (
  'board_of_trustees',  -- Mütevelli Heyeti
  'management_board',   -- Yönetim Kurulu
  'audit_committee'     -- Denetim Komitesi
);

create type meeting_cadence as enum (
  'monthly',
  'quarterly',
  'biannual',
  'annual',
  'as_required'
);

create table governance_organs (
  id uuid primary key default gen_random_uuid(),
  kind governance_organ_kind not null unique,
  name_en text not null,
  name_tr text not null,
  remit_en text,
  remit_tr text,
  -- Null means nobody has recorded it, which is not the same as 'as_required'.
  -- The distinction matters: "we meet when we have to" is a decision somebody
  -- took, and an empty field is a question nobody has answered.
  cadence meeting_cadence,
  -- The quorum, either as a floor or as a share of the seats, or both. A rule
  -- held as data is one a sitting can be checked against; a rule held in
  -- somebody's memory is one that gets remembered conveniently.
  quorum_members int check (quorum_members is null or quorum_members > 0),
  quorum_fraction numeric(3, 2)
    check (quorum_fraction is null or (quorum_fraction > 0 and quorum_fraction <= 1)),
  -- M10-13's hook: the clause of the trust deed this organ comes from.
  charter_clause text,
  charter_document_id uuid references document_vault (id)
);
select app.add_common_columns('governance_organs');

comment on table governance_organs is
  'The trust''s three organs (M10-02). Quorum and cadence are data so a '
  'sitting can be tested against them; both are nullable because an unknown '
  'rule must not be dressed up as a lax one.';

-- The three are named in the requirement document itself, so seeding their
-- names asserts nothing this project has not already written down. The remit,
-- the cadence and the quorum are NOT seeded: those live in the trust deed,
-- and inventing them here would put three plausible rules into the portal
-- that nobody agreed to.
insert into governance_organs (kind, name_en, name_tr, confidentiality) values
  ('board_of_trustees', 'Board of Trustees', 'Mütevelli Heyeti', 'internal'),
  ('management_board', 'Management Board', 'Yönetim Kurulu', 'internal'),
  ('audit_committee', 'Audit Committee', 'Denetim Komitesi', 'internal');

-- ---------------------------------------------------------------------------
-- The trustee register (M10-01)
-- ---------------------------------------------------------------------------

-- The register this replaces held name, national_id, appointed_by, origin and
-- role_in_trust, and the national identity number is the reason it had to go
-- rather than grow: it was a plain text column, readable by every internal
-- role, searched by the old search box, and of no use to anybody — what a
-- registrar asks for is the document. So the document is what this points at,
-- in the vault, where every read of it is logged (M9-07).
create table trustees (
  id uuid primary key default gen_random_uuid(),
  -- A trustee is a person, and the register of people is M4's. Pointing at it
  -- rather than copying a name is what stops one person existing twice under
  -- two spellings — which, in a register that decides who may vote, matters.
  stakeholder_id uuid references stakeholders (id),
  -- Kept anyway, because a trustee may be minuted before anyone opens a
  -- stakeholder record for them, and a register with a gap in it is worse
  -- than one with a name not yet joined up.
  full_name text not null check (btrim(full_name) <> ''),
  -- "atayan kurum". Which foundation or institution put them there, which on
  -- this project is the first thing anybody asks about a trustee.
  appointing_body text not null check (btrim(appointing_body) <> ''),
  appointed_on date,
  term_ends_on date,
  seat_en text,
  seat_tr text,
  email text,
  phone text,
  identity_document_id uuid references document_vault (id),
  active boolean not null default true,
  stood_down_on date,
  note text,

  constraint trustees_term_runs_forwards
    check (term_ends_on is null or appointed_on is null or term_ends_on >= appointed_on),
  -- An inactive trustee has a date. Without this, a seat can be emptied
  -- without a record of when — and a quorum computed over the register would
  -- quietly change with it.
  constraint trustees_standing_down_is_dated
    check (active or stood_down_on is not null)
);
select app.add_common_columns('trustees');

create index trustees_active_idx on trustees (active, appointing_body);

comment on table trustees is
  'The trustee register (M10-01). The identity document is a reference into '
  'the vault, not a number in a column: the number is a liability with no '
  'use, and the vault logs who opens the document.';

-- The legacy table goes. It is empty on every project that matters, its shape
-- is wrong, and leaving it would leave two answers to "who are the trustees".
drop table if exists trustee_members;

-- Seats on an organ. A person may sit on more than one, and a seat has dates:
-- the quorum for a sitting in March is computed from who held a seat in March.
create table organ_memberships (
  id uuid primary key default gen_random_uuid(),
  organ_id uuid not null references governance_organs (id) on delete cascade,
  trustee_id uuid references trustees (id) on delete cascade,
  profile_id uuid references profiles (id) on delete cascade,
  stakeholder_id uuid references stakeholders (id) on delete cascade,
  seat text,
  -- A secretary who attends but does not vote still counts as present and
  -- does not count towards the quorum. Conflating the two is how a sitting
  -- gets minuted as competent when it was not.
  voting boolean not null default true,
  started_on date not null default current_date,
  ended_on date,

  constraint organ_memberships_one_person check (
    (trustee_id is not null)::int
    + (profile_id is not null)::int
    + (stakeholder_id is not null)::int = 1
  ),
  constraint organ_memberships_dates
    check (ended_on is null or ended_on >= started_on)
);
select app.add_common_columns('organ_memberships');

create index organ_memberships_organ_idx on organ_memberships (organ_id, started_on);

-- ---------------------------------------------------------------------------
-- Which sitting belonged to which organ, and whether it was competent
-- ---------------------------------------------------------------------------

alter table meetings
  add column governance_organ_id uuid references governance_organs (id);

comment on column meetings.governance_organ_id is
  'Set when the meeting is a sitting of one of the three organs (M10-02). '
  'Null for everything else, which is most meetings.';

-- Was the organ entitled to decide?
--
-- Three numbers and a verdict: seats held on the day, voting members who
-- actually attended, and what the organ''s own rule required. `quorum_met` is
-- deliberately three-valued — null where the organ has no recorded quorum
-- rule, because "we did not write the rule down" is not the same answer as
-- "the sitting was short".
create view governance_sitting_quorum with (security_invoker = true) as
select
  m.id as meeting_id,
  m.title,
  m.held_at,
  m.minutes_status,
  o.id as organ_id,
  o.kind as organ_kind,
  o.name_en as organ_name_en,
  o.name_tr as organ_name_tr,
  seats.held as seats_held,
  present.voting_present,
  -- The stricter of the two rules, where both are recorded.
  greatest(
    coalesce(o.quorum_members, 0),
    coalesce(ceil(o.quorum_fraction * seats.held)::int, 0)
  ) as quorum_required,
  case
    when o.quorum_members is null and o.quorum_fraction is null then null
    else present.voting_present >= greatest(
      coalesce(o.quorum_members, 0),
      coalesce(ceil(o.quorum_fraction * seats.held)::int, 0)
    )
  end as quorum_met,
  m.confidentiality
from meetings m
join governance_organs o on o.id = m.governance_organ_id
cross join lateral (
  select count(*)::int as held
  from organ_memberships k
  where k.organ_id = o.id
    and k.voting
    and k.started_on <= m.held_at::date
    and (k.ended_on is null or k.ended_on >= m.held_at::date)
) seats
cross join lateral (
  select count(*)::int as voting_present
  from meeting_attendees a
  join organ_memberships k on k.organ_id = o.id
    and k.voting
    and k.started_on <= m.held_at::date
    and (k.ended_on is null or k.ended_on >= m.held_at::date)
    and (
      (a.profile_id is not null and a.profile_id = k.profile_id)
      or (a.stakeholder_id is not null and a.stakeholder_id = k.stakeholder_id)
      or (a.stakeholder_id is not null and k.trustee_id is not null and exists (
            select 1 from trustees t
            where t.id = k.trustee_id and t.stakeholder_id = a.stakeholder_id
         ))
    )
  where a.meeting_id = m.id
    and a.attended
) present;

comment on view governance_sitting_quorum is
  'Whether each organ sitting was competent to decide (M10-02). quorum_met is '
  'null where the organ has no recorded rule — not false, because an '
  'unrecorded rule is a different problem from a short sitting.';

-- ---------------------------------------------------------------------------
-- The formal decision register (M10-03)
-- ---------------------------------------------------------------------------

-- M3-04 already holds decisions. What M10-03 adds is the formality for the
-- ones that belong to an organ: which organ, who signed the minute, and the
-- archived document. The register is therefore a view over the same table
-- rather than a second copy of it — two decision registers is how a decision
-- comes to exist in one and not the other.
alter table decisions
  add column governance_organ_id uuid references governance_organs (id),
  add column signed_by uuid references profiles (id),
  add column signed_at timestamptz,
  add column minute_document_id uuid references document_vault (id);

comment on column decisions.signed_at is
  'When the resolution was signed into the record (M10-03). Once set, the '
  'text of the resolution is closed — see app.refuse_signed_decision_edit.';

-- A signed resolution is closed. The same rule 0007 applies to final minutes,
-- and for the same reason: a record that can be revised after signature is
-- not a record of what was decided, it is a record of what is currently
-- convenient. Everything administrative around it stays editable.
create or replace function app.refuse_signed_decision_edit()
returns trigger
language plpgsql
as $$
begin
  if old.signed_at is null then
    return new;
  end if;

  if new.text_en is distinct from old.text_en
     or new.text_tr is distinct from old.text_tr
     or new.rationale_en is distinct from old.rationale_en
     or new.rationale_tr is distinct from old.rationale_tr
     or new.reference_no is distinct from old.reference_no
     or new.organ is distinct from old.organ
     or new.governance_organ_id is distinct from old.governance_organ_id
     or new.vote is distinct from old.vote
     or new.decided_on is distinct from old.decided_on
     or new.signed_at is distinct from old.signed_at
     or new.signed_by is distinct from old.signed_by then
    raise exception
      'resolution % was signed on %; it can be rescinded or superseded, not rewritten',
      coalesce(old.reference_no, old.id::text), old.signed_at
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger decisions_signed_is_closed
  before update on decisions
  for each row execute function app.refuse_signed_decision_edit();

-- Signing is a deliberate act with a name on it, so the signer is recorded as
-- whoever did it rather than taken from the form.
create or replace function public.sign_resolution(
  p_decision uuid,
  p_minute_document uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_organ uuid;
begin
  if not app.can_keep_governance() then
    raise exception 'only the board or an administrator signs a resolution'
      using errcode = 'insufficient_privilege';
  end if;

  select governance_organ_id into v_organ
  from decisions d
  where d.id = p_decision
    -- Re-checked under the caller's own policies, because a definer function
    -- that skips this is a way to sign something you cannot read.
    and app.can_see_via_meeting(d.confidentiality, d.meeting_id);

  if not found then
    raise exception 'no such resolution, or it is not yours to see'
      using errcode = 'no_data_found';
  end if;

  if v_organ is null then
    raise exception 'only a resolution of one of the organs is signed into the register'
      using errcode = 'check_violation';
  end if;

  update decisions
  set signed_by = auth.uid(),
      signed_at = now(),
      minute_document_id = coalesce(p_minute_document, minute_document_id)
  where id = p_decision and signed_at is null;

  if not found then
    raise exception 'that resolution is already signed'
      using errcode = 'unique_violation';
  end if;
end;
$$;

comment on function public.sign_resolution(uuid, uuid) is
  'Signs a resolution into the formal register (M10-03). Definer so the '
  'signature cannot be forged through the table, and it re-checks visibility '
  'so it is not a way to sign what you may not read.';

-- ---------------------------------------------------------------------------
-- Were the resolutions carried out? (M10-04)
-- ---------------------------------------------------------------------------

-- The requirement asks for "alınmış ama uygulanmamış kararlar", and the
-- interesting part is the state that is neither. A resolution with no action
-- recorded against it is not implemented and not outstanding: nobody has said
-- what carrying it out would consist of. Calling that "outstanding" flatters
-- it, and calling it "implemented" is worse.
create type implementation_state as enum (
  'no_actions_recorded',
  -- Every action it had was cancelled. Distinct from never having had one:
  -- somebody decided not to carry this resolution out, which is a decision
  -- taken without being minuted as one.
  'abandoned',
  'outstanding',
  'implemented',
  'rescinded'
);

create view decision_implementation with (security_invoker = true) as
select
  d.id as decision_id,
  d.reference_no,
  d.text_en,
  d.text_tr,
  d.decided_on,
  d.status,
  d.signed_at,
  o.kind as organ_kind,
  o.name_en as organ_name_en,
  o.name_tr as organ_name_tr,
  tally.actions,
  tally.done,
  tally.overdue,
  tally.next_due,
  tally.cancelled,
  case
    when d.status in ('rescinded', 'suspended') then 'rescinded'::implementation_state
    when tally.actions = 0 then 'no_actions_recorded'::implementation_state
    -- Everything it had was cancelled, so nothing stands behind it now.
    when tally.actions - tally.cancelled = 0 then 'abandoned'::implementation_state
    when tally.done = tally.actions - tally.cancelled then 'implemented'::implementation_state
    else 'outstanding'::implementation_state
  end as implementation,
  -- How long it has been sitting, which is the column that turns a register
  -- into a question somebody answers for.
  case
    when d.decided_on is null then null
    else (current_date - d.decided_on)
  end as days_since,
  d.confidentiality
from decisions d
left join governance_organs o on o.id = d.governance_organ_id
cross join lateral (
  select
    count(*)::int as actions,
    count(*) filter (where a.status = 'done')::int as done,
    count(*) filter (where a.status = 'cancelled')::int as cancelled,
    count(*) filter (
      where a.status not in ('done', 'cancelled')
        and a.due_date is not null
        and a.due_date < current_date
    )::int as overdue,
    min(a.due_date) filter (where a.status not in ('done', 'cancelled')) as next_due
  from action_items a
  where a.decision_id = d.id
) tally;

comment on view decision_implementation is
  'Every resolution against the state of its actions (M10-04). The third '
  'state is the point: a resolution nobody has turned into an action is '
  'neither done nor outstanding, and this says so rather than guessing.';

-- ---------------------------------------------------------------------------
-- The statutory compliance calendar (M10-05)
-- ---------------------------------------------------------------------------

create type compliance_regime as enum (
  'cap_164',   -- Trustees (Perpetual Succession) Act, registration and returns
  'kra',       -- tax, including the exemption this project depends on
  'cue',       -- Commission for University Education
  'county',    -- the county government, Mombasa
  'other'
);

create type recurrence as enum ('once', 'annual', 'biannual', 'quarterly', 'monthly');

-- A day of the month that exists in the month asked for. A statutory deadline
-- on the 31st is a real thing, and make_date would simply raise in February.
create or replace function app.clamped_date(p_year int, p_month int, p_day int)
returns date
language sql
immutable
as $$
  select make_date(p_year, p_month, 1)
    + (least(
         p_day,
         extract(day from (make_date(p_year, p_month, 1) + interval '1 month - 1 day'))::int
       ) - 1);
$$;

-- When this duty next falls due, on or after a given day.
--
-- Takes the "from" date as a parameter rather than reading current_date, so
-- it stays immutable and a view can ask it about any day — which is what
-- makes a calendar scrollable rather than a snapshot of today.
create or replace function app.next_compliance_due(
  p_recurrence recurrence,
  p_month int,
  p_day int,
  p_first date,
  p_from date default current_date
)
returns date
language plpgsql
immutable
as $$
declare
  v_year int := extract(year from p_from)::int;
  v_candidate date;
  v_month int;
  v_step int;
begin
  -- A one-off is whatever date was recorded for it, past or future. Hiding a
  -- missed one-off deadline by rolling it forward is the opposite of useful.
  if p_recurrence = 'once' then
    return p_first;
  end if;

  -- Without a month and day there is no rule to apply, only the first date
  -- somebody wrote down.
  if p_day is null then
    return p_first;
  end if;

  if p_recurrence = 'monthly' then
    v_candidate := app.clamped_date(v_year, extract(month from p_from)::int, p_day);
    if v_candidate < p_from then
      v_candidate := app.clamped_date(
        extract(year from (p_from + interval '1 month'))::int,
        extract(month from (p_from + interval '1 month'))::int,
        p_day);
    end if;
    return v_candidate;
  end if;

  if p_month is null then
    return p_first;
  end if;

  v_step := case p_recurrence
    when 'annual' then 12
    when 'biannual' then 6
    when 'quarterly' then 3
  end;

  -- Walk the anchor month forward in steps until it lands on or after p_from.
  -- At most a year and a step of candidates, so the loop is bounded.
  for i in 0..(12 / v_step) loop
    v_month := ((p_month - 1 + i * v_step) % 12) + 1;
    v_candidate := app.clamped_date(
      v_year + ((p_month - 1 + i * v_step) / 12),
      v_month,
      p_day);
    if v_candidate >= p_from then
      return v_candidate;
    end if;
  end loop;

  -- Everything this year has passed, so it is the first of next year's.
  return app.clamped_date(v_year + 1, p_month, p_day);
end;
$$;

create table compliance_requirements (
  id uuid primary key default gen_random_uuid(),
  regime compliance_regime not null,
  -- The section, form number or standard this comes from. Without it the
  -- entry is somebody's recollection of a duty.
  reference text,
  title_en text not null check (btrim(title_en) <> ''),
  title_tr text,
  detail_en text,
  detail_tr text,
  recurrence recurrence not null default 'once',
  due_month int check (due_month between 1 and 12),
  due_day int check (due_day between 1 and 31),
  first_due_on date,
  responsible_profile_id uuid references profiles (id),
  authority_document_id uuid references document_vault (id),
  active boolean not null default true,
  retired_on date,
  note text,

  -- A recurring duty needs a day to recur on; a one-off needs a date.
  constraint compliance_requirements_has_a_date check (
    (recurrence = 'once' and first_due_on is not null)
    or (recurrence = 'monthly' and due_day is not null)
    or (recurrence in ('annual', 'biannual', 'quarterly')
        and due_month is not null and due_day is not null)
  ),
  constraint compliance_requirements_retirement_is_dated
    check (active or retired_on is not null)
);
select app.add_common_columns('compliance_requirements');

comment on table compliance_requirements is
  'The statutory duties this trust is under, as rules (M10-05). A Cap 164 '
  'annual return is not one obligation; it is a rule that produces one every '
  'year, which is why the recurrence lives here and the instance lives in M2.';

-- The instance. The requirement is explicit that each compliance item lives
-- as an obligation, so this is the join rather than a second register.
create table compliance_instances (
  id uuid primary key default gen_random_uuid(),
  requirement_id uuid not null references compliance_requirements (id) on delete cascade,
  obligation_id uuid not null references obligations (id) on delete cascade,
  period_label text,
  due_on date not null,
  unique (requirement_id, due_on)
);
select app.add_common_columns('compliance_instances');

-- Raising the obligation for a period, in one act, so the two cannot drift
-- apart. Definer because it writes to obligations, and it checks the caller
-- the same way the obligations policies would.
create or replace function public.raise_compliance_obligation(
  p_requirement uuid,
  p_due date default null,
  p_period text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_req compliance_requirements;
  v_due date;
  v_obligation uuid;
  v_existing uuid;
begin
  if not app.can_keep_readiness() then
    raise exception 'that is not yours to raise'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_req from compliance_requirements where id = p_requirement and active;
  if not found then
    raise exception 'no such compliance requirement, or it has been retired'
      using errcode = 'no_data_found';
  end if;

  v_due := coalesce(
    p_due,
    app.next_compliance_due(v_req.recurrence, v_req.due_month, v_req.due_day, v_req.first_due_on));

  if v_due is null then
    raise exception 'that requirement has no date to work from'
      using errcode = 'check_violation';
  end if;

  select obligation_id into v_existing
  from compliance_instances
  where requirement_id = p_requirement and due_on = v_due;

  -- Idempotent on purpose: a calendar screen that raises the same return
  -- twice because somebody pressed the button twice is worse than useless.
  if v_existing is not null then
    return v_existing;
  end if;

  insert into obligations (
    title_en, title_tr, detail_en, detail_tr,
    source, source_document_id,
    obligor_name, due_on, state,
    obligor_profile_id, confidentiality
  )
  values (
    v_req.title_en,
    v_req.title_tr,
    concat_ws(E'\n',
      v_req.detail_en,
      nullif(v_req.reference, ''),
      'Raised from the compliance calendar (M10-05).'),
    v_req.detail_tr,
    'statute',
    v_req.authority_document_id,
    'African University Trust of Kenya',
    v_due,
    'open',
    v_req.responsible_profile_id,
    v_req.confidentiality
  )
  returning id into v_obligation;

  insert into compliance_instances (requirement_id, obligation_id, period_label, due_on, confidentiality)
  values (p_requirement, v_obligation, coalesce(p_period, to_char(v_due, 'YYYY')), v_due, v_req.confidentiality);

  return v_obligation;
end;
$$;

comment on function public.raise_compliance_obligation(uuid, date, text) is
  'Turns a compliance rule into this period''s obligation (M10-05). '
  'Idempotent per requirement and due date, so pressing the button twice '
  'does not file the return twice.';

-- The calendar itself: every live duty, when it next falls due, and whether
-- anybody has raised it yet. The gap between those last two columns is the
-- whole value of the screen.
create view compliance_calendar with (security_invoker = true) as
select
  r.id as requirement_id,
  r.regime,
  r.reference,
  r.title_en,
  r.title_tr,
  r.recurrence,
  app.next_compliance_due(r.recurrence, r.due_month, r.due_day, r.first_due_on) as next_due_on,
  i.obligation_id,
  i.period_label,
  ob.state as obligation_state,
  ob.verified,
  p.full_name as responsible_name,
  -- Null until somebody raises it, which is exactly what the screen has to
  -- show: a duty with no obligation behind it is a duty nobody has taken on.
  (i.obligation_id is null) as not_yet_raised,
  r.confidentiality
from compliance_requirements r
left join compliance_instances i
  on i.requirement_id = r.id
  and i.due_on = app.next_compliance_due(r.recurrence, r.due_month, r.due_day, r.first_due_on)
left join obligations ob on ob.id = i.obligation_id
left join profiles p on p.id = r.responsible_profile_id
where r.active;

comment on view compliance_calendar is
  'Each live statutory duty, its next due date, and the obligation standing '
  'behind it if one has been raised (M10-05). `not_yet_raised` is the column '
  'that matters.';

-- ---------------------------------------------------------------------------
-- The CUE accreditation checklist (M10-06)
-- ---------------------------------------------------------------------------

create type accreditation_state as enum (
  'not_started',
  'in_progress',
  'evidence_submitted',
  'met',
  'not_applicable'
);

create table accreditation_requirements (
  id uuid primary key default gen_random_uuid(),
  -- CUE is the one that matters here, but the shape is the same for any
  -- accrediting body, and naming it in a column beats hard-coding it.
  body text not null default 'CUE',
  code text,
  title_en text not null check (btrim(title_en) <> ''),
  title_tr text,
  detail_en text,
  detail_tr text,
  state accreditation_state not null default 'not_started',
  -- "mevcut durum": what is actually true today, in words, as distinct from
  -- the state machine above.
  position_en text,
  position_tr text,
  evidence_document_id uuid references document_vault (id),
  responsible_profile_id uuid references profiles (id),
  target_on date,
  met_on date,
  note text,

  constraint accreditation_requirements_met_is_dated
    check (state <> 'met' or met_on is not null)
);
select app.add_common_columns('accreditation_requirements');

comment on table accreditation_requirements is
  'The CUE checklist of M10-06: requirement, position, evidence, owner, '
  'target date. A requirement cannot reach `met` without a document in the '
  'vault behind it.';

-- The rule that makes the checklist worth keeping. Same shape as 0010's
-- demand that an obligation not be fulfilled without evidence: a box that can
-- be ticked on somebody's word is a box that will be.
create or replace function app.require_evidence_before_met()
returns trigger
language plpgsql
as $$
begin
  if new.state = 'met' and new.evidence_document_id is null then
    raise exception
      'requirement "%" cannot be marked met without the evidence document',
      new.title_en
      using errcode = 'check_violation',
            hint = 'Put the document in the vault first, then point this at it.';
  end if;
  return new;
end;
$$;

create trigger accreditation_requirements_need_evidence
  before insert or update on accreditation_requirements
  for each row execute function app.require_evidence_before_met();

-- ---------------------------------------------------------------------------
-- The charter roadmap (M10-07)
-- ---------------------------------------------------------------------------

create type stage_state as enum ('not_started', 'in_progress', 'blocked', 'done', 'abandoned');

create table charter_stages (
  id uuid primary key default gen_random_uuid(),
  sequence int not null,
  title_en text not null check (btrim(title_en) <> ''),
  title_tr text,
  detail_en text,
  detail_tr text,
  state stage_state not null default 'not_started',
  target_on date,
  completed_on date,
  -- The dependency is what makes this a road map rather than a list of dates
  -- (M10-07 asks for the stages, their dependencies and their targets as
  -- data, not as a paragraph).
  depends_on_stage_id uuid references charter_stages (id) on delete set null,
  evidence_document_id uuid references document_vault (id),
  responsible_profile_id uuid references profiles (id),
  note text,

  constraint charter_stages_not_its_own_predecessor
    check (depends_on_stage_id is null or depends_on_stage_id <> id),
  constraint charter_stages_done_is_dated
    check (state <> 'done' or completed_on is not null)
);
select app.add_common_columns('charter_stages');

create unique index charter_stages_sequence_idx on charter_stages (sequence);

-- A cycle in the road map is not a hang — the views only join one level — but
-- it is a road map that cannot be walked, and it will be read as one that can.
-- So it is refused at the point somebody creates it.
create or replace function app.refuse_stage_cycle()
returns trigger
language plpgsql
as $$
declare
  v_cycle boolean;
begin
  if new.depends_on_stage_id is null then
    return new;
  end if;

  with recursive chain as (
    select new.depends_on_stage_id as id, 1 as depth
    union all
    select s.depends_on_stage_id, chain.depth + 1
    from charter_stages s
    join chain on chain.id = s.id
    where s.depends_on_stage_id is not null
      and chain.depth < 100
  )
  select exists (select 1 from chain where id = new.id) into v_cycle;

  if v_cycle then
    raise exception 'that dependency closes a loop in the road map'
      using errcode = 'check_violation',
            hint = 'A stage cannot depend, however indirectly, on itself.';
  end if;

  return new;
end;
$$;

create trigger charter_stages_no_cycles
  before insert or update on charter_stages
  for each row execute function app.refuse_stage_cycle();

-- Each stage with the state of what it waits on. `blocked_by_predecessor` is
-- computed rather than stored, because a stored "blocked" flag is one that
-- goes stale the moment the predecessor finishes.
create view charter_roadmap with (security_invoker = true) as
select
  s.id,
  s.sequence,
  s.title_en,
  s.title_tr,
  s.detail_en,
  s.detail_tr,
  s.state,
  s.target_on,
  s.completed_on,
  s.depends_on_stage_id,
  prev.title_en as depends_on_title_en,
  prev.title_tr as depends_on_title_tr,
  prev.state as depends_on_state,
  (prev.id is not null and prev.state <> 'done') as blocked_by_predecessor,
  (s.target_on is not null and s.state not in ('done', 'abandoned') and s.target_on < current_date)
    as overdue,
  s.evidence_document_id,
  p.full_name as responsible_name,
  s.confidentiality
from charter_stages s
left join charter_stages prev on prev.id = s.depends_on_stage_id
left join profiles p on p.id = s.responsible_profile_id;

comment on view charter_roadmap is
  'The charter road map of M10-07, with each stage''s predecessor resolved. '
  'Blocked is computed, not stored: a stored flag goes stale the moment the '
  'stage before it finishes.';

-- ---------------------------------------------------------------------------
-- Academic programmes (M10-08)
-- ---------------------------------------------------------------------------

create type programme_state as enum (
  'proposed',
  'curriculum_drafted',
  'submitted_to_cue',
  'approved',
  'deferred',
  'withdrawn'
);

create table academic_programmes (
  id uuid primary key default gen_random_uuid(),
  name_en text not null check (btrim(name_en) <> ''),
  name_tr text,
  -- "derece": BSc, BA, Diploma. Free text because a new university's
  -- nomenclature is not ours to fix in an enum.
  degree text not null check (btrim(degree) <> ''),
  faculty text,
  state programme_state not null default 'proposed',
  curriculum_document_id uuid references document_vault (id),
  -- "akademik kadro gereksinimi". Null means nobody has established it, which
  -- is itself worth seeing on the readiness board.
  required_academic_staff int check (required_academic_staff is null or required_academic_staff >= 0),
  appointed_academic_staff int not null default 0 check (appointed_academic_staff >= 0),
  -- Null where the requirement is not known, rather than zero.
  staff_gap int generated always as (
    case
      when required_academic_staff is null then null
      else greatest(required_academic_staff - appointed_academic_staff, 0)
    end
  ) stored,
  accreditation_requirement_id uuid references accreditation_requirements (id),
  target_intake_year int check (target_intake_year is null or target_intake_year between 2024 and 2100),
  note text,

  constraint academic_programmes_approved_has_curriculum
    check (state <> 'approved' or curriculum_document_id is not null)
);
select app.add_common_columns('academic_programmes');

comment on table academic_programmes is
  'What this university intends to teach (M10-08). The portal had nothing of '
  'this, which for a university project is the omission that matters most. '
  'An approved programme must have its curriculum in the vault.';

-- ---------------------------------------------------------------------------
-- Quantified obligations: the scholarships and the mosque (M10-09, M10-10)
-- ---------------------------------------------------------------------------

-- Both of these are lease-derived duties with a number attached, and the
-- requirement ties both back to M2. Rather than two bespoke tables, one
-- mechanism: an obligation may carry a target, and a target accumulates
-- achievements, each with evidence.
--
-- That covers the 20% full-scholarship undertaking, the campus mosque, and
-- whatever the next lease clause turns out to require, without another
-- migration.
create table obligation_targets (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references obligations (id) on delete cascade,
  basis_en text not null check (btrim(basis_en) <> ''),
  basis_tr text,
  target_value numeric(14, 2) check (target_value is null or target_value >= 0),
  -- 'students', 'percent', 'building', 'KES' — the unit the target is in,
  -- because a bare number is how a percentage becomes a headcount.
  unit text not null check (btrim(unit) <> ''),
  period_label text,
  due_on date,
  note text
);
select app.add_common_columns('obligation_targets');

create index obligation_targets_obligation_idx on obligation_targets (obligation_id);

create table obligation_achievements (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references obligation_targets (id) on delete cascade,
  period_label text,
  value numeric(14, 2) not null check (value >= 0),
  -- The evidence. Not optional, for the same reason M7 made it mandatory on
  -- site progress: a reported achievement with nothing behind it is a claim,
  -- and a register of claims is what this portal exists to replace.
  document_id uuid not null references document_vault (id),
  achieved_on date not null default current_date,
  note text
);
select app.add_common_columns('obligation_achievements');

create index obligation_achievements_target_idx on obligation_achievements (target_id);

create view obligation_progress with (security_invoker = true) as
select
  t.id as target_id,
  t.obligation_id,
  ob.title_en as obligation_title_en,
  ob.title_tr as obligation_title_tr,
  ob.source,
  ob.state as obligation_state,
  t.basis_en,
  t.basis_tr,
  t.target_value,
  t.unit,
  t.period_label,
  t.due_on,
  tally.achieved,
  tally.records,
  -- Null rather than zero where no target was set: "we have not been told
  -- what the target is" and "we are at nought per cent" are different
  -- sentences, and the second one is a judgement the portal has no business
  -- making.
  case
    when t.target_value is null or t.target_value = 0 then null
    else round(100 * coalesce(tally.achieved, 0) / t.target_value, 1)
  end as percent_of_target,
  case
    when t.target_value is null then null
    else greatest(t.target_value - coalesce(tally.achieved, 0), 0)
  end as shortfall,
  t.confidentiality
from obligation_targets t
join obligations ob on ob.id = t.obligation_id
cross join lateral (
  select
    sum(a.value) as achieved,
    count(*)::int as records
  from obligation_achievements a
  where a.target_id = t.id
) tally;

comment on view obligation_progress is
  'Quantified obligations against what has actually been recorded and '
  'evidenced (M10-09, M10-10). percent_of_target is null where no target was '
  'set, because nought per cent is a different claim from "not established".';

-- ---------------------------------------------------------------------------
-- Conflict of interest (M10-11)
-- ---------------------------------------------------------------------------

create table conflict_declarations (
  id uuid primary key default gen_random_uuid(),
  trustee_id uuid references trustees (id) on delete cascade,
  profile_id uuid references profiles (id) on delete cascade,
  organ_id uuid references governance_organs (id),
  interest_en text not null check (btrim(interest_en) <> ''),
  interest_tr text,
  declared_on date not null default current_date,
  covers_from date,
  covers_to date,
  document_id uuid references document_vault (id),
  -- A declaration is one thing; standing out of a particular vote is another,
  -- and the second is what anybody reviewing the minute wants to see.
  recused_from_decision_id uuid references decisions (id) on delete set null,
  note text,

  constraint conflict_declarations_one_person check (
    (trustee_id is not null)::int + (profile_id is not null)::int = 1
  ),
  constraint conflict_declarations_period
    check (covers_to is null or covers_from is null or covers_to >= covers_from)
);
-- Defaults to confidential rather than internal: what somebody declares about
-- their own interests is personal, and the register exists to be auditable,
-- not browsable.
select app.add_common_columns('conflict_declarations');
alter table conflict_declarations alter column confidentiality set default 'confidential';

comment on table conflict_declarations is
  'Declared interests, and the votes they led somebody to stand out of '
  '(M10-11). Confidential by default: the register is for audit, not for '
  'reading about colleagues.';

-- ---------------------------------------------------------------------------
-- The first intake board (M10-12)
-- ---------------------------------------------------------------------------

-- One screen, counting down, across the strands that have a register behind
-- them. Four of the five the requirement lists do; "tanıtım" (outreach) does
-- not, and is deliberately absent rather than shown as a zero — a strand with
-- no register would read as "nothing done" when the truth is "nothing
-- tracked". When outreach gets a register it gets a row here.
create view intake_readiness with (security_invoker = true) as

-- Infrastructure: the blocks, and how many are finished. M7 refuses to invent
-- a percentage, so this counts states rather than averaging progress.
select
  'infrastructure'::text as strand,
  count(*)::int as total,
  count(*) filter (where b.state = 'completed')::int as ready,
  count(*) filter (where b.state in ('legally_suspended', 'emergency_preservation'))::int
    as impeded
from construction_blocks b

union all

-- Accreditation: the CUE checklist.
select
  'accreditation',
  count(*) filter (where r.state <> 'not_applicable')::int,
  count(*) filter (where r.state = 'met')::int,
  count(*) filter (
    where r.state <> 'not_applicable'
      and r.target_on is not null
      and r.target_on < current_date
      and r.state <> 'met'
  )::int
from accreditation_requirements r

union all

-- Curriculum: a programme counts as ready when its curriculum is in the vault
-- and CUE has approved it. Drafted is not ready.
select
  'curriculum',
  count(*) filter (where p.state not in ('withdrawn', 'deferred'))::int,
  count(*) filter (where p.state = 'approved')::int,
  count(*) filter (where p.state = 'deferred')::int
from academic_programmes p

union all

-- Academic staff: counted in posts rather than programmes, because that is
-- the number CUE asks for. Programmes with no established requirement are
-- counted as impeded, since an unknown requirement cannot be met.
select
  'academic_staff',
  coalesce(sum(p.required_academic_staff), 0)::int,
  coalesce(sum(least(p.appointed_academic_staff, p.required_academic_staff)), 0)::int,
  count(*) filter (where p.required_academic_staff is null)::int
from academic_programmes p
where p.state not in ('withdrawn', 'deferred');

comment on view intake_readiness is
  'The first-intake board of M10-12, over the four strands that have a '
  'register behind them. Outreach is absent on purpose: a strand with no '
  'register would read as nothing done, when the truth is nothing tracked.';

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

-- Governance material is the trust's record of itself, so the internal tier
-- means internal here in the strict sense — the same rule 0006 applies to the
-- stakeholder register. Without this, `can_read` alone would let a contractor
-- with internal clearance read the trustee register, the organs' membership
-- and the accreditation checklist, none of which is any of their business.
-- A per-record grant remains the deliberate way to hand one row to somebody
-- outside.
create or replace function app.can_see_governance_record(
  p_conf confidentiality,
  p_type text,
  p_id uuid
)
returns boolean
language plpgsql
stable
as $$
declare
  a app.authority_t := app.authority();
begin
  return app.can_read(p_conf, p_type, p_id)
    and (
      p_conf = 'public'
      or coalesce(a.internal, false)
      or app.has_grant(p_type, p_id, 'read')
    );
end;
$$;

-- A child of an obligation is visible exactly when the obligation is. Written
-- once here because the targets and the achievements must agree with each
-- other and with M2 — the same reason 0009 has can_see_case_child.
create or replace function app.can_see_obligation_child(p_conf confidentiality, p_obligation uuid)
returns boolean
language plpgsql
stable
as $$
begin
  return app.can_read(p_conf)
    and exists (
      select 1 from obligations o
      where o.id = p_obligation
        and app.can_see_obligation(
              o.confidentiality, o.id, o.obligor_profile_id, o.obligor_stakeholder_id)
    );
end;
$$;

-- --- the organs ------------------------------------------------------------

alter table governance_organs enable row level security;
alter table governance_organs force row level security;

create policy governance_organs_read on governance_organs for select to authenticated
  using (app.can_see_governance_record(confidentiality, 'governance_organs', id));

create policy governance_organs_insert on governance_organs for insert to authenticated
  with check (app.can_read(confidentiality) and app.can_keep_governance());

create policy governance_organs_update on governance_organs for update to authenticated
  using (app.can_see_governance_record(confidentiality, 'governance_organs', id) and app.can_keep_governance())
  with check (app.can_keep_governance());

create policy governance_organs_delete on governance_organs for delete to authenticated
  using (app.is_admin());

-- --- the trustee register --------------------------------------------------

alter table trustees enable row level security;
alter table trustees force row level security;

create policy trustees_read on trustees for select to authenticated
  using (app.can_see_governance_record(confidentiality, 'trustees', id));

create policy trustees_insert on trustees for insert to authenticated
  with check (app.can_read(confidentiality) and app.can_keep_governance());

create policy trustees_update on trustees for update to authenticated
  using (app.can_see_governance_record(confidentiality, 'trustees', id) and app.can_keep_governance())
  with check (app.can_keep_governance());

-- Nobody deletes a trustee. Standing down is dated, and the constraint above
-- insists on the date; erasing the row would erase who voted on what.
create policy trustees_delete on trustees for delete to authenticated
  using (app.is_admin());

alter table organ_memberships enable row level security;
alter table organ_memberships force row level security;

create policy organ_memberships_read on organ_memberships for select to authenticated
  using (app.can_see_governance_record(confidentiality, 'organ_memberships', id));

create policy organ_memberships_write on organ_memberships for insert to authenticated
  with check (app.can_read(confidentiality) and app.can_keep_governance());

create policy organ_memberships_update on organ_memberships for update to authenticated
  using (app.can_see_governance_record(confidentiality, 'organ_memberships', id) and app.can_keep_governance())
  with check (app.can_keep_governance());

create policy organ_memberships_delete on organ_memberships for delete to authenticated
  using (app.is_admin());

-- --- the compliance calendar ----------------------------------------------

alter table compliance_requirements enable row level security;
alter table compliance_requirements force row level security;

create policy compliance_requirements_read on compliance_requirements
  for select to authenticated
  using (app.can_see_governance_record(confidentiality, 'compliance_requirements', id));

create policy compliance_requirements_insert on compliance_requirements
  for insert to authenticated
  with check (app.can_read(confidentiality) and app.can_keep_readiness());

create policy compliance_requirements_update on compliance_requirements
  for update to authenticated
  using (app.can_see_governance_record(confidentiality, 'compliance_requirements', id)
         and app.can_keep_readiness())
  with check (app.can_keep_readiness());

create policy compliance_requirements_delete on compliance_requirements
  for delete to authenticated using (app.is_admin());

alter table compliance_instances enable row level security;
alter table compliance_instances force row level security;

-- An instance is readable with the requirement it came from; the obligation
-- behind it carries its own policies in M2, as it should.
create policy compliance_instances_read on compliance_instances for select to authenticated
  using (
    exists (
      select 1 from compliance_requirements r
      where r.id = requirement_id
        and app.can_see_governance_record(
              r.confidentiality, 'compliance_requirements', r.id)
    )
  );

create policy compliance_instances_write on compliance_instances for insert to authenticated
  with check (app.can_keep_readiness());

create policy compliance_instances_delete on compliance_instances for delete to authenticated
  using (app.is_admin());

-- --- accreditation ---------------------------------------------------------

alter table accreditation_requirements enable row level security;
alter table accreditation_requirements force row level security;

create policy accreditation_requirements_read on accreditation_requirements
  for select to authenticated
  using (app.can_see_governance_record(confidentiality, 'accreditation_requirements', id));

create policy accreditation_requirements_insert on accreditation_requirements
  for insert to authenticated
  with check (app.can_read(confidentiality) and app.can_keep_readiness());

create policy accreditation_requirements_update on accreditation_requirements
  for update to authenticated
  using (app.can_see_governance_record(confidentiality, 'accreditation_requirements', id)
         and app.can_keep_readiness())
  with check (app.can_keep_readiness());

create policy accreditation_requirements_delete on accreditation_requirements
  for delete to authenticated using (app.is_admin());

-- --- the road map ----------------------------------------------------------

alter table charter_stages enable row level security;
alter table charter_stages force row level security;

create policy charter_stages_read on charter_stages for select to authenticated
  using (app.can_see_governance_record(confidentiality, 'charter_stages', id));

create policy charter_stages_insert on charter_stages for insert to authenticated
  with check (app.can_read(confidentiality) and app.can_keep_governance());

create policy charter_stages_update on charter_stages for update to authenticated
  using (app.can_see_governance_record(confidentiality, 'charter_stages', id) and app.can_keep_governance())
  with check (app.can_keep_governance());

create policy charter_stages_delete on charter_stages for delete to authenticated
  using (app.is_admin());

-- --- academic programmes ---------------------------------------------------

alter table academic_programmes enable row level security;
alter table academic_programmes force row level security;

create policy academic_programmes_read on academic_programmes for select to authenticated
  using (app.can_see_governance_record(confidentiality, 'academic_programmes', id));

create policy academic_programmes_insert on academic_programmes for insert to authenticated
  with check (app.can_read(confidentiality) and app.can_keep_readiness());

create policy academic_programmes_update on academic_programmes for update to authenticated
  using (app.can_see_governance_record(confidentiality, 'academic_programmes', id) and app.can_keep_readiness())
  with check (app.can_keep_readiness());

create policy academic_programmes_delete on academic_programmes for delete to authenticated
  using (app.is_admin());

-- --- quantified obligations ------------------------------------------------

alter table obligation_targets enable row level security;
alter table obligation_targets force row level security;

create policy obligation_targets_read on obligation_targets for select to authenticated
  using (app.can_see_obligation_child(confidentiality, obligation_id));

create policy obligation_targets_insert on obligation_targets for insert to authenticated
  with check (app.can_see_obligation_child(confidentiality, obligation_id)
              and app.can_keep_readiness());

create policy obligation_targets_update on obligation_targets for update to authenticated
  using (app.can_see_obligation_child(confidentiality, obligation_id)
         and app.can_keep_readiness())
  with check (app.can_keep_readiness());

create policy obligation_targets_delete on obligation_targets for delete to authenticated
  using (app.is_admin());

alter table obligation_achievements enable row level security;
alter table obligation_achievements force row level security;

create policy obligation_achievements_read on obligation_achievements
  for select to authenticated
  using (
    exists (
      select 1 from obligation_targets t
      where t.id = target_id
        and app.can_see_obligation_child(t.confidentiality, t.obligation_id)
    )
  );

create policy obligation_achievements_insert on obligation_achievements
  for insert to authenticated
  with check (
    app.can_keep_readiness()
    and exists (
      select 1 from obligation_targets t
      where t.id = target_id
        and app.can_see_obligation_child(t.confidentiality, t.obligation_id)
    )
    -- The evidence has to be a document this person can actually see, or the
    -- citation is to something they have never read.
    and app.can_see_document(document_id)
  );

-- Append-only, the same way site progress is in 0013. A number that was
-- reported and evidenced and can then be quietly revised is not a record of
-- what happened; a correcting entry is how a mistake gets fixed.
create trigger obligation_achievements_append_only
  before update or delete on obligation_achievements
  for each row execute function app.refuse_audit_mutation();

revoke update, delete on obligation_achievements from authenticated;

-- --- conflicts of interest -------------------------------------------------

alter table conflict_declarations enable row level security;
alter table conflict_declarations force row level security;

-- Your own declaration is always yours to read. Beyond that it is the board,
-- the administrator and the audit committee — the people the register exists
-- for.
--
-- Note who is NOT on that list: the external auditor. These rows default to
-- confidential, and an external role is capped at internal whatever else is
-- configured for it (app.max_clearance), so an outside auditor reaches a
-- declaration only through a per-record grant. That is the right shape — an
-- audit of the declarations is a thing somebody decides to hand over, not a
-- standing subscription to what colleagues have disclosed about themselves.
create policy conflict_declarations_read on conflict_declarations for select to authenticated
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from trustees t
      where t.id = trustee_id and t.stakeholder_id is not null
        and app.caller_is(null, t.stakeholder_id)
    )
    or (
      app.can_see_governance_record(confidentiality, 'conflict_declarations', id)
      and app.acts_as('admin', 'trustee', 'board_director', 'audit_committee')
    )
  );

-- Anybody may declare their own interest; that is the point of a declaration
-- register, and making it the board's job to enter them is how they stop
-- being made.
create policy conflict_declarations_insert on conflict_declarations for insert to authenticated
  with check (
    app.can_read(confidentiality)
    and (profile_id = auth.uid() or app.can_keep_governance())
  );

create policy conflict_declarations_update on conflict_declarations for update to authenticated
  using (
    (profile_id = auth.uid() or app.can_keep_governance())
    and app.can_see_governance_record(confidentiality, 'conflict_declarations', id)
  )
  with check (profile_id = auth.uid() or app.can_keep_governance());

create policy conflict_declarations_delete on conflict_declarations for delete to authenticated
  using (app.is_admin());

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select on governance_sitting_quorum to authenticated;
grant select on decision_implementation to authenticated;
grant select on compliance_calendar to authenticated;
grant select on charter_roadmap to authenticated;
grant select on obligation_progress to authenticated;
grant select on intake_readiness to authenticated;
grant execute on all functions in schema app to authenticated;
