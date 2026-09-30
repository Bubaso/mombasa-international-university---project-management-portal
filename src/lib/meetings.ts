import type {
  ActionStatus,
  AttendanceRole,
  DecisionStatus,
  Language,
  MeetingKind,
  MeetingStatus,
  MinutesStatus,
  NoteSection,
  PriorityLevel,
  QuestionStatus,
  VoteOutcome,
} from '../types';

type Bilingual = { tr: string; en: string };

const pick = (map: Bilingual, language: Language) => map[language];

const MEETING_KINDS: Record<MeetingKind, Bilingual> = {
  internal: { tr: 'İç toplantı', en: 'Internal' },
  trustee: { tr: 'Mütevelli', en: 'Trustee' },
  official: { tr: 'Resmî', en: 'Official' },
  partner: { tr: 'Ortak', en: 'Partner' },
  legal: { tr: 'Hukuk', en: 'Legal' },
  site: { tr: 'Saha', en: 'Site' },
  community: { tr: 'Topluluk', en: 'Community' },
};

export const MEETING_KIND_VALUES = Object.keys(MEETING_KINDS) as MeetingKind[];
export const meetingKindLabel = (k: MeetingKind, l: Language) => pick(MEETING_KINDS[k], l);

const MEETING_STATUSES: Record<MeetingStatus, Bilingual> = {
  planned: { tr: 'Planlandı', en: 'Planned' },
  in_progress: { tr: 'Devam ediyor', en: 'In progress' },
  completed: { tr: 'Tamamlandı', en: 'Completed' },
  cancelled: { tr: 'İptal', en: 'Cancelled' },
};

export const MEETING_STATUS_VALUES = Object.keys(MEETING_STATUSES) as MeetingStatus[];
export const meetingStatusLabel = (s: MeetingStatus, l: Language) => pick(MEETING_STATUSES[s], l);

const MINUTES_STATUSES: Record<MinutesStatus, Bilingual> = {
  draft: { tr: 'Taslak', en: 'Draft' },
  circulated: { tr: 'Görüşe açıldı', en: 'Circulated' },
  final: { tr: 'Kesinleşti', en: 'Final' },
};

export const MINUTES_STATUS_VALUES = Object.keys(MINUTES_STATUSES) as MinutesStatus[];
export const minutesStatusLabel = (s: MinutesStatus, l: Language) => pick(MINUTES_STATUSES[s], l);

/** Final is styled as settled, not as success: it means closed to edits. */
export const MINUTES_STATUS_STYLES: Record<MinutesStatus, string> = {
  draft: 'border-slate-300 bg-slate-100 text-slate-700',
  circulated: 'border-amber-300 bg-amber-50 text-amber-800',
  final: 'border-slate-400 bg-slate-800 text-white',
};

const ATTENDANCE_ROLES: Record<AttendanceRole, Bilingual> = {
  chair: { tr: 'Başkan', en: 'Chair' },
  secretary: { tr: 'Yazman', en: 'Secretary' },
  participant: { tr: 'Katılımcı', en: 'Participant' },
  observer: { tr: 'Gözlemci', en: 'Observer' },
};

export const ATTENDANCE_ROLE_VALUES = Object.keys(ATTENDANCE_ROLES) as AttendanceRole[];
export const attendanceRoleLabel = (r: AttendanceRole, l: Language) => pick(ATTENDANCE_ROLES[r], l);

/**
 * The five headings the team already writes under, in the order they are
 * written in.
 */
const NOTE_SECTIONS: Record<NoteSection, Bilingual> = {
  agenda: { tr: 'Gündem', en: 'Agenda' },
  discussed: { tr: 'Görüşülenler', en: 'Discussed' },
  decisions: { tr: 'Kararlar', en: 'Decisions' },
  actions: { tr: 'Aksiyonlar', en: 'Actions' },
  outcomes: { tr: 'Çıktılar', en: 'Outcomes' },
  open_questions: { tr: 'Açık sorular', en: 'Open questions' },
};

export const NOTE_SECTION_VALUES: NoteSection[] = [
  'agenda',
  'discussed',
  'decisions',
  'actions',
  'outcomes',
  'open_questions',
];
export const noteSectionLabel = (s: NoteSection, l: Language) => pick(NOTE_SECTIONS[s], l);

const VOTE_OUTCOMES: Record<VoteOutcome, Bilingual> = {
  unanimous: { tr: 'Oybirliği', en: 'Unanimous' },
  majority: { tr: 'Oy çokluğu', en: 'Majority' },
  carried_with_dissent: { tr: 'Karşı oyla kabul', en: 'Carried with dissent' },
  deferred: { tr: 'Ertelendi', en: 'Deferred' },
};

export const VOTE_OUTCOME_VALUES = Object.keys(VOTE_OUTCOMES) as VoteOutcome[];
export const voteOutcomeLabel = (v: VoteOutcome, l: Language) => pick(VOTE_OUTCOMES[v], l);

const DECISION_STATUSES: Record<DecisionStatus, Bilingual> = {
  in_force: { tr: 'Yürürlükte', en: 'In force' },
  implemented: { tr: 'Uygulandı', en: 'Implemented' },
  rescinded: { tr: 'Geri alındı', en: 'Rescinded' },
  suspended: { tr: 'Askıda', en: 'Suspended' },
};

export const DECISION_STATUS_VALUES = Object.keys(DECISION_STATUSES) as DecisionStatus[];
export const decisionStatusLabel = (s: DecisionStatus, l: Language) =>
  pick(DECISION_STATUSES[s], l);

export const DECISION_STATUS_STYLES: Record<DecisionStatus, string> = {
  in_force: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  implemented: 'border-teal-300 bg-teal-50 text-teal-800',
  rescinded: 'border-slate-300 bg-slate-100 text-slate-600',
  suspended: 'border-amber-300 bg-amber-50 text-amber-800',
};

const ACTION_STATUSES: Record<ActionStatus, Bilingual> = {
  open: { tr: 'Açık', en: 'Open' },
  in_progress: { tr: 'Devam ediyor', en: 'In progress' },
  blocked: { tr: 'Tıkandı', en: 'Blocked' },
  done: { tr: 'Tamamlandı', en: 'Done' },
  cancelled: { tr: 'İptal', en: 'Cancelled' },
};

export const ACTION_STATUS_VALUES = Object.keys(ACTION_STATUSES) as ActionStatus[];
export const actionStatusLabel = (s: ActionStatus, l: Language) => pick(ACTION_STATUSES[s], l);

export const ACTION_STATUS_STYLES: Record<ActionStatus, string> = {
  open: 'border-slate-300 bg-slate-100 text-slate-700',
  in_progress: 'border-teal-300 bg-teal-50 text-teal-800',
  blocked: 'border-rose-300 bg-rose-50 text-rose-800',
  done: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  cancelled: 'border-slate-300 bg-white text-slate-500',
};

const QUESTION_STATUSES: Record<QuestionStatus, Bilingual> = {
  open: { tr: 'Açık', en: 'Open' },
  answered: { tr: 'Cevaplandı', en: 'Answered' },
  escalated: { tr: 'Üste taşındı', en: 'Escalated' },
  dropped: { tr: 'Bırakıldı', en: 'Dropped' },
};

export const QUESTION_STATUS_VALUES = Object.keys(QUESTION_STATUSES) as QuestionStatus[];
export const questionStatusLabel = (s: QuestionStatus, l: Language) =>
  pick(QUESTION_STATUSES[s], l);

const PRIORITIES: Record<PriorityLevel, Bilingual> = {
  low: { tr: 'Düşük', en: 'Low' },
  normal: { tr: 'Normal', en: 'Normal' },
  high: { tr: 'Yüksek', en: 'High' },
  critical: { tr: 'Kritik', en: 'Critical' },
};

export const PRIORITY_VALUES = Object.keys(PRIORITIES) as PriorityLevel[];
export const priorityLabel = (p: PriorityLevel, l: Language) => pick(PRIORITIES[p], l);

export const PRIORITY_STYLES: Record<PriorityLevel, string> = {
  low: 'border-slate-200 bg-white text-slate-500',
  normal: 'border-slate-300 bg-slate-100 text-slate-700',
  high: 'border-amber-300 bg-amber-50 text-amber-800',
  critical: 'border-rose-300 bg-rose-50 text-rose-800',
};

/**
 * The text to show, preferring the reader's language and falling back rather
 * than showing nothing. A record written only in Turkish still has to be
 * readable by someone reading in English, even if only in Turkish.
 */
export function bilingual(
  en: string | null | undefined,
  tr: string | null | undefined,
  language: Language,
): string {
  const preferred = language === 'tr' ? tr : en;
  return (preferred ?? '').trim() || (language === 'tr' ? en : tr) || '';
}

/** Whether a date has passed, for a date-only column. */
export function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return dueDate < new Date().toISOString().slice(0, 10);
}

/** Days until a due date; negative when it has passed. */
export function daysUntil(dueDate: string | null): number | null {
  if (!dueDate) return null;
  const today = new Date().toISOString().slice(0, 10);
  const ms = new Date(`${dueDate}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}
