-- The obligations and commitments register (M2).
--
-- This is the connective tissue. Four separate sources have put obligations
-- on this project and none of them sit together anywhere:
--
--   the lease         — a mosque on the campus, full scholarships for 20%
--   court orders      — no boundary interference, no sale, a construction limit
--   the trust deed    — Cap 164 organs, meetings, registration
--   the MoU and rules — the county agreement, the CUE accreditation terms
--
-- And then there are the promises people make: a minister who says he will
-- use his contacts, an ambassador who asks for a briefing, a trustee who
-- takes something on. Those live inside meeting notes today and are not
-- followed at all.
--
-- Both are the same thing: something a party undertook to do, with a date,
-- that ought to have evidence. One register holds them.
--
-- Requirements: M2-01 … M2-09.

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

create type obligation_source as enum (
  'lease',
  'court_order',
  'trust_deed',
  'mou',
  'statute',
  'contract',
  'personal_commitment'
);

create type obligation_state as enum (
  'open',
  'in_progress',
  'fulfilled',
  'at_risk',
  'breached',
  -- A court can stop the clock on something the lease requires. That is not
  -- the same as having done it, and not the same as having failed.
  'suspended'
);

-- ---------------------------------------------------------------------------
-- The register
-- ---------------------------------------------------------------------------

create table obligations (
  id uuid primary key default gen_random_uuid(),
  title_en text,
  title_tr text,
  detail_en text,
  detail_tr text,

  source obligation_source not null,
  -- M2-02. The paper the obligation comes from. Where there is none, the row
  -- still exists — an unrecorded obligation is worse than an unverified one —
  -- but it says so, and `verified` below is not something anyone can set.
  source_document_id uuid references document_vault (id) on delete set null,
  -- M2-05. Set when a court order created this.
  source_legal_order_id uuid references legal_orders (id) on delete set null,
  -- M2-07. Set when somebody undertook it in a meeting.
  source_meeting_id uuid references meetings (id) on delete set null,
  source_decision_id uuid references decisions (id) on delete set null,

  -- Who owes it. Often an entity rather than a person — "AUTK", "the lessee",
  -- "the contractor" — so the name always stands, and the links are made when
  -- there is somebody to link to.
  obligor_name text not null,
  obligor_stakeholder_id uuid references stakeholders (id) on delete set null,
  obligor_profile_id uuid references profiles (id) on delete set null,
  -- Who it is owed to.
  beneficiary_name text,

  due_on date,
  state obligation_state not null default 'open',

  -- M2-06. Whether this forbids something rather than requiring it, which is
  -- what makes a conflict with site work checkable at all.
  prohibits boolean not null default false,

  -- M2-02, and deliberately generated: "verified" means a document is
  -- attached, and nothing else. It is not a judgement anyone can record.
  verified boolean generated always as (source_document_id is not null) stored,

  constraint obligations_has_title check (
    btrim(coalesce(title_en, '')) <> '' or btrim(coalesce(title_tr, '')) <> ''
  ),
  constraint obligations_obligor_not_blank check (btrim(obligor_name) <> ''),
  -- A commitment made in a meeting says which meeting.
  constraint obligations_commitments_are_sourced check (
    source <> 'personal_commitment' or source_meeting_id is not null
  ),
  -- And one created by an order says which order.
  constraint obligations_orders_are_sourced check (
    source <> 'court_order' or source_legal_order_id is not null
  )
);

select app.add_common_columns('obligations');
create index obligations_due_idx on obligations (due_on)
  where state in ('open', 'in_progress', 'at_risk');
create index obligations_obligor_idx on obligations (obligor_stakeholder_id);
create index obligations_order_idx on obligations (source_legal_order_id);
create index obligations_prohibits_idx on obligations (prohibits) where prohibits;

-- ---------------------------------------------------------------------------
-- Evidence (M2-04)
-- ---------------------------------------------------------------------------
--
-- "Done" without evidence is a claim, not a record — and on this project the
-- claims that matter are ones a court may later be asked to believe. So the
-- register will not let an obligation be marked fulfilled until something is
-- attached to it.

create table obligation_evidence (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references obligations (id) on delete cascade,
  description text not null,
  document_id uuid references document_vault (id) on delete set null,
  -- A photograph, a receipt, a court stamp; sometimes the evidence is a
  -- decision recorded elsewhere in the portal.
  decision_id uuid references decisions (id) on delete set null,
  observed_on date,

  constraint obligation_evidence_description_not_blank check (btrim(description) <> '')
);

select app.add_common_columns('obligation_evidence');
create index obligation_evidence_idx on obligation_evidence (obligation_id);

create or replace function app.require_evidence_before_fulfilled()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.state = 'fulfilled' and (tg_op = 'INSERT' or old.state is distinct from 'fulfilled') then
    if not exists (select 1 from obligation_evidence e where e.obligation_id = new.id) then
      raise exception
        'an obligation cannot be marked fulfilled until evidence is attached to it'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

-- After insert of the evidence, before the state moves: the check runs on the
-- obligation, so attaching evidence first is the only order that works.
create trigger obligations_evidence_before_fulfilled
  before insert or update of state on obligations
  for each row execute function app.require_evidence_before_fulfilled();

-- ---------------------------------------------------------------------------
-- Proceeding anyway (M2-06)
-- ---------------------------------------------------------------------------
--
-- The requirement is explicit that the system warns and asks, and does not
-- block. That is right: this project decided, unanimously, to continue
-- building while an order was in force. A portal that refused to record that
-- would not have stopped it — it would only have meant the decision left no
-- trace.
--
-- So the record is the feature. Append-only, for the same reason as the audit
-- log: a deliberate risk that can be erased afterwards was never recorded.

create table obligation_overrides (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references obligations (id) on delete cascade,

  -- What is being done in spite of it.
  construction_block_id uuid references construction_blocks (id) on delete set null,
  action_item_id uuid references action_items (id) on delete set null,
  note_of_what text not null,

  -- And on whose authority.
  decision_id uuid references decisions (id) on delete set null,
  reason text not null,
  acknowledged_by uuid not null references profiles (id),
  acknowledged_at timestamptz not null default now(),

  constraint obligation_overrides_reason_not_blank check (btrim(reason) <> ''),
  constraint obligation_overrides_what_not_blank check (btrim(note_of_what) <> '')
);

create index obligation_overrides_idx on obligation_overrides (obligation_id);

create or replace function app.refuse_override_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'a recorded override is append-only (attempted %)', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger obligation_overrides_no_update
  before update on obligation_overrides
  for each row execute function app.refuse_override_mutation();

create trigger obligation_overrides_no_delete
  before delete on obligation_overrides
  for each row execute function app.refuse_override_mutation();

create trigger obligation_overrides_audit
  after insert on obligation_overrides
  for each row execute function app.record_audit();

-- ---------------------------------------------------------------------------
-- Who may see and keep the register
-- ---------------------------------------------------------------------------

-- Reading: internal business, except that whoever owes something sees what
-- they owe. A contractor bound by a court order has to be able to read the
-- obligation without being shown the rest of the file.
create or replace function app.can_see_obligation(
  p_conf confidentiality,
  p_id uuid,
  p_obligor_profile uuid,
  p_obligor_stakeholder uuid
)
returns boolean
language sql
stable
as $$
  select app.can_read(p_conf, 'obligations', p_id)
    and (
      p_conf = 'public'
      or app.is_internal()
      or app.caller_is(p_obligor_profile, p_obligor_stakeholder)
      or app.has_grant('obligations', p_id, 'read')
    );
$$;

alter table obligations enable row level security;
alter table obligations force row level security;

create policy obligations_read on obligations
  for select using (
    app.can_see_obligation(confidentiality, id, obligor_profile_id, obligor_stakeholder_id)
  );

-- What the lease, a court or the trust deed requires is not the field team's
-- to declare. A promise somebody made in a meeting is different: whoever is
-- minuting writes it down while it is still being said, and that is the
-- point of M2-07.
create policy obligations_insert on obligations
  for insert with check (
    case source
      when 'personal_commitment' then app.can_minute()
      else app.can_assess()
    end
  );

create policy obligations_update on obligations
  for update
  using (
    app.can_see_obligation(confidentiality, id, obligor_profile_id, obligor_stakeholder_id)
    and app.can_assess()
  )
  with check (app.can_assess());

create policy obligations_delete on obligations
  for delete
  using (
    app.can_see_obligation(confidentiality, id, obligor_profile_id, obligor_stakeholder_id)
    and app.acts_as('admin', 'project_director')
  );

alter table obligation_evidence enable row level security;
alter table obligation_evidence force row level security;

create policy obligation_evidence_read on obligation_evidence
  for select using (
    exists (
      select 1 from obligations o
      where o.id = obligation_id
        and app.can_see_obligation(o.confidentiality, o.id, o.obligor_profile_id,
                                   o.obligor_stakeholder_id)
    )
  );

-- Whoever owes it may show that they did it. That is the whole of what an
-- external obligor can do here, and it is the part that matters to them.
create policy obligation_evidence_insert on obligation_evidence
  for insert with check (
    exists (
      select 1 from obligations o
      where o.id = obligation_id
        and (app.can_minute()
             or app.caller_is(o.obligor_profile_id, o.obligor_stakeholder_id))
    )
  );

create policy obligation_evidence_update on obligation_evidence
  for update using (app.can_assess()) with check (app.can_assess());

create policy obligation_evidence_delete on obligation_evidence
  for delete using (app.can_assess());

alter table obligation_overrides enable row level security;

create policy obligation_overrides_read on obligation_overrides
  for select using (app.is_internal());

-- Only the people who answer for the project may put their name to
-- proceeding in spite of an obligation, and the column records which name.
create policy obligation_overrides_insert on obligation_overrides
  for insert with check (acknowledged_by = auth.uid() and app.can_assess());

-- ---------------------------------------------------------------------------
-- What is coming, and who keeps their word
-- ---------------------------------------------------------------------------

-- M2-09. The thresholds the requirement names, as a band rather than five
-- separate alerts: an obligation is in exactly one of them at a time.
create view obligation_deadlines with (security_invoker = true) as
select
  o.id,
  o.title_en,
  o.title_tr,
  o.source,
  o.obligor_name,
  o.obligor_stakeholder_id,
  o.obligor_profile_id,
  o.due_on,
  o.state,
  o.verified,
  o.confidentiality,
  (o.due_on - current_date) as days_remaining,
  case
    when o.due_on is null then null
    when o.due_on < current_date then 0
    when o.due_on - current_date <= 1 then 1
    when o.due_on - current_date <= 7 then 7
    when o.due_on - current_date <= 14 then 14
    when o.due_on - current_date <= 30 then 30
    when o.due_on - current_date <= 60 then 60
    else null
  end as threshold_days,
  (o.due_on is not null and o.due_on < current_date) as overdue
from obligations o
where o.state in ('open', 'in_progress', 'at_risk');

comment on view obligation_deadlines is
  'Open obligations with the reminder band they have entered (M2-09). Rows '
  'are filtered by the same policy as the register itself.';

-- M2-08. The hardest and most honest metric in relationship management: of
-- what this person undertook, how much did they do?
--
-- Only obligations tied to somebody in the register count, and only ones that
-- have been settled one way or the other — counting open promises as broken
-- would make the number a measure of time rather than of the person.
create view stakeholder_commitments with (security_invoker = true) as
select
  o.obligor_stakeholder_id as stakeholder_id,
  count(*) as undertaken,
  count(*) filter (where o.state = 'fulfilled') as kept,
  count(*) filter (where o.state = 'breached') as broken,
  count(*) filter (where o.state in ('open', 'in_progress', 'at_risk')) as outstanding,
  count(*) filter (where o.state in ('open', 'in_progress', 'at_risk')
                     and o.due_on is not null and o.due_on < current_date) as overdue,
  case
    when count(*) filter (where o.state in ('fulfilled', 'breached')) = 0 then null
    else round(
      100.0 * count(*) filter (where o.state = 'fulfilled')
            / count(*) filter (where o.state in ('fulfilled', 'breached'))
    )
  end as kept_percent
from obligations o
where o.obligor_stakeholder_id is not null
group by o.obligor_stakeholder_id;

comment on view stakeholder_commitments is
  'Of what somebody undertook, how much they did (M2-08). Null percentage '
  'means nothing of theirs has been settled yet, which is not the same as zero.';

-- M2-06 again, from the other side: which prohibitions are live right now, so
-- a site task can be checked against them before it is opened.
create view active_prohibitions with (security_invoker = true) as
select
  o.id,
  o.title_en,
  o.title_tr,
  o.detail_en,
  o.detail_tr,
  o.source,
  o.source_legal_order_id,
  o.due_on,
  o.confidentiality
from obligations o
where o.prohibits
  and o.state in ('open', 'in_progress', 'at_risk');

comment on view active_prohibitions is
  'Obligations that forbid something and are still live, for checking a '
  'proposed site task against (M2-06). The portal warns and records; it does '
  'not block.';

grant select, insert, update, delete on obligations, obligation_evidence to authenticated;
-- 0003 set default privileges granting insert, update and delete on every new
-- table in this schema, which is right for ordinary tables and wrong here: it
-- leaves the append-only triggers unreachable, so an attempt to rewrite the
-- record matches no policy and fails silently with zero rows instead of
-- saying no. Revoked explicitly, exactly as audit_log does.
revoke all on obligation_overrides from authenticated;
grant select, insert on obligation_overrides to authenticated;
grant select on obligation_deadlines, stakeholder_commitments, active_prohibitions
  to authenticated;
grant execute on all functions in schema app to authenticated;

drop function app.add_common_columns(regclass);
