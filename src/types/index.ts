export type Language = 'en' | 'tr';

/** Mirrors the app_role enum in supabase/migrations/0001. */
export type UserRole =
  // internal
  | 'admin'
  | 'project_director'
  | 'field_team'
  | 'trustee'
  | 'board_director'
  | 'audit_committee'
  // external
  | 'legal_counsel'
  | 'contractor'
  | 'quantity_surveyor'
  | 'external_auditor'
  | 'donor'
  | 'observer'
  | 'consultant';

export const INTERNAL_ROLES = [
  'admin',
  'project_director',
  'field_team',
  'trustee',
  'board_director',
  'audit_committee',
] as const satisfies readonly UserRole[];

export function isInternalRole(role: UserRole): boolean {
  return (INTERNAL_ROLES as readonly UserRole[]).includes(role);
}

/** Mirrors the confidentiality enum. */
export type Confidentiality = 'public' | 'internal' | 'confidential' | 'restricted';

/**
 * A signed-in person, read from their profile row. The database decides what
 * they may see; this is only for addressing them and shaping the UI.
 */
export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  organization: string | null;
  clearance: Confidentiality;
  avatar?: string;
}

export type ActiveTab =
  | 'dashboard'
  | 'project_info'
  | 'legal'
  | 'construction'
  | 'governance'
  | 'readiness'
  | 'stakeholders'
  | 'meetings'
  | 'obligations'
  | 'risks'
  | 'calendar'
  | 'plan'
  | 'reports'
  | 'procurement'
  | 'finance'
  | 'documents'
  | 'communication'
  | 'assistant'
  | 'admin';

export interface LegalCase {
  id: string;
  caseNumber: string;
  title: string;
  court: string;
  caseType: string;
  currentStatus: string;
  priority: 'high' | 'urgent' | 'medium';
  filingDate: string;
  nextHearingDate?: string;
  descriptionEn: string;
  descriptionTr: string;
  keyIssues: string[];
  documentsCount: number;
}

/** Mirrors work_state in supabase/migrations/0013. */
export type WorkState =
  | 'planned'
  | 'in_progress'
  | 'completed'
  | 'legally_suspended'
  | 'emergency_preservation'
  | 'blocked';

/** Mirrors work_kind: preservation is tracked apart from construction. */
export type WorkKind = 'construction' | 'preservation';

export type ValuationState = 'draft' | 'qs_certified' | 'director_approved' | 'paid' | 'rejected';

export type BoqState = 'draft' | 'issued' | 'superseded';

export type CurrencyCode = 'KES' | 'USD' | 'TRY';

export interface ConstructionBlock {
  id: string;
  name: string;
  code: string;
  floors: number | null;
  totalAreaSqm: number | null;
  state: WorkState;
  purposeEn: string | null;
  purposeTr: string | null;
  phaseId: string | null;
  phaseName: string | null;
  startedOn: string | null;
  targetCompletion: string | null;
  leadEngineerName: string | null;
  contractorId: string | null;
  contractorName: string | null;
  confidentiality: Confidentiality;
}

/**
 * What a block is at, from the block_progress view.
 *
 * `percentComplete` is null when nothing has been reported. That is not the
 * same as zero, and the screens are careful to keep it different: the old
 * module printed a number for every block whether or not anybody had ever
 * looked at one.
 */
export interface BlockProgress {
  constructionBlockId: string;
  constructionTasks: number;
  preservationTasks: number;
  tasksWithEvidence: number;
  percentComplete: number | null;
  lastReportedAt: string | null;
  lastCapturedAt: string | null;
}

export interface ProjectPhase {
  id: string;
  code: string;
  nameEn: string;
  nameTr: string | null;
  sequence: number;
}

export interface Contractor {
  id: string;
  name: string;
  contractReference: string | null;
  scopeEn: string | null;
  startsOn: string | null;
  endsOn: string | null;
  bondAmount: number | null;
  bondCurrency: CurrencyCode | null;
}

export interface WorkPackage {
  id: string;
  constructionBlockId: string;
  code: string;
  titleEn: string;
  titleTr: string | null;
  contractorId: string | null;
  contractorName: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  taskCount: number;
}

export interface SiteTask {
  id: string;
  workPackageId: string;
  workPackageTitle: string | null;
  titleEn: string;
  titleTr: string | null;
  kind: WorkKind;
  state: WorkState;
  plannedStart: string | null;
  plannedEnd: string | null;
  ownerProfileId: string | null;
  ownerName: string | null;
  legalBasisEn: string | null;
  legalBasisTr: string | null;
  sourceLegalOrderId: string | null;
  confidentiality: Confidentiality;
  /** Latest evidenced report, or null when nothing has been filed. */
  percentComplete: number | null;
  reportCount: number;
}

export interface TaskProgressReport {
  id: string;
  siteTaskId: string;
  percentComplete: number;
  documentId: string;
  documentTitle: string | null;
  capturedAt: string | null;
  capturedLat: number | null;
  capturedLng: number | null;
  note: string | null;
  reportedByName: string | null;
  reportedAt: string;
}

export interface SiteInspection {
  id: string;
  constructionBlockId: string;
  inspectedOn: string;
  inspectorName: string | null;
  summaryEn: string | null;
  summaryTr: string | null;
  signedOffAt: string | null;
  signedOffByName: string | null;
  confidentiality: Confidentiality;
  findingCount: number;
  nonconformityCount: number;
}

export interface InspectionFinding {
  id: string;
  siteInspectionId: string;
  descriptionEn: string;
  descriptionTr: string | null;
  isNonconformity: boolean;
  severity: number | null;
  documentId: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

/** A live prohibition that reaches open work, from site_task_conflicts. */
export interface TaskConflict {
  siteTaskId: string;
  taskTitleEn: string;
  taskTitleTr: string | null;
  taskState: WorkState;
  taskKind: WorkKind;
  constructionBlockId: string;
  obligationId: string;
  obligationTitleEn: string | null;
  obligationTitleTr: string | null;
  obligationSource: string;
  sourceLegalOrderId: string | null;
  acknowledged: boolean;
}

export interface BoqVersion {
  id: string;
  constructionBlockId: string;
  versionNo: number;
  state: BoqState;
  preparedByName: string | null;
  preparedOn: string;
  currency: CurrencyCode;
  note: string | null;
  lineCount: number;
  total: number;
}

export interface BoqItem {
  id: string;
  boqVersionId: string;
  workPackageId: string | null;
  itemCode: string | null;
  descriptionEn: string;
  descriptionTr: string | null;
  unit: string;
  quantity: number;
  unitRate: number;
  /** Generated by the database from quantity × rate; never sent. */
  amount: number;
}

export interface Valuation {
  id: string;
  constructionBlockId: string;
  contractorId: string | null;
  contractorName: string | null;
  boqVersionId: string | null;
  periodStart: string;
  periodEnd: string;
  amount: number;
  currency: CurrencyCode;
  state: ValuationState;
  summary: string | null;
  qsCertifiedByName: string | null;
  qsCertifiedAt: string | null;
  directorApprovedByName: string | null;
  directorApprovedAt: string | null;
  paidAt: string | null;
  confidentiality: Confidentiality;
}

/** Mirrors document_category in supabase/migrations/0012. */
export type DocumentCategory =
  | 'trust_deed'
  | 'court_order'
  | 'pleading'
  | 'evidence'
  | 'contract_mou'
  | 'architectural'
  | 'boq_financial'
  | 'accreditation'
  | 'correspondence'
  | 'photograph'
  | 'other';

/**
 * What is true of a document across every version of it. Everything that
 * describes a file — its name, size, digest, who uploaded it — belongs to one
 * upload and lives on DocumentVersion.
 */
export interface DocumentItem {
  id: string;
  title: string;
  category: DocumentCategory;
  status: 'approved' | 'under_review' | 'archived' | null;
  descriptionEn: string | null;
  descriptionTr: string | null;
  confidentiality: Confidentiality;
  currentVersionId: string | null;
  versionCount: number;
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  versionNo: number;
  storagePath: string;
  fileName: string;
  contentType: string | null;
  byteSize: number | null;
  /**
   * Computed by the server from the stored bytes. Null means not yet
   * computed, which is shown as unverified — never as nothing.
   */
  sha256: string | null;
  digestComputedAt: string | null;
  uploadedByName: string | null;
  uploadedAt: string;
  note: string | null;
}

export type DocumentActionKind = 'viewed' | 'downloaded';

/** Who read what, written only by the server (M9-07). */
export interface DocumentAccessEntry {
  id: number;
  documentId: string;
  versionId: string | null;
  profileId: string;
  readerName: string | null;
  action: DocumentActionKind;
  at: string;
}

export interface DocumentLink {
  id: string;
  documentId: string;
  entityType: string;
  entityId: string;
  note: string | null;
}

export interface FinancialTransaction {
  id: string;
  referenceNo: string;
  date: string;
  category:
    | 'civil_construction'
    | 'architectural_qs'
    | 'legal_defence'
    | 'site_security'
    | 'land_administration'
    | 'statutory_compliance';
  description: string;
  payee: string;
  amount: number;
  currency: CurrencyCode;
  fxRateToKes: number;
  /** Generated from amount × rate. Never sent. */
  amountKes: number;
  budgetLineId: string | null;
  paymentVoucherId: string | null;
  documentId: string | null;
  /** Generated from whether a document is attached (M8-07). */
  verified: boolean;
  /**
   * Written only by public.mark_audited(), which admits nobody but the audit
   * committee and the external auditor. There is no setter for this in the
   * client because there is no privilege behind one (M8-06).
   */
  auditedAt: string | null;
  auditedByName: string | null;
  auditNote: string | null;
  confidentiality: Confidentiality;
}

/** Mirrors voucher_state in supabase/migrations/0015. */
export type VoucherState = 'requested' | 'approved' | 'rejected' | 'paid' | 'withdrawn';

export type DonationState = 'pledged' | 'partly_received' | 'received' | 'lapsed';

export interface BudgetCategory {
  id: string;
  code: string;
  nameEn: string;
  nameTr: string | null;
  sequence: number;
}

export interface BudgetLine {
  id: string;
  budgetCategoryId: string;
  categoryName: string | null;
  phaseId: string | null;
  workPackageId: string | null;
  constructionBlockId: string | null;
  titleEn: string;
  titleTr: string | null;
  amount: number;
  currency: CurrencyCode;
  amountKes: number;
  confidentiality: Confidentiality;
}

/**
 * The four figures (M8-02), computed rather than stored.
 *
 * Committed is approved and not yet paid; spent is paid; remaining subtracts
 * both. Keeping them apart is the whole point — the old summary added
 * commitments into spend and flattered every number it touched.
 */
export interface BudgetPosition {
  budgetLineId: string;
  budgetCategoryId: string;
  titleEn: string;
  titleTr: string | null;
  currency: CurrencyCode;
  budgetKes: number;
  committedKes: number;
  spentKes: number;
  remainingKes: number;
}

export interface CategorySpend {
  budgetCategoryId: string;
  code: string;
  nameEn: string;
  nameTr: string | null;
  sequence: number;
  budgetKes: number;
  committedKes: number;
  spentKes: number;
  remainingKes: number;
  lineCount: number;
}

export interface PaymentVoucher {
  id: string;
  referenceNo: string;
  budgetLineId: string | null;
  budgetLineTitle: string | null;
  payee: string;
  purpose: string;
  requestedByName: string | null;
  requestedAt: string;
  state: VoucherState;
  valuationId: string | null;
  amount: number;
  currency: CurrencyCode;
  amountKes: number;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  /** What the line had left when the ruling was made. */
  budgetRemainingAtDecision: number | null;
  paidAt: string | null;
  confidentiality: Confidentiality;
}

export interface VoucherApproval {
  id: string;
  paymentVoucherId: string;
  decision: VoucherState;
  decidedByName: string | null;
  decidedAt: string;
  actingAs: string;
  note: string | null;
}

export interface ApprovalThreshold {
  id: string;
  minAmountKes: number;
  requiredRoles: string[];
  note: string | null;
}

export interface Donation {
  id: string;
  donorName: string;
  donorStakeholderId: string | null;
  pledgedOn: string;
  state: DonationState;
  pledgedAmount: number;
  pledgedCurrency: CurrencyCode;
  pledgedAmountKes: number;
  /** Summed from the tranches that actually arrived. */
  receivedKes: number;
  outstandingKes: number;
  trancheCount: number;
  unevidencedTranches: number;
  confidentiality: Confidentiality;
}

export interface DonationTranche {
  id: string;
  donationId: string;
  receivedOn: string;
  receivedAmount: number;
  receivedCurrency: CurrencyCode;
  receivedAmountKes: number;
  documentId: string | null;
  verified: boolean;
  note: string | null;
}

/* Communication and notification (M11).
 *
 * The old CommunicationThread carried its messages as a nested array, which
 * was the shape of the JSONB column 0002 replaced with rows. Keeping the type
 * would have kept the client writing to a column that no longer exists — it
 * was still doing exactly that, attributing every message to the literal
 * string 'Current User' (M11-02, M11-03). Messages are their own type now and
 * are fetched separately, one thread at a time. */

export type CommChannel =
  'trustee' | 'legal' | 'construction' | 'finance' | 'official_relations' | 'general';

export type ThreadKind = 'discussion' | 'announcement';

export interface CommunicationThread {
  id: string;
  title: string;
  channel: CommChannel;
  kind: ThreadKind;
  urgent: boolean;
  pinned: boolean;
  closedAt: string | null;
  confidentiality: Confidentiality;
  createdAt: string;
  createdBy: string | null;
  startedBy: string | null;
  /** The register this conversation hangs on, if any (M11-05). */
  legalCaseId: string | null;
  constructionBlockId: string | null;
  obligationId: string | null;
  transactionId: string | null;
  messages: number;
  lastMessageAt: string | null;
  lastSpeaker: string | null;
  /** Whether this reader has acknowledged it. Announcements only (M11-08). */
  seenByMe: boolean;
}

export interface ThreadMessage {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string | null;
  body: string;
  createdAt: string;
  /** M11-13: the message this one quotes, by reference rather than by copy. */
  quotedMessageId: string | null;
  /**
   * The quoted words, read from the original row under the reader's own
   * clearance. Null where they may not see it — and then
   * `quotedMessageNotReadable` says so, because "nothing quoted" and "quoted
   * something you may not read" are different sentences.
   */
  quotedBody: string | null;
  quotedSenderName: string | null;
  quotedMessageNotReadable: boolean;
  attachments: number;
  reactions: number;
}

/** M11-13. Who reacted, not how many: a count nobody can open is not evidence. */
export interface MessageReaction {
  threadMessageId: string;
  reaction: 'agree' | 'disagree' | 'seen' | 'question';
  people: number;
  who: string[];
}

export interface MessageAttachment {
  threadMessageId: string;
  documentId: string;
  documentTitle: string | null;
  note: string | null;
}

export interface ChannelMember {
  channel: CommChannel;
  profileId: string;
  fullName: string | null;
  addedAt: string;
  note: string | null;
}

/** Who an urgent announcement reached, against who could see it (M11-08). */
export interface AnnouncementReach {
  threadId: string;
  title: string;
  channel: CommChannel;
  urgent: boolean;
  createdAt: string;
  seen: number;
  couldSee: number;
  seenBy: string[];
}

export type NotificationMedium = 'in_app' | 'email' | 'whatsapp' | 'push';

/**
 * Whether the thing that raises notifications is running (0033).
 *
 * An empty inbox has two explanations that look identical from the screen:
 * there was nothing to raise, or the schedule stopped. This is what tells
 * them apart, so it is shown even when — especially when — there is nothing
 * in the inbox.
 */
export interface NotificationHealth {
  lastRanAt: string;
  lastTriggerSource: 'schedule' | 'manual';
  lastRaised: number;
  hoursSince: number;
  looksStopped: boolean;
  mediaWithAProvider: NotificationMedium[];
  mediaWithoutAProvider: NotificationMedium[];
}

/**
 * Whether push can leave at all, and what is waiting for this reader
 * (M11-05).
 *
 * `queuedWithNowhereToGo` is the state a screen must not render as a
 * delivery: the notification exists and no device of theirs does.
 */
export interface PushHealth {
  keyOnRecord: boolean;
  myDevices: number;
  myQueued: number;
  mySent: number;
  myFailed: number;
  queuedWithNowhereToGo: boolean;
}

export type NotificationTopic =
  | 'hearing'
  | 'deadline'
  | 'decision_needed'
  | 'announcement'
  | 'thread_reply'
  | 'digest'
  | 'site'
  | 'money';

export interface NotificationItem {
  id: string;
  topic: NotificationTopic;
  urgent: boolean;
  titleEn: string;
  titleTr: string | null;
  body: string | null;
  entityKind: string | null;
  entityId: string | null;
  threadId: string | null;
  raisedAt: string;
  deliveryId: string;
  readAt: string | null;
  /** The media that were never going to arrive, named rather than hidden. */
  awaitingAProvider: string[];
  raisedBy: string | null;
}

export interface NotificationPreference {
  topic: NotificationTopic;
  medium: NotificationMedium;
  enabled: boolean;
}

export type CorrespondenceDirection = 'outgoing' | 'incoming';

export type CorrespondenceRoute =
  'letter' | 'email' | 'hand_delivery' | 'courier' | 'whatsapp' | 'portal';

/** The official letter register (M11-12). */
export interface CorrespondenceEntry {
  id: string;
  referenceNo: string | null;
  direction: CorrespondenceDirection;
  route: CorrespondenceRoute;
  subjectEn: string;
  subjectTr: string | null;
  summary: string | null;
  sentOn: string;
  counterparty: string | null;
  signedByName: string | null;
  documentId: string | null;
  legalCaseId: string | null;
  deliveryConfirmedOn: string | null;
  deliveryEvidenceDocumentId: string | null;
  deliveryNote: string | null;
  confidentiality: Confidentiality;
}

export type DigestAudience = 'trustee' | 'field' | 'donor';

export interface DigestRow {
  section: string;
  occurredOn: string | null;
  titleEn: string | null;
  titleTr: string | null;
  detail: string | null;
  entityKind: string | null;
  entityId: string | null;
  confidentiality: Confidentiality;
}

/* DeadlineNotification is gone with the table it described (0024).
 *
 * It held hand-typed dates and decided who saw each one from a `targetRole`
 * array — a second answer to "what falls due" beside the computed calendar,
 * and a second access mechanism weaker than the policies. What falls due now
 * comes from `critical_dates`; see CriticalDate below. */

/* TrusteeMember is gone with the table it described.
 *
 * It held a national identity number as a plain string and pinned the
 * appointing bodies and the trustees' home cities into a union type, so
 * adding a trustee from anywhere else was a code change. The register that
 * replaces it is `Trustee` below (M10-01): the appointing body is text
 * because it is data, and the identity document is a reference into the
 * vault rather than a number anybody can read off a payload. */

export interface HearingBriefItem {
  part: string;
  titleEn: string;
  titleTr: string;
  summaryEn: string;
  summaryTr: string;
  content: string[];
}

export interface BenchQuestion {
  question: string;
  answer: string;
  questionTr: string;
  answerTr: string;
  category: 'stay' | 'contempt' | 'trustees' | 'wall_repair' | 'jurisdiction';
}

export interface LegalAuthority {
  citation: string;
  use: string;
  party: 'ours' | 'theirs';
  principleEn: string;
  principleTr: string;
}

export interface CourtRecordVolume {
  volume: number;
  titleEn: string;
  titleTr: string;
  pageRange: string;
  totalPages: number;
  filingDate: string;
  court: string;
  keyContentsEn: string[];
  keyContentsTr: string[];
  certifiedBy: string;
}

export interface EvidenceExhibit {
  id: string;
  exhibitMark: string;
  titleEn: string;
  titleTr: string;
  date: string;
  sourceDeponent: string;
  legalRelevanceEn: string;
  legalRelevanceTr: string;
  category:
    | 'root_title'
    | 'lease'
    | 'squatter_agreement'
    | 'nlc_ruling'
    | 'police_bond'
    | 'qs_valuation'
    | 'court_order';
}

// ---------------------------------------------------------------------------
// Access administration
//
// These mirror the identity tables in supabase/migrations/0001 and 0004 and
// the answer public.current_authority() gives. They shape the console; what a
// person may actually do is decided by the policies, every time.
// ---------------------------------------------------------------------------

export interface Profile {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  organization: string | null;
  clearance: Confidentiality;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
}

/**
 * What the caller may do, delegation included. Null when the signed-in account
 * has no active profile — which is also how an expired consultant reads.
 */
export interface Authority {
  /** Their own role, which is what the audit trail will record. */
  role: UserRole;
  /** Their own role plus every role a live delegation lends them. */
  roles: UserRole[];
  clearance: Confidentiality;
  isInternal: boolean;
  isAdmin: boolean;
  delegations: {
    lenderId: string;
    lenderName: string;
    role: UserRole;
    clearance: Confidentiality;
  }[];
}

export type GrantPermission = 'read' | 'write';

/** One record handed to one person, optionally until a date. */
export interface RecordGrant {
  id: string;
  userId: string;
  userName: string | null;
  entityType: string;
  entityId: string;
  permission: GrantPermission;
  grantedByName: string | null;
  grantedAt: string;
  expiresAt: string | null;
  reason: string | null;
}

/** An external party's scope: the cases or blocks they are on. */
export interface Assignment {
  userId: string;
  userName: string | null;
  targetId: string;
  assignedByName: string | null;
  assignedAt: string;
}

export interface Delegation {
  id: string;
  fromUserId: string;
  fromUserName: string | null;
  toUserId: string;
  toUserName: string | null;
  reason: string;
  requestedByName: string | null;
  requestedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokedByName: string | null;
  approvals: { approverId: string; approverName: string | null; approvedAt: string }[];
}

export interface AuditEntry {
  id: number;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  at: string;
}

// ---------------------------------------------------------------------------
// Stakeholders (M4)
//
// Mirrors supabase/migrations/0006. The register is the project's political
// map: who is with us, who influences whom, and what we privately think. The
// database decides who may read which part of it.
// ---------------------------------------------------------------------------

export type StakeholderCategory =
  | 'government'
  | 'judiciary'
  | 'partner_trust'
  | 'legal'
  | 'contractor'
  | 'academia'
  | 'ngo'
  | 'community_leader'
  | 'media'
  | 'donor'
  | 'opposing_party'
  | 'other';

/** Where someone stands. 'unknown' is the default: unexamined is not neutral. */
export type Stance = 'champion' | 'supporter' | 'neutral' | 'sceptic' | 'opponent' | 'unknown';

export type ContactChannel =
  'in_person' | 'phone' | 'message' | 'email' | 'formal_letter' | 'other';

export type RelationshipKind =
  'influences' | 'works_with' | 'related_to' | 'reports_to' | 'opposes' | 'advises';

export interface Organization {
  id: string;
  name: string;
  category: StakeholderCategory;
  country: string | null;
  website: string | null;
  notes: string | null;
  confidentiality: Confidentiality;
}

export interface Stakeholder {
  id: string;
  fullName: string;
  title: string | null;
  organizationId: string | null;
  organizationName: string | null;
  category: StakeholderCategory;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  location: string | null;
  preferredLanguage: string | null;
  interestTopic: string | null;
  stance: Stance;
  /** 1–5, the two axes of the power/interest grid. */
  influence: number;
  interest: number;
  relationshipOwner: string | null;
  relationshipOwnerName: string | null;
  /** Set when this contact also signs in to the portal. */
  profileId: string | null;
  notes: string | null;
  confidentiality: Confidentiality;
}

export interface StanceChange {
  id: string;
  stakeholderId: string;
  fromStance: Stance | null;
  toStance: Stance;
  changedByName: string | null;
  changedAt: string;
  note: string | null;
}

export interface StakeholderInteraction {
  id: string;
  stakeholderId: string;
  occurredAt: string;
  channel: ContactChannel;
  summary: string;
  outcome: string | null;
  loggedForName: string | null;
  confidentiality: Confidentiality;
}

/** The half of a stakeholder record that is not for sharing. */
export interface StakeholderAssessment {
  id: string;
  stakeholderId: string;
  body: string;
  assessedAt: string;
  authorName: string | null;
  confidentiality: Confidentiality;
}

export interface StakeholderRelationship {
  id: string;
  fromStakeholderId: string;
  fromName: string | null;
  toStakeholderId: string;
  toName: string | null;
  kind: RelationshipKind;
  strength: number;
  note: string | null;
}

/** Relationships that have nobody keeping them, or have gone quiet. */
export interface StakeholderAttention {
  id: string;
  fullName: string;
  category: StakeholderCategory;
  stance: Stance;
  influence: number;
  interest: number;
  relationshipOwner: string | null;
  lastContactAt: string | null;
  quietAfterDays: number;
  needsAnOwner: boolean;
  hasGoneQuiet: boolean;
}

// ---------------------------------------------------------------------------
// Meetings, decisions and actions (M3)
//
// Mirrors supabase/migrations/0007. A decision, an action and an unanswered
// question are each their own record rather than three paragraphs in a note,
// because a paragraph cannot have an owner, a date or a state, and cannot be
// carried into the next meeting.
// ---------------------------------------------------------------------------

export type MeetingKind =
  'internal' | 'trustee' | 'official' | 'partner' | 'legal' | 'site' | 'community';

export type MeetingStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled';

/** Draft until circulated, circulated until agreed, then fixed for good. */
export type MinutesStatus = 'draft' | 'circulated' | 'final';

export type PriorityLevel = 'low' | 'normal' | 'high' | 'critical';

export type AttendanceRole = 'chair' | 'secretary' | 'participant' | 'observer';

export type NoteSection =
  'agenda' | 'discussed' | 'decisions' | 'actions' | 'outcomes' | 'open_questions';

export type ContentLanguage = 'tr' | 'en';

export type VoteOutcome = 'unanimous' | 'majority' | 'carried_with_dissent' | 'deferred';

export type DecisionStatus = 'in_force' | 'implemented' | 'rescinded' | 'suspended';

export type ActionStatus = 'open' | 'in_progress' | 'blocked' | 'done' | 'cancelled';

export type QuestionStatus = 'open' | 'answered' | 'escalated' | 'dropped';

/**
 * Someone named in the record: a portal user or somebody in the stakeholder
 * register, never a name typed into a box. Exactly one of the two ids is set.
 */
export interface Party {
  profileId: string | null;
  stakeholderId: string | null;
  name: string | null;
}

export interface Meeting {
  id: string;
  title: string;
  /** The Turkish title, where the record carries one (0028). */
  titleTr: string | null;
  heldAt: string;
  location: string | null;
  kind: MeetingKind;
  priority: PriorityLevel;
  status: MeetingStatus;
  minutesStatus: MinutesStatus;
  preparedByName: string | null;
  continuesMeetingId: string | null;
  continuesMeetingTitle: string | null;
  confidentiality: Confidentiality;
  attendeeCount: number;
}

export interface MeetingAttendee extends Party {
  id: string;
  meetingId: string;
  roleAtMeeting: AttendanceRole;
  attended: boolean;
}

export interface MeetingNote {
  id: string;
  meetingId: string;
  section: NoteSection;
  language: ContentLanguage;
  body: string;
  isMachineTranslation: boolean;
  confidentiality: Confidentiality;
}

export interface Decision {
  id: string;
  meetingId: string | null;
  referenceNo: string | null;
  textEn: string | null;
  textTr: string | null;
  rationaleEn: string | null;
  rationaleTr: string | null;
  organ: string | null;
  vote: VoteOutcome | null;
  decidedOn: string;
  status: DecisionStatus;
  confidentiality: Confidentiality;
  dissenters: (Party & { id: string; note: string | null })[];
}

export interface ActionItem extends Party {
  id: string;
  meetingId: string | null;
  decisionId: string | null;
  textEn: string | null;
  textTr: string | null;
  dueDate: string;
  status: ActionStatus;
  priority: PriorityLevel;
  completedAt: string | null;
  completionNote: string | null;
  confidentiality: Confidentiality;
}

export interface OpenQuestion extends Party {
  id: string;
  meetingId: string | null;
  questionEn: string | null;
  questionTr: string | null;
  detailEn: string | null;
  detailTr: string | null;
  status: QuestionStatus;
  targetResolutionDate: string | null;
  answerEn: string | null;
  answerTr: string | null;
  answeredAt: string | null;
  confidentiality: Confidentiality;
}

/** What the next meeting starts from: everything still open. */
export interface AgendaItem {
  itemKind: 'action' | 'question';
  id: string;
  textEn: string | null;
  textTr: string | null;
  dueOn: string | null;
  status: string;
  priority: PriorityLevel;
  raisedAtMeetingId: string | null;
  ownerProfileId: string | null;
  ownerStakeholderId: string | null;
  overdue: boolean;
}

// ---------------------------------------------------------------------------
// The legal register (M5) — mirrors supabase/migrations/0009
// ---------------------------------------------------------------------------

/** What an order is doing now, which is the question anyone actually has. */
export type OrderState = 'in_force' | 'varied' | 'discharged' | 'appealed' | 'spent';

export interface LegalOrder {
  id: string;
  legalCaseId: string;
  madeOn: string;
  madeBy: string | null;
  referenceNo: string | null;
  textEn: string | null;
  textTr: string | null;
  state: OrderState;
  documentId: string | null;
  /** Set when this order changes an earlier one. */
  variesOrderId: string | null;
  confidentiality: Confidentiality;
}

// ---------------------------------------------------------------------------
// Obligations (M2) — mirrors supabase/migrations/0010
//
// The connective tissue: what the lease, the courts, the trust deed, the MoU
// and the people around this project have each undertaken, in one register.
// ---------------------------------------------------------------------------

export type ObligationSource =
  'lease' | 'court_order' | 'trust_deed' | 'mou' | 'statute' | 'contract' | 'personal_commitment';

export type ObligationState =
  | 'open'
  | 'in_progress'
  | 'fulfilled'
  | 'at_risk'
  | 'breached'
  /** A court can stop the clock. Not done, and not failed. */
  | 'suspended';

export interface Obligation {
  id: string;
  titleEn: string | null;
  titleTr: string | null;
  detailEn: string | null;
  detailTr: string | null;
  source: ObligationSource;
  sourceDocumentId: string | null;
  sourceLegalOrderId: string | null;
  sourceMeetingId: string | null;
  obligorName: string;
  obligorStakeholderId: string | null;
  obligorProfileId: string | null;
  beneficiaryName: string | null;
  dueOn: string | null;
  state: ObligationState;
  /** Whether this forbids something rather than requiring it. */
  prohibits: boolean;
  /** Generated from whether a source document is attached. Never asserted. */
  verified: boolean;
  confidentiality: Confidentiality;
  evidenceCount: number;
}

export interface ObligationEvidence {
  id: string;
  obligationId: string;
  description: string;
  documentId: string | null;
  observedOn: string | null;
  addedByName: string | null;
}

/** Proceeding in spite of an obligation. Recorded, never erased. */
export interface ObligationOverride {
  id: string;
  obligationId: string;
  noteOfWhat: string;
  reason: string;
  acknowledgedByName: string | null;
  acknowledgedAt: string;
}

/** Of what somebody undertook, how much they did (M2-08). */
export interface CommitmentRecord {
  stakeholderId: string;
  undertaken: number;
  kept: number;
  broken: number;
  outstanding: number;
  overdue: number;
  /** Null means nothing of theirs is settled yet — not the same as zero. */
  keptPercent: number | null;
}

// ---------------------------------------------------------------------------
// The unified calendar (M15-03) — mirrors the view in 0011
// ---------------------------------------------------------------------------

/**
 * Mirrors the calendar_kind enum in Postgres, which 0022 and 0024 each grew by
 * one value after 0011 created it. This type did not grow with it, and that is
 * what took the calendar screen down: a single milestone row made
 * `KINDS[entry.kind]` undefined, and reading `.icon` off it threw. The type
 * said six values, the database held eight, and TypeScript believed the type.
 *
 * `tests/enum-drift.mjs` now compares the two, so the next `alter type ... add
 * value` fails the build instead of a screen.
 */
export type CalendarKind =
  | 'hearing'
  | 'filing'
  | 'obligation'
  | 'action'
  | 'question'
  | 'meeting'
  | 'contract'
  | 'milestone';

/** Bir takvim türünün adı ve ait olduğu kütük. Tanımı `lib/calendarKinds`. */
export interface CalendarKindFace {
  tr: string;
  en: string;
  route: string;
}

/**
 * One dated thing, from whichever register it belongs to. Each row was
 * filtered by that register's own policy on the way out, so this is never a
 * way around them.
 */
export interface CalendarEntry {
  kind: CalendarKind;
  id: string;
  titleEn: string | null;
  titleTr: string | null;
  dueOn: string | null;
  dueAt: string | null;
  detail: string | null;
  legalCaseId: string | null;
  meetingId: string | null;
  state: string | null;
  needsAttention: boolean;
  confidentiality: Confidentiality;
}

// ---------------------------------------------------------------------------
// The rest of the legal register (M5) — mirrors supabase/migrations/0009
// ---------------------------------------------------------------------------

export type CasePartyRole =
  'appellant' | 'respondent' | 'claimant' | 'defendant' | 'interested_party' | 'amicus';

export type HearingKind =
  'mention' | 'directions' | 'hearing' | 'ruling' | 'judgment' | 'application';

export type PreparationState = 'not_started' | 'in_preparation' | 'ready' | 'missed';

export type FilingKind =
  | 'pleading'
  | 'affidavit'
  | 'submission'
  | 'application'
  | 'appeal'
  | 'record_of_appeal'
  | 'notice'
  | 'other';

export type FilingState = 'planned' | 'drafting' | 'filed' | 'served' | 'withdrawn' | 'late';

export type CounselState = 'proposed' | 'instructed' | 'on_record' | 'withdrawn';

export interface CaseParty {
  id: string;
  legalCaseId: string;
  role: CasePartyRole;
  name: string;
  stakeholderId: string | null;
  representedBy: string | null;
}

export interface Hearing {
  id: string;
  legalCaseId: string;
  scheduledFor: string;
  kind: HearingKind;
  bench: string | null;
  courtroom: string | null;
  preparation: PreparationState;
  requiredDocuments: string[];
  outcomeEn: string | null;
  outcomeTr: string | null;
  confidentiality: Confidentiality;
}

export interface Filing {
  id: string;
  legalCaseId: string;
  kind: FilingKind;
  title: string;
  /** Kept separate from filedOn on purpose: the gap is the thing to see. */
  dueOn: string | null;
  filedOn: string | null;
  state: FilingState;
  filedByName: string | null;
  documentId: string | null;
  note: string | null;
  confidentiality: Confidentiality;
}

export interface Exhibit {
  id: string;
  legalCaseId: string;
  mark: string;
  description: string;
  source: string | null;
  relevance: string | null;
  documentId: string | null;
  confidentiality: Confidentiality;
}

/** Who handed what to whom. Append-only, in the database and here. */
export interface CustodyEntry {
  id: string;
  exhibitId: string;
  handedOverAt: string;
  fromParty: string;
  toParty: string;
  note: string | null;
}

export interface CaseCounsel {
  id: string;
  legalCaseId: string;
  stakeholderId: string;
  counselName: string | null;
  state: CounselState;
  /** Whether the instrument that actually lets them act has been filed. */
  powerOfAttorneyFiled: boolean;
  feeModel: string | null;
  instructedOn: string | null;
  note: string | null;
}

export interface LegalOpinion {
  id: string;
  legalCaseId: string | null;
  question: string;
  givenByStakeholderId: string | null;
  givenByName: string | null;
  givenOn: string | null;
  conclusion: string | null;
  confidentiality: Confidentiality;
}

// ---------------------------------------------------------------------------
// RAID (M6) — mirrors supabase/migrations/0016
// ---------------------------------------------------------------------------

export type RiskCategory =
  | 'legal'
  | 'political'
  | 'financial'
  | 'reputational'
  | 'site_safety'
  | 'construction'
  | 'accreditation'
  | 'partnership'
  | 'climate';

export type RiskState = 'open' | 'mitigating' | 'materialised' | 'closed';

export type RiskResponse = 'avoid' | 'reduce' | 'transfer' | 'accept';

export type IssueState = 'open' | 'in_progress' | 'resolved' | 'closed';

export type AssumptionState = 'unverified' | 'holding' | 'shaky' | 'broken';

export interface Risk {
  id: string;
  titleEn: string;
  titleTr: string | null;
  detailEn: string | null;
  detailTr: string | null;
  category: RiskCategory;
  likelihood: number;
  impact: number;
  /** Generated from likelihood × impact. Never sent. */
  score: number;
  ownerProfileId: string | null;
  ownerName: string | null;
  state: RiskState;
  response: RiskResponse | null;
  responsePlanEn: string | null;
  responsePlanTr: string | null;
  triggerEn: string | null;
  earlyWarningEn: string | null;
  sourceAssumptionId: string | null;
  reviewOn: string | null;
  confidentiality: Confidentiality;
  /** Unacknowledged threshold crossings. */
  openEscalations: number;
}

export interface RiskScoreChange {
  id: number;
  riskId: string;
  fromScore: number | null;
  toScore: number;
  toLikelihood: number;
  toImpact: number;
  changedByName: string | null;
  changedAt: string;
}

export interface RiskEscalation {
  id: number;
  riskId: string;
  score: number;
  threshold: number;
  escalatedAt: string;
  acknowledgedAt: string | null;
  acknowledgedByName: string | null;
}

export interface Issue {
  id: string;
  titleEn: string;
  titleTr: string | null;
  detailEn: string | null;
  category: RiskCategory;
  severity: number;
  ownerName: string | null;
  state: IssueState;
  openedOn: string;
  /** Set when this issue is a risk that happened (M6-05). */
  materialisedFromRiskId: string | null;
  resolvedAt: string | null;
  resolutionEn: string | null;
  confidentiality: Confidentiality;
}

export interface Assumption {
  id: string;
  statementEn: string;
  statementTr: string | null;
  riskCategory: RiskCategory;
  state: AssumptionState;
  ownerName: string | null;
  reviewOn: string | null;
  lastCheckedOn: string | null;
  note: string | null;
  /** Filled by the database when the assumption breaks. */
  raisedRiskId: string | null;
  confidentiality: Confidentiality;
}

export interface Dependency {
  id: string;
  blockerLegalCaseId: string | null;
  blockerSiteTaskId: string | null;
  blockerObligationId: string | null;
  blockerRiskId: string | null;
  /** 0024 joined milestones to the one dependency mechanism (M15-01). */
  blockerMilestoneId: string | null;
  blockerLabel: string | null;
  dependentSiteTaskId: string | null;
  dependentObligationId: string | null;
  dependentLegalCaseId: string | null;
  dependentMilestoneId: string | null;
  dependentLabel: string | null;
  noteEn: string | null;
  /** Null means the portal cannot say, which is not the same as "no". */
  blockerSettled: boolean | null;
  confidentiality: Confidentiality;
}

export interface RiskMatrixCell {
  likelihood: number;
  impact: number;
  score: number;
  riskCount: number;
}

/** Mirrors decision_kind in supabase/migrations/0017. */
export type DecisionKind =
  | 'risk_escalation'
  | 'payment_voucher'
  | 'valuation_approval'
  | 'open_question'
  | 'work_under_prohibition'
  | 'delegation_approval';

/**
 * One thing waiting on a ruling, from the pending_decisions view.
 *
 * `waitingOn` is the roles that can settle it. Without that column the panel
 * is a list of worries; with it, it is a list somebody is answerable for.
 */
export interface PendingDecision {
  kind: DecisionKind;
  id: string;
  titleEn: string | null;
  titleTr: string | null;
  detail: string | null;
  waitingSince: string | null;
  dueOn: string | null;
  waitingOn: string[];
  confidentiality: Confidentiality;
}

// ---------------------------------------------------------------------------
// Search and the assistant (M13)
// ---------------------------------------------------------------------------

/** Mirrors search_kind in supabase/migrations/0019. */
export type SearchKind =
  | 'legal_case'
  | 'legal_order'
  | 'legal_opinion'
  | 'hearing'
  | 'filing'
  | 'document'
  | 'stakeholder'
  | 'meeting'
  | 'meeting_note'
  | 'decision'
  | 'action_item'
  | 'open_question'
  | 'obligation'
  | 'transaction'
  | 'risk'
  | 'issue'
  | 'assumption'
  | 'block'
  | 'site_task';

/**
 * One hit from search_records (M13-05).
 *
 * `snippet` carries the matched phrase between guillemets — « » rather than
 * markup, because the component renders it as text and must not be handed
 * HTML it would have to trust.
 */
export interface SearchResult {
  kind: SearchKind;
  id: string;
  titleEn: string | null;
  titleTr: string | null;
  subtitle: string | null;
  snippet: string | null;
  occurredOn: string | null;
  confidentiality: Confidentiality;
  parentKind: SearchKind | null;
  parentId: string | null;
  rank: number;
}

/** A search somebody keeps (M13-11). Private to its owner. */
export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  kinds: SearchKind[] | null;
  createdAt: string;
}

/** The five defined uses, and no sixth (M13-07). Mirrors ai_task in 0019. */
export type AiTask =
  'archive_question' | 'meeting_minutes' | 'translation' | 'weekly_digest' | 'document_summary';

/**
 * A record an answer rested on (M13-04).
 *
 * `marker` is the exact string the model was told to cite, so the component
 * can find each citation in the text and turn it into a link.
 */
export interface AiSource {
  marker: string;
  kind: SearchKind;
  id: string;
  titleEn: string | null;
  titleTr: string | null;
  subtitle: string | null;
  confidentiality: Confidentiality;
}

/**
 * What came back.
 *
 * A refusal is a first-class outcome rather than an error: being told that
 * nothing in the archive answers the question, or that a legal question
 * belongs with the advocate, is the assistant working (M13-04, M13-08).
 */
export interface AiAnswer {
  text: string | null;
  /**
   * Always true for generated text. For every task but one the M13-08 label is
   * already inside `text`; for `translation` it is not, because that output is
   * written into a field where two lines of prose would corrupt the value
   * rather than caption it. There, the warning is carried by the
   * machine_translations marker instead.
   */
  draft: boolean;
  refused: 'legal_advice' | 'no_sources' | 'uncited' | null;
  messageEn: string | null;
  messageTr: string | null;
  /** Which model answered. Provenance the client must not guess. */
  model: string | null;
  sources: AiSource[];
  task: AiTask | null;
}

// ---------------------------------------------------------------------------
// Governance, compliance and academic readiness (M10)
// ---------------------------------------------------------------------------

export type GovernanceOrganKind = 'board_of_trustees' | 'management_board' | 'audit_committee';

export type MeetingCadence = 'monthly' | 'quarterly' | 'biannual' | 'annual' | 'as_required';

/**
 * One of the three organs (M10-02).
 *
 * `cadence`, `quorumMembers` and `quorumFraction` are all nullable, and the
 * nulls are load-bearing: an unrecorded quorum rule is a different problem
 * from a lax one, and the screen has to be able to say which.
 */
export interface GovernanceOrgan {
  id: string;
  kind: GovernanceOrganKind;
  nameEn: string;
  nameTr: string;
  remitEn: string | null;
  remitTr: string | null;
  cadence: MeetingCadence | null;
  quorumMembers: number | null;
  quorumFraction: number | null;
  charterClause: string | null;
  charterDocumentId: string | null;
  memberCount: number;
  confidentiality: Confidentiality;
}

/** A trustee (M10-01). The identity document is a reference, never a number. */
export interface Trustee {
  id: string;
  stakeholderId: string | null;
  fullName: string;
  appointingBody: string;
  appointedOn: string | null;
  termEndsOn: string | null;
  seatEn: string | null;
  seatTr: string | null;
  email: string | null;
  phone: string | null;
  identityDocumentId: string | null;
  active: boolean;
  stoodDownOn: string | null;
  note: string | null;
  confidentiality: Confidentiality;
  /**
   * Whether anything in the portal refers to this trustee: a seat on an organ,
   * a declared interest, a citation of the deed. Computed in the database
   * because the answer has to include rows the reader cannot see (0046).
   */
  onTheRecord: boolean;
  /**
   * Deleting is for a record that should never have existed. Kept apart from
   * `onTheRecord` on purpose: an ordinary reader may delete nothing, and a
   * screen that hides the control for the wrong reason teaches the wrong rule.
   */
  mayDelete: boolean;
}

export interface OrganMembership {
  id: string;
  organId: string;
  trusteeId: string | null;
  profileId: string | null;
  stakeholderId: string | null;
  name: string | null;
  seat: string | null;
  voting: boolean;
  startedOn: string;
  endedOn: string | null;
}

/**
 * Whether a sitting was competent to decide (M10-02).
 *
 * `quorumMet` is three-valued. Null means the organ has no recorded rule —
 * reporting that as `false` would send somebody looking for absentees when
 * the real gap is in the trust deed's transcription.
 */
export interface SittingQuorum {
  meetingId: string;
  title: string;
  heldAt: string;
  minutesStatus: string;
  organId: string;
  organKind: GovernanceOrganKind;
  organNameEn: string;
  organNameTr: string;
  seatsHeld: number;
  votingPresent: number;
  quorumRequired: number;
  quorumMet: boolean | null;
  confidentiality: Confidentiality;
}

/** Mirrors implementation_state in supabase/migrations/0021. */
export type ImplementationState =
  'no_actions_recorded' | 'abandoned' | 'outstanding' | 'implemented' | 'rescinded';

/** A resolution against the state of its actions (M10-04). */
export interface DecisionImplementation {
  decisionId: string;
  referenceNo: string | null;
  textEn: string | null;
  textTr: string | null;
  decidedOn: string | null;
  status: string;
  signedAt: string | null;
  organKind: GovernanceOrganKind | null;
  organNameEn: string | null;
  organNameTr: string | null;
  actions: number;
  done: number;
  cancelled: number;
  overdue: number;
  nextDue: string | null;
  implementation: ImplementationState;
  daysSince: number | null;
  confidentiality: Confidentiality;
}

export type ComplianceRegime = 'cap_164' | 'kra' | 'cue' | 'county' | 'other';
export type Recurrence = 'once' | 'annual' | 'biannual' | 'quarterly' | 'monthly';

/**
 * A statutory duty and the obligation standing behind it (M10-05).
 *
 * `notYetRaised` is the column the screen is for: a duty with no obligation
 * behind it is a duty nobody has taken on.
 */
export interface ComplianceEntry {
  requirementId: string;
  regime: ComplianceRegime;
  reference: string | null;
  titleEn: string;
  titleTr: string | null;
  recurrence: Recurrence;
  nextDueOn: string | null;
  obligationId: string | null;
  periodLabel: string | null;
  obligationState: string | null;
  verified: boolean | null;
  responsibleName: string | null;
  notYetRaised: boolean;
  confidentiality: Confidentiality;
}

export type AccreditationState =
  'not_started' | 'in_progress' | 'evidence_submitted' | 'met' | 'not_applicable';

/** One line of the CUE checklist (M10-06). `met` requires evidence. */
export interface AccreditationRequirement {
  id: string;
  body: string;
  code: string | null;
  titleEn: string;
  titleTr: string | null;
  detailEn: string | null;
  detailTr: string | null;
  state: AccreditationState;
  positionEn: string | null;
  positionTr: string | null;
  evidenceDocumentId: string | null;
  responsibleName: string | null;
  targetOn: string | null;
  metOn: string | null;
  note: string | null;
  confidentiality: Confidentiality;
}

export type StageState = 'not_started' | 'in_progress' | 'blocked' | 'done' | 'abandoned';

/** A stage of the charter road map (M10-07). Blocked is computed, not stored. */
export interface CharterStage {
  id: string;
  sequence: number;
  titleEn: string;
  titleTr: string | null;
  detailEn: string | null;
  detailTr: string | null;
  state: StageState;
  targetOn: string | null;
  completedOn: string | null;
  dependsOnStageId: string | null;
  dependsOnTitleEn: string | null;
  dependsOnTitleTr: string | null;
  dependsOnState: StageState | null;
  blockedByPredecessor: boolean;
  overdue: boolean;
  evidenceDocumentId: string | null;
  responsibleName: string | null;
  confidentiality: Confidentiality;
}

export type ProgrammeState =
  'proposed' | 'curriculum_drafted' | 'submitted_to_cue' | 'approved' | 'deferred' | 'withdrawn';

/** What the university intends to teach (M10-08). */
export interface AcademicProgramme {
  id: string;
  nameEn: string;
  nameTr: string | null;
  degree: string;
  faculty: string | null;
  state: ProgrammeState;
  curriculumDocumentId: string | null;
  requiredAcademicStaff: number | null;
  appointedAcademicStaff: number;
  /** Null where nobody has established the requirement — not zero. */
  staffGap: number | null;
  accreditationRequirementId: string | null;
  targetIntakeYear: number | null;
  note: string | null;
  confidentiality: Confidentiality;
}

/**
 * A quantified obligation against what has been evidenced (M10-09, M10-10).
 *
 * `percentOfTarget` is null where no target was set, because nought per cent
 * is a different claim from "not established".
 */
export interface ObligationProgress {
  targetId: string;
  obligationId: string;
  obligationTitleEn: string | null;
  obligationTitleTr: string | null;
  source: string;
  obligationState: string;
  basisEn: string;
  basisTr: string | null;
  targetValue: number | null;
  unit: string;
  periodLabel: string | null;
  dueOn: string | null;
  achieved: number | null;
  records: number;
  percentOfTarget: number | null;
  shortfall: number | null;
  confidentiality: Confidentiality;
}

/** A declared interest, and the vote it led somebody to stand out of (M10-11). */
export interface ConflictDeclaration {
  id: string;
  trusteeId: string | null;
  profileId: string | null;
  organId: string | null;
  personName: string | null;
  interestEn: string;
  interestTr: string | null;
  declaredOn: string;
  coversFrom: string | null;
  coversTo: string | null;
  documentId: string | null;
  recusedFromDecisionId: string | null;
  note: string | null;
  confidentiality: Confidentiality;
}

/** One strand of the first-intake board (M10-12). */
export interface ReadinessStrand {
  strand: 'infrastructure' | 'accreditation' | 'curriculum' | 'academic_staff';
  total: number;
  ready: number;
  impeded: number;
}

// ---------------------------------------------------------------------------
// Procurement and contracts (M14)
// ---------------------------------------------------------------------------

export type ProcurementKind =
  'legal_counsel' | 'contractor' | 'auditor' | 'consultant' | 'supplier' | 'other';

export type ProcurementState =
  'drafted' | 'approved' | 'candidates_invited' | 'awarded' | 'cancelled';

/** What is needed, why, and roughly what it costs (M14-01). */
export interface ProcurementRequest {
  id: string;
  referenceNo: string | null;
  kind: ProcurementKind;
  needEn: string;
  needTr: string | null;
  justificationEn: string;
  justificationTr: string | null;
  estimatedAmount: number;
  estimatedCurrency: CurrencyCode;
  estimatedAmountKes: number;
  requestedByName: string | null;
  requestedBy: string | null;
  requestedAt: string;
  neededBy: string | null;
  state: ProcurementState;
  approvedByName: string | null;
  approvedAt: string | null;
  decisionNote: string | null;
  cancelledReason: string | null;
  candidateCount: number;
  confidentiality: Confidentiality;
}

export type CandidateOutcome =
  'under_review' | 'shortlisted' | 'selected' | 'rejected' | 'withdrawn';

export type FeeBasis = 'fixed' | 'hourly' | 'daily' | 'percentage' | 'retainer' | 'other';

/**
 * One candidate in the comparison (M14-02, M4-13).
 *
 * `decisionNoteEn` is required by the database for a selection AND for a
 * rejection. The rejection note is the half that went missing when four
 * advocates were compared in scattered meeting notes.
 */
export interface ProcurementCandidate {
  id: string;
  requestId: string;
  organizationId: string | null;
  stakeholderId: string | null;
  name: string;
  scopeEn: string | null;
  scopeTr: string | null;
  feeAmount: number;
  feeCurrency: CurrencyCode;
  feeAmountKes: number;
  feeBasis: FeeBasis;
  referencesEn: string | null;
  strengthsEn: string | null;
  weaknessesEn: string | null;
  score: number | null;
  proposalDocumentId: string | null;
  outcome: CandidateOutcome;
  decisionNoteEn: string | null;
  decisionNoteTr: string | null;
  decidedOn: string | null;
  confidentiality: Confidentiality;
}

export type ContractState = 'draft' | 'signed' | 'active' | 'suspended' | 'expired' | 'terminated';

export type ValueBasis = 'fixed' | 'estimated' | 'capped' | 'rate_based';

export type NoticeBand = 'overdue' | 'within_30' | 'within_60' | 'within_90' | 'later';

/** A contract approaching its renewal or its end (M14-03, M14-05). */
export interface ContractAlert {
  contractId: string;
  referenceNo: string | null;
  counterpartyName: string;
  subjectEn: string;
  subjectTr: string | null;
  state: ContractState;
  startsOn: string | null;
  endsOn: string | null;
  renewalOn: string | null;
  noticeDays: number | null;
  valueAmount: number;
  valueCurrency: CurrencyCode;
  valueAmountKes: number;
  valueBasis: ValueBasis;
  renewalBand: NoticeBand | null;
  expiryBand: NoticeBand | null;
  nextDate: string | null;
  daysToExpiry: number | null;
  daysToRenewal: number | null;
  /** Whether a successor contract already exists. The loop-closing column. */
  renewalDrafted: boolean;
  confidentiality: Confidentiality;
}

export type ContractParty = 'us' | 'counterparty';

/** A term of a contract, and the M2 obligation it raised (M14-04). */
export interface ContractTerm {
  id: string;
  contractId: string;
  clause: string | null;
  titleEn: string;
  titleTr: string | null;
  detailEn: string | null;
  owedBy: ContractParty;
  dueOn: string | null;
  obligationId: string | null;
  obligationState: string | null;
  confidentiality: Confidentiality;
}

/** A dated, scored, append-only performance review (M14-06). */
export interface SupplierReview {
  id: string;
  contractId: string | null;
  organizationId: string | null;
  stakeholderId: string | null;
  contractorId: string | null;
  partyName: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  quality: number;
  timeliness: number;
  costControl: number;
  cooperation: number;
  overall: number;
  noteEn: string;
  noteTr: string | null;
  documentId: string | null;
  reviewedByName: string | null;
  reviewedAt: string;
  confidentiality: Confidentiality;
}

export type MilestoneState = 'planned' | 'due' | 'certified' | 'paid' | 'cancelled';

/**
 * Contract value against what is scheduled and what is paid (M14-07).
 *
 * `overCommitted` is reported rather than refused: a variation that raises
 * the price is a real thing, and blocking the entry only moves the true
 * figure into a spreadsheet.
 */
export interface ContractSettlement {
  contractId: string;
  referenceNo: string | null;
  counterpartyName: string;
  subjectEn: string;
  state: ContractState;
  valueBasis: ValueBasis;
  valueKes: number | null;
  milestones: number;
  scheduledKes: number | null;
  paidKes: number | null;
  nextDue: string | null;
  percentPaid: number | null;
  overCommitted: boolean;
  confidentiality: Confidentiality;
}

export interface ContractMilestone {
  id: string;
  contractId: string;
  sequence: number;
  titleEn: string;
  titleTr: string | null;
  dueOn: string | null;
  state: MilestoneState;
  amount: number;
  currency: CurrencyCode;
  amountKes: number;
  valuationId: string | null;
  paymentVoucherId: string | null;
  note: string | null;
  confidentiality: Confidentiality;
}

// ---------------------------------------------------------------------------
// The project backbone (M15)
// ---------------------------------------------------------------------------

export type MilestoneProgress = 'planned' | 'in_progress' | 'achieved' | 'missed' | 'abandoned';

/**
 * A milestone (M15-01).
 *
 * `targetOn` and `achievedOn` are separate, and `slipDays` is the
 * subtraction. Null slip means one of the two dates is not known yet, which
 * is not the same as a slip of nought; negative means it came in early, which
 * is not the same either.
 */
export interface Milestone {
  id: string;
  code: string | null;
  phaseId: string | null;
  phaseName: string | null;
  titleEn: string;
  titleTr: string | null;
  detailEn: string | null;
  detailTr: string | null;
  targetOn: string | null;
  achievedOn: string | null;
  slipDays: number | null;
  state: MilestoneProgress;
  critical: boolean;
  ownerName: string | null;
  ownerProfileId: string | null;
  evidenceDocumentId: string | null;
  note: string | null;
  confidentiality: Confidentiality;
}

/** A phase with what is actually in it, counted from the registers (M15-02). */
export interface PhasePosition {
  phaseId: string;
  code: string | null;
  nameEn: string;
  nameTr: string | null;
  sequence: number;
  startsOn: string | null;
  endsOn: string | null;
  scopeEn: string | null;
  scopeTr: string | null;
  objectiveEn: string | null;
  objectiveTr: string | null;
  blocks: number;
  blocksComplete: number;
  milestones: number;
  milestonesAchieved: number;
  milestonesMissed: number;
  nextTarget: string | null;
  budgetKes: number | null;
  /** Computed: the phase's end has passed with work outstanding. */
  overran: boolean;
  confidentiality: Confidentiality;
}

/** What the plan said on a given day (M15-06). */
export interface PlanBaseline {
  id: string;
  name: string;
  takenOn: string;
  takenByName: string | null;
  note: string | null;
}

/**
 * One milestone's target then against its target now (M15-06).
 *
 * The two numbers are deliberately apart. `targetMovedDays` is how far the
 * date was moved; `deliverySlipDays` is how late the thing actually was. A
 * project that moves its target four times and reports on time is exploiting
 * the difference.
 */
export interface BaselineVariance {
  baselineId: string;
  baselineName: string;
  takenOn: string;
  milestoneId: string;
  code: string | null;
  titleEn: string;
  titleTr: string | null;
  baselineTarget: string | null;
  currentTarget: string | null;
  targetMovedDays: number | null;
  baselineState: MilestoneProgress;
  currentState: MilestoneProgress;
  achievedOn: string | null;
  deliverySlipDays: number | null;
  confidentiality: Confidentiality;
}

export type DatePrecision = 'day' | 'month' | 'year';

export type ChronologyCategory =
  'founding' | 'land' | 'legal' | 'construction' | 'governance' | 'funding' | 'academic' | 'other';

/**
 * One event on the single time line (M15-07).
 *
 * `source` says which register it came out of, or 'recorded' for the years
 * before the registers existed. `precision` matters: a 1993 event known only
 * to the year must not be printed as a day.
 */
export interface ChronologyEvent {
  source: string;
  category: string;
  id: string;
  occurredOn: string;
  precision: DatePrecision;
  titleEn: string | null;
  titleTr: string | null;
  detailEn: string | null;
  documentId: string | null;
  sourceNote: string | null;
  legalCaseId: string | null;
  confidentiality: Confidentiality;
}

/** One of the dates that belongs at the top of every screen (M15-04). */
export interface CriticalDate {
  kind: string;
  id: string;
  titleEn: string | null;
  titleTr: string | null;
  dueOn: string;
  dueAt: string | null;
  detail: string | null;
  legalCaseId: string | null;
  meetingId: string | null;
  state: string | null;
  needsAttention: boolean;
  /** Signed: negative means the date has already passed. */
  daysAway: number;
  confidentiality: Confidentiality;
}

/* Compiled reports (M12-06 … M12-09).
 *
 * A report here is a compilation and not a document: each row names the
 * register its figure came from, which is how "no material figure without a
 * source" is met. The rows are frozen into the run at approval, so what is
 * published is what somebody signed. */

export type ReportKind = 'board_pack' | 'donor_report' | 'status_report';

export type ReportState = 'draft' | 'approved' | 'published' | 'withdrawn';

export interface ReportRow {
  section: string;
  ord: number;
  labelEn: string | null;
  labelTr: string | null;
  valueText: string | null;
  valueNumber: number | null;
  unit: string | null;
  entityKind: string | null;
  entityId: string | null;
  /** The register this came out of. Never empty for a row carrying a figure. */
  sourceNote: string | null;
  confidentiality: Confidentiality;
}

export interface ReportRun {
  id: string;
  kind: ReportKind;
  title: string;
  periodFrom: string | null;
  periodTo: string | null;
  meetingId: string | null;
  meetingTitle: string | null;
  stakeholderId: string | null;
  stakeholderName: string | null;
  preparedByName: string | null;
  preparedAt: string;
  state: ReportState;
  approvedByName: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  withdrawnReason: string | null;
  rows: ReportRow[];
  confidentiality: Confidentiality;
}

/* Action candidates (M3-05, M3-07, G-04).
 *
 * A line of action text from a minute, waiting for the owner and the date
 * that would make it an action. Not an action and not counted as one. */

export type CandidateState = 'pending' | 'adopted' | 'dismissed';

export interface ActionCandidate {
  id: string;
  meetingId: string;
  meetingTitle: string;
  meetingTitleTr: string | null;
  heldAt: string;
  sequence: number;
  textEn: string | null;
  textTr: string | null;
  suggestedOwnerStakeholderId: string | null;
  suggestedOwnerName: string | null;
  suggestedDueOn: string | null;
  state: CandidateState;
  actionItemId: string | null;
  dismissedReason: string | null;
  /** What the sentence itself states, which decides how much work it is. */
  namesAnOwner: boolean;
  namesADate: boolean;
  confidentiality: Confidentiality;
}

// ---------------------------------------------------------------------------
// The watch book (M7-18, M7-12, M6-11)
// ---------------------------------------------------------------------------

/** Mirrors watch_post. The gate and the perimeter belong to no block. */
export type WatchPost = 'main_gate' | 'perimeter' | 'block' | 'store' | 'other';

export type IncidentKind =
  | 'accident'
  | 'near_miss'
  | 'security_breach'
  | 'intrusion'
  | 'threat'
  | 'theft'
  | 'damage'
  | 'dispute'
  | 'fire'
  | 'other';

/**
 * Whether a public authority was told. `unknown` is the default and is not
 * `not_required`: nobody having recorded a decision is an unfinished job,
 * deciding none was needed is a decision.
 */
export type AuthorityNotice = 'unknown' | 'not_required' | 'notified';

/**
 * A watch as written down. Comes from `watch_register`, so `roundsMissing` is
 * null when no expected count was recorded — two rounds short of nothing is
 * not a shortfall of two.
 */
export interface WatchShift {
  watchShiftId: string;
  post: WatchPost;
  constructionBlockId: string | null;
  blockCode: string | null;
  onWatch: string;
  watchFirm: string | null;
  beganAt: string;
  endedAt: string | null;
  roundsExpected: number | null;
  roundsRecorded: number;
  roundsMissing: number | null;
  lastRoundAt: string | null;
  /** How long after the watch began it reached the book. */
  loggedHoursAfterStart: number | null;
  neverClosed: boolean;
  handoverNote: string | null;
  confidentiality: Confidentiality;
}

export interface WatchRound {
  id: string;
  watchShiftId: string;
  walkedAt: string;
  route: string | null;
  note: string | null;
}

/**
 * A gate entry with no exit recorded. Not a person on site: the record says
 * only that nobody wrote the exit down, and `outlastedItsWatch` marks the
 * ones where that is almost certainly what happened.
 */
export interface GateEntry {
  gateVisitId: string;
  personName: string;
  organisation: string | null;
  stakeholderId: string | null;
  purpose: string | null;
  vehiclePlate: string | null;
  escortedBy: string | null;
  idDocumentSeen: boolean;
  enteredAt: string;
  watchShiftId: string | null;
  watchEndedAt: string | null;
  onWatch: string | null;
  openHours: number;
  outlastedItsWatch: boolean;
  confidentiality: Confidentiality;
}

export interface GateVisit {
  id: string;
  watchShiftId: string | null;
  personName: string;
  organisation: string | null;
  purpose: string | null;
  vehiclePlate: string | null;
  escortedBy: string | null;
  idDocumentSeen: boolean;
  enteredAt: string;
  exitedAt: string | null;
  confidentiality: Confidentiality;
}

export interface SiteIncident {
  siteIncidentId: string;
  kind: IncidentKind;
  occurredAt: string;
  constructionBlockId: string | null;
  blockCode: string | null;
  watchShiftId: string | null;
  descriptionEn: string;
  descriptionTr: string | null;
  interventionEn: string | null;
  interventionTr: string | null;
  /** Nobody wrote down what was done, which is not the same as nothing. */
  interventionUnrecorded: boolean;
  injuredCount: number | null;
  severity: number | null;
  policeObNumber: string | null;
  authorityNotice: AuthorityNotice;
  notifiedAt: string | null;
  notificationDocumentId: string | null;
  riskId: string | null;
  legalCaseId: string | null;
  confirmed: boolean;
  confirmedAt: string | null;
  evidenceCount: number;
  /** The write-up lag, in hours, against when the incident happened. */
  loggedHoursAfter: number | null;
  confidentiality: Confidentiality;
}

/** What the watch book does not say. Every number is an unfinished job. */
export interface WatchHealth {
  watchesNeverClosed: number;
  watchesWithoutAnExpectedCount: number;
  watchesShortOfTheirRounds: number;
  entriesWithoutAnExit: number;
  entriesOutlastingTheirWatch: number;
  incidentsWithoutEvidence: number;
  incidentsWithoutAResponse: number;
  seriousIncidentsWithNoNotificationDecision: number;
  incidentsNotYetConfirmed: number;
}

// ---------------------------------------------------------------------------
// The other half of the contract-to-valuation match (M14-07, 0038)
// ---------------------------------------------------------------------------

/**
 * Four answers, not two. "No valuation yet" is the normal state of a payment
 * plan, and two amounts in different currencies cannot be compared at all —
 * a valuation carries no exchange rate, so calling them unequal would be
 * inventing the comparison.
 */
export type AmountVerdict = 'unmatched' | 'different_currencies' | 'agree' | 'disagree';

export interface MilestoneMatch {
  contractMilestoneId: string;
  contractId: string;
  referenceNo: string | null;
  counterpartyName: string;
  sequence: number;
  titleEn: string;
  titleTr: string | null;
  state: MilestoneState;
  dueOn: string | null;
  amount: number;
  currency: CurrencyCode;
  valuationId: string | null;
  paymentVoucherId: string | null;
  valuationAmount: number | null;
  valuationCurrency: CurrencyCode | null;
  constructionBlockId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  valuationState: ValuationState | null;
  qsCertifiedAt: string | null;
  directorApprovedAt: string | null;
  amountVerdict: AmountVerdict;
  /** The schedule claiming a signature the works register does not hold. */
  claimsACertificationTheWorksDoNot: boolean;
  matchedToAnotherFirmsWork: boolean;
  confidentiality: Confidentiality;
}

/**
 * Measured work with no instalment against it — the direction every earlier
 * view was blind to, because they all started from the schedule.
 */
export interface UnscheduledValuation {
  valuationId: string;
  constructionBlockId: string | null;
  blockCode: string | null;
  contractorId: string | null;
  contractorName: string | null;
  periodStart: string;
  periodEnd: string;
  amount: number;
  currency: CurrencyCode;
  state: ValuationState;
  certified: boolean;
  paidAt: string | null;
  /** Null where there is not exactly one live contract it could belong to. */
  theOnlyLiveContractForThatFirm: string | null;
  confidentiality: Confidentiality;
}

/** Where the payment schedule and the works register disagree. */
export interface PaymentMatchingHealth {
  instalmentsWhoseAmountDisagrees: number;
  instalmentsThatCannotBeCompared: number;
  instalmentsClaimingAnUncertifiedMeasurement: number;
  instalmentsMatchedToAnotherFirmsWork: number;
  settledInstalmentsWithNoMeasurement: number;
  measuredWorkWithNoInstalment: number;
  certifiedWorkWithNoInstalment: number;
}

// ---------------------------------------------------------------------------
// Periodic financial close (M8-16, 0039)
// ---------------------------------------------------------------------------

export type PeriodState = 'open' | 'closed';

/**
 * A period, the figures frozen at its close, and what has been entered into
 * it since. The last two are why the frozen figures are stored rather than
 * recomputed: a total that moves when a late invoice arrives is not a close.
 */
export interface FinancialPeriod {
  financialPeriodId: string;
  code: string;
  startsOn: string;
  endsOn: string;
  state: PeriodState;
  closedAt: string | null;
  closingTransactions: number | null;
  closingLedgerKes: number | null;
  closingVouchersPaidKes: number | null;
  closingReceiptsKes: number | null;
  /** Counted at the close and frozen with it. Null until the close is taken. */
  gaps: Record<string, number> | null;
  note: string | null;
  entriesAddedAfterTheClose: number;
  addedAfterTheCloseKes: number;
  confidentiality: Confidentiality;
}

// ---------------------------------------------------------------------------
// Scenario and sensitivity analysis (M6-12, 0040)
// ---------------------------------------------------------------------------

export type ScenarioState = 'considered' | 'retired';

/**
 * A set of risks somebody thinks could land together, and what the register
 * can honestly say about it.
 *
 * There is no combined score and no combined likelihood, here or in the
 * database. `likelihood` and `impact` are ordinal scales from one to five, so
 * they cannot be added across risks; and the risks are correlated with
 * nothing recording the correlation, so they cannot be multiplied either.
 * `worstRecordedScore` is a maximum of real scores, which is a comparison the
 * data supports.
 */
export interface RiskScenario {
  scenarioId: string;
  nameEn: string;
  nameTr: string | null;
  rationaleEn: string;
  rationaleTr: string | null;
  horizonOn: string | null;
  state: ScenarioState;
  retiredReason: string | null;
  members: number;
  /** Two risks or it is not a scenario. Reported, not refused. */
  isAScenario: boolean;
  worstRecordedScore: number | null;
  recordedScores: number[];
  membersWithoutAnOwner: number;
  membersWithoutATrigger: number;
  membersWithoutAResponse: number;
  membersAlreadyMaterialised: number;
  /** The honest half of sensitivity, from the recorded score history. */
  membersRescoredUpwardLately: number;
  confidentiality: Confidentiality;
}

/** A thing more than one risk in a scenario reaches. */
export interface ScenarioOverlap {
  scenarioId: string;
  kind: string;
  targetId: string | null;
  targetLabel: string | null;
  risksReaching: number;
  riskIds: string[];
}

// ---------------------------------------------------------------------------
// The governance reference, cited to the trust deed (M10-13, 0041)
// ---------------------------------------------------------------------------

/**
 * A clause of the trust deed as somebody recorded it.
 *
 * Three things are kept apart on purpose. `quotedText` is the deed's own
 * words and cannot exist without the file it is quoted from.
 * `summaryEn`/`summaryTr` are somebody's paraphrase and are never shown as
 * the deed's words — a paraphrase read out as the deed is how a misquotation
 * enters a court record. And `checkedAgainstTheDeed` is somebody having
 * opened the file and found the clause where the citation says it is.
 */
export interface CharterClause {
  clauseId: string;
  reference: string;
  headingEn: string | null;
  headingTr: string | null;
  quotedText: string | null;
  summaryEn: string | null;
  summaryTr: string | null;
  documentId: string | null;
  locatedAt: string | null;
  checkedAgainstTheDeedAt: string | null;
  carriesTheDeedsWords: boolean;
  checkedAgainstTheDeed: boolean;
  deedNotAttached: boolean;
  citations: number;
  citedFor: string[];
  confidentiality: Confidentiality;
}

export interface CharterCitation {
  citationId: string;
  clauseId: string;
  reference: string;
  clauseChecked: boolean;
  subjectKind: string;
  subjectLabel: string | null;
  noteEn: string | null;
  noteTr: string | null;
  confidentiality: Confidentiality;
}

/** A governance record with no clause of the deed cited against it. */
export interface UncitedGovernance {
  subjectKind: string;
  subjectId: string;
  subjectLabel: string;
  /** A rule that will be enforced against somebody, so an uncited one is not tidiness. */
  carriesARule: boolean;
  clauseTypedInFreeText: string | null;
  typedClauseIsNotInTheRegister: boolean;
  confidentiality: Confidentiality;
}

// ---------------------------------------------------------------------------
// Similar-record suggestion (M13-12, 0042)
// ---------------------------------------------------------------------------

/**
 * Why a record was suggested. The two are not the same strength of claim and
 * the screen never renders them the same way: a recorded link is a fact
 * somebody entered, shared terms are a guess.
 */
export type SuggestionBasis = 'recorded_link' | 'shared_terms';

export interface SimilarRecord {
  kind: SearchKind;
  id: string;
  titleEn: string | null;
  titleTr: string | null;
  subtitle: string | null;
  occurredOn: string | null;
  confidentiality: Confidentiality;
  basis: SuggestionBasis;
  /** What the link is, in words. */
  relation: string;
  /**
   * The terms the guess matched on. Empty for a recorded link, which does not
   * rest on words. A suggestion that cannot be dismissed cannot be trusted,
   * so these are always shown.
   */
  sharedTerms: string[];
  termsInCommon: number;
}

// ---------------------------------------------------------------------------
// Comments inside a document, and comparing two versions (M9-14, M7-17, 0043)
// ---------------------------------------------------------------------------

/**
 * A comment anchored to a document version and a page.
 *
 * There is no coordinate here and none in the database. The portal does not
 * read document content, so a highlight over a text range would be a
 * rectangle at a position that moves with the viewer, the zoom and the
 * version. `quotedExcerpt` is the commenter's own transcription and the
 * screen says so: the portal cannot check that those words are on that page.
 */
export interface DocumentComment {
  commentId: string;
  documentId: string;
  documentVersionId: string;
  versionNo: number;
  fileName: string;
  revisionLabel: string | null;
  pageNo: number | null;
  quotedExcerpt: string | null;
  bodyEn: string | null;
  bodyTr: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  createdBy: string | null;
  createdAt: string;
  /** Page 12 of revision B is not page 12 of revision C. */
  writtenAgainstASupersededVersion: boolean;
  currentVersionNo: number | null;
  portalHasNotReadTheFile: boolean;
  confidentiality: Confidentiality;
}

/**
 * Three answers, because "different" is a claim the portal can only make
 * about files it has read.
 */
export type BytesVerdict = 'unread' | 'byte_identical' | 'different_bytes';

export interface DocumentVersionStep {
  documentId: string;
  earlierVersionNo: number;
  earlierRevisionLabel: string | null;
  earlierFileName: string;
  earlierByteSize: number | null;
  laterVersionId: string;
  laterVersionNo: number;
  laterRevisionLabel: string | null;
  laterFileName: string;
  laterByteSize: number | null;
  laterUploadedAt: string;
  changeSummaryEn: string | null;
  changeSummaryTr: string | null;
  bytesVerdict: BytesVerdict;
  /** Nobody wrote down what changed, which is not the same as nothing changing. */
  changeNotDescribed: boolean;
  confidentiality: Confidentiality;
}
