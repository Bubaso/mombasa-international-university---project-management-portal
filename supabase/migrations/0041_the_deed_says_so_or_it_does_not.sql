-- The governance reference, cited to the trust deed (M10-13).
--
-- This is the page that gets quoted. A registrar asks where the Board's power
-- to appoint comes from, a court asks which clause the quorum rests on, and
-- whatever is on this screen is what somebody reads out. Which makes it the
-- single worst place in the portal to hold a plausible-looking citation that
-- nobody has checked.
--
-- The portal does not read the trust deed. It holds the deed as a file in the
-- vault and it holds whatever clause numbers people type. So the whole design
-- turns on keeping three things apart that a reference page usually runs
-- together:
--
--   1. The deed's own words. `quoted_text` is a quotation, and it cannot be
--      recorded without the document it is quoted from — the same rule the
--      rest of the portal applies to an outgoing official letter.
--
--   2. Somebody's paraphrase. `summary_en` is a reading of the clause, and
--      the screen says so in those words. A paraphrase read out as the deed
--      is how a misquotation enters a court record, and the distinction
--      costs nothing to keep and cannot be recovered once lost.
--
--   3. Whether anyone has checked the reference against the file.
--      `checked_against_the_deed_at` is set by a person who opened the
--      document and found the clause where the citation says it is. Until
--      then the clause reads "senetle karşılaştırılmadı" — not wrong, not
--      right, unchecked.
--
-- And the page's real value is the inverse of a reference page: the
-- governance rules with no clause behind them. An organ with a recorded
-- quorum and no citation is the sharpest of those, because a quorum is a rule
-- that will be enforced against a sitting, and "we think it is two thirds" is
-- not the same as a clause.
--
-- 0021 left `governance_organs.charter_clause` as a free-text hook for this
-- requirement. It is kept rather than migrated: the register reports an organ
-- whose typed clause has no matching record, which is a measurable gap, where
-- a silent conversion would have invented a clause from a string.
--
-- Requirements: M10-13.

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
-- The clauses
-- ---------------------------------------------------------------------------

create table charter_clauses (
  id uuid primary key default gen_random_uuid(),
  -- "Madde 7.2", "Clause 14(a)". Whatever the deed calls it, kept verbatim,
  -- because a reference that has been tidied is a reference somebody has to
  -- check twice.
  reference text not null check (btrim(reference) <> ''),
  heading_en text,
  heading_tr text,

  -- The deed's own words. Requires the document, by the constraint below:
  -- a quotation with no file behind it is a sentence somebody remembers.
  quoted_text text,

  -- Somebody's reading of the clause. Never presented as the deed's words.
  summary_en text,
  summary_tr text,

  document_id uuid references document_vault (id) on delete restrict,
  -- Where in the file: a page, a schedule, a part. Null is honest; a guess
  -- is not.
  located_at text,

  -- Somebody opened the document and found the clause where this says it is.
  checked_against_the_deed_at timestamptz,
  checked_by uuid references profiles (id),

  constraint charter_clauses_quotation_has_its_document check (
    quoted_text is null or document_id is not null
  ),
  constraint charter_clauses_check_is_whole check (
    (checked_against_the_deed_at is null) = (checked_by is null)
  ),
  -- Checking a citation against the deed means having the deed.
  constraint charter_clauses_check_needs_the_document check (
    checked_against_the_deed_at is null or document_id is not null
  ),
  constraint charter_clauses_reference_unique unique (reference)
);
select app.add_common_columns('charter_clauses');

comment on table charter_clauses is
  'A clause of the trust deed as somebody recorded it (M10-13). quoted_text '
  'is the deed''s words and needs the file; summary is a paraphrase and is '
  'never shown as the deed''s words; checked_against_the_deed_at is somebody '
  'having opened the file and found it.';

-- Once somebody has checked a citation against the deed, moving the reference
-- or the quotation underneath that check would leave the check standing over
-- something nobody verified.
create or replace function app.refuse_checked_clause_drift()
returns trigger
language plpgsql
as $$
begin
  if old.checked_against_the_deed_at is null then
    return new;
  end if;

  -- Unchecking is allowed: somebody who looks again and cannot find the
  -- clause has to be able to say so, and refusing that would make the check
  -- unfalsifiable.
  if new.checked_against_the_deed_at is null then
    return new;
  end if;

  if new.reference is distinct from old.reference
     or new.quoted_text is distinct from old.quoted_text
     or new.document_id is distinct from old.document_id
     or new.located_at is distinct from old.located_at then
    raise exception
      'this clause has been checked against the deed; check it again rather than moving it underneath the check'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger charter_clauses_checked_holds before update on charter_clauses
  for each row execute function app.refuse_checked_clause_drift();

-- ---------------------------------------------------------------------------
-- The citations
-- ---------------------------------------------------------------------------

-- One of six subjects, the same shape `dependencies` uses: nullable columns
-- with a check that exactly one is set. A label is allowed because some of
-- the things a clause governs are rules rather than rows — "the quorum of
-- the Board" is in the organ's columns, not in a table of its own.
create table charter_citations (
  id uuid primary key default gen_random_uuid(),
  clause_id uuid not null references charter_clauses (id) on delete cascade,

  governance_organ_id uuid references governance_organs (id) on delete cascade,
  trustee_id uuid references trustees (id) on delete cascade,
  compliance_requirement_id uuid references compliance_requirements (id) on delete cascade,
  obligation_id uuid references obligations (id) on delete cascade,
  academic_programme_id uuid references academic_programmes (id) on delete cascade,
  subject_label text,

  -- What the clause says about this subject, in the citer's words.
  note_en text,
  note_tr text,

  constraint charter_citations_one_subject check (
    (governance_organ_id is not null)::int
      + (trustee_id is not null)::int
      + (compliance_requirement_id is not null)::int
      + (obligation_id is not null)::int
      + (academic_programme_id is not null)::int
      + (subject_label is not null)::int = 1
  )
);
select app.add_common_columns('charter_citations');

create index charter_citations_clause_idx on charter_citations (clause_id);

comment on table charter_citations is
  'What a clause of the deed governs (M10-13). Exactly one subject per row, '
  'and a plain label where the thing governed is a rule rather than a record.';

-- ---------------------------------------------------------------------------
-- The reference page
-- ---------------------------------------------------------------------------

create view charter_reference with (security_invoker = true) as
select
  c.id as clause_id,
  c.reference,
  c.heading_en,
  c.heading_tr,
  c.quoted_text,
  c.summary_en,
  c.summary_tr,
  c.document_id,
  c.located_at,
  c.checked_against_the_deed_at,
  -- Three states, not two. Quoted and checked is the strongest thing this
  -- page can say; paraphrased and unchecked is the weakest; and the screen
  -- must not render them the same way.
  (c.quoted_text is not null) as carries_the_deeds_words,
  (c.checked_against_the_deed_at is not null) as checked_against_the_deed,
  (c.document_id is null) as deed_not_attached,
  (select count(*) from charter_citations t where t.clause_id = c.id) as citations,
  (
    select coalesce(array_agg(distinct kind), '{}'::text[])
    from (
      select case
        when t.governance_organ_id is not null then 'organ'
        when t.trustee_id is not null then 'trustee'
        when t.compliance_requirement_id is not null then 'compliance'
        when t.obligation_id is not null then 'obligation'
        when t.academic_programme_id is not null then 'programme'
        else 'rule'
      end as kind
      from charter_citations t where t.clause_id = c.id
    ) k
  ) as cited_for,
  c.confidentiality
from charter_clauses c;

comment on view charter_reference is
  'The clauses of the deed as recorded, with whether each carries the deed''s '
  'own words and whether anybody has found it in the file (M10-13).';

create view charter_citation_register with (security_invoker = true) as
select
  t.id as citation_id,
  t.clause_id,
  c.reference,
  c.checked_against_the_deed_at is not null as clause_checked,
  case
    when t.governance_organ_id is not null then 'organ'
    when t.trustee_id is not null then 'trustee'
    when t.compliance_requirement_id is not null then 'compliance'
    when t.obligation_id is not null then 'obligation'
    when t.academic_programme_id is not null then 'programme'
    else 'rule'
  end as subject_kind,
  coalesce(
    (select o.name_en from governance_organs o where o.id = t.governance_organ_id),
    (select tr.full_name from trustees tr where tr.id = t.trustee_id),
    (select r.title_en from compliance_requirements r where r.id = t.compliance_requirement_id),
    (select ob.title_en from obligations ob where ob.id = t.obligation_id),
    (select p.name_en from academic_programmes p where p.id = t.academic_programme_id),
    t.subject_label
  ) as subject_label,
  t.note_en,
  t.note_tr,
  greatest(t.confidentiality, c.confidentiality) as confidentiality
from charter_citations t
join charter_clauses c on c.id = t.clause_id;

comment on view charter_citation_register is
  'Every citation with its subject resolved to a name (M10-13).';

-- The inverse of a reference page, and the reason to build one: the
-- governance rules with no clause behind them.
create view governance_without_a_clause with (security_invoker = true) as
select
  'organ'::text as subject_kind,
  o.id as subject_id,
  o.name_en as subject_label,
  -- An organ with a recorded quorum and no citation is the sharpest case on
  -- this list: a quorum is a rule that will be enforced against a sitting,
  -- and "we think it is two thirds" is not a clause.
  (o.quorum_members is not null or o.quorum_fraction is not null) as carries_a_rule,
  o.charter_clause as clause_typed_in_free_text,
  -- 0021's free-text hook, and whether it names a clause this register holds.
  (
    o.charter_clause is not null
    and not exists (select 1 from charter_clauses c where c.reference = o.charter_clause)
  ) as typed_clause_is_not_in_the_register,
  o.confidentiality
from governance_organs o
where not exists (
  select 1 from charter_citations t where t.governance_organ_id = o.id
)

union all

select
  'compliance',
  r.id,
  r.title_en,
  true,
  null,
  false,
  r.confidentiality
from compliance_requirements r
where not exists (
  select 1 from charter_citations t where t.compliance_requirement_id = r.id
)

union all

select
  'programme',
  p.id,
  p.name_en,
  false,
  null,
  false,
  p.confidentiality
from academic_programmes p
where not exists (
  select 1 from charter_citations t where t.academic_programme_id = p.id
);

comment on view governance_without_a_clause is
  'Governance records with no clause of the deed cited against them (M10-13). '
  'carries_a_rule marks the ones that will be enforced against somebody, so '
  'an uncited rule there is not a tidiness problem.';

-- ---------------------------------------------------------------------------
-- Who may do what
-- ---------------------------------------------------------------------------

-- Recording a clause of the trust deed is not an ordinary edit. The people
-- who may are the ones who would answer for it: the trust's officers and its
-- counsel.
create or replace function app.can_cite_the_deed()
returns boolean
language sql
stable
as $$
  select app.acts_as('admin', 'project_director', 'trustee', 'board_director', 'legal_counsel');
$$;

alter table charter_clauses enable row level security;
alter table charter_clauses force row level security;

create policy charter_clauses_read on charter_clauses
  for select using (app.can_read(confidentiality));
create policy charter_clauses_insert on charter_clauses
  for insert with check (app.can_read(confidentiality) and app.can_cite_the_deed());
create policy charter_clauses_update on charter_clauses
  for update
  using (app.can_read(confidentiality) and app.can_cite_the_deed())
  with check (app.can_cite_the_deed());

alter table charter_citations enable row level security;
alter table charter_citations force row level security;

create policy charter_citations_read on charter_citations
  for select using (
    app.can_read(confidentiality)
    and exists (
      select 1 from charter_clauses c
      where c.id = clause_id and app.can_read(c.confidentiality)
    )
  );
create policy charter_citations_insert on charter_citations
  for insert with check (
    app.can_read(confidentiality)
    and app.can_cite_the_deed()
    and exists (
      select 1 from charter_clauses c
      where c.id = clause_id and app.can_read(c.confidentiality)
    )
  );
create policy charter_citations_update on charter_citations
  for update using (app.can_read(confidentiality) and app.can_cite_the_deed())
  with check (app.can_cite_the_deed());
create policy charter_citations_delete on charter_citations
  for delete using (app.can_read(confidentiality) and app.can_cite_the_deed());

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- A clause nobody may delete: this page is quoted, and a citation that can be
-- removed without trace is a citation that can be denied.
revoke all on charter_clauses from authenticated;
grant select, insert, update on charter_clauses to authenticated;

revoke all on charter_citations from authenticated;
grant select, insert, update, delete on charter_citations to authenticated;

grant select on charter_reference, charter_citation_register, governance_without_a_clause
  to authenticated;

drop function app.add_common_columns(regclass);

select app.reset_function_grants();
