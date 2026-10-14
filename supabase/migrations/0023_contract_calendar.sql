-- Contract dates on the project calendar (M14-05).
--
-- 0022 could not do this itself. `calendar_kind` needed a new value and
-- Postgres refuses to use a new enum value in the transaction that created
-- it, which is what each migration file is. So the value was added at the end
-- of 0022 and this file is where it gets used — a mechanical split, not an
-- editorial one.
--
-- The view is restated in full because `create or replace view` has to see
-- the whole definition; the only change is the branch at the end. The rest is
-- 0011's, unchanged.
--
-- Requirements: M14-05, and the data behind M15-03.

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
  and d.due_on is not null;

comment on view project_calendar is
  'Everything with a date, across the legal, obligation, meeting and '
  'contract registers (M15-03, M14-05). Each row is filtered by its own '
  'table''s policy, so this is never a way around them. A contract '
  'contributes up to two rows — the renewal decision and the end — because '
  'they are two different things to do and the first one is the one that '
  'gets missed.';

grant select on project_calendar to authenticated;
