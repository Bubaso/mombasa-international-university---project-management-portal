-- Budget, money and donor transparency (M8).
--
-- The evaluation called budget management one of two things the old portal
-- did well, and that was half right: the discipline was there, the
-- verifiability was not. A fake accounting sync reported a live connection
-- that was a timer. Figures appeared with no stated source. And a badge
-- saying "audited" sat on a boolean column any signed-in writer could set to
-- true.
--
-- Donors are in Türkiye, the spending is in Kenya, the audit is somewhere
-- else. Money is where trust in this project is measured, so a single badge
-- that is not real takes the credibility of everything else with it.
--
-- Four decisions follow from that:
--
--   1. **Audited is not a column anybody can write.** `authenticated` holds
--      no privilege on it. One security-definer function sets it, and it
--      checks that the caller is the audit committee or the external
--      auditor. Nothing else can produce the badge (M8-06).
--   2. **Budget, committed, spent and remaining are computed**, from the
--      vouchers and the ledger, never stored side by side where they can
--      drift apart (M8-02).
--   3. **Every amount carries its currency and the rate used**, and the base
--      figure is generated from the two, so a converted number cannot
--      disagree with what it was converted from (M8-03).
--   4. **A pledge is not a receipt.** They are two tables, and what is
--      outstanding is the difference (M8-08).
--
-- Requirements: M8-01 … M8-10.

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

create type voucher_state as enum (
  'requested',
  'approved',
  'rejected',
  'paid',
  -- Withdrawn by the person who raised it, before anybody ruled on it.
  'withdrawn'
);

create type donation_state as enum ('pledged', 'partly_received', 'received', 'lapsed');

-- ---------------------------------------------------------------------------
-- Money, and the rate it was converted at (M8-03)
-- ---------------------------------------------------------------------------

-- Everything here is reported against one base so that totals are possible at
-- all. KES is that base because it is where the spending happens; it is a
-- unit of account, not a claim that Kenyan shillings are the real money and
-- the rest are conversions.
--
-- The rate lives on the row rather than in a rates table the sums look up
-- later, because the figure that matters is the one that applied on the day
-- the money moved. A later table would silently restate history.
create or replace function app.add_money_columns(p_table regclass, p_prefix text default '')
returns void
language plpgsql
as $$
declare
  amount text := p_prefix || 'amount';
  currency text := p_prefix || 'currency';
  rate text := p_prefix || 'fx_rate_to_kes';
  base text := p_prefix || 'amount_kes';
begin
  execute format($f$
    alter table %1$s
      add column %2$I numeric(16, 2) not null,
      add column %3$I currency_code not null default 'KES',
      add column %4$I numeric(14, 6) not null default 1,
      add column %5$I numeric(18, 2)
        generated always as (round(%2$I * %4$I, 2)) stored,
      add constraint %6$I check (%4$I > 0),
      add constraint %7$I check (%3$I <> 'KES' or %4$I = 1);
  $f$, p_table, amount, currency, rate, base,
      p_table::text || '_' || rate || '_positive',
      p_table::text || '_base_rate_is_one');
end;
$$;

-- ---------------------------------------------------------------------------
-- The budget (M8-01)
-- ---------------------------------------------------------------------------

-- Categories are rows, not an enum, because M8-09 asks for the spend
-- distribution to be computed from the data. An enum would put the list of
-- categories in a migration and the distribution in a hard-coded array, which
-- is how the old dashboard got its pie chart.
create table budget_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_en text not null,
  name_tr text,
  sequence int not null default 0
);
select app.add_common_columns('budget_categories');

create table budget_lines (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid references project_phases (id) on delete set null,
  budget_category_id uuid not null references budget_categories (id),
  -- The bridge to M7: a budget line can name the work it pays for.
  work_package_id uuid references work_packages (id) on delete set null,
  construction_block_id uuid references construction_blocks (id) on delete set null,
  title_en text not null,
  title_tr text,
  note text
);
select app.add_money_columns('budget_lines');
select app.add_common_columns('budget_lines');

create index budget_lines_category_idx on budget_lines (budget_category_id);

-- ---------------------------------------------------------------------------
-- Payment vouchers (M8-04, M8-05)
-- ---------------------------------------------------------------------------

-- Who has to sign, at what size. Rows rather than a constant, so a board can
-- change its own thresholds without a migration — and so the thresholds that
-- applied are themselves auditable.
create table approval_thresholds (
  id uuid primary key default gen_random_uuid(),
  min_amount_kes numeric(18, 2) not null unique,
  required_roles app_role[] not null,
  note text,
  constraint approval_thresholds_roles_not_empty check (cardinality(required_roles) > 0)
);
select app.add_common_columns('approval_thresholds');

insert into approval_thresholds (min_amount_kes, required_roles, note) values
  (0, '{admin,project_director}', 'Routine spending.'),
  (5000000, '{admin,board_director,trustee}', 'Above five million, the board.'),
  (25000000, '{admin,trustee}', 'Above twenty-five million, the trustees.');

create table payment_vouchers (
  id uuid primary key default gen_random_uuid(),
  reference_no text not null unique,
  budget_line_id uuid references budget_lines (id) on delete set null,
  payee text not null,
  purpose text not null,
  requested_by uuid not null references profiles (id) default auth.uid(),
  requested_at timestamptz not null default now(),
  state voucher_state not null default 'requested',

  -- M7-08: a valuation is the commonest reason a voucher exists at all.
  valuation_id uuid references valuations (id) on delete set null,

  decided_by uuid references profiles (id),
  decided_at timestamptz,
  decision_note text,

  -- What the budget line had left when the approval was given.
  --
  -- Stamped by the trigger below rather than read off a screen, because the
  -- point of a budget check is to be part of the record: without it, "was
  -- this approved knowing the line was already overspent" is unanswerable
  -- afterwards.
  budget_remaining_at_decision numeric(18, 2),

  paid_at timestamptz,

  constraint payment_vouchers_decision_is_whole check (
    (decided_by is null) = (decided_at is null)
  ),
  constraint payment_vouchers_decided_states check (
    state not in ('approved', 'rejected', 'paid') or decided_at is not null
  ),
  constraint payment_vouchers_paid_after_approval check (
    (paid_at is null) or state = 'paid'
  )
);
select app.add_money_columns('payment_vouchers');
select app.add_common_columns('payment_vouchers');

create index payment_vouchers_state_idx on payment_vouchers (state);
create index payment_vouchers_line_idx on payment_vouchers (budget_line_id);

-- Every ruling on a voucher, kept whole. The voucher row carries the current
-- decision; this carries all of them, including the ones that were reversed.
create table voucher_approvals (
  id uuid primary key default gen_random_uuid(),
  payment_voucher_id uuid not null references payment_vouchers (id) on delete cascade,
  decision voucher_state not null,
  decided_by uuid not null references profiles (id) default auth.uid(),
  decided_at timestamptz not null default now(),
  acting_as app_role not null,
  note text,
  constraint voucher_approvals_is_a_ruling check (decision in ('approved', 'rejected'))
);

create index voucher_approvals_voucher_idx on voucher_approvals (payment_voucher_id);

alter table voucher_approvals enable row level security;
alter table voucher_approvals force row level security;

create or replace function app.refuse_approval_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'a recorded approval is append-only (attempted %)', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger voucher_approvals_no_update before update on voucher_approvals
  for each row execute function app.refuse_approval_mutation();
create trigger voucher_approvals_no_delete before delete on voucher_approvals
  for each row execute function app.refuse_approval_mutation();

-- What is left on a budget line right now, in base currency.
create or replace function app.budget_remaining(p_line uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select l.amount_kes from budget_lines l where l.id = p_line), 0)
    - coalesce((
      select sum(v.amount_kes) from payment_vouchers v
      where v.budget_line_id = p_line and v.state in ('approved', 'paid')), 0);
$$;

-- Which roles have to sign for an amount of this size.
--
-- Security definer, because the bands are a rule of the institution rather
-- than a row belonging to the caller. Read under the caller's own policies, a
-- contractor's lookup would come back empty and the refusal would say "no
-- threshold covers this amount" — which is both untrue and a worse answer
-- than the real one.
create or replace function app.required_approvers(p_amount_kes numeric)
returns app_role[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.required_roles
  from approval_thresholds t
  where t.min_amount_kes <= p_amount_kes
  order by t.min_amount_kes desc
  limit 1;
$$;

-- The rules a decision has to satisfy, in one place: the right person for the
-- size of it, a ruling that is not their own request, and the state of the
-- budget written down at the moment they said yes.
create or replace function app.rule_on_voucher()
returns trigger
language plpgsql
as $$
declare
  v_required app_role[];
  v_amount_kes numeric;
begin
  if tg_op = 'UPDATE' and new.state is not distinct from old.state then
    return new;
  end if;

  -- Computed here rather than read off `new.amount_kes`: a stored generated
  -- column is filled after the before-row triggers have run, so the column is
  -- null at this point. Same expression, same answer, just earlier.
  v_amount_kes := round(new.amount * new.fx_rate_to_kes, 2);

  if new.state in ('approved', 'rejected') then
    if new.decided_by is null then
      new.decided_by := auth.uid();
      new.decided_at := now();
    end if;

    -- M8-05. The band is read from the table, so thresholds are data.
    v_required := app.required_approvers(v_amount_kes);

    if v_required is null then
      raise exception 'no approval threshold covers % KES', v_amount_kes
        using errcode = 'check_violation';
    end if;

    if not app.acts_as(variadic v_required) then
      raise exception
        'a voucher of % KES needs one of %; this account is not one of them',
        v_amount_kes, v_required
        using errcode = 'insufficient_privilege';
    end if;

    -- Nobody rules on their own request. Not a matter of trust: an approval
    -- chain that one person can be both ends of does not evidence anything.
    if new.decided_by = new.requested_by then
      raise exception 'the person who raised a voucher cannot be the one who rules on it'
        using errcode = 'insufficient_privilege';
    end if;

    if new.budget_line_id is not null and new.budget_remaining_at_decision is null then
      new.budget_remaining_at_decision := app.budget_remaining(new.budget_line_id);
    end if;
  end if;

  if new.state = 'paid' then
    if old.state <> 'approved' then
      raise exception 'only an approved voucher can be paid (this one is %)', old.state
        using errcode = 'check_violation';
    end if;
    if new.paid_at is null then new.paid_at := now(); end if;
  end if;

  if tg_op = 'UPDATE' and old.state = 'paid' and new.state <> 'paid' then
    raise exception 'a voucher that has been paid cannot be taken back'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger payment_vouchers_ruled before insert or update on payment_vouchers
  for each row execute function app.rule_on_voucher();

-- Every ruling leaves a row behind it, written by the database rather than by
-- whoever remembered to.
-- Security definer for the same reason app.record_stance_change() is: the
-- row is written by the database on the system's behalf, and `authenticated`
-- deliberately has no insert privilege on the table it writes to.
create or replace function app.record_voucher_approval()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.state in ('approved', 'rejected')
     and (tg_op = 'INSERT' or old.state is distinct from new.state) then
    insert into voucher_approvals
      (payment_voucher_id, decision, decided_by, decided_at, acting_as, note)
    values
      (new.id, new.state, new.decided_by, coalesce(new.decided_at, now()),
       app.current_role_name(), new.decision_note);
  end if;
  return new;
end;
$$;

create trigger payment_vouchers_approval_recorded after insert or update on payment_vouchers
  for each row execute function app.record_voucher_approval();

-- ---------------------------------------------------------------------------
-- The ledger (M8-06, M8-07)
-- ---------------------------------------------------------------------------

-- `verified_by_audit` was a boolean with a default, which is to say a claim
-- any writer could make about their own transaction. What replaces it cannot
-- be written from a browser at all.
alter table financial_transactions
  drop column if exists verified_by_audit,
  drop column if exists amount_kshs;

alter table financial_transactions
  add column budget_line_id uuid references budget_lines (id) on delete set null,
  add column payment_voucher_id uuid references payment_vouchers (id) on delete set null,
  -- M8-07. A transaction with no paper behind it is still recorded — an
  -- unrecorded payment is worse than an unverified one — but it says so.
  add column document_id uuid references document_vault (id) on delete set null,
  add column verified boolean generated always as (document_id is not null) stored,
  -- M8-06. Set by app.mark_audited() and by nothing else.
  add column audited_at timestamptz,
  add column audited_by uuid references profiles (id),
  add column audit_note text,
  add constraint financial_transactions_audit_is_whole check (
    (audited_at is null) = (audited_by is null)
  );

select app.add_money_columns('financial_transactions');

create index financial_transactions_line_idx on financial_transactions (budget_line_id);

/**
 * The only way a transaction is ever marked audited.
 *
 * Security definer, so it can write columns the caller has no privilege on,
 * and its first act is to check who is asking. The audit committee and the
 * external auditor are the only answers — not the director, not an
 * administrator, because a badge the spender can award themselves says
 * nothing to a donor.
 */
create or replace function public.mark_audited(p_transaction uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_visible boolean;
begin
  if not app.acts_as('audit_committee', 'external_auditor') then
    raise exception 'only the audit committee or an external auditor can mark a transaction audited'
      using errcode = 'insufficient_privilege';
  end if;

  -- Definer rights bypass the policies, so visibility is checked explicitly:
  -- an auditor cannot sign off something they could not have read.
  select app.can_see_transaction(t.confidentiality, t.id) into v_visible
  from financial_transactions t where t.id = p_transaction;

  if v_visible is not true then
    raise exception 'no such transaction, or it is not yours to see'
      using errcode = 'insufficient_privilege';
  end if;

  update financial_transactions
  set audited_at = now(), audited_by = auth.uid(), audit_note = p_note
  where id = p_transaction
    -- Signed once. A second opinion is a new note, not a rewritten one.
    and audited_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Donations (M8-08)
-- ---------------------------------------------------------------------------

-- A pledge and a receipt are different facts about the world, so they are
-- different rows. The old summary added them together, which flatters every
-- figure it touches and is the single easiest way to lose a donor's trust.
create table donations (
  id uuid primary key default gen_random_uuid(),
  donor_stakeholder_id uuid references stakeholders (id) on delete set null,
  donor_name text not null,
  pledged_on date not null,
  state donation_state not null default 'pledged',
  purpose_en text,
  purpose_tr text,
  note text
);
select app.add_money_columns('donations', 'pledged_');
select app.add_common_columns('donations');

create table donation_tranches (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null references donations (id) on delete cascade,
  received_on date not null,
  document_id uuid references document_vault (id) on delete set null,
  verified boolean generated always as (document_id is not null) stored,
  note text
);
select app.add_money_columns('donation_tranches', 'received_');
select app.add_common_columns('donation_tranches');

create index donation_tranches_donation_idx on donation_tranches (donation_id);

-- ---------------------------------------------------------------------------
-- The four figures, computed (M8-02, M8-09)
-- ---------------------------------------------------------------------------

-- Budget, committed, spent, remaining. Never four columns updated together:
-- the moment they are stored side by side they begin to disagree, and the old
-- module's summary was exactly that disagreement made visible.
create view budget_position with (security_invoker = true) as
select
  l.id as budget_line_id,
  l.budget_category_id,
  l.phase_id,
  l.work_package_id,
  l.construction_block_id,
  l.title_en,
  l.title_tr,
  l.currency,
  l.confidentiality,
  l.amount_kes as budget_kes,
  coalesce((
    select sum(v.amount_kes) from payment_vouchers v
    where v.budget_line_id = l.id and v.state = 'approved'), 0)::numeric(18, 2) as committed_kes,
  coalesce((
    select sum(v.amount_kes) from payment_vouchers v
    where v.budget_line_id = l.id and v.state = 'paid'), 0)::numeric(18, 2) as spent_kes,
  (l.amount_kes
    - coalesce((
        select sum(v.amount_kes) from payment_vouchers v
        where v.budget_line_id = l.id and v.state in ('approved', 'paid')), 0)
  )::numeric(18, 2) as remaining_kes
from budget_lines l;

comment on view budget_position is
  'Budget, committed, spent and remaining for a line (M8-02). Committed is '
  'approved and not yet paid; spent is paid. Remaining subtracts both, so an '
  'approved voucher reduces what is left before the money moves.';

-- M8-09. The distribution comes from the rows. The old dashboard had it in a
-- constant, which is why it never changed.
create view category_spend with (security_invoker = true) as
select
  c.id as budget_category_id,
  c.code,
  c.name_en,
  c.name_tr,
  c.sequence,
  coalesce(sum(p.budget_kes), 0)::numeric(18, 2) as budget_kes,
  coalesce(sum(p.committed_kes), 0)::numeric(18, 2) as committed_kes,
  coalesce(sum(p.spent_kes), 0)::numeric(18, 2) as spent_kes,
  coalesce(sum(p.remaining_kes), 0)::numeric(18, 2) as remaining_kes,
  count(p.budget_line_id) as line_count
from budget_categories c
left join budget_position p on p.budget_category_id = c.id
group by c.id, c.code, c.name_en, c.name_tr, c.sequence;

-- M8-08. Pledged against received, and the difference named.
create view donation_position with (security_invoker = true) as
select
  d.id as donation_id,
  d.donor_name,
  d.donor_stakeholder_id,
  d.pledged_on,
  d.state,
  d.pledged_currency,
  d.pledged_amount,
  d.pledged_amount_kes,
  d.confidentiality,
  coalesce((
    select sum(t.received_amount_kes) from donation_tranches t
    where t.donation_id = d.id), 0)::numeric(18, 2) as received_kes,
  (d.pledged_amount_kes - coalesce((
    select sum(t.received_amount_kes) from donation_tranches t
    where t.donation_id = d.id), 0))::numeric(18, 2) as outstanding_kes,
  (select count(*) from donation_tranches t where t.donation_id = d.id) as tranche_count,
  -- How much of what arrived has a receipt against it. A donation report
  -- nobody can tie to paper is a press release.
  (select count(*) from donation_tranches t
    where t.donation_id = d.id and not t.verified) as unevidenced_tranches
from donations d;

-- ---------------------------------------------------------------------------
-- Who may do what
-- ---------------------------------------------------------------------------

create or replace function app.can_see_money()
returns boolean
language sql
stable
as $$
  select app.acts_as(
    'admin', 'project_director', 'trustee', 'board_director',
    'audit_committee', 'external_auditor');
$$;

create or replace function app.can_spend()
returns boolean
language sql
stable
as $$
  select app.acts_as('admin', 'project_director', 'board_director');
$$;

alter table budget_categories enable row level security;
alter table budget_categories force row level security;

-- Categories are the shape of the budget rather than its contents, and a
-- donor being able to see the headings is the least of transparency.
create policy budget_categories_read on budget_categories
  for select using (app.can_read(confidentiality));
create policy budget_categories_write on budget_categories
  for insert with check (app.can_spend());
create policy budget_categories_update on budget_categories
  for update using (app.can_read(confidentiality) and app.can_spend())
  with check (app.can_spend());

alter table budget_lines enable row level security;
alter table budget_lines force row level security;

create policy budget_lines_read on budget_lines
  for select using (app.can_read(confidentiality) and app.can_see_money());
create policy budget_lines_insert on budget_lines
  for insert with check (app.can_read(confidentiality) and app.can_spend());
create policy budget_lines_update on budget_lines
  for update using (app.can_read(confidentiality) and app.can_spend())
  with check (app.can_spend());
create policy budget_lines_delete on budget_lines
  for delete using (app.can_read(confidentiality) and app.can_spend());

alter table approval_thresholds enable row level security;
alter table approval_thresholds force row level security;

-- Everyone who can see money can see the thresholds. A rule about who has to
-- sign is not itself a secret, and hiding it only makes it unenforceable by
-- anyone but the people it constrains.
create policy approval_thresholds_read on approval_thresholds
  for select using (app.can_see_money());
create policy approval_thresholds_write on approval_thresholds
  for all using (app.acts_as('admin', 'trustee')) with check (app.acts_as('admin', 'trustee'));

alter table payment_vouchers enable row level security;
alter table payment_vouchers force row level security;

create policy payment_vouchers_read on payment_vouchers
  for select using (
    app.can_read(confidentiality)
    and (app.can_see_money() or requested_by = auth.uid())
  );
-- Raising one is not spending. Anybody who can be paid can ask to be.
create policy payment_vouchers_insert on payment_vouchers
  for insert with check (app.can_read(confidentiality) and requested_by = auth.uid());
create policy payment_vouchers_update on payment_vouchers
  for update
  using (
    app.can_read(confidentiality)
    and (app.can_spend() or app.acts_as('trustee', 'board_director')
         or (requested_by = auth.uid() and state = 'requested'))
  )
  with check (
    app.can_spend() or app.acts_as('trustee', 'board_director')
    or (requested_by = auth.uid() and state in ('requested', 'withdrawn'))
  );

create policy voucher_approvals_read on voucher_approvals
  for select using (
    exists (
      select 1 from payment_vouchers v
      where v.id = payment_voucher_id
        and app.can_read(v.confidentiality)
        and (app.can_see_money() or v.requested_by = auth.uid())
    )
  );

alter table donations enable row level security;
alter table donations force row level security;

create policy donations_read on donations
  for select using (
    app.can_read(confidentiality)
    and (app.can_see_money()
         -- A donor reads their own pledge and nobody else's.
         or exists (
           select 1 from stakeholders s
           where s.id = donor_stakeholder_id and s.profile_id = auth.uid()))
  );
create policy donations_insert on donations
  for insert with check (app.can_read(confidentiality) and app.can_spend());
create policy donations_update on donations
  for update using (app.can_read(confidentiality) and app.can_spend())
  with check (app.can_spend());

alter table donation_tranches enable row level security;
alter table donation_tranches force row level security;

create policy donation_tranches_read on donation_tranches
  for select using (
    exists (
      select 1 from donations d
      where d.id = donation_id
        and app.can_read(d.confidentiality)
        and (app.can_see_money()
             or exists (
               select 1 from stakeholders s
               where s.id = d.donor_stakeholder_id and s.profile_id = auth.uid()))
    )
  );
create policy donation_tranches_insert on donation_tranches
  for insert with check (app.can_spend());
create policy donation_tranches_update on donation_tranches
  for update using (app.can_spend()) with check (app.can_spend());

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
--
-- Column-level for the badge, exactly as 0012 does for a document's digest:
-- the strongest way to say "this is not yours to assert" is for the privilege
-- not to exist. `authenticated` may update everything about a transaction
-- except whether it has been audited.

revoke all on financial_transactions from authenticated;
grant select, insert, delete on financial_transactions to authenticated;
grant update (
  reference_no, date, category, description, payee, external_reference,
  budget_line_id, payment_voucher_id, document_id,
  amount, currency, fx_rate_to_kes, confidentiality, updated_by, updated_at
) on financial_transactions to authenticated;

grant select, insert, update, delete on
  budget_categories, budget_lines, approval_thresholds, payment_vouchers,
  donations, donation_tranches
  to authenticated;

-- Rulings are written by the trigger and read by everybody who can see the
-- voucher. 0003's default privileges would otherwise leave the append-only
-- triggers unreachable and a rewrite failing silently with zero rows.
revoke all on voucher_approvals from authenticated;
grant select on voucher_approvals to authenticated;

grant select on budget_position, category_spend, donation_position to authenticated;
grant execute on all functions in schema app to authenticated;
grant execute on function public.mark_audited(uuid, text) to authenticated;

drop function app.add_common_columns(regclass);
