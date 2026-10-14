-- Procurement and contracts (M14).
--
-- The requirement's reasoning is that this is already happening and is
-- already undocumented: "dört avukat adayı, müteahhit seçimi, denetçi
-- arayışı, danışmanlar. Ama hiçbirinin seçim gerekçesi, teklifi ve sözleşmesi
-- tek yerde durmuyor." Four counsel were evaluated in parallel and the
-- reasoning for picking one of them lives in scattered meeting notes.
--
-- And it says why that matters here rather than generally: "Bir vakıfta bu
-- sadece verimlilik meselesi değil — bağışçıya ve denetime hesap
-- verebilirliktir." So the rules in this migration are mostly about reasons
-- being recorded at the moment the decision is taken, because afterwards is
-- when they get reconstructed.
--
-- Four of them:
--
--   1. A SELECTION MUST BE REASONED, and so must a rejection. The decision
--      note is a check constraint, not a field somebody might fill in. The
--      three advocates who were not chosen are the ones whose reasons
--      vanished, so the rejection note is where the accountability actually
--      lives.
--
--   2. ONE WINNER PER REQUEST. A partial unique index, because "we selected
--      two of them" is a request that was never really decided.
--
--   3. A SIGNED CONTRACT HAS ITS DOCUMENT. The same spine as the obligations
--      register, the accreditation checklist and site progress: a register of
--      contracts whose contracts are not attached is a list of assertions.
--
--   4. A CONTRACT TERM BECOMES AN OBLIGATION, in M2, by trigger — which is
--      M14-04 read literally ("otomatik olarak M2'ye düşer"). M2 already
--      carries evidence, breach states and a calendar; a second place for
--      contractual duties would be a second place to forget them.
--
-- The money bands are 0015's. A procurement above 25M needs the same
-- approvers a payment above 25M needs, and reusing app.required_approvers
-- means the two cannot drift into disagreeing about who may commit the trust.
--
-- Requirements: M14-01 … M14-07.

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

-- Who runs a procurement. Narrower than the people who can see it: choosing
-- a supplier commits the trust's money, and the roles that may do that are
-- the roles 0015 already lets spend it.
create or replace function app.can_procure()
returns boolean
language sql
stable
as $$
  select coalesce((app.authority()).roles && array[
    'admin', 'project_director', 'trustee', 'board_director'
  ]::app_role[], false);
$$;

-- Who may read the commercial side of a procurement: the fees, the scores,
-- the contract values. The auditors are in, because the whole point of the
-- module is being answerable to them.
create or replace function app.can_see_procurement()
returns boolean
language sql
stable
as $$
  select coalesce((app.authority()).roles && array[
    'admin', 'project_director', 'trustee', 'board_director',
    'audit_committee', 'external_auditor', 'quantity_surveyor'
  ]::app_role[], false);
$$;

-- ---------------------------------------------------------------------------
-- The request (M14-01)
-- ---------------------------------------------------------------------------

create type procurement_kind as enum (
  'legal_counsel',
  'contractor',
  'auditor',
  'consultant',
  'supplier',
  'other'
);

create type procurement_state as enum (
  'drafted',
  'approved',
  'candidates_invited',
  'awarded',
  'cancelled'
);

create table procurement_requests (
  id uuid primary key default gen_random_uuid(),
  reference_no text,
  kind procurement_kind not null,
  -- "ihtiyaç" and "gerekçe" sit next to each other in the requirement, and
  -- the justification is not optional. A need without a reason is a purchase
  -- somebody will later have to reconstruct a reason for.
  need_en text not null check (btrim(need_en) <> ''),
  need_tr text,
  justification_en text not null check (btrim(justification_en) <> ''),
  justification_tr text,
  budget_line_id uuid references budget_lines (id),
  requested_by uuid references profiles (id) default auth.uid(),
  requested_at timestamptz not null default now(),
  needed_by date,
  state procurement_state not null default 'drafted',
  approved_by uuid references profiles (id),
  approved_at timestamptz,
  decision_note text,
  cancelled_reason text,

  -- An approval has a name and a time on it, or it has not happened.
  constraint procurement_requests_approval_is_attributed
    check ((approved_by is null) = (approved_at is null)),
  constraint procurement_requests_approved_states
    check (state = 'drafted' or state = 'cancelled' or approved_at is not null),
  constraint procurement_requests_cancellation_is_reasoned
    check (state <> 'cancelled' or btrim(coalesce(cancelled_reason, '')) <> '')
);
-- "tahmini bütçe". Not nullable: a request with no estimate cannot be put
-- against an approval band, and the band is what decides who may approve it.
select app.add_money_columns('procurement_requests', 'estimated_');
select app.add_common_columns('procurement_requests');

create index procurement_requests_state_idx on procurement_requests (state, needed_by);

comment on table procurement_requests is
  'What is needed, why, and roughly what it will cost (M14-01). The '
  'justification is a check constraint rather than a field, because after the '
  'fact is when reasons get reconstructed.';

-- Approving a procurement, against the same bands that govern a payment.
--
-- Reusing app.required_approvers is the point: 0015 already decided who may
-- commit 5 million and who may commit 25, and a second set of thresholds for
-- procurement would eventually disagree with it. The band is read rather than
-- assumed, by the same function the voucher trigger uses.
create or replace function public.approve_procurement(
  p_request uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_amount numeric;
  v_conf confidentiality;
  v_state procurement_state;
  v_required app_role[];
begin
  select estimated_amount_kes, confidentiality, state
    into v_amount, v_conf, v_state
  from procurement_requests
  where id = p_request;

  if not found then
    raise exception 'no such procurement request' using errcode = 'no_data_found';
  end if;

  -- Definer, so visibility is re-checked rather than assumed: this must not
  -- become a way to approve something you cannot read.
  if not app.can_read(v_conf, 'procurement_requests', p_request) then
    raise exception 'that request is not yours to see' using errcode = 'no_data_found';
  end if;

  if v_state <> 'drafted' then
    raise exception 'that request has already been decided'
      using errcode = 'unique_violation';
  end if;

  v_required := app.required_approvers(v_amount);
  if v_required is null then
    raise exception 'no approval band covers % KES', v_amount
      using errcode = 'check_violation',
            hint = 'The bands live in approval_thresholds (0015).';
  end if;

  if not app.acts_as(variadic v_required) then
    raise exception
      'a commitment of % KES needs one of: %', v_amount, array_to_string(v_required, ', ')
      using errcode = 'insufficient_privilege';
  end if;

  -- Asking for something and approving it are two acts. On this project they
  -- have been the same person often enough that the requirement exists.
  if (select requested_by from procurement_requests where id = p_request) = auth.uid() then
    raise exception 'the person who asked for this cannot be the one who approves it'
      using errcode = 'check_violation';
  end if;

  update procurement_requests
  set state = 'approved',
      approved_by = auth.uid(),
      approved_at = now(),
      decision_note = p_note
  where id = p_request;
end;
$$;

comment on function public.approve_procurement(uuid, text) is
  'Approves a procurement against 0015''s money bands (M14-01). Refuses '
  'self-approval, and reads the band with the same function the payment '
  'voucher trigger uses so the two cannot disagree about who may commit the '
  'trust.';

-- ---------------------------------------------------------------------------
-- The candidates (M14-02, shared with M4-13)
-- ---------------------------------------------------------------------------

create type candidate_outcome as enum (
  'under_review',
  'shortlisted',
  'selected',
  'rejected',
  'withdrawn'
);

create type fee_basis as enum ('fixed', 'hourly', 'daily', 'percentage', 'retainer', 'other');

create table procurement_candidates (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references procurement_requests (id) on delete cascade,
  -- A candidate may be a firm, a person already in the stakeholder register,
  -- or neither yet. The name is always filled so the table never has a blank
  -- row; the references are enrichment, at most one of them.
  organization_id uuid references organizations (id),
  stakeholder_id uuid references stakeholders (id),
  name text not null check (btrim(name) <> ''),
  scope_en text,
  scope_tr text,
  fee_basis fee_basis not null default 'fixed',
  references_en text,
  references_tr text,
  strengths_en text,
  strengths_tr text,
  weaknesses_en text,
  weaknesses_tr text,
  score int check (score is null or score between 0 and 100),
  proposal_document_id uuid references document_vault (id),
  outcome candidate_outcome not null default 'under_review',
  -- "karar gerekçesi". Required for a decision either way, and the rejection
  -- note is the one that matters: the three advocates who were not chosen are
  -- exactly the reasons this register exists to keep.
  decision_note_en text,
  decision_note_tr text,
  decided_on date,

  constraint procurement_candidates_at_most_one_link check (
    (organization_id is not null)::int + (stakeholder_id is not null)::int <= 1
  ),
  constraint procurement_candidates_decision_is_reasoned check (
    outcome not in ('selected', 'rejected')
    or btrim(coalesce(decision_note_en, decision_note_tr, '')) <> ''
  ),
  constraint procurement_candidates_decision_is_dated check (
    outcome not in ('selected', 'rejected') or decided_on is not null
  )
);
-- "ücret". Required, because a candidate table whose fees are blank is a
-- comparison that cannot be made.
select app.add_money_columns('procurement_candidates', 'fee_');
select app.add_common_columns('procurement_candidates');

create index procurement_candidates_request_idx on procurement_candidates (request_id, outcome);

-- One winner. "We selected two of them" is a request that was never decided,
-- and a partial index is the only way to say so that cannot be forgotten.
create unique index procurement_candidates_one_selected
  on procurement_candidates (request_id)
  where outcome = 'selected';

comment on table procurement_candidates is
  'The candidate comparison of M14-02 and M4-13: proposal, scope, fee, '
  'references, strengths, weaknesses, score and the reason for the decision. '
  'A rejection has to carry its reason too — that is the half that went '
  'missing when four advocates were compared in meeting notes.';

-- Awarding is one act over two tables, so it is one function. Doing it by
-- hand leaves the window where a candidate is selected and the request is
-- still open, which is the window in which a second candidate gets selected.
create or replace function public.award_procurement(
  p_candidate uuid,
  p_reason_en text,
  p_reason_tr text default null
)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_request uuid;
  v_conf confidentiality;
  v_state procurement_state;
begin
  if not app.can_procure() then
    raise exception 'choosing a supplier is not yours to do'
      using errcode = 'insufficient_privilege';
  end if;

  if btrim(coalesce(p_reason_en, '')) = '' then
    raise exception 'an award has to say why this candidate and not the others'
      using errcode = 'check_violation';
  end if;

  select c.request_id, r.confidentiality, r.state
    into v_request, v_conf, v_state
  from procurement_candidates c
  join procurement_requests r on r.id = c.request_id
  where c.id = p_candidate;

  if not found then
    raise exception 'no such candidate' using errcode = 'no_data_found';
  end if;

  if not app.can_read(v_conf, 'procurement_requests', v_request) then
    raise exception 'that request is not yours to see' using errcode = 'no_data_found';
  end if;

  if v_state = 'drafted' then
    raise exception 'that request has not been approved yet'
      using errcode = 'check_violation';
  end if;
  if v_state in ('awarded', 'cancelled') then
    raise exception 'that request is already closed' using errcode = 'unique_violation';
  end if;

  update procurement_candidates
  set outcome = 'selected',
      decision_note_en = p_reason_en,
      decision_note_tr = p_reason_tr,
      decided_on = current_date
  where id = p_candidate;

  update procurement_requests set state = 'awarded' where id = v_request;
end;
$$;

comment on function public.award_procurement(uuid, text, text) is
  'Selects a candidate and closes the request in one act (M14-02), so there '
  'is no window in which a second candidate can also be selected. The reason '
  'is a parameter, not an afterthought.';

-- ---------------------------------------------------------------------------
-- The contract register (M14-03)
-- ---------------------------------------------------------------------------

create type contract_state as enum (
  'draft',
  'signed',
  'active',
  'suspended',
  'expired',
  'terminated'
);

-- Whether the recorded value is what will be paid or an estimate of it. An
-- hourly engagement has no fixed sum, and a blank value tells a donor
-- nothing — so the number is required and what KIND of number it is gets
-- said out loud.
create type value_basis as enum ('fixed', 'estimated', 'capped', 'rate_based');

create table contracts (
  id uuid primary key default gen_random_uuid(),
  reference_no text,
  request_id uuid references procurement_requests (id),
  candidate_id uuid references procurement_candidates (id),
  -- The counterparty, named, with at most one register link.
  counterparty_name text not null check (btrim(counterparty_name) <> ''),
  organization_id uuid references organizations (id),
  stakeholder_id uuid references stakeholders (id),
  contractor_id uuid references contractors (id),
  subject_en text not null check (btrim(subject_en) <> ''),
  subject_tr text,
  value_basis value_basis not null default 'fixed',
  signed_on date,
  starts_on date,
  ends_on date,
  -- "yenileme tarihi": the date a decision about renewal has to be taken,
  -- which is usually before the end, not on it.
  renewal_on date,
  -- "fesih şartı"
  notice_days int check (notice_days is null or notice_days >= 0),
  termination_en text,
  termination_tr text,
  document_id uuid references document_vault (id),
  state contract_state not null default 'draft',
  terminated_on date,
  termination_reason text,
  supersedes_contract_id uuid references contracts (id),
  note text,

  constraint contracts_at_most_one_link check (
    (organization_id is not null)::int
    + (stakeholder_id is not null)::int
    + (contractor_id is not null)::int <= 1
  ),
  constraint contracts_dates_run_forwards
    check (ends_on is null or starts_on is null or ends_on >= starts_on),
  constraint contracts_renewal_before_the_end
    check (renewal_on is null or ends_on is null or renewal_on <= ends_on),
  -- A register of contracts whose contracts are not attached is a list of
  -- assertions. Same rule as evidence everywhere else in this portal.
  constraint contracts_signed_has_its_document
    check (state in ('draft', 'terminated') or document_id is not null),
  constraint contracts_signed_is_dated
    check (state = 'draft' or signed_on is not null),
  constraint contracts_termination_is_reasoned check (
    state <> 'terminated'
    or (terminated_on is not null and btrim(coalesce(termination_reason, '')) <> '')
  ),
  constraint contracts_not_its_own_predecessor
    check (supersedes_contract_id is null or supersedes_contract_id <> id)
);
select app.add_money_columns('contracts', 'value_');
select app.add_common_columns('contracts');

create index contracts_state_idx on contracts (state, ends_on);
create index contracts_renewal_idx on contracts (renewal_on) where renewal_on is not null;

comment on table contracts is
  'The contract register of M14-03: party, subject, value, term, renewal '
  'date, termination clause and the document. A contract past draft must '
  'have the document in the vault — the register is of contracts, not of '
  'claims about them.';

comment on column contracts.value_basis is
  'Whether the recorded value is fixed, an estimate, a cap or a rate. An '
  'hourly engagement has no fixed sum, and the honest answer to that is to '
  'record the cap and say it is a cap, not to leave the column empty.';

-- ---------------------------------------------------------------------------
-- Contract terms land in M2 (M14-04)
-- ---------------------------------------------------------------------------

create type contract_party as enum ('us', 'counterparty');

create table contract_terms (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contracts (id) on delete cascade,
  clause text,
  title_en text not null check (btrim(title_en) <> ''),
  title_tr text,
  detail_en text,
  detail_tr text,
  owed_by contract_party not null,
  due_on date,
  -- Filled by the trigger below. Not nullable after insert, which is the
  -- mechanical form of "automatically lands in M2".
  obligation_id uuid references obligations (id)
);
select app.add_common_columns('contract_terms');

create index contract_terms_contract_idx on contract_terms (contract_id);

-- M14-04, read literally: the term becomes an obligation, at the moment it is
-- recorded, without anybody having to remember.
--
-- Definer because obligations has its own policies and this must not depend
-- on the person recording the term also being allowed to write M2 directly —
-- but it reads the contract under the caller's own visibility first, so it is
-- not a way to attach a duty to a contract you cannot see.
create or replace function app.raise_contract_obligation()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_contract contracts;
  v_obligor text;
  v_obligation uuid;
begin
  -- Already linked: this is a correction, not a new duty.
  if new.obligation_id is not null then
    return new;
  end if;

  select * into v_contract from contracts where id = new.contract_id;
  if not found then
    raise exception 'no such contract' using errcode = 'no_data_found';
  end if;

  if not app.can_read(v_contract.confidentiality, 'contracts', v_contract.id) then
    raise exception 'that contract is not yours to see' using errcode = 'no_data_found';
  end if;

  v_obligor := case new.owed_by
    when 'counterparty' then v_contract.counterparty_name
    else 'African University Trust of Kenya'
  end;

  insert into obligations (
    title_en, title_tr, detail_en, detail_tr,
    source, source_document_id,
    obligor_name, obligor_stakeholder_id,
    beneficiary_name, due_on, state, confidentiality
  )
  values (
    new.title_en,
    new.title_tr,
    concat_ws(E'\n',
      new.detail_en,
      nullif(new.clause, ''),
      format('From contract %s (%s).',
             coalesce(nullif(v_contract.reference_no, ''), v_contract.subject_en),
             v_contract.counterparty_name)),
    new.detail_tr,
    'contract',
    v_contract.document_id,
    v_obligor,
    case when new.owed_by = 'counterparty' then v_contract.stakeholder_id end,
    case new.owed_by
      when 'counterparty' then 'African University Trust of Kenya'
      else v_contract.counterparty_name
    end,
    new.due_on,
    'open',
    v_contract.confidentiality
  )
  returning id into v_obligation;

  new.obligation_id := v_obligation;
  return new;
end;
$$;

create trigger contract_terms_become_obligations
  before insert on contract_terms
  for each row execute function app.raise_contract_obligation();

comment on function app.raise_contract_obligation() is
  'M14-04: a contract term becomes an obligation in M2 as it is recorded. M2 '
  'already carries evidence, breach states and a calendar, so a second home '
  'for contractual duties would only be a second place to forget them.';

-- ---------------------------------------------------------------------------
-- The 90/60/30 warning (M14-05)
-- ---------------------------------------------------------------------------

-- Bands rather than a raw number of days, because the question a screen asks
-- is "which contracts need attention now", and three answers are easier to
-- act on than ninety.
create type notice_band as enum ('overdue', 'within_30', 'within_60', 'within_90', 'later');

create or replace function app.notice_band(p_date date, p_from date default current_date)
returns notice_band
language sql
immutable
as $$
  select case
    when p_date is null then null
    when p_date < p_from then 'overdue'
    when p_date <= p_from + 30 then 'within_30'
    when p_date <= p_from + 60 then 'within_60'
    when p_date <= p_from + 90 then 'within_90'
    else 'later'
  end::notice_band;
$$;

create view contract_alerts with (security_invoker = true) as
select
  c.id as contract_id,
  c.reference_no,
  c.counterparty_name,
  c.subject_en,
  c.subject_tr,
  c.state,
  c.starts_on,
  c.ends_on,
  c.renewal_on,
  c.notice_days,
  c.value_amount,
  c.value_currency,
  c.value_amount_kes,
  c.value_basis,
  -- The renewal decision usually falls due before the contract does, so both
  -- dates get a band and the screen sorts on whichever is sooner.
  app.notice_band(c.renewal_on) as renewal_band,
  app.notice_band(c.ends_on) as expiry_band,
  least(
    coalesce(c.renewal_on, 'infinity'::date),
    coalesce(c.ends_on, 'infinity'::date)
  ) as next_date,
  case
    when c.ends_on is not null then c.ends_on - current_date
  end as days_to_expiry,
  case
    when c.renewal_on is not null then c.renewal_on - current_date
  end as days_to_renewal,
  -- Whether anybody has already written the next contract. A renewal nobody
  -- has drafted is the thing the alert is for.
  exists (
    select 1 from contracts n where n.supersedes_contract_id = c.id
  ) as renewal_drafted,
  c.confidentiality
from contracts c
-- A contract that has ended or been torn up needs no warning about ending.
where c.state in ('draft', 'signed', 'active', 'suspended');

comment on view contract_alerts is
  'Contracts approaching renewal or expiry, in 90/60/30 bands (M14-05). '
  '`renewal_drafted` is the column that closes the loop: a renewal date '
  'nobody has acted on is the one worth surfacing.';

-- ---------------------------------------------------------------------------
-- Supplier performance (M14-06)
-- ---------------------------------------------------------------------------

-- The register this replaces was a single `performance_note` column on
-- contractors — one note, overwritten each time, with no period and no
-- history. For a module whose stated purpose is accountability to donors and
-- auditors, a record that the last person to touch it decides is not a
-- record. So: dated, scored, append-only reviews, and the column goes.
alter table contractors
  drop column if exists performance_note,
  drop column if exists performance_noted_by,
  drop column if exists performance_noted_at;

create table supplier_reviews (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid references contracts (id) on delete set null,
  organization_id uuid references organizations (id) on delete cascade,
  stakeholder_id uuid references stakeholders (id) on delete cascade,
  contractor_id uuid references contractors (id) on delete cascade,
  period_start date,
  period_end date,
  -- The four things that actually go wrong on this project, each 1 to 5. All
  -- four are required: a review that scores nothing is a note, and there is a
  -- column for notes.
  quality int not null check (quality between 1 and 5),
  timeliness int not null check (timeliness between 1 and 5),
  cost_control int not null check (cost_control between 1 and 5),
  cooperation int not null check (cooperation between 1 and 5),
  overall numeric(3, 2) generated always as (
    (quality + timeliness + cost_control + cooperation) / 4.0
  ) stored,
  note_en text not null check (btrim(note_en) <> ''),
  note_tr text,
  document_id uuid references document_vault (id),
  reviewed_by uuid not null references profiles (id) default auth.uid(),
  reviewed_at timestamptz not null default now(),

  constraint supplier_reviews_one_party check (
    (organization_id is not null)::int
    + (stakeholder_id is not null)::int
    + (contractor_id is not null)::int = 1
  ),
  constraint supplier_reviews_period
    check (period_end is null or period_start is null or period_end >= period_start)
);
select app.add_common_columns('supplier_reviews');

create index supplier_reviews_contractor_idx on supplier_reviews (contractor_id, reviewed_at desc);
create index supplier_reviews_organization_idx on supplier_reviews (organization_id, reviewed_at desc);

comment on table supplier_reviews is
  'Dated, scored performance reviews (M14-06). Append-only: a review that '
  'can be revised later by the person it embarrasses is not evidence, and a '
  'correcting review is how a mistake gets fixed.';

-- ---------------------------------------------------------------------------
-- Payment schedule, matched to the works (M14-07)
-- ---------------------------------------------------------------------------

create type milestone_state as enum ('planned', 'due', 'certified', 'paid', 'cancelled');

create table contract_milestones (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contracts (id) on delete cascade,
  sequence int not null,
  title_en text not null check (btrim(title_en) <> ''),
  title_tr text,
  due_on date,
  state milestone_state not null default 'planned',
  -- The match M14-07 asks for: which measured valuation and which voucher
  -- settled this instalment. Both optional, because a legal retainer has
  -- neither, but where they exist the chain is contract → milestone →
  -- valuation → voucher → ledger.
  valuation_id uuid references valuations (id),
  payment_voucher_id uuid references payment_vouchers (id),
  note text,

  unique (contract_id, sequence),
  constraint contract_milestones_paid_has_a_voucher
    check (state <> 'paid' or payment_voucher_id is not null)
);
select app.add_money_columns('contract_milestones');
select app.add_common_columns('contract_milestones');

comment on table contract_milestones is
  'The payment schedule, matched to the valuation and the voucher that '
  'settled each instalment (M14-07). A milestone marked paid has to name its '
  'voucher, so the schedule and the ledger cannot disagree.';

-- Contract value against what has been scheduled and what has actually been
-- paid. `over_committed` is named rather than refused: a variation that
-- raises the price is a real thing, and the useful behaviour is to say the
-- schedule now exceeds the recorded value, not to block the entry and leave
-- somebody keeping the real figure in a spreadsheet.
create view contract_settlement with (security_invoker = true) as
select
  c.id as contract_id,
  c.reference_no,
  c.counterparty_name,
  c.subject_en,
  c.subject_tr,
  c.state,
  c.value_basis,
  c.value_amount_kes as value_kes,
  tally.milestones,
  tally.scheduled_kes,
  tally.paid_kes,
  tally.next_due,
  case
    when c.value_amount_kes is null or c.value_amount_kes = 0 then null
    else round(100 * coalesce(tally.paid_kes, 0) / c.value_amount_kes, 1)
  end as percent_paid,
  (coalesce(tally.scheduled_kes, 0) > c.value_amount_kes) as over_committed,
  c.confidentiality
from contracts c
cross join lateral (
  select
    count(*)::int as milestones,
    sum(m.amount_kes) filter (where m.state <> 'cancelled') as scheduled_kes,
    sum(m.amount_kes) filter (where m.state = 'paid') as paid_kes,
    min(m.due_on) filter (where m.state in ('planned', 'due')) as next_due
  from contract_milestones m
  where m.contract_id = c.id
) tally;

comment on view contract_settlement is
  'What each contract is worth, what has been scheduled against it and what '
  'has been paid (M14-07). over_committed is reported rather than refused: a '
  'variation is a real thing, and blocking the entry only moves the true '
  'figure into a spreadsheet.';

-- ---------------------------------------------------------------------------
-- The calendar needs a word for a contract date
-- ---------------------------------------------------------------------------

-- Added here and used in 0023. Postgres will not let a new enum value be used
-- in the same transaction that creates it, and each migration file is one
-- transaction, so the split is mechanical rather than editorial.
alter type calendar_kind add value if not exists 'contract';

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

-- Procurement is internal business, with two deliberate exceptions.
--
-- The auditors are named rather than left to a per-record grant, because the
-- requirement's whole reason for existing is being answerable to them: "Bir
-- vakıfta bu sadece verimlilik meselesi değil — bağışçıya ve denetime hesap
-- verebilirliktir." The quantity surveyor is named because pricing the work
-- against the contract is their job.
--
-- Both are external roles, so app.max_clearance still caps them at internal:
-- a procurement classified confidential stays out of their reach, and
-- sharing one with them is a deliberate grant.
create or replace function app.can_see_procurement_record(
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
      or a.roles && array['external_auditor', 'quantity_surveyor']::app_role[]
      or app.has_grant(p_type, p_id, 'read')
    );
end;
$$;

-- --- requests --------------------------------------------------------------

alter table procurement_requests enable row level security;
alter table procurement_requests force row level security;

create policy procurement_requests_read on procurement_requests for select to authenticated
  using (app.can_see_procurement_record(confidentiality, 'procurement_requests', id));

-- Anybody inside who needs something may ask for it. Making this the board's
-- job is how needs stop being written down and start being bought.
create policy procurement_requests_insert on procurement_requests for insert to authenticated
  with check (
    app.can_read(confidentiality)
    and requested_by = auth.uid()
    and (app.can_write() or app.can_procure())
  );

-- Changing a request is the board's; the state transitions go through
-- approve_procurement and award_procurement, which check the money band.
create policy procurement_requests_update on procurement_requests for update to authenticated
  using (
    app.can_see_procurement_record(confidentiality, 'procurement_requests', id)
    and (app.can_procure() or requested_by = auth.uid())
  )
  with check (app.can_procure() or requested_by = auth.uid());

create policy procurement_requests_delete on procurement_requests for delete to authenticated
  using (app.is_admin());

-- --- candidates ------------------------------------------------------------

alter table procurement_candidates enable row level security;
alter table procurement_candidates force row level security;

-- The comparison table carries fees, scores and candid notes about named
-- firms, so it is for the people who decide and the people who audit — not
-- for everybody who can see that a request exists.
create policy procurement_candidates_read on procurement_candidates for select to authenticated
  using (
    app.can_see_procurement()
    and exists (
      select 1 from procurement_requests r
      where r.id = request_id
        and app.can_see_procurement_record(r.confidentiality, 'procurement_requests', r.id)
    )
  );

create policy procurement_candidates_insert on procurement_candidates for insert to authenticated
  with check (
    app.can_procure()
    and exists (
      select 1 from procurement_requests r
      where r.id = request_id
        and app.can_see_procurement_record(r.confidentiality, 'procurement_requests', r.id)
    )
  );

create policy procurement_candidates_update on procurement_candidates for update to authenticated
  using (app.can_procure() and app.can_see_procurement())
  with check (app.can_procure());

create policy procurement_candidates_delete on procurement_candidates for delete to authenticated
  using (app.is_admin());

-- --- contracts -------------------------------------------------------------

alter table contracts enable row level security;
alter table contracts force row level security;

-- Plus the counterparty's own copy, where the counterparty is a person in the
-- stakeholder register with a profile. A firm recorded only as a contractors
-- row has no link to a signed-in account, so a contractor reaches their own
-- contract through a per-record grant — which is the deliberate route and not
-- a gap to be papered over with a guess about identity.
create policy contracts_read on contracts for select to authenticated
  using (
    app.can_see_procurement_record(confidentiality, 'contracts', id)
    or app.caller_is(null, stakeholder_id)
  );

create policy contracts_insert on contracts for insert to authenticated
  with check (app.can_read(confidentiality) and app.can_procure());

create policy contracts_update on contracts for update to authenticated
  using (app.can_see_procurement_record(confidentiality, 'contracts', id) and app.can_procure())
  with check (app.can_procure());

create policy contracts_delete on contracts for delete to authenticated
  using (app.is_admin());

-- --- terms -----------------------------------------------------------------

alter table contract_terms enable row level security;
alter table contract_terms force row level security;

create policy contract_terms_read on contract_terms for select to authenticated
  using (
    exists (
      select 1 from contracts c
      where c.id = contract_id
        and (
          app.can_see_procurement_record(c.confidentiality, 'contracts', c.id)
          or app.caller_is(null, c.stakeholder_id)
        )
    )
  );

create policy contract_terms_insert on contract_terms for insert to authenticated
  with check (
    app.can_procure()
    and exists (
      select 1 from contracts c
      where c.id = contract_id
        and app.can_see_procurement_record(c.confidentiality, 'contracts', c.id)
    )
  );

create policy contract_terms_update on contract_terms for update to authenticated
  using (app.can_procure())
  with check (app.can_procure());

create policy contract_terms_delete on contract_terms for delete to authenticated
  using (app.is_admin());

-- --- performance -----------------------------------------------------------

alter table supplier_reviews enable row level security;
alter table supplier_reviews force row level security;

create policy supplier_reviews_read on supplier_reviews for select to authenticated
  using (app.can_see_procurement_record(confidentiality, 'supplier_reviews', id));

create policy supplier_reviews_insert on supplier_reviews for insert to authenticated
  with check (
    app.can_read(confidentiality)
    and reviewed_by = auth.uid()
    and app.can_procure()
  );

-- Append-only, as 0013 made site progress and 0021 made evidenced
-- achievements. A performance record the last person to touch it decides is
-- not a record, and a correcting review is how a mistake gets fixed.
create trigger supplier_reviews_append_only
  before update or delete on supplier_reviews
  for each row execute function app.refuse_audit_mutation();

revoke update, delete on supplier_reviews from authenticated;

-- --- the payment schedule --------------------------------------------------

alter table contract_milestones enable row level security;
alter table contract_milestones force row level security;

create policy contract_milestones_read on contract_milestones for select to authenticated
  using (
    exists (
      select 1 from contracts c
      where c.id = contract_id
        and (
          app.can_see_procurement_record(c.confidentiality, 'contracts', c.id)
          or app.caller_is(null, c.stakeholder_id)
        )
    )
  );

create policy contract_milestones_insert on contract_milestones for insert to authenticated
  with check (
    app.can_procure()
    and exists (
      select 1 from contracts c
      where c.id = contract_id
        and app.can_see_procurement_record(c.confidentiality, 'contracts', c.id)
    )
  );

create policy contract_milestones_update on contract_milestones for update to authenticated
  using (app.can_procure())
  with check (app.can_procure());

create policy contract_milestones_delete on contract_milestones for delete to authenticated
  using (app.is_admin());

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select on contract_alerts to authenticated;
grant select on contract_settlement to authenticated;
grant execute on all functions in schema app to authenticated;
