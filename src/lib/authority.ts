import type { Authority, Confidentiality, Language, UserRole } from '../types';

/**
 * The client-side twin of app.acts_as: does the caller hold any of these
 * roles, their own or one lent to them by a live delegation?
 *
 * This decides what the console offers. It never decides what is allowed —
 * every call it guards is checked again by a policy, and a person who gets
 * past this by editing their browser reaches nothing they could not already
 * reach.
 */
export function actsAs(authority: Authority | null | undefined, ...roles: UserRole[]): boolean {
  if (!authority) return false;
  return authority.roles.some((held) => roles.includes(held));
}

/** Who may change someone's scope or hand a record to them. */
export const ACCESS_MANAGERS: UserRole[] = ['admin', 'project_director'];

/** Who answers for the project, and so may read the trail. */
export const AUDIT_READERS: UserRole[] = [
  'admin',
  'project_director',
  'trustee',
  'audit_committee',
];

/** Who may raise or revoke a delegation — their own role, never a lent one. */
export const DELEGATION_RAISERS: UserRole[] = ['trustee', 'admin'];

/**
 * Who keeps the project's own record — the register, the minutes, the
 * actions. Mirrors app.can_minute(): the internal roles that write, plus
 * trustees, who take the decisions being recorded.
 */
export const MINUTE_KEEPERS: UserRole[] = [
  'admin',
  'project_director',
  'field_team',
  'board_director',
  'trustee',
];

/**
 * Narrower, for the things that are judgements about people or commitments of
 * the board: a private assessment of a stakeholder, and a decision. Mirrors
 * app.can_assess().
 */
export const ASSESSORS: UserRole[] = ['admin', 'project_director', 'trustee', 'board_director'];

/**
 * Who keeps the board's record of itself — the organs' membership, the
 * trustee register, the formal resolutions, the charter road map. Mirrors
 * app.can_keep_governance(), and is deliberately narrower than
 * MINUTE_KEEPERS: the project director runs the project, and the board
 * constitutes itself.
 */
export const GOVERNANCE_KEEPERS: UserRole[] = ['admin', 'trustee', 'board_director'];

/**
 * Who keeps the compliance calendar, the accreditation checklist and the
 * academic registers. Mirrors app.can_keep_readiness(): the same people plus
 * the director, because these are run day to day rather than deliberated.
 */
export const READINESS_KEEPERS: UserRole[] = [
  'admin',
  'project_director',
  'trustee',
  'board_director',
];

export const CONFIDENTIALITY_TIERS: Confidentiality[] = [
  'public',
  'internal',
  'confidential',
  'restricted',
];

export function clearanceRank(tier: Confidentiality): number {
  return CONFIDENTIALITY_TIERS.indexOf(tier);
}

/**
 * Mirrors app.max_clearance. The profiles table enforces this as a check
 * constraint, so offering a tier above it would only produce a rejected save.
 */
export function maxClearanceFor(role: UserRole): Confidentiality {
  switch (role) {
    case 'admin':
    case 'project_director':
    case 'trustee':
    case 'board_director':
      return 'restricted';
    case 'field_team':
    case 'audit_committee':
      return 'confidential';
    case 'donor':
    case 'observer':
      return 'public';
    default:
      return 'internal';
  }
}

export function clearancesFor(role: UserRole): Confidentiality[] {
  const ceiling = clearanceRank(maxClearanceFor(role));
  return CONFIDENTIALITY_TIERS.filter((tier) => clearanceRank(tier) <= ceiling);
}

const TIER_LABELS: Record<Confidentiality, { tr: string; en: string }> = {
  public: { tr: 'Açık', en: 'Public' },
  internal: { tr: 'Kuruma özel', en: 'Internal' },
  confidential: { tr: 'Gizli', en: 'Confidential' },
  restricted: { tr: 'Kısıtlı', en: 'Restricted' },
};

export function clearanceLabel(tier: Confidentiality, language: Language): string {
  return TIER_LABELS[tier][language];
}

const TIER_STYLES: Record<Confidentiality, string> = {
  public: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  internal: 'bg-slate-100 text-slate-700 border-slate-300',
  confidential: 'bg-amber-50 text-amber-800 border-amber-300',
  restricted: 'bg-rose-50 text-rose-800 border-rose-300',
};

export function clearanceStyle(tier: Confidentiality): string {
  return TIER_STYLES[tier];
}

/** Whether a profile's own expiry has passed, which reads as no access at all. */
export function isExpired(expiresAt: string | null): boolean {
  return expiresAt != null && new Date(expiresAt) <= new Date();
}
