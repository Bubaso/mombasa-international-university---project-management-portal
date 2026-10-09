import type { Language, RetentionDisposition, RetentionState } from '../types';
import { wordFor } from './labels';

/**
 * Saklama ve muhafaza sözcükleri (M9-13, M9-11).
 *
 * `retention_due` görünümünün `state` kolonu altı değer veriyor ve altısı
 * AYRI şeyler söylüyor. En çok karışacak ikisini ayrı tutmak bu dosyanın
 * sebebi:
 *
 *   `no_policy` — kimse bu kategori için karar vermedi. Bir kusur.
 *   `not_due` — karar verildi, süresi dolmadı. Bir bilgi.
 *
 * İkisini "arşivlenmeyecek" diye tek kutuya koymak, karar verilmemiş bir
 * kategoriyi karar verilmiş gibi gösterir — ve bu, portalın ekrandan
 * kaldırdığı şeyin tam kendisi (CLAUDE.md §2).
 */

type Bilingual = { tr: string; en: string };

/** Görünümün sıralaması: en kısıtlayıcı önce. Ekran da aynı sırayı izliyor. */
export const RETENTION_STATES: RetentionState[] = [
  'held',
  'due',
  'no_policy',
  'not_due',
  'keep_forever',
  'already_archived',
];

const STATE_WORDS: Record<RetentionState, Bilingual> = {
  held: { tr: 'Muhafazada', en: 'Under hold' },
  due: { tr: 'Süresi doldu', en: 'Due' },
  no_policy: { tr: 'Kararı verilmedi', en: 'No decision recorded' },
  not_due: { tr: 'Süresi dolmadı', en: 'Not yet due' },
  keep_forever: { tr: 'Süresiz saklanır', en: 'Kept indefinitely' },
  already_archived: { tr: 'Arşivde', en: 'Archived' },
};

const STATE_NOTES: Record<RetentionState, Bilingual> = {
  held: {
    tr: 'Hukukî muhafaza altında: silinemez, arşivlenemez. Saklama süresi dolmuş olsa da bu listede durur.',
    en: 'Under legal hold: cannot be deleted or archived. It stays here even if its retention period has run out.',
  },
  due: {
    tr: 'Saklama süresi doldu; arşivlemek bir insanın işi.',
    en: 'The retention period has run out; archiving is a person’s act.',
  },
  no_policy: {
    tr: 'Bu kategori için saklama süresi kaydedilmedi.',
    en: 'No retention period is recorded for this category.',
  },
  not_due: { tr: 'Karar verildi, süresi dolmadı.', en: 'Decided, and not yet expired.' },
  keep_forever: {
    tr: 'Süresiz saklanır — vade tarihi yok.',
    en: 'Kept indefinitely — no due date.',
  },
  already_archived: {
    tr: 'Arşivde; canlı listede görünmüyor.',
    en: 'Archived; out of the live list.',
  },
};

const STATE_STYLES: Record<RetentionState, string> = {
  held: 'border-violet-300 bg-violet-50 text-violet-900',
  due: 'border-amber-300 bg-amber-50 text-amber-900',
  no_policy: 'border-rose-300 bg-rose-50 text-rose-900',
  not_due: 'border-slate-200 bg-slate-50 text-slate-700',
  keep_forever: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  already_archived: 'border-slate-200 bg-white text-slate-500',
};

export const retentionStateLabel = (s: string, l: Language) => wordFor(STATE_WORDS, s, l);
export const retentionStateNote = (s: string, l: Language) => wordFor(STATE_NOTES, s, l);

/**
 * Tanınmayan bir durum için renk UYDURULMUYOR: nötr dönüyor. Bir göç yeni bir
 * değer ürettiğinde ekran onu kendi adıyla gösteriyor — bu depoda
 * `Record<Birlik, …>` üzerinde korumasız erişim on bir rotayı düşürmüştü.
 */
export const retentionStateStyle = (s: string): string =>
  (STATE_STYLES as Record<string, string | undefined>)[s] ??
  'border-slate-200 bg-slate-50 text-slate-600';

export const RETENTION_DISPOSITIONS: RetentionDisposition[] = [
  'keep_forever',
  'archive_after',
  'review_after',
];

const DISPOSITION_WORDS: Record<RetentionDisposition, Bilingual> = {
  keep_forever: { tr: 'Süresiz sakla', en: 'Keep indefinitely' },
  archive_after: { tr: 'Süre sonunda arşivle', en: 'Archive after' },
  review_after: { tr: 'Süre sonunda bir insan baksın', en: 'A person reviews after' },
};

export const dispositionLabel = (d: string, l: Language) => wordFor(DISPOSITION_WORDS, d, l);
