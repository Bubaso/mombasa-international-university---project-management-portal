-- Compiled reports (M12-06 … M12-09).
--
-- The success criterion the requirement sets for this module is a time:
-- "Mütevelli toplantı dosyasının hazırlanma süresi < 10 dakika (bugün:
-- saatler)". Hours, because somebody reads six registers and retypes the
-- numbers into a document. Every retyped number is a number that can be
-- wrong, and the second criterion is the one that says so: "Kaynağa
-- bağlanmamış maddi rakam: 0."
--
-- So a report here is not a document. It is a compilation, in SQL, where each
-- row carries the register it came from. Four decisions follow from that:
--
--   1. COMPILED UNDER THE READER'S OWN VISIBILITY. Every function below is
--      security invoker, so a board pack compiled by a trustee holds what a
--      trustee may see and the same call by the site team holds less. A
--      compiler that ran as the owner and then filtered would be one bug away
--      from putting restricted material in a document that leaves the room.
--
--   2. THE AUDIENCE NARROWS FURTHER. A donor report is not a trustee report
--      with sections hidden: the donor's own money, and otherwise only what
--      the project has published. Drawn in SQL for the same reason as the
--      weekly digest — a section hidden by the client is a section one bug
--      away from showing.
--
--   3. APPROVAL FREEZES THE FIGURES. M8-12 requires a donor report to be
--      approved before it is published. An approval that does not fix what
--      was approved is a signature on a moving document, so the compiled rows
--      are stored and become immutable at approval. What is published is what
--      was approved, and not whatever the registers say this morning.
--
--   4. ONE SHAPE FOR EVERY REPORT. Section, order, label, value, source. The
--      periodic report of M12-08 and the arbitrary date range of M12-09 are
--      the same function with different arguments, and saying so is better
--      than writing it twice and letting the two drift.
--
-- What this does NOT do is generate a PDF or a .docx. There is no document
-- generator in this project and claiming one would be the same class of
-- defect as the vault's old "SHA-256 verified": the client offers the
-- browser's own print-to-PDF, which really does produce a PDF, and a
-- Markdown download, which really does open in Word.

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
-- The run
-- ---------------------------------------------------------------------------

create type report_kind as enum (
  'board_pack',
  'donor_report',
  'status_report'
);

create type report_state as enum ('draft', 'approved', 'published', 'withdrawn');

create table report_runs (
  id uuid primary key default gen_random_uuid(),
  kind report_kind not null,
  title text not null,
  -- The period a status report covers. M12-09's "arbitrary date range" is
  -- these two columns and nothing else.
  period_from date,
  period_to date,
  -- What it is about, depending on the kind.
  meeting_id uuid references meetings (id) on delete set null,
  stakeholder_id uuid references stakeholders (id) on delete set null,

  prepared_by uuid references profiles (id) default auth.uid(),
  prepared_at timestamptz not null default now(),
  state report_state not null default 'draft',
  approved_by uuid references profiles (id),
  approved_at timestamptz,
  published_at timestamptz,
  withdrawn_reason text,

  -- The compiled rows, as they stood when the report was taken. This is the
  -- document: approval attaches to it and not to the registers underneath.
  content jsonb,

  constraint report_runs_title_not_blank check (btrim(title) <> ''),
  -- An approval has a name and a time on it, or it has not happened.
  constraint report_runs_approval_is_attributed
    check ((approved_by is null) = (approved_at is null)),
  constraint report_runs_approved_states
    check (state in ('draft', 'withdrawn') or approved_at is not null),
  constraint report_runs_published_was_approved
    check (published_at is null or approved_at is not null),
  constraint report_runs_published_state
    check ((state = 'published') = (published_at is not null)),
  constraint report_runs_withdrawal_is_reasoned
    check (state <> 'withdrawn' or btrim(coalesce(withdrawn_reason, '')) <> ''),
  -- A period that runs backwards is a parameter mistake, and a report
  -- compiled from one would be empty for a reason nobody could see.
  constraint report_runs_period_runs_forwards
    check (period_from is null or period_to is null or period_from <= period_to),
  -- Each kind is about one thing.
  constraint report_runs_board_pack_has_a_meeting
    check (kind <> 'board_pack' or meeting_id is not null),
  constraint report_runs_donor_report_has_a_donor
    check (kind <> 'donor_report' or stakeholder_id is not null),
  constraint report_runs_status_report_has_a_period
    check (kind <> 'status_report' or (period_from is not null and period_to is not null))
);
select app.add_common_columns('report_runs');

create index report_runs_kind_idx on report_runs (kind, prepared_at desc);

-- Who may approve one for publication. The same band that signs a resolution
-- and awards a contract: a report that leaves the trust is the trust
-- speaking.
create or replace function app.can_approve_report()
returns boolean
language sql
stable
as $$
  select app.acts_as('admin', 'project_director', 'trustee', 'board_director');
$$;

-- ---------------------------------------------------------------------------
-- Approval freezes it
-- ---------------------------------------------------------------------------

create or replace function app.refuse_approved_report_edit()
returns trigger
language plpgsql
as $$
begin
  if old.state in ('approved', 'published') then
    if new.content is distinct from old.content
       or new.period_from is distinct from old.period_from
       or new.period_to is distinct from old.period_to
       or new.meeting_id is distinct from old.meeting_id
       or new.stakeholder_id is distinct from old.stakeholder_id
       or new.kind is distinct from old.kind then
      raise exception
        'this report has been approved; recompile it as a new one rather than '
        'changing the figures somebody signed'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- An approval is a person and a moment, and neither is the client's to
  -- supply: public.approve_report sets both.
  if new.approved_at is distinct from old.approved_at
     and new.approved_by is distinct from coalesce(old.approved_by, auth.uid()) then
    raise exception 'an approval carries the name of whoever gave it'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger report_runs_approved_is_frozen
  before update on report_runs
  for each row execute function app.refuse_approved_report_edit();

-- "Is this report about me?" is a question about identity, not about whether
-- the asker may read the stakeholder register — and a donor may not. Without
-- this helper the policy below checks the link through a subquery that the
-- donor's own policies filter out, so a donor could not see their own
-- published account and the one rule M8-12 is about would fail silently.
-- Security definer for the same reason as app.addressed_to_me in 0027: it
-- answers one question and nothing wider than the policy would have asked.
create or replace function app.is_the_stakeholder(p_stakeholder uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from stakeholders s
    where s.id = p_stakeholder and s.profile_id = auth.uid()
  );
$$;

alter table report_runs enable row level security;
alter table report_runs force row level security;

-- A report is readable by whoever may read at its tier — and a donor report
-- is readable by the donor it is about, which is the whole point of M8-12.
create policy report_runs_read on report_runs
  for select using (
    app.can_read(confidentiality, 'report_runs', id)
    and (
      app.is_internal()
      or prepared_by = auth.uid()
      or (kind = 'donor_report' and state = 'published'
          and app.is_the_stakeholder(stakeholder_id))
      or app.has_grant('report_runs', id, 'read')
    )
  );

create policy report_runs_insert on report_runs
  for insert with check (app.can_read(confidentiality) and app.is_internal());

create policy report_runs_update on report_runs
  for update
  using (
    app.can_read(confidentiality, 'report_runs', id)
    and (prepared_by = auth.uid() or app.can_approve_report())
  )
  with check (app.is_internal());

-- ---------------------------------------------------------------------------
-- One shape for every report
-- ---------------------------------------------------------------------------
--
-- value_text and value_number are separate on purpose. A figure that arrives
-- as text cannot be totalled, compared or charted, and a number formatted
-- into a sentence is a number nobody can check. Where a row has both, the
-- text is the wording and the number is the quantity.
--
-- source_note is not decoration. The requirement's measure is "Kaynağa
-- bağlanmamış maddi rakam: 0" — no material figure without its source — and
-- this column is how that is met: every row says which register it came out
-- of, so a reader can go and look.

create type report_row as (
  section text,
  ord int,
  label_en text,
  label_tr text,
  value_text text,
  value_number numeric,
  unit text,
  entity_kind text,
  entity_id text,
  source_note text,
  confidentiality confidentiality
);

-- ---------------------------------------------------------------------------
-- The board pack (M12-06, M3-13)
-- ---------------------------------------------------------------------------
--
-- "gündem, açık aksiyonlar, mali özet, hukukî durum, riskler, karar
-- taslakları" — the six sections the requirement lists, in that order.

create or replace function public.board_pack(p_meeting uuid)
returns setof report_row
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  -- 1. Which meeting this is for.
  select
    'meeting', 0,
    coalesce(m.title, '(untitled)'), coalesce(m.title_tr, m.title),
    concat_ws(' · ', to_char(m.held_at, 'DD Mon YYYY HH24:MI'), m.location, m.kind::text),
    null::numeric, null,
    'meeting', m.id::text,
    'meetings',
    m.confidentiality
  from meetings m
  where m.id = p_meeting

  union all

  -- 2. The agenda, built from what is still open rather than typed (M3-07).
  select
    'agenda', row_number() over (order by a.overdue desc, a.due_on nulls last),
    coalesce(a.text_en, a.text_tr), coalesce(a.text_tr, a.text_en),
    concat_ws(' · ', a.item_kind, a.status::text,
              case when a.overdue then 'overdue' else null end),
    null::numeric, null,
    a.item_kind, a.id::text,
    'meeting_agenda_candidates',
    a.confidentiality
  from meeting_agenda_candidates a

  union all

  -- 3. The money. Totals only: a board pack is not the ledger.
  select
    'money', 1, 'Budget', 'Bütçe', null, sum(b.budget_kes), 'KES',
    null, null, 'budget_position', max(b.confidentiality)
  from budget_position b
  having sum(b.budget_kes) is not null

  union all
  select
    'money', 2, 'Committed', 'Taahhüt edilen', null, sum(b.committed_kes), 'KES',
    null, null, 'budget_position', max(b.confidentiality)
  from budget_position b
  having sum(b.committed_kes) is not null

  union all
  select
    'money', 3, 'Spent', 'Harcanan', null, sum(b.spent_kes), 'KES',
    null, null, 'budget_position', max(b.confidentiality)
  from budget_position b
  having sum(b.spent_kes) is not null

  union all
  select
    'money', 4, 'Pledged by donors', 'Bağış taahhüdü', null,
    sum(d.pledged_amount_kes), 'KES',
    null, null, 'donation_position', max(d.confidentiality)
  from donation_position d
  having sum(d.pledged_amount_kes) is not null

  union all
  select
    'money', 5, 'Received from donors', 'Tahsil edilen bağış', null,
    sum(d.received_kes), 'KES',
    null, null, 'donation_position', max(d.confidentiality)
  from donation_position d
  having sum(d.received_kes) is not null

  union all
  -- The number that tells a board something: pledges that have not arrived.
  select
    'money', 6, 'Pledged and not yet received', 'Taahhüt edilip gelmeyen', null,
    sum(d.outstanding_kes), 'KES',
    null, null, 'donation_position', max(d.confidentiality)
  from donation_position d
  having sum(d.outstanding_kes) is not null

  union all

  -- 4. The legal position.
  select
    'legal', row_number() over (order by c.case_number),
    concat_ws(' — ', c.case_number, c.title),
    concat_ws(' — ', c.case_number, c.title),
    concat_ws(' · ', c.court, c.current_status),
    null::numeric, null,
    'legal_case', c.id::text,
    'legal_cases',
    c.confidentiality
  from legal_cases c

  union all

  -- 5. The risks worth a board's time, highest score first.
  select
    'risks', row_number() over (order by r.score desc nulls last),
    r.title_en, coalesce(r.title_tr, r.title_en),
    concat_ws(' · ', r.category::text, r.state::text,
              'likelihood ' || r.likelihood, 'impact ' || r.impact),
    r.score, 'score',
    'risk', r.id::text,
    'risks',
    r.confidentiality
  from risks r
  where r.state in ('open', 'mitigating')

  union all

  -- 6. What is waiting on a decision. Not drafts of decisions — this portal
  --    does not write the board's resolutions for it — but the list of
  --    questions that cannot be closed without one.
  select
    'decisions wanted', row_number() over (order by d.waiting_since),
    coalesce(d.title_en, d.title_tr), coalesce(d.title_tr, d.title_en),
    concat_ws(' · ', d.kind::text, d.detail,
              'waiting since ' || to_char(d.waiting_since, 'DD Mon')),
    null::numeric, null,
    d.kind::text, d.id,
    'pending_decisions',
    d.confidentiality
  from pending_decisions d

  union all

  -- And the obligations falling due, because a board that approves a plan
  -- without seeing them approves a plan it has not read.
  select
    'falling due', row_number() over (order by o.due_on),
    coalesce(o.title_en, o.title_tr), coalesce(o.title_tr, o.title_en),
    concat_ws(' · ', o.obligor_name, o.state::text,
              case when o.overdue then 'OVERDUE' else o.days_remaining || ' days' end),
    o.days_remaining, 'days',
    'obligation', o.id::text,
    'obligation_deadlines',
    o.confidentiality
  from obligation_deadlines o
  where o.state in ('open', 'in_progress', 'at_risk')

  order by 1, 2;
$$;

comment on function public.board_pack(uuid) is
  'The six sections M3-13 lists, compiled from the registers under the '
  'caller''s own visibility (M12-06). Each row names the register it came '
  'from, because a board pack whose figures cannot be traced is the document '
  'this replaces.';

-- ---------------------------------------------------------------------------
-- The donor report (M12-07, M8-12)
-- ---------------------------------------------------------------------------
--
-- "bağışçının kendi katkısının nereye gittiğini gösteren rapor" — a report
-- showing a donor where their own contribution went. Three kinds of row, and
-- nothing else:
--
--   their own money     what they pledged, what arrived, what has not
--   use of funds        by budget category, not line by line
--   what was achieved   only what the project has published
--
-- The last filter is the one that matters. A donor report assembled from the
-- trustee material with sections removed would be one bug away from sending
-- a donor the assessment of a minister; here the narrative rows are drawn
-- from `confidentiality = 'public'` in SQL, so there is nothing to remove.
--
-- Category-level spending is deliberate and is not a leak: it is the
-- transparency the module exists to provide. Line-by-line spending is not in
-- it, because a donor is owed an account of how their contribution was used
-- and not the trust's whole ledger.
--
-- The section is called "use of funds" rather than "where the money went".
-- The second reads as an accusation, and this is the trust's own statement of
-- how it spent what it was given — the wording a donor report uses is part of
-- the relationship it exists to serve.

create or replace function public.donor_report(
  p_stakeholder uuid,
  p_from date default (current_date - 365),
  p_to date default current_date
)
returns setof report_row
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    'donor', 0, s.full_name, s.full_name,
    concat_ws(' · ', s.title, o.name), null::numeric, null,
    'stakeholder', s.id::text, 'stakeholders', s.confidentiality
  from stakeholders s
  left join organizations o on o.id = s.organization_id
  where s.id = p_stakeholder

  union all

  -- Their own money, pledge by pledge.
  select
    'your contribution', row_number() over (order by d.pledged_on),
    concat_ws(' · ', to_char(d.pledged_on, 'DD Mon YYYY'), d.state::text),
    concat_ws(' · ', to_char(d.pledged_on, 'DD.MM.YYYY'), d.state::text),
    d.pledged_currency::text, d.pledged_amount, d.pledged_currency::text,
    'donation', d.donation_id::text, 'donation_position', d.confidentiality
  from donation_position d
  where d.donor_stakeholder_id = p_stakeholder

  union all
  select
    'your contribution', 100, 'Received to date', 'Bugüne kadar tahsil edilen',
    null, sum(d.received_kes), 'KES',
    null, null, 'donation_position', max(d.confidentiality)
  from donation_position d
  where d.donor_stakeholder_id = p_stakeholder
  having sum(d.received_kes) is not null

  union all
  -- Pledge is not receipt, and the register keeps them apart (M8-08).
  select
    'your contribution', 101, 'Pledged and not yet received',
    'Taahhüt edilip henüz gelmeyen',
    null, sum(d.outstanding_kes), 'KES',
    null, null, 'donation_position', max(d.confidentiality)
  from donation_position d
  where d.donor_stakeholder_id = p_stakeholder
  having sum(d.outstanding_kes) is not null

  union all
  -- A receipt nobody attached a document to is reported as such rather than
  -- quietly counted.
  select
    'your contribution', 102, 'Receipts with no document attached',
    'Belgesi eklenmemiş tahsilatlar',
    null, sum(d.unevidenced_tranches), 'receipts',
    null, null, 'donation_position', max(d.confidentiality)
  from donation_position d
  where d.donor_stakeholder_id = p_stakeholder
  having sum(d.unevidenced_tranches) > 0

  union all

  -- Where the project's funds went, by category.
  select
    'use of funds', c.sequence,
    concat_ws(' · ', c.code, c.name_en), concat_ws(' · ', c.code, coalesce(c.name_tr, c.name_en)),
    null, c.spent_kes, 'KES',
    'budget_category', c.budget_category_id::text, 'category_spend', 'internal'
  from category_spend c
  where coalesce(c.spent_kes, 0) > 0

  union all

  -- What the project has published, in the period. Public only.
  select
    'what was achieved', row_number() over (order by ch.occurred_on),
    ch.title_en, coalesce(ch.title_tr, ch.title_en),
    case ch.precision when 'year' then left(ch.occurred_on::text, 4)
                      when 'month' then to_char(ch.occurred_on, 'Mon YYYY')
                      else to_char(ch.occurred_on, 'DD Mon YYYY') end,
    null::numeric, null,
    ch.source, ch.id::text, 'project_chronology', ch.confidentiality
  from project_chronology ch
  where ch.occurred_on between p_from and p_to
    and ch.confidentiality = 'public'

  order by 1, 2;
$$;

comment on function public.donor_report(uuid, date, date) is
  'What a donor is owed: their own money, the use of funds by category, and '
  'what the project has published (M12-07, M8-12). The narrative rows are '
  'filtered to public in SQL rather than hidden by the client.';

-- ---------------------------------------------------------------------------
-- The periodic report, and the arbitrary one (M12-08, M12-09)
-- ---------------------------------------------------------------------------
--
-- These are one function. M12-08 asks for a periodic project status report
-- and M12-09 for a report over a date range the user picks; the difference is
-- which two dates are passed in. Writing it twice would be writing two
-- things that have to agree forever.

create or replace function public.status_report(
  p_from date default (current_date - 90),
  p_to date default current_date
)
returns setof report_row
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    'period', 0, 'Reporting period', 'Rapor dönemi',
    to_char(p_from, 'DD Mon YYYY') || ' — ' || to_char(p_to, 'DD Mon YYYY'),
    (p_to - p_from), 'days', null, null, 'the dates asked for', 'internal'

  union all

  -- What happened, from the one time line the whole portal shares.
  select
    'what happened', row_number() over (order by ch.occurred_on),
    ch.title_en, coalesce(ch.title_tr, ch.title_en),
    case ch.precision when 'year' then left(ch.occurred_on::text, 4)
                      when 'month' then to_char(ch.occurred_on, 'Mon YYYY')
                      else to_char(ch.occurred_on, 'DD Mon YYYY') end,
    null::numeric, null,
    ch.source, ch.id::text, 'project_chronology', ch.confidentiality
  from project_chronology ch
  where ch.occurred_on between p_from and p_to

  union all

  -- Construction, measured the way M7 measures it: by evidence.
  select
    'construction', row_number() over (order by b.code),
    concat_ws(' · ', b.code, b.name), concat_ws(' · ', b.code, b.name),
    concat_ws(' · ', b.state::text,
              b.tasks_with_evidence || ' of ' || (b.construction_tasks + b.preservation_tasks) || ' tasks evidenced'),
    b.percent_complete, '%',
    'construction_block', b.construction_block_id::text, 'block_progress', b.confidentiality
  from block_progress b

  union all

  -- Paid out, not "spent net of receipts": the ledger records expenditure
  -- against budget lines and has no direction column, so the two sides are
  -- reported from the two registers that actually hold them rather than from
  -- one column that would have to be invented.
  select
    'money', 1, 'Paid out in the period', 'Dönemde ödenen',
    null, sum(t.amount_kes), 'KES',
    null, null, 'financial_transactions', max(t.confidentiality)
  from financial_transactions t
  where t.date between p_from and p_to
  having sum(t.amount_kes) is not null

  union all
  select
    'money', 2, 'Donor receipts in the period', 'Dönemde gelen bağış',
    null, sum(tr.received_amount_kes), 'KES',
    null, null, 'donation_tranches', max(tr.confidentiality)
  from donation_tranches tr
  where tr.received_on between p_from and p_to
  having sum(tr.received_amount_kes) is not null

  union all
  -- A receipt with no document is counted and named, not hidden in the total.
  select
    'money', 3, 'Of those, with no document attached', 'Bunlardan belgesi olmayan',
    null, count(*), 'receipts',
    null, null, 'donation_tranches', max(tr.confidentiality)
  from donation_tranches tr
  where tr.received_on between p_from and p_to and tr.document_id is null
  having count(*) > 0

  union all

  -- The plan against the outcome.
  select
    'milestones', row_number() over (order by m.target_on nulls last),
    coalesce(m.title_en, m.title_tr), coalesce(m.title_tr, m.title_en),
    concat_ws(' · ', m.state::text,
              case when m.target_on is not null then 'target ' || to_char(m.target_on, 'DD Mon') end,
              case when m.achieved_on is not null then 'achieved ' || to_char(m.achieved_on, 'DD Mon') end),
    m.slip_days, 'days late',
    'milestone', m.id::text, 'milestones', m.confidentiality
  from milestones m
  where (m.target_on between p_from and p_to) or (m.achieved_on between p_from and p_to)

  union all

  select
    'risks', row_number() over (order by r.score desc nulls last),
    r.title_en, coalesce(r.title_tr, r.title_en),
    concat_ws(' · ', r.category::text, r.state::text), r.score, 'score',
    'risk', r.id::text, 'risks', r.confidentiality
  from risks r
  where r.state in ('open', 'mitigating')

  union all

  -- And what falls due after the period closes, because a status report that
  -- only looks backwards is a newsletter.
  select
    'what comes next', row_number() over (order by cal.due_on),
    coalesce(cal.title_en, cal.title_tr), coalesce(cal.title_tr, cal.title_en),
    concat_ws(' · ', cal.kind::text, to_char(cal.due_on, 'DD Mon YYYY'), cal.detail),
    (cal.due_on - p_to), 'days away',
    cal.kind::text, cal.id::text, 'project_calendar', cal.confidentiality
  from project_calendar cal
  where cal.due_on > p_to and cal.due_on <= p_to + 60

  order by 1, 2;
$$;

comment on function public.status_report(date, date) is
  'The project over a period (M12-08), and over any period somebody picks '
  '(M12-09) — one function, because two would have to agree forever.';

-- ---------------------------------------------------------------------------
-- Taking a report, approving it, publishing it
-- ---------------------------------------------------------------------------
--
-- Security invoker, all four. The compilation happens under the caller's own
-- visibility and the insert goes through the policies above, so nobody can
-- compile a document holding more than they may read.

create or replace function public.open_report(
  p_kind report_kind,
  p_title text,
  p_from date default null,
  p_to date default null,
  p_meeting uuid default null,
  p_stakeholder uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_content jsonb;
  v_from date := coalesce(p_from, current_date - 90);
  v_to date := coalesce(p_to, current_date);
begin
  if btrim(coalesce(p_title, '')) = '' then
    raise exception 'a report needs a name, so it can be referred to later'
      using errcode = 'check_violation';
  end if;

  v_content := case p_kind
    when 'board_pack' then
      (select jsonb_agg(to_jsonb(r)) from public.board_pack(p_meeting) r)
    when 'donor_report' then
      (select jsonb_agg(to_jsonb(r)) from public.donor_report(p_stakeholder, v_from, v_to) r)
    when 'status_report' then
      (select jsonb_agg(to_jsonb(r)) from public.status_report(v_from, v_to) r)
  end;

  -- An empty compilation is a finding, not a document. It means the period is
  -- wrong, or the caller cannot see the registers it draws on.
  if v_content is null then
    raise exception
      'nothing could be compiled for that report — check the period, and that '
      'the registers it draws on are ones you can read'
      using errcode = 'no_data_found';
  end if;

  insert into report_runs (
    kind, title, period_from, period_to, meeting_id, stakeholder_id,
    prepared_by, content, confidentiality
  )
  values (
    p_kind, btrim(p_title),
    case when p_kind = 'board_pack' then p_from else v_from end,
    case when p_kind = 'board_pack' then p_to else v_to end,
    p_meeting, p_stakeholder, auth.uid(), v_content,
    -- A draft is the trust's own working document whatever it is for. A donor
    -- report becomes public at publication and not before — see below.
    'internal'
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.approve_report(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v report_runs;
begin
  select * into v from report_runs where id = p_id;
  if not found then
    raise exception 'no such report, or it is not yours to see'
      using errcode = 'no_data_found';
  end if;

  if not app.can_approve_report() then
    raise exception 'approving a report for publication is not yours to do'
      using errcode = 'insufficient_privilege';
  end if;

  if v.state <> 'draft' then
    raise exception 'that report is already %', v.state
      using errcode = 'check_violation';
  end if;

  -- A donor report leaves the trust, so the same separation the payment
  -- bands and the procurement award require applies: the person who compiled
  -- it is not the only pair of eyes on it. A board pack is an internal
  -- compilation and does not need a second person.
  if v.kind = 'donor_report' and v.prepared_by = auth.uid() then
    raise exception
      'a donor report is approved by somebody other than whoever compiled it'
      using errcode = 'check_violation';
  end if;

  update report_runs
     set state = 'approved', approved_by = auth.uid(), approved_at = now()
   where id = p_id;
end;
$$;

create or replace function public.publish_report(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v report_runs;
begin
  select * into v from report_runs where id = p_id;
  if not found then
    raise exception 'no such report, or it is not yours to see'
      using errcode = 'no_data_found';
  end if;

  if not app.can_approve_report() then
    raise exception 'publishing a report is not yours to do'
      using errcode = 'insufficient_privilege';
  end if;

  if v.state <> 'approved' then
    raise exception 'a report is approved before it is published — this one is %', v.state
      using errcode = 'check_violation';
  end if;

  update report_runs
     set state = 'published',
         published_at = now(),
         -- Publishing a donor report is the act that declassifies it, and it
         -- is deliberately the same act that a human has just approved. The
         -- content was compiled from public narrative rows and the donor's
         -- own figures; nothing is stripped at this point, because a
         -- document that needs stripping should never have been compiled.
         confidentiality = case when v.kind = 'donor_report' then 'public'
                                else confidentiality end
   where id = p_id;
end;
$$;

create or replace function public.withdraw_report(p_id uuid, p_reason text)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'say why it is being withdrawn — a report pulled without a reason is a gap in the record'
      using errcode = 'check_violation';
  end if;
  if not app.can_approve_report() then
    raise exception 'withdrawing a report is not yours to do'
      using errcode = 'insufficient_privilege';
  end if;

  update report_runs
     set state = 'withdrawn', withdrawn_reason = btrim(p_reason)
   where id = p_id;

  if not found then
    raise exception 'no such report, or it is not yours to see'
      using errcode = 'no_data_found';
  end if;
end;
$$;

comment on table report_runs is
  'A compiled report and the approval attached to it (M12-06 … M12-09). The '
  'content is frozen at approval, because an approval that does not fix what '
  'was approved is a signature on a moving document.';

grant select on report_runs to authenticated;

-- ---------------------------------------------------------------------------
-- The tail 0026 requires
-- ---------------------------------------------------------------------------
--
-- Postgres grants EXECUTE on a new function to PUBLIC and a default ACL
-- cannot take that away (0026 says why, with the measurement). The policy
-- tests assert that anon can execute nothing, so a migration that forgets
-- these four lines fails them rather than shipping.

revoke all privileges on all functions in schema public from anon, public;
revoke all privileges on all functions in schema app from anon, public;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on all functions in schema app to authenticated;
