/**
 * Şemadan satır üretir: her ilişki için, o ilişkinin kolonlarına uyan veri.
 *
 * Neden var: `tests/smoke.mjs` her ekranı açıyor ama backend'i **boş**
 * cevaplıyor, ve bunu kasten yapıyor — boş veri bir zamanlar iki hukuk
 * sekmesini çökertmişti. Ama boş veri hiçbir satırı render etmez, yani satır
 * başına çalışan kodun tamamı o testin dışında kalıyor. 3 Ekim'de takvim
 * ekranını düşüren şey tam oradaydı: `kind = 'milestone'` olan **bir** satır.
 * Boş cevapla o hata görünmezdi; bir satırla hemen görünürdü.
 *
 * Üretilen veri iki ilkeye uyuyor:
 *
 *   **Enum'un her değeri bir satır alır.** Çökerten şey genelde türün
 *   kendisi değil, istemcinin tanımadığı değeridir. Bu yüzden ilişkinin ilk
 *   enum kolonu bütün değerlerini sırayla geziyor — en yenisi dahil, ki
 *   istemcinin en çok onu kaçırması bekleniyor.
 *
 *   **Null olabilen her kolonun null olduğu bir satır.** Tipin "null olamaz"
 *   dediği yerde veritabanı null üretiyorsa, o satır bunu gösterir.
 *
 * Görünümler için null satırı **üretilmiyor**, ve bu bir eksiklik olarak
 * duruyor: Postgres bir görünümün hangi kolonunun null olabileceğini
 * bilmiyor, `is_nullable` her görünüm kolonunda 'YES' yazıyor. Hepsini null
 * yapmak 350'den fazla hayalet bulgu üretirdi — ölçmediğini söylemek,
 * ölçtüğünü sanmaktan iyidir.
 */

/** @typedef {{table_name: string, column_name: string, is_nullable: string, data_type: string, udt_name: string, table_type: string, enum_values: string[] | null}} Column */

/** Aynı girdiye aynı değer: bir koşu ile diğeri karşılaştırılabilir kalsın. */
function seeded(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const uuidFor = (text) => {
  const h = seeded(text).toString(16).padStart(8, '0').slice(0, 8);
  return `${h}-0000-4000-8000-${String(seeded(text + '!'))
    .padStart(12, '0')
    .slice(0, 12)}`;
};

/**
 * Bir kolonun dolu değeri.
 *
 * jsonb için `null` dönüyor: şema o kolonun bir dizi mi nesne mi tuttuğunu
 * söylemiyor, ve yanlış şekli göndermek istemcinin kendi hatası gibi
 * görünürdü. Null, istemcinin zaten karşılaşacağı bir durum.
 */
function value(column, row, vocabularies) {
  const { column_name: name, data_type: type, udt_name: udt, enum_values: values } = column;

  if (values && values.length > 0) return values[row % values.length];

  // Kapalı bir dağarcığı olan hesaplanmış kolon: değer o dağarcıktan gelmeli.
  // Yoksa fixture görünümün asla üretmeyeceği bir metin gönderir ve ekranın
  // o metni tanımaması "hata" gibi görünür — 0038'in `amount_verdict`'inde
  // tam bu oldu ve bir hayalet bulgu üretti.
  if (column.table_type === 'VIEW' && ['text', 'character varying'].includes(type)) {
    const vocabulary = vocabularies?.get(name);
    if (vocabulary && vocabulary.complete) {
      const list = [...vocabulary.values];
      return list[row % list.length];
    }
  }
  if (type === 'ARRAY') return [];
  if (udt === 'uuid') return uuidFor(`${column.table_name}.${name}.${row}`);
  if (udt === 'bool') return row % 2 === 0;
  if (['numeric', 'int2', 'int4', 'int8', 'float4', 'float8'].includes(udt))
    return (seeded(name) % 90) + 1 + row;
  if (udt === 'date') return `2026-0${(row % 9) + 1}-1${row % 9}`;
  if (['timestamp', 'timestamptz'].includes(udt))
    return `2026-0${(row % 9) + 1}-1${row % 9}T08:30:00Z`;
  if (udt === 'time') return '08:30:00';
  if (['json', 'jsonb'].includes(udt)) return null;
  if (udt === 'bytea') return null;
  if (udt === 'interval') return '1 day';
  // Kalan her şey metin. Değer kolonun adını taşıyor, böylece ekranda bir
  // şey ters göründüğünde hangi kolondan geldiği okunabiliyor.
  return `${name.replace(/_/g, ' ')} ${row + 1}`;
}

/**
 * Bir ilişkinin satırları.
 *
 * @param {Column[]} columns o ilişkinin kolonları
 * @param {Map<string, {values: Set<string>, complete: boolean}>} [vocabularies] `case … end as` dağarcıkları
 * @returns {Record<string, unknown>[]}
 */
export function rowsFor(columns, vocabularies) {
  if (columns.length === 0) return [];
  const isView = columns[0].table_type === 'VIEW';
  const enumColumn = columns.find((c) => c.enum_values && c.enum_values.length > 1);
  // Satır sayısı en uzun dağarcığa göre: her değerin bir satırı olsun.
  const vocabularySpans = columns
    .map((c) => vocabularies?.get(c.column_name))
    .filter((v) => v && v.complete)
    .map((v) => v.values.size);
  const span = Math.min(
    8,
    Math.max(2, enumColumn ? enumColumn.enum_values.length : 0, ...vocabularySpans),
  );

  const rows = [];
  for (let i = 0; i < span; i++) {
    const row = {};
    for (const column of columns) row[column.column_name] = value(column, i, vocabularies);
    rows.push(row);
  }

  // Her enum kolonunun, bu paketin tanımadığı bir değer taşıdığı satır.
  //
  // Uydurma değil, ölçülmüş bir durum: göç canlıya uygulandığı an veritabanı
  // yeni değeri üretmeye başlıyor, yayınlanmış paket onu bir sonraki
  // deploy'da öğreniyor. 3 Ekim'de bu satır eklendiğinde 19 ekranın 12'si
  // hata sınırına düştü — hepsi aynı şekilden, `Record<Birlik, …>` üzerinde
  // korumasız bir erişimden. Ekranın beklenen davranışı değeri kendi adıyla
  // göstermek; tanımamak bir bölümü kaybetmek için sebep değil.
  const future = {};
  for (const column of columns)
    future[column.column_name] =
      column.enum_values && column.enum_values.length > 0
        ? 'a_value_a_later_migration_adds'
        : value(column, 0, vocabularies);
  rows.push(future);

  if (!isView) {
    // Null olabilen her kolonun null olduğu satır. Birincil anahtar ve
    // enum'lar yerinde kalıyor: null bir id bir satır değil, bir arıza.
    const nulls = {};
    for (const column of columns) {
      const nullable = column.is_nullable === 'YES' && column.column_name !== 'id';
      nulls[column.column_name] = nullable ? null : value(column, span, vocabularies);
    }
    rows.push(nulls);
  }

  return rows;
}

/**
 * Dökümü ilişki adına göre grupla.
 *
 * @param {Column[]} dump
 * @returns {Map<string, Column[]>}
 */
export function relationsIn(dump) {
  /** @type {Map<string, Column[]>} */
  const relations = new Map();
  for (const column of dump) {
    if (!relations.has(column.table_name)) relations.set(column.table_name, []);
    relations.get(column.table_name).push(column);
  }
  return relations;
}
