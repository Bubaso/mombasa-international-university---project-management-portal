/**
 * The watch book's vocabulary (M7-18, M7-12, M6-11).
 *
 * The wording in this file is the honesty rule made visible. Two phrases
 * carry most of it:
 *
 *   * A gate entry with no exit never reads "on site". It reads "çıkışı
 *     kayıtlı değil" — the exit was never written down — because that is the
 *     only one of the two possibilities the record supports.
 *
 *   * An incident with no response never reads "müdahale edilmedi". It reads
 *     "müdahale kayıtlı değil", because nobody responding and nobody writing
 *     down the response are different failures and lead to different
 *     conversations.
 */
import type { AuthorityNotice, IncidentKind, WatchPost } from '../types';

export const POST_LABELS: Record<WatchPost, { tr: string; en: string }> = {
  main_gate: { tr: 'Ana kapı', en: 'Main gate' },
  perimeter: { tr: 'Çevre', en: 'Perimeter' },
  block: { tr: 'Blok', en: 'Block' },
  store: { tr: 'Depo', en: 'Store' },
  other: { tr: 'Diğer', en: 'Other' },
};

export const INCIDENT_LABELS: Record<IncidentKind, { tr: string; en: string }> = {
  accident: { tr: 'Kaza', en: 'Accident' },
  near_miss: { tr: 'Ramak kala', en: 'Near miss' },
  security_breach: { tr: 'Güvenlik ihlâli', en: 'Security breach' },
  intrusion: { tr: 'İzinsiz giriş', en: 'Intrusion' },
  threat: { tr: 'Tehdit', en: 'Threat' },
  theft: { tr: 'Hırsızlık', en: 'Theft' },
  damage: { tr: 'Hasar', en: 'Damage' },
  dispute: { tr: 'Anlaşmazlık', en: 'Dispute' },
  fire: { tr: 'Yangın', en: 'Fire' },
  other: { tr: 'Diğer', en: 'Other' },
};

/**
 * The incident classes where not deciding about notifying an authority is
 * itself the finding. Mirrors the list inside `watch_health`; the view is the
 * one that counts, this is what the screen explains.
 */
export const SERIOUS_KINDS: IncidentKind[] = [
  'accident',
  'security_breach',
  'intrusion',
  'threat',
  'fire',
];

export function isSerious(kind: IncidentKind): boolean {
  return SERIOUS_KINDS.includes(kind);
}

/**
 * How a notification state is said out loud. `unknown` deliberately does not
 * read as "bildirilmedi": the record holds no decision either way, and
 * writing the negative would put one there.
 */
export function noticeWords(notice: AuthorityNotice): { tr: string; en: string } {
  switch (notice) {
    case 'notified':
      return { tr: 'Resmî bildirim yapıldı', en: 'Authority notified' };
    case 'not_required':
      return {
        tr: 'Bildirim gerekmedi (kayıtlı karar)',
        en: 'No notification required (recorded)',
      };
    case 'unknown':
      return { tr: 'Bildirim kararı kayıtlı değil', en: 'No notification decision recorded' };
  }
}

/**
 * What a shift's round count can honestly be said to be. Three answers, not
 * two: short of the figure, met the figure, or there is no figure to be short
 * of.
 */
export type RoundVerdict = 'short' | 'met' | 'no_expectation';

export function roundVerdict(expected: number | null, missing: number | null): RoundVerdict {
  if (expected == null) return 'no_expectation';
  return (missing ?? 0) > 0 ? 'short' : 'met';
}

export function roundWords(
  expected: number | null,
  recorded: number,
  missing: number | null,
): string {
  switch (roundVerdict(expected, missing)) {
    case 'no_expectation':
      // Not "0 / 0". Nobody said how many rounds this watch owed, so the
      // count stands alone and says so.
      return `${recorded} tur kayıtlı · beklenen tur sayısı kayıtlı değil`;
    case 'short':
      return `${recorded} / ${expected} tur · ${missing} tur kayıtlı değil`;
    case 'met':
      return `${recorded} / ${expected} tur`;
  }
}

/**
 * The sentence an open gate entry gets. Never "sahada": the register knows
 * only that no exit was written.
 */
export function openEntryWords(openHours: number, outlasted: boolean): string {
  const hours =
    openHours >= 48 ? `${Math.round(openHours / 24)} gün` : `${Math.round(openHours)} sa`;
  return outlasted
    ? `${hours} önce girdi · çıkışı kayıtlı değil, ve nöbet kapandı — büyük olasılıkla yazılmayan bir çıkış`
    : `${hours} önce girdi · çıkışı henüz kayıtlı değil`;
}

/** Hours, as a person would say them. */
export function lagWords(hours: number | null): string | null {
  if (hours == null) return null;
  if (hours < 2) return null; // Written up as it happened; nothing to report.
  if (hours < 48) return `olaydan ${Math.round(hours)} saat sonra yazıldı`;
  return `olaydan ${Math.round(hours / 24)} gün sonra yazıldı`;
}
