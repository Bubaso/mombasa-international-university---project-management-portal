import type { Language } from '../types';

/**
 * Bir veritabanı değerinin ekrandaki karşılığını okumanın tek yolu.
 *
 * Bu dosya ölçülmüş bir kusurdan doğdu. 3 Ekim 2026'da şemadan türeyen
 * veriyle her ekran gezildi ve enum'larına istemcinin tanımadığı **tek** bir
 * değer konuldu: 19 rotanın 11'i hata sınırına düştü. Hepsinin şekli aynıydı
 *
 *     export const sourceLabel = (s: ObligationSource, l: Language) => SOURCES[s][l];
 *
 * `SOURCES` bir `Record<ObligationSource, …>` olduğu için TypeScript erişimin
 * kesin bir şey döndürdüğünü söylüyor — ve birlik veritabanı hakkında doğru
 * olduğu sürece söylediği doğru. Göç canlıya uygulandığı an doğruluğunu
 * kaybediyor: veritabanı yeni değeri üretmeye başlıyor, yayınlanmış paket onu
 * bir sonraki deploy'da öğreniyor. O aradaki satır `undefined` döndürüyor ve
 * `[l]` okunurken bölüm gidiyor.
 *
 * Tanınmayan değer burada kendi adıyla görünüyor. Uydurulmuş bir etiket daha
 * kötüdür — doğru okunduğunu sandırır (CLAUDE.md §2); bölümü çökertmek ise o
 * satırı hiç göstermemekle aynı şey. Haritaların kendisi tam kalıyor:
 * `tests/enum-drift.mjs` onları veritabanına karşı sınıyor, yani bu geri
 * çekilme bir mazeret değil, yalnız iki deploy arasındaki boşluk.
 */

/** Haritaların tuttuğu iki dilli ad. */
export interface WordPair {
  tr: string;
  en: string;
}

/**
 * Değerin adı; paket o değeri bilmiyorsa değerin kendisi.
 *
 * Anahtar tipi serbest bırakılıyor (`K extends string`), çünkü haritalar
 * `Record<Birlik, …>` olarak bildiriliyor ve TypeScript bunu `string`
 * indeksli bir tipe atamıyor. Daralma içeride, tek yerde ve gerekçesiyle
 * yapılıyor — her çağrı yerinde tekrarlanmıyor.
 */
export function wordFor<K extends string>(
  words: Readonly<Record<K, WordPair>>,
  value: string,
  language: Language,
): string {
  const pair = (words as Readonly<Record<string, WordPair | undefined>>)[value];
  return pair ? pair[language] : value;
}

/**
 * Hiçbir şey iddia etmeyen bir rozet rengi.
 *
 * Tanınmayan bir durumu yeşile ya da kırmızıya boyamak, o durum hakkında bir
 * hüküm vermek olurdu. Bu renk hüküm vermiyor; değerin kendisi yazıyor.
 */
const NEUTRAL_TONE = 'border-slate-300 bg-slate-100 text-slate-700';

/**
 * Bir rozetin rengi; paket değeri bilmiyorsa nötr.
 *
 * Ad `wordFor`'dan geliyor, renk buradan: ikisi ayrı, çünkü tanınmayan bir
 * değerin adı vardır (kendisi) ama rengi yoktur.
 */
export function toneFor<K extends string>(
  faces: Readonly<Record<K, { tone: string }>>,
  value: string,
): string {
  const face = (faces as Readonly<Record<string, { tone: string } | undefined>>)[value];
  return face ? face.tone : NEUTRAL_TONE;
}
