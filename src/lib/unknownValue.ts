/**
 * Tiplerin "olamaz" dediği bir değer ekrana geldiğinde ne yapılacağı.
 *
 * Bir `switch` birliğin bütün değerlerini karşılıyorsa TypeScript onu tam
 * sayar ve son dalın ardına düşmeyi imkânsız bilir. Birlik istemcinin kendi
 * icadıysa bu doğrudur. Veritabanından geliyorsa değildir: göç canlıya
 * uygulandığı an yeni değer gelmeye başlıyor, yayınlanmış paket ise bir
 * sonraki deploy'da öğreniyor. Aradaki satır bir kusur değil, beklenen bir
 * durum — ve 3 Ekim'de takvim ekranını tam bu düşürdü.
 *
 * Bu fonksiyon iki şeyi birden tutuyor ve ikisi de gerekli:
 *
 *   **Derleme zamanı.** Parametre `never`. Bir `switch` bütün dalları
 *   karşılıyorsa çağrı noktasında değer `never`'a daralır ve bu derlenir.
 *   Birliğe yeni bir değer eklenip dalı yazılmazsa daralma olmaz, tip
 *   uyuşmaz, `tsc` düşer. Yani `default:` yazmanın kaybettirdiği tamlık
 *   denetimi burada korunuyor.
 *
 *   **Çalışma zamanı.** Değer kendi hâliyle, metin olarak döner. Uydurulmuş
 *   bir etiket tanınmayan bir değerden kötüdür: birincisi doğru okunduğunu
 *   sandırır (CLAUDE.md §2). Bölümü çökertmek ise o satırı hiç
 *   göstermemekle aynı şey.
 */
export function unknownValue(value: never): string {
  return String(value);
}
