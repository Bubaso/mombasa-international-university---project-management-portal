import { wordFor } from './labels';
import type {
  AssumptionState,
  IssueState,
  Language,
  RiskCategory,
  RiskResponse,
  RiskState,
} from '../types';

type Bilingual = { tr: string; en: string };

const CATEGORIES: Record<RiskCategory, Bilingual> = {
  legal: { tr: 'Hukukî', en: 'Legal' },
  political: { tr: 'Siyasî', en: 'Political' },
  financial: { tr: 'Mali', en: 'Financial' },
  reputational: { tr: 'İtibar', en: 'Reputational' },
  site_safety: { tr: 'Saha güvenliği', en: 'Site safety' },
  construction: { tr: 'İnşaat', en: 'Construction' },
  accreditation: { tr: 'Akreditasyon', en: 'Accreditation' },
  partnership: { tr: 'Ortaklık', en: 'Partnership' },
  climate: { tr: 'Doğa / iklim', en: 'Nature and climate' },
};

export const RISK_CATEGORIES = Object.keys(CATEGORIES) as RiskCategory[];
export const riskCategoryLabel = (c: RiskCategory, l: Language) => wordFor(CATEGORIES, c, l);

const STATES: Record<RiskState, Bilingual> = {
  open: { tr: 'Açık', en: 'Open' },
  mitigating: { tr: 'Azaltılıyor', en: 'Being mitigated' },
  materialised: { tr: 'Gerçekleşti', en: 'Happened' },
  closed: { tr: 'Kapandı', en: 'Closed' },
};

export const riskStateLabel = (s: RiskState, l: Language) => wordFor(STATES, s, l);

const RESPONSES: Record<RiskResponse, Bilingual> = {
  avoid: { tr: 'Kaçın', en: 'Avoid' },
  reduce: { tr: 'Azalt', en: 'Reduce' },
  transfer: { tr: 'Devret', en: 'Transfer' },
  accept: { tr: 'Kabul et', en: 'Accept' },
};

export const RISK_RESPONSES = Object.keys(RESPONSES) as RiskResponse[];
export const riskResponseLabel = (r: RiskResponse, l: Language) => wordFor(RESPONSES, r, l);

const ASSUMPTION_STATES: Record<AssumptionState, Bilingual> = {
  unverified: { tr: 'Doğrulanmadı', en: 'Unverified' },
  holding: { tr: 'Geçerli', en: 'Holding' },
  shaky: { tr: 'Şüpheli', en: 'Shaky' },
  broken: { tr: 'Çöktü', en: 'Broken' },
};

export const ASSUMPTION_STATES_LIST = Object.keys(ASSUMPTION_STATES) as AssumptionState[];
export const assumptionStateLabel = (s: AssumptionState, l: Language) =>
  wordFor(ASSUMPTION_STATES, s, l);

export function assumptionStateStyle(state: AssumptionState): string {
  switch (state) {
    case 'holding':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'shaky':
      return 'bg-amber-100 text-amber-900 border-amber-300';
    case 'broken':
      return 'bg-rose-100 text-rose-800 border-rose-200';
    default:
      // Unverified is grey, not green. Nobody has checked, and a register
      // that showed that as fine would be the register defeating itself.
      return 'bg-slate-100 text-slate-600 border-slate-200';
  }
}

const ISSUE_STATES: Record<IssueState, Bilingual> = {
  open: { tr: 'Açık', en: 'Open' },
  in_progress: { tr: 'Üzerinde çalışılıyor', en: 'In progress' },
  resolved: { tr: 'Çözüldü', en: 'Resolved' },
  closed: { tr: 'Kapandı', en: 'Closed' },
};

export const issueStateLabel = (s: IssueState, l: Language) => wordFor(ISSUE_STATES, s, l);

/** Where the escalation line sits. Mirrors app.risk_escalation_threshold(). */
export const ESCALATION_THRESHOLD = 15;

/**
 * The colour of a cell in the matrix.
 *
 * Banded by score rather than by a gradient, because a heat map that shades
 * continuously invites reading a 12 as meaningfully worse than an 11. The
 * bands are the decision points: below 8 is carried, 8 to 14 is watched, 15
 * and above goes to the trustees.
 */
export function scoreBand(score: number): { className: string; key: 'low' | 'medium' | 'high' } {
  if (score >= ESCALATION_THRESHOLD) return { className: 'bg-rose-200 text-rose-900', key: 'high' };
  if (score >= 8) return { className: 'bg-amber-200 text-amber-900', key: 'medium' };
  return { className: 'bg-emerald-100 text-emerald-900', key: 'low' };
}

export function scoreBandLabel(key: 'low' | 'medium' | 'high', l: Language): string {
  const labels: Record<typeof key, Bilingual> = {
    low: { tr: 'Taşınır', en: 'Carried' },
    medium: { tr: 'İzlenir', en: 'Watched' },
    high: { tr: 'Mütevellilere', en: 'To the trustees' },
  };
  return labels[key][l];
}
