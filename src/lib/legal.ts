import { wordFor } from './labels';
import type {
  CounselState,
  FilingKind,
  FilingState,
  HearingKind,
  Language,
  OrderState,
  PreparationState,
} from '../types';

type Bilingual = { tr: string; en: string };

const HEARING_KINDS: Record<HearingKind, Bilingual> = {
  mention: { tr: 'Tensip', en: 'Mention' },
  directions: { tr: 'Usul kararı', en: 'Directions' },
  hearing: { tr: 'Duruşma', en: 'Hearing' },
  ruling: { tr: 'Ara karar', en: 'Ruling' },
  judgment: { tr: 'Karar', en: 'Judgment' },
  application: { tr: 'Talep', en: 'Application' },
};

export const HEARING_KIND_VALUES = Object.keys(HEARING_KINDS) as HearingKind[];
export const hearingKindLabel = (k: HearingKind, l: Language) => wordFor(HEARING_KINDS, k, l);

const PREPARATION: Record<PreparationState, Bilingual> = {
  not_started: { tr: 'Hazırlık başlamadı', en: 'Not started' },
  in_preparation: { tr: 'Hazırlanıyor', en: 'In preparation' },
  ready: { tr: 'Hazır', en: 'Ready' },
  missed: { tr: 'Kaçırıldı', en: 'Missed' },
};

export const PREPARATION_VALUES = Object.keys(PREPARATION) as PreparationState[];
export const preparationLabel = (s: PreparationState, l: Language) => wordFor(PREPARATION, s, l);

/** A hearing nobody has prepared for is the one worth colouring. */
export const PREPARATION_STYLES: Record<PreparationState, string> = {
  not_started: 'border-rose-300 bg-rose-50 text-rose-800',
  in_preparation: 'border-amber-300 bg-amber-50 text-amber-800',
  ready: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  missed: 'border-rose-400 bg-rose-100 text-rose-900',
};

const FILING_KINDS: Record<FilingKind, Bilingual> = {
  pleading: { tr: 'Layiha', en: 'Pleading' },
  affidavit: { tr: 'Yeminli beyan', en: 'Affidavit' },
  submission: { tr: 'Yazılı beyan', en: 'Submission' },
  application: { tr: 'Talep dilekçesi', en: 'Application' },
  appeal: { tr: 'Temyiz', en: 'Appeal' },
  record_of_appeal: { tr: 'Temyiz dosyası', en: 'Record of appeal' },
  notice: { tr: 'Bildirim', en: 'Notice' },
  other: { tr: 'Diğer', en: 'Other' },
};

export const FILING_KIND_VALUES = Object.keys(FILING_KINDS) as FilingKind[];
export const filingKindLabel = (k: FilingKind, l: Language) => wordFor(FILING_KINDS, k, l);

const FILING_STATES: Record<FilingState, Bilingual> = {
  planned: { tr: 'Planlandı', en: 'Planned' },
  drafting: { tr: 'Yazılıyor', en: 'Drafting' },
  filed: { tr: 'Sunuldu', en: 'Filed' },
  served: { tr: 'Tebliğ edildi', en: 'Served' },
  withdrawn: { tr: 'Geri çekildi', en: 'Withdrawn' },
  late: { tr: 'Süresi kaçtı', en: 'Late' },
};

export const FILING_STATE_VALUES = Object.keys(FILING_STATES) as FilingState[];
export const filingStateLabel = (s: FilingState, l: Language) => wordFor(FILING_STATES, s, l);

export const FILING_STATE_STYLES: Record<FilingState, string> = {
  planned: 'border-slate-300 bg-slate-100 text-slate-700',
  drafting: 'border-amber-300 bg-amber-50 text-amber-800',
  filed: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  served: 'border-teal-300 bg-teal-50 text-teal-800',
  withdrawn: 'border-slate-300 bg-white text-slate-500',
  late: 'border-rose-400 bg-rose-100 text-rose-900',
};

const ORDER_STATES: Record<OrderState, Bilingual> = {
  in_force: { tr: 'Yürürlükte', en: 'In force' },
  varied: { tr: 'Değiştirildi', en: 'Varied' },
  discharged: { tr: 'Kaldırıldı', en: 'Discharged' },
  appealed: { tr: 'Temyizde', en: 'Appealed' },
  spent: { tr: 'Hükmünü yitirdi', en: 'Spent' },
};

export const ORDER_STATE_VALUES = Object.keys(ORDER_STATES) as OrderState[];
export const orderStateLabel = (s: OrderState, l: Language) => wordFor(ORDER_STATES, s, l);

export const ORDER_STATE_STYLES: Record<OrderState, string> = {
  in_force: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  varied: 'border-amber-300 bg-amber-50 text-amber-800',
  discharged: 'border-slate-300 bg-slate-100 text-slate-600',
  appealed: 'border-purple-300 bg-purple-50 text-purple-800',
  spent: 'border-slate-300 bg-white text-slate-500',
};

const COUNSEL_STATES: Record<CounselState, Bilingual> = {
  proposed: { tr: 'Aday', en: 'Proposed' },
  instructed: { tr: 'Vekâlet verildi', en: 'Instructed' },
  on_record: { tr: 'Dosyada kayıtlı', en: 'On record' },
  withdrawn: { tr: 'Çekildi', en: 'Withdrawn' },
};

export const COUNSEL_STATE_VALUES = Object.keys(COUNSEL_STATES) as CounselState[];
export const counselStateLabel = (s: CounselState, l: Language) => wordFor(COUNSEL_STATES, s, l);
