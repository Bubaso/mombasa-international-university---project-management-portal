-- The watch book: patrol, gate and incident (M7-18, M7-12, M6-11).
--
-- Three requirement rows point at one register and none of them had a table.
-- M7-18 asks for the guard's shift log, M7-12 for the HSE and incident
-- record, M6-11 for the site security incident record "which carries both
-- security and evidential value" — the site is under physical threat, so what
-- the night watch writes down may later be read in court. One book, then.
--
-- A watchman's book has a well-known way of failing: it gets filled in at the
-- end of the shift from memory, every round ticked, every gate movement neat,
-- and the result is a document that cannot be told apart from a true one. So
-- the decisions here are all about the difference between what happened and
-- what was written down:
--
--   * `recorded_at` is stamped by a trigger and cannot be edited. The gap
--     between it and `began_at` / `walked_at` / `occurred_at` is on the
--     screen. A shift entered three days later is still a record; it just
--     says so.
--
--   * `rounds_expected` is nullable. Null is not zero: two rounds out of a
--     figure nobody recorded must read differently from two out of four, so
--     the view returns null for the shortfall rather than pretending the
--     expectation was nought.
--
--   * Nothing closes a shift and nothing closes a visit. A gate entry with
--     no exit does not mean the person is on site — it means the exit was
--     never written down, and the register says that in those words. What it
--     can measure, it does: an open entry whose watch has ended is flagged,
--     because the book is being kept badly and that is the finding.
--
--   * "Official notification made" needs the notification. This is the same
--     rule the rest of the portal already enforces for outgoing official
--     letters: a tick that an authority was told, with no letter behind it,
--     is the single most load-bearing lie this register could hold. Default
--     is `unknown`, not `not_required` — nobody has said either.
--
--   * A confirmed incident is frozen, as a signed inspection report is. What
--     was done about it afterwards can still be added, because a later
--     response is not a rewrite of what happened.
--
-- Requirements: M7-18, M7-12, M6-11.

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

-- ---------------------------------------------------------------------------
-- Vocabulary
-- ---------------------------------------------------------------------------

create type watch_post as enum (
  'main_gate',
  'perimeter',
  'block',
  'store',
  'other'
);

create type incident_kind as enum (
  -- M7-12's three, kept apart because the difference between the first two
  -- is whether anybody was hurt, and that is exactly the distinction a badly
  -- kept book loses.
  'accident',
  'near_miss',
  'security_breach',
  -- M6-11's: this site has had people come over the fence.
  'intrusion',
  'threat',
  'theft',
  'damage',
  'dispute',
  'fire',
  'other'
);

-- Whether an authority was told. Three values, and the default is the one
-- that admits nothing is known: a register that defaulted to 'not_required'
-- would be asserting a judgement nobody made.
create type authority_notice as enum (
  'unknown',
  'not_required',
  'notified'
);

comment on type authority_notice is
  'Whether a public authority was notified of an incident (M6-11). Default '
  'unknown: not telling anyone and nobody having recorded whether anyone was '
  'told are different states, and only the second one is an unfinished job.';

-- ---------------------------------------------------------------------------
-- The shift
-- ---------------------------------------------------------------------------

create table watch_shifts (
  id uuid primary key default gen_random_uuid(),
  post watch_post not null default 'main_gate',
  construction_block_id uuid references construction_blocks (id) on delete set null,

  -- The guard, as a name. The watch is a contracted firm and its people do
  -- not hold portal accounts; a profile reference here would quietly mean
  -- "this person signed in", which none of them ever did. Who typed it is a
  -- separate column, below, and the two are not the same person.
  on_watch text not null,
  watch_firm text,

  began_at timestamptz not null,
  -- Null means the shift was never closed in the book. Nothing in this
  -- schema closes it; the register reports it.
  ended_at timestamptz,

  -- How many rounds this shift was meant to walk. Null, not zero: nobody
  -- recorded a figure, and the view must not turn that into a shortfall.
  rounds_expected int check (rounds_expected >= 0),

  handover_note text,

  recorded_by uuid not null references profiles (id) default auth.uid(),
  -- Stamped by a trigger, not editable. See app.stamp_record_moment.
  recorded_at timestamptz not null default now(),

  constraint watch_shifts_ordered check (ended_at is null or ended_at >= began_at),
  constraint watch_shifts_on_watch_named check (btrim(on_watch) <> ''),
  -- A watch over a block has to say which block. The gate and the perimeter
  -- belong to no block, which is why the column is nullable at all.
  constraint watch_shifts_block_post_names_its_block check (
    post <> 'block' or construction_block_id is not null
  )
);
select app.add_common_columns('watch_shifts');

create index watch_shifts_began_idx on watch_shifts (began_at desc);
create index watch_shifts_block_idx on watch_shifts (construction_block_id, began_at desc);

comment on table watch_shifts is
  'A guard watch as it was written down (M7-18). on_watch is a name, not a '
  'portal user: the firm''s people do not have accounts here.';

-- ---------------------------------------------------------------------------
-- The rounds
-- ---------------------------------------------------------------------------

-- A round exists because somebody recorded walking it. There is no table of
-- rounds that were due and no column that marks one complete: an absent round
-- is absent, and the shortfall against `rounds_expected` is computed, so
-- nobody can tick a round nobody walked.
create table watch_rounds (
  id uuid primary key default gen_random_uuid(),
  watch_shift_id uuid not null references watch_shifts (id) on delete cascade,
  walked_at timestamptz not null,
  route text,
  note text,
  recorded_by uuid not null references profiles (id) default auth.uid(),
  recorded_at timestamptz not null default now()
);

create index watch_rounds_shift_idx on watch_rounds (watch_shift_id, walked_at);

alter table watch_rounds enable row level security;
alter table watch_rounds force row level security;

-- ---------------------------------------------------------------------------
-- The gate
-- ---------------------------------------------------------------------------

create table gate_visits (
  id uuid primary key default gen_random_uuid(),
  watch_shift_id uuid references watch_shifts (id) on delete set null,
  construction_block_id uuid references construction_blocks (id) on delete set null,

  person_name text not null,
  organisation text,
  -- Where the visitor is somebody the project already knows. A minister
  -- arriving at the gate belongs in the stakeholder record too, and linking
  -- it here is the only way the two registers ever agree about the date.
  stakeholder_id uuid references stakeholders (id) on delete set null,

  purpose text,
  vehicle_plate text,
  escorted_by text,
  id_document_seen boolean not null default false,

  entered_at timestamptz not null,
  -- Null means nobody wrote the exit down. It does not mean the person is on
  -- site, and nothing here will close it on their behalf.
  exited_at timestamptz,

  recorded_by uuid not null references profiles (id) default auth.uid(),
  recorded_at timestamptz not null default now(),

  constraint gate_visits_ordered check (exited_at is null or exited_at >= entered_at),
  constraint gate_visits_person_named check (btrim(person_name) <> '')
);
select app.add_common_columns('gate_visits');

-- Who came to the site is not an operational detail on this project: an
-- unannounced visit is itself information about where the dispute stands.
alter table gate_visits alter column confidentiality set default 'confidential';

create index gate_visits_entered_idx on gate_visits (entered_at desc);
create index gate_visits_open_idx on gate_visits (entered_at desc) where exited_at is null;
create index gate_visits_stakeholder_idx on gate_visits (stakeholder_id) where stakeholder_id is not null;

-- ---------------------------------------------------------------------------
-- The incident
-- ---------------------------------------------------------------------------

create table site_incidents (
  id uuid primary key default gen_random_uuid(),
  watch_shift_id uuid references watch_shifts (id) on delete set null,
  construction_block_id uuid references construction_blocks (id) on delete set null,

  kind incident_kind not null,
  occurred_at timestamptz not null,

  description_en text not null,
  description_tr text,

  -- What was done about it. Null reads as "no response recorded", because an
  -- incident nobody answered and an incident whose answer nobody wrote down
  -- are different failures and need different conversations.
  intervention_en text,
  intervention_tr text,

  -- Null is not zero here either: nobody counted.
  injured_count int check (injured_count >= 0),
  severity int check (severity between 1 and 5),

  -- Kenya: the occurrence book number a police station gives a report. It is
  -- the handle the record is later found by, so it is kept verbatim.
  police_ob_number text,

  authority_notice authority_notice not null default 'unknown',
  notified_at timestamptz,
  -- restrict, not set null: a letter cited as the proof that an authority was
  -- told cannot be removed from the vault while the claim stands.
  notification_document_id uuid references document_vault (id) on delete restrict,

  -- Where this incident went next. Both nullable: most incidents are neither
  -- a tracked risk nor a case, and inventing a link would be worse than none.
  risk_id uuid references risks (id) on delete set null,
  legal_case_id uuid references legal_cases (id) on delete set null,

  -- Confirming is one-way, as signing an inspection report is.
  confirmed_at timestamptz,
  confirmed_by uuid references profiles (id),

  recorded_by uuid not null references profiles (id) default auth.uid(),
  recorded_at timestamptz not null default now(),

  constraint site_incidents_described check (btrim(description_en) <> ''),
  constraint site_incidents_confirmation_is_whole check (
    (confirmed_at is null) = (confirmed_by is null)
  ),

  -- The load-bearing one. Saying an authority was notified requires the date
  -- and the letter; the rest of the portal already refuses an outgoing
  -- official communication without the communication itself.
  constraint site_incidents_notice_brings_its_letter check (
    authority_notice <> 'notified'
      or (notified_at is not null and notification_document_id is not null)
  ),
  -- And the other direction: a date or a document without the claim would
  -- leave a half-told story that reads as a notification on a screen.
  constraint site_incidents_notice_is_whole check (
    authority_notice = 'notified'
      or (notified_at is null and notification_document_id is null)
  ),

  -- If somebody was hurt it was not a near miss. This is not pedantry: the
  -- classification is what gets counted in an HSE return, and the cheapest
  -- way to make an injury disappear is to file it under the other word.
  constraint site_incidents_near_miss_hurt_nobody check (
    kind <> 'near_miss' or coalesce(injured_count, 0) = 0
  )
);
select app.add_common_columns('site_incidents');

-- An incident record on this site may end up as evidence. It starts closed.
alter table site_incidents alter column confidentiality set default 'confidential';

create index site_incidents_occurred_idx on site_incidents (occurred_at desc);
create index site_incidents_kind_idx on site_incidents (kind, occurred_at desc);
create index site_incidents_block_idx on site_incidents (construction_block_id, occurred_at desc);

comment on table site_incidents is
  'Site incidents: accident, near miss, security breach, intrusion (M7-12, '
  'M6-11). authority_notice = notified requires the letter, and a confirmed '
  'record is frozen.';

-- Evidence is plural in practice: a photograph, a police abstract, a
-- contractor's note. Join table rather than one column, and restrict on
-- delete so cited evidence cannot quietly leave the vault.
create table incident_evidence (
  site_incident_id uuid not null references site_incidents (id) on delete cascade,
  document_id uuid not null references document_vault (id) on delete restrict,
  note text,
  added_by uuid references profiles (id) default auth.uid(),
  added_at timestamptz not null default now(),
  primary key (site_incident_id, document_id)
);

alter table incident_evidence enable row level security;
alter table incident_evidence force row level security;

-- ---------------------------------------------------------------------------
-- When a thing was written down
-- ---------------------------------------------------------------------------

-- One trigger for all four tables. The stamp is the machine's, not the
-- writer's: if `recorded_at` were editable, every honesty measurement built
-- on it — the write-up lag, the "this was filled in from memory" reading —
-- would be editable too, and a register whose own clock can be adjusted
-- measures nothing.
create or replace function app.stamp_record_moment()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.recorded_at := now();
    return new;
  end if;

  if new.recorded_at is distinct from old.recorded_at then
    raise exception 'when a %s entry was written down is not editable', tg_table_name
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger watch_shifts_record_moment before insert or update on watch_shifts
  for each row execute function app.stamp_record_moment();
create trigger watch_rounds_record_moment before insert or update on watch_rounds
  for each row execute function app.stamp_record_moment();
create trigger gate_visits_record_moment before insert or update on gate_visits
  for each row execute function app.stamp_record_moment();
create trigger site_incidents_record_moment before insert or update on site_incidents
  for each row execute function app.stamp_record_moment();

-- ---------------------------------------------------------------------------
-- A round belongs inside its shift
-- ---------------------------------------------------------------------------

-- Both directions, because the shift is usually opened first, the rounds go
-- in during the night, and the closing time is typed last. Checking only the
-- round would let the closing time move backwards over rounds already
-- recorded, and the book would then contain a shift whose own rounds fall
-- outside it.
create or replace function app.round_inside_its_watch()
returns trigger
language plpgsql
as $$
declare
  v_began timestamptz;
  v_ended timestamptz;
begin
  select began_at, ended_at into v_began, v_ended
  from watch_shifts where id = new.watch_shift_id;

  if new.walked_at < v_began then
    raise exception 'this round is before its watch began'
      using errcode = 'check_violation';
  end if;

  if v_ended is not null and new.walked_at > v_ended then
    raise exception 'this round is after its watch ended'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' and new.walked_at is distinct from old.walked_at then
    raise exception 'when a round was walked is not editable; record another round'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger watch_rounds_inside_watch before insert or update on watch_rounds
  for each row execute function app.round_inside_its_watch();

create or replace function app.watch_closes_after_its_rounds()
returns trigger
language plpgsql
as $$
declare
  v_last timestamptz;
begin
  if new.ended_at is null then
    return new;
  end if;

  select max(walked_at) into v_last from watch_rounds where watch_shift_id = new.id;

  if v_last is not null and v_last > new.ended_at then
    raise exception 'a round is recorded at % , after this closing time', v_last
      using errcode = 'check_violation';
  end if;

  if new.began_at is distinct from old.began_at and exists (
    select 1 from watch_rounds where watch_shift_id = new.id and walked_at < new.began_at
  ) then
    raise exception 'a round is recorded before this starting time'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger watch_shifts_close_after_rounds before update on watch_shifts
  for each row execute function app.watch_closes_after_its_rounds();

-- ---------------------------------------------------------------------------
-- A confirmed incident is fixed
-- ---------------------------------------------------------------------------

create or replace function app.freeze_confirmed_incident()
returns trigger
language plpgsql
as $$
begin
  if old.confirmed_at is null then
    return new;
  end if;

  if new.confirmed_at is null then
    raise exception 'a confirmed incident record cannot be unconfirmed'
      using errcode = 'insufficient_privilege';
  end if;

  -- What happened is fixed. What was done about it, and who was told, are
  -- still open: a response recorded a week later is not a rewrite of the
  -- event, it is the rest of the record arriving.
  if new.kind is distinct from old.kind
     or new.occurred_at is distinct from old.occurred_at
     or new.description_en is distinct from old.description_en
     or new.description_tr is distinct from old.description_tr
     or new.injured_count is distinct from old.injured_count
     or new.severity is distinct from old.severity then
    raise exception 'a confirmed incident record cannot be edited; add the response instead'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger site_incidents_frozen_once_confirmed before update on site_incidents
  for each row execute function app.freeze_confirmed_incident();

create or replace function public.confirm_incident(p_incident uuid)
returns timestamptz
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_at timestamptz;
begin
  update site_incidents
     set confirmed_at = now(), confirmed_by = auth.uid()
   where id = p_incident and confirmed_at is null
  returning confirmed_at into v_at;

  if v_at is null then
    -- Either the row is not visible to this caller, or it is already
    -- confirmed. Both are a no, and neither is worth telling an outsider
    -- apart.
    raise exception 'this incident cannot be confirmed'
      using errcode = 'insufficient_privilege';
  end if;

  return v_at;
end;
$$;

comment on function public.confirm_incident(uuid) is
  'Freeze an incident record. One way: there is no unconfirm, and the trigger '
  'refuses the transition.';

-- ---------------------------------------------------------------------------
-- What the register says
-- ---------------------------------------------------------------------------

create view watch_register with (security_invoker = true) as
select
  s.id as watch_shift_id,
  s.post,
  s.construction_block_id,
  b.code as block_code,
  s.on_watch,
  s.watch_firm,
  s.began_at,
  s.ended_at,
  s.rounds_expected,
  count(r.id) as rounds_recorded,
  -- Null when no expectation was recorded, so no screen can print a
  -- shortfall against a figure nobody gave.
  case
    when s.rounds_expected is null then null
    else greatest(s.rounds_expected - count(r.id), 0)::int
  end as rounds_missing,
  max(r.walked_at) as last_round_at,
  -- How long after the watch started it appeared in the book. A shift
  -- entered the next afternoon was written from memory.
  round(extract(epoch from (s.recorded_at - s.began_at)) / 3600.0, 1) as logged_hours_after_start,
  (s.ended_at is null and s.began_at < now() - interval '36 hours') as never_closed,
  s.handover_note,
  s.recorded_by,
  s.recorded_at,
  s.confidentiality
from watch_shifts s
left join construction_blocks b on b.id = s.construction_block_id
left join watch_rounds r on r.watch_shift_id = s.id
group by s.id, b.code;

comment on view watch_register is
  'Watches as written down (M7-18). rounds_missing is null when no expected '
  'count was recorded: two rounds out of an unrecorded figure is not two out '
  'of nought.';

create view gate_presence with (security_invoker = true) as
select
  v.id as gate_visit_id,
  v.person_name,
  v.organisation,
  v.stakeholder_id,
  v.purpose,
  v.vehicle_plate,
  v.escorted_by,
  v.id_document_seen,
  v.entered_at,
  v.watch_shift_id,
  s.ended_at as watch_ended_at,
  s.on_watch,
  round(extract(epoch from (now() - v.entered_at)) / 3600.0, 1) as open_hours,
  -- An entry whose watch has ended, with no exit written, is far more likely
  -- an exit nobody recorded than a person who never left. The register says
  -- which two things it cannot tell apart. It does not choose one.
  (
    (s.ended_at is not null and s.ended_at < now())
    or v.entered_at < now() - interval '24 hours'
  ) as outlasted_its_watch,
  v.construction_block_id,
  v.confidentiality
from gate_visits v
left join watch_shifts s on s.id = v.watch_shift_id
where v.exited_at is null;

comment on view gate_presence is
  'Gate entries with no exit recorded (M7-18). This is not a list of people '
  'on site: it is a list of entries whose exit was never written down, and '
  'outlasted_its_watch marks the ones that are almost certainly the second.';

create view incident_register with (security_invoker = true) as
select
  i.id as site_incident_id,
  i.kind,
  i.occurred_at,
  i.construction_block_id,
  b.code as block_code,
  i.watch_shift_id,
  i.description_en,
  i.description_tr,
  i.intervention_en,
  i.intervention_tr,
  (i.intervention_en is null and i.intervention_tr is null) as intervention_unrecorded,
  i.injured_count,
  i.severity,
  i.police_ob_number,
  i.authority_notice,
  i.notified_at,
  i.notification_document_id,
  i.risk_id,
  i.legal_case_id,
  (i.confirmed_at is not null) as confirmed,
  i.confirmed_at,
  count(e.document_id) as evidence_count,
  -- The write-up lag. An incident logged eleven days later is still a
  -- record; a reader deciding what it is worth needs to know.
  round(extract(epoch from (i.recorded_at - i.occurred_at)) / 3600.0, 1) as logged_hours_after,
  i.recorded_by,
  i.recorded_at,
  i.confidentiality
from site_incidents i
left join construction_blocks b on b.id = i.construction_block_id
left join incident_evidence e on e.site_incident_id = i.id
group by i.id, b.code;

comment on view incident_register is
  'The incident record (M7-12, M6-11), with what is missing from each row '
  'rather than a tidy count: no response recorded, no evidence filed, no '
  'notification decision taken.';

-- What this register does not know, counted. The same shape as
-- notification_health: one row, every number a thing somebody has to go and
-- find out.
create view watch_health with (security_invoker = true) as
select
  (select count(*) from watch_register where never_closed) as watches_never_closed,
  (select count(*) from watch_register where rounds_expected is null) as watches_without_an_expected_count,
  (select count(*) from watch_register where coalesce(rounds_missing, 0) > 0) as watches_short_of_their_rounds,
  (select count(*) from gate_presence) as entries_without_an_exit,
  (select count(*) from gate_presence where outlasted_its_watch) as entries_outlasting_their_watch,
  (select count(*) from incident_register where evidence_count = 0) as incidents_without_evidence,
  (select count(*) from incident_register where intervention_unrecorded) as incidents_without_a_response,
  (
    select count(*) from incident_register
    where authority_notice = 'unknown'
      and kind in ('accident', 'security_breach', 'intrusion', 'threat', 'fire')
  ) as serious_incidents_with_no_notification_decision,
  (select count(*) from incident_register where not confirmed) as incidents_not_yet_confirmed;

comment on view watch_health is
  'What the watch book does not say. Every column is an unfinished job, not '
  'a defect in the portal: the register exists to put these in front of '
  'somebody.';

-- ---------------------------------------------------------------------------
-- Who may do what
-- ---------------------------------------------------------------------------

-- The null-block-aware sibling of app.can_see_block_child. The gate and the
-- perimeter belong to no block, and a watch over them must not be invisible
-- just because the block join fails.
create or replace function app.can_see_watch(p_conf confidentiality, p_block uuid)
returns boolean
language sql
stable
as $$
  select app.can_read(p_conf)
    and (
      p_block is null
      or exists (
        select 1 from construction_blocks b
        where b.id = p_block and app.can_see_block(b.confidentiality, b.id)
      )
    );
$$;

-- The watch book is AUTK's own record. A contractor reports progress on
-- their blocks (M7-10) but does not keep the register that may later be read
-- against them.
create or replace function app.can_keep_the_watch()
returns boolean
language sql
stable
as $$
  select app.acts_as('admin', 'project_director', 'field_team');
$$;

alter table watch_shifts enable row level security;
alter table watch_shifts force row level security;

create policy watch_shifts_read on watch_shifts
  for select using (app.can_see_watch(confidentiality, construction_block_id));
create policy watch_shifts_insert on watch_shifts
  for insert with check (
    app.can_read(confidentiality)
    and app.can_keep_the_watch()
    and recorded_by = auth.uid()
  );
create policy watch_shifts_update on watch_shifts
  for update
  using (app.can_see_watch(confidentiality, construction_block_id) and app.can_keep_the_watch())
  with check (app.can_keep_the_watch());
-- No delete policy, and the grant below takes delete away: a watch somebody
-- wrote down is not something the next shift gets to remove.

create policy watch_rounds_read on watch_rounds
  for select using (
    exists (
      select 1 from watch_shifts s
      where s.id = watch_shift_id
        and app.can_see_watch(s.confidentiality, s.construction_block_id)
    )
  );
create policy watch_rounds_insert on watch_rounds
  for insert with check (
    app.can_keep_the_watch()
    and recorded_by = auth.uid()
    and exists (
      select 1 from watch_shifts s
      where s.id = watch_shift_id
        and app.can_see_watch(s.confidentiality, s.construction_block_id)
    )
  );
create policy watch_rounds_update on watch_rounds
  for update
  using (
    app.can_keep_the_watch()
    and exists (
      select 1 from watch_shifts s
      where s.id = watch_shift_id
        and app.can_see_watch(s.confidentiality, s.construction_block_id)
    )
  )
  with check (app.can_keep_the_watch());

alter table gate_visits enable row level security;
alter table gate_visits force row level security;

create policy gate_visits_read on gate_visits
  for select using (app.can_see_watch(confidentiality, construction_block_id));
create policy gate_visits_insert on gate_visits
  for insert with check (
    app.can_read(confidentiality)
    and app.can_keep_the_watch()
    and recorded_by = auth.uid()
  );
-- Writing the exit is an update, and it is the whole point of the table.
create policy gate_visits_update on gate_visits
  for update
  using (app.can_see_watch(confidentiality, construction_block_id) and app.can_keep_the_watch())
  with check (app.can_keep_the_watch());

alter table site_incidents enable row level security;
alter table site_incidents force row level security;

create policy site_incidents_read on site_incidents
  for select using (app.can_see_watch(confidentiality, construction_block_id));
create policy site_incidents_insert on site_incidents
  for insert with check (
    app.can_read(confidentiality)
    and app.acts_as('admin', 'project_director', 'field_team', 'legal_counsel')
    and recorded_by = auth.uid()
  );
create policy site_incidents_update on site_incidents
  for update
  using (
    app.can_see_watch(confidentiality, construction_block_id)
    and app.acts_as('admin', 'project_director', 'field_team', 'legal_counsel')
  )
  with check (
    app.acts_as('admin', 'project_director', 'field_team', 'legal_counsel')
  );
-- No delete policy. An incident record is the thing somebody would most want
-- gone, which is the reason it cannot be.

create policy incident_evidence_read on incident_evidence
  for select using (
    exists (
      select 1 from site_incidents i
      where i.id = site_incident_id
        and app.can_see_watch(i.confidentiality, i.construction_block_id)
    )
  );
create policy incident_evidence_insert on incident_evidence
  for insert with check (
    app.acts_as('admin', 'project_director', 'field_team', 'legal_counsel')
    and exists (
      select 1 from site_incidents i
      where i.id = site_incident_id
        and app.can_see_watch(i.confidentiality, i.construction_block_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- 0003's default privileges hand insert, update and delete to every new
-- table. Delete is wrong for all five of these, and leaving it granted would
-- mean a delete attempt matched no policy and failed silently with zero rows
-- instead of saying no.
revoke all on watch_shifts, watch_rounds, gate_visits, site_incidents, incident_evidence
  from authenticated;

grant select, insert, update on watch_shifts, watch_rounds, gate_visits, site_incidents
  to authenticated;
grant select, insert on incident_evidence to authenticated;

grant select on watch_register, gate_presence, incident_register, watch_health
  to authenticated;

drop function app.add_common_columns(regclass);

select app.reset_function_grants();
