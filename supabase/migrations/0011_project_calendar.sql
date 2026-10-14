-- One calendar across everything that has a date (M15-03, M15-04).
--
-- By now the portal holds five separate things that come due: a court
-- hearing, a procedural filing deadline, an obligation from the lease or an
-- order, an action somebody undertook, and a question that was supposed to
-- have an answer by now. Each lives in its own register for good reasons, and
-- nobody plans a week by opening five screens.
--
-- So this is one view over all of them. It is a view and not a table on
-- purpose: nothing here is a new fact, and a copy of a date is a date that
-- can disagree with the one it was copied from.
--
-- security_invoker means each row is filtered by its own table's policy, so
-- an advocate sees their own hearings and their own obligations and nothing
-- else — the calendar cannot become a way around the registers it reads.

create type calendar_kind as enum (
  'hearing',
  'filing',
  'obligation',
  'action',
  'question',
  'meeting'
);

create view project_calendar with (security_invoker = true) as

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
  and m.status in ('planned', 'in_progress');

comment on view project_calendar is
  'Everything with a date, across the legal, obligation and meeting '
  'registers (M15-03). Each row is filtered by its own table''s policy, so '
  'this is never a way around them.';

grant select on project_calendar to authenticated;
