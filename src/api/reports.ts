/**
 * Compiled reports (M12-06 … M12-09).
 *
 * Nothing here composes a report. The compilation happens in SQL, under the
 * caller's own visibility, and the rows come back already carrying the
 * register each figure came from. A client that assembled the sections itself
 * would be a second answer to "what is the position" beside the registers,
 * and the second answer is the one that drifts.
 *
 * The run stores those rows as they stood when it was taken, so what is
 * published is what somebody approved rather than whatever the registers say
 * this morning.
 */
import { supabase } from '../lib/supabase';
import type { ReportKind, ReportRow, ReportRun } from '../types';

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

const rows = <T>(data: unknown): T[] => (data ?? []) as unknown as T[];

type NamedRef = { full_name: string } | { full_name: string }[] | null;
const label = (ref: NamedRef): string | null =>
  Array.isArray(ref) ? (ref[0]?.full_name ?? null) : (ref?.full_name ?? null);

/** The stored rows, which arrive as the jsonb the compiler produced. */
function toRows(content: unknown): ReportRow[] {
  if (!Array.isArray(content)) return [];
  return content.map((raw) => {
    const row = raw as Record<string, unknown>;
    return {
      section: String(row.section ?? ''),
      ord: Number(row.ord ?? 0),
      labelEn: (row.label_en as string | null) ?? null,
      labelTr: (row.label_tr as string | null) ?? null,
      valueText: (row.value_text as string | null) ?? null,
      // Not coalesced to zero: a row with no number has no number, and a
      // nought in a report is a figure somebody will quote.
      valueNumber: row.value_number == null ? null : Number(row.value_number),
      unit: (row.unit as string | null) ?? null,
      entityKind: (row.entity_kind as string | null) ?? null,
      entityId: (row.entity_id as string | null) ?? null,
      sourceNote: (row.source_note as string | null) ?? null,
      confidentiality: row.confidentiality as ReportRow['confidentiality'],
    };
  });
}

const RUN_COLUMNS =
  'id, kind, title, period_from, period_to, meeting_id, stakeholder_id, ' +
  'prepared_at, state, approved_at, published_at, withdrawn_reason, content, ' +
  'confidentiality, ' +
  'preparer:profiles!report_runs_prepared_by_fkey(full_name), ' +
  'approver:profiles!report_runs_approved_by_fkey(full_name), ' +
  'meeting:meetings(title), ' +
  'donor:stakeholders(full_name)';

export async function fetchReportRuns(): Promise<ReportRun[]> {
  const { data, error } = await supabase
    .from('report_runs')
    .select(RUN_COLUMNS)
    .order('prepared_at', { ascending: false });
  fail(error);

  return rows<Record<string, unknown>>(data).map((row) => {
    const meeting = row.meeting as { title: string } | { title: string }[] | null;
    return {
      id: row.id as string,
      kind: row.kind as ReportKind,
      title: row.title as string,
      periodFrom: row.period_from as string | null,
      periodTo: row.period_to as string | null,
      meetingId: row.meeting_id as string | null,
      meetingTitle: Array.isArray(meeting) ? (meeting[0]?.title ?? null) : (meeting?.title ?? null),
      stakeholderId: row.stakeholder_id as string | null,
      stakeholderName: label(row.donor as NamedRef),
      preparedByName: label(row.preparer as NamedRef),
      preparedAt: row.prepared_at as string,
      state: row.state as ReportRun['state'],
      approvedByName: label(row.approver as NamedRef),
      approvedAt: row.approved_at as string | null,
      publishedAt: row.published_at as string | null,
      withdrawnReason: row.withdrawn_reason as string | null,
      rows: toRows(row.content),
      confidentiality: row.confidentiality as ReportRun['confidentiality'],
    };
  });
}

export async function openReport(input: {
  kind: ReportKind;
  title: string;
  from?: string | null;
  to?: string | null;
  meetingId?: string | null;
  stakeholderId?: string | null;
}): Promise<string> {
  // The database requires the right subject for the right kind, and saying so
  // here is kinder than letting a constraint name arrive on the screen.
  if (input.kind === 'board_pack' && !input.meetingId) {
    throw new Error('A board pack is compiled for a meeting — choose which one.');
  }
  if (input.kind === 'donor_report' && !input.stakeholderId) {
    throw new Error('A donor report is about a donor — choose which one.');
  }

  const { data, error } = await supabase.rpc('open_report', {
    p_kind: input.kind,
    p_title: input.title.trim(),
    p_from: input.from || null,
    p_to: input.to || null,
    p_meeting: input.meetingId || null,
    p_stakeholder: input.stakeholderId || null,
  });
  fail(error);
  return data as string;
}

export async function approveReport(id: string): Promise<void> {
  const { error } = await supabase.rpc('approve_report', { p_id: id });
  fail(error);
}

export async function publishReport(id: string): Promise<void> {
  const { error } = await supabase.rpc('publish_report', { p_id: id });
  fail(error);
}

export async function withdrawReport(id: string, reason: string): Promise<void> {
  if (!reason.trim()) {
    throw new Error(
      'Say why it is being withdrawn — a report pulled without a reason is a gap in the record.',
    );
  }
  const { error } = await supabase.rpc('withdraw_report', {
    p_id: id,
    p_reason: reason.trim(),
  });
  fail(error);
}
