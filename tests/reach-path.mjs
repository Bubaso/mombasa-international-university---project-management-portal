/**
 * "Bakana ulaşmak için en kısa yol kim?" (M4-10)
 *
 * `src/lib/reachPath.ts`'in kuralını sınar. Kurgu, her kuralı kıracak bir
 * şey TAŞIMAK üzere kuruldu — bu depoda en az on kez şu oldu: bir mutasyon
 * düşmedi, çünkü kurgu o soruyu hiç sormuyordu.
 *
 * Kurguda kasıtlı olarak duran şeyler:
 *
 *   - `hostile` bakana bir `opposes` bağıyla bağlı VE `a1` ona `works_with`
 *     ile bağlı. Yani `opposes` yola açılsa iki sıçramalık YENİ bir yol
 *     çıkar: sayı 3'ten 4'e gider ve sıralama da değişir. Bağ kurguda
 *     olmasa "hasım yol değildir" assertion'ı boş yere geçerdi.
 *   - `t11` bakana DOĞRUDAN bağlı, ama türü tanınmıyor (`befriends`). Tür
 *     kontrolü gevşerse en kısa yol 2 sıçramadan 1'e düşer — yani kapı
 *     sayıyı değiştirir, sessiz kalmaz.
 *   - `clerk` bakana `reports_to` ile bağlı, ters yönde. Hiyerarşi tek yöne
 *     indirilse `clerk` ulaşılmaz olur.
 *   - `enemy`'nin bakandan başka bağı yok ve o da `opposes`. Yani "geçilebilir
 *     bağı olmayan" sayısı, "hiç bağı olmayan"la aynı şey değil.
 *   - Üç yol aynı uzunlukta ve sıralamanın üç bileşenini de ayırt ediyor.
 *
 * Usage: npm run test:reach-path
 */
import { ROUTE_CAP, TRAVERSAL, reachNetwork, routesTo } from '../src/lib/reachPath.ts';

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};
const eq = (got, want, label) =>
  check(
    JSON.stringify(got) === JSON.stringify(want),
    label,
    JSON.stringify(got) === JSON.stringify(want)
      ? JSON.stringify(got)
      : `ölçülen ${JSON.stringify(got)}, beklenen ${JSON.stringify(want)}`,
  );

const person = (id, owner = null) => ({ id, relationshipOwnerId: owner });
const tie = (id, fromId, toId, kind, strength) => ({ id, fromId, toId, kind, strength });

const PEOPLE = [
  person('a1'),
  person('b1', 'profile-7'),
  person('gov'),
  person('adviser'),
  person('aide'),
  person('minister'),
  person('hostile'),
  person('clerk'),
  person('far'),
  person('isolated'),
  person('enemy'),
  person('outsider'),
];

const TIES = [
  tie('t1', 'a1', 'gov', 'influences', 4),
  tie('t2', 'gov', 'minister', 'advises', 2),
  tie('t3', 'a1', 'adviser', 'works_with', 5),
  tie('t4', 'adviser', 'minister', 'advises', 5),
  tie('t5', 'b1', 'aide', 'influences', 5),
  tie('t6', 'aide', 'minister', 'influences', 5),
  tie('t7', 'a1', 'hostile', 'works_with', 3),
  tie('t8', 'hostile', 'minister', 'opposes', 5),
  tie('t9', 'clerk', 'minister', 'reports_to', 3),
  tie('t10', 'minister', 'far', 'influences', 1),
  tie('t11', 'a1', 'minister', 'befriends', 3),
  tie('t12', 'enemy', 'minister', 'opposes', 4),
  // RLS hâli: 'ghost' paydaş listesinde YOK, yani okuyan onu göremiyor.
  // 'outsider'a giden tek kayıtlı yol onun üzerinden geçiyor.
  tie('t13', 'minister', 'ghost', 'influences', 2),
  tie('t14', 'ghost', 'outsider', 'influences', 2),
  // Aynı katmandaki iki düğüm birbirine bağlı. Bu, aramanın "yalnızca
  // EN KISA uzaklıktaki gelen kenar" kuralını ayırt eden tek şey:
  // kural gevşerse `gov` ile `adviser` birbirinin önceli olur ve
  // hedefe iki sıçramalık yol yerine üç, dört, beş sıçramalık yollar
  // da çıkar. Kurguda bu bağ olmadan mutasyon sessiz kalıyordu.
  tie('t15', 'gov', 'adviser', 'works_with', 4),
];

const INPUT = { people: PEOPLE, ties: TIES, spokenTo: ['a1'] };

// ---------------------------------------------------------------------------
// Kurgunun kendisi: plantedlar yerinde mi?
// ---------------------------------------------------------------------------
//
// Bir kurgu sessizce değişirse yukarıdaki assertion'ların yarısı boş yere
// geçer. Bu yüzden kurgu önce kendi kendini sınıyor.

check(
  TIES.filter((t) => t.kind === 'opposes').length === 2,
  'kurguda iki hasım bağı var (yoksa "hasım yol değildir" boş geçer)',
);
check(
  TIES.some((t) => t.fromId === 'a1' && t.toId === 'hostile'),
  'hasım, konuştuğumuz birine bağlı (yoksa hasım yolu zaten çıkmaz)',
);
check(
  TIES.filter((t) => !Object.prototype.hasOwnProperty.call(TRAVERSAL, t.kind)).length === 1,
  'kurguda türü tanınmayan bir bağ var (yoksa tür kontrolü boş geçer)',
);
check(
  TIES.some((t) => t.kind === 'befriends' && t.fromId === 'a1' && t.toId === 'minister'),
  'tanınmayan bağ hedefe DOĞRUDAN gidiyor (gevşerse en kısa yol 1 olur)',
);

// ---------------------------------------------------------------------------
// Ağın kendisi
// ---------------------------------------------------------------------------

const net = reachNetwork(INPUT);
eq(net.edges, 16, 'geçilebilir yönlü kenar sayısı');
eq(net.hostileTiesIgnored, 2, 'hasım bağı sayılıyor ama yolda kullanılmıyor');
eq(net.unrecognisedTies, 1, 'türü tanınmayan bağ sayılıyor, yol sayılmıyor');
eq(net.spokenTo, 1, 'görüşme kaydı olan paydaş');
eq(net.ownerOnly, 1, 'görüşme yok ama ilişki sorumlusu atanmış');
// `enemy`'nin bağı var ama geçilebilir değil; `isolated`'ın hiç bağı yok.
// İkisi de zincire giremiyor, ve soru yol sorusu olduğu için ikisi de burada.
eq(net.withoutATie, 2, 'geçilebilir bağı olmayan paydaş (hasım bağı bağ sayılmıyor)');

// ---------------------------------------------------------------------------
// En kısa yol
// ---------------------------------------------------------------------------

const toMinister = routesTo(INPUT, 'minister');
eq(toMinister.why, null, 'bakana yol var');
eq(toMinister.routes.length, 3, 'bakana üç ayrı en kısa yol');
eq(
  toMinister.routes.map((r) => r.length),
  [2, 2, 2],
  'hepsi aynı uzunlukta — "en kısa yol" çoğul olabilir',
);
check(
  toMinister.routes.every((r) => !r.hops.some((h) => h.kind === 'opposes')),
  'hiçbir yol hasım bağından geçmiyor',
);
check(
  toMinister.routes.every((r) => !r.hops.some((h) => h.kind === 'befriends')),
  'hiçbir yol türü tanınmayan bağdan geçmiyor',
);

// Sıralama sözlüksel: uzunluk eşit, sonra kanıt, sonra en zayıf halka.
eq(
  toMinister.routes.map((r) => `${r.entryId}:${r.entry}:${r.weakestLink}`),
  ['a1:spoken:5', 'a1:spoken:2', 'b1:owner_assigned:5'],
  'sıralama: kanıt önce, sonra en zayıf halka',
);
eq(
  toMinister.routes[0].hops.map((h) => `${h.fromId}→${h.toId}/${h.kind}/${h.strength}`),
  ['a1→adviser/works_with/5', 'adviser→minister/advises/5'],
  'en iyi yolun halkaları',
);
eq(toMinister.truncated, false, 'kesilmedi');

// ---------------------------------------------------------------------------
// Ters yönde geçilen bağ
// ---------------------------------------------------------------------------

const toClerk = routesTo(INPUT, 'clerk');
eq(toClerk.why, null, 'kâtibe yol var (hiyerarşi iki yönde konuşma taşır)');
eq(
  toClerk.routes.map((r) => r.length),
  [3, 3, 3],
  'kâtip üç sıçrama uzakta',
);
const last = toClerk.routes[0].hops[2];
eq(
  [last.fromId, last.toId, last.reversed],
  ['minister', 'clerk', true],
  'son halka kayıtlı yönün TERSİNE geçildi ve bu yazılı',
);

// ---------------------------------------------------------------------------
// Daha uzun yol, kısa yol varken dönmüyor
// ---------------------------------------------------------------------------

const toFar = routesTo(INPUT, 'far');
eq(
  toFar.routes.map((r) => r.length),
  [3, 3, 3],
  'uzaktaki kişi üç sıçrama',
);
eq(toFar.routes[0].weakestLink, 1, 'en zayıf halka zincirin en zayıfı, ortalaması değil');

// ---------------------------------------------------------------------------
// Yol yoksa SEBEBİ yazılı — "ulaşılamaz" demiyoruz
// ---------------------------------------------------------------------------

eq(routesTo(INPUT, 'isolated').why, 'no_tie_recorded', 'bağ kaydı yok');
// Göremediğiniz birinin üzerinden geçen yol, yol değil. Okuyan 'ghost'u
// göremiyor (RLS onu süzdü) ve 'outsider'a giden tek kayıtlı zincir ondan
// geçiyor. Zinciri adsız bir halkayla göstermek, hem bir kişinin VARLIĞINI
// sızdırır hem de kullanılamaz bir yol gösterir (CLAUDE.md §4: gizlilik
// varsayılanı kapalı tarafta).
eq(
  routesTo(INPUT, 'outsider').why,
  'no_tie_recorded',
  'göremediğiniz bir kişiden geçen zincir yol sayılmıyor',
);
eq(routesTo(INPUT, 'ghost').why, 'unknown_target', 'göremediğiniz kişinin kendisi de hedef olamaz');
eq(routesTo(INPUT, 'enemy').why, 'no_tie_recorded', 'yalnızca hasım bağı olan: yol değil');
eq(routesTo(INPUT, 'yok-böyle-biri').why, 'unknown_target', 'paydaş listesinde olmayan hedef');
eq(
  routesTo({ people: PEOPLE.map((p) => person(p.id)), ties: TIES, spokenTo: [] }, 'minister').why,
  'no_entry_recorded',
  'hiç başlangıç kaydı yok: ağ eksik değil, kütük boş',
);
// İki sebep ayrı işler ister ve bu yüzden aynı değer değil.
check(
  routesTo(INPUT, 'isolated').why !== routesTo({ ...INPUT, spokenTo: [] }, 'minister').why ||
    PEOPLE.some((p) => p.relationshipOwnerId != null),
  'iki sebep birbirinden ayrı',
);

// ---------------------------------------------------------------------------
// Hedefin kendisiyle görüşülmüşse aracı aranmıyor
// ---------------------------------------------------------------------------

const toA1 = routesTo(INPUT, 'a1');
eq(
  [toA1.routes.length, toA1.routes[0].length, toA1.routes[0].entry, toA1.routes[0].weakestLink],
  [1, 0, 'spoken', null],
  'konuştuğumuz kişiye sıfır sıçrama, ve halka olmadığı için en zayıf halka null',
);
eq(routesTo(INPUT, 'b1').routes[0].entry, 'owner_assigned', 'sorumlusu atanmış kişi de başlangıç');

// ---------------------------------------------------------------------------
// Kesme sessiz değil
// ---------------------------------------------------------------------------

const many = {
  people: [
    person('start'),
    person('goal'),
    ...Array.from({ length: 15 }, (_, i) => person(`m${i}`)),
  ],
  ties: Array.from({ length: 15 }, (_, i) => [
    tie(`x${i}`, 'start', `m${i}`, 'works_with', 3),
    tie(`y${i}`, `m${i}`, 'goal', 'influences', 3),
  ]).flat(),
  spokenTo: ['start'],
};
const capped = routesTo(many, 'goal');
eq(capped.routes.length, ROUTE_CAP, 'gösterilen yol sayısı sınırlı');
eq(capped.truncated, true, 'kesildiği YAZILI');

console.log('');
if (failures > 0) {
  console.error(`${failures} reach-path check(s) failed.`);
  process.exit(1);
}
console.log('All reach-path checks passed.');
