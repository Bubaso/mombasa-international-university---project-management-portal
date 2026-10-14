/**
 * "Bakana ulaşmak için en kısa yol kim?" (M4-10)
 *
 * M4-10 bir ağ grafiği istiyor, ama grafiğin cevaplaması gereken soru satırın
 * kendisinde yazılı: hedefe giden en kısa yol. Bu dosya o yolu hesaplıyor;
 * ekran onu çiziyor.
 *
 * ÜÇ KARAR, VE ÜÇÜ DE KAYDA DAYANIYOR
 *
 * **Bir bağ yol değildir — bazıları.** 0006 bağın yönünün anlamlı olduğunu
 * söylüyor: "vali bakanı etkiler", tersiyle aynı iddia değil. Etkileme ve
 * danışmanlık yön taşır (etkileyenden etkilenene doğru geçilir); akrabalık ve
 * birlikte çalışma simetriktir; hiyerarşi iki yönde de konuşma taşır.
 *
 * Ve `opposes` HİÇBİR YÖNDE yol değil. Bir hasımdan geçen zincire "en kısa
 * yol" demek, bir hasmın mesajı ileteceğini VARSAYMAK olur — kimse bunu
 * kaydetmedi. Bağ ağda duruyor, yolda kullanılmıyor, ve ekran kaç bağı bu
 * yüzden atladığını söylüyor. Saymadan atmak, bağın hiç olmadığını sandırır.
 *
 * **Yol birinden başlamak zorunda.** Zincirin ilk halkası, bizim gerçekten
 * konuşabildiğimiz biri olmalı. Portalda bunun iki kaydı var ve ikisi eşit
 * değil: bir görüşme kütüğü (konuştuk) ve atanmış bir ilişki sorumlusu
 * (konuşsun diye birini görevlendirdik). Birincisi olmuş bir şey, ikincisi
 * niyet. Yol ikisinden de başlayabilir, ama hangisine dayandığı YAZILI, ve
 * sıralamada konuşma önce geliyor.
 *
 * **Sıralama sözlüksel, ve her bileşeni kayıtlı bir sayı.** Önce sıçrama
 * sayısı (en kısa, satırın istediği şey), sonra başlangıcın kanıtı (görüşme
 * önce), sonra zincirin en zayıf halkası (1–5, `strength`). Üçünü tek bir
 * puana karıştırmak "3,4 sıçrama" gibi kimsenin yorumlayamayacağı bir sayı
 * üretir — ve kimsenin yorumlayamadığı bir sayı, bu portalın ekrandan
 * kaldırdığı şeyin kendisi.
 *
 * YOL YOKSA SEBEBİ YAZILI
 *
 * "Ulaşılamaz" demiyoruz, çünkü bilmiyoruz. İki ayrı sebep var ve ikisi ayrı
 * işler: hiç başlangıç kaydı yok (kütük boş), ya da başlangıç var ama hedefe
 * giden kayıtlı bir bağ zinciri yok (ağ eksik). Birincisi görüşme kaydetmeyi
 * ister, ikincisi bağ kaydetmeyi.
 */

/** 0006'nın `relationship_kind` enum'u. */
export type TieKind =
  'influences' | 'works_with' | 'related_to' | 'reports_to' | 'advises' | 'opposes';

/**
 * Bağın hangi yönde geçilebildiği.
 *
 * `forward`: kayıtlı yönde, yani `from`'dan `to`'ya.
 * `both`: iki yönde — anlamı simetrik ya da iki yönde de konuşma taşıyor.
 * `none`: hiç. Bugün yalnızca `opposes`, ve sebebi dosya başında.
 */
export const TRAVERSAL: Record<TieKind, 'forward' | 'both' | 'none'> = {
  influences: 'forward',
  advises: 'forward',
  reports_to: 'both',
  works_with: 'both',
  related_to: 'both',
  opposes: 'none',
};

export interface PersonLike {
  id: string;
  /** Bizim tarafta ilişkinin sorumlusu; kimse atanmadıysa null. */
  relationshipOwnerId: string | null;
}

export interface TieLike {
  id: string;
  fromId: string;
  toId: string;
  kind: string;
  /** 1–5. */
  strength: number;
}

export interface Hop {
  tieId: string;
  fromId: string;
  toId: string;
  kind: TieKind;
  strength: number;
  /** Bağ ters yönde kayıtlı ve simetrik olduğu için bu yönde geçildi. */
  reversed: boolean;
}

/** Zincirin ilk halkasının neye dayandığı. İkisi eşit değil. */
export type Entry = 'spoken' | 'owner_assigned';

export interface Route {
  entryId: string;
  entry: Entry;
  hops: Hop[];
  /** Bağ sayısı. 0 ise hedefin kendisi bir başlangıç noktası. */
  length: number;
  /** Zincirin en zayıf halkası. Sıfır sıçramalı yolda null — halka yok. */
  weakestLink: number | null;
}

export type NoRoute = 'unknown_target' | 'no_entry_recorded' | 'no_tie_recorded';

export interface Reach {
  targetId: string;
  /** Sıralı, ve hepsi AYNI uzunlukta: en kısa yol birden fazla olabilir. */
  routes: Route[];
  /** Yol yoksa sebebi. Yol varsa null. */
  why: NoRoute | null;
  /** `ROUTE_CAP` aşıldı: gösterilenler hepsi değil. */
  truncated: boolean;
}

export interface Network {
  /** Yol olarak geçilebilen yönlü kenar sayısı. */
  edges: number;
  /** Yolda kullanılmayan hasım bağı — ağda var, zincirde yok. */
  hostileTiesIgnored: number;
  /** Türü tanınmayan bağ: bir göç yeni bir değer ürettiyse. Yol sayılmıyor. */
  unrecognisedTies: number;
  /** Hiçbir bağı olmayan paydaş: ağın kör noktası. */
  withoutATie: number;
  /** Görüşme kaydı olan paydaş sayısı. */
  spokenTo: number;
  /** Görüşme kaydı yok ama ilişki sorumlusu atanmış. */
  ownerOnly: number;
}

export interface ReachInput {
  people: PersonLike[];
  ties: TieLike[];
  /** Görüşme kaydı bulunan paydaş kimlikleri. */
  spokenTo: Iterable<string>;
}

/**
 * Gösterilen en kısa yol sayısı. Yoğun bir ağda aynı uzunlukta çok yol
 * olabilir ve hepsini saymak kombinatoryal patlar; kesilince `truncated`
 * yazılıyor, çünkü sessizce kesmek bu depoda ayrı bir kapının konusu.
 */
export const ROUTE_CAP = 12;

const isTieKind = (k: string): k is TieKind => Object.prototype.hasOwnProperty.call(TRAVERSAL, k);

interface Edge {
  tieId: string;
  to: string;
  kind: TieKind;
  strength: number;
  reversed: boolean;
}

function buildEdges(ties: TieLike[]) {
  const out = new Map<string, Edge[]>();
  let hostile = 0;
  let unrecognised = 0;
  let edges = 0;

  const push = (from: string, edge: Edge) => {
    const list = out.get(from);
    if (list) list.push(edge);
    else out.set(from, [edge]);
    edges++;
  };

  for (const tie of ties) {
    if (!isTieKind(tie.kind)) {
      unrecognised++;
      continue;
    }
    const how = TRAVERSAL[tie.kind];
    if (how === 'none') {
      hostile++;
      continue;
    }
    push(tie.fromId, {
      tieId: tie.id,
      to: tie.toId,
      kind: tie.kind,
      strength: tie.strength,
      reversed: false,
    });
    if (how === 'both') {
      push(tie.toId, {
        tieId: tie.id,
        to: tie.fromId,
        kind: tie.kind,
        strength: tie.strength,
        reversed: true,
      });
    }
  }
  return { out, hostile, unrecognised, edges };
}

function entriesOf(input: ReachInput) {
  const spoken = new Set(input.spokenTo);
  const entries = new Map<string, Entry>();
  for (const person of input.people) {
    if (spoken.has(person.id)) entries.set(person.id, 'spoken');
    else if (person.relationshipOwnerId != null) entries.set(person.id, 'owner_assigned');
  }
  return { spoken, entries };
}

/** Ağın kendisi hakkındaki sayılar — hedefe bağlı değil. */
export function reachNetwork(input: ReachInput): Network {
  const { out, hostile, unrecognised, edges } = buildEdges(input.ties);
  const { spoken, entries } = entriesOf(input);

  // Bir bağı olmak, geçilebilir bir bağı olmak demek değil: yalnızca hasım
  // bağı olan biri ağda duruyor ama zincire giremiyor. Burada sayılan şey
  // GEÇİLEBİLİR bağı olmayanlar, çünkü soru yol sorusu.
  const touched = new Set<string>();
  for (const [from, list] of out) {
    touched.add(from);
    for (const edge of list) touched.add(edge.to);
  }

  let ownerOnly = 0;
  for (const [id, kind] of entries) {
    if (kind === 'owner_assigned' && !spoken.has(id)) ownerOnly++;
  }

  return {
    edges,
    hostileTiesIgnored: hostile,
    unrecognisedTies: unrecognised,
    withoutATie: input.people.filter((p) => !touched.has(p.id)).length,
    spokenTo: input.people.filter((p) => spoken.has(p.id)).length,
    ownerOnly,
  };
}

const ENTRY_RANK: Record<Entry, number> = { spoken: 0, owner_assigned: 1 };

/**
 * Hedefe giden en kısa yollar.
 *
 * Çok kaynaklı genişlik-öncelikli arama: her başlangıç noktası 0 uzaklıkta.
 * En kısa uzunluk bulununca o uzunluktaki TÜM yollar çıkarılıyor — "en kısa
 * yol" çoğul olabilir ve birini seçip öbürünü saklamak, seçimi bizim
 * yaptığımızı gizler.
 */
export function routesTo(input: ReachInput, targetId: string): Reach {
  const known = new Set(input.people.map((p) => p.id));
  if (!known.has(targetId)) {
    return { targetId, routes: [], why: 'unknown_target', truncated: false };
  }

  const { out } = buildEdges(input.ties);
  const { entries } = entriesOf(input);
  if (entries.size === 0) {
    return { targetId, routes: [], why: 'no_entry_recorded', truncated: false };
  }

  // HEDEFİN KENDİSİ BAŞLANGIÇ NOKTASIYSA BURADA ÖZEL BİR DAL YOK, ve ilk
  // yazışımda vardı: sıfır sıçramalı yolu elle kurup erken dönüyordu.
  // Mutasyonla sınadım — dalı kapattım ve HİÇBİR ŞEY DÜŞMEDİ, çünkü genel
  // yol onu zaten doğru veriyor: başlangıç noktasının uzaklığı sıfır, döngü
  // hiç çalışmıyor, ve çıkarım ilk adımda başlangıcı görüp sıfır halkalı yolu
  // yazıyor. Düşmeyen bir mutasyon ya testin ya kodun fazlalığını söyler;
  // burada kodun fazlasıydı.

  const dist = new Map<string, number>();
  // Her düğüm için EN KISA uzaklıktaki gelen kenarlar. Birden fazla olabilir;
  // yol çıkarımı bunların hepsini dolaşıyor.
  const back = new Map<string, { from: string; edge: Edge }[]>();
  let frontier: string[] = [];
  for (const id of entries.keys()) {
    dist.set(id, 0);
    frontier.push(id);
  }

  let depth = 0;
  while (frontier.length > 0 && !dist.has(targetId)) {
    depth++;
    const next: string[] = [];
    for (const from of frontier) {
      for (const edge of out.get(from) ?? []) {
        if (!known.has(edge.to)) continue; // Paydaş listesinde olmayan uç.
        const seen = dist.get(edge.to);
        if (seen === undefined) {
          dist.set(edge.to, depth);
          back.set(edge.to, [{ from, edge }]);
          next.push(edge.to);
        } else if (seen === depth) {
          back.get(edge.to)?.push({ from, edge });
        }
      }
    }
    frontier = next;
  }

  if (!dist.has(targetId)) {
    return { targetId, routes: [], why: 'no_tie_recorded', truncated: false };
  }

  // Geriye doğru çıkar. Her dal bir yol; başlangıç noktasına varınca kapanır.
  const routes: Route[] = [];
  let truncated = false;
  const walk = (node: string, tail: Hop[]) => {
    if (routes.length >= ROUTE_CAP) {
      truncated = true;
      return;
    }
    const entry = entries.get(node);
    if (entry !== undefined && dist.get(node) === 0) {
      const hops = [...tail];
      routes.push({
        entryId: node,
        entry,
        hops,
        length: hops.length,
        weakestLink: hops.length === 0 ? null : Math.min(...hops.map((h) => h.strength)),
      });
      return;
    }
    for (const step of back.get(node) ?? []) {
      walk(step.from, [
        {
          tieId: step.edge.tieId,
          fromId: step.from,
          toId: node,
          kind: step.edge.kind,
          strength: step.edge.strength,
          reversed: step.edge.reversed,
        },
        ...tail,
      ]);
    }
  };
  walk(targetId, []);

  // Sıralama: kanıt önce, sonra en zayıf halka.
  //
  // UZUNLUK BURADA SIRALAMA ANAHTARI DEĞİL, ve ilk yazışımda öyleydi. Arama
  // yalnızca EN KISA uzaklıktaki gelen kenarları tutuyor, yani çıkarılan her
  // yol aynı uzunlukta — `a.length - b.length` hiçbir zaman sıfırdan farklı
  // olamaz. Hiç ateşlenemeyen bir sıralama anahtarı, kodun tutmadığı bir
  // iddiadır: okuyan "demek ki farklı uzunlukta yollar dönüyor" sanır.
  // Uzunluğun tek olduğu `routes.map((r) => r.length)` ile sınanıyor.
  routes.sort(
    (a, b) =>
      ENTRY_RANK[a.entry] - ENTRY_RANK[b.entry] || (b.weakestLink ?? 0) - (a.weakestLink ?? 0),
  );

  return { targetId, routes, why: null, truncated };
}
