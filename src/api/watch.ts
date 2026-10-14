/**
 * The watch book (M7-18, M7-12, M6-11).
 *
 * Everything read here comes from a view rather than a table, because the
 * three things a reader needs — how short a watch was of its rounds, whether
 * an open gate entry has outlasted its watch, how long after an incident it
 * was written up — are all computed, and a client that recomputed them would
 * be a second copy of the rule that drifts.
 *
 * Nothing in this file closes anything. There is no `closeVisit` that stamps
 * now() and no sweep that ends a shift at midnight: an exit is written by
 * somebody who saw it, or it stays unwritten.
 */
import { supabase } from '../lib/supabase';
import type {
  Page,
  AuthorityNotice,
  GateEntry,
  IncidentKind,
  SiteIncident,
  WatchHealth,
  WatchPost,
  WatchRound,
  WatchShift,
} from '../types';

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function num(value: number | string | null): number {
  return value == null ? 0 : Number(value);
}

// ---------------------------------------------------------------------------
// Watches
// ---------------------------------------------------------------------------

interface ShiftRow {
  watch_shift_id: string;
  post: WatchPost;
  construction_block_id: string | null;
  block_code: string | null;
  on_watch: string;
  watch_firm: string | null;
  began_at: string;
  ended_at: string | null;
  rounds_expected: number | null;
  rounds_recorded: number | string;
  rounds_missing: number | null;
  last_round_at: string | null;
  logged_hours_after_start: number | string | null;
  never_closed: boolean;
  handover_note: string | null;
  confidentiality: WatchShift['confidentiality'];
}

export async function fetchWatches(limit = 20, offset = 0): Promise<Page<WatchShift>> {
  const { data, error, count } = await supabase
    .from('watch_register')
    .select('*', { count: 'exact' })
    .order('began_at', { ascending: false })
    .range(offset, offset + limit - 1);
  fail(error);
  return {
    rows: ((data ?? []) as ShiftRow[]).map((row) => ({
      watchShiftId: row.watch_shift_id,
      post: row.post,
      constructionBlockId: row.construction_block_id,
      blockCode: row.block_code,
      onWatch: row.on_watch,
      watchFirm: row.watch_firm,
      beganAt: row.began_at,
      endedAt: row.ended_at,
      // Null stays null. The screen says "beklenen tur sayısı kayıtlı değil"
      // rather than printing a shortfall against a figure nobody gave.
      roundsExpected: row.rounds_expected == null ? null : Number(row.rounds_expected),
      roundsRecorded: num(row.rounds_recorded),
      roundsMissing: row.rounds_missing == null ? null : Number(row.rounds_missing),
      lastRoundAt: row.last_round_at,
      loggedHoursAfterStart:
        row.logged_hours_after_start == null ? null : Number(row.logged_hours_after_start),
      neverClosed: row.never_closed,
      handoverNote: row.handover_note,
      confidentiality: row.confidentiality,
    })),
    total: count ?? 0,
  };
}

export async function fetchRounds(shiftId: string): Promise<WatchRound[]> {
  const { data, error } = await supabase
    .from('watch_rounds')
    .select('id, watch_shift_id, walked_at, route, note')
    .eq('watch_shift_id', shiftId)
    .order('walked_at');
  fail(error);
  return (
    (data ?? []) as {
      id: string;
      watch_shift_id: string;
      walked_at: string;
      route: string | null;
      note: string | null;
    }[]
  ).map((row) => ({
    id: row.id,
    watchShiftId: row.watch_shift_id,
    walkedAt: row.walked_at,
    route: row.route,
    note: row.note,
  }));
}

export async function openWatch(input: {
  post: WatchPost;
  constructionBlockId: string | null;
  onWatch: string;
  watchFirm: string | null;
  beganAt: string;
  /** Null on purpose where nobody has said how many rounds are owed. */
  roundsExpected: number | null;
  profileId: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from('watch_shifts')
    .insert({
      post: input.post,
      construction_block_id: input.constructionBlockId,
      on_watch: input.onWatch,
      watch_firm: input.watchFirm,
      began_at: input.beganAt,
      rounds_expected: input.roundsExpected,
      recorded_by: input.profileId,
    })
    .select('id')
    .single();
  fail(error);
  return (data as { id: string }).id;
}

/**
 * Closing is an ordinary update and only ever done by a person. The database
 * refuses a closing time that falls before a round already recorded, and that
 * refusal is passed through: its message names the round.
 */
export async function closeWatch(input: {
  id: string;
  endedAt: string;
  handoverNote: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from('watch_shifts')
    .update({ ended_at: input.endedAt, handover_note: input.handoverNote })
    .eq('id', input.id);
  fail(error);
}

export async function recordRound(input: {
  watchShiftId: string;
  walkedAt: string;
  route: string | null;
  note: string | null;
  profileId: string;
}): Promise<void> {
  const { error } = await supabase.from('watch_rounds').insert({
    watch_shift_id: input.watchShiftId,
    walked_at: input.walkedAt,
    route: input.route,
    note: input.note,
    recorded_by: input.profileId,
  });
  fail(error);
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

interface EntryRow {
  gate_visit_id: string;
  person_name: string;
  organisation: string | null;
  stakeholder_id: string | null;
  purpose: string | null;
  vehicle_plate: string | null;
  escorted_by: string | null;
  id_document_seen: boolean;
  entered_at: string;
  watch_shift_id: string | null;
  watch_ended_at: string | null;
  on_watch: string | null;
  open_hours: number | string;
  outlasted_its_watch: boolean;
  confidentiality: GateEntry['confidentiality'];
}

/** Entries with no exit recorded. Not a list of people on site. */
export async function fetchOpenEntries(): Promise<GateEntry[]> {
  const { data, error } = await supabase
    .from('gate_presence')
    .select('*')
    .order('entered_at', { ascending: false });
  fail(error);
  return ((data ?? []) as EntryRow[]).map((row) => ({
    gateVisitId: row.gate_visit_id,
    personName: row.person_name,
    organisation: row.organisation,
    stakeholderId: row.stakeholder_id,
    purpose: row.purpose,
    vehiclePlate: row.vehicle_plate,
    escortedBy: row.escorted_by,
    idDocumentSeen: row.id_document_seen,
    enteredAt: row.entered_at,
    watchShiftId: row.watch_shift_id,
    watchEndedAt: row.watch_ended_at,
    onWatch: row.on_watch,
    openHours: num(row.open_hours),
    outlastedItsWatch: row.outlasted_its_watch,
    confidentiality: row.confidentiality,
  }));
}

export async function recordEntry(input: {
  watchShiftId: string | null;
  constructionBlockId: string | null;
  personName: string;
  organisation: string | null;
  stakeholderId: string | null;
  purpose: string | null;
  vehiclePlate: string | null;
  escortedBy: string | null;
  idDocumentSeen: boolean;
  enteredAt: string;
  profileId: string;
}): Promise<void> {
  const { error } = await supabase.from('gate_visits').insert({
    watch_shift_id: input.watchShiftId,
    construction_block_id: input.constructionBlockId,
    person_name: input.personName,
    organisation: input.organisation,
    stakeholder_id: input.stakeholderId,
    purpose: input.purpose,
    vehicle_plate: input.vehiclePlate,
    escorted_by: input.escortedBy,
    id_document_seen: input.idDocumentSeen,
    entered_at: input.enteredAt,
    recorded_by: input.profileId,
  });
  fail(error);
}

/**
 * Writing the exit. The time is the caller's, not now(): somebody writing up
 * a departure they witnessed twenty minutes ago should be able to say so, and
 * stamping now() would quietly make every exit look live.
 */
export async function recordExit(input: { id: string; exitedAt: string }): Promise<void> {
  const { error } = await supabase
    .from('gate_visits')
    .update({ exited_at: input.exitedAt })
    .eq('id', input.id);
  fail(error);
}

// ---------------------------------------------------------------------------
// Incidents
// ---------------------------------------------------------------------------

interface IncidentRow {
  site_incident_id: string;
  kind: IncidentKind;
  occurred_at: string;
  construction_block_id: string | null;
  block_code: string | null;
  watch_shift_id: string | null;
  description_en: string;
  description_tr: string | null;
  intervention_en: string | null;
  intervention_tr: string | null;
  intervention_unrecorded: boolean;
  injured_count: number | null;
  severity: number | null;
  police_ob_number: string | null;
  authority_notice: AuthorityNotice;
  notified_at: string | null;
  notification_document_id: string | null;
  risk_id: string | null;
  legal_case_id: string | null;
  confirmed: boolean;
  confirmed_at: string | null;
  evidence_count: number | string;
  logged_hours_after: number | string | null;
  confidentiality: SiteIncident['confidentiality'];
}

export async function fetchIncidents(limit = 20, offset = 0): Promise<Page<SiteIncident>> {
  const { data, error, count } = await supabase
    .from('incident_register')
    .select('*', { count: 'exact' })
    .order('occurred_at', { ascending: false })
    .range(offset, offset + limit - 1);
  fail(error);
  return {
    rows: ((data ?? []) as IncidentRow[]).map((row) => ({
      siteIncidentId: row.site_incident_id,
      kind: row.kind,
      occurredAt: row.occurred_at,
      constructionBlockId: row.construction_block_id,
      blockCode: row.block_code,
      watchShiftId: row.watch_shift_id,
      descriptionEn: row.description_en,
      descriptionTr: row.description_tr,
      interventionEn: row.intervention_en,
      interventionTr: row.intervention_tr,
      interventionUnrecorded: row.intervention_unrecorded,
      injuredCount: row.injured_count == null ? null : Number(row.injured_count),
      severity: row.severity == null ? null : Number(row.severity),
      policeObNumber: row.police_ob_number,
      authorityNotice: row.authority_notice,
      notifiedAt: row.notified_at,
      notificationDocumentId: row.notification_document_id,
      riskId: row.risk_id,
      legalCaseId: row.legal_case_id,
      confirmed: row.confirmed,
      confirmedAt: row.confirmed_at,
      evidenceCount: num(row.evidence_count),
      loggedHoursAfter: row.logged_hours_after == null ? null : Number(row.logged_hours_after),
      confidentiality: row.confidentiality,
    })),
    total: count ?? 0,
  };
}

export async function recordIncident(input: {
  watchShiftId: string | null;
  constructionBlockId: string | null;
  kind: IncidentKind;
  occurredAt: string;
  descriptionEn: string;
  interventionEn: string | null;
  injuredCount: number | null;
  severity: number | null;
  policeObNumber: string | null;
  profileId: string;
}): Promise<string> {
  // authority_notice is left at its default of `unknown`. Recording the
  // notification is a separate call because it needs the letter, and the
  // moment an incident is first written down is rarely the moment anybody has
  // one.
  const { data, error } = await supabase
    .from('site_incidents')
    .insert({
      watch_shift_id: input.watchShiftId,
      construction_block_id: input.constructionBlockId,
      kind: input.kind,
      occurred_at: input.occurredAt,
      description_en: input.descriptionEn,
      intervention_en: input.interventionEn,
      injured_count: input.injuredCount,
      severity: input.severity,
      police_ob_number: input.policeObNumber,
      recorded_by: input.profileId,
    })
    .select('id')
    .single();
  fail(error);
  return (data as { id: string }).id;
}

/** What was done about it, added later. Allowed after confirmation. */
export async function recordResponse(input: { id: string; interventionEn: string }): Promise<void> {
  const { error } = await supabase
    .from('site_incidents')
    .update({ intervention_en: input.interventionEn })
    .eq('id', input.id);
  fail(error);
}

/**
 * Recording that an authority was told. The document is not optional in the
 * signature because it is not optional in the database: a check constraint
 * refuses the claim without it, and offering the caller a way to try is only
 * offering them a refusal.
 */
export async function recordNotification(input: {
  id: string;
  notifiedAt: string;
  notificationDocumentId: string;
}): Promise<void> {
  const { error } = await supabase
    .from('site_incidents')
    .update({
      authority_notice: 'notified',
      notified_at: input.notifiedAt,
      notification_document_id: input.notificationDocumentId,
    })
    .eq('id', input.id);
  fail(error);
}

/** Recording that somebody decided no notification was needed. */
export async function recordNoNotificationNeeded(input: { id: string }): Promise<void> {
  const { error } = await supabase
    .from('site_incidents')
    .update({ authority_notice: 'not_required' })
    .eq('id', input.id);
  fail(error);
}

export async function addIncidentEvidence(input: {
  siteIncidentId: string;
  documentId: string;
  note: string | null;
  profileId: string;
}): Promise<void> {
  const { error } = await supabase.from('incident_evidence').insert({
    site_incident_id: input.siteIncidentId,
    document_id: input.documentId,
    note: input.note,
    added_by: input.profileId,
  });
  fail(error);
}

/** One way. The database has no unconfirm and the function refuses a second. */
export async function confirmIncident(id: string): Promise<void> {
  const { error } = await supabase.rpc('confirm_incident', { p_incident: id });
  fail(error);
}

// ---------------------------------------------------------------------------
// What the book does not say
// ---------------------------------------------------------------------------

export async function fetchWatchHealth(): Promise<WatchHealth> {
  const { data, error } = await supabase.from('watch_health').select('*').maybeSingle();
  fail(error);
  const row = (data ?? {}) as Record<string, number | string | null>;
  return {
    watchesNeverClosed: num(row.watches_never_closed ?? 0),
    watchesWithoutAnExpectedCount: num(row.watches_without_an_expected_count ?? 0),
    watchesShortOfTheirRounds: num(row.watches_short_of_their_rounds ?? 0),
    entriesWithoutAnExit: num(row.entries_without_an_exit ?? 0),
    entriesOutlastingTheirWatch: num(row.entries_outlasting_their_watch ?? 0),
    incidentsWithoutEvidence: num(row.incidents_without_evidence ?? 0),
    incidentsWithoutAResponse: num(row.incidents_without_a_response ?? 0),
    seriousIncidentsWithNoNotificationDecision: num(
      row.serious_incidents_with_no_notification_decision ?? 0,
    ),
    incidentsNotYetConfirmed: num(row.incidents_not_yet_confirmed ?? 0),
  };
}
