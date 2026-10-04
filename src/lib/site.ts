import type {
  BoqState,
  CurrencyCode,
  Language,
  ValuationState,
  WorkKind,
  WorkState,
} from '../types';
import { wordFor } from './labels';

type Bilingual = { tr: string; en: string };

const WORK_STATES: Record<WorkState, Bilingual> = {
  planned: { tr: 'Planlandı', en: 'Planned' },
  in_progress: { tr: 'Devam ediyor', en: 'In progress' },
  completed: { tr: 'Tamamlandı', en: 'Completed' },
  legally_suspended: { tr: 'Hukuken askıda', en: 'Legally suspended' },
  emergency_preservation: { tr: 'Acil koruma', en: 'Emergency preservation' },
  blocked: { tr: 'Engellendi', en: 'Blocked' },
};

export const WORK_STATE_VALUES = Object.keys(WORK_STATES) as WorkState[];
export const workStateLabel = (s: WorkState, l: Language) => wordFor(WORK_STATES, s, l);

/**
 * Suspended work is amber rather than red: it is not a failure, and reading
 * it as one is how a project starts explaining away a court order.
 */
export function workStateStyle(state: WorkState): string {
  switch (state) {
    case 'completed':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'in_progress':
      return 'bg-sky-100 text-sky-800 border-sky-200';
    case 'legally_suspended':
      return 'bg-amber-100 text-amber-900 border-amber-300';
    case 'emergency_preservation':
      return 'bg-orange-100 text-orange-900 border-orange-300';
    case 'blocked':
      return 'bg-rose-100 text-rose-800 border-rose-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

const KINDS: Record<WorkKind, Bilingual> = {
  construction: { tr: 'İnşaat', en: 'Construction' },
  preservation: { tr: 'Koruma', en: 'Preservation' },
};

export const workKindLabel = (k: WorkKind, l: Language) => wordFor(KINDS, k, l);

const VALUATION_STATES: Record<ValuationState, Bilingual> = {
  draft: { tr: 'Taslak', en: 'Draft' },
  qs_certified: { tr: 'QS onayladı', en: 'Certified by QS' },
  director_approved: { tr: 'Direktör onayladı', en: 'Approved by director' },
  paid: { tr: 'Ödendi', en: 'Paid' },
  rejected: { tr: 'Reddedildi', en: 'Rejected' },
};

export const valuationStateLabel = (s: ValuationState, l: Language) =>
  wordFor(VALUATION_STATES, s, l);

export function valuationStateStyle(state: ValuationState): string {
  switch (state) {
    case 'paid':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'director_approved':
      return 'bg-sky-100 text-sky-800 border-sky-200';
    case 'qs_certified':
      return 'bg-indigo-100 text-indigo-800 border-indigo-200';
    case 'rejected':
      return 'bg-rose-100 text-rose-800 border-rose-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

const BOQ_STATES: Record<BoqState, Bilingual> = {
  draft: { tr: 'Taslak', en: 'Draft' },
  issued: { tr: 'Yayımlandı', en: 'Issued' },
  superseded: { tr: 'Yerine yenisi geçti', en: 'Superseded' },
};

export const boqStateLabel = (s: BoqState, l: Language) => wordFor(BOQ_STATES, s, l);

export const CURRENCIES: CurrencyCode[] = ['KES', 'USD', 'TRY'];

const CURRENCY_PREFIX: Record<CurrencyCode, string> = {
  KES: 'KShs',
  USD: '$',
  TRY: '₺',
};

/**
 * An amount always shows its currency. Donors are in Türkiye, the spending is
 * in Kenya, and a bare number is the kind of thing that gets read in whichever
 * currency the reader was already thinking in.
 */
export function money(amount: number | null, currency: CurrencyCode | null): string {
  if (amount == null) return '—';
  const formatted = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(amount);
  return `${CURRENCY_PREFIX[currency ?? 'KES']} ${formatted}`;
}

/**
 * How a percentage reads when nothing has been reported.
 *
 * Deliberately not "0%". The old module printed a number for every block
 * whether or not anybody had ever been to look at one, and a zero and an
 * unknown are different things to a person deciding where to send somebody.
 */
export function progressLabel(percent: number | null, l: Language): string {
  if (percent == null) return l === 'tr' ? 'raporlanmadı' : 'not reported';
  return `${percent}%`;
}

/** Days between a capture and its filing, when that gap is worth showing. */
export function captureGapDays(capturedAt: string | null, reportedAt: string): number | null {
  if (!capturedAt) return null;
  const gap = new Date(reportedAt).getTime() - new Date(capturedAt).getTime();
  const days = Math.floor(gap / (1000 * 60 * 60 * 24));
  return days > 0 ? days : null;
}

export function formatDate(value: string | null, l: Language): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(l === 'tr' ? 'tr-TR' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const then = new Date(date);
  then.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((then.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}
