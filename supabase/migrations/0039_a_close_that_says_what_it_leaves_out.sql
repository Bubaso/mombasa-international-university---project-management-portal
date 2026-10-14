-- Periodic financial close, and the audit file (M8-16).
--
-- A financial close is where a register stops being a running list and
-- becomes a statement: these are the figures for this quarter. The dishonest
-- version of it is easy to build and hard to spot afterwards — you sum what
-- happens to be recorded, present the totals, and the things nobody got
-- round to entering are simply not in the picture. The totals look complete
-- because totals always do.
--
-- So this close is defined by what it admits:
--
--   * It counts and freezes what it does NOT include. Eight gaps, measured
--     at the moment of closing and stored with it: vouchers raised and never
--     decided, approved and never paid, paid with no ledger entry behind
--     them; ledger entries with no document, never audited, or with no
--     voucher; money recorded as arrived with no receipt; measured work
--     certified and unpaid. A close is not "here are the figures", it is
--     "here are the figures, and here is what they leave out".
--
--   * The figures are stored, not recomputed. A total that is recomputed on
--     read moves silently when somebody enters a late invoice, and a figure
--     that moves is not a close.
--
--   * A transaction dated inside a closed period, entered after the close,
--     is a real payment. Refusing it would put it in somebody's spreadsheet;
--     accepting it silently would make the stored figure a lie. So it is
--     accepted and stamped, and the close reports "three entries were added
--     to this period after it closed, totalling X". That is the only one of
--     the three options that leaves a trace.
--
--   * Editing the amount or the date of a row inside a closed period is
--     refused, because that rewrites a closed figure with nothing to show
--     it happened. Attaching the document or recording the audit afterwards
--     is allowed: evidence arriving late is the record completing, not
--     changing.
--
--   * The close counts every row, including the ones the person closing
--     cannot read. It has to: a close computed under one person's clearance
--     would be a different close for each closer. The function is therefore
--     security definer and tests the authority itself.
--
--   * The audit file says what is missing from it. Row level security means
--     an export by somebody without full clearance silently omits rows, and
--     a file that quietly holds 40 of 44 payments is the worst artefact in
--     this whole system. The manifest discloses the count and the tiers of
--     what was withheld without disclosing any of it — the same trick
--     0035 uses for the translation badge.
--
-- Requirements: M8-16.

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
-- The period
-- ---------------------------------------------------------------------------

create type period_state as enum ('open', 'closed');

create table financial_periods (
  id uuid primary key default gen_random_uuid(),
  -- '2026-Q1', '2026-04'. A label people already use for the period, not a
  -- number this table invents.
  code text not null unique check (btrim(code) <> ''),
  starts_on date not null,
  ends_on date not null,
  state period_state not null default 'open',
  closed_at timestamptz,
  closed_by uuid references profiles (id),

  -- The figures as they stood at the close. Stored on purpose: see the head
  -- of this file.
  --
  -- Named "ledger" rather than "spend" because financial_transactions.category
  -- is free text with no sign convention, so calling this quarter's sum
  -- spending would be asserting a classification nobody recorded.
  closing_transactions int,
  closing_ledger_kes numeric(18, 2),
  closing_vouchers_paid_kes numeric(18, 2),
  closing_receipts_kes numeric(18, 2),

  -- The eight gaps, counted at the close and frozen with it. jsonb because
  -- the list will grow as the registers do, and a column per gap would mean
  -- a migration every time somebody finds another thing the close leaves
  -- out — which is exactly the kind of friction that ends in nobody adding
  -- the ninth.
  gaps jsonb,

  note text,

  constraint financial_periods_dates_run_forwards check (ends_on >= starts_on),
  constraint financial_periods_closure_is_whole check (
    ((state = 'closed') = (closed_at is not null))
    and ((closed_at is null) = (closed_by is null))
  ),
  -- A closed period with no figures and no gap list would be a close that
  -- closed nothing.
  constraint financial_periods_closed_has_its_figures check (
    state <> 'closed'
    or (closing_transactions is not null and gaps is not null)
  )
);
select app.add_common_columns('financial_periods');

create index financial_periods_range_idx on financial_periods (starts_on, ends_on);

comment on table financial_periods is
  'A financial period and, once closed, the figures and the gaps as they '
  'stood at the close (M8-16). The figures are stored rather than computed, '
  'because a total that moves is not a close.';

-- Overlapping periods would mean a transaction belonging to two closes, with
-- two different sets of frozen figures containing it.
create or replace function app.periods_do_not_overlap()
returns trigger
language plpgsql
as $$
declare
  v_other text;
begin
  select code into v_other
  from financial_periods p
  where p.id <> new.id
    and daterange(p.starts_on, p.ends_on, '[]')
        && daterange(new.starts_on, new.ends_on, '[]')
  limit 1;

  if v_other is not null then
    raise exception 'this period overlaps %, and a transaction cannot belong to two closes', v_other
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger financial_periods_no_overlap
  before insert or update of starts_on, ends_on on financial_periods
  for each row execute function app.periods_do_not_overlap();

-- ---------------------------------------------------------------------------
-- What arrived after the close
-- ---------------------------------------------------------------------------

alter table financial_transactions
  add column closed_period_id uuid references financial_periods (id) on delete set null;

comment on column financial_transactions.closed_period_id is
  'Set by a trigger when this row was entered after the period holding its '
  'date had already closed (M8-16). Null for everything that was in the '
  'close when it was taken.';

create or replace function app.stamp_post_close_entry()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_period uuid;
begin
  -- Definer, because a late entry has to be stamped whether or not the
  -- person entering it can read the period register.
  select id into v_period
  from financial_periods
  where state = 'closed'
    and new.date between starts_on and ends_on;

  new.closed_period_id := v_period;
  return new;
end;
$$;

-- Insert only. On update the column keeps whatever the insert decided: a row
-- that was in the close stays in it, and a row that arrived late stays late.
create trigger financial_transactions_stamp_post_close
  before insert on financial_transactions
  for each row execute function app.stamp_post_close_entry();

-- Rewriting the amount or the date of a row inside a closed period changes a
-- figure that has been reported, with nothing on the record to show it moved.
-- Attaching the document or recording the audit is the opposite: it is the
-- evidence arriving, and the figure does not move.
create or replace function app.refuse_closed_period_rewrite()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_closed text;
begin
  if new.amount is not distinct from old.amount
     and new.currency is not distinct from old.currency
     and new.fx_rate_to_kes is not distinct from old.fx_rate_to_kes
     and new.date is not distinct from old.date then
    return new;
  end if;

  select code into v_closed
  from financial_periods
  where state = 'closed'
    and (old.date between starts_on and ends_on
         or new.date between starts_on and ends_on);

  if v_closed is not null then
    raise exception
      'the amount and the date of a transaction in closed period % cannot be changed; record a correcting entry',
      v_closed
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger financial_transactions_closed_figures_hold
  before update on financial_transactions
  for each row execute function app.refuse_closed_period_rewrite();

-- ---------------------------------------------------------------------------
-- Taking the close
-- ---------------------------------------------------------------------------

-- Definer, so the figures cover every row rather than the closer's share of
-- them. Which means the authority test lives in the function, not in a
-- policy: see CLAUDE.md on the one place an exception belongs.
create or replace function public.close_financial_period(p_period uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v financial_periods;
  v_gaps jsonb;
  v_count int;
  v_ledger numeric(18, 2);
  v_vouchers numeric(18, 2);
  v_receipts numeric(18, 2);
begin
  if not app.acts_as('admin', 'project_director') then
    raise exception 'only an administrator or the project director closes a period'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v from financial_periods where id = p_period;
  if v.id is null then
    raise exception 'no such period' using errcode = 'no_data_found';
  end if;
  if v.state = 'closed' then
    raise exception 'period % is already closed', v.code
      using errcode = 'insufficient_privilege';
  end if;
  -- Closing a period that is still running freezes figures for days that
  -- have not happened.
  if v.ends_on >= current_date then
    raise exception 'period % has not ended yet', v.code
      using errcode = 'check_violation';
  end if;

  select count(*), coalesce(sum(amount_kes), 0)
    into v_count, v_ledger
  from financial_transactions
  where date between v.starts_on and v.ends_on;

  select coalesce(sum(amount_kes), 0) into v_vouchers
  from payment_vouchers
  where state = 'paid' and paid_at::date between v.starts_on and v.ends_on;

  select coalesce(sum(received_amount_kes), 0) into v_receipts
  from donation_tranches
  where received_on between v.starts_on and v.ends_on;

  -- The eight gaps. Each one is a thing somebody has to go and finish, and
  -- each is counted now so the close carries the state it was taken in.
  select jsonb_build_object(
    'vouchers_never_decided', (
      select count(*) from payment_vouchers
      where state = 'requested'
        and requested_at::date between v.starts_on and v.ends_on),
    'vouchers_approved_not_paid', (
      select count(*) from payment_vouchers
      where state = 'approved'
        and decided_at::date between v.starts_on and v.ends_on),
    'vouchers_paid_with_no_ledger_entry', (
      select count(*) from payment_vouchers pv
      where pv.state = 'paid'
        and pv.paid_at::date between v.starts_on and v.ends_on
        and not exists (
          select 1 from financial_transactions t where t.payment_voucher_id = pv.id)),
    'ledger_entries_with_no_document', (
      select count(*) from financial_transactions
      where date between v.starts_on and v.ends_on and not verified),
    'ledger_entries_never_audited', (
      select count(*) from financial_transactions
      where date between v.starts_on and v.ends_on and audited_at is null),
    'ledger_entries_with_no_voucher', (
      select count(*) from financial_transactions
      where date between v.starts_on and v.ends_on and payment_voucher_id is null),
    'receipts_with_no_document', (
      select count(*) from donation_tranches
      where received_on between v.starts_on and v.ends_on and not verified),
    'certified_work_not_paid', (
      select count(*) from valuations
      where qs_certified_at::date between v.starts_on and v.ends_on
        and paid_at is null)
  ) into v_gaps;

  update financial_periods
     set state = 'closed',
         closed_at = now(),
         closed_by = auth.uid(),
         closing_transactions = v_count,
         closing_ledger_kes = v_ledger,
         closing_vouchers_paid_kes = v_vouchers,
         closing_receipts_kes = v_receipts,
         gaps = v_gaps
   where id = p_period;

  return v_gaps;
end;
$$;

comment on function public.close_financial_period(uuid) is
  'Freeze a period''s figures and the gaps in them (M8-16). Definer, so the '
  'count covers every row rather than the closer''s share; the authority '
  'test is inside the function for the same reason.';

-- ---------------------------------------------------------------------------
-- The close, and whether it still agrees with the register
-- ---------------------------------------------------------------------------

create view financial_close with (security_invoker = true) as
select
  p.id as financial_period_id,
  p.code,
  p.starts_on,
  p.ends_on,
  p.state,
  p.closed_at,
  p.closing_transactions,
  p.closing_ledger_kes,
  p.closing_vouchers_paid_kes,
  p.closing_receipts_kes,
  p.gaps,
  p.note,
  -- What arrived after the close was taken. Not an error: a late invoice is
  -- a real payment. It is the drift between the reported figure and the
  -- register, and it belongs on the same screen as the figure.
  (
    select count(*) from financial_transactions t
    where t.closed_period_id = p.id
  ) as entries_added_after_the_close,
  (
    select coalesce(sum(t.amount_kes), 0) from financial_transactions t
    where t.closed_period_id = p.id
  ) as added_after_the_close_kes,
  p.confidentiality
from financial_periods p;

comment on view financial_close is
  'Each period, the figures frozen at its close, and what has been entered '
  'into it since (M8-16). The last two columns are why the frozen figures '
  'are stored rather than recomputed.';

-- ---------------------------------------------------------------------------
-- The audit file's manifest
-- ---------------------------------------------------------------------------

-- Definer, and returns counts only. The point is to tell an exporter what
-- their file is missing without showing them any of it: a file that quietly
-- holds forty of forty-four payments is worse than no file, and row level
-- security produces exactly that unless something says so out loud.
create or replace function public.audit_file_manifest(p_period uuid)
returns table (
  code text,
  starts_on date,
  ends_on date,
  state period_state,
  closed_at timestamptz,
  rows_in_the_period bigint,
  rows_you_can_read bigint,
  rows_withheld bigint,
  withheld_by_tier jsonb,
  gaps jsonb,
  entries_added_after_the_close bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v financial_periods;
begin
  select * into v from financial_periods where id = p_period;
  if v.id is null then
    raise exception 'no such period' using errcode = 'no_data_found';
  end if;

  -- Reading the period register itself is gated the ordinary way, so a
  -- caller who cannot see the period gets nothing rather than its shape.
  if not app.can_read(v.confidentiality) then
    raise exception 'that period is not yours to read'
      using errcode = 'insufficient_privilege';
  end if;

  code := v.code;
  starts_on := v.starts_on;
  ends_on := v.ends_on;
  state := v.state;
  closed_at := v.closed_at;
  gaps := v.gaps;

  select count(*) into rows_in_the_period
  from financial_transactions t
  where t.date between v.starts_on and v.ends_on;

  select count(*) into rows_you_can_read
  from financial_transactions t
  where t.date between v.starts_on and v.ends_on
    and app.can_read(t.confidentiality);

  rows_withheld := rows_in_the_period - rows_you_can_read;

  select coalesce(jsonb_object_agg(tier, n), '{}'::jsonb) into withheld_by_tier
  from (
    select t.confidentiality::text as tier, count(*) as n
    from financial_transactions t
    where t.date between v.starts_on and v.ends_on
      and not app.can_read(t.confidentiality)
    group by t.confidentiality
  ) s;

  select count(*) into entries_added_after_the_close
  from financial_transactions t
  where t.closed_period_id = v.id;

  return next;
end;
$$;

comment on function public.audit_file_manifest(uuid) is
  'What an audit file for this period contains and what it leaves out '
  '(M8-16). Counts and tiers only, never content: it exists so an exporter '
  'cannot hand over a partial file without knowing it is partial.';

-- ---------------------------------------------------------------------------
-- Who may do what
-- ---------------------------------------------------------------------------

alter table financial_periods enable row level security;
alter table financial_periods force row level security;

create policy financial_periods_read on financial_periods
  for select using (app.can_read(confidentiality));
create policy financial_periods_insert on financial_periods
  for insert with check (
    app.can_read(confidentiality) and app.acts_as('admin', 'project_director')
  );
-- Update exists so a period can be named, dated and annotated while it is
-- open. Closing is not an update: it goes through the function, which is
-- the only thing that can see every row.
create policy financial_periods_update on financial_periods
  for update
  using (app.can_read(confidentiality) and app.acts_as('admin', 'project_director'))
  with check (app.acts_as('admin', 'project_director'));

-- A closed period cannot be reopened, renamed or re-dated, and nobody edits
-- the figures by hand. Checked in a trigger rather than left to the update
-- policy, because the policy's job is who and this is what.
create or replace function app.refuse_reopening_a_period()
returns trigger
language plpgsql
as $$
begin
  if old.state <> 'closed' then
    return new;
  end if;

  if new.state <> 'closed' then
    raise exception 'a closed period cannot be reopened; open the next one'
      using errcode = 'insufficient_privilege';
  end if;

  if new.code is distinct from old.code
     or new.starts_on is distinct from old.starts_on
     or new.ends_on is distinct from old.ends_on
     or new.closing_transactions is distinct from old.closing_transactions
     or new.closing_ledger_kes is distinct from old.closing_ledger_kes
     or new.closing_vouchers_paid_kes is distinct from old.closing_vouchers_paid_kes
     or new.closing_receipts_kes is distinct from old.closing_receipts_kes
     or new.gaps is distinct from old.gaps then
    raise exception 'the figures of a closed period are fixed; record a correcting entry'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger financial_periods_one_way before update on financial_periods
  for each row execute function app.refuse_reopening_a_period();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- Delete is taken away rather than left unpoliced: deleting a closed period
-- would remove the only record that a figure was ever reported.
revoke all on financial_periods from authenticated;
grant select, insert, update on financial_periods to authenticated;

grant select on financial_close to authenticated;

drop function app.add_common_columns(regclass);

select app.reset_function_grants();
