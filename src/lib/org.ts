/**
 * Kurumun adı, tek yerde (T13-05).
 *
 * Ölçüm, 5 Ekim 2026: ad dört yerde yazılıydı ve üç ayrı biçimdeydi — tam ad,
 * "Projesi" eklenmiş hâli, ve `Mombasa Uluslararası Üniv.` kısaltması. Bir
 * tanesi (mobil altbilgi) hiç iki dilli değildi, İngilizcesi Türkçe arayüzde
 * de görünüyordu.
 *
 * Kurumun kendi adını kısaltmak, sicile verilen adla ekrandaki adı ayırır; bir
 * sicil memuru için bunlar iki ayrı kurum olabilir. Dar yerde kısaltılacaksa
 * `SHORT` kullanılır — ama o da bir karar, satır içinde doğaçlama değil.
 */

/** Üniversitenin tescilli adı. Varsayılan budur. */
export const UNIVERSITY = {
  tr: 'Mombasa Uluslararası Üniversitesi',
  en: 'Mombasa International University',
} as const;

/**
 * Dar yerler için kısa biçim — kurumun adını kesmez, "Üniversitesi"ni atar.
 * Navbar ve giriş ekranı bunu kullanıyordu, ama `Üniv.` diye.
 */
export const UNIVERSITY_SHORT = {
  tr: 'Mombasa Üniversitesi',
  en: 'Mombasa University',
} as const;

/** Vakıf: projenin hukukî sahibi. */
export const TRUST = {
  tr: 'Kenya Afrika Üniversite Vakfı · Fasıl 164',
  en: 'African University Trust of Kenya · Cap 164',
} as const;

/** Arsanın sicil kaydı. */
export const PLOT = 'MN/I/5141';

/** @param t Bir ad çifti, `UNIVERSITY` gibi. */
export const name = (t: { tr: string; en: string }, language: string): string =>
  language === 'tr' ? t.tr : t.en;
