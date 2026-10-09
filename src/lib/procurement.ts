/** Labels and tones for the procurement and contract registers (M14). */
import type {
  CandidateOutcome,
  ContractParty,
  ContractState,
  FeeBasis,
  MilestoneState,
  NoticeBand,
  ProcurementKind,
  ProcurementState,
  ValueBasis,
} from '../types';
import { wordFor } from './labels';

type Pair = { tr: string; en: string };

const KIND: Record<ProcurementKind, Pair> = {
  legal_counsel: { tr: 'Avukat', en: 'Legal counsel' },
  contractor: { tr: 'Müteahhit', en: 'Contractor' },
  auditor: { tr: 'Denetçi', en: 'Auditor' },
  consultant: { tr: 'Danışman', en: 'Consultant' },
  supplier: { tr: 'Tedarikçi', en: 'Supplier' },
  other: { tr: 'Diğer', en: 'Other' },
};

const REQUEST_STATE: Record<ProcurementState, Pair> = {
  drafted: { tr: 'onay bekliyor', en: 'awaiting approval' },
  approved: { tr: 'onaylandı', en: 'approved' },
  candidates_invited: { tr: 'adaylar davet edildi', en: 'candidates invited' },
  awarded: { tr: 'karara bağlandı', en: 'awarded' },
  cancelled: { tr: 'iptal', en: 'cancelled' },
};

const OUTCOME: Record<CandidateOutcome, Pair> = {
  under_review: { tr: 'değerlendiriliyor', en: 'under review' },
  shortlisted: { tr: 'kısa listede', en: 'shortlisted' },
  selected: { tr: 'seçildi', en: 'selected' },
  rejected: { tr: 'elendi', en: 'rejected' },
  withdrawn: { tr: 'çekildi', en: 'withdrawn' },
};

const FEE: Record<FeeBasis, Pair> = {
  fixed: { tr: 'sabit', en: 'fixed' },
  hourly: { tr: 'saatlik', en: 'hourly' },
  daily: { tr: 'günlük', en: 'daily' },
  percentage: { tr: 'yüzde', en: 'percentage' },
  retainer: { tr: 'vekâlet ücreti', en: 'retainer' },
  other: { tr: 'diğer', en: 'other' },
};

const CONTRACT_STATE: Record<ContractState, Pair> = {
  draft: { tr: 'taslak', en: 'draft' },
  signed: { tr: 'imzalandı', en: 'signed' },
  active: { tr: 'yürürlükte', en: 'active' },
  suspended: { tr: 'askıda', en: 'suspended' },
  expired: { tr: 'süresi bitti', en: 'expired' },
  terminated: { tr: 'feshedildi', en: 'terminated' },
};

/**
 * What kind of number the contract value is.
 *
 * This exists because an hourly engagement has no fixed sum, and a blank
 * value column tells a donor nothing. Recording the cap and saying it is a
 * cap is the honest version.
 */
const VALUE_BASIS: Record<ValueBasis, Pair> = {
  fixed: { tr: 'sabit tutar', en: 'fixed sum' },
  estimated: { tr: 'tahmini', en: 'estimated' },
  capped: { tr: 'üst sınır', en: 'a cap' },
  rate_based: { tr: 'birim fiyat', en: 'rate based' },
};

const PARTY: Record<ContractParty, Pair> = {
  us: { tr: 'vakıf', en: 'the trust' },
  counterparty: { tr: 'karşı taraf', en: 'the counterparty' },
};

const MILESTONE: Record<MilestoneState, Pair> = {
  planned: { tr: 'planlandı', en: 'planned' },
  due: { tr: 'vadesi geldi', en: 'due' },
  certified: { tr: 'onaylandı', en: 'certified' },
  paid: { tr: 'ödendi', en: 'paid' },
  cancelled: { tr: 'iptal', en: 'cancelled' },
};

const BAND: Record<NoticeBand, Pair> = {
  overdue: { tr: 'tarihi geçti', en: 'past the date' },
  within_30: { tr: '30 gün içinde', en: 'within 30 days' },
  within_60: { tr: '60 gün içinde', en: 'within 60 days' },
  within_90: { tr: '90 gün içinde', en: 'within 90 days' },
  later: { tr: 'daha sonra', en: 'later' },
};

export const kindLabel = (k: ProcurementKind, l: 'tr' | 'en') => wordFor(KIND, k, l);
export const requestStateLabel = (k: ProcurementState, l: 'tr' | 'en') =>
  wordFor(REQUEST_STATE, k, l);
export const outcomeLabel = (k: CandidateOutcome, l: 'tr' | 'en') => wordFor(OUTCOME, k, l);
export const feeBasisLabel = (k: FeeBasis, l: 'tr' | 'en') => wordFor(FEE, k, l);
export const contractStateLabel = (k: ContractState, l: 'tr' | 'en') =>
  wordFor(CONTRACT_STATE, k, l);
export const valueBasisLabel = (k: ValueBasis, l: 'tr' | 'en') => wordFor(VALUE_BASIS, k, l);
export const partyLabel = (k: ContractParty, l: 'tr' | 'en') => wordFor(PARTY, k, l);
export const milestoneLabel = (k: MilestoneState, l: 'tr' | 'en') => wordFor(MILESTONE, k, l);
export const bandLabel = (k: NoticeBand, l: 'tr' | 'en') => wordFor(BAND, k, l);

export const OUTCOME_TONE: Record<CandidateOutcome, string> = {
  under_review: 'border-slate-300 bg-slate-100 text-slate-700',
  shortlisted: 'border-sky-300 bg-sky-50 text-sky-900',
  selected: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  rejected: 'border-slate-300 bg-white text-slate-500',
  withdrawn: 'border-slate-300 bg-white text-slate-500',
};

export const REQUEST_TONE: Record<ProcurementState, string> = {
  // Amber: a request nobody has approved is somebody waiting.
  drafted: 'border-amber-300 bg-amber-50 text-amber-900',
  approved: 'border-sky-300 bg-sky-50 text-sky-900',
  candidates_invited: 'border-indigo-300 bg-indigo-50 text-indigo-900',
  awarded: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  cancelled: 'border-slate-300 bg-slate-100 text-slate-500',
};

export const CONTRACT_TONE: Record<ContractState, string> = {
  draft: 'border-slate-300 bg-slate-100 text-slate-700',
  signed: 'border-sky-300 bg-sky-50 text-sky-900',
  active: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  suspended: 'border-amber-300 bg-amber-50 text-amber-900',
  expired: 'border-slate-300 bg-white text-slate-500',
  terminated: 'border-rose-300 bg-rose-50 text-rose-900',
};

/** The 90/60/30 bands, coloured by how soon. */
export const BAND_TONE: Record<NoticeBand, string> = {
  overdue: 'border-rose-300 bg-rose-50 text-rose-900',
  within_30: 'border-rose-300 bg-rose-50 text-rose-900',
  within_60: 'border-amber-300 bg-amber-50 text-amber-900',
  within_90: 'border-sky-300 bg-sky-50 text-sky-900',
  later: 'border-slate-300 bg-slate-100 text-slate-600',
};

/** Which bands are worth putting in front of somebody today. */
export const URGENT_BANDS: NoticeBand[] = ['overdue', 'within_30', 'within_60', 'within_90'];
