import type {
  ContactChannel,
  Language,
  RelationshipKind,
  Stakeholder,
  StakeholderCategory,
  Stance,
} from '../types';

type Bilingual = { tr: string; en: string };

const CATEGORY_LABELS: Record<StakeholderCategory, Bilingual> = {
  government: { tr: 'Devlet', en: 'Government' },
  judiciary: { tr: 'Yargı', en: 'Judiciary' },
  partner_trust: { tr: 'Ortak vakıf', en: 'Partner trust' },
  legal: { tr: 'Hukuk', en: 'Legal' },
  contractor: { tr: 'Müteahhit', en: 'Contractor' },
  academia: { tr: 'Akademi', en: 'Academia' },
  ngo: { tr: 'Sivil toplum', en: 'NGO' },
  community_leader: { tr: 'Topluluk lideri', en: 'Community leader' },
  media: { tr: 'Medya', en: 'Media' },
  donor: { tr: 'Bağışçı', en: 'Donor' },
  opposing_party: { tr: 'Karşı taraf', en: 'Opposing party' },
  other: { tr: 'Diğer', en: 'Other' },
};

export const STAKEHOLDER_CATEGORIES = Object.keys(CATEGORY_LABELS) as StakeholderCategory[];

export function categoryLabel(category: StakeholderCategory, language: Language): string {
  return CATEGORY_LABELS[category][language];
}

const STANCE_LABELS: Record<Stance, Bilingual> = {
  champion: { tr: 'Şampiyon', en: 'Champion' },
  supporter: { tr: 'Destekçi', en: 'Supporter' },
  neutral: { tr: 'Nötr', en: 'Neutral' },
  sceptic: { tr: 'Şüpheci', en: 'Sceptic' },
  opponent: { tr: 'Muhalif', en: 'Opponent' },
  unknown: { tr: 'Bilinmiyor', en: 'Unknown' },
};

export const STANCES = Object.keys(STANCE_LABELS) as Stance[];

export function stanceLabel(stance: Stance, language: Language): string {
  return STANCE_LABELS[stance][language];
}

/**
 * 'unknown' is deliberately not grey-with-the-rest: an unexamined relationship
 * is a gap in the work, not a neutral position.
 */
const STANCE_STYLES: Record<Stance, string> = {
  champion: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  supporter: 'border-teal-300 bg-teal-50 text-teal-800',
  neutral: 'border-slate-300 bg-slate-100 text-slate-700',
  sceptic: 'border-amber-300 bg-amber-50 text-amber-800',
  opponent: 'border-rose-300 bg-rose-50 text-rose-800',
  unknown: 'border-slate-300 bg-white text-slate-500',
};

export function stanceStyle(stance: Stance): string {
  return STANCE_STYLES[stance];
}

const CHANNEL_LABELS: Record<ContactChannel, Bilingual> = {
  in_person: { tr: 'Yüz yüze', en: 'In person' },
  phone: { tr: 'Telefon', en: 'Phone' },
  message: { tr: 'Mesaj', en: 'Message' },
  email: { tr: 'E-posta', en: 'Email' },
  formal_letter: { tr: 'Resmî yazı', en: 'Formal letter' },
  other: { tr: 'Diğer', en: 'Other' },
};

export const CONTACT_CHANNELS = Object.keys(CHANNEL_LABELS) as ContactChannel[];

export function channelLabel(channel: ContactChannel, language: Language): string {
  return CHANNEL_LABELS[channel][language];
}

const RELATIONSHIP_LABELS: Record<RelationshipKind, Bilingual> = {
  influences: { tr: 'etkiler', en: 'influences' },
  works_with: { tr: 'birlikte çalışır', en: 'works with' },
  related_to: { tr: 'akrabasıdır', en: 'is related to' },
  reports_to: { tr: 'bağlıdır', en: 'reports to' },
  opposes: { tr: 'karşısındadır', en: 'opposes' },
  advises: { tr: 'danışmanıdır', en: 'advises' },
};

export const RELATIONSHIP_KINDS = Object.keys(RELATIONSHIP_LABELS) as RelationshipKind[];

export function relationshipLabel(kind: RelationshipKind, language: Language): string {
  return RELATIONSHIP_LABELS[kind][language];
}

/**
 * The four quadrants of the power/interest grid, which is what the influence
 * and interest scores are for. The names are the standard ones, and they are
 * instructions rather than descriptions: a quadrant tells the relationship
 * owner how much of their week this person is worth.
 */
export type Quadrant = 'manage_closely' | 'keep_satisfied' | 'keep_informed' | 'monitor';

export function quadrantOf(stakeholder: Pick<Stakeholder, 'influence' | 'interest'>): Quadrant {
  const high = (n: number) => n >= 4;
  if (high(stakeholder.influence))
    return high(stakeholder.interest) ? 'manage_closely' : 'keep_satisfied';
  return high(stakeholder.interest) ? 'keep_informed' : 'monitor';
}

const QUADRANT_LABELS: Record<Quadrant, Bilingual> = {
  manage_closely: { tr: 'Yakından yönet', en: 'Manage closely' },
  keep_satisfied: { tr: 'Memnun tut', en: 'Keep satisfied' },
  keep_informed: { tr: 'Bilgilendir', en: 'Keep informed' },
  monitor: { tr: 'İzle', en: 'Monitor' },
};

export function quadrantLabel(quadrant: Quadrant, language: Language): string {
  return QUADRANT_LABELS[quadrant][language];
}

const QUADRANT_STYLES: Record<Quadrant, string> = {
  manage_closely: 'border-rose-300 bg-rose-50',
  keep_satisfied: 'border-amber-300 bg-amber-50',
  keep_informed: 'border-teal-300 bg-teal-50',
  monitor: 'border-slate-200 bg-slate-50',
};

export function quadrantStyle(quadrant: Quadrant): string {
  return QUADRANT_STYLES[quadrant];
}

/** How long ago, in the roughest terms that are still useful. */
export function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
}
