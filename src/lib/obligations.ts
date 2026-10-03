import type { Language, ObligationSource, ObligationState } from '../types';
import { wordFor } from './labels';

type Bilingual = { tr: string; en: string };

const SOURCES: Record<ObligationSource, Bilingual> = {
  lease: { tr: 'Kira sözleşmesi', en: 'The lease' },
  court_order: { tr: 'Mahkeme kararı', en: 'A court order' },
  trust_deed: { tr: 'Vakıf senedi', en: 'The trust deed' },
  mou: { tr: 'Mutabakat (MoU)', en: 'A memorandum' },
  statute: { tr: 'Mevzuat', en: 'Statute' },
  contract: { tr: 'Sözleşme', en: 'A contract' },
  personal_commitment: { tr: 'Kişisel taahhüt', en: 'A promise made' },
};

export const OBLIGATION_SOURCES = Object.keys(SOURCES) as ObligationSource[];
export const sourceLabel = (s: ObligationSource, l: Language) => wordFor(SOURCES, s, l);

/**
 * A promise made in a meeting is styled apart from the rest. It is the one
 * source that comes from a person rather than a document, and the one the
 * project has never tracked at all.
 */
export const SOURCE_STYLES: Record<ObligationSource, string> = {
  lease: 'border-amber-300 bg-amber-50 text-amber-900',
  court_order: 'border-rose-300 bg-rose-50 text-rose-900',
  trust_deed: 'border-purple-300 bg-purple-50 text-purple-900',
  mou: 'border-blue-300 bg-blue-50 text-blue-900',
  statute: 'border-slate-400 bg-slate-100 text-slate-800',
  contract: 'border-teal-300 bg-teal-50 text-teal-900',
  personal_commitment: 'border-emerald-300 bg-emerald-50 text-emerald-900',
};

const STATES: Record<ObligationState, Bilingual> = {
  open: { tr: 'Açık', en: 'Open' },
  in_progress: { tr: 'Devam ediyor', en: 'In progress' },
  fulfilled: { tr: 'Yerine getirildi', en: 'Fulfilled' },
  at_risk: { tr: 'İhlâl riski', en: 'At risk' },
  breached: { tr: 'İhlâl edildi', en: 'Breached' },
  suspended: { tr: 'Askıda (hukukî)', en: 'Suspended' },
};

export const OBLIGATION_STATES = Object.keys(STATES) as ObligationState[];
export const stateLabel = (s: ObligationState, l: Language) => wordFor(STATES, s, l);

export const STATE_STYLES: Record<ObligationState, string> = {
  open: 'border-slate-300 bg-slate-100 text-slate-700',
  in_progress: 'border-teal-300 bg-teal-50 text-teal-800',
  fulfilled: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  at_risk: 'border-amber-300 bg-amber-50 text-amber-800',
  breached: 'border-rose-300 bg-rose-50 text-rose-800',
  suspended: 'border-slate-400 bg-slate-200 text-slate-800',
};

/**
 * The reminder bands the requirement names (M2-09), as one band rather than
 * five alerts: something is in exactly one of them at a time.
 */
export function thresholdBand(dueOn: string | null): number | null {
  if (!dueOn) return null;
  const today = new Date().toISOString().slice(0, 10);
  const days = Math.round(
    (new Date(`${dueOn}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) /
      86_400_000,
  );
  if (days < 0) return 0;
  for (const band of [1, 7, 14, 30, 60]) if (days <= band) return band;
  return null;
}

export function bandLabel(band: number | null, language: Language): string | null {
  if (band == null) return null;
  const tr = language === 'tr';
  if (band === 0) return tr ? 'süresi geçti' : 'overdue';
  if (band === 1) return tr ? 'yarın' : 'tomorrow';
  return tr ? `${band} gün içinde` : `within ${band} days`;
}

export const BAND_STYLES: Record<number, string> = {
  0: 'border-rose-400 bg-rose-100 text-rose-900',
  1: 'border-rose-300 bg-rose-50 text-rose-800',
  7: 'border-amber-300 bg-amber-50 text-amber-800',
  14: 'border-amber-200 bg-amber-50/60 text-amber-800',
  30: 'border-slate-300 bg-slate-100 text-slate-700',
  60: 'border-slate-200 bg-slate-50 text-slate-600',
};
