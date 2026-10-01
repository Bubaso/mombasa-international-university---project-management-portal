-- A reference number is a label, not an event (M15-07).
--
-- Found by putting the real archive on the screen. The chronology's own
-- entries read as sentences, but a court order and a board resolution were
-- rendered as `coalesce(reference_no, the text)` — so the moment somebody
-- numbered a resolution, the time line stopped saying what was decided:
--
--   before   BoT-2026-04-21-1
--   after    BoT-2026-04-21-1 — Construction continues, and the first phase
--                               is to be completed by December 2026.
--
-- The coalesce was the wrong operator. A reference number identifies a
-- record; it does not describe one, and preferring it hid the only part a
-- reader of a chronology wants. The contract branch two unions below already
-- did this correctly with concat_ws, which is what both now use: the number
-- when there is one, then the text, and the text alone when there is not.
--
-- A view with a UNION ALL cannot be patched in place, so it is restated whole
-- and the only changes are the four lines above.

drop view if exists project_chronology;

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
  concat_ws(' — ', nullif(o.reference_no, ''), left(coalesce(o.text_en, o.text_tr, ''), 80)),
  concat_ws(' — ', nullif(o.reference_no, ''), left(coalesce(o.text_tr, o.text_en, ''), 80)),
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
  concat_ws(' — ', nullif(d.reference_no, ''), left(coalesce(d.text_en, ''), 80)),
  concat_ws(' — ', nullif(d.reference_no, ''), left(coalesce(d.text_tr, d.text_en, ''), 80)),
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
where r.met_on is not null and r.state = 'met';;

comment on view project_chronology is
  'One time line from 1960 to today (M15-07), joining the thirty years that '
  'exist only in documents to what the registers have witnessed since. Each '
  'row carries its source, because the requirement asks for institutional '
  'memory AND legal evidence, and an entry nobody can trace is neither. '
  'Only things that happened: a target date is a plan, and a chronology of '
  'intentions is how a project talks itself into believing its schedule.';

grant select on project_chronology to authenticated;
