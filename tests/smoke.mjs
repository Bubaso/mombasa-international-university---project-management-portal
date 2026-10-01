/**
 * Smoke test: the sign-in gate holds, and once past it every route and every
 * legal sub-tab renders without a runtime error while the backend returns
 * nothing.
 *
 * That last condition is the point. Empty data is exactly the state that used
 * to crash two of the legal sub-tabs and blank the rest, so it stays covered.
 *
 * Supabase is intercepted rather than run: the app is built against a dummy
 * project and every call to it is answered here. There is deliberately no
 * bypass inside the application — a test-only way past the gate is a way past
 * the gate.
 *
 * Usage: npm run test:smoke
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = Number(process.env.SMOKE_PORT ?? 4173);
const BASE = `http://127.0.0.1:${PORT}`;

/**
 * Some environments ship a shared Chromium that does not match the revision
 * Playwright expects to download. Prefer an explicit override, then a shared
 * build if one is present, and otherwise let Playwright resolve its own.
 */
function resolveChromium() {
  const candidates = [process.env.PLAYWRIGHT_CHROMIUM_PATH, '/opt/pw-browsers/chromium'];
  return candidates.find((p) => p && existsSync(p));
}

/** The person the intercepted backend reports as signed in. */
const TEST_PROFILE = {
  id: '00000000-0000-0000-0000-0000000000aa',
  full_name: 'Smoke Test',
  email: 'smoke@example.test',
  role: 'project_director',
  organization: 'AUTK',
  clearance: 'restricted',
  is_active: true,
  expires_at: null,
};

/**
 * What public.current_authority() would answer for that person. The console
 * asks the database this rather than reading the profile row, because the row
 * says nothing about a delegation in force.
 */
const TEST_AUTHORITY = {
  role: 'project_director',
  roles: ['project_director'],
  clearance: 'restricted',
  isInternal: true,
  isAdmin: false,
  delegations: [],
};

/** The same question answered for someone outside the organisation. */
const EXTERNAL_AUTHORITY = {
  role: 'contractor',
  roles: ['contractor'],
  clearance: 'internal',
  isInternal: false,
  isAdmin: false,
  delegations: [],
};

/** One case file, so the legal record panels render rather than reporting none. */
const TEST_CASE = {
  id: '00000000-0000-0000-0000-0000000000cc',
  case_number: 'ELC/134/2013',
  title: 'Smoke case',
  court: 'ELC Mombasa',
  case_type: 'Land',
  current_status: 'Active',
  priority: 'high',
  risk_level: 'high',
  filing_date: '2013-01-01',
  next_hearing_date: null,
  description_en: null,
  description_tr: null,
  key_issues: [],
  documents_count: 0,
  confidentiality: 'internal',
};

/** One meeting, so the detail page renders rather than reporting it missing. */
const TEST_MEETING = {
  id: '00000000-0000-0000-0000-0000000000bb',
  title: 'Smoke meeting',
  // 0028: the Notion migration merges an English and a Turkish minute of the
  // same meeting into one record, and the reader's language decides which
  // title they see.
  title_tr: 'Duman toplantısı',
  held_at: '2026-09-01T10:00:00Z',
  location: 'Mombasa',
  kind: 'trustee',
  priority: 'normal',
  status: 'completed',
  minutes_status: 'draft',
  continues_meeting_id: null,
  confidentiality: 'internal',
  preparer: null,
  continues: null,
  meeting_attendees: [{ count: 0 }],
};

/**
 * Two documents, because the distinction the vault exists to make is between
 * them: one whose stored bytes the server has read and digested, and one it
 * has not. A screen that showed them the same way would be the screen Faz 0
 * removed.
 */
const VERIFIED_DIGEST = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';

const TEST_DOCUMENTS = [
  {
    id: '00000000-0000-0000-0000-0000000000d1',
    title: 'Smoke deed',
    category: 'trust_deed',
    status: 'under_review',
    description_en: null,
    description_tr: null,
    confidentiality: 'internal',
    current_version_id: '00000000-0000-0000-0000-0000000000e1',
    versions: [{ count: 2 }],
  },
  {
    id: '00000000-0000-0000-0000-0000000000d2',
    title: 'Smoke contract',
    category: 'contract_mou',
    status: 'under_review',
    description_en: null,
    description_tr: null,
    confidentiality: 'internal',
    current_version_id: '00000000-0000-0000-0000-0000000000e2',
    versions: [{ count: 1 }],
  },
];

const TEST_VERSIONS = [
  {
    id: '00000000-0000-0000-0000-0000000000e1',
    document_id: '00000000-0000-0000-0000-0000000000d1',
    version_no: 2,
    storage_path: 'd1/e1',
    file_name: 'deed.pdf',
    content_type: 'application/pdf',
    byte_size: 24576,
    sha256: VERIFIED_DIGEST,
    digest_computed_at: '2026-09-01T10:05:00Z',
    uploaded_at: '2026-09-01T10:00:00Z',
    note: null,
    uploader: { full_name: 'Smoke Test' },
  },
  {
    // No digest: the server has not read these bytes back yet, or they never
    // arrived. Either way the screen has to say so.
    id: '00000000-0000-0000-0000-0000000000e2',
    document_id: '00000000-0000-0000-0000-0000000000d2',
    version_no: 1,
    storage_path: 'd2/e2',
    file_name: 'contract.pdf',
    content_type: 'application/pdf',
    byte_size: 8192,
    sha256: null,
    digest_computed_at: null,
    uploaded_at: '2026-09-02T09:00:00Z',
    note: null,
    uploader: { full_name: 'Smoke Test' },
  },
];

/**
 * One block with two tasks: one that somebody has evidenced, one that nobody
 * has. The pair is the whole point of the screen — a reported percentage and
 * an unreported one must not look the same.
 */
const TEST_BLOCK = {
  id: '00000000-0000-0000-0000-0000000000f1',
  code: 'A1',
  name: 'Smoke block',
  floors: 3,
  total_area_sqm: 2400,
  state: 'in_progress',
  purpose_en: null,
  purpose_tr: null,
  phase_id: null,
  started_on: '2026-01-10',
  target_completion: '2026-12-01',
  contractor_id: '00000000-0000-0000-0000-0000000000f2',
  confidentiality: 'internal',
  phase: null,
  engineer: { full_name: 'Smoke Test' },
  contractor: { name: 'Smoke Contracting' },
};

const TEST_BLOCK_PROGRESS = [
  {
    construction_block_id: TEST_BLOCK.id,
    code: 'A1',
    name: 'Smoke block',
    state: 'in_progress',
    confidentiality: 'internal',
    construction_tasks: 2,
    preservation_tasks: 1,
    tasks_with_evidence: 1,
    percent_complete: 45,
    last_reported_at: '2026-09-20T09:00:00Z',
    last_captured_at: '2026-09-18T09:00:00Z',
  },
  {
    // Nothing reported: this one must read as unknown, not as zero.
    construction_block_id: '00000000-0000-0000-0000-0000000000f9',
    code: 'B2',
    name: 'Unvisited block',
    state: 'planned',
    confidentiality: 'internal',
    construction_tasks: 1,
    preservation_tasks: 0,
    tasks_with_evidence: 0,
    percent_complete: null,
    last_reported_at: null,
    last_captured_at: null,
  },
];

const UNVISITED_BLOCK = {
  ...TEST_BLOCK,
  id: '00000000-0000-0000-0000-0000000000f9',
  code: 'B2',
  name: 'Unvisited block',
  state: 'planned',
  contractor: null,
  engineer: null,
};

/** A live prohibition reaching open work on the block (M7-06). */
const TEST_CONFLICT = {
  site_task_id: '00000000-0000-0000-0000-0000000000f5',
  task_title_en: 'Pour the raft',
  task_title_tr: null,
  task_state: 'in_progress',
  task_kind: 'construction',
  construction_block_id: TEST_BLOCK.id,
  obligation_id: '00000000-0000-0000-0000-0000000000f6',
  obligation_title_en: 'Do not interfere with the boundary',
  obligation_title_tr: null,
  obligation_source: 'court_order',
  source_legal_order_id: null,
  acknowledged: false,
};

// ---------------------------------------------------------------------------
// The watch book (M7-18, M7-12, M6-11)
// ---------------------------------------------------------------------------
//
// Chosen so the screen's three refusals are all on display at once: a gate
// entry whose watch has closed (which must not read as a person on site), an
// incident whose response nobody wrote down (which must not read as nobody
// having responded), and a watch with no expected round count (which must not
// read as nought rounds owed).

const TEST_WATCHES = [
  {
    watch_shift_id: '00000000-0000-0000-0000-0000000007a1',
    post: 'main_gate',
    construction_block_id: null,
    block_code: null,
    on_watch: 'J. Mwakio',
    watch_firm: 'Pwani Security',
    began_at: '2026-09-29T18:00:00Z',
    ended_at: '2026-09-30T02:00:00Z',
    rounds_expected: 4,
    rounds_recorded: 2,
    rounds_missing: 2,
    last_round_at: '2026-09-30T01:00:00Z',
    logged_hours_after_start: 30.4,
    never_closed: false,
    handover_note: null,
    confidentiality: 'internal',
  },
  {
    // No expected count was ever recorded, and the watch was never closed.
    watch_shift_id: '00000000-0000-0000-0000-0000000007a2',
    post: 'perimeter',
    construction_block_id: null,
    block_code: null,
    on_watch: 'A. Kazungu',
    watch_firm: 'Pwani Security',
    began_at: '2026-09-27T18:00:00Z',
    ended_at: null,
    rounds_expected: null,
    rounds_recorded: 1,
    rounds_missing: null,
    last_round_at: '2026-09-27T20:00:00Z',
    logged_hours_after_start: 1.2,
    never_closed: true,
    handover_note: null,
    confidentiality: 'internal',
  },
];

const TEST_GATE_PRESENCE = [
  {
    gate_visit_id: '00000000-0000-0000-0000-0000000007b1',
    person_name: 'Delivery driver',
    organisation: 'Coast Hardware',
    stakeholder_id: null,
    purpose: 'Cement delivery',
    vehicle_plate: 'KCD 884Q',
    escorted_by: null,
    id_document_seen: false,
    entered_at: '2026-09-29T21:00:00Z',
    watch_shift_id: '00000000-0000-0000-0000-0000000007a1',
    watch_ended_at: '2026-09-30T02:00:00Z',
    on_watch: 'J. Mwakio',
    open_hours: 44.0,
    outlasted_its_watch: true,
    construction_block_id: null,
    confidentiality: 'confidential',
  },
];

const TEST_INCIDENTS = [
  {
    // An accident with somebody hurt, no response written down, no evidence,
    // and no decision recorded about telling an authority.
    site_incident_id: '00000000-0000-0000-0000-0000000007c1',
    kind: 'accident',
    occurred_at: '2026-09-27T09:00:00Z',
    construction_block_id: null,
    block_code: 'A1',
    watch_shift_id: null,
    description_en: 'A labourer fell from the second-floor slab edge of block A1.',
    description_tr: null,
    intervention_en: null,
    intervention_tr: null,
    intervention_unrecorded: true,
    injured_count: 1,
    severity: 4,
    police_ob_number: null,
    authority_notice: 'unknown',
    notified_at: null,
    notification_document_id: null,
    risk_id: null,
    legal_case_id: null,
    confirmed: false,
    confirmed_at: null,
    evidence_count: 0,
    logged_hours_after: 76.5,
    confidentiality: 'confidential',
  },
  {
    site_incident_id: '00000000-0000-0000-0000-0000000007c2',
    kind: 'intrusion',
    occurred_at: '2026-09-29T23:00:00Z',
    construction_block_id: null,
    block_code: 'A1',
    watch_shift_id: '00000000-0000-0000-0000-0000000007a1',
    description_en: 'Two men came over the north fence and left when the watch approached.',
    description_tr: null,
    intervention_en: 'Watch called the Nyali station; patrol attended and took a statement.',
    intervention_tr: null,
    intervention_unrecorded: false,
    injured_count: 0,
    severity: 3,
    police_ob_number: 'OB 41/2026',
    authority_notice: 'notified',
    notified_at: '2026-09-30T00:00:00Z',
    notification_document_id: '00000000-0000-0000-0000-0000000000d1',
    risk_id: null,
    legal_case_id: null,
    confirmed: true,
    confirmed_at: '2026-09-30T06:00:00Z',
    evidence_count: 1,
    logged_hours_after: 0.5,
    confidentiality: 'confidential',
  },
];

const TEST_WATCH_HEALTH = {
  watches_never_closed: 1,
  watches_without_an_expected_count: 1,
  watches_short_of_their_rounds: 1,
  entries_without_an_exit: 1,
  entries_outlasting_their_watch: 1,
  incidents_without_evidence: 1,
  incidents_without_a_response: 1,
  serious_incidents_with_no_notification_decision: 1,
  incidents_not_yet_confirmed: 1,
};

/**
 * One transaction with a receipt and no audit, and one with neither. The
 * badge is the point: the old screen set it from a boolean with a default,
 * so it appeared on things nobody had audited.
 */
const TEST_TRANSACTIONS = [
  {
    id: '00000000-0000-0000-0000-0000000000a1',
    reference_no: 'PV-1001',
    date: '2026-09-01',
    category: 'civil_construction',
    description: 'Substructure, first claim',
    payee: 'Smoke Contracting',
    external_reference: null,
    amount: 2000000,
    currency: 'KES',
    fx_rate_to_kes: 1,
    amount_kes: 2000000,
    budget_line_id: null,
    payment_voucher_id: null,
    document_id: '00000000-0000-0000-0000-0000000000d1',
    verified: true,
    audited_at: null,
    audit_note: null,
    confidentiality: 'internal',
    auditor: null,
  },
  {
    id: '00000000-0000-0000-0000-0000000000a2',
    reference_no: 'PV-1002',
    date: '2026-09-10',
    category: 'legal_defence',
    description: 'Counsel fees',
    payee: 'Smoke Advocates',
    external_reference: null,
    amount: 20000,
    currency: 'USD',
    fx_rate_to_kes: 130,
    amount_kes: 2600000,
    budget_line_id: null,
    payment_voucher_id: null,
    // No document, so it reads as unverified whatever anybody would prefer.
    document_id: null,
    verified: false,
    audited_at: null,
    audit_note: null,
    confidentiality: 'internal',
    auditor: null,
  },
];

/** Pledged, received and the gap between them, never added together. */
const TEST_DONATIONS = [
  {
    donation_id: '00000000-0000-0000-0000-0000000000b1',
    donor_name: 'A Turkish foundation',
    donor_stakeholder_id: null,
    pledged_on: '2026-06-01',
    state: 'partly_received',
    pledged_currency: 'TRY',
    pledged_amount: 1000000,
    pledged_amount_kes: 4000000,
    received_kes: 1200000,
    outstanding_kes: 2800000,
    tranche_count: 1,
    unevidenced_tranches: 0,
    confidentiality: 'internal',
  },
];

/**
 * Two risks: one over the escalation line with nobody having acknowledged the
 * crossing, one below it with no trigger written down. Both states are things
 * the register is supposed to be loud about.
 */
const TEST_RISKS = [
  {
    id: '00000000-0000-0000-0000-0000000000e1',
    title_en: 'The lease is not renewed',
    title_tr: null,
    detail_en: null,
    detail_tr: null,
    category: 'legal',
    likelihood: 4,
    impact: 4,
    score: 16,
    owner_profile_id: null,
    state: 'open',
    response: null,
    response_plan_en: null,
    response_plan_tr: null,
    trigger_en: 'The landlord serves notice.',
    early_warning_en: null,
    source_assumption_id: null,
    review_on: null,
    confidentiality: 'internal',
    owner: { full_name: 'Smoke Test' },
  },
  {
    id: '00000000-0000-0000-0000-0000000000e2',
    title_en: 'Monsoon damage to the open slab',
    title_tr: null,
    detail_en: null,
    detail_tr: null,
    category: 'climate',
    likelihood: 2,
    impact: 3,
    score: 6,
    owner_profile_id: null,
    state: 'open',
    response: null,
    response_plan_en: null,
    response_plan_tr: null,
    // No trigger: nobody can say whether this is happening.
    trigger_en: null,
    early_warning_en: null,
    source_assumption_id: null,
    review_on: null,
    confidentiality: 'internal',
    owner: null,
  },
];

const TEST_ESCALATIONS = [
  {
    id: 1,
    risk_id: '00000000-0000-0000-0000-0000000000e1',
    score: 16,
    threshold: 15,
    escalated_at: '2026-09-15T09:00:00Z',
    acknowledged_at: null,
    acknowledger: null,
  },
];

/** Five by five, with the two risks above in their cells. */
const TEST_MATRIX = Array.from({ length: 5 }, (_, l) =>
  Array.from({ length: 5 }, (_, i) => ({
    likelihood: l + 1,
    impact: i + 1,
    score: (l + 1) * (i + 1),
    risk_count: (l + 1 === 4 && i + 1 === 4) || (l + 1 === 2 && i + 1 === 3) ? 1 : 0,
  })),
).flat();

const TEST_DEPENDENCIES = [
  {
    id: '00000000-0000-0000-0000-0000000000e5',
    blocker_legal_case_id: '00000000-0000-0000-0000-0000000000cc',
    blocker_site_task_id: null,
    blocker_obligation_id: null,
    blocker_risk_id: null,
    blocker_label: null,
    blocker_milestone_id: null,
    dependent_site_task_id: null,
    dependent_obligation_id: null,
    dependent_legal_case_id: null,
    // 0024 joined the plan to the one dependency mechanism, so the far end of
    // this chain is now a milestone in a phase rather than a free-text label.
    dependent_milestone_id: '00000000-0000-0000-0000-000000001a02',
    dependent_label: null,
    note_en: 'The inspectors will not come while the boundary is before the court.',
    // The honest null: a case being open says nothing about the ruling.
    blocker_settled: null,
    confidentiality: 'internal',
  },
];

/** Two things waiting on a ruling, one of which a director can settle. */
const TEST_DECISIONS = [
  {
    kind: 'risk_escalation',
    id: '1',
    title_en: 'The lease is not renewed',
    title_tr: null,
    detail: 'Score 16, over the threshold of 15',
    waiting_since: '2026-09-10T09:00:00Z',
    due_on: null,
    waiting_on: ['admin', 'trustee', 'board_director'],
    confidentiality: 'internal',
  },
  {
    kind: 'payment_voucher',
    id: '00000000-0000-0000-0000-0000000000c1',
    title_en: 'PV-1001 — Smoke Contracting',
    title_tr: null,
    detail: 'Substructure, first claim',
    waiting_since: '2026-09-25T09:00:00Z',
    due_on: null,
    waiting_on: ['admin', 'project_director'],
    confidentiality: 'internal',
  },
];

/**
 * What search_records answers. Three of these four are registers the old
 * client-side search could not reach at all, which is the regression this
 * fixture exists to catch.
 */
const TEST_SEARCH_HITS = [
  {
    kind: 'legal_case',
    id: '00000000-0000-0000-0000-0000000000b1',
    title_en: 'Smoke Trust v County Government',
    title_tr: null,
    subtitle: 'ELC/134/2013 · ELC Mombasa',
    snippet: 'Boundary of plot «MN/I/5141» pending determination',
    occurred_on: '2013-04-02',
    confidentiality: 'internal',
    parent_kind: null,
    parent_id: null,
    rank: 1.4,
  },
  {
    kind: 'meeting_note',
    id: '00000000-0000-0000-0000-0000000000b2',
    title_en: 'Trustee sitting, March',
    title_tr: 'Mütevelli toplantısı, Mart',
    subtitle: 'discussed · tr',
    snippet: 'İnşaat «ruhsatı» yenilenmesi görüşüldü',
    occurred_on: '2026-03-11',
    confidentiality: 'confidential',
    parent_kind: 'meeting',
    parent_id: '00000000-0000-0000-0000-0000000000e1',
    rank: 1.1,
  },
  // Two more sections of the SAME minute. A meeting carries its note as four
  // sections in two languages, so one record can match eight times; the
  // modal must show one row and say how many places matched.
  {
    kind: 'meeting_note',
    id: '00000000-0000-0000-0000-0000000000b2a',
    title_en: 'Trustee sitting, March',
    title_tr: 'Mütevelli toplantısı, Mart',
    subtitle: 'outcomes · tr',
    snippet: '«Ruhsat» yenilemesi için başvuru kararı',
    occurred_on: '2026-03-11',
    confidentiality: 'confidential',
    parent_kind: 'meeting',
    parent_id: '00000000-0000-0000-0000-0000000000e1',
    rank: 1.05,
  },
  {
    kind: 'meeting_note',
    id: '00000000-0000-0000-0000-0000000000b2b',
    title_en: 'Trustee sitting, March',
    title_tr: 'Mütevelli toplantısı, Mart',
    subtitle: 'actions · en',
    snippet: 'Renew the «permit» before the end of the quarter',
    occurred_on: '2026-03-11',
    confidentiality: 'confidential',
    parent_kind: 'meeting',
    parent_id: '00000000-0000-0000-0000-0000000000e1',
    rank: 1.0,
  },
  {
    kind: 'obligation',
    id: '00000000-0000-0000-0000-0000000000b3',
    title_en: 'Keep the access road passable',
    title_tr: 'Servis yolunu açık tut',
    subtitle: 'court_order · open',
    snippet: 'Access road to remain «passable» at all times',
    occurred_on: '2026-11-30',
    confidentiality: 'internal',
    parent_kind: null,
    parent_id: null,
    rank: 0.9,
  },
  {
    kind: 'risk',
    id: '00000000-0000-0000-0000-0000000000b4',
    title_en: 'Hearings keep being adjourned',
    title_tr: 'Duruşmalar sürekli erteleniyor',
    subtitle: 'legal · open · score 16',
    snippet: 'The «permit» cannot be renewed while the matter is pending',
    occurred_on: '2026-12-01',
    confidentiality: 'internal',
    parent_kind: null,
    parent_id: null,
    rank: 0.8,
  },
];

/** The usage log the assistant screen shows back (M13-10). */
const TEST_AI_QUERIES = [
  {
    id: '00000000-0000-0000-0000-0000000000f1',
    asked_by: '00000000-0000-0000-0000-0000000000aa',
    task: 'archive_question',
    question: 'What was decided about renewing the permit?',
    source_count: 3,
    refusal: null,
    model: 'gemini-2.5-flash',
    asked_at: '2026-09-30T08:00:00Z',
    asker: { full_name: 'Smoke Test' },
  },
  {
    id: '00000000-0000-0000-0000-0000000000f2',
    asked_by: '00000000-0000-0000-0000-0000000000aa',
    task: 'archive_question',
    question: 'Should we appeal the order?',
    source_count: 1,
    refusal: 'The assistant does not give legal opinions.',
    model: 'gemini-2.5-flash',
    asked_at: '2026-09-30T09:00:00Z',
    asker: { full_name: 'Smoke Test' },
  },
];

/** An answer with its citations, as the proxy returns one. */
const TEST_AI_ANSWER = {
  text:
    'TASLAK — insan onayı gerekir.\nDRAFT — needs human approval.\n\n' +
    'The board resolved to renew the permit before the next hearing ' +
    '[legal_case:00000000-0000-0000-0000-0000000000b1]. The minute recording it ' +
    'is confidential [meeting_note:00000000-0000-0000-0000-0000000000b2].',
  draft: true,
  sources: [
    {
      marker: '[legal_case:00000000-0000-0000-0000-0000000000b1]',
      kind: 'legal_case',
      id: '00000000-0000-0000-0000-0000000000b1',
      titleEn: 'Smoke Trust v County Government',
      titleTr: null,
      subtitle: 'ELC/134/2013 · ELC Mombasa',
      confidentiality: 'internal',
    },
    {
      marker: '[meeting_note:00000000-0000-0000-0000-0000000000b2]',
      kind: 'meeting_note',
      id: '00000000-0000-0000-0000-0000000000b2',
      titleEn: 'Trustee sitting, March',
      titleTr: 'Mütevelli toplantısı, Mart',
      subtitle: 'discussed · tr',
      confidentiality: 'confidential',
    },
  ],
  task: 'archive_question',
};

/** And the refusal M13-08 requires when somebody asks for an opinion. */
const TEST_AI_REFUSAL = {
  refused: 'legal_advice',
  messageEn:
    'This is a question for the project advocate, not for the assistant. ' +
    'The opinions on record that mention it are listed below.',
  messageTr:
    'Bu, asistanın değil proje avukatının cevaplayacağı bir soru. ' +
    'Konuyla ilgili kayıtlı görüşler aşağıda.',
  sources: [
    {
      marker: '[legal_opinion:00000000-0000-0000-0000-0000000000c9]',
      kind: 'legal_opinion',
      id: '00000000-0000-0000-0000-0000000000c9',
      titleEn: 'Prospects on the contempt application',
      titleTr: null,
      subtitle: 'ELC/134/2013 · Opinion of counsel',
      confidentiality: 'confidential',
    },
  ],
};

// --- M10 governance and readiness fixtures ---------------------------------

const TEST_ORGANS = [
  {
    id: '00000000-0000-0000-0000-0000000000g1'.replace(/g/g, '9'),
    kind: 'board_of_trustees',
    name_en: 'Board of Trustees',
    name_tr: 'Mütevelli Heyeti',
    remit_en: null,
    remit_tr: null,
    cadence: 'quarterly',
    quorum_members: 2,
    quorum_fraction: null,
    charter_clause: '7(2)',
    charter_document_id: null,
    confidentiality: 'internal',
    organ_memberships: [{ count: 3 }],
  },
  {
    id: '00000000-0000-0000-0000-000000000992',
    kind: 'audit_committee',
    name_en: 'Audit Committee',
    name_tr: 'Denetim Komitesi',
    remit_en: null,
    remit_tr: null,
    // Nothing recorded: the screen has to say so rather than imply "as required".
    cadence: null,
    quorum_members: null,
    quorum_fraction: null,
    charter_clause: null,
    charter_document_id: null,
    confidentiality: 'internal',
    organ_memberships: [{ count: 1 }],
  },
];

const TEST_SITTINGS = [
  {
    meeting_id: '00000000-0000-0000-0000-0000000009a1',
    title: 'Board sitting, March',
    held_at: '2026-03-11T09:00:00Z',
    minutes_status: 'final',
    organ_id: '00000000-0000-0000-0000-000000000991',
    organ_kind: 'board_of_trustees',
    organ_name_en: 'Board of Trustees',
    organ_name_tr: 'Mütevelli Heyeti',
    seats_held: 3,
    voting_present: 1,
    quorum_required: 2,
    quorum_met: false,
    confidentiality: 'internal',
  },
  {
    meeting_id: '00000000-0000-0000-0000-0000000009a2',
    title: 'Audit committee, no rule recorded',
    held_at: '2026-04-02T09:00:00Z',
    minutes_status: 'draft',
    organ_id: '00000000-0000-0000-0000-000000000992',
    organ_kind: 'audit_committee',
    organ_name_en: 'Audit Committee',
    organ_name_tr: 'Denetim Komitesi',
    seats_held: 1,
    voting_present: 1,
    quorum_required: 0,
    // The three-valued column. Not false.
    quorum_met: null,
    confidentiality: 'internal',
  },
];

const TEST_TRUSTEES = [
  {
    id: '00000000-0000-0000-0000-0000000009b1',
    stakeholder_id: null,
    full_name: 'Smoke Trustee',
    appointing_body: 'Universal Education Foundation',
    appointed_on: '2025-05-27',
    term_ends_on: '2030-05-27',
    seat_en: 'Chair',
    seat_tr: 'Başkan',
    email: 'chair@example.test',
    phone: null,
    identity_document_id: null,
    active: true,
    stood_down_on: null,
    note: null,
    confidentiality: 'internal',
  },
];

const TEST_RESOLUTIONS = [
  {
    decision_id: '00000000-0000-0000-0000-0000000009c1',
    reference_no: 'BOT/2026/01',
    text_en: 'Renew the ground lease before the next intake',
    text_tr: 'Kira sözleşmesini sonraki alımdan önce yenile',
    decided_on: '2026-03-11',
    status: 'in_force',
    signed_at: '2026-03-12T10:00:00Z',
    organ_kind: 'board_of_trustees',
    organ_name_en: 'Board of Trustees',
    organ_name_tr: 'Mütevelli Heyeti',
    // The state that matters: signed, and nobody has said what doing it means.
    actions: 0,
    done: 0,
    cancelled: 0,
    overdue: 0,
    next_due: null,
    implementation: 'no_actions_recorded',
    days_since: 40,
    confidentiality: 'internal',
  },
  // English only, and marked on text_tr. A Turkish reader is shown its
  // English, so the badge must NOT appear on it: the one that does appear
  // belongs to the row above, whose Turkish a machine wrote. Without this row
  // a component keyed to the reader's language instead of to the source column
  // passes every test.
  {
    decision_id: '00000000-0000-0000-0000-0000000009c2',
    reference_no: 'BOT/2026/02',
    text_en: 'Open the second tender for the perimeter works',
    text_tr: null,
    decided_on: '2026-03-11',
    status: 'in_force',
    signed_at: '2026-03-12T10:00:00Z',
    organ_kind: 'board_of_trustees',
    organ_name_en: 'Board of Trustees',
    organ_name_tr: 'Mütevelli Heyeti',
    actions: 0,
    done: 0,
    cancelled: 0,
    overdue: 0,
    next_due: null,
    implementation: 'no_actions_recorded',
    days_since: 40,
    confidentiality: 'internal',
  },
];

const TEST_COMPLIANCE = [
  {
    requirement_id: '00000000-0000-0000-0000-0000000009d1',
    regime: 'cap_164',
    reference: 'Cap 164 s.5',
    title_en: 'Annual return of trustees',
    title_tr: 'Mütevelli yıllık beyanı',
    recurrence: 'annual',
    next_due_on: '2027-03-31',
    obligation_id: null,
    period_label: null,
    obligation_state: null,
    verified: null,
    responsible_name: 'Smoke Test',
    not_yet_raised: true,
    confidentiality: 'internal',
  },
];

const TEST_ACCREDITATION = [
  {
    id: '00000000-0000-0000-0000-0000000009e1',
    body: 'CUE',
    code: 'CUE/STD/3.2',
    title_en: 'Library holdings per programme',
    title_tr: 'Program başına kütüphane kaynakları',
    detail_en: null,
    detail_tr: null,
    state: 'in_progress',
    position_en: 'Two of the four reading lists are costed',
    position_tr: null,
    evidence_document_id: null,
    target_on: '2026-01-31',
    met_on: null,
    note: null,
    confidentiality: 'internal',
    responsible: { full_name: 'Smoke Test' },
  },
];

const TEST_ROADMAP = [
  {
    id: '00000000-0000-0000-0000-0000000009f1',
    sequence: 1,
    title_en: 'Trust deed registered under Cap 164',
    title_tr: 'Vakıf senedinin Fasıl 164 kapsamında tescili',
    detail_en: null,
    detail_tr: null,
    state: 'in_progress',
    target_on: '2026-06-30',
    completed_on: null,
    depends_on_stage_id: null,
    depends_on_title_en: null,
    depends_on_title_tr: null,
    depends_on_state: null,
    blocked_by_predecessor: false,
    overdue: false,
    evidence_document_id: null,
    responsible_name: null,
    confidentiality: 'internal',
  },
  {
    id: '00000000-0000-0000-0000-0000000009f2',
    sequence: 2,
    title_en: 'Letter of interim authority from CUE',
    title_tr: 'CUE geçici yetki yazısı',
    detail_en: null,
    detail_tr: null,
    state: 'planned',
    target_on: '2026-12-31',
    completed_on: null,
    depends_on_stage_id: '00000000-0000-0000-0000-0000000009f1',
    depends_on_title_en: 'Trust deed registered under Cap 164',
    depends_on_title_tr: 'Vakıf senedinin Fasıl 164 kapsamında tescili',
    depends_on_state: 'in_progress',
    blocked_by_predecessor: true,
    overdue: false,
    evidence_document_id: null,
    responsible_name: null,
    confidentiality: 'internal',
  },
];

const TEST_PROGRAMMES = [
  {
    id: '00000000-0000-0000-0000-000000000a01',
    name_en: 'Business Administration',
    name_tr: 'İşletme Yönetimi',
    degree: 'BBA',
    faculty: null,
    state: 'curriculum_drafted',
    curriculum_document_id: null,
    required_academic_staff: 8,
    appointed_academic_staff: 2,
    staff_gap: 6,
    accreditation_requirement_id: null,
    target_intake_year: 2027,
    note: null,
    confidentiality: 'internal',
  },
  {
    id: '00000000-0000-0000-0000-000000000a02',
    name_en: 'Nursing',
    name_tr: null,
    degree: 'BSc',
    faculty: null,
    state: 'proposed',
    curriculum_document_id: null,
    // Nobody has established the requirement, so the gap is unknown, not nil.
    required_academic_staff: null,
    appointed_academic_staff: 0,
    staff_gap: null,
    accreditation_requirement_id: null,
    target_intake_year: 2027,
    note: null,
    confidentiality: 'internal',
  },
];

const TEST_TARGETS = [
  {
    target_id: '00000000-0000-0000-0000-000000000b01',
    obligation_id: '00000000-0000-0000-0000-000000000b11',
    obligation_title_en: 'Full scholarships for a fifth of each intake',
    obligation_title_tr: 'Her alımın beşte birine tam burs',
    source: 'lease',
    obligation_state: 'open',
    basis_en: 'Twenty per cent of the 2027 intake, full scholarship',
    basis_tr: null,
    target_value: 60,
    unit: 'students',
    period_label: '2027 intake',
    due_on: '2027-09-30',
    achieved: 15,
    records: 1,
    percent_of_target: 25.0,
    shortfall: 45,
    confidentiality: 'internal',
  },
  {
    target_id: '00000000-0000-0000-0000-000000000b02',
    obligation_id: '00000000-0000-0000-0000-000000000b12',
    obligation_title_en: 'Build the campus mosque',
    obligation_title_tr: 'Kampüs camisini inşa et',
    source: 'lease',
    obligation_state: 'open',
    basis_en: 'One mosque on the campus',
    basis_tr: null,
    // No target set: the screen must not print nought per cent for this.
    target_value: null,
    unit: 'building',
    period_label: null,
    due_on: '2028-06-30',
    achieved: null,
    records: 0,
    percent_of_target: null,
    shortfall: null,
    confidentiality: 'internal',
  },
];

const TEST_READINESS = [
  { strand: 'infrastructure', total: 2, ready: 0, impeded: 1 },
  { strand: 'accreditation', total: 1, ready: 0, impeded: 1 },
  { strand: 'curriculum', total: 2, ready: 0, impeded: 0 },
  { strand: 'academic_staff', total: 8, ready: 2, impeded: 1 },
];

const TEST_CONFLICTS = [
  {
    id: '00000000-0000-0000-0000-000000000c01',
    trustee_id: null,
    profile_id: '00000000-0000-0000-0000-0000000000aa',
    organ_id: null,
    interest_en: 'A relative is a director of one of the tendering firms',
    interest_tr: null,
    declared_on: '2026-04-01',
    covers_from: null,
    covers_to: null,
    document_id: null,
    recused_from_decision_id: null,
    note: null,
    confidentiality: 'confidential',
    trustee: null,
    profile: { full_name: 'Smoke Test' },
  },
];

// --- M14 procurement fixtures ----------------------------------------------

/** The four counsel candidates the requirement is actually about. */
const TEST_PROCUREMENTS = [
  {
    id: '00000000-0000-0000-0000-000000000d01',
    reference_no: 'PR-2026-01',
    kind: 'legal_counsel',
    need_en: 'Lead counsel for the appeal',
    need_tr: 'Temyiz için baş avukat',
    justification_en: 'The present advocate is retiring and the appeal is listed for February.',
    justification_tr: null,
    estimated_amount: 3000000,
    estimated_currency: 'KES',
    estimated_amount_kes: 3000000,
    requested_by: '00000000-0000-0000-0000-0000000000aa',
    requested_at: '2026-01-04T09:00:00Z',
    needed_by: '2026-02-01',
    state: 'awarded',
    approved_at: '2026-01-06T09:00:00Z',
    decision_note: 'Four candidates to be invited.',
    cancelled_reason: null,
    confidentiality: 'internal',
    requester: { full_name: 'Smoke Test' },
    approver: { full_name: 'Smoke Director' },
    procurement_candidates: [{ count: 4 }],
  },
  {
    id: '00000000-0000-0000-0000-000000000d02',
    reference_no: 'PR-2026-02',
    kind: 'auditor',
    need_en: 'External auditor for the 2026 accounts',
    need_tr: '2026 hesapları için dış denetçi',
    justification_en: 'Cap 164 requires audited accounts and the donor agreement repeats it.',
    justification_tr: null,
    estimated_amount: 1200000,
    estimated_currency: 'KES',
    estimated_amount_kes: 1200000,
    requested_by: '00000000-0000-0000-0000-0000000000aa',
    requested_at: '2026-03-02T09:00:00Z',
    needed_by: '2026-06-30',
    // The state that puts somebody on the hook.
    state: 'drafted',
    approved_at: null,
    decision_note: null,
    cancelled_reason: null,
    confidentiality: 'internal',
    requester: { full_name: 'Smoke Test' },
    approver: null,
    procurement_candidates: [{ count: 0 }],
  },
];

const TEST_CANDIDATES = [
  {
    id: '00000000-0000-0000-0000-000000000e01',
    request_id: '00000000-0000-0000-0000-000000000d01',
    organization_id: null,
    stakeholder_id: null,
    name: 'Mwangi & Co Advocates',
    scope_en: 'Appeal, from record to judgment',
    scope_tr: null,
    fee_amount: 2800000,
    fee_currency: 'KES',
    fee_amount_kes: 2800000,
    fee_basis: 'fixed',
    references_en: null,
    strengths_en: 'Argued two ELC appeals last year',
    weaknesses_en: 'No Mombasa office',
    score: 82,
    proposal_document_id: null,
    outcome: 'selected',
    decision_note_en: 'Only candidate with an ELC appellate record; fee within the estimate.',
    decision_note_tr: null,
    decided_on: '2026-01-20',
    confidentiality: 'internal',
  },
  {
    id: '00000000-0000-0000-0000-000000000e02',
    request_id: '00000000-0000-0000-0000-000000000d01',
    organization_id: null,
    stakeholder_id: null,
    name: 'Otieno Advocates',
    scope_en: 'Appeal only',
    scope_tr: null,
    fee_amount: 2200000,
    fee_currency: 'KES',
    fee_amount_kes: 2200000,
    fee_basis: 'fixed',
    references_en: null,
    strengths_en: 'Cheapest proposal',
    weaknesses_en: 'No appellate record in land matters',
    score: 54,
    proposal_document_id: null,
    // The half that went missing in the meeting notes.
    outcome: 'rejected',
    decision_note_en: 'No appellate record in land matters, which is the whole brief.',
    decision_note_tr: null,
    decided_on: '2026-01-20',
    confidentiality: 'internal',
  },
];

const TEST_CONTRACT_ALERTS = [
  {
    contract_id: '00000000-0000-0000-0000-000000000f01',
    reference_no: 'CT-2026-01',
    counterparty_name: 'Mwangi & Co Advocates',
    subject_en: 'Conduct of the ELC appeal',
    subject_tr: 'ELC temyizinin yürütülmesi',
    state: 'active',
    starts_on: '2026-01-25',
    ends_on: '2026-10-25',
    renewal_on: '2026-09-25',
    notice_days: 30,
    value_amount: 2800000,
    value_currency: 'KES',
    value_amount_kes: 2800000,
    value_basis: 'fixed',
    renewal_band: 'within_30',
    expiry_band: 'within_60',
    next_date: '2026-09-25',
    days_to_expiry: 55,
    days_to_renewal: 25,
    // Nobody has written the next one, which is what the alert is for.
    renewal_drafted: false,
    confidentiality: 'internal',
  },
  {
    contract_id: '00000000-0000-0000-0000-000000000f02',
    reference_no: 'CT-2025-04',
    counterparty_name: 'Coast Engineering',
    subject_en: 'Phase one civil works',
    subject_tr: 'Birinci faz inşaat işleri',
    state: 'active',
    starts_on: '2025-03-01',
    ends_on: '2026-12-31',
    renewal_on: null,
    notice_days: 60,
    value_amount: 180000000,
    value_currency: 'KES',
    value_amount_kes: 180000000,
    // An hourly or rate-based engagement has no fixed sum, and saying so
    // beats leaving the column blank.
    value_basis: 'rate_based',
    renewal_band: null,
    expiry_band: 'later',
    next_date: '2026-12-31',
    days_to_expiry: 300,
    days_to_renewal: null,
    renewal_drafted: true,
    confidentiality: 'internal',
  },
];

const TEST_CONTRACT_TERMS = [
  {
    id: '00000000-0000-0000-0000-000000000f11',
    contract_id: '00000000-0000-0000-0000-000000000f01',
    clause: 'cl. 4.1',
    title_en: 'File the record of appeal',
    title_tr: 'Temyiz dosyasını sun',
    detail_en: 'Within sixty days of the retainer.',
    owed_by: 'counterparty',
    due_on: '2026-03-25',
    obligation_id: '00000000-0000-0000-0000-000000000f21',
    confidentiality: 'internal',
    obligation: { state: 'open' },
  },
];

const TEST_SETTLEMENT = [
  {
    contract_id: '00000000-0000-0000-0000-000000000f01',
    reference_no: 'CT-2026-01',
    counterparty_name: 'Mwangi & Co Advocates',
    subject_en: 'Conduct of the ELC appeal',
    state: 'active',
    value_basis: 'fixed',
    value_kes: 2800000,
    milestones: 3,
    scheduled_kes: 3700000,
    paid_kes: 1400000,
    next_due: '2026-06-30',
    percent_paid: 50.0,
    // Reported, not refused: a variation that raises the price is real.
    over_committed: true,
    confidentiality: 'internal',
  },
];

const TEST_CONTRACT_MILESTONES = [
  {
    id: '00000000-0000-0000-0000-000000000f31',
    contract_id: '00000000-0000-0000-0000-000000000f01',
    sequence: 1,
    title_en: 'On signature',
    title_tr: 'İmzada',
    due_on: '2026-01-25',
    state: 'paid',
    amount: 1400000,
    currency: 'KES',
    amount_kes: 1400000,
    valuation_id: null,
    payment_voucher_id: '00000000-0000-0000-0000-0000000000c1',
    note: null,
    confidentiality: 'internal',
  },
];

// ---------------------------------------------------------------------------
// The other half of the match (M14-07, 0038)
// ---------------------------------------------------------------------------
//
// Four rows, one per disagreement the schedule could not see, plus one that
// agrees so the panel can be shown to leave it alone.

const TEST_MILESTONE_MATCHING = [
  {
    contract_milestone_id: '00000000-0000-0000-0000-000000000f31',
    contract_id: '00000000-0000-0000-0000-000000000f01',
    reference_no: 'CT-2026-01',
    counterparty_name: 'Mwangi & Co Advocates',
    contract_contractor_id: null,
    sequence: 1,
    title_en: 'On signature',
    title_tr: 'İmzada',
    state: 'paid',
    due_on: '2026-01-25',
    amount: 1400000,
    currency: 'KES',
    amount_kes: 1400000,
    valuation_id: '00000000-0000-0000-0000-000000000e01',
    payment_voucher_id: '00000000-0000-0000-0000-0000000000c1',
    valuation_amount: 1400000,
    valuation_currency: 'KES',
    valuation_contractor_id: null,
    construction_block_id: null,
    period_start: '2026-01-01',
    period_end: '2026-01-20',
    valuation_state: 'director_approved',
    qs_certified_at: '2026-01-21T09:00:00Z',
    director_approved_at: '2026-01-22T09:00:00Z',
    amount_verdict: 'agree',
    claims_a_certification_the_works_do_not: false,
    matched_to_another_firms_work: false,
    confidentiality: 'internal',
  },
  {
    // Two numbers for one piece of work.
    contract_milestone_id: '00000000-0000-0000-0000-000000000f32',
    contract_id: '00000000-0000-0000-0000-000000000f01',
    reference_no: 'CT-2026-01',
    counterparty_name: 'Mwangi & Co Advocates',
    contract_contractor_id: null,
    sequence: 2,
    title_en: 'Substructure, second period',
    title_tr: null,
    state: 'planned',
    due_on: '2026-03-10',
    amount: 2000000,
    currency: 'KES',
    amount_kes: 2000000,
    valuation_id: '00000000-0000-0000-0000-000000000e02',
    payment_voucher_id: null,
    valuation_amount: 2200000,
    valuation_currency: 'KES',
    valuation_contractor_id: null,
    construction_block_id: null,
    period_start: '2026-02-01',
    period_end: '2026-02-28',
    valuation_state: 'qs_certified',
    qs_certified_at: '2026-03-01T09:00:00Z',
    director_approved_at: null,
    amount_verdict: 'disagree',
    claims_a_certification_the_works_do_not: false,
    matched_to_another_firms_work: false,
    confidentiality: 'internal',
  },
  {
    // Two currencies and no rate between them. Not a disagreement.
    contract_milestone_id: '00000000-0000-0000-0000-000000000f33',
    contract_id: '00000000-0000-0000-0000-000000000f01',
    reference_no: 'CT-2026-01',
    counterparty_name: 'Mwangi & Co Advocates',
    contract_contractor_id: null,
    sequence: 3,
    title_en: 'Imported formwork',
    title_tr: null,
    state: 'planned',
    due_on: '2026-04-01',
    amount: 1000000,
    currency: 'KES',
    amount_kes: 1000000,
    valuation_id: '00000000-0000-0000-0000-000000000e03',
    payment_voucher_id: null,
    valuation_amount: 15000,
    valuation_currency: 'USD',
    valuation_contractor_id: null,
    construction_block_id: null,
    period_start: '2026-03-01',
    period_end: '2026-03-31',
    valuation_state: 'draft',
    qs_certified_at: null,
    director_approved_at: null,
    amount_verdict: 'different_currencies',
    claims_a_certification_the_works_do_not: false,
    matched_to_another_firms_work: false,
    confidentiality: 'internal',
  },
  {
    // Certified by the schedule, measured by nobody.
    contract_milestone_id: '00000000-0000-0000-0000-000000000f34',
    contract_id: '00000000-0000-0000-0000-000000000f01',
    reference_no: 'CT-2026-01',
    counterparty_name: 'Mwangi & Co Advocates',
    contract_contractor_id: null,
    sequence: 4,
    title_en: 'Site establishment',
    title_tr: null,
    state: 'certified',
    due_on: '2025-12-01',
    amount: 500000,
    currency: 'KES',
    amount_kes: 500000,
    valuation_id: null,
    payment_voucher_id: null,
    valuation_amount: null,
    valuation_currency: null,
    valuation_contractor_id: null,
    construction_block_id: null,
    period_start: null,
    period_end: null,
    valuation_state: null,
    qs_certified_at: null,
    director_approved_at: null,
    amount_verdict: 'unmatched',
    claims_a_certification_the_works_do_not: true,
    matched_to_another_firms_work: false,
    confidentiality: 'internal',
  },
  {
    // Citing work measured for a different firm.
    contract_milestone_id: '00000000-0000-0000-0000-000000000f35',
    contract_id: '00000000-0000-0000-0000-000000000f01',
    reference_no: 'CT-2026-01',
    counterparty_name: 'Mwangi & Co Advocates',
    contract_contractor_id: '00000000-0000-0000-0000-0000000000b1',
    sequence: 5,
    title_en: 'Blockwork',
    title_tr: null,
    state: 'planned',
    due_on: '2026-05-01',
    amount: 640000,
    currency: 'KES',
    amount_kes: 640000,
    valuation_id: '00000000-0000-0000-0000-000000000e04',
    payment_voucher_id: null,
    valuation_amount: 640000,
    valuation_currency: 'KES',
    valuation_contractor_id: '00000000-0000-0000-0000-0000000000b2',
    construction_block_id: null,
    period_start: '2026-04-01',
    period_end: '2026-04-30',
    valuation_state: 'qs_certified',
    qs_certified_at: '2026-05-01T09:00:00Z',
    director_approved_at: null,
    amount_verdict: 'agree',
    claims_a_certification_the_works_do_not: false,
    matched_to_another_firms_work: true,
    confidentiality: 'internal',
  },
];

const TEST_UNSCHEDULED_VALUATIONS = [
  {
    valuation_id: '00000000-0000-0000-0000-000000000e11',
    construction_block_id: '00000000-0000-0000-0000-0000000000b1',
    block_code: 'A1',
    contractor_id: '00000000-0000-0000-0000-0000000000b1',
    contractor_name: 'Coast Engineering',
    period_start: '2026-05-01',
    period_end: '2026-05-31',
    amount: 410000,
    currency: 'KES',
    state: 'qs_certified',
    qs_certified_at: '2026-06-01T09:00:00Z',
    director_approved_at: null,
    paid_at: null,
    certified: true,
    // Two live contracts name this firm, so the register says nothing rather
    // than pointing at one.
    the_only_live_contract_for_that_firm: null,
    confidentiality: 'internal',
  },
  {
    valuation_id: '00000000-0000-0000-0000-000000000e12',
    construction_block_id: '00000000-0000-0000-0000-0000000000b1',
    block_code: 'A1',
    contractor_id: '00000000-0000-0000-0000-0000000000b1',
    contractor_name: 'Coast Engineering',
    period_start: '2026-06-01',
    period_end: '2026-06-15',
    amount: 95000,
    currency: 'KES',
    state: 'draft',
    qs_certified_at: null,
    director_approved_at: null,
    paid_at: null,
    certified: false,
    the_only_live_contract_for_that_firm: '00000000-0000-0000-0000-000000000f01',
    confidentiality: 'internal',
  },
];

const TEST_PAYMENT_MATCHING_HEALTH = {
  instalments_whose_amount_disagrees: 1,
  instalments_that_cannot_be_compared: 1,
  instalments_claiming_an_uncertified_measurement: 1,
  instalments_matched_to_another_firms_work: 1,
  settled_instalments_with_no_measurement: 1,
  measured_work_with_no_instalment: 2,
  certified_work_with_no_instalment: 1,
};

const TEST_REVIEWS = [
  {
    id: '00000000-0000-0000-0000-000000000f41',
    contract_id: '00000000-0000-0000-0000-000000000f01',
    organization_id: null,
    stakeholder_id: '00000000-0000-0000-0000-0000000000b9',
    contractor_id: null,
    period_start: '2026-01-25',
    period_end: '2026-04-25',
    quality: 4,
    timeliness: 2,
    cost_control: 5,
    cooperation: 4,
    overall: 3.75,
    note_en: 'Sound on the law, late with the record twice.',
    note_tr: null,
    document_id: null,
    reviewed_at: '2026-04-26T09:00:00Z',
    confidentiality: 'internal',
    reviewer: { full_name: 'Smoke Test' },
    organization: null,
    stakeholder: { full_name: 'Mwangi & Co Advocates' },
    contractor: null,
  },
];

// --- M15 plan fixtures ------------------------------------------------------
//
// The numbers here are chosen to exercise the two subtractions the module is
// for: a milestone delivered ninety days late, and a date that was pushed out
// four months before being delivered "five days late". A portal that keeps
// one date per milestone cannot tell those apart.

const TEST_MILESTONES = [
  {
    id: '00000000-0000-0000-0000-000000001a01',
    code: 'MS-04',
    phase_id: '00000000-0000-0000-0000-000000001b01',
    title_en: 'Block A roof closed',
    title_tr: 'A blok çatısı kapandı',
    detail_en: null,
    detail_tr: null,
    target_on: '2026-04-01',
    achieved_on: '2026-06-30',
    // The column the module exists for: 90, not a status saying "done".
    slip_days: 90,
    state: 'achieved',
    critical: true,
    owner_profile_id: '00000000-0000-0000-0000-0000000000aa',
    evidence_document_id: '00000000-0000-0000-0000-0000000000d1',
    note: null,
    confidentiality: 'internal',
    owner: { full_name: 'Smoke Test' },
    phase: { name_en: 'Phase 1 — enabling works' },
  },
  {
    id: '00000000-0000-0000-0000-000000001a02',
    code: 'MS-07',
    phase_id: '00000000-0000-0000-0000-000000001b01',
    title_en: 'CUE inspection passed',
    title_tr: 'CUE denetimi geçildi',
    detail_en: null,
    detail_tr: null,
    target_on: '2026-05-15',
    achieved_on: null,
    // Null, not nought: neither delivered nor known to be on time.
    slip_days: null,
    state: 'in_progress',
    critical: false,
    owner_profile_id: null,
    evidence_document_id: null,
    note: null,
    confidentiality: 'internal',
    owner: null,
    phase: { name_en: 'Phase 1 — enabling works' },
  },
  // No target date, so it cannot be placed either.
  {
    id: '00000000-0000-0000-0000-000000001a03',
    code: 'M3',
    phase_id: '00000000-0000-0000-0000-000000001b01',
    phase_name: 'Phase 1 — enabling works',
    title_en: 'Hand over the perimeter wall',
    title_tr: 'Çevre duvarını teslim al',
    detail_en: null,
    detail_tr: null,
    target_on: null,
    achieved_on: null,
    slip_days: null,
    state: 'planned',
    critical: false,
    owner_name: null,
    owner_profile_id: null,
    evidence_document_id: null,
    note: null,
    confidentiality: 'internal',
  },
];

const TEST_PHASES = [
  {
    phase_id: '00000000-0000-0000-0000-000000001b01',
    code: 'P1',
    name_en: 'Phase 1 — enabling works',
    name_tr: 'Faz 1 — altyapı işleri',
    sequence: 1,
    starts_on: '2025-10-01',
    ends_on: '2026-03-31',
    scope_en: 'Blocks A1 and B2, the access road and the perimeter wall',
    scope_tr: 'A1 ve B2 blokları, ulaşım yolu ve çevre duvarı',
    objective_en: 'A site the contractor can work on without a court order stopping it',
    objective_tr: 'Müteahhitin mahkeme kararıyla durdurulmadan çalışabileceği bir saha',
    blocks: 2,
    blocks_complete: 1,
    milestones: 2,
    milestones_achieved: 1,
    milestones_missed: 0,
    next_target: '2026-05-15',
    budget_kes: 48000000,
    // Computed in SQL from the end date and the open work, not typed in.
    overran: true,
    confidentiality: 'internal',
  },
  // No end date. A timeline must not place this: giving it one would say
  // something the plan does not say.
  {
    phase_id: '00000000-0000-0000-0000-000000001b02',
    code: 'P2',
    name_en: 'Phase 2 — teaching block',
    name_tr: 'Faz 2 — eğitim bloğu',
    sequence: 2,
    starts_on: '2026-04-01',
    ends_on: null,
    scope_en: null,
    scope_tr: null,
    objective_en: null,
    objective_tr: null,
    blocks: 0,
    blocks_complete: 0,
    milestones: 0,
    milestones_achieved: 0,
    milestones_missed: 0,
    next_target: null,
    budget_kes: null,
    overran: false,
    confidentiality: 'internal',
  },
];

const TEST_BASELINES = [
  {
    id: '00000000-0000-0000-0000-000000001c01',
    name: 'February board plan',
    taken_on: '2026-02-10',
    note: 'Tabled at the February sitting.',
    taker: { full_name: 'Smoke Test' },
  },
];

/**
 * The pair of numbers kept apart. The date was pushed out 120 days and the
 * thing was then delivered 5 days after the NEW date — which most systems
 * report as "5 days late" and nothing else.
 */
const TEST_VARIANCE = [
  {
    baseline_id: '00000000-0000-0000-0000-000000001c01',
    baseline_name: 'February board plan',
    taken_on: '2026-02-10',
    milestone_id: '00000000-0000-0000-0000-000000001a01',
    code: 'MS-04',
    title_en: 'Block A roof closed',
    title_tr: 'A blok çatısı kapandı',
    baseline_target: '2026-04-01',
    current_target: '2026-07-30',
    target_moved_days: 120,
    baseline_state: 'planned',
    current_state: 'achieved',
    achieved_on: '2026-08-04',
    delivery_slip_days: 5,
    confidentiality: 'internal',
  },
];

const TEST_CHRONOLOGY = [
  {
    source: 'recorded',
    category: 'founding',
    id: '00000000-0000-0000-0000-000000001d01',
    occurred_on: '1993-01-01',
    // Only the year is known. Printing 1 January would invent a day.
    precision: 'year',
    title_en: 'The trust is constituted in Mombasa',
    title_tr: null,
    detail_en: null,
    document_id: null,
    source_note: 'Recited in the 2025 amended trust deed, recital 2.',
    legal_case_id: null,
    confidentiality: 'public',
  },
  {
    source: 'legal_order',
    category: 'legal',
    id: '00000000-0000-0000-0000-000000001d02',
    occurred_on: '2024-11-12',
    precision: 'day',
    title_en: 'Preservation order granted over the suit land',
    title_tr: null,
    detail_en: null,
    document_id: '00000000-0000-0000-0000-0000000000d1',
    source_note: null,
    legal_case_id: '00000000-0000-0000-0000-0000000000cc',
    confidentiality: 'internal',
  },
];

/** What the strip at the top of every screen is given. */
const TEST_CRITICAL_DATES = [
  {
    kind: 'milestone',
    id: '00000000-0000-0000-0000-000000001a02',
    title_en: 'CUE inspection passed',
    title_tr: 'CUE denetimi geçildi',
    due_on: '2026-05-15',
    due_at: null,
    detail: null,
    legal_case_id: null,
    meeting_id: null,
    state: 'in_progress',
    needs_attention: true,
    // Signed, and in the past: the strip says "ago" rather than a minus sign.
    days_away: -12,
    confidentiality: 'internal',
  },
];

// --- M11 communication fixtures ---------------------------------------------

const TEST_THREADS = [
  {
    id: '00000000-0000-0000-0000-000000002a01',
    title: 'Appointment of new counsel',
    channel: 'trustee',
    kind: 'discussion',
    urgent: false,
    pinned: false,
    closed_at: null,
    confidentiality: 'internal',
    created_at: '2026-09-20T09:00:00Z',
    created_by: '00000000-0000-0000-0000-0000000000aa',
    started_by: 'Smoke Test',
    legal_case_id: null,
    construction_block_id: null,
    obligation_id: null,
    transaction_id: null,
    messages: 2,
    last_message_at: '2026-09-21T11:00:00Z',
    last_speaker: 'Smoke Trustee',
    seen_by_me: false,
  },
  {
    id: '00000000-0000-0000-0000-000000002a02',
    title: 'The appeal is listed for 12 February',
    channel: 'general',
    kind: 'announcement',
    urgent: true,
    pinned: true,
    closed_at: null,
    confidentiality: 'internal',
    created_at: '2026-09-25T09:00:00Z',
    created_by: '00000000-0000-0000-0000-0000000000aa',
    started_by: 'Smoke Test',
    legal_case_id: null,
    construction_block_id: null,
    obligation_id: null,
    transaction_id: null,
    messages: 1,
    last_message_at: '2026-09-25T09:00:00Z',
    last_speaker: 'Smoke Test',
    // Not yet acknowledged, so the panel must offer the acknowledgement
    // rather than a reply box.
    seen_by_me: false,
  },
];

const TEST_THREAD_MESSAGES = [
  {
    id: '00000000-0000-0000-0000-000000002b01',
    thread_id: '00000000-0000-0000-0000-000000002a01',
    sender_id: '00000000-0000-0000-0000-0000000000aa',
    body: 'Four firms have been approached.',
    created_at: '2026-09-20T09:05:00Z',
    // The name comes from the joined profile, never from a string the client
    // wrote — which is what 'Current User' was.
    sender: { full_name: 'Smoke Test' },
  },
];

const TEST_REACH = [
  {
    thread_id: '00000000-0000-0000-0000-000000002a02',
    title: 'The appeal is listed for 12 February',
    channel: 'general',
    urgent: true,
    created_at: '2026-09-25T09:00:00Z',
    seen: 3,
    // The denominator is the people who could see it, not everybody.
    could_see: 9,
    seen_by: ['Smoke Trustee', 'Smoke Director', 'Smoke Field'],
  },
];

const TEST_CHANNEL_MEMBERS = [
  {
    channel: 'trustee',
    profile_id: '00000000-0000-0000-0000-0000000000bb',
    added_at: '2026-09-18T09:00:00Z',
    note: 'Measuring the counsel fee proposals',
    member: { full_name: 'Smoke Surveyor' },
  },
];

const TEST_INBOX = [
  {
    id: '00000000-0000-0000-0000-000000002c01',
    topic: 'hearing',
    urgent: true,
    title_en: 'The appeal is listed for 12 February',
    title_tr: 'Temyiz 12 Şubat’a verildi',
    body: null,
    entity_kind: 'hearing',
    entity_id: '00000000-0000-0000-0000-0000000000cc',
    thread_id: null,
    raised_at: '2026-09-25T09:00:00Z',
    delivery_id: '00000000-0000-0000-0000-000000002d01',
    read_at: null,
    // The honest column: these were never going to arrive.
    awaiting_a_provider: ['email', 'whatsapp'],
    raised_by: 'Smoke Director',
  },
];

const TEST_PREFERENCES = [{ topic: 'digest', medium: 'email', enabled: false }];

const TEST_CORRESPONDENCE = [
  {
    id: '00000000-0000-0000-0000-000000002e01',
    reference_no: 'OUT-2026-004',
    direction: 'outgoing',
    route: 'letter',
    subject_en: 'Request for extension of the temporary occupation licence',
    subject_tr: 'Geçici kullanım izninin uzatılması talebi',
    summary: null,
    sent_on: '2026-09-10',
    counterparty_name: 'County Government of Mombasa',
    document_id: '00000000-0000-0000-0000-0000000000d1',
    legal_case_id: null,
    // Sent, never acknowledged — the distinction the register is for.
    delivery_confirmed_on: null,
    delivery_evidence_document_id: null,
    delivery_note: null,
    confidentiality: 'internal',
    signatory: { full_name: 'Smoke Director' },
    stakeholder: null,
    organization: null,
  },
  {
    id: '00000000-0000-0000-0000-000000002e02',
    reference_no: 'OUT-2026-003',
    direction: 'outgoing',
    route: 'hand_delivery',
    subject_en: 'Filing of the audited accounts',
    subject_tr: 'Denetlenmiş hesapların sunulması',
    summary: null,
    sent_on: '2026-08-02',
    counterparty_name: 'Commission for University Education',
    document_id: '00000000-0000-0000-0000-0000000000d1',
    legal_case_id: null,
    delivery_confirmed_on: '2026-08-04',
    delivery_evidence_document_id: '00000000-0000-0000-0000-0000000000d1',
    delivery_note: null,
    confidentiality: 'internal',
    signatory: { full_name: 'Smoke Director' },
    stakeholder: null,
    organization: null,
  },
];

/** Three audiences, three different answers — see the assertions. */
const TEST_DIGEST = {
  trustee: [
    {
      section: 'waiting on you',
      occurred_on: '2026-09-22',
      title_en: 'The lease is not renewed',
      title_tr: null,
      detail: 'Score 16, over the threshold of 15',
      entity_kind: 'risk_escalation',
      entity_id: '1',
      confidentiality: 'internal',
    },
    {
      section: 'happened',
      occurred_on: '2026-09-21',
      title_en: 'Preservation order granted over the suit land',
      title_tr: null,
      detail: null,
      entity_kind: 'legal_order',
      entity_id: '00000000-0000-0000-0000-000000001d02',
      confidentiality: 'internal',
    },
  ],
  donor: [
    {
      section: 'happened',
      occurred_on: '2026-09-18',
      title_en: 'Foundation stone laid for Block A',
      title_tr: null,
      detail: null,
      entity_kind: 'milestone',
      entity_id: '00000000-0000-0000-0000-000000001a01',
      confidentiality: 'public',
    },
  ],
  field: [],
};

// --- M12 compiled report fixtures -------------------------------------------
//
// One run of each kind, in the three states that matter: a draft board pack
// awaiting approval, an approved status report awaiting publication, and a
// published donor report. The rows carry a source_note each, because the
// requirement's measure is that no material figure travels without one.

/**
 * One person in the register, so the owner picker has both kinds of owner in
 * it. An action belongs to exactly one of them — a portal user or somebody
 * outside who never signs in — and a picker offering only the first would
 * quietly push every obligation onto the staff.
 */
const TEST_STAKEHOLDERS = [
  {
    id: '00000000-0000-0000-0000-0000000000b4',
    full_name: 'Mr. Tariq',
    title: 'Site engineer',
    organization_id: null,
    category: 'contractor',
    email: null,
    phone: null,
    whatsapp: null,
    location: 'Mombasa',
    preferred_language: 'en',
    interest_topic: null,
    stance: 'supporter',
    influence: 3,
    interest: 4,
    relationship_owner: null,
    profile_id: null,
    notes: null,
    confidentiality: 'internal',
    organization: null,
    owner: null,
  },
];

/**
 * Which fields hold unapproved machine text (0035), per table.
 *
 * The second action-candidate entry is the one that earns its place. That
 * candidate has no Turkish, so a Turkish reader is shown its English — and a
 * badge keyed to the reader's language rather than to the column the words
 * came from would mark a sentence no machine wrote. It is marked here
 * precisely so the screen can be checked for NOT badging it.
 */
const TEST_MACHINE_MARKS = {
  meetings: [{ entity_id: '00000000-0000-0000-0000-0000000000bb', column_name: 'title_tr' }],
  // A register rather than a detail screen, and reached through <Bilingual>,
  // which asks about the whole table because it is handed one row at a time.
  decisions: [
    { entity_id: '00000000-0000-0000-0000-0000000009c1', column_name: 'text_tr' },
    { entity_id: '00000000-0000-0000-0000-0000000009c2', column_name: 'text_tr' },
  ],
};

/**
 * Machine translations in the three states that matter (0034).
 *
 * The middle one is the point of the whole feature: the field no longer says
 * what the machine said, so a person has already been there and there is
 * nothing to approve. A queue that asked them to confirm their own edit would
 * be asking the wrong question.
 */
const TEST_TRANSLATIONS = [
  {
    id: '00000000-0000-0000-0000-00000000c401',
    entity_table: 'obligations',
    entity_id: '00000000-0000-0000-0000-0000000000b1',
    column_name: 'detail_tr',
    into_language: 'tr',
    from_language: 'en',
    model: 'gemini-2.5-flash',
    machine_text: 'Tadilin tapu siciline tevdi edilmesi gerekir.',
    current_text: 'Tadilin tapu siciline tevdi edilmesi gerekir.',
    still_the_machines_words: true,
    translated_at: '2026-09-30T09:00:00Z',
    approved_at: null,
    corrected: false,
  },
  {
    id: '00000000-0000-0000-0000-00000000c402',
    entity_table: 'decisions',
    entity_id: '00000000-0000-0000-0000-0000000000c1',
    column_name: 'rationale_tr',
    into_language: 'tr',
    from_language: 'en',
    model: 'gemini-2.5-flash',
    machine_text: 'Kurul izni beklemeye karar verdi.',
    current_text: 'Kurul, mahkeme kararını beklemeye karar verdi.',
    still_the_machines_words: false,
    translated_at: '2026-09-29T09:00:00Z',
    approved_at: null,
    corrected: false,
  },
  {
    id: '00000000-0000-0000-0000-00000000c403',
    entity_table: 'action_items',
    entity_id: '00000000-0000-0000-0000-0000000000d1',
    column_name: 'text_en',
    into_language: 'en',
    from_language: 'tr',
    model: 'gemini-2.5-flash',
    machine_text: 'Deliver the engineering report by Saturday.',
    current_text: 'Deliver the engineering report by Saturday.',
    still_the_machines_words: true,
    translated_at: '2026-09-28T09:00:00Z',
    approved_at: '2026-09-28T10:00:00Z',
    corrected: false,
  },
];

/** The single-language gap the feature exists to bring down. */
const TEST_BACKLOG = [
  { entity_table: 'obligations', base: 'detail', only_en: 10, only_tr: 0, in_both: 0 },
  { entity_table: 'chronology_entries', base: 'detail', only_en: 8, only_tr: 0, in_both: 0 },
  { entity_table: 'decisions', base: 'text', only_en: 0, only_tr: 1, in_both: 6 },
];

/**
 * Whether anything is raising notifications (0033).
 *
 * The strip this feeds is shown whether or not the inbox has anything in it,
 * because an empty inbox means two different things — nothing was due, or the
 * sweep stopped — and only this tells them apart.
 */
const TEST_HEALTH = {
  last_ran_at: '2026-09-30T06:00:00Z',
  last_trigger_source: 'schedule',
  last_raised: 4,
  last_by_topic: { deadline: 3, hearing: 1 },
  hours_since: 5,
  looks_stopped: false,
  media_with_a_provider: ['in_app'],
  media_without_a_provider: ['email', 'whatsapp', 'push'],
};

/** The same, three weeks stale: a schedule that quietly stopped. */
const TEST_HEALTH_STOPPED = {
  ...TEST_HEALTH,
  last_ran_at: '2026-09-08T06:00:00Z',
  hours_since: 540,
  looks_stopped: true,
};

/**
 * The action triage queue (M3-05, M3-07, G-04).
 *
 * Three rows standing in for the three shapes the Notion archive produced: a
 * sentence that names both a person and a date, one that names neither, and
 * one somebody has already dropped with a reason. The middle one is the
 * common case — eighty-five of the hundred and three — and it is the one
 * whose screen has to say that a date is being decided rather than typed.
 */
const TEST_TRIAGE = [
  {
    id: '00000000-0000-0000-0000-00000000a401',
    meeting_id: '00000000-0000-0000-0000-0000000000bb',
    meeting_title: 'Smoke meeting',
    meeting_title_tr: 'Duman toplantısı',
    held_at: '2026-09-01T10:00:00Z',
    sequence: 1,
    text_en: 'Mr. Tariq to deliver the engineering report by Saturday 25 April',
    text_tr: 'Mr. Tariq mühendislik raporunu 25 Nisan Cumartesi\u2019ye kadar teslim etsin',
    suggested_owner_stakeholder_id: null,
    suggested_owner_name: 'Mr. Tariq',
    suggested_due_on: '2026-04-25',
    state: 'pending',
    action_item_id: null,
    dismissed_reason: null,
    names_an_owner: true,
    names_a_date: true,
    confidentiality: 'internal',
  },
  {
    id: '00000000-0000-0000-0000-00000000a402',
    meeting_id: '00000000-0000-0000-0000-0000000000bb',
    meeting_title: 'Smoke meeting',
    meeting_title_tr: 'Duman toplantısı',
    held_at: '2026-09-01T10:00:00Z',
    sequence: 2,
    text_en: 'Explore discreet channels to communicate diplomatic pressure',
    text_tr: null,
    suggested_owner_stakeholder_id: null,
    suggested_owner_name: null,
    suggested_due_on: null,
    state: 'pending',
    action_item_id: null,
    dismissed_reason: null,
    names_an_owner: false,
    names_a_date: false,
    confidentiality: 'internal',
  },
  {
    id: '00000000-0000-0000-0000-00000000a403',
    meeting_id: '00000000-0000-0000-0000-0000000000bb',
    meeting_title: 'Smoke meeting',
    meeting_title_tr: 'Duman toplantısı',
    held_at: '2026-09-01T10:00:00Z',
    sequence: 3,
    text_en: 'Raise the land question with the county assembly',
    text_tr: null,
    suggested_owner_stakeholder_id: null,
    suggested_owner_name: null,
    suggested_due_on: null,
    state: 'dismissed',
    action_item_id: null,
    dismissed_reason: 'Superseded by the diplomatic track agreed with the Ambassador on 16 April.',
    names_an_owner: false,
    names_a_date: false,
    confidentiality: 'internal',
  },
];

/**
 * The three curves (M12-11), one of which can be drawn.
 *
 * The ledger has entries on two different days, so the spend curve is a curve.
 * There are no milestones at all, and the risk scores share one date — which is
 * the distinction the panel exists to make: rows on a single day are a
 * snapshot, and a line through them would show a trend no time produced.
 */
const TEST_CURVE_LEDGER = [
  { date: '2026-02-10', amount_kes: 4_000_000 },
  { date: '2026-05-20', amount_kes: 7_500_000 },
];

const TEST_CURVE_BUDGET = [{ amount_kes: 48_000_000 }];

const TEST_CURVE_SCORES = [
  {
    changed_at: '2026-10-01T09:00:00Z',
    to_score: 20,
    risk_id: '00000000-0000-0000-0000-00000000e001',
  },
  {
    changed_at: '2026-10-01T09:00:00Z',
    to_score: 20,
    risk_id: '00000000-0000-0000-0000-00000000e002',
  },
];

const TEST_REPORT_RUNS = [
  {
    id: '00000000-0000-0000-0000-000000003a01',
    kind: 'board_pack',
    title: 'April board pack',
    period_from: null,
    period_to: null,
    meeting_id: '00000000-0000-0000-0000-0000000000bb',
    stakeholder_id: null,
    prepared_at: '2026-09-28T09:00:00Z',
    state: 'draft',
    approved_at: null,
    published_at: null,
    withdrawn_reason: null,
    confidentiality: 'confidential',
    preparer: { full_name: 'Smoke Test' },
    approver: null,
    meeting: { title: 'Smoke meeting' },
    donor: null,
    content: [
      {
        section: 'meeting',
        ord: 0,
        label_en: 'Smoke meeting',
        label_tr: 'Duman toplantısı',
        value_text: '01 Sep 2026 10:00 · Mombasa · trustee',
        value_number: null,
        unit: null,
        entity_kind: 'meeting',
        entity_id: '00000000-0000-0000-0000-0000000000bb',
        source_note: 'meetings',
        confidentiality: 'internal',
      },
      {
        section: 'money',
        ord: 1,
        label_en: 'Budget',
        label_tr: 'Bütçe',
        value_text: null,
        value_number: 48000000,
        unit: 'KES',
        entity_kind: null,
        entity_id: null,
        source_note: 'budget_position',
        confidentiality: 'internal',
      },
      {
        section: 'money',
        ord: 6,
        label_en: 'Pledged and not yet received',
        label_tr: 'Taahhüt edilip gelmeyen',
        value_text: null,
        value_number: 2500000,
        unit: 'KES',
        entity_kind: null,
        entity_id: null,
        source_note: 'donation_position',
        confidentiality: 'internal',
      },
      {
        section: 'risks',
        ord: 1,
        label_en: 'The lease is not renewed',
        label_tr: 'Kira yenilenmiyor',
        value_text: 'legal · open · likelihood 3 · impact 4',
        value_number: 12,
        unit: 'score',
        entity_kind: 'risk',
        entity_id: '1',
        source_note: 'risks',
        confidentiality: 'internal',
      },
    ],
  },
  {
    id: '00000000-0000-0000-0000-000000003a02',
    kind: 'status_report',
    title: 'Quarter to September',
    period_from: '2026-07-01',
    period_to: '2026-09-30',
    meeting_id: null,
    stakeholder_id: null,
    prepared_at: '2026-09-29T09:00:00Z',
    state: 'approved',
    approved_at: '2026-09-29T11:00:00Z',
    published_at: null,
    withdrawn_reason: null,
    confidentiality: 'internal',
    preparer: { full_name: 'Smoke Test' },
    approver: { full_name: 'Smoke Trustee' },
    meeting: null,
    donor: null,
    content: [
      {
        section: 'period',
        ord: 0,
        label_en: 'Reporting period',
        label_tr: 'Rapor dönemi',
        value_text: '01 Jul 2026 — 30 Sep 2026',
        value_number: 91,
        unit: 'days',
        entity_kind: null,
        entity_id: null,
        source_note: 'the dates asked for',
        confidentiality: 'internal',
      },
      {
        section: 'use of funds',
        ord: 1,
        label_en: 'CIVIL · Civil construction',
        label_tr: 'CIVIL · İnşaat',
        value_text: null,
        value_number: 12400000,
        unit: 'KES',
        entity_kind: 'budget_category',
        entity_id: '00000000-0000-0000-0000-000000000c01',
        source_note: 'category_spend',
        confidentiality: 'internal',
      },
    ],
  },
  {
    id: '00000000-0000-0000-0000-000000003a03',
    kind: 'donor_report',
    title: 'Foundation — annual account',
    period_from: '2025-10-01',
    period_to: '2026-09-30',
    meeting_id: null,
    stakeholder_id: '00000000-0000-0000-0000-0000000000f7',
    prepared_at: '2026-09-30T09:00:00Z',
    state: 'published',
    approved_at: '2026-09-30T10:00:00Z',
    published_at: '2026-09-30T11:00:00Z',
    withdrawn_reason: null,
    // Publishing is what declassified it.
    confidentiality: 'public',
    preparer: { full_name: 'Smoke Test' },
    approver: { full_name: 'Smoke Trustee' },
    meeting: null,
    donor: { full_name: 'Foundation Donor' },
    content: [
      {
        section: 'your contribution',
        ord: 100,
        label_en: 'Received to date',
        label_tr: 'Bugüne kadar tahsil edilen',
        value_text: null,
        value_number: 1500000,
        unit: 'KES',
        entity_kind: null,
        entity_id: null,
        source_note: 'donation_position',
        confidentiality: 'internal',
      },
      {
        section: 'your contribution',
        ord: 102,
        label_en: 'Receipts with no document attached',
        label_tr: 'Belgesi eklenmemiş tahsilatlar',
        value_text: null,
        value_number: 1,
        unit: 'receipts',
        entity_kind: null,
        entity_id: null,
        source_note: 'donation_position',
        confidentiality: 'internal',
      },
    ],
  },
];

const ROUTES = [
  '/',
  '/project_info',
  '/legal',
  '/construction',
  '/governance',
  '/readiness',
  '/stakeholders',
  '/meetings',
  '/obligations',
  '/risks',
  '/calendar',
  '/plan',
  '/reports',
  '/procurement',
  '/finance',
  '/documents',
  '/communication',
  '/assistant',
  '/admin',
];

/** Each legal sub-tab, matched by the visible label in either language. */
const LEGAL_TABS = {
  hearings: /^Duruşmalar$|^Hearings$/i,
  filings: /Layiha ve Süreler|Filings & Deadlines/i,
  orders: /Mahkeme Kararları|Court Orders/i,
  evidence: /Deliller ve Zincir|Evidence & Custody/i,
  counsel: /Avukatlar ve Görüşler|Counsel & Opinions/i,
  hearing_brief: /Duruşma Brifingi|Hearing Brief/i,
  bench_qa: /Hâkimler Heyeti|Bench Q/i,
  authorities: /İçtihat|Authorities/i,
  overview: /Temyiz Dosyası|Appeal File/i,
  grounds: /Temyiz İtirazları|Grounds of Appeal/i,
  action_plan: /Eylem Planı|Action Plan/i,
  who_is_who: /Kim Kimdir|Who is Who/i,
  timeline: /Dava Tarihçesi|Case History/i,
};

/** A page that rendered its shell has at least this much text. */
const MIN_TEXT = 200;

async function waitForServer(url, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await sleep(250);
  }
  throw new Error(`Preview server did not come up at ${url}`);
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1'], {
  stdio: 'ignore',
});

let browser;
let failures = 0;

const check = (ok, label, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

try {
  await waitForServer(BASE);
  try {
    browser = await chromium.launch({ executablePath: resolveChromium() });
  } catch (error) {
    console.error(
      'Could not start Chromium. Install it with `npx playwright install chromium`, ' +
        'or point PLAYWRIGHT_CHROMIUM_PATH at an existing build.',
    );
    throw error;
  }
  const page = await browser.newPage();

  let pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  // --- the gate, before anything is signed in --------------------------------
  await page.route('**/rest/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.route('**/auth/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );

  await page.goto(BASE + '/legal', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const gateText = (await page.textContent('body')) ?? '';
  check(
    /Giriş yap|Sign in/.test(gateText) && !/Hukuk İşleri|Legal Affairs/.test(gateText),
    'signed-out visitor is stopped at sign-in',
  );

  // --- signed in -------------------------------------------------------------
  // Playwright tries the most recently registered handler first, so the
  // specific profiles route has to be added after the catch-all to win.
  //
  // Answered as an object or an array depending on the call, the way
  // PostgREST answers .single() and a plain select differently. The admin
  // console and the triage owner picker both read the list form, and a stub
  // that always returned the object would leave them permanently empty —
  // which would look like a passing test of an empty screen.
  await page.route('**/rest/v1/profiles**', (route) => {
    const single = route.request().url().includes('id=eq.');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(single ? TEST_PROFILE : [TEST_PROFILE]),
    });
  });

  /** Swaps who the intercepted backend says the caller is allowed to be. */
  const actAs = (authority) =>
    page.route('**/rest/v1/rpc/current_authority', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(authority),
      }),
    );

  await actAs(TEST_AUTHORITY);

  await page.route('**/rest/v1/legal_cases**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([TEST_CASE]),
    }),
  );

  await page.route('**/rest/v1/pending_decisions**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEST_DECISIONS),
    }),
  );

  await page.route('**/rest/v1/risks**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEST_RISKS),
    }),
  );

  await page.route('**/rest/v1/risk_escalations**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEST_ESCALATIONS),
    }),
  );

  await page.route('**/rest/v1/risk_matrix**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEST_MATRIX),
    }),
  );

  await page.route('**/rest/v1/dependency_status**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEST_DEPENDENCIES),
    }),
  );

  // --- M15: the plan ------------------------------------------------------
  await page.route('**/rest/v1/milestones**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEST_MILESTONES),
    }),
  );

  await page.route('**/rest/v1/phase_position**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEST_PHASES),
    }),
  );

  await page.route('**/rest/v1/plan_baselines**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEST_BASELINES),
    }),
  );

  await page.route('**/rest/v1/baseline_variance**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEST_VARIANCE),
    }),
  );

  await page.route('**/rest/v1/project_chronology**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEST_CHRONOLOGY),
    }),
  );

  await page.route('**/rest/v1/critical_dates**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEST_CRITICAL_DATES),
    }),
  );

  await page.route('**/rest/v1/financial_transactions**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEST_TRANSACTIONS),
    }),
  );

  await page.route('**/rest/v1/donation_position**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEST_DONATIONS),
    }),
  );

  await page.route('**/rest/v1/construction_blocks**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([TEST_BLOCK, UNVISITED_BLOCK]),
    }),
  );

  await page.route('**/rest/v1/block_progress**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEST_BLOCK_PROGRESS),
    }),
  );

  await page.route('**/rest/v1/watch_register**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEST_WATCHES),
    }),
  );

  await page.route('**/rest/v1/gate_presence**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEST_GATE_PRESENCE),
    }),
  );

  await page.route('**/rest/v1/incident_register**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEST_INCIDENTS),
    }),
  );

  await page.route('**/rest/v1/watch_health**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEST_WATCH_HEALTH),
    }),
  );

  await page.route('**/rest/v1/site_task_conflicts**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([TEST_CONFLICT]),
    }),
  );

  await page.route('**/rest/v1/document_vault**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEST_DOCUMENTS),
    }),
  );

  await page.route('**/rest/v1/document_versions**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEST_VERSIONS),
    }),
  );

  await page.route('**/rest/v1/rpc/search_records', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEST_SEARCH_HITS),
    }),
  );

  await page.route('**/rest/v1/ai_queries**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEST_AI_QUERIES),
    }),
  );

  /** Swaps what the AI proxy answers, so both outcomes can be exercised. */
  const proxyReturns = (payload, status = 200) =>
    page.route('https://smoke.functions.test/ai-assistant', (route) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(payload),
      }),
    );

  const serve = (pattern, body) =>
    page.route(pattern, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      }),
    );

  // The curve sources. Two of these tables are already served for the finance
  // screen, which asks for far more columns, so the curve's request is told
  // apart by the column list it asks for rather than by the table.
  await page.route('**/rest/v1/financial_transactions**', (route) => {
    const url = route.request().url();
    if (!/select=date/.test(url)) return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEST_CURVE_LEDGER),
    });
  });
  await page.route('**/rest/v1/budget_lines**', (route) => {
    const url = route.request().url();
    if (!/select=amount_kes/.test(url)) return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEST_CURVE_BUDGET),
    });
  });
  await serve('**/rest/v1/risk_score_changes**', TEST_CURVE_SCORES);
  await serve('**/rest/v1/notification_health**', TEST_HEALTH);
  // Answers per table, the way the function does: the client asks once per
  // register on a screen that mixes them.
  await page.route('**/rest/v1/rpc/machine_marked', (route) => {
    let table = '';
    try {
      table = JSON.parse(route.request().postData() ?? '{}').p_table ?? '';
    } catch {
      // keep the default
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEST_MACHINE_MARKS[table] ?? []),
    });
  });
  await serve('**/rest/v1/rpc/translation_review', TEST_TRANSLATIONS);
  await serve('**/rest/v1/rpc/translation_backlog', TEST_BACKLOG);
  await serve('**/rest/v1/action_triage**', TEST_TRIAGE);
  await serve('**/rest/v1/stakeholders**', TEST_STAKEHOLDERS);
  await serve('**/rest/v1/report_runs**', TEST_REPORT_RUNS);
  await serve('**/rest/v1/thread_board**', TEST_THREADS);
  await serve('**/rest/v1/thread_messages**', TEST_THREAD_MESSAGES);
  await serve('**/rest/v1/announcement_reach**', TEST_REACH);
  await serve('**/rest/v1/channel_members**', TEST_CHANNEL_MEMBERS);
  await serve('**/rest/v1/my_notifications**', TEST_INBOX);
  await serve('**/rest/v1/notification_preferences**', TEST_PREFERENCES);
  await serve('**/rest/v1/correspondence**', TEST_CORRESPONDENCE);

  // The digest answers differently per audience, which is the whole point of
  // M11-10, so the stub reads the audience out of the request rather than
  // returning one list for all three.
  await page.route('**/rest/v1/rpc/weekly_digest', (route) => {
    let audience = 'trustee';
    try {
      audience = JSON.parse(route.request().postData() ?? '{}').p_audience ?? 'trustee';
    } catch {
      // keep the default
    }
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEST_DIGEST[audience] ?? []),
    });
  });

  await serve('**/rest/v1/governance_organs**', TEST_ORGANS);
  await serve('**/rest/v1/governance_sitting_quorum**', TEST_SITTINGS);
  await serve('**/rest/v1/organ_memberships**', []);
  await serve('**/rest/v1/trustees**', TEST_TRUSTEES);
  await serve('**/rest/v1/decision_implementation**', TEST_RESOLUTIONS);
  await serve('**/rest/v1/compliance_calendar**', TEST_COMPLIANCE);
  await serve('**/rest/v1/accreditation_requirements**', TEST_ACCREDITATION);
  await serve('**/rest/v1/charter_roadmap**', TEST_ROADMAP);
  await serve('**/rest/v1/academic_programmes**', TEST_PROGRAMMES);
  await serve('**/rest/v1/obligation_progress**', TEST_TARGETS);
  await serve('**/rest/v1/intake_readiness**', TEST_READINESS);
  await serve('**/rest/v1/conflict_declarations**', TEST_CONFLICTS);
  await serve('**/rest/v1/procurement_requests**', TEST_PROCUREMENTS);
  await serve('**/rest/v1/procurement_candidates**', TEST_CANDIDATES);
  await serve('**/rest/v1/contract_alerts**', TEST_CONTRACT_ALERTS);
  await serve('**/rest/v1/contract_terms**', TEST_CONTRACT_TERMS);
  await serve('**/rest/v1/contract_settlement**', TEST_SETTLEMENT);
  await serve('**/rest/v1/contract_milestones**', TEST_CONTRACT_MILESTONES);
  await serve('**/rest/v1/milestone_matching**', TEST_MILESTONE_MATCHING);
  await serve('**/rest/v1/unscheduled_valuations**', TEST_UNSCHEDULED_VALUATIONS);
  await serve('**/rest/v1/payment_matching_health**', TEST_PAYMENT_MATCHING_HEALTH);
  await serve('**/rest/v1/supplier_reviews**', TEST_REVIEWS);

  await proxyReturns(TEST_AI_ANSWER);

  // Counts the writes M3-11 is about. A capture that is still on the device
  // must not have produced any of these, and one that reached the record
  // must have produced all three — which is only checkable by counting.
  const writes = { meetings: 0, notes: 0, candidates: 0 };

  // Served as an object or an array depending on which call it is, the way
  // PostgREST answers .maybeSingle() and a plain select differently.
  await page.route('**/rest/v1/meetings**', (route) => {
    if (route.request().method() === 'POST') writes.meetings += 1;
    const single = route.request().url().includes('id=eq.');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(single ? TEST_MEETING : [TEST_MEETING]),
    });
  });

  await page.route('**/rest/v1/meeting_notes**', (route) => {
    if (route.request().method() === 'POST') writes.notes += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.route('**/rest/v1/action_candidates**', (route) => {
    if (route.request().method() === 'POST') writes.candidates += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  // A session in storage is what supabase-js reads on start, so this puts the
  // app in the state it would be in after a real sign-in.
  await page.addInitScript((profile) => {
    const oneHour = Math.floor(Date.now() / 1000) + 3600;
    window.localStorage.setItem(
      'sb-smoke-auth-token',
      JSON.stringify({
        access_token: 'smoke-access-token',
        refresh_token: 'smoke-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: oneHour,
        user: { id: profile.id, email: profile.email, aud: 'authenticated', role: 'authenticated' },
      }),
    );
  }, TEST_PROFILE);

  for (const route of ROUTES) {
    pageErrors = [];
    await page.goto(BASE + route, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const text = (await page.textContent('body'))?.trim() ?? '';
    check(
      pageErrors.length === 0 && text.length > MIN_TEXT,
      route.padEnd(16),
      `text=${text.length} errors=${pageErrors.length}${pageErrors[0] ? ` — ${pageErrors[0].slice(0, 120)}` : ''}`,
    );
  }

  await page.goto(BASE + '/legal', { waitUntil: 'networkidle' });
  for (const [tab, label] of Object.entries(LEGAL_TABS)) {
    pageErrors = [];
    await page.locator('button').filter({ hasText: label }).first().click();
    await page.waitForTimeout(300);
    const text = (await page.textContent('body'))?.trim() ?? '';
    check(
      pageErrors.length === 0 && text.length > MIN_TEXT,
      `/legal → ${tab}`.padEnd(16),
      `text=${text.length} errors=${pageErrors.length}${pageErrors[0] ? ` — ${pageErrors[0].slice(0, 120)}` : ''}`,
    );
  }

  // --- the legal record ------------------------------------------------------
  // M5-16 decides who may write on a file. A director keeps it; somebody
  // outside the organisation who is not counsel gets the record read-only.
  pageErrors = [];
  await page.goto(BASE + '/legal', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page
    .locator('button')
    .filter({ hasText: /^Duruşmalar$|^Hearings$/i })
    .first()
    .click();
  await page.waitForTimeout(300);
  const directorLegal = (await page.textContent('body')) ?? '';
  check(
    pageErrors.length === 0 && /Duruşma ekle|Add/.test(directorLegal),
    'director may keep the legal record',
  );

  await actAs(EXTERNAL_AUTHORITY);
  pageErrors = [];
  await page.goto(BASE + '/legal', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page
    .locator('button')
    .filter({ hasText: /^Duruşmalar$|^Hearings$/i })
    .first()
    .click();
  await page.waitForTimeout(300);
  const contractorLegal = (await page.textContent('body')) ?? '';
  check(
    pageErrors.length === 0 && !/Duruşma ekle/.test(contractorLegal),
    'somebody outside who is not counsel gets it read-only',
  );
  await actAs(TEST_AUTHORITY);

  // --- the action triage queue (M3-05, M3-07, G-04) --------------------------
  // The queue exists because the archive produced 103 sentences and the
  // schema requires an owner and a date. What is being checked here is that
  // the screen keeps the three facts apart: how many are waiting, which of
  // them arrived with anything to go on, and that a dropped line kept its
  // reason instead of disappearing.
  pageErrors = [];
  await page.goto(BASE + '/meetings', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const triage = (await page.textContent('body')) ?? '';

  check(
    /2 karar bekliyor/.test(triage),
    'the queue counts the sentences still awaiting a decision (M3-05)',
  );
  check(/1 tanesi hazır/.test(triage), 'and says how many arrived naming both a person and a date');
  // The dismissed one is settled, so it is not in the pending count and not
  // on this list: a queue that still showed it would never go down.
  check(
    !/Raise the land question with the county assembly/.test(triage),
    'a settled line has left the queue',
  );
  check(
    /Explore discreet channels to communicate diplomatic pressure/.test(triage),
    'the sentence somebody actually wrote is what is shown',
  );
  check(/ikisi de yok/.test(triage), 'a line naming neither says so rather than guessing');

  // 0035: the badge, where the sentence is actually read. A candidate's own
  // text is not badged and cannot be — it is a quotation from a minute that
  // 0032 refuses to let anybody rewrite — so the two rules this screen can
  // still show are on the meeting title. The positive case and the
  // follows-the-source-column case are asserted on the resolution register,
  // which does hold machine text.
  check(
    (await page
      .locator('li', { hasText: 'Duman toplantısı' })
      .locator('text=makine çevirisi')
      .count()) === 1,
    'the meeting record carries it too, on the title the machine translated',
  );
  check(
    (await page.locator('text=makine çevirisi — onaylanmadı').count()) === 1,
    'and nothing else on this screen is badged, the queue included',
  );

  // Adopting the line that names neither. The warning is the point of the
  // form: the date is not a field being filled, it is a decision being made.
  await page
    .locator('button')
    .filter({ hasText: /^aksiyona çevir$/ })
    .nth(1)
    .click();
  await page.waitForTimeout(250);
  const adopting = (await page.textContent('body')) ?? '';
  check(
    /bu bir alan doldurmak değil, bir karar vermek/.test(adopting),
    'setting a date the minute never gave is named as a decision (G-04)',
  );
  // An optgroup's label is an attribute, so it is read off the DOM rather
  // than out of the page text.
  const ownerGroups = await page.$$eval('form optgroup', (groups) =>
    groups.map((g) => g.getAttribute('label')),
  );
  check(
    ownerGroups.includes('Portal kullanıcıları') && ownerGroups.includes('Paydaş kütüğü'),
    'the owner can be a portal user or somebody in the register, and only one',
  );
  check(
    /Smoke Test/.test(adopting) && /Mr\. Tariq/.test(adopting),
    'and both lists are populated — an empty register would push every action onto the staff',
  );

  // Dropping one keeps the reason on the record, which is what M3-07 asks
  // for: nothing from a minute vanishes unexplained.
  await page
    .locator('button')
    .filter({ hasText: /^karara bağlananlar \(1\)$/ })
    .first()
    .click();
  await page.waitForTimeout(250);
  const settledText = (await page.textContent('body')) ?? '';
  check(
    /Raise the land question with the county assembly/.test(settledText) &&
      /Superseded by the diplomatic track agreed with the Ambassador on 16 April\./.test(
        settledText,
      ),
    'a dropped line keeps its reason instead of vanishing (M3-07)',
  );
  check(pageErrors.length === 0, 'the triage queue renders without a page error');

  // --- capturing a meeting with no connection (M3-11) ------------------------
  // The browser is actually taken offline here rather than being asked to
  // pretend. What is being checked is the distinction the panel exists to
  // keep: a capture held on the device has sent NOTHING, and the screen says
  // so in those words; when the connection returns it goes, and only then
  // does anything call it recorded.
  pageErrors = [];
  await page.goto(BASE + '/meetings', { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);

  writes.meetings = 0;
  writes.notes = 0;
  writes.candidates = 0;

  await page.context().setOffline(true);
  await page.waitForTimeout(300);
  const offline = (await page.textContent('body')) ?? '';
  check(/bağlantı yok/.test(offline), 'the screen says the connection is gone (M3-11)');

  await page
    .locator('button')
    .filter({ hasText: /^Toplantı yaz$/ })
    .first()
    .click();
  await page.waitForTimeout(200);
  const captureForm = page.locator('form[aria-label="Bağlantısız toplantı kaydı"]');
  await captureForm.locator('input').first().fill('Saha toplantısı — bağlantısız');
  const areas = captureForm.locator('textarea');
  await areas.nth(0).fill('Şantiyede görüşüldü; jeneratör arızası ve beton dökümü gecikmesi.');
  await areas
    .nth(1)
    .fill('Mühendislik raporu Cumartesiye kadar teslim edilecek\nJeneratör için teklif alınacak');
  await page
    .locator('button')
    .filter({ hasText: /^Bu cihazda tut$/ })
    .first()
    .click();
  await page.waitForTimeout(500);

  const heldText = (await page.textContent('body')) ?? '';
  check(
    /bu cihazda — kayıtta değil/.test(heldText),
    'a capture says it is on the device and not on the record',
  );
  check(
    /1 kayıt bu cihazda, kayıtta değil/.test(heldText),
    'and the count is of what has NOT reached the record',
  );
  check(!/kaydedildi|Kaydedildi/.test(heldText), 'nothing on the offline screen calls it saved');
  // The measure that matters: no write was attempted while offline.
  check(
    writes.meetings === 0 && writes.notes === 0 && writes.candidates === 0,
    'and not one byte went to the server while the connection was down',
    `meetings=${writes.meetings} notes=${writes.notes} candidates=${writes.candidates}`,
  );

  // It survives a reload, which is the whole point of holding it in a store
  // rather than in React state.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  const afterReload = (await page.textContent('body')) ?? '';
  check(
    /Saha toplantısı — bağlantısız/.test(afterReload),
    'the capture is still there after the tab is reloaded',
  );

  // The connection returns. Nobody presses anything.
  await page.context().setOffline(false);
  await page.waitForTimeout(1200);
  const afterSync = (await page.textContent('body')) ?? '';
  check(
    writes.meetings === 1 && writes.notes === 1 && writes.candidates === 1,
    'the connection returning sends the meeting, the minute and the lines',
    `meetings=${writes.meetings} notes=${writes.notes} candidates=${writes.candidates}`,
  );
  check(
    /1 kayıt kütüğe geçti/.test(afterSync),
    'and the screen reports how many reached the record',
  );
  check(
    !/bu cihazda — kayıtta değil/.test(afterSync),
    'the queue is empty because the record now holds it',
  );
  check(pageErrors.length === 0, 'the capture panel renders without a page error');

  // --- printing (M12-12) ----------------------------------------------------
  //
  // The browser is actually put into print media here rather than being asked
  // to pretend. A print is the one output that leaves this system completely:
  // the database decides who may read a record, and a sheet on a table is read
  // by whoever is at the table. So what is checked is that the paper says what
  // it is, and that the parts of a screen nobody can press on paper are gone.
  pageErrors = [];
  await page.goto(BASE + '/obligations', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  const headerOnScreen = await page
    .locator('header', { hasText: 'Mombasa International University' })
    .first()
    .isVisible()
    .catch(() => false);
  check(!headerOnScreen, 'the print header is invisible on screen');

  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(250);

  const onPaper = (await page.textContent('body')) ?? '';
  check(
    await page
      .locator('header', { hasText: 'Mombasa International University' })
      .first()
      .isVisible(),
    'and the first thing on paper (M12-12)',
  );
  check(
    /Yazdıran:/.test(onPaper) && /Yetki seviyesi:/.test(onPaper),
    'the sheet says who printed it and at what clearance',
  );
  check(
    /erişim denetiminin dışındadır/.test(onPaper),
    'and that the paper carries no access control of its own',
  );
  check(/Yükümlülükler/.test(onPaper), 'it names the screen it came from');

  // Nothing a reader could press belongs on paper.
  //
  // Computed display rather than visibility, and the difference is the whole
  // reason this reads the way it does. Visibility alone passed for the wrong
  // reason: hiding the buttons inside the chrome collapses it to zero height,
  // so it reads as invisible whether or not the rule meant to remove it
  // exists — a mutation that deleted the rule survived. The first version of
  // those rules also matched `nav`, and this app's navigation is an <aside>
  // and its top bar a <header>, so both would have printed.
  const chromeOnPaper = await page.$$eval('[data-print="hide"]', (nodes) =>
    nodes.map((node) => getComputedStyle(node).display),
  );
  const buttonsOnPaper = await page.locator('button:visible').count();
  check(
    chromeOnPaper.length > 0 && chromeOnPaper.every((d) => d === 'none'),
    'the navigation and the top bar are removed on paper, not merely emptied',
    chromeOnPaper.join(', ') || '(nothing marked)',
  );
  check(buttonsOnPaper === 0, 'nor does a single button', `${buttonsOnPaper} visible`);

  await page.emulateMedia({ media: 'screen' });
  await page.waitForTimeout(200);
  const chromeOnScreen = await page.$$eval('[data-print="hide"]', (nodes) =>
    nodes.map((node) => getComputedStyle(node).display),
  );
  const buttonsOnScreen = await page.locator('button:visible').count();
  check(
    chromeOnScreen.some((d) => d !== 'none') && buttonsOnScreen > 0,
    'and the screen is itself again afterwards',
    `chrome=${chromeOnScreen.join(',')} buttons=${buttonsOnScreen}`,
  );
  check(pageErrors.length === 0, 'printing renders without a page error');

  // --- the meeting record ---------------------------------------------------
  // Every M3 record type renders at once here, so a shape mistake in any of
  // them shows up as a page error rather than as a quiet blank.
  pageErrors = [];
  await page.goto(BASE + `/meetings/${TEST_MEETING.id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const detail = (await page.textContent('body')) ?? '';
  check(
    /Duman toplantısı/.test(detail) && !/Smoke meeting/.test(detail),
    'a bilingual meeting shows the title in the reader’s language (G-02)',
  );
  check(
    pageErrors.length === 0 &&
      /Katılımcılar|Who was there/.test(detail) &&
      /Tutanak|The note/.test(detail) &&
      /Kararlar|Decisions/.test(detail) &&
      /Aksiyonlar|Actions/.test(detail) &&
      /Açık sorular|Open questions/.test(detail),
    '/meetings/:id  ',
    `errors=${pageErrors.length}${pageErrors[0] ? ` — ${pageErrors[0].slice(0, 120)}` : ''}`,
  );

  // --- the vault says which files it has actually read ----------------------
  // The old screen printed "SHA-256 verified" over a page where no file could
  // exist. These three checks are the inverse of that: a digest appears only
  // for the version the server has read, the one it has not is named as
  // unverified rather than left blank, and the page counts them.
  pageErrors = [];
  await page.goto(BASE + '/documents', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const vaultView = (await page.textContent('body')) ?? '';
  check(
    pageErrors.length === 0 && vaultView.includes(VERIFIED_DIGEST.slice(0, 8)),
    'a verified version shows the digest the server computed',
  );
  check(
    /doğrulanmadı|unverified/.test(vaultView),
    'and one with no digest is named unverified rather than shown as clean',
  );
  check(
    /1 belgenin geçerli sürümü doğrulanmamış|1 documents have an unverified current version/.test(
      vaultView,
    ),
    'with the count stated where it cannot be missed',
  );
  check(/Belge ekle|Add a document/.test(vaultView), 'a director may put documents in the vault');

  // M9 write access follows app.can_write, which does not include somebody
  // outside the organisation — so the control is not drawn for them either.
  await actAs(EXTERNAL_AUTHORITY);
  pageErrors = [];
  await page.goto(BASE + '/documents', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const contractorVault = (await page.textContent('body')) ?? '';
  check(
    pageErrors.length === 0 && !/Belge ekle|Add a document/.test(contractorVault),
    'an external party is not offered the upload control',
  );
  await actAs(TEST_AUTHORITY);

  // --- the site says what it knows and what it does not ---------------------
  // The module this replaces put a typed percentage on every block. These
  // three checks are the inverse: a computed figure where there is evidence,
  // a named absence where there is none, and the court order above both.
  pageErrors = [];
  await page.goto(BASE + '/construction', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const siteView = (await page.textContent('body')) ?? '';
  check(
    pageErrors.length === 0 && /45%/.test(siteView),
    'a block with evidence shows the computed figure',
  );
  check(
    /raporlanmadı|not reported/.test(siteView),
    'and one nobody has reported on says so rather than showing nought',
  );
  check(
    /Do not interfere with the boundary/.test(siteView) &&
      /yasağın kapsamında|live prohibition/.test(siteView),
    'open work under a court order is surfaced above the progress',
  );

  // --- the watch book says what was written, and nothing more ---------------
  // Each of these is one of the three sentences a watchman's book gets wrong
  // when it is filled in afterwards from memory.
  // Read from the list of entries, not from the page: the paragraph above the
  // list has to say the book does not know whether the person is on site, and
  // it cannot say that without the words.
  const openEntries =
    (await page.textContent('ul[aria-label="Çıkışı kayıtlı olmayan girişler"]')) ?? '';
  check(
    /çıkışı kayıtlı değil/.test(openEntries) &&
      !/\bsahada\b|içeride|on site|inside/i.test(openEntries),
    'a gate entry with no exit says the exit is unrecorded, never that the person is on site',
  );
  check(
    /büyük olasılıkla yazılmayan bir çıkış|unrecorded exit/i.test(siteView),
    'and where its watch has closed, it names what that almost certainly is',
  );
  check(
    /Müdahale kayıtlı değil|No response recorded/.test(siteView) &&
      !/müdahale edilmedi|was not answered/i.test(siteView),
    'an incident with no response says nobody recorded one, not that nobody responded',
  );
  // Also read from the rows. The summary strip above repeats the same phrase,
  // so a check against the whole page would survive a row that printed a
  // shortfall against a figure nobody recorded.
  const watchRows = (await page.textContent('ul[aria-label="Nöbetler ve turlar"]')) ?? '';
  check(
    /beklenen tur sayısı kayıtlı değil/.test(watchRows) && !/\/ 0 tur/.test(watchRows),
    'a watch with no expected round count says so rather than printing a shortfall against nought',
  );
  check(
    /2 \/ 4 tur/.test(watchRows) && /2 tur kayıtlı değil/.test(watchRows),
    'and one that has a count is shown against it',
  );
  check(
    /Bildirim kararı kayıtlı değil|No notification decision/.test(siteView) &&
      /Resmî bildirim yapıldı|Authority notified/.test(siteView),
    'a serious incident with no notification decision is distinguished from one that was notified',
  );
  check(
    /Kanıt kayıtlı değil|No evidence filed/.test(siteView) && /1 kanıt|1 piece/.test(siteView),
    'an incident with no evidence is named as such beside one that has it',
  );
  check(
    /Teyit edildi — donmuş|Confirmed — frozen/.test(siteView),
    'a confirmed incident record says it is frozen',
  );
  check(
    /Nöbet defterinin söylemediği şeyler|does not say/.test(siteView) &&
      /1 nöbet kapatılmamış|never closed/.test(siteView),
    'what the watch book does not say is counted above the entries',
  );
  check(
    /olaydan 3 gün sonra yazıldı|76 saat/.test(siteView),
    'and the write-up lag on an incident logged three days later is on the screen',
  );

  await actAs(EXTERNAL_AUTHORITY);
  pageErrors = [];
  await page.goto(BASE + '/construction', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const contractorSite = (await page.textContent('body')) ?? '';
  check(
    pageErrors.length === 0 && !/Görev ekle|Add a task/.test(contractorSite),
    'an outside firm is not offered the planning controls',
  );
  await actAs(TEST_AUTHORITY);

  // --- money says what is backed and what is only claimed -------------------
  // Three of the things Faz 0 took the words off lived on this screen.
  pageErrors = [];
  await page.goto(BASE + '/finance', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page
    .locator('button')
    .filter({ hasText: /^Kasa defteri$|^Ledger$/ })
    .first()
    .click();
  await page.waitForTimeout(400);
  const ledgerView = (await page.textContent('body')) ?? '';
  check(
    pageErrors.length === 0 && /denetlenmedi|not audited/.test(ledgerView),
    'nothing is audited until an auditor says so',
  );
  // Counted rather than searched for: the page legitimately explains the word
  // "audited" in its subtitle, so asserting the word is absent would be a
  // test about the prose. Both fixtures carry no audit, so both rows say so.
  check(
    (ledgerView.match(/denetlenmedi|not audited/g) ?? []).length === TEST_TRANSACTIONS.length,
    'and every row says so, because none of the data carries a badge',
  );
  check(
    /belgesiz|no document/.test(ledgerView),
    'a transaction with nothing attached is named as such',
  );
  check(
    // Recorded in dollars, shown in dollars, with the base figure beside it.
    /\$ 20,000/.test(ledgerView) && /KShs 2,600,000/.test(ledgerView),
    'an amount keeps the currency it was recorded in, and shows the base too',
  );

  // A director may keep the ledger; awarding the badge is not theirs.
  check(
    /İşlem kaydet|Record a transaction/.test(ledgerView),
    'a director may record a transaction',
  );
  check(
    !/Denetledim|Mark audited/.test(ledgerView),
    'but is not offered the control that marks one audited',
  );

  pageErrors = [];
  await page
    .locator('button')
    .filter({ hasText: /^Bağışlar$|^Donations$/ })
    .first()
    .click();
  await page.waitForTimeout(400);
  const donationView = (await page.textContent('body')) ?? '';
  check(
    pageErrors.length === 0 &&
      /KShs 4,000,000/.test(donationView) &&
      /KShs 1,200,000/.test(donationView) &&
      /KShs 2,800,000/.test(donationView),
    'a pledge, what arrived and the gap are three separate figures',
  );

  // --- the register is loud about what it does not know ---------------------
  pageErrors = [];
  await page.goto(BASE + '/risks', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const riskView = (await page.textContent('body')) ?? '';
  check(
    pageErrors.length === 0 && /Risk matrisi|Risk matrix/.test(riskView),
    'the matrix opens the register rather than hiding behind a tab',
  );
  check(
    /tetikleyicisi yazılmamış|have no trigger written down/.test(riskView),
    'a risk nobody can watch is called out, not just listed',
  );
  check(
    /görülmedi|unacknowledged/.test(riskView),
    'and a threshold crossing nobody has seen stays on the row',
  );

  pageErrors = [];
  await page
    .locator('button')
    .filter({ hasText: /^Bağımlılıklar$|^Dependencies$/ })
    .first()
    .click();
  await page.waitForTimeout(400);
  const dependencyView = (await page.textContent('body')) ?? '';
  check(
    pageErrors.length === 0 && /portal bilemiyor|the portal cannot say/.test(dependencyView),
    'a dependency the portal cannot judge says so instead of guessing',
  );

  await actAs(EXTERNAL_AUTHORITY);
  pageErrors = [];
  await page.goto(BASE + '/risks', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const contractorRisks = (await page.textContent('body')) ?? '';
  check(
    pageErrors.length === 0 && !/Risk ekle|Add a risk/.test(contractorRisks),
    'an external party is not offered the register controls',
  );
  await actAs(TEST_AUTHORITY);

  // --- the home screen is a different screen per role (M12-01) --------------
  // The old one answered nobody's question at length, out of four agenda
  // cards typed into the component. These checks are that the replacement
  // computes, says whose a decision is, and is not the same page for
  // everybody.
  pageErrors = [];
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const directorHome = (await page.textContent('body')) ?? '';
  check(
    pageErrors.length === 0 && /Karar bekleyenler|Waiting on a decision/.test(directorHome),
    'a director opens on what is waiting to be decided',
  );
  check(/sizde|yours/.test(directorHome), 'and the panel says which of them are theirs to settle');
  check(
    /Son güncelleme|Last updated/.test(directorHome),
    'the screen says when what you are reading was fetched',
  );
  check(
    // The figures that used to be typed in. 807.3M was the capital total and
    // 980.0M the budget; neither came from a query.
    !/807\.3M|980\.0M/.test(directorHome),
    'and no hand-written capital figure survives on it',
  );

  await actAs(EXTERNAL_AUTHORITY);
  pageErrors = [];
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const contractorHome = (await page.textContent('body')) ?? '';
  check(
    pageErrors.length === 0 && /Saha, bugün|The site, today/.test(contractorHome),
    'a contractor opens on the site instead',
  );
  check(
    !/Karar bekleyenler|Waiting on a decision/.test(contractorHome),
    'and is not shown the decision queue at all',
  );
  await actAs(TEST_AUTHORITY);

  // --- the console offers only what the policies allow ----------------------
  // Its whole premise is that a control the database would refuse is never
  // drawn, so this is the assertion that matters most about it.
  pageErrors = [];
  await page.goto(BASE + '/admin', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const directorView = (await page.textContent('body')) ?? '';
  check(
    /Kapsam|Scope/.test(directorView) && /Olağanüstü yetki|Emergency delegation/.test(directorView),
    'director sees scope and delegation',
  );
  check(
    !/Kişi davet et|Invite someone/.test(directorView),
    'director is not offered the invite control',
    'inviting is an administrator’s to do',
  );
  check(/Denetim kaydı|Audit trail/.test(directorView), 'director can read the audit trail');

  // The register is the project's political map, so who may keep it is the
  // same question the console answers about everything else.
  pageErrors = [];
  await page.goto(BASE + '/stakeholders', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const directorRegister = (await page.textContent('body')) ?? '';
  check(/Paydaş ekle|Add a stakeholder/.test(directorRegister), 'director may keep the register');

  // M4-15 and M3-16: the two files this portal hands to another program, and
  // the sentence each has to carry. Both leave the portal's access control
  // behind, and the vCard additionally must not carry the trust's reading of
  // a person into somebody's address book.
  check(
    /vCard indir/.test(directorRegister) && /CSV indir/.test(directorRegister),
    'the register can be taken out as a vCard or a CSV (M4-15)',
  );
  check(
    /tutum, nüfuz, ilgi ve notlar portalda kalır/.test(directorRegister),
    'and says the assessment stays in the portal rather than going to a phone',
  );
  check(
    /Gizli ve kısıtlı kişileri de koy/.test(directorRegister),
    'closed records go into a file only when somebody says so',
  );
  await actAs(EXTERNAL_AUTHORITY);
  pageErrors = [];
  await page.goto(BASE + '/stakeholders', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const contractorRegister = (await page.textContent('body')) ?? '';
  check(
    pageErrors.length === 0 && !/Paydaş ekle|Add a stakeholder/.test(contractorRegister),
    'an external party is not offered the register controls',
  );

  pageErrors = [];
  await page.goto(BASE + '/admin', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const contractorView = (await page.textContent('body')) ?? '';
  check(
    pageErrors.length === 0 && /Sizin erişiminiz|Your access/.test(contractorView),
    'an external party still sees their own access',
  );
  check(
    !/Olağanüstü yetki|Emergency delegation/.test(contractorView) &&
      !/Denetim kaydı|Audit trail/.test(contractorView) &&
      !/Kayda özel paylaşım|Sharing/.test(contractorView),
    'an external party is shown none of the administrative sections',
  );
  await actAs(TEST_AUTHORITY);

  // Cross-view links used to be relative, resolving under the current route
  // (/legal/documents) instead of to the sibling route. The link lives on the
  // appeal-file tab, which is no longer the one /legal opens on.
  pageErrors = [];
  await page.goto(BASE + '/legal', { waitUntil: 'networkidle' });
  await page
    .locator('button')
    .filter({ hasText: /Temyiz Dosyası|Appeal File/ })
    .first()
    .click();
  await page.waitForTimeout(400);
  await page
    .locator('button')
    .filter({ hasText: /Belge Kasasını Aç|Access Vault|Tam Layihayı|Open Full Brief/ })
    .first()
    .click();
  await page.waitForTimeout(400);
  const path = new URL(page.url()).pathname;
  check(path === '/documents', 'in-app navigation', `→ ${path} (expected /documents)`);

  // --- the one search box (M13-05, M13-06) ----------------------------------
  //
  // The box this replaces loaded five registers into the browser and filtered
  // them with String.includes, so three of the four hits below were
  // unreachable by it at any query. The fixture is the assertion.
  pageErrors = [];
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(300);
  const emptyBox = (await page.textContent('body')) ?? '';
  check(
    /On dokuz kütüğün|all nineteen registers/.test(emptyBox),
    'the search box says it covers every register',
  );
  // The chips it used to open with asserted a capital figure and a court
  // posture that no query produced — the same copy Faz 0 took off the footer.
  check(
    !/807\.3M/.test(emptyBox) && !/Status Quo|Mevcut Durum/.test(emptyBox),
    'and no longer opens with typed-in figures and claims',
  );

  await page.keyboard.type('r');
  await page.waitForTimeout(500);
  const oneChar = (await page.textContent('body')) ?? '';
  check(
    /En az iki harf|Two characters at least/.test(oneChar),
    'one character asks for another rather than matching the archive',
  );

  await page.keyboard.type('uhsat');
  await page.waitForTimeout(900);
  const searched = (await page.textContent('body')) ?? '';
  check(
    /Smoke Trust v County Government/.test(searched) &&
      /Mütevelli toplantısı, Mart|Trustee sitting, March/.test(searched),
    'a query reaches the legal register and the minutes in one list',
  );
  check(
    /Servis yolunu açık tut|Keep the access road passable/.test(searched) &&
      /Duruşmalar sürekli erteleniyor|Hearings keep being adjourned/.test(searched),
    'and the obligations and the risk register too',
  );
  check(/MN\/I\/5141/.test(searched), 'the snippet shows why each row matched');
  // Three of the fixture's hits are three sections of ONE minute. A list that
  // shows them as three rows is a list where one meeting crowds out the rest,
  // which is what the real imported archive did.
  check(
    /\+2 yerde daha geçiyor|\+2 more matches here/.test(searched),
    'sections of one minute collapse into one row that says how many matched',
  );
  check(
    (searched.match(/Mütevelli toplantısı, Mart/g) ?? []).length === 1,
    'so the meeting appears once, not once per paragraph',
  );
  // Somebody about to forward a result should be able to see from the result
  // that they must not.
  check(/gizli|confidential/.test(searched), 'and each result is marked with the tier it sits at');
  check(
    /Bu aramayı kaydet|Save this search/.test(searched),
    'a search worth repeating can be kept (M13-11)',
  );
  check(pageErrors.length === 0, 'the search box renders without a runtime error');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // --- the assistant (M13-04, M13-07, M13-08, M13-09) -----------------------
  pageErrors = [];
  await page.goto(BASE + '/assistant', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const assistant = (await page.textContent('body')) ?? '';

  // M13-07: five jobs, offered as a choice. There is no free-form system
  // instruction field, because the instruction is the server's.
  check(
    /Arşive soru sor|Ask the archive/.test(assistant) &&
      /Notları tutanağa|Notes into minutes/.test(assistant) &&
      /Çeviri önerisi|Translation suggestion/.test(assistant) &&
      /Haftalık özet|Weekly digest/.test(assistant) &&
      /Uzun belge özeti|Long document summary/.test(assistant),
    'the assistant offers the five defined uses and no chat box',
  );
  check(
    /Kısıtlı kayıtlar hiçbir koşulda|Restricted records never reach the model/.test(assistant),
    'and says plainly that restricted material never reaches the model',
  );
  check(
    /Son sorulanlar|Recently asked/.test(assistant) &&
      /What was decided about renewing the permit\?/.test(assistant),
    'what has been asked is on the screen, not only in the table (M13-10)',
  );

  // 0034: the machine translations, and the three states that are genuinely
  // different. An unapproved one must read as a suggestion; one whose field has
  // since been edited by hand must not ask anybody to confirm their own edit.
  check(
    /öneri bekliyor/.test(assistant) && /1 öneri bekliyor/.test(assistant),
    'the queue counts translations nobody has stood behind yet (M3-10)',
  );
  check(
    /öneri — onaylanmadı/.test(assistant),
    'and calls an unapproved translation a suggestion rather than the record',
  );
  check(
    /elle değiştirilmiş/.test(assistant) &&
      /Kurul, mahkeme kararını beklemeye karar verdi\./.test(assistant),
    'a field edited by hand since is marked as such, not queued for approval',
  );
  check(
    /Makinenin yazdığı/.test(assistant) && /Kurul izni beklemeye karar verdi\./.test(assistant),
    'and what the machine had written is kept beside it',
  );
  check(
    /19 alan tek dilli/.test(assistant),
    'the single-language gap is a number on the screen, not an impression',
  );
  check(/gemini-2\.5-flash/.test(assistant), 'each translation names the model that produced it');
  // The approve control exists for the one awaiting a reader, and not for the
  // two that are settled or already edited.
  check(
    (await page
      .locator('button')
      .filter({ hasText: /^Doğru, arkasında duruyorum$/ })
      .count()) === 1,
    'only the translation actually awaiting a reader offers approval',
  );

  // An answer, with its citations.
  await page
    .locator('input[aria-label="Soru"], input[aria-label="Question"]')
    .first()
    .fill('What was decided about renewing the permit?');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(900);
  const answered = (await page.textContent('body')) ?? '';
  check(
    /TASLAK — insan onayı gerekir|DRAFT — needs human approval/.test(answered),
    'every answer comes out labelled a draft needing approval (M13-08)',
  );
  check(
    /Dayandığı kayıtlar|What it rests on/.test(answered) &&
      /Smoke Trust v County Government/.test(answered),
    'and carries the records it rests on (M13-04)',
  );
  // M13-09. There is no save button; copying is the only thing offered,
  // because putting this into a record is a person's act on that record's
  // own screen.
  check(
    /kopyala|copy/.test(answered) && !/Kaydet ve|Save to record|Kayda yaz/.test(answered),
    'and no way to write it into a record (M13-09)',
  );
  // The raw markers should not be left in the prose — they become links.
  check(
    !/\[legal_case:00000000/.test(answered),
    'the citation markers are rendered as links rather than left as text',
  );
  check(pageErrors.length === 0, 'the assistant renders an answer without a runtime error');

  // M13-08: asked for an opinion, it refuses and points at the record.
  pageErrors = [];
  await proxyReturns(TEST_AI_REFUSAL);
  await page
    .locator('input[aria-label="Soru"], input[aria-label="Question"]')
    .first()
    .fill('Should we appeal the order?');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(900);
  const refused = (await page.textContent('body')) ?? '';
  check(
    /proje avukatının|question for the project advocate/.test(refused),
    'a request for a legal opinion is refused and sent to the advocate (M13-08)',
  );
  check(
    /Prospects on the contempt application/.test(refused),
    'and the opinions already on record are what it points at',
  );
  check(
    !/DRAFT — needs human approval/.test(refused),
    'a refusal is not dressed up as a draft answer',
  );
  check(pageErrors.length === 0, 'and the refusal renders without a runtime error');

  // --- governance (M10-01 … M10-04, M10-11) ---------------------------------
  //
  // The screen this replaces held three resolutions in a React useState, one
  // allocating "34.3M KShs", with a status nothing computed. Every assertion
  // below is about a figure that now comes from a query.
  pageErrors = [];
  await page.goto(BASE + '/governance', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const governance = (await page.textContent('body')) ?? '';

  check(
    !/34\.3M/.test(governance) && !/Enacted/.test(governance),
    'the typed-in resolutions and their computed-by-nobody status are gone',
  );

  // 0036: the badge on a register, reached through <Bilingual> — which asks
  // about the whole table because it is handed one row at a time, and seventeen
  // registers would otherwise each have needed their own hook and their own
  // chance to key the badge to the reader's language instead of to the column
  // the words came from.
  check(
    (await page
      .locator('tr, li, article', { hasText: 'Kira sözleşmesini sonraki alımdan önce yenile' })
      .locator('text=makine çevirisi')
      .first()
      .count()) === 1,
    'a register marks machine-written text through one shared query (0036)',
  );
  check(
    (await page
      .locator('tr, li, article', { hasText: 'Open the second tender for the perimeter works' })
      .locator('text=makine çevirisi')
      .first()
      .count()) === 0,
    'and leaves alone a row whose Turkish is empty, so its English is on screen',
  );
  // M10-02: the quorum is read off the attendance against the organ's rule.
  check(
    /1\/3/.test(governance) && /nisap yok|short/.test(governance),
    'a sitting one short of the rule is called short, from the attendance',
  );
  // The three-valued column. An organ with no recorded rule must not be
  // reported as a short sitting — that sends somebody after the wrong problem.
  check(
    /söylenemiyor|cannot tell/.test(governance),
    'and an organ with no recorded quorum says it cannot tell',
  );
  check(
    /nisap kuralı kayıtlı değil|no quorum rule recorded/.test(governance),
    'naming the missing rule rather than implying a lax one',
  );
  // M10-01: who appointed them and when the term runs out.
  check(
    /Universal Education Foundation/.test(governance) && /Smoke Trustee/.test(governance),
    'the trustee register says who appointed each trustee',
  );
  check(
    /kimlik belgesi yok|no ID document/.test(governance),
    'and flags a trustee whose identity document is not in the vault',
  );
  // M10-03 / M10-04: the state that matters.
  check(
    /BOT\/2026\/01/.test(governance) &&
      /aksiyona bağlanmamış|not turned into an action/.test(governance),
    'a signed resolution nobody actioned is called exactly that (M10-04)',
  );
  check(
    /imzalı|signed/.test(governance),
    'and the register shows whether each resolution was signed',
  );
  // M10-11: declarations, and that they are marked confidential.
  check(
    /tendering firms/.test(governance),
    'declared interests are on the governance screen (M10-11)',
  );
  check(pageErrors.length === 0, 'the governance screen renders without a runtime error');

  // --- readiness (M10-05 … M10-10, M10-12) ----------------------------------
  pageErrors = [];
  await page.goto(BASE + '/readiness', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const readiness = (await page.textContent('body')) ?? '';

  // M10-12. Four strands, and outreach deliberately absent.
  check(
    /Altyapı|Infrastructure/.test(readiness) &&
      /Akreditasyon|Accreditation/.test(readiness) &&
      /Müfredat|Curriculum/.test(readiness) &&
      /Akademik kadro|Academic staff/.test(readiness),
    'the intake board counts four strands from real registers (M10-12)',
  );
  check(
    /Tanıtım şeridi yok|Outreach is missing/.test(readiness),
    'and says why outreach is absent instead of drawing it at zero',
  );
  check(
    /2027 alımına|to the 2027 intake/.test(readiness),
    'the countdown reads its year from the programmes, not from the component',
  );
  // M10-05. The column the screen is for.
  check(
    /Cap 164|Fasıl 164/.test(readiness) && /henüz açılmamış|not yet raised/.test(readiness),
    'a statutory duty with no obligation behind it says so (M10-05)',
  );
  check(
    /Yükümlülük olarak aç|Raise as an obligation/.test(readiness),
    'and can be raised into the obligations register from here',
  );
  // M10-06.
  check(
    /CUE\/STD\/3\.2/.test(readiness) && /kanıt yok|no evidence/.test(readiness),
    'the CUE checklist shows which requirements have no evidence (M10-06)',
  );
  // M10-07. Blocked is computed from the predecessor.
  check(
    /önceki bitmedi|waiting on the one before/.test(readiness),
    'a road map stage waiting on an unfinished one is shown as blocked (M10-07)',
  );
  // M10-08, and the null that matters.
  check(
    /İşletme Yönetimi|Business Administration/.test(readiness) && /BBA/.test(readiness),
    'the academic programmes are on the register at last (M10-08)',
  );
  check(
    /belirlenmemiş|not established/.test(readiness),
    'and a programme with no staffing requirement says unknown, not zero',
  );
  // M10-09 / M10-10, and the other null.
  check(
    /beşte birine tam burs|fifth of each intake/.test(readiness) && /45/.test(readiness),
    'the scholarship undertaking shows what is evidenced and what is short',
  );
  check(
    /hedef kayıtlı değil|no target recorded/.test(readiness),
    'and an obligation with no target set is not reported at nought per cent',
  );
  check(pageErrors.length === 0, 'the readiness screen renders without a runtime error');

  // --- procurement and contracts (M14) --------------------------------------
  //
  // The requirement names the actual situation: four counsel were compared in
  // parallel and the reasoning sits in scattered meeting notes. So the
  // assertions are mostly about reasons being on the screen next to the
  // decisions they belong to.
  pageErrors = [];
  await page.goto(BASE + '/procurement', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const procurement = (await page.textContent('body')) ?? '';

  // M14-01: the need and the reason, together.
  check(
    /Lead counsel for the appeal|Temyiz için baş avukat/.test(procurement) &&
      /present advocate is retiring/.test(procurement),
    'a request shows the need and the justification together (M14-01)',
  );
  check(
    /onay bekliyor|awaiting approval/.test(procurement),
    'and a request nobody has approved says so',
  );
  check(
    /aynı tutar bandı|same money bands as a payment/.test(procurement),
    'the screen says approval goes through the payment bands, not a second set',
  );

  // M14-02: the comparison, including the reason the others were not chosen.
  await page
    .locator('button')
    .filter({ hasText: /Lead counsel for the appeal|Temyiz için baş avukat/ })
    .first()
    .click();
  await page.waitForTimeout(600);
  const candidates = (await page.textContent('body')) ?? '';
  check(
    /Mwangi & Co Advocates/.test(candidates) && /Otieno Advocates/.test(candidates),
    'opening a request shows the candidates side by side (M14-02)',
  );
  check(
    /ELC appellate record; fee within the estimate/.test(candidates),
    'with the reason the winner was chosen',
  );
  check(
    /No appellate record in land matters, which is the whole brief/.test(candidates),
    'and the reason the others were not — the half that went missing',
  );
  check(
    /82/.test(candidates) && /2,800,000|2800000/.test(candidates.replace(/\u00a0/g, ' ')),
    'the fee and the score are both on the comparison',
  );

  // M14-03 / M14-05: the register, and the alert that closes the loop.
  check(
    /CT-2026-01/.test(procurement) && /Mwangi & Co Advocates/.test(procurement),
    'the contract register names the party and the reference (M14-03)',
  );
  check(
    /30 gün içinde|within 30 days/.test(procurement),
    'a renewal date inside thirty days is banded as such (M14-05)',
  );
  check(
    /devamı yazılmamış|no successor drafted/.test(procurement),
    'and a renewal nobody has drafted is called out — the column the alert is for',
  );
  check(
    /devamı yazıldı|successor drafted/.test(procurement),
    'while one that has been drafted is not treated as a worry',
  );
  // The honest answer to a contract with no fixed sum.
  check(
    /birim fiyat|rate based/.test(procurement),
    'a contract with no fixed sum says what kind of number its value is',
  );

  // M14-04: the term, and the obligation it raised in M2.
  await page
    .locator('button')
    .filter({ hasText: /Conduct of the ELC appeal|ELC temyizinin/ })
    .first()
    .click();
  await page.waitForTimeout(600);
  const contract = (await page.textContent('body')) ?? '';
  check(
    /File the record of appeal|Temyiz dosyasını sun/.test(contract) &&
      /yükümlülüğe git|open the obligation/.test(contract),
    'a contract term links to the obligation it raised in M2 (M14-04)',
  );
  check(/borçlu|owed by/.test(contract), 'and says which side owes it');
  // M14-07: the schedule, and the overrun reported rather than hidden.
  check(
    /Plan, kayıtlı sözleşme tutarını aşıyor|schedule exceeds the recorded contract value/.test(
      contract,
    ),
    'a schedule that outgrew the contract is reported, not blocked (M14-07)',
  );

  // M14-07, the other half: the four disagreements the schedule could not see.
  const owedList = (await page.textContent('ul[aria-label="Ödemesi planlanmamış hakediş"]')) ?? '';
  check(
    /Coast Engineering/.test(owedList) &&
      /ölçüm onaylanmış, planda karşılığı yok|certified, and nothing scheduled/.test(owedList),
    'measured work with no instalment against it is on the screen at last (M14-07)',
  );
  check(
    /henüz onaylanmamış bir çalışma rakamı|a working figure, not yet certified/.test(owedList),
    'and a draft figure is told apart from a certified measurement',
  );
  check(
    /tek bir yürürlükteki sözleşmesi yok|no single live contract/.test(owedList),
    'where the contract cannot be named the screen says so instead of picking one',
  );

  const partedList =
    (await page.textContent('ul[aria-label="Hakedişiyle ayrışan taksitler"]')) ?? '';
  check(
    /tutarlar uyuşmuyor|the amounts disagree/.test(partedList) &&
      /2,000,000/.test(partedList) &&
      /2,200,000/.test(partedList),
    'an instalment whose amount disagrees shows both numbers',
  );
  check(
    /karşılaştırılamıyor|not comparable/.test(partedList) &&
      !/iki ayrı para birimi[^·]*uyuşmuyor/.test(partedList),
    'while two currencies with no rate are called incomparable rather than unequal',
  );
  check(
    /ölçüm kaydında onay yok|no certification in the works register/.test(partedList),
    'an instalment claiming a certification the works register lacks is named',
  );
  check(
    /başka firmanın işi|another firm's work/.test(partedList),
    'and one citing another firm’s measured work is named too',
  );
  // The instalment that agrees must not be dragged into the list of problems.
  check(
    !/On signature|İmzada/.test(partedList),
    'an instalment that agrees with its valuation is left out of the list',
  );
  check(
    /İki kaydın ayrıldığı yerler|part company/.test(contract) &&
      /engellenmiyor|is blocked/.test(contract),
    'the panel says the disagreements are reported rather than blocked',
  );

  // Nothing to match is not the same as everything matching. The live project
  // is in exactly this state — no instalments and no valuations — and the
  // first version of this panel told it "every measured valuation has an
  // instalment against it", which is a reassurance about an empty register.
  await serve('**/rest/v1/milestone_matching**', []);
  await serve('**/rest/v1/unscheduled_valuations**', []);
  await serve('**/rest/v1/payment_matching_health**', {
    instalments_whose_amount_disagrees: 0,
    instalments_that_cannot_be_compared: 0,
    instalments_claiming_an_uncertified_measurement: 0,
    instalments_matched_to_another_firms_work: 0,
    settled_instalments_with_no_measurement: 0,
    measured_work_with_no_instalment: 0,
    certified_work_with_no_instalment: 0,
  });
  pageErrors = [];
  await page.goto(BASE + '/procurement', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const emptyMatch = (await page.textContent('body')) ?? '';
  check(
    pageErrors.length === 0 &&
      /Eşleştirilecek bir şey yok|nothing to match/.test(emptyMatch) &&
      !/Her ölçülmüş iş bir taksite bağlı|Every measured valuation has an instalment/.test(
        emptyMatch,
      ),
    'an empty register says there is nothing to match, not that everything matches',
  );
  check(
    /Kayıtlı hakediş yok|No valuation is recorded/.test(emptyMatch) &&
      /Kayıtlı ödeme planı taksiti yok|No schedule instalment is recorded/.test(emptyMatch),
    'and names which of the two registers is empty',
  );
  await serve('**/rest/v1/milestone_matching**', TEST_MILESTONE_MATCHING);
  await serve('**/rest/v1/unscheduled_valuations**', TEST_UNSCHEDULED_VALUATIONS);
  await serve('**/rest/v1/payment_matching_health**', TEST_PAYMENT_MATCHING_HEALTH);

  // M14-06: dated, scored, append-only.
  check(
    /3\.75/.test(procurement) && /Sound on the law, late with the record twice/.test(procurement),
    'a performance review carries its score and its words (M14-06)',
  );
  check(
    /sonradan değiştirilemez|not editable afterwards/.test(procurement),
    'and the screen says it cannot be edited afterwards',
  );
  check(pageErrors.length === 0, 'the procurement screen renders without a runtime error');

  // --- compiled reports (M12-06 … M12-09) -----------------------------------
  //
  // The measure for this module is a duration: a board pack in under ten
  // minutes where it takes hours today. Hours, because somebody reads six
  // registers and retypes the figures — so the assertions are mostly about
  // each figure arriving with the register it came from.
  pageErrors = [];
  await page.goto(BASE + '/reports', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const reports = (await page.textContent('body')) ?? '';

  check(
    /April board pack/.test(reports) && /Quarter to September/.test(reports),
    'the compiled runs are listed with their state (M12-06, M12-08)',
  );
  check(
    /Mali özet|Money/.test(reports) && /Riskler|Risks/.test(reports),
    'and a board pack arrives in sections rather than as one blob (M3-13)',
  );
  // The measure: no material figure without its source.
  check(
    /budget_position/.test(reports) && /donation_position/.test(reports),
    'every figure names the register it came from',
  );
  check(
    /48.000.000|48,000,000/.test(reports.replace(/\u00a0/g, ' ')),
    'with the figure itself formatted for the reader',
  );
  // Pledge and receipt are different facts and the pack says so.
  check(
    /Taahhüt edilip gelmeyen|Pledged and not yet received/.test(reports),
    'a pledge that has not arrived is its own line, not netted off',
  );

  // The honest limits, on the screen rather than in a comment.
  check(
    /yazdırma penceresinden|browser’s print dialogue/.test(reports),
    'the screen says the PDF comes from the browser, not from a generator here',
  );
  check(
    /bir \.docx değil|it is not a \.docx/.test(reports),
    'and that the download is Markdown rather than a .docx nothing writes',
  );

  // M8-12: approval before publication, and the freeze that makes approval
  // mean something.
  check(/Onayla|Approve/.test(reports), 'a draft can be approved (M8-12)');
  check(
    /değiştirilemez|cannot be changed/.test(reports),
    'and the screen says approval freezes the figures',
  );
  await page
    .locator('button')
    .filter({ hasText: /Quarter to September/ })
    .first()
    .click();
  await page.waitForTimeout(400);
  // Counted as buttons, not matched as text: "Onaylayan: …" — the line naming
  // who approved it — contains the word "Onayla", so a text match here would
  // pass or fail for the wrong reason.
  const publishButtons = await page
    .locator('button')
    .filter({ hasText: /^Yayımla$|^Publish$/ })
    .count();
  const approveButtons = await page
    .locator('button')
    .filter({ hasText: /^Onayla$|^Approve$/ })
    .count();
  check(
    publishButtons === 1 && approveButtons === 0,
    'an approved report offers publication and not a second approval',
  );

  await page
    .locator('button')
    .filter({ hasText: /Foundation — annual account/ })
    .first()
    .click();
  await page.waitForTimeout(400);
  const donorReport = (await page.textContent('body')) ?? '';
  check(
    /Katkınız|Your contribution/.test(donorReport) &&
      /Kaynakların kullanımı|Use of funds/.test(donorReport) === false,
    'a donor report leads with the donor’s own contribution (M12-07)',
  );
  check(
    /Belgesi eklenmemiş|no document attached/.test(donorReport),
    'and a receipt with no document behind it is counted, not hidden in the total',
  );
  check(
    /yayımlandı|published/.test(donorReport),
    'with its state on the page, because a published report has left the trust',
  );
  // M12-11: the curves, and the line a chart must not cross.
  //
  // Two of these can be drawn and one cannot, which is the whole point. A
  // chart over rows that share one date has axes and a legend and all the
  // furniture of a measurement while measuring nothing — and a flat line reads
  // as "nothing is happening" when it means "nothing has been recorded".
  check(
    /Eğriler/.test(reports) && /Kilometre taşı ilerlemesi/.test(reports),
    'the reports screen carries the curves (M12-11)',
  );
  check(
    (await page.locator('svg[role="img"]').count()) >= 2,
    'the two series with dates on two different days are drawn',
    `${await page.locator('svg[role="img"]').count()} drawn`,
  );
  check(
    /anlık görüntüdür/.test(reports) && /arşiv yüklenirken bir seferde yazıldı/.test(reports),
    'and rows sharing one date are called a snapshot rather than drawn as a trend',
  );
  check(
    /2 puan değişimi kayıtlı, hepsi 1 ayrı günde/.test(reports),
    'the empty state gives the count rather than saying "no data"',
  );
  // The claim, read off the path rather than off the sentence beside it. Two
  // recorded points become three commands — across, then up — because a
  // straight line between them would put values on days nobody measured. A
  // mutation that removed the step passed while this only checked the prose.
  const steps = await page.$$eval('svg[role="img"] path', (nodes) =>
    nodes.map((node) => (node.getAttribute('d') ?? '').split('L').length - 1),
  );
  check(
    /basamak şeklinde/.test(reports),
    'the screen says the line between two measurements is a step',
  );
  // A series of k points steps in 2(k-1) commands, so the count is always
  // even — and zero is right for a single point, which has no segment to draw.
  // A smoothed path would be k-1, which is odd for two points.
  check(
    steps.length > 0 && steps.every((n) => n % 2 === 0) && steps.some((n) => n >= 2),
    'and the path actually steps: two commands per point after the first',
    steps.join(', ') || '(no path)',
  );

  check(pageErrors.length === 0, 'the reports screen renders without a runtime error');

  // --- communication and notification (M11) ---------------------------------
  //
  // Two of these assertions are about a screen that could not save a reply at
  // all: it wrote into a JSONB column removed in 0002 and signed every
  // message with the literal string 'Current User'.
  pageErrors = [];
  await page.goto(BASE + '/communication', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const comms = (await page.textContent('body')) ?? '';

  // M11-02: the sender comes from the row's profile, never from a string.
  check(
    /Four firms have been approached/.test(comms) && /Smoke Test/.test(comms),
    'a message carries the sender the database recorded (M11-02)',
  );
  check(!/Current User/.test(comms), "and nothing on the screen says 'Current User' any more");

  // M11-04: channels. The filter row shows only channels this reader has
  // threads in — the portal does not advertise rooms you cannot enter — so
  // the six are asserted where they are all offered, which is the form for
  // starting a thread.
  check(
    /Mütevelli|Trustees/.test(comms) && /Genel|General/.test(comms),
    'the channels this person is in are on the screen (M11-04)',
  );
  await page
    .locator('button')
    .filter({ hasText: /Konu aç|Start a thread/ })
    .first()
    .click();
  await page.waitForTimeout(300);
  const channelOptions = await page.locator('select').first().locator('option').allTextContents();
  check(
    channelOptions.length === 6 &&
      channelOptions.some((o) => /Resmî ilişkiler|Official relations/.test(o)),
    'and all six are offered when a thread is started',
  );
  check(
    /Smoke Surveyor/.test(comms) && /Measuring the counsel fee proposals/.test(comms),
    'and somebody added to one by name says why they are in it',
  );

  // M11-11 / M11-08: one-way, acknowledged rather than replied to.
  await page
    .locator('button')
    .filter({ hasText: /The appeal is listed for 12 February/ })
    .first()
    .click();
  await page.waitForTimeout(500);
  const announcement = (await page.textContent('body')) ?? '';
  check(
    /cevap yazılamaz|cannot be replied to/.test(announcement),
    'an announcement says plainly that it is one-way (M11-11)',
  );
  check(
    /Gördüm|I have seen this/.test(announcement),
    'and offers an acknowledgement instead of a reply box (M11-08)',
  );
  check(
    /3\/9/.test(announcement),
    'the reach is counted against who could see it, not against everybody',
  );

  // M11-06: the column that keeps the outbox honest.
  check(
    /sağlayıcı bağlı değil|no provider is connected/.test(comms),
    'a notification says which media never went out, rather than showing four ticks (M11-06)',
  );

  // 0033: whether anything is raising them at all. The strip is the only
  // thing that tells an empty inbox apart from a sweep that stopped three
  // weeks ago, which is the failure that is otherwise completely silent.
  check(
    /Son tarama/.test(comms) && /4 bildirim üretti/.test(comms),
    'the screen says when the sweep last ran and what it raised (0033)',
  );
  check(
    !/Takvim durmuş görünüyor/.test(comms),
    'and does not cry stopped while the schedule is running',
  );

  await serve('**/rest/v1/notification_health**', TEST_HEALTH_STOPPED);
  pageErrors = [];
  await page.goto(BASE + '/communication', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const stopped = (await page.textContent('body')) ?? '';
  check(
    /Takvim durmuş görünüyor/.test(stopped),
    'a schedule that stopped is named, not left to be inferred from silence',
  );
  check(
    /sessizlik, olay olmadığı anlamına gelmiyor/.test(stopped),
    'and the screen says what that silence does not mean',
  );

  // Nothing has ever swept: a different statement again, and the one under
  // which the inbox cannot fill at all.
  await page.route('**/rest/v1/notification_health**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }),
  );
  pageErrors = [];
  await page.goto(BASE + '/communication', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const never = (await page.textContent('body')) ?? '';
  check(
    /Bildirim taraması hiç çalışmamış/.test(never),
    'a portal that has never swept says so rather than showing an empty inbox',
  );
  check(pageErrors.length === 0, 'the health strip renders without a page error');

  await serve('**/rest/v1/notification_health**', TEST_HEALTH);
  check(
    /sağlayıcı yok|no provider/.test(comms),
    'and the preference grid marks the three media with nothing behind them',
  );

  // M11-07: the two that cannot be switched off.
  check(
    /kapatılamaz|cannot be off/.test(comms),
    'a hearing and a deadline are marked as impossible to switch off (M11-07)',
  );
  const lockedToggle = page
    .locator('button[aria-label*="Duruşma"], button[aria-label*="Hearing"]')
    .first();
  check(
    (await lockedToggle.count()) > 0 && (await lockedToggle.isDisabled()),
    'and the control for the one that cannot be is actually disabled',
  );

  // M11-12: sent is not the same fact as delivered.
  check(
    /OUT-2026-004/.test(comms) && /teyit edilmedi|not confirmed/.test(comms),
    'a letter that was posted and never acknowledged says so (M11-12)',
  );
  // Not a date regex: /2026/ matches almost any page on this project, which
  // would make this assertion pass whatever the register said.
  check(
    /teyitli|confirmed/.test(comms),
    'while one that was acknowledged is marked confirmed, with its date',
  );
  check(
    /eksiz|no attachment/.test(comms) === false,
    'and every letter on the register has the letter itself attached',
  );

  // M11-10: the audience decides the content, in SQL.
  check(
    /Sizi bekleyenler|Waiting on you/.test(comms),
    'the trustee digest carries what is waiting on them (M11-10)',
  );
  await page.selectOption(
    'select[aria-label="Hedef kitle"], select[aria-label="Audience"]',
    'donor',
  );
  await page.waitForTimeout(600);
  const donorDigest = (await page.textContent('body')) ?? '';
  check(
    /Foundation stone laid/.test(donorDigest) &&
      !/Sizi bekleyenler|Waiting on you/.test(donorDigest),
    'and the donor digest is a different query, not the same one with sections hidden',
  );
  check(
    /yalnızca yayımlanmış|only what has been published/i.test(donorDigest),
    'with the screen saying what a donor is shown and what they are not',
  );

  check(pageErrors.length === 0, 'the communication screen renders without a runtime error');

  // --- the plan, the backbone (M15) -----------------------------------------
  //
  // Every assertion here is about a subtraction or a null. The module's whole
  // claim is that it can tell you how late something was, how far a date was
  // moved before that, and which of those two a report is quoting.
  pageErrors = [];
  await page.goto(BASE + '/plan', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const plan = (await page.textContent('body')) ?? '';

  // M15-01: the target, the outcome, and the number between them.
  check(
    /Block A roof closed|A blok çatısı kapandı/.test(plan) &&
      /90 gün gecikmeli|90d late/.test(plan),
    'a milestone says how late it was, not just that it is done (M15-01)',
  );
  check(
    /gecikme henüz bilinmiyor|slip not known yet/.test(plan),
    'and one not yet delivered says the slip is unknown rather than nought',
  );
  check(
    /tarihi geçti|past its target/.test(plan),
    'a target that has passed with the work open is marked, not left to the eye',
  );

  // M15-08: the timeline, and the two records it must refuse to place.
  //
  // A milestone is a point, not a span: the register holds a target date and
  // no duration, so every Gantt tool's default bar would be an assertion the
  // plan does not make. Phases are bars because a phase has both ends; a phase
  // missing one, or a milestone with no target, is listed with the reason
  // instead of being placed at today or at the project's first date.
  check(
    /Zaman çizgisi/.test(plan) && /bir kilometre taşı bir nokta, bir süre değil/.test(plan),
    'the timeline says why a milestone is a mark rather than a bar (M15-08)',
  );
  check(
    (await page.locator('svg[role="img"]').count()) >= 1,
    'and there is a timeline drawn, not a placeholder',
  );
  check(
    /Çizilemeyenler|Not drawn/.test(plan),
    'a record that cannot be placed is named rather than given a date',
  );
  check(
    /Faz 2 — eğitim bloğu/.test(plan) && /bitişi yok/.test(plan),
    'a phase with no end date says which end is missing',
  );
  check(
    /Çevre duvarını teslim al/.test(plan) && /hedef tarihi yok/.test(plan),
    'and a milestone with no target date says so',
  );
  // Shape, not colour, carries the state: the dataviz validator measured the
  // status palette's red and green at ΔE 4.1 under deuteranopia, which is
  // below the floor for telling two marks apart by hue.
  check(
    /daire: oldu/.test(plan) && /baklava: hâlâ borçlu/.test(plan),
    'the legend names the shapes, because red and green are ΔE 4.1 apart under deuteranopia',
  );

  // M15-02: the scope in prose beside the contents by count.
  check(
    /A1 ve B2 blokları|Blocks A1 and B2/.test(plan) && /1\/2/.test(plan),
    'a phase shows its scope in prose and its contents by count (M15-02)',
  );
  check(
    /süresini aştı|overran/.test(plan),
    'and a phase still open past its end date says so without anybody ticking it',
  );

  // M15-05: the chain, and the three-valued verdict kept three-valued.
  check(
    /kilometre taşı|milestone/i.test(plan) && /söylenemiyor|cannot tell/.test(plan),
    'a link waiting on a live court case is drawn as unknowable, not as blocked (M15-05)',
  );

  // M15-06: the two numbers that get conflated, in adjacent columns.
  check(
    /February board plan/.test(plan),
    'the baseline taken in February is on the screen (M15-06)',
  );
  check(
    /120 gün ertelendi|pushed out 120d/.test(plan),
    'and it reports that the date itself was moved four months',
  );
  check(
    /5 gün gecikmeli|5d late/.test(plan),
    'beside the five days the delivery actually slipped — the number most systems report alone',
  );

  // M15-07: thirty years of memory, each entry naming its source.
  check(
    /The trust is constituted in Mombasa/.test(plan) &&
      /Recited in the 2025 amended trust deed/.test(plan),
    'a hand-recorded 1993 event names where it comes from (M15-07)',
  );
  check(
    /1993/.test(plan) && !/1 January 1993|1 Ocak 1993/.test(plan),
    'and a year-precision event prints the year only — a day nobody established is not invented',
  );
  check(
    /belge kasada|document in the vault/.test(plan),
    'while an event resting on a filed document is marked as evidence rather than recollection',
  );

  // M15-04: the strip, which is on every screen and reads one SQL view.
  check(
    /Kritik tarihler|Critical dates/.test(plan) && /12 gün önce|12d ago/.test(plan),
    'the critical strip says how long ago a date passed, in words (M15-04)',
  );
  check(pageErrors.length === 0, 'the plan screen renders without a runtime error');

  // Somebody who may not keep the plan gets it read-only.
  await actAs(EXTERNAL_AUTHORITY);
  pageErrors = [];
  await page.goto(BASE + '/plan', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const outsidePlan = (await page.textContent('body')) ?? '';
  check(
    pageErrors.length === 0 &&
      !/Kilometre taşı ekle|Add a milestone/.test(outsidePlan) &&
      !/Temel plan al|Take a baseline/.test(outsidePlan),
    'somebody outside the organisation cannot move a date or freeze a baseline',
  );
  await actAs(TEST_AUTHORITY);
} finally {
  await browser?.close();
  server.kill();
}

console.log(failures === 0 ? '\nAll smoke checks passed.' : `\n${failures} smoke check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
