import type { EngagementPlanStatus, EngagementStepState, Language } from '../types';
import { wordFor } from './labels';

/**
 * Etkileşim planının sözcükleri (M4-12).
 *
 * BU DOSYANIN SEBEBİ İKİ BOŞLUĞU AYRI TUTMAK:
 *
 *   `no_plan_recorded` — bu paydaş için kimse plan yazmadı.
 *   `no_step_recorded` — plan var, sıradaki hamle kararlaşmadı.
 *
 * İkisini "planlanmadı" diye tek kutuya koymak, hiç ilgilenilmemiş bir
 * bakanı amacı yazılmış bir bakanla aynı yere koyardı — ve pano tam olarak
 * bu ayrımı göstermek için var (CLAUDE.md §2).
 *
 * Sıra, panonun okunma sırası: en çok ilgi isteyen önce. Vadesi geçmiş bir
 * adım bir gecikme; hiç plan olmaması bir boşluk, ve boşluk gecikmeden önce
 * gelir çünkü gecikmiş olan en az bir kez düşünülmüştür.
 */

type Bilingual = { tr: string; en: string };

export const ENGAGEMENT_STEP_STATES: EngagementStepState[] = [
  'no_plan_recorded',
  'overdue',
  'no_step_recorded',
  'due_soon',
  'scheduled',
];

const STEP_WORDS: Record<EngagementStepState, Bilingual> = {
  no_plan_recorded: { tr: 'Plan yok', en: 'No plan' },
  no_step_recorded: { tr: 'Sıradaki adım yok', en: 'No next step' },
  overdue: { tr: 'Vadesi geçti', en: 'Overdue' },
  due_soon: { tr: 'İki hafta içinde', en: 'Within two weeks' },
  scheduled: { tr: 'Tarihli', en: 'Scheduled' },
};

const STEP_NOTES: Record<EngagementStepState, Bilingual> = {
  no_plan_recorded: {
    tr: 'Bu paydaş için ne istediğimiz hiçbir yerde yazılı değil.',
    en: 'What we want from this stakeholder is written down nowhere.',
  },
  no_step_recorded: {
    tr: 'Amaç yazıldı, sıradaki hamle kararlaşmadı. Kaydedilmemiş bir adım, sorumlusu ve tarihi olmadan kaydedilemiyor.',
    en: 'The objective is recorded; the next move is not. A step cannot be recorded without an owner and a date.',
  },
  overdue: {
    tr: 'Sıradaki adımın tarihi geçti.',
    en: 'The next step’s date has passed.',
  },
  due_soon: {
    tr: 'Sıradaki adım iki hafta içinde.',
    en: 'The next step falls inside two weeks.',
  },
  scheduled: {
    tr: 'Sıradaki adımın sorumlusu ve tarihi var.',
    en: 'The next step has an owner and a date.',
  },
};

const STEP_STYLES: Record<EngagementStepState, string> = {
  no_plan_recorded: 'border-rose-300 bg-rose-50 text-rose-900',
  no_step_recorded: 'border-amber-300 bg-amber-50 text-amber-900',
  overdue: 'border-orange-300 bg-orange-50 text-orange-900',
  due_soon: 'border-sky-200 bg-sky-50 text-sky-900',
  scheduled: 'border-emerald-200 bg-emerald-50 text-emerald-900',
};

export const stepStateLabel = (s: string, l: Language) => wordFor(STEP_WORDS, s, l);
export const stepStateNote = (s: string, l: Language) => wordFor(STEP_NOTES, s, l);

/**
 * Tanınmayan bir durum için renk UYDURULMUYOR: nötr dönüyor. Bir göç yeni bir
 * değer ürettiğinde ekran onu kendi adıyla gösteriyor.
 */
export const stepStateStyle = (s: string): string =>
  (STEP_STYLES as Record<string, string | undefined>)[s] ??
  'border-slate-200 bg-slate-50 text-slate-600';

/**
 * Planın kapanış sonuçları.
 *
 * `active` burada YOK: bu liste bir planı KAPATMAK için sunulan seçenekler,
 * ve "yürüyor" bir kapanış değil. Enum'un tamamı `registerStates.ts`'de
 * hükmünü alıyor.
 */
export const ENGAGEMENT_OUTCOMES: EngagementPlanStatus[] = [
  'achieved',
  'partly_achieved',
  'not_achieved',
  'abandoned',
  'outcome_unknown',
];

const STATUS_WORDS: Record<EngagementPlanStatus, Bilingual> = {
  active: { tr: 'Yürüyor', en: 'Live' },
  achieved: { tr: 'Elde edildi', en: 'Achieved' },
  partly_achieved: { tr: 'Kısmen elde edildi', en: 'Partly achieved' },
  not_achieved: { tr: 'Elde edilemedi', en: 'Not achieved' },
  abandoned: { tr: 'Bırakıldı', en: 'Abandoned' },
  outcome_unknown: { tr: 'Sonucu kayıtlı değil', en: 'Outcome not recorded' },
};

export const planStatusLabel = (s: string, l: Language) => wordFor(STATUS_WORDS, s, l);

const STATUS_STYLES: Record<EngagementPlanStatus, string> = {
  active: 'border-sky-200 bg-sky-50 text-sky-900',
  achieved: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  partly_achieved: 'border-amber-300 bg-amber-50 text-amber-900',
  not_achieved: 'border-rose-300 bg-rose-50 text-rose-900',
  abandoned: 'border-slate-200 bg-slate-50 text-slate-600',
  // Sonucu bilinmeyen kapanış, başarısızlıkla aynı renkte DEĞİL: biri bir
  // sonuç, öbürü bir boşluk. Boşluğu kırmızı göstermek onu bir sonuç gibi
  // okuturdu.
  outcome_unknown: 'border-violet-300 bg-violet-50 text-violet-900',
};

export const planStatusStyle = (s: string): string =>
  (STATUS_STYLES as Record<string, string | undefined>)[s] ??
  'border-slate-200 bg-slate-50 text-slate-600';
