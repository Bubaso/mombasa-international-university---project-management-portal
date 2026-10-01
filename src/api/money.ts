/**
 * Budget, vouchers, the ledger and donations (M8).
 *
 * Three things this file deliberately cannot do, because the database does
 * not let it:
 *
 *   - it cannot mark a transaction audited. `authenticated` has no privilege
 *     on those columns; `markAudited` below calls a function that checks who
 *     is asking, and refuses everybody but the audit committee and the
 *     external auditor;
 *   - it cannot state a base-currency figure. `amount_kes` is generated from
 *     the amount and the rate, so a converted number cannot disagree with
 *     what it was converted from;
 *   - it cannot state that a transaction is verified. That follows from
 *     whether a document is attached.
 *
 * Approving is an ordinary update of `state`; every rule about who may do it
 * at what size lives in a trigger, so the refusal a person sees is the
 * database's own sentence.
 */
import { supabase } from '../lib/supabase';
import type {
  ApprovalThreshold,
  BudgetCategory,
  BudgetLine,
  BudgetPosition,
  CategorySpend,
  CurrencyCode,
  Donation,
  DonationTranche,
  FinancialPeriod,
  FinancialTransaction,
  PaymentVoucher,
  PeriodState,
  VoucherApproval,
  VoucherState,
} from '../types';
import type { AuditManifest, AuditRow } from '../lib/auditFile';

interface NamedRef {
  full_name: string;
}

function label(ref: NamedRef | NamedRef[] | null | undefined): string | null {
  if (!ref) return null;
  const row = Array.isArray(ref) ? ref[0] : ref;
  return row?.full_name ?? null;
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

const num = (value: unknown): number => Number(value ?? 0);

// ---------------------------------------------------------------------------
// The budget
// ---------------------------------------------------------------------------

export async function fetchCategories(): Promise<BudgetCategory[]> {
  const { data, error } = await supabase
    .from('budget_categories')
    .select('id, code, name_en, name_tr, sequence')
    .order('sequence');
  fail(error);
  return (
    (data ?? []) as {
      id: string;
      code: string;
      name_en: string;
      name_tr: string | null;
      sequence: number;
    }[]
  ).map((row) => ({
    id: row.id,
    code: row.code,
    nameEn: row.name_en,
    nameTr: row.name_tr,
    sequence: row.sequence,
  }));
}

export async function fetchBudgetLines(): Promise<BudgetLine[]> {
  const { data, error } = await supabase
    .from('budget_lines')
    .select(
      'id, budget_category_id, phase_id, work_package_id, construction_block_id, ' +
        'title_en, title_tr, amount, currency, amount_kes, confidentiality, ' +
        'category:budget_categories(name_en)',
    )
    .order('title_en');
  fail(error);
  return (
    (data ?? []) as unknown as {
      id: string;
      budget_category_id: string;
      phase_id: string | null;
      work_package_id: string | null;
      construction_block_id: string | null;
      title_en: string;
      title_tr: string | null;
      amount: number;
      currency: CurrencyCode;
      amount_kes: number;
      confidentiality: BudgetLine['confidentiality'];
      category: { name_en: string } | { name_en: string }[] | null;
    }[]
  ).map((row) => {
    const category = Array.isArray(row.category) ? row.category[0] : row.category;
    return {
      id: row.id,
      budgetCategoryId: row.budget_category_id,
      categoryName: category?.name_en ?? null,
      phaseId: row.phase_id,
      workPackageId: row.work_package_id,
      constructionBlockId: row.construction_block_id,
      titleEn: row.title_en,
      titleTr: row.title_tr,
      amount: num(row.amount),
      currency: row.currency,
      amountKes: num(row.amount_kes),
      confidentiality: row.confidentiality,
    };
  });
}

/** Budget, committed, spent, remaining — all four from the view (M8-02). */
export async function fetchBudgetPositions(): Promise<BudgetPosition[]> {
  const { data, error } = await supabase.from('budget_position').select('*');
  fail(error);
  return (
    (data ?? []) as {
      budget_line_id: string;
      budget_category_id: string;
      title_en: string;
      title_tr: string | null;
      currency: CurrencyCode;
      budget_kes: number;
      committed_kes: number;
      spent_kes: number;
      remaining_kes: number;
    }[]
  ).map((row) => ({
    budgetLineId: row.budget_line_id,
    budgetCategoryId: row.budget_category_id,
    titleEn: row.title_en,
    titleTr: row.title_tr,
    currency: row.currency,
    budgetKes: num(row.budget_kes),
    committedKes: num(row.committed_kes),
    spentKes: num(row.spent_kes),
    remainingKes: num(row.remaining_kes),
  }));
}

/** M8-09: the distribution is this query, not a constant in the dashboard. */
export async function fetchCategorySpend(): Promise<CategorySpend[]> {
  const { data, error } = await supabase.from('category_spend').select('*').order('sequence');
  fail(error);
  return (
    (data ?? []) as {
      budget_category_id: string;
      code: string;
      name_en: string;
      name_tr: string | null;
      sequence: number;
      budget_kes: number;
      committed_kes: number;
      spent_kes: number;
      remaining_kes: number;
      line_count: number;
    }[]
  ).map((row) => ({
    budgetCategoryId: row.budget_category_id,
    code: row.code,
    nameEn: row.name_en,
    nameTr: row.name_tr,
    sequence: row.sequence,
    budgetKes: num(row.budget_kes),
    committedKes: num(row.committed_kes),
    spentKes: num(row.spent_kes),
    remainingKes: num(row.remaining_kes),
    lineCount: num(row.line_count),
  }));
}

export async function createBudgetLine(input: {
  budgetCategoryId: string;
  titleEn: string;
  amount: number;
  currency: CurrencyCode;
  fxRateToKes: number;
  constructionBlockId: string | null;
}): Promise<void> {
  const { error } = await supabase.from('budget_lines').insert({
    budget_category_id: input.budgetCategoryId,
    title_en: input.titleEn,
    amount: input.amount,
    currency: input.currency,
    fx_rate_to_kes: input.fxRateToKes,
    construction_block_id: input.constructionBlockId,
  });
  fail(error);
}

export async function createCategory(input: { code: string; nameEn: string }): Promise<void> {
  const { error } = await supabase
    .from('budget_categories')
    .insert({ code: input.code, name_en: input.nameEn });
  fail(error);
}

// ---------------------------------------------------------------------------
// Vouchers
// ---------------------------------------------------------------------------

const VOUCHER_COLUMNS =
  'id, reference_no, budget_line_id, payee, purpose, requested_at, state, valuation_id, ' +
  'amount, currency, amount_kes, decided_at, decision_note, ' +
  'budget_remaining_at_decision, paid_at, confidentiality, ' +
  'requester:profiles!payment_vouchers_requested_by_fkey(full_name), ' +
  'decider:profiles!payment_vouchers_decided_by_fkey(full_name), ' +
  'line:budget_lines(title_en)';

export async function fetchVouchers(): Promise<PaymentVoucher[]> {
  const { data, error } = await supabase
    .from('payment_vouchers')
    .select(VOUCHER_COLUMNS)
    .order('requested_at', { ascending: false });
  fail(error);
  return (
    (data ?? []) as unknown as {
      id: string;
      reference_no: string;
      budget_line_id: string | null;
      payee: string;
      purpose: string;
      requested_at: string;
      state: VoucherState;
      valuation_id: string | null;
      amount: number;
      currency: CurrencyCode;
      amount_kes: number;
      decided_at: string | null;
      decision_note: string | null;
      budget_remaining_at_decision: number | null;
      paid_at: string | null;
      confidentiality: PaymentVoucher['confidentiality'];
      requester: NamedRef | NamedRef[] | null;
      decider: NamedRef | NamedRef[] | null;
      line: { title_en: string } | { title_en: string }[] | null;
    }[]
  ).map((row) => {
    const line = Array.isArray(row.line) ? row.line[0] : row.line;
    return {
      id: row.id,
      referenceNo: row.reference_no,
      budgetLineId: row.budget_line_id,
      budgetLineTitle: line?.title_en ?? null,
      payee: row.payee,
      purpose: row.purpose,
      requestedByName: label(row.requester),
      requestedAt: row.requested_at,
      state: row.state,
      valuationId: row.valuation_id,
      amount: num(row.amount),
      currency: row.currency,
      amountKes: num(row.amount_kes),
      decidedByName: label(row.decider),
      decidedAt: row.decided_at,
      decisionNote: row.decision_note,
      budgetRemainingAtDecision:
        row.budget_remaining_at_decision == null ? null : num(row.budget_remaining_at_decision),
      paidAt: row.paid_at,
      confidentiality: row.confidentiality,
    };
  });
}

export async function fetchApprovals(voucherId: string): Promise<VoucherApproval[]> {
  const { data, error } = await supabase
    .from('voucher_approvals')
    .select(
      'id, payment_voucher_id, decision, decided_at, acting_as, note, ' +
        'decider:profiles!voucher_approvals_decided_by_fkey(full_name)',
    )
    .eq('payment_voucher_id', voucherId)
    .order('decided_at', { ascending: false });
  fail(error);
  return (
    (data ?? []) as unknown as {
      id: string;
      payment_voucher_id: string;
      decision: VoucherState;
      decided_at: string;
      acting_as: string;
      note: string | null;
      decider: NamedRef | NamedRef[] | null;
    }[]
  ).map((row) => ({
    id: row.id,
    paymentVoucherId: row.payment_voucher_id,
    decision: row.decision,
    decidedByName: label(row.decider),
    decidedAt: row.decided_at,
    actingAs: row.acting_as,
    note: row.note,
  }));
}

export async function fetchThresholds(): Promise<ApprovalThreshold[]> {
  const { data, error } = await supabase
    .from('approval_thresholds')
    .select('id, min_amount_kes, required_roles, note')
    .order('min_amount_kes');
  fail(error);
  return (
    (data ?? []) as {
      id: string;
      min_amount_kes: number;
      required_roles: string[];
      note: string | null;
    }[]
  ).map((row) => ({
    id: row.id,
    minAmountKes: num(row.min_amount_kes),
    requiredRoles: row.required_roles,
    note: row.note,
  }));
}

export async function requestVoucher(input: {
  referenceNo: string;
  budgetLineId: string | null;
  payee: string;
  purpose: string;
  amount: number;
  currency: CurrencyCode;
  fxRateToKes: number;
}): Promise<void> {
  const { error } = await supabase.from('payment_vouchers').insert({
    reference_no: input.referenceNo,
    budget_line_id: input.budgetLineId,
    payee: input.payee,
    purpose: input.purpose,
    amount: input.amount,
    currency: input.currency,
    fx_rate_to_kes: input.fxRateToKes,
  });
  fail(error);
}

/**
 * Approving, rejecting, paying and withdrawing are one call, because to the
 * database they are one thing: a state change whose legality the trigger
 * decides. The client does not pre-judge it — the refusal, when there is one,
 * names the band and the roles in it better than a disabled button could.
 */
export async function setVoucherState(input: {
  id: string;
  state: VoucherState;
  note?: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from('payment_vouchers')
    .update({ state: input.state, decision_note: input.note ?? null })
    .eq('id', input.id);
  fail(error);
}

// ---------------------------------------------------------------------------
// The ledger
// ---------------------------------------------------------------------------

const TRANSACTION_COLUMNS =
  'id, reference_no, date, category, description, payee, external_reference, ' +
  'amount, currency, fx_rate_to_kes, amount_kes, budget_line_id, payment_voucher_id, ' +
  'document_id, verified, audited_at, audit_note, confidentiality, ' +
  'auditor:profiles!financial_transactions_audited_by_fkey(full_name)';

export async function fetchTransactions(): Promise<FinancialTransaction[]> {
  const { data, error } = await supabase
    .from('financial_transactions')
    .select(TRANSACTION_COLUMNS)
    .order('date', { ascending: false });
  fail(error);
  return (
    (data ?? []) as unknown as {
      id: string;
      reference_no: string;
      date: string;
      category: FinancialTransaction['category'];
      description: string;
      payee: string;
      amount: number;
      currency: CurrencyCode;
      fx_rate_to_kes: number;
      amount_kes: number;
      budget_line_id: string | null;
      payment_voucher_id: string | null;
      document_id: string | null;
      verified: boolean;
      audited_at: string | null;
      audit_note: string | null;
      confidentiality: FinancialTransaction['confidentiality'];
      auditor: NamedRef | NamedRef[] | null;
    }[]
  ).map((row) => ({
    id: row.id,
    referenceNo: row.reference_no,
    date: row.date,
    category: row.category,
    description: row.description,
    payee: row.payee,
    amount: num(row.amount),
    currency: row.currency,
    fxRateToKes: num(row.fx_rate_to_kes),
    amountKes: num(row.amount_kes),
    budgetLineId: row.budget_line_id,
    paymentVoucherId: row.payment_voucher_id,
    documentId: row.document_id,
    verified: row.verified,
    auditedAt: row.audited_at,
    auditedByName: label(row.auditor),
    auditNote: row.audit_note,
    confidentiality: row.confidentiality,
  }));
}

export async function recordTransaction(input: {
  referenceNo: string;
  date: string;
  category: FinancialTransaction['category'];
  description: string;
  payee: string;
  amount: number;
  currency: CurrencyCode;
  fxRateToKes: number;
  budgetLineId: string | null;
  documentId: string | null;
}): Promise<void> {
  const { error } = await supabase.from('financial_transactions').insert({
    reference_no: input.referenceNo,
    date: input.date,
    category: input.category,
    description: input.description,
    payee: input.payee,
    amount: input.amount,
    currency: input.currency,
    fx_rate_to_kes: input.fxRateToKes,
    budget_line_id: input.budgetLineId,
    document_id: input.documentId,
  });
  fail(error);
}

/** Attaching the paper is what makes a transaction verified (M8-07). */
export async function attachDocument(input: {
  id: string;
  documentId: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from('financial_transactions')
    .update({ document_id: input.documentId })
    .eq('id', input.id);
  fail(error);
}

/**
 * The one route to the audited badge (M8-06).
 *
 * There is no update here because there is no privilege for one. The function
 * checks the caller's role itself and refuses everybody but the audit
 * committee and the external auditor.
 */
export async function markAudited(input: { id: string; note: string | null }): Promise<void> {
  const { error } = await supabase.rpc('mark_audited', {
    p_transaction: input.id,
    p_note: input.note,
  });
  fail(error);
}

// ---------------------------------------------------------------------------
// Donations
// ---------------------------------------------------------------------------

export async function fetchDonations(): Promise<Donation[]> {
  const { data, error } = await supabase
    .from('donation_position')
    .select('*')
    .order('pledged_on', { ascending: false });
  fail(error);
  return (
    (data ?? []) as {
      donation_id: string;
      donor_name: string;
      donor_stakeholder_id: string | null;
      pledged_on: string;
      state: Donation['state'];
      pledged_currency: CurrencyCode;
      pledged_amount: number;
      pledged_amount_kes: number;
      received_kes: number;
      outstanding_kes: number;
      tranche_count: number;
      unevidenced_tranches: number;
      confidentiality: Donation['confidentiality'];
    }[]
  ).map((row) => ({
    id: row.donation_id,
    donorName: row.donor_name,
    donorStakeholderId: row.donor_stakeholder_id,
    pledgedOn: row.pledged_on,
    state: row.state,
    pledgedAmount: num(row.pledged_amount),
    pledgedCurrency: row.pledged_currency,
    pledgedAmountKes: num(row.pledged_amount_kes),
    receivedKes: num(row.received_kes),
    outstandingKes: num(row.outstanding_kes),
    trancheCount: num(row.tranche_count),
    unevidencedTranches: num(row.unevidenced_tranches),
    confidentiality: row.confidentiality,
  }));
}

export async function fetchTranches(donationId: string): Promise<DonationTranche[]> {
  const { data, error } = await supabase
    .from('donation_tranches')
    .select(
      'id, donation_id, received_on, received_amount, received_currency, ' +
        'received_amount_kes, document_id, verified, note',
    )
    .eq('donation_id', donationId)
    .order('received_on', { ascending: false });
  fail(error);
  return (
    (data ?? []) as unknown as {
      id: string;
      donation_id: string;
      received_on: string;
      received_amount: number;
      received_currency: CurrencyCode;
      received_amount_kes: number;
      document_id: string | null;
      verified: boolean;
      note: string | null;
    }[]
  ).map((row) => ({
    id: row.id,
    donationId: row.donation_id,
    receivedOn: row.received_on,
    receivedAmount: num(row.received_amount),
    receivedCurrency: row.received_currency,
    receivedAmountKes: num(row.received_amount_kes),
    documentId: row.document_id,
    verified: row.verified,
    note: row.note,
  }));
}

export async function pledgeDonation(input: {
  donorName: string;
  pledgedOn: string;
  amount: number;
  currency: CurrencyCode;
  fxRateToKes: number;
}): Promise<void> {
  const { error } = await supabase.from('donations').insert({
    donor_name: input.donorName,
    pledged_on: input.pledgedOn,
    pledged_amount: input.amount,
    pledged_currency: input.currency,
    pledged_fx_rate_to_kes: input.fxRateToKes,
  });
  fail(error);
}

export async function recordTranche(input: {
  donationId: string;
  receivedOn: string;
  amount: number;
  currency: CurrencyCode;
  fxRateToKes: number;
  documentId: string | null;
}): Promise<void> {
  const { error } = await supabase.from('donation_tranches').insert({
    donation_id: input.donationId,
    received_on: input.receivedOn,
    received_amount: input.amount,
    received_currency: input.currency,
    received_fx_rate_to_kes: input.fxRateToKes,
    document_id: input.documentId,
  });
  fail(error);
}

// ---------------------------------------------------------------------------
// Periodic financial close (M8-16)
// ---------------------------------------------------------------------------

export async function fetchPeriods(): Promise<FinancialPeriod[]> {
  const { data, error } = await supabase
    .from('financial_close')
    .select('*')
    .order('starts_on', { ascending: false });
  fail(error);
  return (
    (data ?? []) as {
      financial_period_id: string;
      code: string;
      starts_on: string;
      ends_on: string;
      state: PeriodState;
      closed_at: string | null;
      closing_transactions: number | null;
      closing_ledger_kes: number | string | null;
      closing_vouchers_paid_kes: number | string | null;
      closing_receipts_kes: number | string | null;
      gaps: Record<string, number> | null;
      note: string | null;
      entries_added_after_the_close: number | string;
      added_after_the_close_kes: number | string;
      confidentiality: FinancialPeriod['confidentiality'];
    }[]
  ).map((row) => ({
    financialPeriodId: row.financial_period_id,
    code: row.code,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    state: row.state,
    closedAt: row.closed_at,
    closingTransactions: row.closing_transactions == null ? null : Number(row.closing_transactions),
    closingLedgerKes: row.closing_ledger_kes == null ? null : Number(row.closing_ledger_kes),
    closingVouchersPaidKes:
      row.closing_vouchers_paid_kes == null ? null : Number(row.closing_vouchers_paid_kes),
    closingReceiptsKes: row.closing_receipts_kes == null ? null : Number(row.closing_receipts_kes),
    gaps: row.gaps,
    note: row.note,
    entriesAddedAfterTheClose: Number(row.entries_added_after_the_close ?? 0),
    addedAfterTheCloseKes: Number(row.added_after_the_close_kes ?? 0),
    confidentiality: row.confidentiality,
  }));
}

export async function openPeriod(input: {
  code: string;
  startsOn: string;
  endsOn: string;
}): Promise<void> {
  const { error } = await supabase.from('financial_periods').insert({
    code: input.code,
    starts_on: input.startsOn,
    ends_on: input.endsOn,
  });
  fail(error);
}

/**
 * Taking the close. Goes through the function rather than an update, because
 * the figures have to cover every row in the period and not only the rows
 * the person pressing the button can read — a close computed under one
 * person's clearance would be a different close for each closer.
 */
export async function closePeriod(id: string): Promise<void> {
  const { error } = await supabase.rpc('close_financial_period', { p_period: id });
  fail(error);
}

/**
 * The manifest, and then the rows. In that order on purpose: the manifest
 * says how many rows the period holds, so a file that is short can say so.
 * Asking for the rows first and counting them would only ever produce the
 * number the caller could already see.
 */
export async function fetchAuditFileParts(
  id: string,
): Promise<{ manifest: AuditManifest; rows: AuditRow[] }> {
  const { data: manifestRows, error: manifestError } = await supabase.rpc('audit_file_manifest', {
    p_period: id,
  });
  fail(manifestError);
  const m = ((manifestRows ?? []) as Record<string, unknown>[])[0];
  if (!m) throw new Error('That period is no longer there.');

  const manifest: AuditManifest = {
    code: String(m.code),
    startsOn: String(m.starts_on),
    endsOn: String(m.ends_on),
    state: m.state as AuditManifest['state'],
    closedAt: (m.closed_at as string | null) ?? null,
    rowsInThePeriod: Number(m.rows_in_the_period ?? 0),
    rowsYouCanRead: Number(m.rows_you_can_read ?? 0),
    rowsWithheld: Number(m.rows_withheld ?? 0),
    withheldByTier: (m.withheld_by_tier as Record<string, number> | null) ?? {},
    gaps: (m.gaps as Record<string, number> | null) ?? null,
    entriesAddedAfterTheClose: Number(m.entries_added_after_the_close ?? 0),
  };

  const { data, error } = await supabase
    .from('financial_transactions')
    .select(
      'reference_no, date, category, description, amount, currency, amount_kes, payee, ' +
        'payment_voucher_id, document_id, audited_at, confidentiality',
    )
    .gte('date', manifest.startsOn)
    .lte('date', manifest.endsOn)
    .order('date');
  fail(error);

  const rows: AuditRow[] = (
    (data ?? []) as unknown as {
      reference_no: string;
      date: string;
      category: string;
      description: string | null;
      amount: number | string;
      currency: string;
      amount_kes: number | string | null;
      payee: string | null;
      payment_voucher_id: string | null;
      document_id: string | null;
      audited_at: string | null;
      confidentiality: string;
    }[]
  ).map((row) => ({
    referenceNo: row.reference_no,
    date: row.date,
    category: row.category,
    description: row.description,
    amount: Number(row.amount),
    currency: row.currency,
    amountKes: row.amount_kes == null ? null : Number(row.amount_kes),
    payee: row.payee,
    paymentVoucherId: row.payment_voucher_id,
    documentId: row.document_id,
    auditedAt: row.audited_at,
    confidentiality: row.confidentiality,
  }));

  return { manifest, rows };
}
