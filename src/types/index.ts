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
  | 'stakeholders'
  | 'meetings'
  | 'finance'
  | 'documents'
  | 'communication'
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

export interface ConstructionBlock {
  id: string;
  name: string;
  code: string;
  floors: number;
  totalAreaSqm: number;
  progressPercent: number;
  status: 'foundation' | 'structural_frame' | 'roofing_urgent' | 'interior_finishing' | 'planned';
  budgetKShs: number;
  spentKShs: number;
  leadEngineer: string;
  urgentPreservationNeeded: boolean;
  preservationActionEn: string;
  preservationActionTr: string;
  lastInspectionDate: string;
  contractor: string;
  items: {
    id: string;
    task: string;
    status: 'completed' | 'in_progress' | 'blocked_by_status_quo' | 'urgent_preservation';
    dueDate: string;
  }[];
}

export interface DocumentItem {
  id: string;
  title: string;
  category:
    | 'legal_pleadings'
    | 'trust_deed'
    | 'court_order'
    | 'architectural'
    | 'boq_finance'
    | 'accreditation_cue'
    | 'site_survey';
  version: string;
  fileFormat: string;
  fileSize: string;
  uploadedBy: string;
  uploadedDate: string;
  sha256Hash: string;
  encrypted: boolean;
  accessRoles: UserRole[];
  status: 'approved' | 'under_review' | 'archived';
  descriptionEn: string;
  descriptionTr: string;
  downloadUrl?: string;
  versionsCount: number;
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
  amountKShs: number;
  payee: string;
  syncedWithAccounting: boolean;
  syncSource: 'QuickBooks' | 'SAP B1' | 'Xero' | 'Tally' | 'Manual';
  verifiedByAudit: boolean;
}

export interface AccountingApiConfig {
  provider: 'QuickBooks' | 'SAP B1' | 'Xero' | 'Tally';
  apiUrl: string;
  apiKeyMasked: string;
  status: 'connected' | 'disconnected' | 'syncing' | 'error';
  lastSyncTimestamp: string;
  syncFrequency: 'hourly' | 'daily' | 'realtime';
  autoSyncBills: boolean;
  autoSyncAssets: boolean;
}

export interface CommunicationThread {
  id: string;
  title: string;
  channel: 'all' | 'legal' | 'construction' | 'trustees' | 'finance';
  author: string;
  authorRole: UserRole;
  authorOrg: string;
  timestamp: string;
  unread: boolean;
  pinned: boolean;
  urgent: boolean;
  messages: {
    id: string;
    /** The profile id of the sender; identity is never matched on a name. */
    senderId: string;
    sender: string;
    role: UserRole;
    timestamp: string;
    text: string;
    attachment?: string;
  }[];
}

export interface DeadlineNotification {
  id: string;
  titleEn: string;
  titleTr: string;
  dueDate: string;
  daysRemaining: number;
  urgency: 'critical' | 'warning' | 'info';
  category: 'legal' | 'construction' | 'governance' | 'finance';
  actionRequiredEn: string;
  actionRequiredTr: string;
  targetRole: UserRole[];
}

export interface TrusteeMember {
  id: string;
  name: string;
  nationalId: string;
  appointedBy:
    | 'Suleiman Shahbal Foundation'
    | 'Universal Education Foundation'
    | 'Africa Foundation (Afrika Vakfı)';
  origin: 'Mombasa/Kenya' | 'Ankara/Türkiye' | 'İstanbul/Türkiye';
  roleInTrust: string;
  activeStatus: boolean;
}

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
