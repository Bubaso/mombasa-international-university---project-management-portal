/** Labels for the governance and readiness registers (M10). */
import type {
  AccreditationState,
  ComplianceRegime,
  GovernanceOrganKind,
  ImplementationState,
  MeetingCadence,
  ProgrammeState,
  StageState,
} from '../types';

type Pair = { tr: string; en: string };

const pick = (pair: Pair | undefined, language: 'tr' | 'en', fallback: string) =>
  pair ? (language === 'tr' ? pair.tr : pair.en) : fallback;

const ORGAN: Record<GovernanceOrganKind, Pair> = {
  board_of_trustees: { tr: 'Mütevelli Heyeti', en: 'Board of Trustees' },
  management_board: { tr: 'Yönetim Kurulu', en: 'Management Board' },
  audit_committee: { tr: 'Denetim Komitesi', en: 'Audit Committee' },
};

const CADENCE: Record<MeetingCadence, Pair> = {
  monthly: { tr: 'aylık', en: 'monthly' },
  quarterly: { tr: 'üç aylık', en: 'quarterly' },
  biannual: { tr: 'altı aylık', en: 'twice a year' },
  annual: { tr: 'yıllık', en: 'yearly' },
  as_required: { tr: 'gerektiğinde', en: 'as required' },
};

/**
 * The implementation states, and the wording matters.
 *
 * "no_actions_recorded" is not "not started": nobody has said what carrying
 * the resolution out would consist of, which is a different thing from having
 * said it and not begun.
 */
const IMPLEMENTATION: Record<ImplementationState, Pair> = {
  no_actions_recorded: { tr: 'aksiyona bağlanmamış', en: 'not turned into an action' },
  abandoned: { tr: 'aksiyonları iptal edilmiş', en: 'actions all cancelled' },
  outstanding: { tr: 'uygulanmayı bekliyor', en: 'outstanding' },
  implemented: { tr: 'uygulanmış', en: 'implemented' },
  rescinded: { tr: 'geri alınmış', en: 'rescinded' },
};

const REGIME: Record<ComplianceRegime, Pair> = {
  cap_164: { tr: 'Fasıl 164', en: 'Cap 164' },
  kra: { tr: 'KRA (vergi)', en: 'KRA (tax)' },
  cue: { tr: 'CUE', en: 'CUE' },
  county: { tr: 'Valilik', en: 'County' },
  other: { tr: 'diğer', en: 'other' },
};

const ACCREDITATION: Record<AccreditationState, Pair> = {
  not_started: { tr: 'başlanmadı', en: 'not started' },
  in_progress: { tr: 'sürüyor', en: 'in progress' },
  evidence_submitted: { tr: 'kanıt sunuldu', en: 'evidence submitted' },
  met: { tr: 'karşılandı', en: 'met' },
  not_applicable: { tr: 'kapsam dışı', en: 'not applicable' },
};

const STAGE: Record<StageState, Pair> = {
  not_started: { tr: 'başlanmadı', en: 'not started' },
  in_progress: { tr: 'sürüyor', en: 'in progress' },
  blocked: { tr: 'tıkandı', en: 'blocked' },
  done: { tr: 'tamam', en: 'done' },
  abandoned: { tr: 'bırakıldı', en: 'abandoned' },
};

const PROGRAMME: Record<ProgrammeState, Pair> = {
  proposed: { tr: 'önerildi', en: 'proposed' },
  curriculum_drafted: { tr: 'müfredat hazırlandı', en: 'curriculum drafted' },
  submitted_to_cue: { tr: 'CUE’ye sunuldu', en: 'submitted to CUE' },
  approved: { tr: 'onaylandı', en: 'approved' },
  deferred: { tr: 'ertelendi', en: 'deferred' },
  withdrawn: { tr: 'geri çekildi', en: 'withdrawn' },
};

const STRAND: Record<string, Pair> = {
  infrastructure: { tr: 'Altyapı', en: 'Infrastructure' },
  accreditation: { tr: 'Akreditasyon', en: 'Accreditation' },
  curriculum: { tr: 'Müfredat', en: 'Curriculum' },
  academic_staff: { tr: 'Akademik kadro', en: 'Academic staff' },
};

export const organLabel = (k: GovernanceOrganKind, l: 'tr' | 'en') => pick(ORGAN[k], l, k);
export const cadenceLabel = (k: MeetingCadence, l: 'tr' | 'en') => pick(CADENCE[k], l, k);
export const implementationLabel = (k: ImplementationState, l: 'tr' | 'en') =>
  pick(IMPLEMENTATION[k], l, k);
export const regimeLabel = (k: ComplianceRegime, l: 'tr' | 'en') => pick(REGIME[k], l, k);
export const accreditationLabel = (k: AccreditationState, l: 'tr' | 'en') =>
  pick(ACCREDITATION[k], l, k);
export const stageLabel = (k: StageState, l: 'tr' | 'en') => pick(STAGE[k], l, k);
export const programmeLabel = (k: ProgrammeState, l: 'tr' | 'en') => pick(PROGRAMME[k], l, k);
export const strandLabel = (k: string, l: 'tr' | 'en') => pick(STRAND[k], l, k);

/** The colour each implementation state earns. */
export const IMPLEMENTATION_TONE: Record<ImplementationState, string> = {
  // Amber rather than grey: a resolution nobody actioned is a problem, and
  // grey reads as "fine, nothing to do".
  no_actions_recorded: 'border-amber-300 bg-amber-50 text-amber-900',
  abandoned: 'border-rose-300 bg-rose-50 text-rose-900',
  outstanding: 'border-sky-300 bg-sky-50 text-sky-900',
  implemented: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  rescinded: 'border-slate-300 bg-slate-100 text-slate-600',
};

export const ACCREDITATION_TONE: Record<AccreditationState, string> = {
  not_started: 'border-slate-300 bg-slate-100 text-slate-700',
  in_progress: 'border-sky-300 bg-sky-50 text-sky-900',
  evidence_submitted: 'border-indigo-300 bg-indigo-50 text-indigo-900',
  met: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  not_applicable: 'border-slate-200 bg-white text-slate-500',
};

export const STAGE_TONE: Record<StageState, string> = {
  not_started: 'border-slate-300 bg-slate-100 text-slate-700',
  in_progress: 'border-sky-300 bg-sky-50 text-sky-900',
  blocked: 'border-rose-300 bg-rose-50 text-rose-900',
  done: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  abandoned: 'border-slate-300 bg-slate-100 text-slate-500',
};
