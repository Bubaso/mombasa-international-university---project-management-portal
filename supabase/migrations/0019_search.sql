-- One search box over the whole archive, and a separate, narrower door for
-- the model (M13-02, M13-03, M13-05, M13-06).
--
-- The reason M13 exists is in the requirement's own preamble: ten years of
-- bilingual material, thousands of pages, and the institutional memory of it
-- in one person's head. By the end of Faz 4 the portal holds that material in
-- nineteen registers and there is no way to ask it a question. Somebody
-- looking for the order that stopped the works has to know it is an order,
-- that orders live under a case, and which case.
--
-- So: nineteen registers normalised to one shape, and two functions over it.
--
--   search_records  — what the person may see. Security invoker, so each row
--                     arrived through the policy of its own table. A
--                     trustee's search reaches restricted material because a
--                     trustee may read it.
--
--   ai_context      — what a model may be handed. The same policies, plus an
--                     unconditional exclusion of `restricted` (M13-03).
--
-- Two doors rather than one function with a flag. A boolean parameter meaning
-- "include the restricted material" is a parameter somebody passes wrongly
-- once, and the failure mode of passing it wrongly is a leak. There is no
-- such parameter here: the exclusion is written into the body of the function
-- the assistant calls, and the assistant has no other route in. 0001 already
-- described the top tier of the classification as "named individuals only;
-- never external, never indexed", and this is the migration where the second
-- half of that sentence becomes true.
--
-- ---------------------------------------------------------------------------
-- Why the matching is precomputed and not indexed
-- ---------------------------------------------------------------------------
--
-- The obvious implementation is a GIN index on a tsvector. It does not work
-- here, and the reason is worth writing down because it looks like an
-- oversight.
--
-- Row level security adds its policy as a security barrier qual. A qual that
-- is not leakproof cannot be evaluated before that barrier, and therefore
-- cannot be used as an index condition — otherwise the index scan would see
-- rows the policy is meant to hide. The text search operator is not
-- leakproof:
--
--     select proleakproof from pg_proc where proname = 'ts_match_vq';   -- f
--
-- Measured on 3,000 meeting notes with a GIN index in place, the planner
-- ignored it and produced a sequential scan with the match as a filter.
-- Marking the operator leakproof requires superuser, which the migration role
-- on a hosted project does not have. So: no index, for any table carrying
-- RLS.
--
-- The alternative — a separate index table without RLS — was rejected. It can
-- be made fast, but it is a copy of the archive that the policies no longer
-- reach: either it is readable, in which case its tsvectors hand the lexemes
-- of a confidential minute to anybody who asks, or it is not readable, in
-- which case the function that reads it has to re-derive the access rule in a
-- second place. Neither is worth it for a project this size.
--
-- What is left is to make the scan cheap. Measured over 3,000 notes:
--
--     to_tsvector computed per row                     410 ms
--     the same match against a stored tsvector           2 ms
--
-- So the tsvectors are stored generated columns. Nothing is denormalised by
-- hand and nothing can drift: Postgres recomputes them on write, and the
-- generation expression is the single definition of what text of a record is
-- searchable. 0018 did the other half of the work — the policy evaluation
-- those 3,000 rows used to cost 4.3 seconds.
--
-- Requirements: M13-02, M13-03, M13-05, M13-06, M13-10, M13-11.

-- ---------------------------------------------------------------------------
-- Matching
-- ---------------------------------------------------------------------------

-- Joining the pieces of a record into one blob. Most registers here keep a
-- Turkish and an English column side by side and either may be empty, so the
-- nulls have to go; array_to_string drops them for free.
--
-- Declared immutable, which array_to_string(anyarray, text) is not: it is
-- only stable because an array of some other type could have a stable output
-- function. For text[] it is pure, and the declaration is what lets this be
-- used in a generated column.
create or replace function app.search_blob(variadic p_parts text[])
returns text
language sql
immutable
parallel safe
as $$
  select nullif(btrim(array_to_string(p_parts, E'\n')), '');
$$;

-- The same, for a text[] column. Two registers keep lists of their own —
-- a case's issues, a hearing's required documents — and those are worth
-- finding.
create or replace function app.search_list(p_items text[])
returns text
language sql
immutable
parallel safe
as $$
  select nullif(btrim(array_to_string(coalesce(p_items, '{}'::text[]), E'\n')), '');
$$;

-- Folding, for the matches stemming cannot make.
--
-- Two alphabets in one box, and lower() alone is not enough: in a
-- non-Turkish locale lower('İ') yields 'i' followed by a combining dot,
-- which then matches nothing. So the letters are mapped first and the case
-- dropped afterwards. This is plain translate() rather than the unaccent
-- extension on purpose — it is immutable without a wrapper, it needs no
-- extension installed, and the thirteen letters it folds are written down
-- here where somebody can check them.
create or replace function app.search_fold(p_text text)
returns text
language sql
immutable
parallel safe
as $$
  select lower(translate(coalesce(p_text, ''),
                         'ÇĞİIÖŞÜçğıöşü',
                         'cgiiosucgiosu'));
$$;

comment on function app.search_fold(text) is
  'Case- and diacritic-insensitive form of a string, for the TR/EN box '
  '(M13-06). translate() before lower(), because lower(''İ'') in a '
  'non-Turkish locale produces a combining dot and matches nothing.';

-- The same, plus LIKE's own metacharacters escaped, for the pattern side.
-- Without this, searching for "50%" matches every record in the archive.
create or replace function app.search_like(p_query text)
returns text
language sql
immutable
parallel safe
as $$
  select replace(replace(replace(app.search_fold(p_query),
    '\', '\\'), '%', '\%'), '_', '\_');
$$;

-- Does this record answer this query?
--
-- Three ways, OR-ed, because they fail in different places:
--
--   * Turkish stemming, so "duruşmalar" finds "duruşma".
--   * English stemming, so "hearings" finds "hearing".
--   * A folded literal substring, because stemming mangles ELC/134/2013 and
--     MN/I/5141 into nothing useful — and a case number or a plot number is
--     exactly what somebody types when they already know what they want. It
--     also means a partial word finds its record, which is what people
--     expect of a search box even though it is not what full text search
--     does.
--
-- The literal branch wants three characters rather than two. At two it does
-- more harm than good: "is" would match most of the archive as a substring,
-- while as a stop word it correctly matches nothing.
--
-- The cross-language part of M13-06 is worth stating honestly. A Turkish
-- query finds an English document because the records here carry both
-- languages in the same blob, not because anything translated the query. A
-- Turkish query will not find an English-only document that shares no
-- identifier with it. Translating the query is a model's job, and M13-07
-- gives the model a defined place to do it.
create or replace function app.search_matches(
  p_tr tsvector,
  p_en tsvector,
  p_document text,
  p_query text
)
returns boolean
language sql
immutable
parallel safe
as $$
  select length(btrim(coalesce(p_query, ''))) >= 2
    and (
      p_tr @@ websearch_to_tsquery('turkish', p_query)
      or p_en @@ websearch_to_tsquery('english', p_query)
      or (
        length(btrim(p_query)) >= 3
        and app.search_fold(coalesce(p_document, ''))
            like '%' || app.search_like(p_query) || '%'
      )
    );
$$;

comment on function app.search_matches(tsvector, tsvector, text, text) is
  'Turkish stemming, English stemming, or a folded literal substring. The '
  'third is not redundant: stemming destroys case numbers, which is what '
  'people actually type when they know what they are after.';

-- How well, for ordering.
--
-- The heading is ranked apart from the body, because a record whose title
-- contains what you typed is almost always the one you meant, and a record
-- that mentions it once in a long minute is almost never. Without that
-- separation every literal hit scores alike and the ordering collapses to
-- date.
create or replace function app.search_rank(
  p_heading text,
  p_tr tsvector,
  p_en tsvector,
  p_query text
)
returns real
language sql
immutable
parallel safe
as $$
  select (
    greatest(
      ts_rank(p_tr, websearch_to_tsquery('turkish', p_query)),
      ts_rank(p_en, websearch_to_tsquery('english', p_query))
    )
    + case
        when app.search_fold(coalesce(p_heading, ''))
             like '%' || app.search_like(p_query) || '%'
        then 1.0 else 0.0
      end
  )::real;
$$;

-- The matched part with its surrounding sentence, so a result list says why
-- each row is in it. Guillemets rather than HTML tags: the client renders
-- this as text and must not be handed markup it would have to trust.
create or replace function app.search_snippet(p_text text, p_query text)
returns text
language sql
stable
parallel safe
as $$
  select case
    when to_tsvector('turkish', coalesce(p_text, ''))
         @@ websearch_to_tsquery('turkish', p_query)
    then ts_headline('turkish', coalesce(p_text, ''),
           websearch_to_tsquery('turkish', p_query),
           'MaxWords=30, MinWords=12, MaxFragments=2, '
           'FragmentDelimiter= … , StartSel=«, StopSel=»')
    else ts_headline('english', coalesce(p_text, ''),
           websearch_to_tsquery('english', p_query),
           'MaxWords=30, MinWords=12, MaxFragments=2, '
           'FragmentDelimiter= … , StartSel=«, StopSel=»')
  end;
$$;

-- ---------------------------------------------------------------------------
-- What of each record is searchable
-- ---------------------------------------------------------------------------

-- Three generated columns per register. The text, so a result can show why it
-- matched and the assistant has something to read; and the two stemmed
-- vectors, so matching is a comparison rather than a tokenisation.
--
-- Only text columns go in. An enum cast to text is a stable operation, not an
-- immutable one, so Postgres refuses it in a generation expression — which is
-- no loss: a state or a category is something you filter by, not something
-- you search for.
create or replace function app.add_search_columns(p_table regclass, p_expr text)
returns void
language plpgsql
as $$
begin
  -- The expression is repeated rather than referenced, because a generated
  -- column may not read another generated column.
  execute format($f$
    alter table %1$s
      add column search_document text
        generated always as (%2$s) stored,
      add column search_tr tsvector
        generated always as (to_tsvector('turkish', coalesce(%2$s, ''))) stored,
      add column search_en tsvector
        generated always as (to_tsvector('english', coalesce(%2$s, ''))) stored;
  $f$, p_table, p_expr);
end;
$$;

-- The legal register, which is the archive this module is really about.
select app.add_search_columns('legal_cases', $e$
  app.search_blob(title, case_number, court, description_en, description_tr,
                  app.search_list(key_issues), case_type, current_status, priority)
$e$);

select app.add_search_columns('legal_orders', $e$
  app.search_blob(reference_no, made_by, text_en, text_tr)
$e$);

-- M13-08 leans on this one existing. When somebody asks the assistant a legal
-- question it has to point at the opinion that was actually given, which
-- means the opinions have to be findable.
select app.add_search_columns('legal_opinions', $e$
  app.search_blob(question, conclusion, given_by_name)
$e$);

select app.add_search_columns('hearings', $e$
  app.search_blob(bench, courtroom, outcome_en, outcome_tr,
                  app.search_list(required_documents))
$e$);

select app.add_search_columns('filings', $e$
  app.search_blob(title, note)
$e$);

-- The vault holds titles and descriptions, not extracted text: nothing in
-- this portal reads a PDF. So a document is findable by what somebody wrote
-- about it. The file name would help — it is often the only thing anybody
-- remembers — but it lives on the version row, and a generated column cannot
-- reach another table.
select app.add_search_columns('document_vault', $e$
  app.search_blob(title, description_en, description_tr)
$e$);

select app.add_search_columns('stakeholders', $e$
  app.search_blob(full_name, title, interest_topic, notes, location, email, phone)
$e$);

select app.add_search_columns('meetings', $e$
  app.search_blob(title, location)
$e$);

-- The minutes themselves: the largest body of text in the portal, and the one
-- a question is most often really about.
select app.add_search_columns('meeting_notes', $e$
  app.search_blob(body)
$e$);

select app.add_search_columns('decisions', $e$
  app.search_blob(reference_no, organ, text_en, text_tr, rationale_en, rationale_tr)
$e$);

select app.add_search_columns('action_items', $e$
  app.search_blob(text_en, text_tr, completion_note)
$e$);

select app.add_search_columns('open_questions', $e$
  app.search_blob(question_en, question_tr, detail_en, detail_tr, answer_en, answer_tr)
$e$);

select app.add_search_columns('obligations', $e$
  app.search_blob(title_en, title_tr, detail_en, detail_tr,
                  obligor_name, beneficiary_name)
$e$);

select app.add_search_columns('financial_transactions', $e$
  app.search_blob(reference_no, description, payee, category, external_reference)
$e$);

select app.add_search_columns('risks', $e$
  app.search_blob(title_en, title_tr, detail_en, detail_tr,
                  response_plan_en, response_plan_tr,
                  trigger_en, trigger_tr,
                  early_warning_en, early_warning_tr)
$e$);

select app.add_search_columns('issues', $e$
  app.search_blob(title_en, title_tr, detail_en, detail_tr,
                  resolution_en, resolution_tr)
$e$);

select app.add_search_columns('assumptions', $e$
  app.search_blob(statement_en, statement_tr, note)
$e$);

select app.add_search_columns('construction_blocks', $e$
  app.search_blob(code, name, purpose_en, purpose_tr)
$e$);

select app.add_search_columns('site_tasks', $e$
  app.search_blob(title_en, title_tr, legal_basis_en, legal_basis_tr)
$e$);

-- ---------------------------------------------------------------------------
-- The registers, normalised
-- ---------------------------------------------------------------------------

create type search_kind as enum (
  'legal_case',
  'legal_order',
  'legal_opinion',
  'hearing',
  'filing',
  'document',
  'stakeholder',
  'meeting',
  'meeting_note',
  'decision',
  'action_item',
  'open_question',
  'obligation',
  'transaction',
  'risk',
  'issue',
  'assumption',
  'block',
  'site_task'
);

comment on type search_kind is
  'Which register a search result came out of (M13-05). The client maps it to '
  'a screen; the database keeps no route of its own.';

-- Every join below is a LEFT join, and that is not stylistic. These joins
-- reach parent rows for context — a case number, a meeting title — and the
-- parent carries its own policies. An inner join would make a child record
-- vanish from search whenever its parent happened to be invisible, which is a
-- different access rule from the one on the child, arrived at by accident.
--
-- Note what the joins are and are not for. `subtitle` locates a result for
-- the reader; it is not matched against. What is matched is the record's own
-- `search_document`, because that is the column the stemmed vectors were
-- built from. So searching a case number finds the case, not its hearings —
-- and the case is the way to its hearings.
create view searchable with (security_invoker = true) as
select
  r.*,
  app.search_blob(r.title_en, r.title_tr) as heading
from (

  select
    'legal_case'::search_kind as kind,
    c.id as id,
    c.title as title_en,
    null::text as title_tr,
    concat_ws(' · ', nullif(c.case_number, ''), nullif(c.court, ''),
              nullif(c.current_status, '')) as subtitle,
    c.filing_date as occurred_on,
    c.confidentiality as confidentiality,
    null::search_kind as parent_kind,
    null::uuid as parent_id,
    c.search_document as document,
    c.search_tr as search_tr,
    c.search_en as search_en
  from legal_cases c

  union all

  select
    'legal_order'::search_kind,
    o.id,
    coalesce(nullif(o.reference_no, ''), left(coalesce(o.text_en, o.text_tr, ''), 120)),
    null,
    concat_ws(' · ', nullif(c.case_number, ''), nullif(o.made_by, ''), o.state::text),
    o.made_on,
    o.confidentiality,
    'legal_case'::search_kind,
    o.legal_case_id,
    o.search_document, o.search_tr, o.search_en
  from legal_orders o
  left join legal_cases c on c.id = o.legal_case_id

  union all

  select
    'legal_opinion'::search_kind,
    p.id,
    p.question,
    null,
    concat_ws(' · ', nullif(c.case_number, ''),
              coalesce(nullif(p.given_by_name, ''), s.full_name)),
    p.given_on,
    p.confidentiality,
    'legal_case'::search_kind,
    p.legal_case_id,
    p.search_document, p.search_tr, p.search_en
  from legal_opinions p
  left join legal_cases c on c.id = p.legal_case_id
  left join stakeholders s on s.id = p.given_by_stakeholder_id

  union all

  select
    'hearing'::search_kind,
    h.id,
    concat_ws(' — ', coalesce(nullif(c.case_number, ''), c.title),
              to_char(h.scheduled_for, 'YYYY-MM-DD')),
    null,
    concat_ws(' · ', h.kind::text, nullif(h.bench, ''), nullif(h.courtroom, ''),
              h.preparation::text),
    h.scheduled_for::date,
    h.confidentiality,
    'legal_case'::search_kind,
    h.legal_case_id,
    h.search_document, h.search_tr, h.search_en
  from hearings h
  left join legal_cases c on c.id = h.legal_case_id

  union all

  select
    'filing'::search_kind,
    f.id,
    f.title,
    null,
    concat_ws(' · ', nullif(c.case_number, ''), f.kind::text, f.state::text),
    coalesce(f.filed_on, f.due_on),
    f.confidentiality,
    'legal_case'::search_kind,
    f.legal_case_id,
    f.search_document, f.search_tr, f.search_en
  from filings f
  left join legal_cases c on c.id = f.legal_case_id

  union all

  select
    'document'::search_kind,
    d.id,
    d.title,
    null,
    concat_ws(' · ', d.category::text, nullif(v.file_name, '')),
    d.created_at::date,
    d.confidentiality,
    null::search_kind,
    null::uuid,
    d.search_document, d.search_tr, d.search_en
  from document_vault d
  left join document_versions v on v.id = d.current_version_id

  union all

  select
    'stakeholder'::search_kind,
    s.id,
    s.full_name,
    null,
    concat_ws(' · ', nullif(s.title, ''), nullif(o.name, ''), nullif(s.location, '')),
    null::date,
    s.confidentiality,
    null::search_kind,
    null::uuid,
    s.search_document, s.search_tr, s.search_en
  from stakeholders s
  left join organizations o on o.id = s.organization_id

  union all

  select
    'meeting'::search_kind,
    m.id,
    m.title,
    null,
    concat_ws(' · ', m.kind::text, nullif(m.location, ''), m.minutes_status::text),
    m.held_at::date,
    m.confidentiality,
    null::search_kind,
    null::uuid,
    m.search_document, m.search_tr, m.search_en
  from meetings m

  union all

  select
    'meeting_note'::search_kind,
    n.id,
    m.title,
    null,
    concat_ws(' · ', n.section::text, n.language::text,
              case when n.is_machine_translation then 'machine translation' end),
    m.held_at::date,
    n.confidentiality,
    'meeting'::search_kind,
    n.meeting_id,
    n.search_document, n.search_tr, n.search_en
  from meeting_notes n
  left join meetings m on m.id = n.meeting_id

  union all

  select
    'decision'::search_kind,
    d.id,
    d.text_en,
    d.text_tr,
    concat_ws(' · ', nullif(d.reference_no, ''), nullif(d.organ, ''),
              d.status::text, d.vote::text),
    coalesce(d.decided_on, m.held_at::date),
    d.confidentiality,
    'meeting'::search_kind,
    d.meeting_id,
    d.search_document, d.search_tr, d.search_en
  from decisions d
  left join meetings m on m.id = d.meeting_id

  union all

  select
    'action_item'::search_kind,
    a.id,
    a.text_en,
    a.text_tr,
    concat_ws(' · ', a.status::text, a.priority::text,
              coalesce(pr.full_name, st.full_name)),
    a.due_date,
    a.confidentiality,
    'meeting'::search_kind,
    a.meeting_id,
    a.search_document, a.search_tr, a.search_en
  from action_items a
  left join profiles pr on pr.id = a.owner_profile_id
  left join stakeholders st on st.id = a.owner_stakeholder_id

  union all

  select
    'open_question'::search_kind,
    q.id,
    q.question_en,
    q.question_tr,
    concat_ws(' · ', q.status::text),
    coalesce(q.target_resolution_date, q.created_at::date),
    q.confidentiality,
    'meeting'::search_kind,
    q.meeting_id,
    q.search_document, q.search_tr, q.search_en
  from open_questions q

  union all

  select
    'obligation'::search_kind,
    ob.id,
    ob.title_en,
    ob.title_tr,
    concat_ws(' · ', ob.source::text, ob.state::text,
              nullif(ob.obligor_name, ''), nullif(ob.beneficiary_name, '')),
    ob.due_on,
    ob.confidentiality,
    null::search_kind,
    null::uuid,
    ob.search_document, ob.search_tr, ob.search_en
  from obligations ob

  union all

  select
    'transaction'::search_kind,
    t.id,
    concat_ws(' — ', nullif(t.reference_no, ''), nullif(t.payee, '')),
    null,
    concat_ws(' · ', nullif(t.category, ''),
              trim(to_char(t.amount, 'FM999999999990.00')) || ' ' || t.currency::text),
    t.date,
    t.confidentiality,
    null::search_kind,
    null::uuid,
    t.search_document, t.search_tr, t.search_en
  from financial_transactions t

  union all

  select
    'risk'::search_kind,
    rk.id,
    rk.title_en,
    rk.title_tr,
    concat_ws(' · ', rk.category::text, rk.state::text, 'score ' || rk.score),
    rk.review_on,
    rk.confidentiality,
    null::search_kind,
    null::uuid,
    rk.search_document, rk.search_tr, rk.search_en
  from risks rk

  union all

  select
    'issue'::search_kind,
    i.id,
    i.title_en,
    i.title_tr,
    concat_ws(' · ', i.category::text, 'severity ' || i.severity, i.state::text),
    coalesce(i.opened_on, i.created_at::date),
    i.confidentiality,
    null::search_kind,
    null::uuid,
    i.search_document, i.search_tr, i.search_en
  from issues i

  union all

  select
    'assumption'::search_kind,
    asm.id,
    asm.statement_en,
    asm.statement_tr,
    concat_ws(' · ', asm.risk_category::text, asm.state::text),
    coalesce(asm.last_checked_on, asm.review_on),
    asm.confidentiality,
    null::search_kind,
    null::uuid,
    asm.search_document, asm.search_tr, asm.search_en
  from assumptions asm

  union all

  select
    'block'::search_kind,
    b.id,
    concat_ws(' — ', nullif(b.code, ''), nullif(b.name, '')),
    null,
    concat_ws(' · ', b.state::text, nullif(ct.name, '')),
    b.started_on,
    b.confidentiality,
    null::search_kind,
    null::uuid,
    b.search_document, b.search_tr, b.search_en
  from construction_blocks b
  left join contractors ct on ct.id = b.contractor_id

  union all

  select
    'site_task'::search_kind,
    tk.id,
    tk.title_en,
    tk.title_tr,
    concat_ws(' · ', tk.kind::text, tk.state::text),
    tk.planned_start,
    tk.confidentiality,
    null::search_kind,
    null::uuid,
    tk.search_document, tk.search_tr, tk.search_en
  from site_tasks tk

) r;

comment on view searchable is
  'Nineteen registers normalised to one shape, for the single search box of '
  'M13-05. security_invoker, so every row arrived through the policy of its '
  'own table — this view adds no access rule and needs none. Every join to a '
  'parent is a LEFT join on purpose: a child must not vanish from search '
  'because its parent is invisible.';

-- ---------------------------------------------------------------------------
-- The two doors
-- ---------------------------------------------------------------------------

-- What the person may see.
--
-- security invoker is the default for a function and is written out here
-- because it is the whole mechanism: the policies on nineteen tables decide
-- what comes back, and this function decides nothing. A trustee's search
-- reaches restricted material because a trustee may read it; a contractor's
-- reaches their own block and nothing else.
create or replace function public.search_records(
  p_query text,
  p_kinds search_kind[] default null,
  p_limit int default 30
)
returns table (
  kind search_kind,
  id uuid,
  title_en text,
  title_tr text,
  subtitle text,
  snippet text,
  occurred_on date,
  confidentiality confidentiality,
  parent_kind search_kind,
  parent_id uuid,
  rank real
)
language sql
stable
security invoker
set search_path = public, app, pg_temp
as $$
  -- Two steps so that ts_headline runs on the thirty rows that come back
  -- rather than on every match: it has to tokenise the whole document, which
  -- is the one expensive thing left in this query. Ranking stays inside,
  -- where the ordering happens, because it reads the stored vectors and
  -- tokenises nothing.
  --
  -- Measured over 4,542 records: 330 ms of it is the policies on nineteen
  -- tables, which 0018 brought down from 5.1 s; the matching itself is 15 ms;
  -- the rest is detoasting the documents the sort carries. Driving that last
  -- part down means not carrying the text through the sort at all, which
  -- costs a second mapping from kind to table — not worth it at this size.
  with hit as materialized (
    select
      s.kind, s.id, s.title_en, s.title_tr, s.subtitle, s.document,
      s.occurred_on, s.confidentiality, s.parent_kind, s.parent_id,
      app.search_rank(s.heading, s.search_tr, s.search_en, p_query) as rank
    from searchable s
    where app.search_matches(s.search_tr, s.search_en, s.document, p_query)
      and (p_kinds is null or s.kind = any (p_kinds))
    order by
      app.search_rank(s.heading, s.search_tr, s.search_en, p_query) desc,
      s.occurred_on desc nulls last
    limit least(greatest(coalesce(p_limit, 30), 1), 200)
  )
  select
    h.kind, h.id, h.title_en, h.title_tr, h.subtitle,
    app.search_snippet(h.document, p_query),
    h.occurred_on, h.confidentiality, h.parent_kind, h.parent_id, h.rank
  from hit h
  order by h.rank desc, h.occurred_on desc nulls last;
$$;

comment on function public.search_records(text, search_kind[], int) is
  'The global search of M13-05, across nineteen registers in Turkish and '
  'English (M13-06). Security invoker: the policies filter it, not this '
  'function. May return restricted rows to a caller cleared for them — '
  'ai_context is the door that may not.';

-- What a model may be handed.
--
-- The same policies, because this is also security invoker, plus one more
-- condition that no caller can turn off. That is M13-03, and the shape
-- matters as much as the condition: there is no parameter here to get wrong,
-- and the assistant has no other query to run. Even an admin — who may read
-- restricted material on their own screen all day — cannot get it into a
-- prompt through this function, because the exclusion is about where the text
-- is going, not about who is asking.
--
-- `confidentiality` is still returned. The caller needs it: a citation to a
-- confidential minute has to be labelled as one in the answer (M13-04).
create or replace function public.ai_context(
  p_query text,
  p_limit int default 10
)
returns table (
  kind search_kind,
  id uuid,
  title_en text,
  title_tr text,
  subtitle text,
  body text,
  occurred_on date,
  confidentiality confidentiality
)
language sql
stable
security invoker
set search_path = public, app, pg_temp
as $$
  -- Same two-step as search_records, for the same reason: the body is only
  -- fetched for the handful of records that actually go into the prompt.
  with hit as materialized (
    select
      s.kind, s.id, s.title_en, s.title_tr, s.subtitle, s.document,
      s.occurred_on, s.confidentiality,
      app.search_rank(s.heading, s.search_tr, s.search_en, p_query) as rank
    from searchable s
    where app.search_matches(s.search_tr, s.search_en, s.document, p_query)
      and s.confidentiality <> 'restricted'
    order by
      app.search_rank(s.heading, s.search_tr, s.search_en, p_query) desc,
      s.occurred_on desc nulls last
    limit least(greatest(coalesce(p_limit, 10), 1), 40)
  )
  select
    h.kind, h.id, h.title_en, h.title_tr, h.subtitle,
    left(h.document, 4000),
    h.occurred_on, h.confidentiality
  from hit h
  order by h.rank desc, h.occurred_on desc nulls last;
$$;

comment on function public.ai_context(text, int) is
  'Retrieval for the assistant (M13-02, M13-03). Security invoker, so the '
  'caller''s own policies apply, AND `restricted` is excluded '
  'unconditionally — no parameter, no default, no way for a caller to ask '
  'for it. 0001 described the top tier as "never indexed"; this is where '
  'that holds.';

-- ---------------------------------------------------------------------------
-- Who asked what (M13-10)
-- ---------------------------------------------------------------------------

-- The five uses the requirement allows, and no sixth. The enum is the
-- enforcement point: the assistant takes a task name, not a prompt, so there
-- is no free-text instruction for a caller to supply and nothing to smuggle a
-- sixth use in through.
create type ai_task as enum (
  'archive_question',   -- (a) question and answer over the archive
  'meeting_minutes',    -- (b) notes into structured minutes
  'translation',        -- (c) a TR↔EN suggestion
  'weekly_digest',      -- (d) a draft weekly summary
  'document_summary'    -- (e) a long document, shortened
);

comment on type ai_task is
  'The five defined uses of M13-07. A closed list, because the alternative is '
  'a general purpose chatbot sitting on a confidential archive.';

create table ai_queries (
  id uuid primary key default gen_random_uuid(),
  asked_by uuid not null references profiles (id) default auth.uid(),
  task ai_task not null,
  question text not null,
  -- How many records the answer rested on. Zero is the interesting number:
  -- M13-04 says an answer without sources is not produced, so a zero here
  -- with `refusal` filled in is the system working.
  source_count int not null default 0 check (source_count >= 0),
  refusal text,
  model text,
  asked_at timestamptz not null default now()
);

comment on table ai_queries is
  'Who asked the assistant what (M13-10), for audit and for cost. '
  'Append-only: a usage log that can be edited is not a usage log.';

alter table ai_queries enable row level security;
alter table ai_queries force row level security;

-- Your own questions, always. An admin and the auditors see everybody's,
-- because that is what the requirement asks the log for.
create policy ai_queries_read on ai_queries for select to authenticated
  using (
    asked_by = auth.uid()
    or app.acts_as('admin', 'audit_committee', 'external_auditor')
  );

create policy ai_queries_write on ai_queries for insert to authenticated
  with check (asked_by = auth.uid());

create trigger ai_queries_append_only
  before update or delete on ai_queries
  for each row execute function app.refuse_audit_mutation();

-- The trigger refuses, and the privilege is withdrawn as well. 0003 grants
-- update and delete on every new table in this schema by default, and a
-- refusal that depends on a trigger still being attached is weaker than one
-- where the permission does not exist.
revoke update, delete on ai_queries from authenticated;

-- ---------------------------------------------------------------------------
-- Saved searches (M13-11)
-- ---------------------------------------------------------------------------

create table saved_searches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles (id) default auth.uid(),
  name text not null check (btrim(name) <> ''),
  query text not null check (btrim(query) <> ''),
  kinds search_kind[],
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

comment on table saved_searches is
  'A search somebody runs often, kept (M13-11). Private to its owner: what '
  'you look for says something, and an admin does not need it.';

alter table saved_searches enable row level security;
alter table saved_searches force row level security;

-- No admin override here, and that is deliberate. The other registers in this
-- portal are institutional records; a saved search is not. What somebody
-- repeatedly looks for is about them, and nobody else has business reading
-- it.
create policy saved_searches_own on saved_searches for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select on searchable to authenticated;
grant execute on all functions in schema app to authenticated;
