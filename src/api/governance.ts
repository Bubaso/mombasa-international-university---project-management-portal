/**
 * Governance, compliance and academic readiness (M10).
 *
 * What this replaces: a screen whose resolutions lived in a React useState —
 * three of them, typed into the component, one of them allocating "34.3M
 * KShs" — and whose compliance section was a paragraph of prose. The one real
 * query on it read a legacy table that stored a national identity number in a
 * text column.
 *
 * Every read here is RLS-filtered and most of them come from a view, so this
 * file does no access filtering of its own. The three-valued columns are the
 * ones to be careful with on the way through: a quorum nobody recorded, a
 * resolution nobody actioned and a target nobody set all arrive as null, and
 * turning any of them into a zero or a false would be the portal inventing an
 * answer.
 */
import { supabase } from '../lib/supabase';
import type {
  Page,
  Language,
  AcademicProgramme,
  AccreditationRequirement,
  CharterCitation,
  CharterClause,
  CharterStage,
  ComplianceEntry,
  ConflictDeclaration,
  DecisionImplementation,
  GovernanceOrgan,
  ObligationProgress,
  OrganMembership,
  ReadinessStrand,
  SittingQuorum,
  Trustee,
  UncitedGovernance,
} from '../types';

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

const rows = <T>(data: unknown): T[] => (data ?? []) as unknown as T[];

// ---------------------------------------------------------------------------
// The organs and their seats (M10-02)
// ---------------------------------------------------------------------------

export async function fetchOrgans(): Promise<GovernanceOrgan[]> {
  const { data, error } = await supabase
    .from('governance_organs')
    .select(
      'id, kind, name_en, name_tr, remit_en, remit_tr, cadence, quorum_members, ' +
        'quorum_fraction, charter_clause, charter_document_id, confidentiality, ' +
        'organ_memberships(count)',
    )
    .order('kind');
  fail(error);

  return rows<{
    id: string;
    kind: GovernanceOrgan['kind'];
    name_en: string;
    name_tr: string;
    remit_en: string | null;
    remit_tr: string | null;
    cadence: GovernanceOrgan['cadence'];
    quorum_members: number | null;
    quorum_fraction: number | null;
    charter_clause: string | null;
    charter_document_id: string | null;
    confidentiality: GovernanceOrgan['confidentiality'];
    organ_memberships: { count: number }[];
  }>(data).map((row) => ({
    id: row.id,
    kind: row.kind,
    nameEn: row.name_en,
    nameTr: row.name_tr,
    remitEn: row.remit_en,
    remitTr: row.remit_tr,
    cadence: row.cadence,
    quorumMembers: row.quorum_members,
    quorumFraction: row.quorum_fraction,
    charterClause: row.charter_clause,
    charterDocumentId: row.charter_document_id,
    memberCount: row.organ_memberships?.[0]?.count ?? 0,
    confidentiality: row.confidentiality,
  }));
}

export async function fetchMemberships(organId?: string | null): Promise<OrganMembership[]> {
  let query = supabase
    .from('organ_memberships')
    .select(
      'id, organ_id, trustee_id, profile_id, stakeholder_id, seat, voting, ' +
        'started_on, ended_on, ' +
        'trustee:trustees(full_name), ' +
        'profile:profiles(full_name), ' +
        'stakeholder:stakeholders(full_name)',
    )
    .order('started_on');
  if (organId) query = query.eq('organ_id', organId);

  const { data, error } = await query;
  fail(error);

  return rows<{
    id: string;
    organ_id: string;
    trustee_id: string | null;
    profile_id: string | null;
    stakeholder_id: string | null;
    seat: string | null;
    voting: boolean;
    started_on: string;
    ended_on: string | null;
    trustee: { full_name: string } | null;
    profile: { full_name: string } | null;
    stakeholder: { full_name: string } | null;
  }>(data).map((row) => ({
    id: row.id,
    organId: row.organ_id,
    trusteeId: row.trustee_id,
    profileId: row.profile_id,
    stakeholderId: row.stakeholder_id,
    // Whichever of the three the seat was filled from. A seat belongs to one
    // person, and which register that person lives in is not the reader's
    // problem.
    name: row.trustee?.full_name ?? row.profile?.full_name ?? row.stakeholder?.full_name ?? null,
    seat: row.seat,
    voting: row.voting,
    startedOn: row.started_on,
    endedOn: row.ended_on,
  }));
}

export async function fetchSittings(limit = 20, offset = 0): Promise<Page<SittingQuorum>> {
  const { data, error, count } = await supabase
    .from('governance_sitting_quorum')
    .select('*', { count: 'exact' })
    .order('held_at', { ascending: false })
    .range(offset, offset + limit - 1);
  fail(error);

  return {
    rows: rows<{
      meeting_id: string;
      title: string;
      held_at: string;
      minutes_status: string;
      organ_id: string;
      organ_kind: SittingQuorum['organKind'];
      organ_name_en: string;
      organ_name_tr: string;
      seats_held: number;
      voting_present: number;
      quorum_required: number;
      quorum_met: boolean | null;
      confidentiality: SittingQuorum['confidentiality'];
    }>(data).map((row) => ({
      meetingId: row.meeting_id,
      title: row.title,
      heldAt: row.held_at,
      minutesStatus: row.minutes_status,
      organId: row.organ_id,
      organKind: row.organ_kind,
      organNameEn: row.organ_name_en,
      organNameTr: row.organ_name_tr,
      seatsHeld: row.seats_held,
      votingPresent: row.voting_present,
      quorumRequired: row.quorum_required,
      // Deliberately not coalesced. Null is "no rule recorded".
      quorumMet: row.quorum_met,
      confidentiality: row.confidentiality,
    })),
    total: count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// The trustee register (M10-01)
// ---------------------------------------------------------------------------

const TRUSTEE_COLUMNS =
  'id, stakeholder_id, full_name, appointing_body, appointed_on, term_ends_on, ' +
  'seat_en, seat_tr, email, phone, identity_document_id, active, stood_down_on, ' +
  'note, confidentiality, on_the_record, may_delete';

/**
 * Read from the view rather than the table (0046), for the two columns the
 * table cannot carry: whether anything refers to this trustee, and whether
 * this reader may delete them. Both are answers to rules, and the rules live
 * in the database.
 */
export async function fetchTrustees(): Promise<Trustee[]> {
  const { data, error } = await supabase
    .from('trustee_register')
    .select(TRUSTEE_COLUMNS)
    .order('active', { ascending: false })
    .order('full_name');
  fail(error);

  return rows<{
    id: string;
    stakeholder_id: string | null;
    full_name: string;
    appointing_body: string;
    appointed_on: string | null;
    term_ends_on: string | null;
    seat_en: string | null;
    seat_tr: string | null;
    email: string | null;
    phone: string | null;
    identity_document_id: string | null;
    active: boolean;
    stood_down_on: string | null;
    note: string | null;
    confidentiality: Trustee['confidentiality'];
    on_the_record: boolean;
    may_delete: boolean;
  }>(data).map((row) => ({
    id: row.id,
    stakeholderId: row.stakeholder_id,
    fullName: row.full_name,
    appointingBody: row.appointing_body,
    appointedOn: row.appointed_on,
    termEndsOn: row.term_ends_on,
    seatEn: row.seat_en,
    seatTr: row.seat_tr,
    email: row.email,
    phone: row.phone,
    identityDocumentId: row.identity_document_id,
    active: row.active,
    stoodDownOn: row.stood_down_on,
    note: row.note,
    confidentiality: row.confidentiality,
    onTheRecord: Boolean(row.on_the_record),
    mayDelete: Boolean(row.may_delete),
  }));
}

export async function addTrustee(input: {
  fullName: string;
  appointingBody: string;
  appointedOn?: string | null;
  termEndsOn?: string | null;
  /** The seat as typed, in whatever language the form was in. */
  seat?: string | null;
  /** Which language that was, so the words land in the column they are in. */
  seatLanguage?: Language;
  email?: string | null;
  phone?: string | null;
}): Promise<void> {
  // The seat used to go into seat_en whatever the interface language. A
  // Turkish user typed Turkish into the English column and the Turkish list
  // then showed no seat at all, because it reads seat_tr. Writing to the
  // column the words are actually in fixes both halves: the reader sees it,
  // and the machine translator has something true to translate from.
  const seat = input.seat?.trim() || null;
  const intoTurkish = input.seatLanguage === 'tr';

  const { error } = await supabase.from('trustees').insert({
    full_name: input.fullName.trim(),
    appointing_body: input.appointingBody.trim(),
    appointed_on: input.appointedOn || null,
    term_ends_on: input.termEndsOn || null,
    seat_en: intoTurkish ? null : seat,
    seat_tr: intoTurkish ? seat : null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
  });
  fail(error);
}

/**
 * Deleting a trustee entered by mistake.
 *
 * Not the same act as standing somebody down, and the portal must not offer it
 * as though it were: standing down says a person served and left, which is a
 * false statement about somebody who never served. The database refuses to
 * delete a trustee anything refers to (0046) and names what holds them, so the
 * destructive reading of `on delete cascade` cannot happen by accident.
 */
export async function deleteTrustee(id: string): Promise<void> {
  const { error } = await supabase.from('trustees').delete().eq('id', id);
  fail(error);
}

/**
 * Standing a trustee down. The date is not optional in the database, so it is
 * not optional here either: a seat emptied without a date quietly changes
 * every quorum computed over the register.
 */
export async function standDownTrustee(id: string, on: string): Promise<void> {
  const { error } = await supabase
    .from('trustees')
    .update({ active: false, stood_down_on: on })
    .eq('id', id);
  fail(error);
}

// ---------------------------------------------------------------------------
// Seats on an organ (M10-02, M3-14)
// ---------------------------------------------------------------------------
//
// organ_memberships has had its write policies since 0021 and nothing in the
// portal ever called them, so a trustee could be entered in the register and
// never seated anywhere. That is why the live project had three organs, zero
// seats and a quorum that could never be computed: the data the quorum rule
// tests against had no way in.

export async function seatOnOrgan(input: {
  organId: string;
  /** Exactly one of these three, which the database also insists on. */
  trusteeId?: string | null;
  profileId?: string | null;
  stakeholderId?: string | null;
  seat?: string | null;
  /**
   * A secretary who attends but does not vote still counts as present and
   * does not count towards the quorum, so this is asked rather than assumed.
   */
  voting: boolean;
  startedOn: string;
}): Promise<void> {
  const { error } = await supabase.from('organ_memberships').insert({
    organ_id: input.organId,
    trustee_id: input.trusteeId ?? null,
    profile_id: input.profileId ?? null,
    stakeholder_id: input.stakeholderId ?? null,
    seat: input.seat?.trim() || null,
    voting: input.voting,
    started_on: input.startedOn,
  });
  fail(error);
}

/**
 * Ending a seat, with the date.
 *
 * Not a delete: the quorum for a sitting held in March is computed from who
 * held a seat in March, so a seat that simply disappears rewrites the past.
 * The date is required for the same reason it is required when a trustee
 * stands down.
 */
export async function endSeat(id: string, on: string): Promise<void> {
  const { error } = await supabase.from('organ_memberships').update({ ended_on: on }).eq('id', id);
  fail(error);
}

/**
 * Removing a seat that should never have been recorded. An administrator's,
 * like deleting a trustee, and for the same reason: it is the only act here
 * that can change what a past sitting's quorum was computed from.
 */
export async function removeSeat(id: string): Promise<void> {
  const { error } = await supabase.from('organ_memberships').delete().eq('id', id);
  fail(error);
}

/**
 * Recording an organ's quorum rule.
 *
 * Both halves are nullable and either may be set alone: the deed may say "five
 * members", "half the seats", or both. Null stays meaningful — it is "nobody
 * has transcribed the rule", which the panel prints in those words rather than
 * calling a sitting short.
 */
export async function setQuorumRule(
  organId: string,
  rule: { quorumMembers: number | null; quorumFraction: number | null },
): Promise<void> {
  const { error } = await supabase
    .from('governance_organs')
    .update({
      quorum_members: rule.quorumMembers,
      quorum_fraction: rule.quorumFraction,
    })
    .eq('id', organId);
  fail(error);
}

// ---------------------------------------------------------------------------
// Resolutions and whether they were carried out (M10-03, M10-04)
// ---------------------------------------------------------------------------

export async function fetchResolutions(organOnly = true): Promise<DecisionImplementation[]> {
  let query = supabase
    .from('decision_implementation')
    .select('*')
    .order('decided_on', { ascending: false, nullsFirst: false });
  // The formal register is the organs' resolutions; everything else is a
  // decision minuted somewhere and belongs on the meetings screen.
  if (organOnly) query = query.not('organ_kind', 'is', null);

  const { data, error } = await query;
  fail(error);

  return rows<{
    decision_id: string;
    reference_no: string | null;
    text_en: string | null;
    text_tr: string | null;
    decided_on: string | null;
    status: string;
    signed_at: string | null;
    organ_kind: DecisionImplementation['organKind'];
    organ_name_en: string | null;
    organ_name_tr: string | null;
    actions: number;
    done: number;
    cancelled: number;
    overdue: number;
    next_due: string | null;
    implementation: DecisionImplementation['implementation'];
    days_since: number | null;
    confidentiality: DecisionImplementation['confidentiality'];
  }>(data).map((row) => ({
    decisionId: row.decision_id,
    referenceNo: row.reference_no,
    textEn: row.text_en,
    textTr: row.text_tr,
    decidedOn: row.decided_on,
    status: row.status,
    signedAt: row.signed_at,
    organKind: row.organ_kind,
    organNameEn: row.organ_name_en,
    organNameTr: row.organ_name_tr,
    actions: row.actions,
    done: row.done,
    cancelled: row.cancelled,
    overdue: row.overdue,
    nextDue: row.next_due,
    implementation: row.implementation,
    daysSince: row.days_since,
    confidentiality: row.confidentiality,
  }));
}

/** Signs a resolution into the formal register (M10-03). */
export async function signResolution(decisionId: string, documentId?: string | null) {
  const { error } = await supabase.rpc('sign_resolution', {
    p_decision: decisionId,
    p_minute_document: documentId ?? null,
  });
  fail(error);
}

// ---------------------------------------------------------------------------
// Compliance (M10-05)
// ---------------------------------------------------------------------------

export async function fetchComplianceCalendar(): Promise<ComplianceEntry[]> {
  const { data, error } = await supabase
    .from('compliance_calendar')
    .select('*')
    .order('next_due_on', { nullsFirst: false });
  fail(error);

  return rows<{
    requirement_id: string;
    regime: ComplianceEntry['regime'];
    reference: string | null;
    title_en: string;
    title_tr: string | null;
    recurrence: ComplianceEntry['recurrence'];
    next_due_on: string | null;
    obligation_id: string | null;
    period_label: string | null;
    obligation_state: string | null;
    verified: boolean | null;
    responsible_name: string | null;
    not_yet_raised: boolean;
    confidentiality: ComplianceEntry['confidentiality'];
  }>(data).map((row) => ({
    requirementId: row.requirement_id,
    regime: row.regime,
    reference: row.reference,
    titleEn: row.title_en,
    titleTr: row.title_tr,
    recurrence: row.recurrence,
    nextDueOn: row.next_due_on,
    obligationId: row.obligation_id,
    periodLabel: row.period_label,
    obligationState: row.obligation_state,
    verified: row.verified,
    responsibleName: row.responsible_name,
    notYetRaised: row.not_yet_raised,
    confidentiality: row.confidentiality,
  }));
}

/**
 * Turns this period's statutory duty into an obligation (M10-05).
 *
 * Idempotent in the database, which matters here: a button on a calendar
 * screen will be pressed twice, and filing the same annual return twice is
 * worse than not filing it.
 */
export async function raiseComplianceObligation(requirementId: string): Promise<void> {
  const { error } = await supabase.rpc('raise_compliance_obligation', {
    p_requirement: requirementId,
  });
  fail(error);
}

// ---------------------------------------------------------------------------
// Accreditation, the road map, the programmes (M10-06, M10-07, M10-08)
// ---------------------------------------------------------------------------

export async function fetchAccreditation(): Promise<AccreditationRequirement[]> {
  const { data, error } = await supabase
    .from('accreditation_requirements')
    .select(
      'id, body, code, title_en, title_tr, detail_en, detail_tr, state, position_en, ' +
        'position_tr, evidence_document_id, target_on, met_on, note, confidentiality, ' +
        'responsible:profiles(full_name)',
    )
    .order('code', { nullsFirst: false });
  fail(error);

  return rows<{
    id: string;
    body: string;
    code: string | null;
    title_en: string;
    title_tr: string | null;
    detail_en: string | null;
    detail_tr: string | null;
    state: AccreditationRequirement['state'];
    position_en: string | null;
    position_tr: string | null;
    evidence_document_id: string | null;
    target_on: string | null;
    met_on: string | null;
    note: string | null;
    confidentiality: AccreditationRequirement['confidentiality'];
    responsible: { full_name: string } | null;
  }>(data).map((row) => ({
    id: row.id,
    body: row.body,
    code: row.code,
    titleEn: row.title_en,
    titleTr: row.title_tr,
    detailEn: row.detail_en,
    detailTr: row.detail_tr,
    state: row.state,
    positionEn: row.position_en,
    positionTr: row.position_tr,
    evidenceDocumentId: row.evidence_document_id,
    responsibleName: row.responsible?.full_name ?? null,
    targetOn: row.target_on,
    metOn: row.met_on,
    note: row.note,
    confidentiality: row.confidentiality,
  }));
}

export async function fetchRoadmap(): Promise<CharterStage[]> {
  const { data, error } = await supabase.from('charter_roadmap').select('*').order('sequence');
  fail(error);

  return rows<{
    id: string;
    sequence: number;
    title_en: string;
    title_tr: string | null;
    detail_en: string | null;
    detail_tr: string | null;
    state: CharterStage['state'];
    target_on: string | null;
    completed_on: string | null;
    depends_on_stage_id: string | null;
    depends_on_title_en: string | null;
    depends_on_title_tr: string | null;
    depends_on_state: CharterStage['state'] | null;
    blocked_by_predecessor: boolean;
    overdue: boolean;
    evidence_document_id: string | null;
    responsible_name: string | null;
    confidentiality: CharterStage['confidentiality'];
  }>(data).map((row) => ({
    id: row.id,
    sequence: row.sequence,
    titleEn: row.title_en,
    titleTr: row.title_tr,
    detailEn: row.detail_en,
    detailTr: row.detail_tr,
    state: row.state,
    targetOn: row.target_on,
    completedOn: row.completed_on,
    dependsOnStageId: row.depends_on_stage_id,
    dependsOnTitleEn: row.depends_on_title_en,
    dependsOnTitleTr: row.depends_on_title_tr,
    dependsOnState: row.depends_on_state,
    blockedByPredecessor: row.blocked_by_predecessor,
    overdue: row.overdue,
    evidenceDocumentId: row.evidence_document_id,
    responsibleName: row.responsible_name,
    confidentiality: row.confidentiality,
  }));
}

export async function fetchProgrammes(): Promise<AcademicProgramme[]> {
  const { data, error } = await supabase
    .from('academic_programmes')
    .select(
      'id, name_en, name_tr, degree, faculty, state, curriculum_document_id, ' +
        'required_academic_staff, appointed_academic_staff, staff_gap, ' +
        'accreditation_requirement_id, target_intake_year, note, confidentiality',
    )
    .order('name_en');
  fail(error);

  return rows<{
    id: string;
    name_en: string;
    name_tr: string | null;
    degree: string;
    faculty: string | null;
    state: AcademicProgramme['state'];
    curriculum_document_id: string | null;
    required_academic_staff: number | null;
    appointed_academic_staff: number;
    staff_gap: number | null;
    accreditation_requirement_id: string | null;
    target_intake_year: number | null;
    note: string | null;
    confidentiality: AcademicProgramme['confidentiality'];
  }>(data).map((row) => ({
    id: row.id,
    nameEn: row.name_en,
    nameTr: row.name_tr,
    degree: row.degree,
    faculty: row.faculty,
    state: row.state,
    curriculumDocumentId: row.curriculum_document_id,
    requiredAcademicStaff: row.required_academic_staff,
    appointedAcademicStaff: row.appointed_academic_staff,
    // Null means nobody has established the requirement. Not zero.
    staffGap: row.staff_gap,
    accreditationRequirementId: row.accreditation_requirement_id,
    targetIntakeYear: row.target_intake_year,
    note: row.note,
    confidentiality: row.confidentiality,
  }));
}

// ---------------------------------------------------------------------------
// Quantified obligations and the readiness board (M10-09…M10-12)
// ---------------------------------------------------------------------------

export async function fetchObligationProgress(): Promise<ObligationProgress[]> {
  const { data, error } = await supabase
    .from('obligation_progress')
    .select('*')
    .order('due_on', { nullsFirst: false });
  fail(error);

  return rows<{
    target_id: string;
    obligation_id: string;
    obligation_title_en: string | null;
    obligation_title_tr: string | null;
    source: string;
    obligation_state: string;
    basis_en: string;
    basis_tr: string | null;
    target_value: number | null;
    unit: string;
    period_label: string | null;
    due_on: string | null;
    achieved: number | null;
    records: number;
    percent_of_target: number | null;
    shortfall: number | null;
    confidentiality: ObligationProgress['confidentiality'];
  }>(data).map((row) => ({
    targetId: row.target_id,
    obligationId: row.obligation_id,
    obligationTitleEn: row.obligation_title_en,
    obligationTitleTr: row.obligation_title_tr,
    source: row.source,
    obligationState: row.obligation_state,
    basisEn: row.basis_en,
    basisTr: row.basis_tr,
    targetValue: row.target_value,
    unit: row.unit,
    periodLabel: row.period_label,
    dueOn: row.due_on,
    achieved: row.achieved,
    records: row.records,
    percentOfTarget: row.percent_of_target,
    shortfall: row.shortfall,
    confidentiality: row.confidentiality,
  }));
}

export async function fetchConflicts(limit = 25, offset = 0): Promise<Page<ConflictDeclaration>> {
  const { data, error, count } = await supabase
    .from('conflict_declarations')
    .select(
      'id, trustee_id, profile_id, organ_id, interest_en, interest_tr, declared_on, ' +
        'covers_from, covers_to, document_id, recused_from_decision_id, note, ' +
        'confidentiality, trustee:trustees(full_name), profile:profiles(full_name)',
      { count: 'exact' },
    )
    .order('declared_on', { ascending: false })
    .range(offset, offset + limit - 1);
  fail(error);

  return {
    rows: rows<{
      id: string;
      trustee_id: string | null;
      profile_id: string | null;
      organ_id: string | null;
      interest_en: string;
      interest_tr: string | null;
      declared_on: string;
      covers_from: string | null;
      covers_to: string | null;
      document_id: string | null;
      recused_from_decision_id: string | null;
      note: string | null;
      confidentiality: ConflictDeclaration['confidentiality'];
      trustee: { full_name: string } | null;
      profile: { full_name: string } | null;
    }>(data).map((row) => ({
      id: row.id,
      trusteeId: row.trustee_id,
      profileId: row.profile_id,
      organId: row.organ_id,
      personName: row.trustee?.full_name ?? row.profile?.full_name ?? null,
      interestEn: row.interest_en,
      interestTr: row.interest_tr,
      declaredOn: row.declared_on,
      coversFrom: row.covers_from,
      coversTo: row.covers_to,
      documentId: row.document_id,
      recusedFromDecisionId: row.recused_from_decision_id,
      note: row.note,
      confidentiality: row.confidentiality,
    })),
    total: count ?? 0,
  };
}

export async function declareInterest(input: {
  interestEn: string;
  interestTr?: string | null;
  organId?: string | null;
  coversFrom?: string | null;
  coversTo?: string | null;
}): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const me = session.session?.user.id;
  if (!me) throw new Error('Sign in again — your session has expired.');

  // profile_id is the caller's own, and the policy insists on it for anybody
  // who is not keeping the register: a declaration is something you make
  // about yourself.
  const { error } = await supabase.from('conflict_declarations').insert({
    profile_id: me,
    interest_en: input.interestEn.trim(),
    interest_tr: input.interestTr?.trim() || null,
    organ_id: input.organId || null,
    covers_from: input.coversFrom || null,
    covers_to: input.coversTo || null,
  });
  fail(error);
}

export async function fetchReadiness(): Promise<ReadinessStrand[]> {
  const { data, error } = await supabase.from('intake_readiness').select('*');
  fail(error);
  return rows<{
    strand: ReadinessStrand['strand'];
    total: number;
    ready: number;
    impeded: number;
  }>(data).map((row) => ({
    strand: row.strand,
    total: row.total,
    ready: row.ready,
    impeded: row.impeded,
  }));
}

// ---------------------------------------------------------------------------
// The governance reference, cited to the trust deed (M10-13)
// ---------------------------------------------------------------------------

export async function fetchCharterClauses(): Promise<CharterClause[]> {
  const { data, error } = await supabase.from('charter_reference').select('*').order('reference');
  fail(error);
  return (
    (data ?? []) as {
      clause_id: string;
      reference: string;
      heading_en: string | null;
      heading_tr: string | null;
      quoted_text: string | null;
      summary_en: string | null;
      summary_tr: string | null;
      document_id: string | null;
      located_at: string | null;
      checked_against_the_deed_at: string | null;
      carries_the_deeds_words: boolean;
      checked_against_the_deed: boolean;
      deed_not_attached: boolean;
      citations: number | string;
      cited_for: string[] | null;
      confidentiality: CharterClause['confidentiality'];
    }[]
  ).map((row) => ({
    clauseId: row.clause_id,
    reference: row.reference,
    headingEn: row.heading_en,
    headingTr: row.heading_tr,
    quotedText: row.quoted_text,
    summaryEn: row.summary_en,
    summaryTr: row.summary_tr,
    documentId: row.document_id,
    locatedAt: row.located_at,
    checkedAgainstTheDeedAt: row.checked_against_the_deed_at,
    carriesTheDeedsWords: row.carries_the_deeds_words,
    checkedAgainstTheDeed: row.checked_against_the_deed,
    deedNotAttached: row.deed_not_attached,
    citations: Number(row.citations ?? 0),
    citedFor: row.cited_for ?? [],
    confidentiality: row.confidentiality,
  }));
}

export async function fetchCharterCitations(): Promise<CharterCitation[]> {
  const { data, error } = await supabase
    .from('charter_citation_register')
    .select('*')
    .order('reference');
  fail(error);
  return (
    (data ?? []) as {
      citation_id: string;
      clause_id: string;
      reference: string;
      clause_checked: boolean;
      subject_kind: string;
      subject_label: string | null;
      note_en: string | null;
      note_tr: string | null;
      confidentiality: CharterCitation['confidentiality'];
    }[]
  ).map((row) => ({
    citationId: row.citation_id,
    clauseId: row.clause_id,
    reference: row.reference,
    clauseChecked: row.clause_checked,
    subjectKind: row.subject_kind,
    subjectLabel: row.subject_label,
    noteEn: row.note_en,
    noteTr: row.note_tr,
    confidentiality: row.confidentiality,
  }));
}

/** The inverse of the reference page, and the reason to build one. */
export async function fetchUncitedGovernance(): Promise<UncitedGovernance[]> {
  const { data, error } = await supabase
    .from('governance_without_a_clause')
    .select('*')
    .order('carries_a_rule', { ascending: false });
  fail(error);
  return (
    (data ?? []) as {
      subject_kind: string;
      subject_id: string;
      subject_label: string;
      carries_a_rule: boolean;
      clause_typed_in_free_text: string | null;
      typed_clause_is_not_in_the_register: boolean;
      confidentiality: UncitedGovernance['confidentiality'];
    }[]
  ).map((row) => ({
    subjectKind: row.subject_kind,
    subjectId: row.subject_id,
    subjectLabel: row.subject_label,
    carriesARule: row.carries_a_rule,
    clauseTypedInFreeText: row.clause_typed_in_free_text,
    typedClauseIsNotInTheRegister: row.typed_clause_is_not_in_the_register,
    confidentiality: row.confidentiality,
  }));
}

/**
 * Recording a clause. `quotedText` is only accepted with the document, and
 * the signature says so rather than offering the caller a refusal: the
 * database check would reject it anyway.
 */
export async function recordCharterClause(input: {
  reference: string;
  headingEn: string | null;
  summaryEn: string | null;
  documentId: string | null;
  quotedText: string | null;
  locatedAt: string | null;
}): Promise<string> {
  if (input.quotedText != null && input.documentId == null) {
    throw new Error(
      'A quotation needs the deed it is quoted from. Attach the document, or record a summary instead — a summary is a reading, and the screen says so.',
    );
  }
  const { data, error } = await supabase
    .from('charter_clauses')
    .insert({
      reference: input.reference,
      heading_en: input.headingEn,
      summary_en: input.summaryEn,
      document_id: input.documentId,
      quoted_text: input.quotedText,
      located_at: input.locatedAt,
    })
    .select('id')
    .single();
  fail(error);
  return (data as { id: string }).id;
}

/** Somebody opened the file and found the clause where the citation says it is. */
export async function markClauseChecked(input: { id: string; profileId: string }): Promise<void> {
  const { error } = await supabase
    .from('charter_clauses')
    .update({
      checked_against_the_deed_at: new Date().toISOString(),
      checked_by: input.profileId,
    })
    .eq('id', input.id);
  fail(error);
}

/** Somebody looked again and could not find it. The check has to be falsifiable. */
export async function withdrawClauseCheck(id: string): Promise<void> {
  const { error } = await supabase
    .from('charter_clauses')
    .update({ checked_against_the_deed_at: null, checked_by: null })
    .eq('id', id);
  fail(error);
}

export async function citeClause(input: {
  clauseId: string;
  governanceOrganId?: string | null;
  complianceRequirementId?: string | null;
  subjectLabel?: string | null;
  noteEn: string | null;
}): Promise<void> {
  const { error } = await supabase.from('charter_citations').insert({
    clause_id: input.clauseId,
    governance_organ_id: input.governanceOrganId ?? null,
    compliance_requirement_id: input.complianceRequirementId ?? null,
    subject_label: input.subjectLabel ?? null,
    note_en: input.noteEn,
  });
  fail(error);
}
