/**
 * The site and the works (M7).
 *
 * The one thing to know before reading this file: there is no call that sets
 * a progress percentage on a block. There is no such column. Progress is
 * `reportProgress`, which takes a document id because the column is not
 * nullable, and what a block is at comes back from a view that computes it.
 *
 * The same shape as the rest of the API layer: rows in, camel out, and the
 * database's own refusal passed through untouched — its message names what is
 * missing better than anything this file could say in advance.
 */
import { supabase } from '../lib/supabase';
import type {
  BlockProgress,
  BoqItem,
  BoqState,
  BoqVersion,
  ConstructionBlock,
  Contractor,
  CurrencyCode,
  InspectionFinding,
  ProjectPhase,
  SiteInspection,
  SiteTask,
  TaskConflict,
  TaskProgressReport,
  Valuation,
  ValuationState,
  WorkKind,
  WorkPackage,
  WorkState,
} from '../types';

interface NamedRef {
  full_name: string;
}

function label(ref: NamedRef | NamedRef[] | null | undefined): string | null {
  if (!ref) return null;
  const row = Array.isArray(ref) ? ref[0] : ref;
  return row?.full_name ?? null;
}

function named(ref: { name: string } | { name: string }[] | null | undefined): string | null {
  if (!ref) return null;
  const row = Array.isArray(ref) ? ref[0] : ref;
  return row?.name ?? null;
}

function count(ref: { count: number }[] | null | undefined): number {
  return ref?.[0]?.count ?? 0;
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Blocks and the breakdown
// ---------------------------------------------------------------------------

const BLOCK_COLUMNS =
  'id, code, name, floors, total_area_sqm, state, purpose_en, purpose_tr, phase_id, ' +
  'started_on, target_completion, contractor_id, confidentiality, ' +
  'phase:project_phases(name_en), ' +
  'engineer:profiles!construction_blocks_lead_engineer_profile_id_fkey(full_name), ' +
  'contractor:contractors(name)';

interface BlockRow {
  id: string;
  code: string;
  name: string;
  floors: number | null;
  total_area_sqm: number | null;
  state: WorkState;
  purpose_en: string | null;
  purpose_tr: string | null;
  phase_id: string | null;
  started_on: string | null;
  target_completion: string | null;
  contractor_id: string | null;
  confidentiality: ConstructionBlock['confidentiality'];
  phase: { name_en: string } | { name_en: string }[] | null;
  engineer: NamedRef | NamedRef[] | null;
  contractor: { name: string } | { name: string }[] | null;
}

function toBlock(row: BlockRow): ConstructionBlock {
  const phase = Array.isArray(row.phase) ? row.phase[0] : row.phase;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    floors: row.floors,
    totalAreaSqm: row.total_area_sqm,
    state: row.state,
    purposeEn: row.purpose_en,
    purposeTr: row.purpose_tr,
    phaseId: row.phase_id,
    phaseName: phase?.name_en ?? null,
    startedOn: row.started_on,
    targetCompletion: row.target_completion,
    leadEngineerName: label(row.engineer),
    contractorId: row.contractor_id,
    contractorName: named(row.contractor),
    confidentiality: row.confidentiality,
  };
}

export async function fetchBlocks(): Promise<ConstructionBlock[]> {
  const { data, error } = await supabase
    .from('construction_blocks')
    .select(BLOCK_COLUMNS)
    .order('code');
  fail(error);
  return ((data ?? []) as unknown as BlockRow[]).map(toBlock);
}

/** Computed, not stored. Null percentages mean nothing has been reported. */
export async function fetchBlockProgress(): Promise<BlockProgress[]> {
  const { data, error } = await supabase.from('block_progress').select('*');
  fail(error);
  return (
    (data ?? []) as {
      construction_block_id: string;
      construction_tasks: number;
      preservation_tasks: number;
      tasks_with_evidence: number;
      percent_complete: number | null;
      last_reported_at: string | null;
      last_captured_at: string | null;
    }[]
  ).map((row) => ({
    constructionBlockId: row.construction_block_id,
    constructionTasks: Number(row.construction_tasks),
    preservationTasks: Number(row.preservation_tasks),
    tasksWithEvidence: Number(row.tasks_with_evidence),
    percentComplete: row.percent_complete == null ? null : Number(row.percent_complete),
    lastReportedAt: row.last_reported_at,
    lastCapturedAt: row.last_captured_at,
  }));
}

export async function fetchPhases(): Promise<ProjectPhase[]> {
  const { data, error } = await supabase
    .from('project_phases')
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

const CONTRACTOR_COLUMNS =
  'id, name, contract_reference, scope_en, starts_on, ends_on, bond_amount, bond_currency, ' +
  'performance_note, performance_noted_at, ' +
  'noted_by:profiles!contractors_performance_noted_by_fkey(full_name)';

export async function fetchContractors(): Promise<Contractor[]> {
  const { data, error } = await supabase
    .from('contractors')
    .select(CONTRACTOR_COLUMNS)
    .order('name');
  fail(error);
  return (
    (data ?? []) as unknown as {
      id: string;
      name: string;
      contract_reference: string | null;
      scope_en: string | null;
      starts_on: string | null;
      ends_on: string | null;
      bond_amount: number | null;
      bond_currency: CurrencyCode | null;
      performance_note: string | null;
      performance_noted_at: string | null;
      noted_by: NamedRef | NamedRef[] | null;
    }[]
  ).map((row) => ({
    id: row.id,
    name: row.name,
    contractReference: row.contract_reference,
    scopeEn: row.scope_en,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    bondAmount: row.bond_amount == null ? null : Number(row.bond_amount),
    bondCurrency: row.bond_currency,
    performanceNote: row.performance_note,
    performanceNotedByName: label(row.noted_by),
    performanceNotedAt: row.performance_noted_at,
  }));
}

const PACKAGE_COLUMNS =
  'id, construction_block_id, code, title_en, title_tr, contractor_id, planned_start, planned_end, ' +
  'contractor:contractors(name), site_tasks(count)';

export async function fetchWorkPackages(blockId: string): Promise<WorkPackage[]> {
  const { data, error } = await supabase
    .from('work_packages')
    .select(PACKAGE_COLUMNS)
    .eq('construction_block_id', blockId)
    .order('code');
  fail(error);
  return (
    (data ?? []) as unknown as {
      id: string;
      construction_block_id: string;
      code: string;
      title_en: string;
      title_tr: string | null;
      contractor_id: string | null;
      planned_start: string | null;
      planned_end: string | null;
      contractor: { name: string } | { name: string }[] | null;
      site_tasks: { count: number }[] | null;
    }[]
  ).map((row) => ({
    id: row.id,
    constructionBlockId: row.construction_block_id,
    code: row.code,
    titleEn: row.title_en,
    titleTr: row.title_tr,
    contractorId: row.contractor_id,
    contractorName: named(row.contractor),
    plannedStart: row.planned_start,
    plannedEnd: row.planned_end,
    taskCount: count(row.site_tasks),
  }));
}

export async function createWorkPackage(input: {
  constructionBlockId: string;
  code: string;
  titleEn: string;
  contractorId: string | null;
}): Promise<void> {
  const { error } = await supabase.from('work_packages').insert({
    construction_block_id: input.constructionBlockId,
    code: input.code,
    title_en: input.titleEn,
    contractor_id: input.contractorId,
  });
  fail(error);
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

const TASK_COLUMNS =
  'id, work_package_id, title_en, title_tr, kind, state, planned_start, planned_end, ' +
  'owner_profile_id, legal_basis_en, legal_basis_tr, source_legal_order_id, confidentiality, ' +
  'package:work_packages!site_tasks_work_package_id_fkey(title_en, construction_block_id), ' +
  'owner:profiles!site_tasks_owner_profile_id_fkey(full_name), ' +
  'task_progress(count)';

interface TaskRow {
  id: string;
  work_package_id: string;
  title_en: string;
  title_tr: string | null;
  kind: WorkKind;
  state: WorkState;
  planned_start: string | null;
  planned_end: string | null;
  owner_profile_id: string | null;
  legal_basis_en: string | null;
  legal_basis_tr: string | null;
  source_legal_order_id: string | null;
  confidentiality: SiteTask['confidentiality'];
  package:
    | { title_en: string; construction_block_id: string }[]
    | { title_en: string; construction_block_id: string }
    | null;
  owner: NamedRef | NamedRef[] | null;
  task_progress: { count: number }[] | null;
}

/**
 * Tasks on a block, each carrying its latest evidenced percentage.
 *
 * The percentage comes from a second query rather than an embed, because the
 * newest report per task is not something PostgREST can ask for in one go.
 * Two reads, and the number is still the database's rather than a guess.
 */
export async function fetchTasks(blockId: string): Promise<SiteTask[]> {
  const { data: packages, error: packageError } = await supabase
    .from('work_packages')
    .select('id')
    .eq('construction_block_id', blockId);
  fail(packageError);

  const ids = ((packages ?? []) as { id: string }[]).map((p) => p.id);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('site_tasks')
    .select(TASK_COLUMNS)
    .in('work_package_id', ids)
    .order('kind')
    .order('title_en');
  fail(error);

  const rows = (data ?? []) as unknown as TaskRow[];
  const latest = await fetchLatestPercentages(rows.map((r) => r.id));

  return rows.map((row) => {
    const pkg = Array.isArray(row.package) ? row.package[0] : row.package;
    return {
      id: row.id,
      workPackageId: row.work_package_id,
      workPackageTitle: pkg?.title_en ?? null,
      titleEn: row.title_en,
      titleTr: row.title_tr,
      kind: row.kind,
      state: row.state,
      plannedStart: row.planned_start,
      plannedEnd: row.planned_end,
      ownerProfileId: row.owner_profile_id,
      ownerName: label(row.owner),
      legalBasisEn: row.legal_basis_en,
      legalBasisTr: row.legal_basis_tr,
      sourceLegalOrderId: row.source_legal_order_id,
      confidentiality: row.confidentiality,
      percentComplete: latest.get(row.id) ?? null,
      reportCount: count(row.task_progress),
    };
  });
}

async function fetchLatestPercentages(taskIds: string[]): Promise<Map<string, number>> {
  if (taskIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('task_progress')
    .select('site_task_id, percent_complete, reported_at')
    .in('site_task_id', taskIds)
    .order('reported_at', { ascending: false });
  fail(error);

  const latest = new Map<string, number>();
  for (const row of (data ?? []) as {
    site_task_id: string;
    percent_complete: number;
    reported_at: string;
  }[]) {
    // Ordered newest first, so the first one seen for a task is the one.
    if (!latest.has(row.site_task_id)) latest.set(row.site_task_id, Number(row.percent_complete));
  }
  return latest;
}

export async function createTask(input: {
  workPackageId: string;
  titleEn: string;
  kind: WorkKind;
  plannedEnd: string | null;
  legalBasisEn: string | null;
}): Promise<void> {
  const { error } = await supabase.from('site_tasks').insert({
    work_package_id: input.workPackageId,
    title_en: input.titleEn,
    kind: input.kind,
    planned_end: input.plannedEnd,
    legal_basis_en: input.legalBasisEn,
  });
  fail(error);
}

export async function setTaskState(input: { id: string; state: WorkState }): Promise<void> {
  const { error } = await supabase
    .from('site_tasks')
    .update({ state: input.state })
    .eq('id', input.id);
  fail(error);
}

// ---------------------------------------------------------------------------
// Progress, which always carries its evidence
// ---------------------------------------------------------------------------

export async function fetchProgress(taskId: string): Promise<TaskProgressReport[]> {
  const { data, error } = await supabase
    .from('task_progress')
    .select(
      'id, site_task_id, percent_complete, document_id, captured_at, captured_lat, captured_lng, ' +
        'note, reported_at, ' +
        'reporter:profiles!task_progress_reported_by_fkey(full_name), ' +
        'document:document_vault!task_progress_document_id_fkey(title)',
    )
    .eq('site_task_id', taskId)
    .order('reported_at', { ascending: false });
  fail(error);

  return (
    (data ?? []) as unknown as {
      id: string;
      site_task_id: string;
      percent_complete: number;
      document_id: string;
      captured_at: string | null;
      captured_lat: number | null;
      captured_lng: number | null;
      note: string | null;
      reported_at: string;
      reporter: NamedRef | NamedRef[] | null;
      document: { title: string } | { title: string }[] | null;
    }[]
  ).map((row) => {
    const doc = Array.isArray(row.document) ? row.document[0] : row.document;
    return {
      id: row.id,
      siteTaskId: row.site_task_id,
      percentComplete: Number(row.percent_complete),
      documentId: row.document_id,
      documentTitle: doc?.title ?? null,
      capturedAt: row.captured_at,
      capturedLat: row.captured_lat == null ? null : Number(row.captured_lat),
      capturedLng: row.captured_lng == null ? null : Number(row.captured_lng),
      note: row.note,
      reportedByName: label(row.reporter),
      reportedAt: row.reported_at,
    };
  });
}

/**
 * The only way a percentage gets recorded, and it takes a document.
 *
 * There is no variant of this without one. The column is not nullable, so a
 * call that left it out would be refused by the database rather than by any
 * check here — which is the point of putting the rule there.
 */
export async function reportProgress(input: {
  siteTaskId: string;
  percentComplete: number;
  documentId: string;
  capturedAt: string | null;
  note: string | null;
}): Promise<void> {
  const { error } = await supabase.from('task_progress').insert({
    site_task_id: input.siteTaskId,
    percent_complete: input.percentComplete,
    document_id: input.documentId,
    captured_at: input.capturedAt,
    note: input.note,
  });
  fail(error);
}

// ---------------------------------------------------------------------------
// Inspection
// ---------------------------------------------------------------------------

const INSPECTION_COLUMNS =
  'id, construction_block_id, inspected_on, inspector_name, summary_en, summary_tr, ' +
  'signed_off_at, confidentiality, ' +
  'inspector:profiles!site_inspections_inspector_profile_id_fkey(full_name), ' +
  'signer:profiles!site_inspections_signed_off_by_fkey(full_name), ' +
  'inspection_findings(count)';

export async function fetchInspections(blockId: string): Promise<SiteInspection[]> {
  const { data, error } = await supabase
    .from('site_inspections')
    .select(INSPECTION_COLUMNS)
    .eq('construction_block_id', blockId)
    .order('inspected_on', { ascending: false });
  fail(error);

  const rows = (data ?? []) as unknown as {
    id: string;
    construction_block_id: string;
    inspected_on: string;
    inspector_name: string | null;
    summary_en: string | null;
    summary_tr: string | null;
    signed_off_at: string | null;
    confidentiality: SiteInspection['confidentiality'];
    inspector: NamedRef | NamedRef[] | null;
    signer: NamedRef | NamedRef[] | null;
    inspection_findings: { count: number }[] | null;
  }[];

  const nonconformities = await countNonconformities(rows.map((r) => r.id));

  return rows.map((row) => ({
    id: row.id,
    constructionBlockId: row.construction_block_id,
    inspectedOn: row.inspected_on,
    inspectorName: label(row.inspector) ?? row.inspector_name,
    summaryEn: row.summary_en,
    summaryTr: row.summary_tr,
    signedOffAt: row.signed_off_at,
    signedOffByName: label(row.signer),
    confidentiality: row.confidentiality,
    findingCount: count(row.inspection_findings),
    nonconformityCount: nonconformities.get(row.id) ?? 0,
  }));
}

/** The count that matters is the unresolved non-conformities, not findings. */
async function countNonconformities(inspectionIds: string[]): Promise<Map<string, number>> {
  if (inspectionIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('inspection_findings')
    .select('site_inspection_id')
    .in('site_inspection_id', inspectionIds)
    .eq('is_nonconformity', true)
    .is('resolved_at', null);
  fail(error);

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { site_inspection_id: string }[]) {
    counts.set(row.site_inspection_id, (counts.get(row.site_inspection_id) ?? 0) + 1);
  }
  return counts;
}

export async function fetchFindings(inspectionId: string): Promise<InspectionFinding[]> {
  const { data, error } = await supabase
    .from('inspection_findings')
    .select(
      'id, site_inspection_id, description_en, description_tr, is_nonconformity, severity, ' +
        'document_id, resolved_at, resolution_note',
    )
    .eq('site_inspection_id', inspectionId)
    .order('severity', { ascending: false });
  fail(error);
  return (
    (data ?? []) as unknown as {
      id: string;
      site_inspection_id: string;
      description_en: string;
      description_tr: string | null;
      is_nonconformity: boolean;
      severity: number | null;
      document_id: string | null;
      resolved_at: string | null;
      resolution_note: string | null;
    }[]
  ).map((row) => ({
    id: row.id,
    siteInspectionId: row.site_inspection_id,
    descriptionEn: row.description_en,
    descriptionTr: row.description_tr,
    isNonconformity: row.is_nonconformity,
    severity: row.severity,
    documentId: row.document_id,
    resolvedAt: row.resolved_at,
    resolutionNote: row.resolution_note,
  }));
}

export async function createInspection(input: {
  constructionBlockId: string;
  inspectedOn: string;
  summaryEn: string | null;
}): Promise<void> {
  const { error } = await supabase.from('site_inspections').insert({
    construction_block_id: input.constructionBlockId,
    inspected_on: input.inspectedOn,
    summary_en: input.summaryEn,
  });
  fail(error);
}

export async function addFinding(input: {
  siteInspectionId: string;
  descriptionEn: string;
  isNonconformity: boolean;
  severity: number | null;
}): Promise<void> {
  const { error } = await supabase.from('inspection_findings').insert({
    site_inspection_id: input.siteInspectionId,
    description_en: input.descriptionEn,
    is_nonconformity: input.isNonconformity,
    severity: input.severity,
  });
  fail(error);
}

export async function resolveFinding(input: { id: string; note: string }): Promise<void> {
  const { error } = await supabase
    .from('inspection_findings')
    .update({ resolved_at: new Date().toISOString(), resolution_note: input.note })
    .eq('id', input.id);
  fail(error);
}

/** One way. The database refuses the other direction. */
export async function signInspection(input: { id: string; profileId: string }): Promise<void> {
  const { error } = await supabase
    .from('site_inspections')
    .update({ signed_off_at: new Date().toISOString(), signed_off_by: input.profileId })
    .eq('id', input.id);
  fail(error);
}

// ---------------------------------------------------------------------------
// Conflicts with what the project is obliged to do
// ---------------------------------------------------------------------------

/**
 * Conflicts on one block, or across every block the caller can see.
 *
 * The second case is why this takes a null: an order that reaches open work
 * is not something a person should have to select the right block to find
 * out about.
 */
export async function fetchConflicts(blockId: string | null): Promise<TaskConflict[]> {
  const query = supabase.from('site_task_conflicts').select('*');
  const { data, error } = await (blockId ? query.eq('construction_block_id', blockId) : query);
  fail(error);
  return (
    (data ?? []) as {
      site_task_id: string;
      task_title_en: string;
      task_title_tr: string | null;
      task_state: WorkState;
      task_kind: WorkKind;
      construction_block_id: string;
      obligation_id: string;
      obligation_title_en: string | null;
      obligation_title_tr: string | null;
      obligation_source: string;
      source_legal_order_id: string | null;
      acknowledged: boolean;
    }[]
  ).map((row) => ({
    siteTaskId: row.site_task_id,
    taskTitleEn: row.task_title_en,
    taskTitleTr: row.task_title_tr,
    taskState: row.task_state,
    taskKind: row.task_kind,
    constructionBlockId: row.construction_block_id,
    obligationId: row.obligation_id,
    obligationTitleEn: row.obligation_title_en,
    obligationTitleTr: row.obligation_title_tr,
    obligationSource: row.obligation_source,
    sourceLegalOrderId: row.source_legal_order_id,
    acknowledged: row.acknowledged,
  }));
}

/**
 * Saying out loud that the work proceeds anyway (M7-06, M2-06).
 *
 * The portal does not refuse the work. The project did once resolve
 * unanimously to keep building under an order, and a system that refused to
 * record that would only have removed the trace.
 */
export async function acknowledgeConflict(input: {
  obligationId: string;
  siteTaskId: string;
  noteOfWhat: string;
  reason: string;
  profileId: string;
}): Promise<void> {
  const { error } = await supabase.from('obligation_overrides').insert({
    obligation_id: input.obligationId,
    site_task_id: input.siteTaskId,
    note_of_what: input.noteOfWhat,
    reason: input.reason,
    acknowledged_by: input.profileId,
  });
  fail(error);
}

// ---------------------------------------------------------------------------
// Bills of quantities and valuations
// ---------------------------------------------------------------------------

export async function fetchBoqVersions(blockId: string): Promise<BoqVersion[]> {
  const { data, error } = await supabase
    .from('boq_versions')
    .select(
      'id, construction_block_id, version_no, state, prepared_on, currency, note, ' +
        'preparer:profiles!boq_versions_prepared_by_fkey(full_name)',
    )
    .eq('construction_block_id', blockId)
    .order('version_no', { ascending: false });
  fail(error);

  const rows = (data ?? []) as unknown as {
    id: string;
    construction_block_id: string;
    version_no: number;
    state: BoqState;
    prepared_on: string;
    currency: CurrencyCode;
    note: string | null;
    preparer: NamedRef | NamedRef[] | null;
  }[];

  const { data: totals } = await supabase
    .from('boq_totals')
    .select('boq_version_id, line_count, total')
    .eq('construction_block_id', blockId);

  const byVersion = new Map(
    ((totals ?? []) as { boq_version_id: string; line_count: number; total: number }[]).map((t) => [
      t.boq_version_id,
      t,
    ]),
  );

  return rows.map((row) => ({
    id: row.id,
    constructionBlockId: row.construction_block_id,
    versionNo: row.version_no,
    state: row.state,
    preparedByName: label(row.preparer),
    preparedOn: row.prepared_on,
    currency: row.currency,
    note: row.note,
    lineCount: Number(byVersion.get(row.id)?.line_count ?? 0),
    total: Number(byVersion.get(row.id)?.total ?? 0),
  }));
}

export async function fetchBoqItems(versionId: string): Promise<BoqItem[]> {
  const { data, error } = await supabase
    .from('boq_items')
    .select(
      'id, boq_version_id, work_package_id, item_code, description_en, description_tr, unit, ' +
        'quantity, unit_rate, amount',
    )
    .eq('boq_version_id', versionId)
    .order('item_code');
  fail(error);
  return (
    (data ?? []) as unknown as {
      id: string;
      boq_version_id: string;
      work_package_id: string | null;
      item_code: string | null;
      description_en: string;
      description_tr: string | null;
      unit: string;
      quantity: number;
      unit_rate: number;
      amount: number;
    }[]
  ).map((row) => ({
    id: row.id,
    boqVersionId: row.boq_version_id,
    workPackageId: row.work_package_id,
    itemCode: row.item_code,
    descriptionEn: row.description_en,
    descriptionTr: row.description_tr,
    unit: row.unit,
    quantity: Number(row.quantity),
    unitRate: Number(row.unit_rate),
    amount: Number(row.amount),
  }));
}

export async function createBoqVersion(input: {
  constructionBlockId: string;
  currency: CurrencyCode;
  note: string | null;
}): Promise<void> {
  const { error } = await supabase.from('boq_versions').insert({
    construction_block_id: input.constructionBlockId,
    currency: input.currency,
    note: input.note,
  });
  fail(error);
}

/**
 * No amount is sent. It is generated from quantity × rate, so a line total
 * cannot disagree with its own parts.
 */
export async function addBoqItem(input: {
  boqVersionId: string;
  itemCode: string | null;
  descriptionEn: string;
  unit: string;
  quantity: number;
  unitRate: number;
}): Promise<void> {
  const { error } = await supabase.from('boq_items').insert({
    boq_version_id: input.boqVersionId,
    item_code: input.itemCode,
    description_en: input.descriptionEn,
    unit: input.unit,
    quantity: input.quantity,
    unit_rate: input.unitRate,
  });
  fail(error);
}

export async function issueBoqVersion(id: string): Promise<void> {
  const { error } = await supabase.from('boq_versions').update({ state: 'issued' }).eq('id', id);
  fail(error);
}

const VALUATION_COLUMNS =
  'id, construction_block_id, contractor_id, boq_version_id, period_start, period_end, amount, ' +
  'currency, state, summary, qs_certified_at, director_approved_at, paid_at, confidentiality, ' +
  'contractor:contractors(name), ' +
  'certifier:profiles!valuations_qs_certified_by_fkey(full_name), ' +
  'approver:profiles!valuations_director_approved_by_fkey(full_name)';

export async function fetchValuations(blockId: string): Promise<Valuation[]> {
  const { data, error } = await supabase
    .from('valuations')
    .select(VALUATION_COLUMNS)
    .eq('construction_block_id', blockId)
    .order('period_end', { ascending: false });
  fail(error);
  return (
    (data ?? []) as unknown as {
      id: string;
      construction_block_id: string;
      contractor_id: string | null;
      boq_version_id: string | null;
      period_start: string;
      period_end: string;
      amount: number;
      currency: CurrencyCode;
      state: ValuationState;
      summary: string | null;
      qs_certified_at: string | null;
      director_approved_at: string | null;
      paid_at: string | null;
      confidentiality: Valuation['confidentiality'];
      contractor: { name: string } | { name: string }[] | null;
      certifier: NamedRef | NamedRef[] | null;
      approver: NamedRef | NamedRef[] | null;
    }[]
  ).map((row) => ({
    id: row.id,
    constructionBlockId: row.construction_block_id,
    contractorId: row.contractor_id,
    contractorName: named(row.contractor),
    boqVersionId: row.boq_version_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    amount: Number(row.amount),
    currency: row.currency,
    state: row.state,
    summary: row.summary,
    qsCertifiedByName: label(row.certifier),
    qsCertifiedAt: row.qs_certified_at,
    directorApprovedByName: label(row.approver),
    directorApprovedAt: row.director_approved_at,
    paidAt: row.paid_at,
    confidentiality: row.confidentiality,
  }));
}

export async function createValuation(input: {
  constructionBlockId: string;
  contractorId: string | null;
  periodStart: string;
  periodEnd: string;
  amount: number;
  currency: CurrencyCode;
  summary: string | null;
}): Promise<void> {
  const { error } = await supabase.from('valuations').insert({
    construction_block_id: input.constructionBlockId,
    contractor_id: input.contractorId,
    period_start: input.periodStart,
    period_end: input.periodEnd,
    amount: input.amount,
    currency: input.currency,
    summary: input.summary,
  });
  fail(error);
}

/**
 * The surveyor certifies, then the director approves, and the database
 * refuses both the wrong order and the same person twice. Neither rule lives
 * here; this only offers the two acts separately because they are two acts.
 */
export async function certifyValuation(input: { id: string; profileId: string }): Promise<void> {
  const { error } = await supabase
    .from('valuations')
    .update({
      qs_certified_by: input.profileId,
      qs_certified_at: new Date().toISOString(),
      state: 'qs_certified',
    })
    .eq('id', input.id);
  fail(error);
}

export async function approveValuation(input: { id: string; profileId: string }): Promise<void> {
  const { error } = await supabase
    .from('valuations')
    .update({
      director_approved_by: input.profileId,
      director_approved_at: new Date().toISOString(),
      state: 'director_approved',
    })
    .eq('id', input.id);
  fail(error);
}
