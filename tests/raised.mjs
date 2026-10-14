/**
 * Yükselmiş bir tavanın kaydı — iki kapının paylaştığı tek kural.
 *
 * `tests/populated.mjs` (yoğunluk) ve `tests/screen-text.mjs` (ekran metni)
 * aynı soruyu soruyor: bir tavan niçin yükseldi? İkisine ayrı ayrı yazmak
 * CLAUDE.md §4'ün yasakladığı şey olurdu — sapan kopya her zaman ikincisidir.
 *
 * Neden var: 8 Ekim 2026'ya kadar yükseltmelerin gerekçesi `populated.mjs`'in
 * yorumunda **proza olarak** duruyordu. Yorumu okumayan biri rakamı
 * değiştirip geçer, ve kapı hiçbir şey demez. Üç şey sınanıyor:
 *
 *   1. Gösterilen gereksinim satırı dokümanlarda gerçekten var mı. Bu
 *      **uydurmayı** yakalar, atfın doğruluğunu değil — `/construction`'ın
 *      gerekçesini ilk yazışımda T1-07 koydum, T1-07 var olduğu için kapı
 *      geçti, oysa doğru satır T14-04'tü.
 *   2. Kayıt bir bedel mi (yeni > eski). Düşen bir tavan bu listeye girmez.
 *   3. Gösterdiği tavan gerçekten ölçülen bir tavan mı. Yanlış yazılmış bir
 *      ad kaydı sessizce anlamsız kılar: kimse o yükseltmeyi bir daha
 *      bulamaz.
 *
 * Ölçüm değişiklikleri BU LİSTEYE GİRMEZ. Bir tavan ölçü düzeldiği için
 * yükseldiyse ödenen bir bedel yok, görülmeyen bir şey görünür oldu; o
 * ayrımı iki kez yaptık (`a9fa04c` ve 8 Ekim'in sahte yetki düzeltmesi).
 */
export function raiseChecks({ raises, corpus, knownKeys, check }) {
  const unknown = raises.filter((r) => !corpus.includes(`| ${r.row} |`)).map((r) => r.row);
  check(
    unknown.length === 0,
    'yükseltilmiş her tavan var olan bir gereksinim satırını gösteriyor',
    unknown.length ? unknown.join(', ') : `${raises.length} yükseltme`,
  );

  const backwards = raises.filter((r) => r.to <= r.from).map((r) => r.what);
  check(
    backwards.length === 0,
    've her kaydı bir bedel — düşen bir tavan bu listeye girmiyor',
    backwards.length ? backwards.join(', ') : `${raises.length} yükseltme`,
  );

  const nowhere = raises.filter((r) => !knownKeys.includes(r.what)).map((r) => r.what);
  check(
    nowhere.length === 0,
    've gösterdiği tavan gerçekten ölçülen bir tavan',
    nowhere.length ? nowhere.join(', ') : `${raises.length} yükseltme`,
  );
}
