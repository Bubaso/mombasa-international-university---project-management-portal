import type { CalendarKind, CalendarKindFace, Language } from '../types';

/**
 * Takvim türlerinin tek tanımı.
 *
 * Bu dosya bir kusurdan doğdu. Tür listesi üç yerde ayrı ayrı yazılmıştı:
 * `CalendarView`'daki `KINDS` (ikon, ad, renk), `lib/ics.ts`'teki `KIND_WORD`
 * (ad) ve `DeadlineAlertBanner`'daki `ROUTE` (rota). Veritabanı 0022'de
 * `contract`, 0024'te `milestone` değerini kazandı; üç kopyadan yalnız biri
 * büyüdü. Kalan ikisinden biri gevşek tipliydi ve ham değeri gösterdi —
 * çirkin ama dürüst. Diğeri `Record<CalendarKind, …>` olduğu için TypeScript
 * onu tam sandı, `KINDS['milestone']` `undefined` döndü ve `.icon` okunurken
 * takvim ekranı tamamen gitti. Tek bir kilometre taşı satırı yetti.
 *
 * CLAUDE.md §4: kuralı iki yere yazma, çünkü sapan kopya her zaman ikincisidir.
 * Burada bir yere yazılıyor; ekranlar yalnız kendi görsel parçasını ekliyor.
 */
export const CALENDAR_KINDS: Record<CalendarKind, CalendarKindFace> = {
  hearing: { tr: 'Duruşma', en: 'Hearing', route: '/legal' },
  filing: { tr: 'Layiha süresi', en: 'Filing deadline', route: '/legal' },
  obligation: { tr: 'Yükümlülük', en: 'Obligation', route: '/obligations' },
  action: { tr: 'Aksiyon', en: 'Action', route: '/meetings' },
  question: { tr: 'Açık soru', en: 'Open question', route: '/meetings' },
  meeting: { tr: 'Toplantı', en: 'Meeting', route: '/meetings' },
  // 0023: bir yenileme kararı ve bir bitiş, her biri ayrı satır. Hangisi
  // olduğunu satırın kendi başlığı söylüyor, tür bu yüzden sade kalıyor.
  contract: { tr: 'Sözleşme', en: 'Contract', route: '/procurement' },
  // 0025: kilometre taşının hedef tarihi, taşı hâlâ açıkken.
  milestone: { tr: 'Kilometre taşı', en: 'Milestone', route: '/plan' },
};

/** Ekrandaki süzgeç sırası. Tanımın sırası neyse o. */
export const CALENDAR_KIND_ORDER = Object.keys(CALENDAR_KINDS) as CalendarKind[];

/**
 * Aynı tablo, gevşek anahtarla.
 *
 * `Record<CalendarKind, …>` bir `CalendarKind` ile indekslenince TypeScript
 * sonucun kesin var olduğunu söyler — doğru olan da bu, ta ki veritabanı
 * yayınlanmış paketin önüne geçene kadar. Göç canlıya uygulandığı an yeni
 * değer gelmeye başlıyor; paket ise bir sonraki deploy'da büyüyor. O aradaki
 * satır bir kusur değil, beklenen bir durum. Bu takma ad erişimin
 * `undefined` dönebileceğini tipe söylüyor, böylece çağıran yer ham değeri
 * göstermeyi seçebiliyor.
 */
const BY_KEY: Record<string, CalendarKindFace> = CALENDAR_KINDS;

/**
 * Bir türün adı. Tanınmayan tür kendi anahtarıyla görünür.
 *
 * Uydurulmuş bir ad, tanınmayan bir türden kötüdür: birincisi doğru
 * okunduğunu sandırır (CLAUDE.md §2).
 */
export function calendarKindWord(kind: string, language: Language): string {
  return BY_KEY[kind]?.[language] ?? kind;
}

/** Türün ait olduğu kütük. Tanınmayan tür takvimin kendisine götürür. */
export function calendarKindRoute(kind: string): string {
  return BY_KEY[kind]?.route ?? '/calendar';
}
