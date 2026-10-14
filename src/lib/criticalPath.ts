/**
 * Kritik yol: en uzun zincir, ve kullanılamayan her şeyin adı (M7-16).
 *
 * M7-16 "Gantt / zaman çizelgesi; kritik yol" istiyor. Gantt 0028'de yapıldı;
 * eksik olan hesap. Bu dosya onu yapıyor — ve asıl işi hesaplamak değil,
 * **neyi hesaplayamadığını söylemek**.
 *
 * Ölçüm, 8 Ekim 2026: `dependencies` tablosu kütükler arası bir tablo. Bir
 * bağımlılığın her iki tarafı dava, saha işi, yükümlülük, risk, kilometre
 * taşı ya da çıplak bir etiket olabiliyor. Kritik yol ise **süreli bir
 * faaliyet ağı** ister. Yani tablonun tamamı yola girmiyor, ve girmeyeni
 * sessizce atmak en tehlikeli şey olurdu: eksik bir ağdan çıkan zincir, tam
 * bir zincir gibi okunur.
 *
 * Ağa giren iki düğüm türü var ve ikisi de standart:
 *
 *   **Saha işi**, iki tarihi de kayıtlıysa. Süresi `bitiş - başlangıç + 1`
 *   gün; tek günlük bir iş bir gün sürer, sıfır değil.
 *
 *   **Kilometre taşı**, hedef tarihi kayıtlıysa. Süresi SIFIR, çünkü bir
 *   kilometre taşı bir an değil bir süreç değildir. CPM'in "event" düğümü.
 *
 * NE HESAPLANMIYOR, VE NEDEN. Bolluk (float/slack) yok. Bolluk, planın
 * bağımlılıklarla **tutarlı** olmasını gerektirir; burada tarihler elle
 * girilmiş ve bir bağımlının başlangıcı blokeyenin bitişinden önce olabilir.
 * Böyle bir planda bolluk hesaplamak, veriden fazlasını iddia etmek olur.
 * Onun yerine o tutarsızlıklar `conflicts` olarak **bildiriliyor**: bir
 * planın kendi içinde çelişmesi, bolluk rakamından daha çok işe yarar.
 *
 * Döngü sessizce kırılmıyor. Bir döngü kritik yolu tanımsız yapar, ve
 * "tanımsız" ile "zincir bulunamadı" ayrı cümleler.
 */

export type PathNodeKind = 'task' | 'milestone';

export interface PathNode {
  id: string;
  kind: PathNodeKind;
  title: string;
  /** Gün. Kilometre taşı için 0. */
  days: number;
  start: string | null;
  end: string | null;
}

export interface PathEdge {
  /** Önce bitmesi gereken. */
  from: string;
  /** Onu bekleyen. */
  to: string;
}

/** Hesaba girmeyen bir şey, ve niçin girmediği. */
export interface Unused {
  reason:
    | 'task_without_dates'
    | 'milestone_without_a_target'
    | 'dependency_outside_the_network'
    | 'dependency_to_itself';
  count: number;
}

export interface CriticalPath {
  /** En uzun zincir. Hesaplanamıyorsa null — sıfır günlük bir zincir değil. */
  chain: { nodes: string[]; days: number } | null;
  /** Döngüdeki düğümler. Döngü varsa kritik yol tanımsızdır. */
  cycle: string[] | null;
  unused: Unused[];
  /** Bağımlının başlangıcı, blokeyenin bitişinden önce. Planın kendi çelişkisi. */
  conflicts: { from: string; to: string }[];
  nodeCount: number;
  edgeCount: number;
}

const DAY = 86_400_000;

/** İki tarih arasındaki gün sayısı, ikisi de dahil. */
export function spanDays(start: string, end: string): number {
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / DAY) + 1;
}

/**
 * Düğümlerden ve kenarlardan en uzun zinciri çıkarır.
 *
 * Kahn sıralaması: her tur girişi kalmamış düğümleri alıyor. Tur bittiğinde
 * düğümlerin hepsi çıkmamışsa kalanlar bir döngünün içinde — o zaman zincir
 * null ve döngü adıyla bildiriliyor.
 */
export function criticalPath(nodes: PathNode[], edges: PathEdge[]): CriticalPath {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const unused = new Map<Unused['reason'], number>();
  const bump = (reason: Unused['reason']) => unused.set(reason, (unused.get(reason) ?? 0) + 1);

  /** @type {PathEdge[]} */
  const live: PathEdge[] = [];
  for (const edge of edges) {
    if (edge.from === edge.to) {
      bump('dependency_to_itself');
      continue;
    }
    if (!byId.has(edge.from) || !byId.has(edge.to)) {
      bump('dependency_outside_the_network');
      continue;
    }
    live.push(edge);
  }

  const after = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const n of nodes) {
    after.set(n.id, []);
    indegree.set(n.id, 0);
  }
  for (const e of live) {
    after.get(e.from)!.push(e.to);
    indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1);
  }

  // Planın kendi çelişkisi: bağımlı, blokeyen bitmeden başlıyor.
  const conflicts: { from: string; to: string }[] = [];
  for (const e of live) {
    const from = byId.get(e.from)!;
    const to = byId.get(e.to)!;
    const blockerEnd = from.end ?? from.start;
    const dependentStart = to.start ?? to.end;
    if (blockerEnd && dependentStart && Date.parse(dependentStart) < Date.parse(blockerEnd)) {
      conflicts.push({ from: e.from, to: e.to });
    }
  }

  // En uzun zincir, topolojik sırada biriktirilerek.
  const best = new Map<string, { days: number; prev: string | null }>();
  for (const n of nodes) best.set(n.id, { days: n.days, prev: null });

  const queue = nodes.filter((n) => (indegree.get(n.id) ?? 0) === 0).map((n) => n.id);
  let settled = 0;
  while (queue.length > 0) {
    const id = queue.shift()!;
    settled++;
    const here = best.get(id)!;
    for (const next of after.get(id) ?? []) {
      const candidate = here.days + byId.get(next)!.days;
      const current = best.get(next)!;
      if (candidate > current.days) best.set(next, { days: candidate, prev: id });
      indegree.set(next, (indegree.get(next) ?? 0) - 1);
      if ((indegree.get(next) ?? 0) === 0) queue.push(next);
    }
  }

  const unusedList: Unused[] = [...unused].map(([reason, count]) => ({ reason, count }));

  if (settled < nodes.length) {
    const inCycle = nodes.filter((n) => (indegree.get(n.id) ?? 0) > 0).map((n) => n.id);
    return {
      chain: null,
      cycle: inCycle,
      unused: unusedList,
      conflicts,
      nodeCount: nodes.length,
      edgeCount: live.length,
    };
  }

  if (nodes.length === 0) {
    return {
      chain: null,
      cycle: null,
      unused: unusedList,
      conflicts,
      nodeCount: 0,
      edgeCount: 0,
    };
  }

  let endId = nodes[0]!.id;
  for (const n of nodes) if (best.get(n.id)!.days > best.get(endId)!.days) endId = n.id;

  const chain: string[] = [];
  for (let at: string | null = endId; at !== null; at = best.get(at)!.prev) chain.unshift(at);

  return {
    chain: { nodes: chain, days: best.get(endId)!.days },
    cycle: null,
    unused: unusedList,
    conflicts,
    nodeCount: nodes.length,
    edgeCount: live.length,
  };
}
