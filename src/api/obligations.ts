/**
 * The obligations register (M2).
 *
 * Two rules here are the database's, not this file's, and the interface is
 * built around trusting them: `verified` is generated from whether a document
 * is attached and cannot be set, and nothing reaches `fulfilled` until
 * evidence exists. Both fail loudly, which is why the console can offer the
 * control and show what came back rather than pre-empting it.
 */
import { supabase } from '../lib/supabase';
import type {
  CommitmentRecord,
  Confidentiality,
  Obligation,
  ObligationEvidence,
  ObligationOverride,
  ObligationSource,
  ObligationState,
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

interface ObligationRow {
  id: string;
  title_en: string | null;
  title_tr: string | null;
  detail_en: string | null;
  detail_tr: string | null;
  source: ObligationSource;
  source_document_id: string | null;
  source_legal_order_id: string | null;
  source_meeting_id: string | null;
  obligor_name: string;
  obligor_stakeholder_id: string | null;
  obligor_profile_id: string | null;
  beneficiary_name: string | null;
  due_on: string | null;
  state: ObligationState;
  prohibits: boolean;
  verified: boolean;
  confidentiality: Confidentiality;
  obligation_evidence: { count: number }[] | null;
}

const OBLIGATION_COLUMNS =
  'id, title_en, title_tr, detail_en, detail_tr, source, source_document_id, ' +
  'source_legal_order_id, source_meeting_id, obligor_name, obligor_stakeholder_id, ' +
  'obligor_profile_id, beneficiary_name, due_on, state, prohibits, verified, ' +
  'confidentiality, obligation_evidence(count)';

function toObligation(row: ObligationRow): Obligation {
  return {
    id: row.id,
    titleEn: row.title_en,
    titleTr: row.title_tr,
    detailEn: row.detail_en,
    detailTr: row.detail_tr,
    source: row.source,
    sourceDocumentId: row.source_document_id,
    sourceLegalOrderId: row.source_legal_order_id,
    sourceMeetingId: row.source_meeting_id,
    obligorName: row.obligor_name,
    obligorStakeholderId: row.obligor_stakeholder_id,
    obligorProfileId: row.obligor_profile_id,
    beneficiaryName: row.beneficiary_name,
    dueOn: row.due_on,
    state: row.state,
    prohibits: row.prohibits,
    verified: row.verified,
    confidentiality: row.confidentiality,
    evidenceCount: row.obligation_evidence?.[0]?.count ?? 0,
  };
}

export async function fetchObligations(): Promise<Obligation[]> {
  const { data, error } = await supabase
    .from('obligations')
    .select(OBLIGATION_COLUMNS)
    .order('due_on', { nullsFirst: false });
  fail(error);
  return ((data ?? []) as unknown as ObligationRow[]).map(toObligation);
}

export interface ObligationInput {
  titleEn: string | null;
  titleTr: string | null;
  detailEn: string | null;
  source: ObligationSource;
  sourceDocumentId: string | null;
  sourceLegalOrderId: string | null;
  sourceMeetingId: string | null;
  obligorName: string;
  obligorStakeholderId: string | null;
  beneficiaryName: string | null;
  dueOn: string | null;
  prohibits: boolean;
  confidentiality: Confidentiality;
}

export async function createObligation(input: ObligationInput): Promise<string> {
  const { data, error } = await supabase
    .from('obligations')
    .insert({
      title_en: input.titleEn,
      title_tr: input.titleTr,
      detail_en: input.detailEn,
      source: input.source,
      source_document_id: input.sourceDocumentId,
      source_legal_order_id: input.sourceLegalOrderId,
      source_meeting_id: input.sourceMeetingId,
      obligor_name: input.obligorName,
      obligor_stakeholder_id: input.obligorStakeholderId,
      beneficiary_name: input.beneficiaryName,
      due_on: input.dueOn,
      prohibits: input.prohibits,
      confidentiality: input.confidentiality,
    })
    .select('id')
    .single();
  fail(error);
  return (data as { id: string }).id;
}

/**
 * Moving to `fulfilled` is refused by a trigger unless evidence exists. The
 * error it raises is worth showing verbatim: it says exactly what is missing.
 */
export async function setObligationState(input: {
  id: string;
  state: ObligationState;
}): Promise<void> {
  const { error } = await supabase
    .from('obligations')
    .update({ state: input.state })
    .eq('id', input.id);
  fail(error);
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

interface EvidenceRow {
  id: string;
  obligation_id: string;
  description: string;
  document_id: string | null;
  observed_on: string | null;
  author: NamedRef | NamedRef[] | null;
}

export async function fetchEvidence(obligationId: string): Promise<ObligationEvidence[]> {
  const { data, error } = await supabase
    .from('obligation_evidence')
    .select(
      'id, obligation_id, description, document_id, observed_on, ' +
        'author:profiles!obligation_evidence_created_by_fkey(full_name)',
    )
    .eq('obligation_id', obligationId)
    .order('observed_on', { nullsFirst: false });
  fail(error);
  return ((data ?? []) as unknown as EvidenceRow[]).map((row) => ({
    id: row.id,
    obligationId: row.obligation_id,
    description: row.description,
    documentId: row.document_id,
    observedOn: row.observed_on,
    addedByName: label(row.author),
  }));
}

/** Whoever owes it may show that they did it — that is the point of M2-04. */
export async function addEvidence(input: {
  obligationId: string;
  description: string;
  observedOn: string | null;
}): Promise<void> {
  const { error } = await supabase.from('obligation_evidence').insert({
    obligation_id: input.obligationId,
    description: input.description,
    observed_on: input.observedOn,
  });
  fail(error);
}

// ---------------------------------------------------------------------------
// Proceeding anyway
// ---------------------------------------------------------------------------

interface OverrideRow {
  id: string;
  obligation_id: string;
  note_of_what: string;
  reason: string;
  acknowledged_at: string;
  acknowledger: NamedRef | NamedRef[] | null;
}

export async function fetchOverrides(): Promise<ObligationOverride[]> {
  const { data, error } = await supabase
    .from('obligation_overrides')
    .select(
      'id, obligation_id, note_of_what, reason, acknowledged_at, ' +
        'acknowledger:profiles!obligation_overrides_acknowledged_by_fkey(full_name)',
    )
    .order('acknowledged_at', { ascending: false });
  fail(error);
  return ((data ?? []) as unknown as OverrideRow[]).map((row) => ({
    id: row.id,
    obligationId: row.obligation_id,
    noteOfWhat: row.note_of_what,
    reason: row.reason,
    acknowledgedByName: label(row.acknowledger),
    acknowledgedAt: row.acknowledged_at,
  }));
}

/**
 * The record of a deliberate risk. Append-only in the database: there is no
 * edit and no delete, here or anywhere.
 */
export async function recordOverride(input: {
  obligationId: string;
  noteOfWhat: string;
  reason: string;
  acknowledgedBy: string;
  constructionBlockId: string | null;
}): Promise<void> {
  const { error } = await supabase.from('obligation_overrides').insert({
    obligation_id: input.obligationId,
    note_of_what: input.noteOfWhat,
    reason: input.reason,
    acknowledged_by: input.acknowledgedBy,
    construction_block_id: input.constructionBlockId,
  });
  fail(error);
}

// ---------------------------------------------------------------------------
// Of what somebody undertook, how much they did (M2-08)
// ---------------------------------------------------------------------------

interface CommitmentRow {
  stakeholder_id: string;
  undertaken: number;
  kept: number;
  broken: number;
  outstanding: number;
  overdue: number;
  kept_percent: number | null;
}

export async function fetchCommitmentRecords(): Promise<CommitmentRecord[]> {
  const { data, error } = await supabase.from('stakeholder_commitments').select('*');
  fail(error);
  return ((data ?? []) as CommitmentRow[]).map((row) => ({
    stakeholderId: row.stakeholder_id,
    undertaken: Number(row.undertaken),
    kept: Number(row.kept),
    broken: Number(row.broken),
    outstanding: Number(row.outstanding),
    overdue: Number(row.overdue),
    keptPercent: row.kept_percent == null ? null : Number(row.kept_percent),
  }));
}
