export type Language = 'en' | 'tr';

export type UserRole =
  | 'trustee' // Board of Trustees (Shahbal, UEF, Afrika Vakfı)
  | 'executive' // Board of Directors & Project Execs
  | 'legal_counsel' // Advocates (Simon Karina, Khatib & Co, SC)
  | 'contractor_qs' // Site Engineers, QS Stephen Ndibui Kamau, Contractors
  | 'auditor_finance' // Audit Committee, Financial Officers
  | 'regulatory_cue'; // CUE, Land Registrar, County Government

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  organization: string;
  avatar?: string;
}

export type ActiveTab =
  | 'dashboard'
  | 'project_info'
  | 'legal'
  | 'construction'
  | 'governance'
  | 'finance'
  | 'documents'
  | 'communication'
  | 'clarifications';

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
  keyParties: {
    appellantOrClaimant: string;
    respondentOrDefendant: string;
    lawyers: string;
  };
  keyIssues: string[];
  orders: {
    date: string;
    title: string;
    detail: string;
    status: 'active' | 'superseded' | 'pending';
  }[];
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
