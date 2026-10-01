/**
 * Procurement and contracts (M14).
 *
 * Two of the writes here are database functions rather than updates, and the
 * reason is the same in both cases: the act spans two tables and leaving a
 * window between them is how a request ends up with two winners, or a
 * commitment ends up approved by the person who asked for it.
 *
 *   approve_procurement — reads 0015's money band and refuses self-approval
 *   award_procurement   — selects the candidate and closes the request at once
 *
 * Everything else is a plain read through a policy. Nothing in this file
 * decides who may see a fee or a score; `app.can_see_procurement_record` does,
 * and it names the auditors explicitly because the module exists to be
 * answerable to them.
 */
import { supabase } from '../lib/supabase';
import type {
  AmountVerdict,
  ContractAlert,
  ContractMilestone,
  ContractSettlement,
  ContractTerm,
  CurrencyCode,
  MilestoneMatch,
  MilestoneState,
  PaymentMatchingHealth,
  ProcurementCandidate,
  ProcurementRequest,
  SupplierReview,
  UnscheduledValuation,
  ValuationState,
} from '../types';

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

const rows = <T>(data: unknown): T[] => (data ?? []) as unknown as T[];
const num = (v: unknown): number => (v == null ? 0 : Number(v));
const maybeNum = (v: unknown): number | null => (v == null ? null : Number(v));

/** PostgREST returns an embedded one-to-one as an object or a one-element array. */
type NamedRef = { full_name: string } | { full_name: string }[] | null;
const label = (ref: NamedRef): string | null =>
  Array.isArray(ref) ? (ref[0]?.full_name ?? null) : (ref?.full_name ?? null);

// ---------------------------------------------------------------------------
// Requests (M14-01)
// ---------------------------------------------------------------------------

export async function fetchRequests(): Promise<ProcurementRequest[]> {
  const { data, error } = await supabase
    .from('procurement_requests')
    .select(
      'id, reference_no, kind, need_en, need_tr, justification_en, justification_tr, ' +
        'estimated_amount, estimated_currency, estimated_amount_kes, requested_by, ' +
        'requested_at, needed_by, state, approved_at, decision_note, cancelled_reason, ' +
        'confidentiality, ' +
        'requester:profiles!procurement_requests_requested_by_fkey(full_name), ' +
        'approver:profiles!procurement_requests_approved_by_fkey(full_name), ' +
        'procurement_candidates(count)',
    )
    .order('requested_at', { ascending: false });
  fail(error);

  return rows<Record<string, unknown>>(data).map((row) => ({
    id: row.id as string,
    referenceNo: row.reference_no as string | null,
    kind: row.kind as ProcurementRequest['kind'],
    needEn: row.need_en as string,
    needTr: row.need_tr as string | null,
    justificationEn: row.justification_en as string,
    justificationTr: row.justification_tr as string | null,
    estimatedAmount: num(row.estimated_amount),
    estimatedCurrency: row.estimated_currency as ProcurementRequest['estimatedCurrency'],
    estimatedAmountKes: num(row.estimated_amount_kes),
    requestedBy: row.requested_by as string | null,
    requestedByName: label(row.requester as NamedRef),
    requestedAt: row.requested_at as string,
    neededBy: row.needed_by as string | null,
    state: row.state as ProcurementRequest['state'],
    approvedByName: label(row.approver as NamedRef),
    approvedAt: row.approved_at as string | null,
    decisionNote: row.decision_note as string | null,
    cancelledReason: row.cancelled_reason as string | null,
    candidateCount:
      (row.procurement_candidates as { count: number }[] | undefined)?.[0]?.count ?? 0,
    confidentiality: row.confidentiality as ProcurementRequest['confidentiality'],
  }));
}

export async function addRequest(input: {
  kind: ProcurementRequest['kind'];
  referenceNo?: string | null;
  needEn: string;
  justificationEn: string;
  estimatedAmount: number;
  estimatedCurrency: string;
  neededBy?: string | null;
}): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const me = session.session?.user.id;
  if (!me) throw new Error('Sign in again — your session has expired.');

  // requested_by is the caller's own, and the policy insists on it: the
  // approval rule later turns on who asked.
  const { error } = await supabase.from('procurement_requests').insert({
    kind: input.kind,
    reference_no: input.referenceNo?.trim() || null,
    need_en: input.needEn.trim(),
    justification_en: input.justificationEn.trim(),
    estimated_amount: input.estimatedAmount,
    estimated_currency: input.estimatedCurrency,
    needed_by: input.neededBy || null,
    requested_by: me,
  });
  fail(error);
}

/** Approves against 0015's bands, server-side (M14-01). */
export async function approveRequest(id: string, note?: string | null): Promise<void> {
  const { error } = await supabase.rpc('approve_procurement', {
    p_request: id,
    p_note: note?.trim() || null,
  });
  fail(error);
}

// ---------------------------------------------------------------------------
// Candidates (M14-02)
// ---------------------------------------------------------------------------

export async function fetchCandidates(requestId: string): Promise<ProcurementCandidate[]> {
  const { data, error } = await supabase
    .from('procurement_candidates')
    .select(
      'id, request_id, organization_id, stakeholder_id, name, scope_en, scope_tr, ' +
        'fee_amount, fee_currency, fee_amount_kes, fee_basis, references_en, ' +
        'strengths_en, weaknesses_en, score, proposal_document_id, outcome, ' +
        'decision_note_en, decision_note_tr, decided_on, confidentiality',
    )
    .eq('request_id', requestId)
    .order('score', { ascending: false, nullsFirst: false });
  fail(error);

  return rows<Record<string, unknown>>(data).map((row) => ({
    id: row.id as string,
    requestId: row.request_id as string,
    organizationId: row.organization_id as string | null,
    stakeholderId: row.stakeholder_id as string | null,
    name: row.name as string,
    scopeEn: row.scope_en as string | null,
    scopeTr: row.scope_tr as string | null,
    feeAmount: num(row.fee_amount),
    feeCurrency: row.fee_currency as ProcurementCandidate['feeCurrency'],
    feeAmountKes: num(row.fee_amount_kes),
    feeBasis: row.fee_basis as ProcurementCandidate['feeBasis'],
    referencesEn: row.references_en as string | null,
    strengthsEn: row.strengths_en as string | null,
    weaknessesEn: row.weaknesses_en as string | null,
    score: row.score == null ? null : Number(row.score),
    proposalDocumentId: row.proposal_document_id as string | null,
    outcome: row.outcome as ProcurementCandidate['outcome'],
    decisionNoteEn: row.decision_note_en as string | null,
    decisionNoteTr: row.decision_note_tr as string | null,
    decidedOn: row.decided_on as string | null,
    confidentiality: row.confidentiality as ProcurementCandidate['confidentiality'],
  }));
}

export async function addCandidate(input: {
  requestId: string;
  name: string;
  scopeEn?: string | null;
  feeAmount: number;
  feeCurrency: string;
  feeBasis: ProcurementCandidate['feeBasis'];
  strengthsEn?: string | null;
  weaknessesEn?: string | null;
  score?: number | null;
}): Promise<void> {
  const { error } = await supabase.from('procurement_candidates').insert({
    request_id: input.requestId,
    name: input.name.trim(),
    scope_en: input.scopeEn?.trim() || null,
    fee_amount: input.feeAmount,
    fee_currency: input.feeCurrency,
    fee_basis: input.feeBasis,
    strengths_en: input.strengthsEn?.trim() || null,
    weaknesses_en: input.weaknessesEn?.trim() || null,
    score: input.score ?? null,
  });
  fail(error);
}

/** Selects a candidate and closes the request in one act (M14-02). */
export async function awardTo(
  candidateId: string,
  reasonEn: string,
  reasonTr?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('award_procurement', {
    p_candidate: candidateId,
    p_reason_en: reasonEn.trim(),
    p_reason_tr: reasonTr?.trim() || null,
  });
  fail(error);
}

/**
 * Rejecting a candidate, with the reason.
 *
 * A plain update rather than a function, because it touches one row — but the
 * reason is still not optional: the database refuses a rejection without one,
 * so sending a blank here would only produce an error the user has to read.
 */
export async function rejectCandidate(id: string, reasonEn: string): Promise<void> {
  if (!reasonEn.trim()) {
    throw new Error('Say why this candidate was not chosen — that is the part that gets lost.');
  }
  const { error } = await supabase
    .from('procurement_candidates')
    .update({
      outcome: 'rejected',
      decision_note_en: reasonEn.trim(),
      decided_on: new Date().toISOString().slice(0, 10),
    })
    .eq('id', id);
  fail(error);
}

// ---------------------------------------------------------------------------
// Contracts (M14-03, M14-05)
// ---------------------------------------------------------------------------

export async function fetchContractAlerts(): Promise<ContractAlert[]> {
  const { data, error } = await supabase
    .from('contract_alerts')
    .select('*')
    .order('next_date', { nullsFirst: false });
  fail(error);

  return rows<Record<string, unknown>>(data).map((row) => ({
    contractId: row.contract_id as string,
    referenceNo: row.reference_no as string | null,
    counterpartyName: row.counterparty_name as string,
    subjectEn: row.subject_en as string,
    subjectTr: row.subject_tr as string | null,
    state: row.state as ContractAlert['state'],
    startsOn: row.starts_on as string | null,
    endsOn: row.ends_on as string | null,
    renewalOn: row.renewal_on as string | null,
    noticeDays: row.notice_days == null ? null : Number(row.notice_days),
    valueAmount: num(row.value_amount),
    valueCurrency: row.value_currency as ContractAlert['valueCurrency'],
    valueAmountKes: num(row.value_amount_kes),
    valueBasis: row.value_basis as ContractAlert['valueBasis'],
    renewalBand: row.renewal_band as ContractAlert['renewalBand'],
    expiryBand: row.expiry_band as ContractAlert['expiryBand'],
    // 'infinity' comes back from least() when neither date is set; it is not
    // a date anybody should see on a screen.
    nextDate:
      row.next_date == null || row.next_date === 'infinity' ? null : (row.next_date as string),
    daysToExpiry: row.days_to_expiry == null ? null : Number(row.days_to_expiry),
    daysToRenewal: row.days_to_renewal == null ? null : Number(row.days_to_renewal),
    renewalDrafted: Boolean(row.renewal_drafted),
    confidentiality: row.confidentiality as ContractAlert['confidentiality'],
  }));
}

export async function fetchContractTerms(contractId: string): Promise<ContractTerm[]> {
  const { data, error } = await supabase
    .from('contract_terms')
    .select(
      'id, contract_id, clause, title_en, title_tr, detail_en, owed_by, due_on, ' +
        'obligation_id, confidentiality, obligation:obligations(state)',
    )
    .eq('contract_id', contractId)
    .order('due_on', { nullsFirst: false });
  fail(error);

  return rows<Record<string, unknown>>(data).map((row) => {
    const obligation = row.obligation as { state: string } | { state: string }[] | null;
    return {
      id: row.id as string,
      contractId: row.contract_id as string,
      clause: row.clause as string | null,
      titleEn: row.title_en as string,
      titleTr: row.title_tr as string | null,
      detailEn: row.detail_en as string | null,
      owedBy: row.owed_by as ContractTerm['owedBy'],
      dueOn: row.due_on as string | null,
      obligationId: row.obligation_id as string | null,
      obligationState: Array.isArray(obligation)
        ? (obligation[0]?.state ?? null)
        : (obligation?.state ?? null),
      confidentiality: row.confidentiality as ContractTerm['confidentiality'],
    };
  });
}

export async function fetchSettlement(): Promise<ContractSettlement[]> {
  const { data, error } = await supabase.from('contract_settlement').select('*');
  fail(error);

  return rows<Record<string, unknown>>(data).map((row) => ({
    contractId: row.contract_id as string,
    referenceNo: row.reference_no as string | null,
    counterpartyName: row.counterparty_name as string,
    subjectEn: row.subject_en as string,
    state: row.state as ContractSettlement['state'],
    valueBasis: row.value_basis as ContractSettlement['valueBasis'],
    valueKes: maybeNum(row.value_kes),
    milestones: Number(row.milestones ?? 0),
    scheduledKes: maybeNum(row.scheduled_kes),
    paidKes: maybeNum(row.paid_kes),
    nextDue: row.next_due as string | null,
    percentPaid: maybeNum(row.percent_paid),
    overCommitted: Boolean(row.over_committed),
    confidentiality: row.confidentiality as ContractSettlement['confidentiality'],
  }));
}

export async function fetchMilestones(contractId: string): Promise<ContractMilestone[]> {
  const { data, error } = await supabase
    .from('contract_milestones')
    .select(
      'id, contract_id, sequence, title_en, title_tr, due_on, state, amount, currency, ' +
        'amount_kes, valuation_id, payment_voucher_id, note, confidentiality',
    )
    .eq('contract_id', contractId)
    .order('sequence');
  fail(error);

  return rows<Record<string, unknown>>(data).map((row) => ({
    id: row.id as string,
    contractId: row.contract_id as string,
    sequence: Number(row.sequence),
    titleEn: row.title_en as string,
    titleTr: row.title_tr as string | null,
    dueOn: row.due_on as string | null,
    state: row.state as ContractMilestone['state'],
    amount: num(row.amount),
    currency: row.currency as ContractMilestone['currency'],
    amountKes: num(row.amount_kes),
    valuationId: row.valuation_id as string | null,
    paymentVoucherId: row.payment_voucher_id as string | null,
    note: row.note as string | null,
    confidentiality: row.confidentiality as ContractMilestone['confidentiality'],
  }));
}

// ---------------------------------------------------------------------------
// Performance (M14-06)
// ---------------------------------------------------------------------------

export async function fetchReviews(): Promise<SupplierReview[]> {
  const { data, error } = await supabase
    .from('supplier_reviews')
    .select(
      'id, contract_id, organization_id, stakeholder_id, contractor_id, period_start, ' +
        'period_end, quality, timeliness, cost_control, cooperation, overall, note_en, ' +
        'note_tr, document_id, reviewed_at, confidentiality, ' +
        'reviewer:profiles!supplier_reviews_reviewed_by_fkey(full_name), ' +
        'organization:organizations(name), ' +
        'stakeholder:stakeholders(full_name), ' +
        'contractor:contractors(name)',
    )
    .order('reviewed_at', { ascending: false });
  fail(error);

  return rows<Record<string, unknown>>(data).map((row) => {
    const org = row.organization as { name: string } | { name: string }[] | null;
    const contractor = row.contractor as { name: string } | { name: string }[] | null;
    const pick = (r: { name: string } | { name: string }[] | null) =>
      Array.isArray(r) ? (r[0]?.name ?? null) : (r?.name ?? null);
    return {
      id: row.id as string,
      contractId: row.contract_id as string | null,
      organizationId: row.organization_id as string | null,
      stakeholderId: row.stakeholder_id as string | null,
      contractorId: row.contractor_id as string | null,
      // Whichever of the three the review is about; which register the
      // supplier lives in is not the reader's problem.
      partyName: pick(org) ?? label(row.stakeholder as NamedRef) ?? pick(contractor),
      periodStart: row.period_start as string | null,
      periodEnd: row.period_end as string | null,
      quality: Number(row.quality),
      timeliness: Number(row.timeliness),
      costControl: Number(row.cost_control),
      cooperation: Number(row.cooperation),
      overall: num(row.overall),
      noteEn: row.note_en as string,
      noteTr: row.note_tr as string | null,
      documentId: row.document_id as string | null,
      reviewedByName: label(row.reviewer as NamedRef),
      reviewedAt: row.reviewed_at as string,
      confidentiality: row.confidentiality as SupplierReview['confidentiality'],
    };
  });
}

/**
 * Records a review (M14-06).
 *
 * The party is resolved from the contract rather than asked for twice. The
 * database insists a review is about exactly one supplier, and a contract
 * already says who its counterparty is — asking the screen to repeat it is
 * how the two come to disagree. A contract whose counterparty is only a name,
 * with no register link, cannot be reviewed this way, and saying so is better
 * than filing a review against nobody.
 */
export async function addReview(input: {
  contractId: string;
  quality: number;
  timeliness: number;
  costControl: number;
  cooperation: number;
  noteEn: string;
  periodStart?: string | null;
  periodEnd?: string | null;
}): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const me = session.session?.user.id;
  if (!me) throw new Error('Sign in again — your session has expired.');

  const { data: contract, error: readError } = await supabase
    .from('contracts')
    .select('organization_id, stakeholder_id, contractor_id, counterparty_name')
    .eq('id', input.contractId)
    .maybeSingle();
  fail(readError);
  if (!contract) throw new Error('That contract is no longer there.');

  const party = contract as {
    organization_id: string | null;
    stakeholder_id: string | null;
    contractor_id: string | null;
    counterparty_name: string;
  };

  if (!party.organization_id && !party.stakeholder_id && !party.contractor_id) {
    throw new Error(
      `${party.counterparty_name} is recorded only as a name on this contract. ` +
        'Link it to an organisation, a stakeholder or a contractor first, so the ' +
        'review attaches to a supplier rather than to a string.',
    );
  }

  const { error } = await supabase.from('supplier_reviews').insert({
    contract_id: input.contractId,
    organization_id: party.organization_id,
    stakeholder_id: party.organization_id ? null : party.stakeholder_id,
    contractor_id: party.organization_id || party.stakeholder_id ? null : party.contractor_id,
    period_start: input.periodStart || null,
    period_end: input.periodEnd || null,
    quality: input.quality,
    timeliness: input.timeliness,
    cost_control: input.costControl,
    cooperation: input.cooperation,
    note_en: input.noteEn.trim(),
    reviewed_by: me,
  });
  fail(error);
}

// ---------------------------------------------------------------------------
// The other half of the match (M14-07, 0038)
// ---------------------------------------------------------------------------

/**
 * Every instalment against the valuation it cites. Read from a view, because
 * the verdicts are computed and a client that recomputed them would be a
 * second copy of the rule that drifts — and because the one verdict most
 * easily got wrong, "these two amounts are in different currencies and there
 * is no rate between them", is a refusal to compare rather than a comparison.
 */
export async function fetchMilestoneMatching(): Promise<MilestoneMatch[]> {
  const { data, error } = await supabase
    .from('milestone_matching')
    .select('*')
    .order('contract_id')
    .order('sequence');
  fail(error);
  return (
    (data ?? []) as {
      contract_milestone_id: string;
      contract_id: string;
      reference_no: string | null;
      counterparty_name: string;
      sequence: number;
      title_en: string;
      title_tr: string | null;
      state: MilestoneState;
      due_on: string | null;
      amount: number | string;
      currency: CurrencyCode;
      valuation_id: string | null;
      payment_voucher_id: string | null;
      valuation_amount: number | string | null;
      valuation_currency: CurrencyCode | null;
      construction_block_id: string | null;
      period_start: string | null;
      period_end: string | null;
      valuation_state: ValuationState | null;
      qs_certified_at: string | null;
      director_approved_at: string | null;
      amount_verdict: AmountVerdict;
      claims_a_certification_the_works_do_not: boolean;
      matched_to_another_firms_work: boolean;
      confidentiality: MilestoneMatch['confidentiality'];
    }[]
  ).map((row) => ({
    contractMilestoneId: row.contract_milestone_id,
    contractId: row.contract_id,
    referenceNo: row.reference_no,
    counterpartyName: row.counterparty_name,
    sequence: row.sequence,
    titleEn: row.title_en,
    titleTr: row.title_tr,
    state: row.state,
    dueOn: row.due_on,
    amount: Number(row.amount),
    currency: row.currency,
    valuationId: row.valuation_id,
    paymentVoucherId: row.payment_voucher_id,
    valuationAmount: row.valuation_amount == null ? null : Number(row.valuation_amount),
    valuationCurrency: row.valuation_currency,
    constructionBlockId: row.construction_block_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    valuationState: row.valuation_state,
    qsCertifiedAt: row.qs_certified_at,
    directorApprovedAt: row.director_approved_at,
    amountVerdict: row.amount_verdict,
    claimsACertificationTheWorksDoNot: row.claims_a_certification_the_works_do_not,
    matchedToAnotherFirmsWork: row.matched_to_another_firms_work,
    confidentiality: row.confidentiality,
  }));
}

/** Measured work nobody has scheduled a payment for. */
export async function fetchUnscheduledValuations(): Promise<UnscheduledValuation[]> {
  const { data, error } = await supabase
    .from('unscheduled_valuations')
    .select('*')
    .order('period_end', { ascending: false });
  fail(error);
  return (
    (data ?? []) as {
      valuation_id: string;
      construction_block_id: string | null;
      block_code: string | null;
      contractor_id: string | null;
      contractor_name: string | null;
      period_start: string;
      period_end: string;
      amount: number | string;
      currency: CurrencyCode;
      state: ValuationState;
      certified: boolean;
      paid_at: string | null;
      the_only_live_contract_for_that_firm: string | null;
      confidentiality: UnscheduledValuation['confidentiality'];
    }[]
  ).map((row) => ({
    valuationId: row.valuation_id,
    constructionBlockId: row.construction_block_id,
    blockCode: row.block_code,
    contractorId: row.contractor_id,
    contractorName: row.contractor_name,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    amount: Number(row.amount),
    currency: row.currency,
    state: row.state,
    certified: row.certified,
    paidAt: row.paid_at,
    theOnlyLiveContractForThatFirm: row.the_only_live_contract_for_that_firm,
    confidentiality: row.confidentiality,
  }));
}

export async function fetchPaymentMatchingHealth(): Promise<PaymentMatchingHealth> {
  const { data, error } = await supabase.from('payment_matching_health').select('*').maybeSingle();
  fail(error);
  const row = (data ?? {}) as Record<string, number | string | null>;
  const n = (value: number | string | null | undefined): number =>
    value == null ? 0 : Number(value);
  return {
    instalmentsWhoseAmountDisagrees: n(row.instalments_whose_amount_disagrees),
    instalmentsThatCannotBeCompared: n(row.instalments_that_cannot_be_compared),
    instalmentsClaimingAnUncertifiedMeasurement: n(
      row.instalments_claiming_an_uncertified_measurement,
    ),
    instalmentsMatchedToAnotherFirmsWork: n(row.instalments_matched_to_another_firms_work),
    settledInstalmentsWithNoMeasurement: n(row.settled_instalments_with_no_measurement),
    measuredWorkWithNoInstalment: n(row.measured_work_with_no_instalment),
    certifiedWorkWithNoInstalment: n(row.certified_work_with_no_instalment),
  };
}

/**
 * Point an instalment at the measurement behind it. The database refuses a
 * second instalment against the same measurement, and that refusal is passed
 * through: two payments for one period of work is the error this is for.
 */
export async function matchMilestoneToValuation(input: {
  id: string;
  valuationId: string;
}): Promise<void> {
  const { error } = await supabase
    .from('contract_milestones')
    .update({ valuation_id: input.valuationId })
    .eq('id', input.id);
  fail(error);
}
