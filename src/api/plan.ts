/**
 * The project backbone: phases, milestones, baselines, chronology (M15).
 *
 * The requirement's complaint was that the portal had fifteen modules and no
 * plan — no time axis joining them. So the shape here is a time axis: what is
 * due (critical_dates), what the plan says (milestones), what it said before
 * (baseline_variance), and what actually happened (project_chronology).
 *
 * Three nulls travel through this file unmolested, and each one means
 * something a zero would not:
 *
 *   milestone.slipDays        null = one of the two dates is not known yet
 *   variance.targetMovedDays  null = no target on one side to compare
 *   chronology.precision      'year' = the day is not known, do not print one
 */
import { supabase } from '../lib/supabase';
import type {
  BaselineVariance,
  ChronologyEvent,
  CriticalDate,
  Milestone,
  PhasePosition,
  PlanBaseline,
} from '../types';

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

const rows = <T>(data: unknown): T[] => (data ?? []) as unknown as T[];
const maybeNum = (v: unknown): number | null => (v == null ? null : Number(v));

type NamedRef = { full_name: string } | { full_name: string }[] | null;
const label = (ref: NamedRef): string | null =>
  Array.isArray(ref) ? (ref[0]?.full_name ?? null) : (ref?.full_name ?? null);

// ---------------------------------------------------------------------------
// Milestones (M15-01)
// ---------------------------------------------------------------------------

const MILESTONE_COLUMNS =
  'id, code, phase_id, title_en, title_tr, detail_en, detail_tr, target_on, ' +
  'achieved_on, slip_days, state, critical, owner_profile_id, ' +
  'evidence_document_id, note, confidentiality, ' +
  'owner:profiles!milestones_owner_profile_id_fkey(full_name), ' +
  'phase:project_phases(name_en)';

export async function fetchMilestones(): Promise<Milestone[]> {
  const { data, error } = await supabase
    .from('milestones')
    .select(MILESTONE_COLUMNS)
    .order('target_on', { nullsFirst: false });
  fail(error);

  return rows<Record<string, unknown>>(data).map((row) => {
    const phase = row.phase as { name_en: string } | { name_en: string }[] | null;
    return {
      id: row.id as string,
      code: row.code as string | null,
      phaseId: row.phase_id as string | null,
      phaseName: Array.isArray(phase) ? (phase[0]?.name_en ?? null) : (phase?.name_en ?? null),
      titleEn: row.title_en as string,
      titleTr: row.title_tr as string | null,
      detailEn: row.detail_en as string | null,
      detailTr: row.detail_tr as string | null,
      targetOn: row.target_on as string | null,
      achievedOn: row.achieved_on as string | null,
      // Not coalesced. Null is "we do not know yet", and a nought here would
      // read as "delivered exactly on time".
      slipDays: maybeNum(row.slip_days),
      state: row.state as Milestone['state'],
      critical: Boolean(row.critical),
      ownerName: label(row.owner as NamedRef),
      ownerProfileId: row.owner_profile_id as string | null,
      evidenceDocumentId: row.evidence_document_id as string | null,
      note: row.note as string | null,
      confidentiality: row.confidentiality as Milestone['confidentiality'],
    };
  });
}

export async function addMilestone(input: {
  titleEn: string;
  code?: string | null;
  phaseId?: string | null;
  targetOn?: string | null;
  critical?: boolean;
  detailEn?: string | null;
}): Promise<string> {
  const { data, error } = await supabase
    .from('milestones')
    .insert({
      title_en: input.titleEn.trim(),
      code: input.code?.trim() || null,
      phase_id: input.phaseId || null,
      target_on: input.targetOn || null,
      critical: input.critical ?? false,
      detail_en: input.detailEn?.trim() || null,
    })
    .select('id')
    .single();
  fail(error);
  return (data as { id: string }).id;
}

/**
 * Moving a target date.
 *
 * Nothing stops this, and nothing should: dates move. What the portal does is
 * remember — a baseline taken before the move keeps the old date, and
 * `baseline_variance` reports the distance. That is the mechanism the
 * requirement asks for, and it works precisely because moving a date is easy
 * and forgetting it is not.
 */
export async function moveTarget(id: string, targetOn: string | null): Promise<void> {
  const { error } = await supabase
    .from('milestones')
    .update({ target_on: targetOn || null })
    .eq('id', id);
  fail(error);
}

/**
 * Marking one achieved. The database requires the date AND the evidence
 * document, so both are parameters here rather than optional extras.
 */
export async function achieveMilestone(
  id: string,
  achievedOn: string,
  evidenceDocumentId: string,
): Promise<void> {
  const { error } = await supabase
    .from('milestones')
    .update({
      state: 'achieved',
      achieved_on: achievedOn,
      evidence_document_id: evidenceDocumentId,
    })
    .eq('id', id);
  fail(error);
}

/** A target that passed without the thing happening. Somebody has to say so. */
export async function markMissed(id: string, note: string): Promise<void> {
  const { error } = await supabase
    .from('milestones')
    .update({ state: 'missed', note: note.trim() || null })
    .eq('id', id);
  fail(error);
}

// ---------------------------------------------------------------------------
// Phases (M15-02)
// ---------------------------------------------------------------------------

export async function fetchPhases(): Promise<PhasePosition[]> {
  const { data, error } = await supabase.from('phase_position').select('*').order('sequence');
  fail(error);

  return rows<Record<string, unknown>>(data).map((row) => ({
    phaseId: row.phase_id as string,
    code: row.code as string | null,
    nameEn: row.name_en as string,
    nameTr: row.name_tr as string | null,
    sequence: Number(row.sequence),
    startsOn: row.starts_on as string | null,
    endsOn: row.ends_on as string | null,
    scopeEn: row.scope_en as string | null,
    scopeTr: row.scope_tr as string | null,
    objectiveEn: row.objective_en as string | null,
    objectiveTr: row.objective_tr as string | null,
    blocks: Number(row.blocks ?? 0),
    blocksComplete: Number(row.blocks_complete ?? 0),
    milestones: Number(row.milestones ?? 0),
    milestonesAchieved: Number(row.milestones_achieved ?? 0),
    milestonesMissed: Number(row.milestones_missed ?? 0),
    nextTarget: row.next_target as string | null,
    budgetKes: maybeNum(row.budget_kes),
    overran: Boolean(row.overran),
    confidentiality: row.confidentiality as PhasePosition['confidentiality'],
  }));
}

// ---------------------------------------------------------------------------
// Baselines (M15-06)
// ---------------------------------------------------------------------------

export async function fetchBaselines(): Promise<PlanBaseline[]> {
  const { data, error } = await supabase
    .from('plan_baselines')
    .select('id, name, taken_on, note, taker:profiles!plan_baselines_taken_by_fkey(full_name)')
    .order('taken_on', { ascending: false });
  fail(error);

  return rows<Record<string, unknown>>(data).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    takenOn: row.taken_on as string,
    takenByName: label(row.taker as NamedRef),
    note: row.note as string | null,
  }));
}

export async function fetchVariance(baselineId: string): Promise<BaselineVariance[]> {
  const { data, error } = await supabase
    .from('baseline_variance')
    .select('*')
    .eq('baseline_id', baselineId)
    .order('current_target', { nullsFirst: false });
  fail(error);

  return rows<Record<string, unknown>>(data).map((row) => ({
    baselineId: row.baseline_id as string,
    baselineName: row.baseline_name as string,
    takenOn: row.taken_on as string,
    milestoneId: row.milestone_id as string,
    code: row.code as string | null,
    titleEn: row.title_en as string,
    titleTr: row.title_tr as string | null,
    baselineTarget: row.baseline_target as string | null,
    currentTarget: row.current_target as string | null,
    // How far the DATE moved, which is not how late delivery was.
    targetMovedDays: maybeNum(row.target_moved_days),
    baselineState: row.baseline_state as BaselineVariance['baselineState'],
    currentState: row.current_state as BaselineVariance['currentState'],
    achievedOn: row.achieved_on as string | null,
    deliverySlipDays: maybeNum(row.delivery_slip_days),
    confidentiality: row.confidentiality as BaselineVariance['confidentiality'],
  }));
}

/** Freezes every milestone the caller can see (M15-06). */
export async function takeBaseline(name: string, note?: string | null): Promise<void> {
  const { error } = await supabase.rpc('take_baseline', {
    p_name: name.trim(),
    p_note: note?.trim() || null,
  });
  fail(error);
}

// ---------------------------------------------------------------------------
// The chronology (M15-07)
// ---------------------------------------------------------------------------

export async function fetchChronology(limit = 200): Promise<ChronologyEvent[]> {
  const { data, error } = await supabase
    .from('project_chronology')
    .select('*')
    .order('occurred_on', { ascending: false })
    .limit(limit);
  fail(error);

  return rows<Record<string, unknown>>(data).map((row) => ({
    source: row.source as string,
    category: row.category as string,
    id: row.id as string,
    occurredOn: row.occurred_on as string,
    precision: row.precision as ChronologyEvent['precision'],
    titleEn: row.title_en as string | null,
    titleTr: row.title_tr as string | null,
    detailEn: row.detail_en as string | null,
    documentId: row.document_id as string | null,
    sourceNote: row.source_note as string | null,
    legalCaseId: row.legal_case_id as string | null,
    confidentiality: row.confidentiality as ChronologyEvent['confidentiality'],
  }));
}

export async function addChronologyEntry(input: {
  occurredOn: string;
  precision: ChronologyEvent['precision'];
  category: string;
  titleEn: string;
  detailEn?: string | null;
  documentId?: string | null;
  sourceNote?: string | null;
}): Promise<string> {
  // The database requires one of the two, and saying so here is kinder than
  // letting it come back as a constraint name.
  if (!input.documentId && !input.sourceNote?.trim()) {
    throw new Error(
      'Say where this comes from — a document in the vault, or in writing. ' +
        'The chronology is legal evidence as well as memory, and an entry nobody ' +
        'can trace is neither.',
    );
  }
  const { data, error } = await supabase
    .from('chronology_entries')
    .insert({
      occurred_on: input.occurredOn,
      precision: input.precision,
      category: input.category,
      title_en: input.titleEn.trim(),
      detail_en: input.detailEn?.trim() || null,
      document_id: input.documentId || null,
      source_note: input.sourceNote?.trim() || null,
    })
    .select('id')
    .single();
  fail(error);
  return (data as { id: string }).id;
}

// ---------------------------------------------------------------------------
// The countdown strip (M15-04)
// ---------------------------------------------------------------------------

export async function fetchCriticalDates(limit = 3): Promise<CriticalDate[]> {
  const { data, error } = await supabase
    .from('critical_dates')
    .select('*')
    .order('due_on')
    .limit(limit);
  fail(error);

  return rows<Record<string, unknown>>(data).map((row) => ({
    kind: row.kind as string,
    id: row.id as string,
    titleEn: row.title_en as string | null,
    titleTr: row.title_tr as string | null,
    dueOn: row.due_on as string,
    dueAt: row.due_at as string | null,
    detail: row.detail as string | null,
    legalCaseId: row.legal_case_id as string | null,
    meetingId: row.meeting_id as string | null,
    state: row.state as string | null,
    needsAttention: Boolean(row.needs_attention),
    daysAway: Number(row.days_away),
    confidentiality: row.confidentiality as CriticalDate['confidentiality'],
  }));
}

/**
 * Acknowledging a date (M15-04).
 *
 * This is the whole fix to the banner's original behaviour, which DELETED the
 * row — removing a court date from every user of the portal. The
 * acknowledgement is per person, so it takes the date off this reader's strip
 * and nobody else's, and it survives a reload, which the session-local
 * workaround did not.
 */
export async function acknowledgeDate(kind: string, entryId: string): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const me = session.session?.user.id;
  if (!me) throw new Error('Sign in again — your session has expired.');

  const { error } = await supabase
    .from('calendar_acknowledgements')
    .upsert({ kind, entry_id: entryId, user_id: me }, { onConflict: 'kind,entry_id,user_id' });
  fail(error);
}
