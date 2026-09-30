/**
 * Risk, issue, assumption and dependency (M6).
 *
 * Two calls here are deliberately not what they look like.
 *
 * `materialiseRisk` is not "create an issue": it is one act that creates the
 * issue, links it to the risk and moves the risk, and the database does all
 * three or none. Doing it from the client as three writes would leave a
 * window where a risk has happened and nothing says so.
 *
 * And there is no call that breaks an assumption *and* files the risk. That
 * happens by itself in a trigger, because the moment an assumption fails is
 * the moment nobody has the attention to spare for filing one.
 */
import { supabase } from '../lib/supabase';
import type {
  Assumption,
  AssumptionState,
  Dependency,
  Issue,
  IssueState,
  Risk,
  RiskCategory,
  RiskEscalation,
  RiskMatrixCell,
  RiskResponse,
  RiskScoreChange,
  RiskState,
} from '../types';

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

// ---------------------------------------------------------------------------
// Risks
// ---------------------------------------------------------------------------

const RISK_COLUMNS =
  'id, title_en, title_tr, detail_en, detail_tr, category, likelihood, impact, score, ' +
  'owner_profile_id, state, response, response_plan_en, response_plan_tr, ' +
  'trigger_en, early_warning_en, source_assumption_id, review_on, confidentiality, ' +
  'owner:profiles!risks_owner_profile_id_fkey(full_name)';

interface RiskRow {
  id: string;
  title_en: string;
  title_tr: string | null;
  detail_en: string | null;
  detail_tr: string | null;
  category: RiskCategory;
  likelihood: number;
  impact: number;
  score: number;
  owner_profile_id: string | null;
  state: RiskState;
  response: RiskResponse | null;
  response_plan_en: string | null;
  response_plan_tr: string | null;
  trigger_en: string | null;
  early_warning_en: string | null;
  source_assumption_id: string | null;
  review_on: string | null;
  confidentiality: Risk['confidentiality'];
  owner: NamedRef | NamedRef[] | null;
}

export async function fetchRisks(): Promise<Risk[]> {
  const { data, error } = await supabase
    .from('risks')
    .select(RISK_COLUMNS)
    .order('score', { ascending: false });
  fail(error);

  const rows = (data ?? []) as unknown as RiskRow[];
  const escalations = await countOpenEscalations(rows.map((r) => r.id));

  return rows.map((row) => ({
    id: row.id,
    titleEn: row.title_en,
    titleTr: row.title_tr,
    detailEn: row.detail_en,
    detailTr: row.detail_tr,
    category: row.category,
    likelihood: row.likelihood,
    impact: row.impact,
    score: row.score,
    ownerProfileId: row.owner_profile_id,
    ownerName: label(row.owner),
    state: row.state,
    response: row.response,
    responsePlanEn: row.response_plan_en,
    responsePlanTr: row.response_plan_tr,
    triggerEn: row.trigger_en,
    earlyWarningEn: row.early_warning_en,
    sourceAssumptionId: row.source_assumption_id,
    reviewOn: row.review_on,
    confidentiality: row.confidentiality,
    openEscalations: escalations.get(row.id) ?? 0,
  }));
}

/** Crossings nobody has acknowledged yet. The count is the whole point. */
async function countOpenEscalations(riskIds: string[]): Promise<Map<string, number>> {
  if (riskIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('risk_escalations')
    .select('risk_id')
    .in('risk_id', riskIds)
    .is('acknowledged_at', null);
  fail(error);

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { risk_id: string }[]) {
    counts.set(row.risk_id, (counts.get(row.risk_id) ?? 0) + 1);
  }
  return counts;
}

export async function fetchScoreHistory(riskId: string): Promise<RiskScoreChange[]> {
  const { data, error } = await supabase
    .from('risk_score_changes')
    .select(
      'id, risk_id, from_score, to_score, to_likelihood, to_impact, changed_at, ' +
        'changer:profiles!risk_score_changes_changed_by_fkey(full_name)',
    )
    .eq('risk_id', riskId)
    .order('changed_at', { ascending: false });
  fail(error);
  return (
    (data ?? []) as unknown as {
      id: number;
      risk_id: string;
      from_score: number | null;
      to_score: number;
      to_likelihood: number;
      to_impact: number;
      changed_at: string;
      changer: NamedRef | NamedRef[] | null;
    }[]
  ).map((row) => ({
    id: row.id,
    riskId: row.risk_id,
    fromScore: row.from_score,
    toScore: row.to_score,
    toLikelihood: row.to_likelihood,
    toImpact: row.to_impact,
    changedByName: label(row.changer),
    changedAt: row.changed_at,
  }));
}

export async function fetchEscalations(riskId: string): Promise<RiskEscalation[]> {
  const { data, error } = await supabase
    .from('risk_escalations')
    .select(
      'id, risk_id, score, threshold, escalated_at, acknowledged_at, ' +
        'acknowledger:profiles!risk_escalations_acknowledged_by_fkey(full_name)',
    )
    .eq('risk_id', riskId)
    .order('escalated_at', { ascending: false });
  fail(error);
  return (
    (data ?? []) as unknown as {
      id: number;
      risk_id: string;
      score: number;
      threshold: number;
      escalated_at: string;
      acknowledged_at: string | null;
      acknowledger: NamedRef | NamedRef[] | null;
    }[]
  ).map((row) => ({
    id: row.id,
    riskId: row.risk_id,
    score: row.score,
    threshold: row.threshold,
    escalatedAt: row.escalated_at,
    acknowledgedAt: row.acknowledged_at,
    acknowledgedByName: label(row.acknowledger),
  }));
}

export async function fetchMatrix(): Promise<RiskMatrixCell[]> {
  const { data, error } = await supabase.from('risk_matrix').select('*');
  fail(error);
  return (
    (data ?? []) as { likelihood: number; impact: number; score: number; risk_count: number }[]
  ).map((row) => ({
    likelihood: Number(row.likelihood),
    impact: Number(row.impact),
    score: Number(row.score),
    riskCount: Number(row.risk_count),
  }));
}

export async function createRisk(input: {
  titleEn: string;
  category: RiskCategory;
  likelihood: number;
  impact: number;
  triggerEn: string | null;
}): Promise<void> {
  // No score is sent. It is generated from the two numbers above.
  const { error } = await supabase.from('risks').insert({
    title_en: input.titleEn,
    category: input.category,
    likelihood: input.likelihood,
    impact: input.impact,
    trigger_en: input.triggerEn,
  });
  fail(error);
}

export async function rescoreRisk(input: {
  id: string;
  likelihood: number;
  impact: number;
}): Promise<void> {
  const { error } = await supabase
    .from('risks')
    .update({ likelihood: input.likelihood, impact: input.impact })
    .eq('id', input.id);
  fail(error);
}

/**
 * The response and the reasoning go together.
 *
 * Accepting a risk with no plan is refused by a check constraint, so this
 * sends both and lets the database say so when one is missing — its sentence
 * names the problem better than a disabled button.
 */
export async function setResponse(input: {
  id: string;
  response: RiskResponse | null;
  planEn: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from('risks')
    .update({ response: input.response, response_plan_en: input.planEn })
    .eq('id', input.id);
  fail(error);
}

export async function setRiskState(input: { id: string; state: RiskState }): Promise<void> {
  const { error } = await supabase.from('risks').update({ state: input.state }).eq('id', input.id);
  fail(error);
}

export async function acknowledgeEscalation(input: {
  id: number;
  profileId: string;
}): Promise<void> {
  const { error } = await supabase
    .from('risk_escalations')
    .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: input.profileId })
    .eq('id', input.id);
  fail(error);
}

/** One act: the issue, the link and the risk's state, or none of them. */
export async function materialiseRisk(input: {
  riskId: string;
  detailEn: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('materialise_risk', {
    p_risk: input.riskId,
    p_detail_en: input.detailEn,
  });
  fail(error);
  return data as string;
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

export async function fetchIssues(): Promise<Issue[]> {
  const { data, error } = await supabase
    .from('issues')
    .select(
      'id, title_en, title_tr, detail_en, category, severity, state, opened_on, ' +
        'materialised_from_risk_id, resolved_at, resolution_en, confidentiality, ' +
        'owner:profiles!issues_owner_profile_id_fkey(full_name)',
    )
    .order('severity', { ascending: false });
  fail(error);
  return (
    (data ?? []) as unknown as {
      id: string;
      title_en: string;
      title_tr: string | null;
      detail_en: string | null;
      category: RiskCategory;
      severity: number;
      state: IssueState;
      opened_on: string;
      materialised_from_risk_id: string | null;
      resolved_at: string | null;
      resolution_en: string | null;
      confidentiality: Issue['confidentiality'];
      owner: NamedRef | NamedRef[] | null;
    }[]
  ).map((row) => ({
    id: row.id,
    titleEn: row.title_en,
    titleTr: row.title_tr,
    detailEn: row.detail_en,
    category: row.category,
    severity: row.severity,
    ownerName: label(row.owner),
    state: row.state,
    openedOn: row.opened_on,
    materialisedFromRiskId: row.materialised_from_risk_id,
    resolvedAt: row.resolved_at,
    resolutionEn: row.resolution_en,
    confidentiality: row.confidentiality,
  }));
}

export async function createIssue(input: {
  titleEn: string;
  category: RiskCategory;
  severity: number;
}): Promise<void> {
  const { error } = await supabase.from('issues').insert({
    title_en: input.titleEn,
    category: input.category,
    severity: input.severity,
  });
  fail(error);
}

export async function resolveIssue(input: { id: string; resolutionEn: string }): Promise<void> {
  const { error } = await supabase
    .from('issues')
    .update({
      state: 'resolved',
      resolved_at: new Date().toISOString(),
      resolution_en: input.resolutionEn,
    })
    .eq('id', input.id);
  fail(error);
}

// ---------------------------------------------------------------------------
// Assumptions
// ---------------------------------------------------------------------------

export async function fetchAssumptions(): Promise<Assumption[]> {
  const { data, error } = await supabase
    .from('assumptions')
    .select(
      'id, statement_en, statement_tr, risk_category, state, review_on, last_checked_on, ' +
        'note, raised_risk_id, confidentiality, ' +
        'owner:profiles!assumptions_owner_profile_id_fkey(full_name)',
    )
    .order('state');
  fail(error);
  return (
    (data ?? []) as unknown as {
      id: string;
      statement_en: string;
      statement_tr: string | null;
      risk_category: RiskCategory;
      state: AssumptionState;
      review_on: string | null;
      last_checked_on: string | null;
      note: string | null;
      raised_risk_id: string | null;
      confidentiality: Assumption['confidentiality'];
      owner: NamedRef | NamedRef[] | null;
    }[]
  ).map((row) => ({
    id: row.id,
    statementEn: row.statement_en,
    statementTr: row.statement_tr,
    riskCategory: row.risk_category,
    state: row.state,
    ownerName: label(row.owner),
    reviewOn: row.review_on,
    lastCheckedOn: row.last_checked_on,
    note: row.note,
    raisedRiskId: row.raised_risk_id,
    confidentiality: row.confidentiality,
  }));
}

export async function createAssumption(input: {
  statementEn: string;
  riskCategory: RiskCategory;
}): Promise<void> {
  const { error } = await supabase.from('assumptions').insert({
    statement_en: input.statementEn,
    risk_category: input.riskCategory,
  });
  fail(error);
}

/**
 * Recording where an assumption stands.
 *
 * Moving one to `broken` also raises a risk — but not here. The trigger does
 * it, so it cannot be skipped by a client that forgot, crashed, or was
 * written later.
 */
export async function setAssumptionState(input: {
  id: string;
  state: AssumptionState;
  note: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from('assumptions')
    .update({
      state: input.state,
      note: input.note,
      last_checked_on: input.state === 'unverified' ? null : new Date().toISOString().slice(0, 10),
    })
    .eq('id', input.id);
  fail(error);
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export async function fetchDependencies(): Promise<Dependency[]> {
  const { data, error } = await supabase.from('dependency_status').select('*');
  fail(error);
  return (
    (data ?? []) as {
      id: string;
      blocker_legal_case_id: string | null;
      blocker_site_task_id: string | null;
      blocker_obligation_id: string | null;
      blocker_risk_id: string | null;
      blocker_label: string | null;
      dependent_site_task_id: string | null;
      dependent_obligation_id: string | null;
      dependent_legal_case_id: string | null;
      dependent_label: string | null;
      note_en: string | null;
      blocker_settled: boolean | null;
      confidentiality: Dependency['confidentiality'];
    }[]
  ).map((row) => ({
    id: row.id,
    blockerLegalCaseId: row.blocker_legal_case_id,
    blockerSiteTaskId: row.blocker_site_task_id,
    blockerObligationId: row.blocker_obligation_id,
    blockerRiskId: row.blocker_risk_id,
    blockerLabel: row.blocker_label,
    dependentSiteTaskId: row.dependent_site_task_id,
    dependentObligationId: row.dependent_obligation_id,
    dependentLegalCaseId: row.dependent_legal_case_id,
    dependentLabel: row.dependent_label,
    noteEn: row.note_en,
    blockerSettled: row.blocker_settled,
    confidentiality: row.confidentiality,
  }));
}

export async function createDependency(input: {
  blockerLabel: string;
  dependentLabel: string;
  noteEn: string | null;
}): Promise<void> {
  const { error } = await supabase.from('dependencies').insert({
    blocker_label: input.blockerLabel,
    dependent_label: input.dependentLabel,
    note_en: input.noteEn,
  });
  fail(error);
}

export async function deleteDependency(id: string): Promise<void> {
  const { error } = await supabase.from('dependencies').delete().eq('id', id);
  fail(error);
}
