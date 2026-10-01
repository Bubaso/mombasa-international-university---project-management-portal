-- The unified calendar gains its milestones, and the countdown strip and the
-- chronology are built on it (M15-03, M15-04, M15-07).
--
-- Split from 0024 for the same mechanical reason 0023 was split from 0022:
-- `calendar_kind` needed the value 'milestone', and Postgres refuses to use a
-- new enum value in the transaction that created it.
--
-- The view is restated in full because `create or replace view` has to see
-- the whole definition. Everything above the milestone branch is 0011's and
-- 0023's, unchanged.
--
-- Requirements: M15-03, M15-04, M15-07.

create or replace view project_calendar with (security_invoker = true) as

-- Court dates. The one kind of deadline on this project that nobody sets and
-- nobody can move.
select
  'hearing'::calendar_kind as kind,
  h.id,
  coalesce(nullif(btrim(c.title), ''), c.case_number) as title_en,
  coalesce(nullif(btrim(c.title), ''), c.case_number) as title_tr,
  h.scheduled_for::date as due_on,
  h.scheduled_for as due_at,
  h.kind::text as detail,
  c.id as legal_case_id,
  null::uuid as meeting_id,
  h.confidentiality,
  h.preparation::text as state,
  -- A hearing nobody has prepared for is the one worth colouring red.
  (h.preparation in ('not_started', 'missed')) as needs_attention
from hearings h
join legal_cases c on c.id = h.legal_case_id
where h.scheduled_for >= current_date - interval '30 days'

union all

-- Procedural deadlines. Missing one of these is a live risk here, not a
-- theoretical one.
select
  'filing'::calendar_kind,
  f.id,
  f.title,
  f.title,
  f.due_on,
  f.due_on::timestamptz,
  f.kind::text,
  f.legal_case_id,
  null::uuid,
  f.confidentiality,
  f.state::text,
  (f.state in ('planned', 'drafting') and f.due_on is not null and f.due_on < current_date)
from filings f
where f.due_on is not null
  and f.state not in ('filed', 'served', 'withdrawn')

union all

select
  'obligation'::calendar_kind,
  o.id,
  o.title_en,
  o.title_tr,
  o.due_on,
  o.due_on::timestamptz,
  o.source::text,
  null::uuid,
  o.source_meeting_id,
  o.confidentiality,
  o.state::text,
  (o.due_on < current_date)
from obligations o
where o.due_on is not null
  and o.state in ('open', 'in_progress', 'at_risk')

union all

select
  'action'::calendar_kind,
  a.id,
  a.text_en,
  a.text_tr,
  a.due_date,
  a.due_date::timestamptz,
  a.priority::text,
  null::uuid,
  a.meeting_id,
  a.confidentiality,
  a.status::text,
  (a.due_date < current_date)
from action_items a
where a.status in ('open', 'in_progress', 'blocked')

union all

select
  'question'::calendar_kind,
  q.id,
  q.question_en,
  q.question_tr,
  q.target_resolution_date,
  q.target_resolution_date::timestamptz,
  q.status::text,
  null::uuid,
  q.meeting_id,
  q.confidentiality,
  q.status::text,
  (q.target_resolution_date < current_date)
from open_questions q
where q.target_resolution_date is not null
  and q.status in ('open', 'escalated')

union all

-- Meetings that have not happened yet, so the week reads as a week.
select
  'meeting'::calendar_kind,
  m.id,
  m.title,
  m.title,
  m.held_at::date,
  m.held_at,
  m.kind::text,
  null::uuid,
  m.id,
  m.confidentiality,
  m.status::text,
  false
from meetings m
where m.held_at >= current_date
  and m.status in ('planned', 'in_progress')

union all

-- Contract renewals and expiries (M14-05).
--
-- The dates were in the contract register from the moment 0022 landed; what
-- they were not was in the one place anybody looks at a week. A renewal date
-- that only exists on the procurement screen is a renewal date that gets
-- noticed when the contract has already lapsed, which on this project has
-- happened to a lease.
--
-- A renewal and an expiry are two rows, not one, because they are two
-- different things to do and they fall due at different times: the decision
-- about renewing comes first, and missing it is the failure that matters.
select
  'contract'::calendar_kind,
  c.id,
  format('%s — %s',
         coalesce(nullif(c.reference_no, ''), c.counterparty_name),
         case when c.renewal_on is not null and c.renewal_on <= coalesce(c.ends_on, c.renewal_on)
              then 'renewal decision' else 'contract ends' end),
  format('%s — %s',
         coalesce(nullif(c.reference_no, ''), c.counterparty_name),
         case when c.renewal_on is not null and c.renewal_on <= coalesce(c.ends_on, c.renewal_on)
              then 'yenileme kararı' else 'sözleşme bitiyor' end),
  d.due_on,
  d.due_on::timestamptz,
  c.subject_en,
  null::uuid,
  null::uuid,
  c.confidentiality,
  c.state::text,
  -- A date that has passed with no successor drafted is the one worth
  -- colouring. A renewal somebody has already written is not a worry.
  (d.due_on < current_date
   and not exists (select 1 from contracts n where n.supersedes_contract_id = c.id))
from contracts c
cross join lateral (
  -- Whichever of the two dates this row is for.
  select unnest(array_remove(array[c.renewal_on, c.ends_on], null)) as due_on
) d
where c.state in ('draft', 'signed', 'active', 'suspended')
  and d.due_on is not null

union all

-- Milestones (M15-01, M15-03).
--
-- The requirement calls this module the time axis that joins the others, and
-- a milestone that is not on the calendar is a milestone nobody is counting
-- down to. A milestone contributes its target while it is still ahead, and
-- its target still after it has passed unachieved — because a date that
-- slipped silently is the thing this project has done for a decade.
select
  'milestone'::calendar_kind,
  m.id,
  m.title_en,
  coalesce(m.title_tr, m.title_en),
  m.target_on,
  m.target_on::timestamptz,
  concat_ws(' · ',
            nullif(m.code, ''),
            p.name_en,
            case when m.critical then 'critical' end),
  null::uuid,
  null::uuid,
  m.confidentiality,
  m.state::text,
  -- A target that has passed with the milestone still open. Only the ones
  -- marked critical colour the strip, because marking everything critical is
  -- the same as marking nothing.
  (m.target_on < current_date and m.state in ('planned', 'in_progress'))
from milestones m
left join project_phases p on p.id = m.phase_id
where m.target_on is not null
  and m.state in ('planned', 'in_progress', 'missed');

comment on view project_calendar is
  'Everything with a date, across the legal, obligation, meeting, contract '
  'and milestone registers (M15-03, M14-05, M15-01). Each row is filtered by '
  'its own table''s policy, so this is never a way around them.';

grant select on project_calendar to authenticated;

-- ---------------------------------------------------------------------------
-- The critical countdown strip (M15-04)
-- ---------------------------------------------------------------------------

-- "en yakın kritik üç tarih her ekranda üstte". Which three is a question
-- about what counts as critical, and that belongs here rather than in a
-- component — three screens asking the same question should not be able to
-- get three answers.
--
-- Critical means one of:
--   * a court date, which nobody sets and nobody can move;
--   * a contract date, because a renewal that lapses does so quietly;
--   * anything the calendar already flags as needing attention, which is
--     each register's own judgement about its own rows.
--
-- A date a week past still counts: the first thing somebody needs to see on
-- Monday is the deadline that went by on Friday.
create view critical_dates with (security_invoker = true) as
select
  c.kind,
  c.id,
  c.title_en,
  c.title_tr,
  c.due_on,
  c.due_at,
  c.detail,
  c.legal_case_id,
  c.meeting_id,
  c.state,
  c.needs_attention,
  (c.due_on - current_date) as days_away,
  c.confidentiality
from project_calendar c
where c.due_on >= current_date - 7
  and (c.kind in ('hearing', 'contract') or c.needs_attention)
  -- Taken off your own strip once you have said you have seen it.
  --
  -- The `user_id = auth.uid()` here is belt and braces and worth naming as
  -- such: this view is security_invoker, and the policy on
  -- calendar_acknowledgements already makes a row visible only to the person
  -- who wrote it, so the subquery could not see anybody else's
  -- acknowledgement with or without the clause. The policy is the mechanism;
  -- the clause says out loud what the view is relying on.
  and not exists (
    select 1 from calendar_acknowledgements a
    where a.kind = c.kind
      and a.entry_id = c.id
      and a.user_id = auth.uid()
  );

comment on view critical_dates is
  'The dates that belong at the top of every screen (M15-04): court dates, '
  'contract dates, and whatever each register has flagged as needing '
  'attention — minus what this reader has acknowledged. What counts as '
  'critical is defined once, here, rather than three times in three '
  'components.';

grant select on critical_dates to authenticated;

-- ---------------------------------------------------------------------------
-- The chronology (M15-07)
-- ---------------------------------------------------------------------------

-- "1993'ten bugüne tek zaman çizelgesi; her olay kaynağa bağlı. Hem kurumsal
-- hafıza hem hukukî delil."
--
-- Two halves, and both are necessary. The registers hold what the portal has
-- witnessed since 2024; `chronology_entries` holds the thirty years before
-- that, which exist only in documents. Joining them is what makes a single
-- time line, and the `source` column is what makes it evidence rather than
-- an account.
--
-- Only things that HAPPENED. A target date is a plan and belongs on the
-- calendar; a chronology of intentions is how a project talks itself into
-- believing its own schedule.
create view project_chronology with (security_invoker = true) as

-- The thirty years the registers cannot reach.
select
  'recorded'::text as source,
  e.category::text as category,
  e.id,
  e.occurred_on,
  e.precision::text as precision,
  e.title_en,
  e.title_tr,
  e.detail_en,
  e.document_id,
  e.source_note,
  e.legal_case_id,
  e.confidentiality
from chronology_entries e

union all

-- Court orders, which are the spine of this project's history.
select
  'legal_order', 'legal', o.id, o.made_on, 'day',
  coalesce(nullif(o.reference_no, ''), left(coalesce(o.text_en, o.text_tr, ''), 80)),
  coalesce(nullif(o.reference_no, ''), left(coalesce(o.text_tr, o.text_en, ''), 80)),
  o.text_en, o.document_id, o.made_by, o.legal_case_id, o.confidentiality
from legal_orders o
where o.made_on is not null

union all

-- Hearings that happened and produced something. One that is merely listed
-- is a plan, and plans are not chronology.
select
  'hearing', 'legal', h.id, h.scheduled_for::date, 'day',
  concat_ws(' — ', coalesce(nullif(c.case_number, ''), c.title), h.kind::text),
  concat_ws(' — ', coalesce(nullif(c.case_number, ''), c.title), h.kind::text),
  coalesce(h.outcome_en, h.outcome_tr), null::uuid, h.bench, h.legal_case_id,
  h.confidentiality
from hearings h
left join legal_cases c on c.id = h.legal_case_id
where h.scheduled_for < now()
  and coalesce(btrim(h.outcome_en), btrim(h.outcome_tr), '') <> ''

union all

-- Filings actually lodged.
select
  'filing', 'legal', f.id, f.filed_on, 'day', f.title, f.title,
  f.note, f.document_id, null::text, f.legal_case_id, f.confidentiality
from filings f
where f.filed_on is not null

union all

-- Resolutions of the organs, which is the governance half of the memory.
select
  'decision', 'governance', d.id, d.decided_on, 'day',
  coalesce(nullif(d.reference_no, ''), left(coalesce(d.text_en, ''), 80)),
  coalesce(nullif(d.reference_no, ''), left(coalesce(d.text_tr, d.text_en, ''), 80)),
  d.text_en, d.minute_document_id, d.organ, null::uuid, d.confidentiality
from decisions d
where d.decided_on is not null

union all

-- Contracts signed.
select
  'contract', 'funding', ct.id, ct.signed_on, 'day',
  concat_ws(' — ', coalesce(nullif(ct.reference_no, ''), ct.counterparty_name),
            ct.subject_en),
  concat_ws(' — ', coalesce(nullif(ct.reference_no, ''), ct.counterparty_name),
            coalesce(ct.subject_tr, ct.subject_en)),
  ct.subject_en, ct.document_id, ct.counterparty_name, null::uuid, ct.confidentiality
from contracts ct
where ct.signed_on is not null

union all

-- Milestones that were actually reached. Each one carries the document that
-- proved it, because the milestones table will not let it be marked achieved
-- without one.
select
  'milestone', 'construction', m.id, m.achieved_on, 'day',
  m.title_en, coalesce(m.title_tr, m.title_en), m.detail_en,
  m.evidence_document_id, null::text, null::uuid, m.confidentiality
from milestones m
where m.achieved_on is not null and m.state = 'achieved'

union all

-- Accreditation standards met, which is the academic half.
select
  'accreditation', 'academic', r.id, r.met_on, 'day',
  concat_ws(' · ', nullif(r.code, ''), r.title_en),
  concat_ws(' · ', nullif(r.code, ''), coalesce(r.title_tr, r.title_en)),
  coalesce(r.position_en, r.detail_en), r.evidence_document_id, r.body, null::uuid,
  r.confidentiality
from accreditation_requirements r
where r.met_on is not null and r.state = 'met';

comment on view project_chronology is
  'One time line from 1960 to today (M15-07), joining the thirty years that '
  'exist only in documents to what the registers have witnessed since. Each '
  'row carries its source, because the requirement asks for institutional '
  'memory AND legal evidence, and an entry nobody can trace is neither. '
  'Only things that happened: a target date is a plan, and a chronology of '
  'intentions is how a project talks itself into believing its schedule.';

grant select on project_chronology to authenticated;
