-- The legal register (M5).
--
-- The project's reason for existing right now, and the part the application
-- understood least: it showed one case, as fixed text. There are at least
-- five files, new applications keep being filed, four different advocates are
-- involved, and what a court orders locks everything from construction to
-- finance.
--
-- The value here is not a hearing calendar. It is two joins nobody can make
-- today: turning a court order into a compliance obligation (M5-05, and the
-- register in 0010 that consumes it), and tying the legal position to the
-- operational decisions it constrains.
--
-- Requirements: M5-01 … M5-10, M5-16.

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

create type case_party_role as enum (
  'appellant',
  'respondent',
  'claimant',
  'defendant',
  'interested_party',
  'amicus'
);

create type case_relation as enum ('appeal_of', 'merged_into', 'related_to', 'stayed_by');

create type hearing_kind as enum (
  'mention',
  'directions',
  'hearing',
  'ruling',
  'judgment',
  'application'
);

create type preparation_state as enum ('not_started', 'in_preparation', 'ready', 'missed');

create type filing_kind as enum (
  'pleading',
  'affidavit',
  'submission',
  'application',
  'appeal',
  'record_of_appeal',
  'notice',
  'other'
);

create type filing_state as enum ('planned', 'drafting', 'filed', 'served', 'withdrawn', 'late');

-- What an order is doing right now, which is the question anyone actually has.
create type order_state as enum ('in_force', 'varied', 'discharged', 'appealed', 'spent');

create type counsel_state as enum ('proposed', 'instructed', 'on_record', 'withdrawn');

-- ---------------------------------------------------------------------------
-- The case file itself
-- ---------------------------------------------------------------------------

alter table legal_cases
  add column risk_level priority_level not null default 'normal',
  -- The advocate carrying it, as a register entry rather than a name: this
  -- is the same person who signs in, is assigned the case, and bills for it.
  add column lead_counsel_stakeholder_id uuid references stakeholders (id) on delete set null,
  add column source_system text,
  add column source_id text,
  add column source_url text;

alter table legal_cases
  add constraint legal_cases_source_key unique (source_system, source_id);

-- Two columns from 0002 that the register replaces. key_parties was an
-- untyped object nothing read; orders was an array of objects pretending to
-- be a register — an order that cannot be given a state, linked to the
-- document that carries it, or turned into an obligation is a paragraph.
alter table legal_cases drop column key_parties;
alter table legal_cases drop column orders;

create table case_parties (
  id uuid primary key default gen_random_uuid(),
  legal_case_id uuid not null references legal_cases (id) on delete cascade,
  role case_party_role not null,
  -- A party is often an entity rather than a person in the register — a
  -- county government, a company, the National Land Commission — so the name
  -- stands on its own and the link is made when there is one to make.
  stakeholder_id uuid references stakeholders (id) on delete set null,
  name text not null,
  represented_by text,

  constraint case_parties_name_not_blank check (btrim(name) <> '')
);

select app.add_common_columns('case_parties');
create index case_parties_case_idx on case_parties (legal_case_id);

-- M5-02. Direction matters: "this is the appeal of that" is not its reverse.
create table case_relations (
  id uuid primary key default gen_random_uuid(),
  from_case_id uuid not null references legal_cases (id) on delete cascade,
  to_case_id uuid not null references legal_cases (id) on delete cascade,
  relation case_relation not null,
  note text,

  constraint case_relations_distinct check (from_case_id <> to_case_id),
  unique (from_case_id, to_case_id, relation)
);

select app.add_common_columns('case_relations');

-- ---------------------------------------------------------------------------
-- Hearings (M5-03)
-- ---------------------------------------------------------------------------

create table hearings (
  id uuid primary key default gen_random_uuid(),
  legal_case_id uuid not null references legal_cases (id) on delete cascade,
  scheduled_for timestamptz not null,
  kind hearing_kind not null default 'hearing',
  bench text,
  courtroom text,
  preparation preparation_state not null default 'not_started',
  -- What has to be in hand on the day. Free text per line rather than links,
  -- because half of these are documents nobody has yet.
  required_documents text[] not null default '{}',
  outcome_en text,
  outcome_tr text,
  meeting_id uuid references meetings (id) on delete set null
);

select app.add_common_columns('hearings');
create index hearings_when_idx on hearings (scheduled_for);
create index hearings_case_idx on hearings (legal_case_id);

-- Who is going. Reuses the pattern from 0007: a portal user or somebody in
-- the register, never a typed name.
create table hearing_attendees (
  id uuid primary key default gen_random_uuid(),
  hearing_id uuid not null references hearings (id) on delete cascade,
  profile_id uuid references profiles (id),
  stakeholder_id uuid references stakeholders (id),
  note text,

  constraint hearing_attendees_exactly_one_party
    check ((profile_id is null) <> (stakeholder_id is null))
);

create unique index hearing_attendees_profile_key
  on hearing_attendees (hearing_id, profile_id) where profile_id is not null;
create unique index hearing_attendees_stakeholder_key
  on hearing_attendees (hearing_id, stakeholder_id) where stakeholder_id is not null;

create trigger hearing_attendees_audit
  after insert or update or delete on hearing_attendees
  for each row execute function app.record_audit();

-- ---------------------------------------------------------------------------
-- Filings (M5-04)
-- ---------------------------------------------------------------------------
--
-- Missing a procedural deadline is a live risk on this project, not a
-- theoretical one, so a filing carries the date it is due separately from the
-- date it was made, and the gap between them is visible.

create table filings (
  id uuid primary key default gen_random_uuid(),
  legal_case_id uuid not null references legal_cases (id) on delete cascade,
  kind filing_kind not null default 'pleading',
  title text not null,
  due_on date,
  filed_on date,
  state filing_state not null default 'planned',
  filed_by_stakeholder_id uuid references stakeholders (id) on delete set null,
  document_id uuid references document_vault (id) on delete set null,
  note text,

  constraint filings_title_not_blank check (btrim(title) <> ''),
  -- A filing that says it was filed with no date is the kind of record that
  -- makes people think a deadline was met.
  constraint filings_filed_is_dated check (
    state not in ('filed', 'served') or filed_on is not null
  )
);

select app.add_common_columns('filings');
create index filings_due_idx on filings (due_on) where state in ('planned', 'drafting');
create index filings_case_idx on filings (legal_case_id);

-- ---------------------------------------------------------------------------
-- Orders (M5-05)
-- ---------------------------------------------------------------------------
--
-- The table the obligation register in 0010 reads. An order here is not a
-- paragraph in a case summary: it has a state, a document behind it, and
-- clauses that become things somebody has to do or not do.

create table legal_orders (
  id uuid primary key default gen_random_uuid(),
  legal_case_id uuid not null references legal_cases (id) on delete cascade,
  made_on date not null,
  made_by text,
  reference_no text,
  text_en text,
  text_tr text,
  state order_state not null default 'in_force',
  document_id uuid references document_vault (id) on delete set null,
  -- Set when this order changes an earlier one, so the current position can
  -- be read without reading the whole file in order.
  varies_order_id uuid references legal_orders (id) on delete set null,

  constraint legal_orders_has_text check (
    btrim(coalesce(text_en, '')) <> '' or btrim(coalesce(text_tr, '')) <> ''
  ),
  constraint legal_orders_not_its_own_variation check (varies_order_id <> id)
);

select app.add_common_columns('legal_orders');
create index legal_orders_case_idx on legal_orders (legal_case_id, made_on desc);

-- ---------------------------------------------------------------------------
-- Evidence (M5-06, M5-07)
-- ---------------------------------------------------------------------------

create table exhibits (
  id uuid primary key default gen_random_uuid(),
  legal_case_id uuid not null references legal_cases (id) on delete cascade,
  mark text not null,
  description text not null,
  source text,
  -- What this is being offered to prove.
  relevance text,
  document_id uuid references document_vault (id) on delete set null,

  constraint exhibits_mark_not_blank check (btrim(mark) <> ''),
  unique (legal_case_id, mark)
);

select app.add_common_columns('exhibits');

-- The chain of custody: who handed what to whom, and when. Append-only for
-- the same reason the audit log is — a chain that can be tidied afterwards
-- proves nothing, which is the whole purpose of keeping one.
create table exhibit_custody (
  id uuid primary key default gen_random_uuid(),
  exhibit_id uuid not null references exhibits (id) on delete cascade,
  handed_over_at timestamptz not null default now(),
  from_party text not null,
  to_party text not null,
  note text,
  recorded_by uuid references profiles (id),
  recorded_at timestamptz not null default now()
);

create index exhibit_custody_idx on exhibit_custody (exhibit_id, handed_over_at);

create or replace function app.refuse_custody_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'a chain of custody is append-only (attempted %)', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger exhibit_custody_no_update
  before update on exhibit_custody
  for each row execute function app.refuse_custody_mutation();

create trigger exhibit_custody_no_delete
  before delete on exhibit_custody
  for each row execute function app.refuse_custody_mutation();

create trigger exhibit_custody_audit
  after insert on exhibit_custody
  for each row execute function app.record_audit();

-- M5-07. That a certified copy of the title was not annexed is one of the
-- grounds of appeal, so which certified copies exist and where they are is
-- not administration — it is the subject matter.
create table certified_copies (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references document_vault (id) on delete set null,
  describes text not null,
  certified_on date,
  certified_by text,
  held_at text,
  valid_until date,
  note text,

  constraint certified_copies_describes_not_blank check (btrim(describes) <> '')
);

select app.add_common_columns('certified_copies');

-- ---------------------------------------------------------------------------
-- Counsel and opinions (M5-08, M5-10)
-- ---------------------------------------------------------------------------

create table case_counsel (
  id uuid primary key default gen_random_uuid(),
  legal_case_id uuid not null references legal_cases (id) on delete cascade,
  stakeholder_id uuid not null references stakeholders (id) on delete cascade,
  state counsel_state not null default 'proposed',
  -- Whether the instrument that actually lets them act has been filed.
  power_of_attorney_filed boolean not null default false,
  fee_model text,
  contract_document_id uuid references document_vault (id) on delete set null,
  instructed_on date,
  note text,

  unique (legal_case_id, stakeholder_id)
);

select app.add_common_columns('case_counsel');

-- M5-10. Four candidate advisers were assessed in parallel and their views
-- are scattered across meeting notes; opinions given on the same question
-- should be readable side by side.
create table legal_opinions (
  id uuid primary key default gen_random_uuid(),
  legal_case_id uuid references legal_cases (id) on delete set null,
  question text not null,
  given_by_stakeholder_id uuid references stakeholders (id) on delete set null,
  given_by_name text,
  given_on date,
  conclusion text,
  document_id uuid references document_vault (id) on delete set null,

  constraint legal_opinions_question_not_blank check (btrim(question) <> ''),
  constraint legal_opinions_has_an_author check (
    given_by_stakeholder_id is not null or btrim(coalesce(given_by_name, '')) <> ''
  )
);

select app.add_common_columns('legal_opinions');
create index legal_opinions_question_idx on legal_opinions (lower(btrim(question)));

-- ---------------------------------------------------------------------------
-- Who may see what (M5-16)
-- ---------------------------------------------------------------------------
--
-- An outside advocate sees their own files and nothing else — not the other
-- cases, and not the money. That rule already exists for legal_cases; every
-- table that hangs off a case inherits it here, so there is one answer to
-- "can this person see this" and not eight.

create or replace function app.can_see_case_child(p_conf confidentiality, p_case uuid)
returns boolean
language sql
stable
as $$
  select app.can_read(p_conf)
    and exists (
      select 1 from legal_cases c
      where c.id = p_case and app.can_see_case(c.confidentiality, c.id)
    );
$$;

-- Who keeps the legal record. Advocates write on their own files, which is
-- the point of them having accounts at all (M5-16).
create or replace function app.can_keep_legal_record(p_case uuid)
returns boolean
language sql
stable
as $$
  select app.acts_as('admin', 'project_director', 'trustee', 'board_director')
    or (app.acts_as('legal_counsel') and app.is_assigned_case(p_case));
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'case_parties', 'hearings', 'filings', 'legal_orders',
    'exhibits', 'certified_copies', 'case_counsel', 'legal_opinions'
  ] loop
    execute format('alter table %I enable row level security', v_table);
    execute format('alter table %I force row level security', v_table);
  end loop;
end;
$$;

-- certified_copies is the one without a case of its own: a certified copy of
-- the title deed is not evidence in one file, it is a fact about the project.
alter table certified_copies enable row level security;

create policy case_parties_read on case_parties
  for select using (app.can_see_case_child(confidentiality, legal_case_id));
create policy case_parties_insert on case_parties
  for insert with check (app.can_keep_legal_record(legal_case_id));
create policy case_parties_update on case_parties
  for update
  using (app.can_see_case_child(confidentiality, legal_case_id)
         and app.can_keep_legal_record(legal_case_id))
  with check (app.can_keep_legal_record(legal_case_id));
create policy case_parties_delete on case_parties
  for delete
  using (app.can_see_case_child(confidentiality, legal_case_id)
         and app.can_keep_legal_record(legal_case_id));

create policy hearings_read on hearings
  for select using (app.can_see_case_child(confidentiality, legal_case_id));
create policy hearings_insert on hearings
  for insert with check (app.can_keep_legal_record(legal_case_id));
create policy hearings_update on hearings
  for update
  using (app.can_see_case_child(confidentiality, legal_case_id)
         and app.can_keep_legal_record(legal_case_id))
  with check (app.can_keep_legal_record(legal_case_id));
create policy hearings_delete on hearings
  for delete
  using (app.can_see_case_child(confidentiality, legal_case_id)
         and app.can_keep_legal_record(legal_case_id));

create policy filings_read on filings
  for select using (app.can_see_case_child(confidentiality, legal_case_id));
create policy filings_insert on filings
  for insert with check (app.can_keep_legal_record(legal_case_id));
create policy filings_update on filings
  for update
  using (app.can_see_case_child(confidentiality, legal_case_id)
         and app.can_keep_legal_record(legal_case_id))
  with check (app.can_keep_legal_record(legal_case_id));
create policy filings_delete on filings
  for delete
  using (app.can_see_case_child(confidentiality, legal_case_id)
         and app.can_keep_legal_record(legal_case_id));

create policy legal_orders_read on legal_orders
  for select using (app.can_see_case_child(confidentiality, legal_case_id));
create policy legal_orders_insert on legal_orders
  for insert with check (app.can_keep_legal_record(legal_case_id));
create policy legal_orders_update on legal_orders
  for update
  using (app.can_see_case_child(confidentiality, legal_case_id)
         and app.can_keep_legal_record(legal_case_id))
  with check (app.can_keep_legal_record(legal_case_id));
create policy legal_orders_delete on legal_orders
  for delete
  using (app.can_see_case_child(confidentiality, legal_case_id)
         and app.can_keep_legal_record(legal_case_id));

create policy exhibits_read on exhibits
  for select using (app.can_see_case_child(confidentiality, legal_case_id));
create policy exhibits_insert on exhibits
  for insert with check (app.can_keep_legal_record(legal_case_id));
create policy exhibits_update on exhibits
  for update
  using (app.can_see_case_child(confidentiality, legal_case_id)
         and app.can_keep_legal_record(legal_case_id))
  with check (app.can_keep_legal_record(legal_case_id));
create policy exhibits_delete on exhibits
  for delete
  using (app.can_see_case_child(confidentiality, legal_case_id)
         and app.can_keep_legal_record(legal_case_id));

create policy case_counsel_read on case_counsel
  for select using (app.can_see_case_child(confidentiality, legal_case_id));
-- Who is on record is the project's decision, not an advocate's.
create policy case_counsel_insert on case_counsel
  for insert with check (app.acts_as('admin', 'project_director'));
create policy case_counsel_update on case_counsel
  for update
  using (app.can_see_case_child(confidentiality, legal_case_id)
         and app.acts_as('admin', 'project_director'))
  with check (app.acts_as('admin', 'project_director'));
create policy case_counsel_delete on case_counsel
  for delete
  using (app.can_see_case_child(confidentiality, legal_case_id)
         and app.acts_as('admin', 'project_director'));

-- An opinion may be about no case in particular, so it falls back to the
-- ordinary internal rule rather than to a file it does not belong to.
create policy legal_opinions_read on legal_opinions
  for select using (
    case
      when legal_case_id is null then app.is_internal() and app.can_read(confidentiality)
      else app.can_see_case_child(confidentiality, legal_case_id)
    end
  );
create policy legal_opinions_insert on legal_opinions
  for insert with check (
    legal_case_id is null and app.acts_as('admin', 'project_director', 'trustee', 'board_director')
    or legal_case_id is not null and app.can_keep_legal_record(legal_case_id)
  );
create policy legal_opinions_update on legal_opinions
  for update
  using (app.acts_as('admin', 'project_director', 'trustee', 'board_director'))
  with check (app.acts_as('admin', 'project_director', 'trustee', 'board_director'));
create policy legal_opinions_delete on legal_opinions
  for delete using (app.acts_as('admin', 'project_director'));

create policy certified_copies_read on certified_copies
  for select using (app.is_internal() and app.can_read(confidentiality));
create policy certified_copies_insert on certified_copies
  for insert with check (app.acts_as('admin', 'project_director', 'trustee', 'board_director'));
create policy certified_copies_update on certified_copies
  for update
  using (app.is_internal() and app.acts_as('admin', 'project_director', 'trustee', 'board_director'))
  with check (app.acts_as('admin', 'project_director', 'trustee', 'board_director'));
create policy certified_copies_delete on certified_copies
  for delete
  using (app.is_internal() and app.acts_as('admin', 'project_director'));

alter table hearing_attendees enable row level security;

create policy hearing_attendees_read on hearing_attendees
  for select using (
    exists (
      select 1 from hearings h
      where h.id = hearing_id and app.can_see_case_child(h.confidentiality, h.legal_case_id)
    )
  );
create policy hearing_attendees_insert on hearing_attendees
  for insert with check (
    exists (select 1 from hearings h
            where h.id = hearing_id and app.can_keep_legal_record(h.legal_case_id))
  );
create policy hearing_attendees_delete on hearing_attendees
  for delete using (
    exists (select 1 from hearings h
            where h.id = hearing_id and app.can_keep_legal_record(h.legal_case_id))
  );

alter table case_relations enable row level security;
alter table case_relations force row level security;

-- Both ends visible, or neither: the shape of the litigation is itself a
-- statement about the cases in it.
create policy case_relations_read on case_relations
  for select using (
    exists (select 1 from legal_cases c
            where c.id = from_case_id and app.can_see_case(c.confidentiality, c.id))
    and exists (select 1 from legal_cases c
                where c.id = to_case_id and app.can_see_case(c.confidentiality, c.id))
  );
create policy case_relations_insert on case_relations
  for insert with check (app.acts_as('admin', 'project_director', 'trustee'));
create policy case_relations_delete on case_relations
  for delete using (app.acts_as('admin', 'project_director', 'trustee'));

alter table exhibit_custody enable row level security;

create policy exhibit_custody_read on exhibit_custody
  for select using (
    exists (
      select 1 from exhibits e
      where e.id = exhibit_id and app.can_see_case_child(e.confidentiality, e.legal_case_id)
    )
  );
-- Insert only. The two triggers above refuse the rest to everybody.
create policy exhibit_custody_insert on exhibit_custody
  for insert with check (
    exists (select 1 from exhibits e
            where e.id = exhibit_id and app.can_keep_legal_record(e.legal_case_id))
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on
  case_parties, case_relations, hearings, hearing_attendees, filings,
  legal_orders, exhibits, certified_copies, case_counsel, legal_opinions
  to authenticated;

-- 0003 set default privileges granting insert, update and delete on every new
-- table in this schema, which is right for ordinary tables and wrong here: it
-- leaves the append-only triggers unreachable, so an attempt to rewrite the
-- record matches no policy and fails silently with zero rows instead of
-- saying no. Revoked explicitly, exactly as audit_log does.
revoke all on exhibit_custody from authenticated;
grant select, insert on exhibit_custody to authenticated;
grant execute on all functions in schema app to authenticated;

drop function app.add_common_columns(regclass);
