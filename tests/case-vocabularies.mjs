/**
 * Bir görünümün `case … end as <kolon>` ifadesinin ürettiği değerler.
 *
 * Bu depoda kapalı bir kelime dağarcığı iki yolla doğuyor. Birincisi Postgres
 * enum'u: `tests/enum-drift.mjs` onu istemcinin birliğiyle karşılaştırıyor.
 * İkincisi bir görünümün `case` ifadesi — `amount_verdict`, `bytes_verdict`
 * gibi. İkinci yol için hiçbir denetim yoktu: kolon düz `text`, yani enum
 * taraması onu göremiyor, ve istemci yine de dört değer sayıyor.
 *
 * Ayrıştırıcının iki yanlış yapma yolu var ve ikisi eşit değil (0047'nin
 * dersi):
 *
 *   **Eksik dağarcık.** Bir `case`'i hiç görmemek. O kolon denetlenmez;
 *   sessiz, ama kimseyi yanlış yere göndermez.
 *
 *   **Uydurma dağarcık.** Değerlerin bir kısmını görüp tam sanmak. Denetim
 *   "istemci fazladan değer uyduruyor" der ve olmayan bir sorunu kovalatır.
 *   Bu yüzden bir `then` ya da `else` dizgi değişmezi değilse dağarcık
 *   **kullanılmaz**: tam olduğunu söyleyemediğimiz liste, liste değildir.
 */

/** `$$…$$` gövdeleri ve yorumlar. */
export const stripNoise = (sql) =>
  sql
    .replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');

/**
 * `end as <ad>`'ın solundaki `case` bloğu.
 *
 * `case` içinde `case` olabiliyor, bu yüzden geriye doğru yürürken `end` ve
 * `case` sayılıyor. Dizgi değişmezlerinin içindeki kelimeler sayılmasın diye
 * önce onlar yerinden alınıyor.
 */
function blockBefore(sql, endIndex) {
  const tokens = [...sql.slice(0, endIndex).matchAll(/\b(case|end)\b/gi)];
  let depth = 0;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const word = tokens[i][1].toLowerCase();
    if (word === 'end') depth++;
    else if (depth === 0) return sql.slice(tokens[i].index, endIndex);
    else depth--;
  }
  return null;
}

/**
 * @param {string} sql tek bir migration'ın metni
 * @returns {Map<string, {values: Set<string>, nullable: boolean, complete: boolean}>}
 */
export function vocabulariesIn(sql) {
  const clean = stripNoise(sql);
  // Dizgi değişmezleri kelime saymasına karışmasın.
  const masked = clean.replace(/'(?:[^']|'')*'/g, (m) => '\u0001'.repeat(m.length));

  /** @type {Map<string, {values: Set<string>, nullable: boolean, complete: boolean}>} */
  const found = new Map();

  for (const m of masked.matchAll(/\bend\s+as\s+([a-z_][a-z0-9_]*)/gi)) {
    const name = m[1].toLowerCase();
    const maskedBlock = blockBefore(masked, m.index);
    if (!maskedBlock) continue;
    const block = clean.slice(m.index - maskedBlock.length, m.index);

    const branches = [...block.matchAll(/\b(then|else)\b\s*([^\s,]*)/gi)];
    if (branches.length === 0) continue;

    const values = new Set();
    let complete = true;
    let hasElse = false;
    for (const [, word, rest] of branches) {
      if (word.toLowerCase() === 'else') hasElse = true;
      const literal = /^'((?:[^']|'')*)'/.exec(rest);
      if (literal) values.add(literal[1].replace(/''/g, "'"));
      else complete = false; // bir dal değişmez değil: liste tam sayılamaz
    }
    if (values.size === 0) continue;

    const previous = found.get(name);
    const entry = { values, nullable: !hasElse, complete };
    // Aynı kolon birkaç göçte yeniden tanımlanıyor (0011 → 0023 → 0025).
    // Sonuncusu geçerli olan, çünkü görünümü o kuruyor.
    found.set(name, previous ? entry : entry);
  }
  return found;
}

/**
 * Bütün göçler okunduktan sonra kalan dağarcıklar.
 *
 * @param {string[]} sqlTexts göç metinleri, sırasıyla
 */
export function vocabulariesAcross(sqlTexts) {
  /** @type {Map<string, {values: Set<string>, nullable: boolean, complete: boolean}>} */
  const all = new Map();
  for (const sql of sqlTexts) for (const [name, entry] of vocabulariesIn(sql)) all.set(name, entry);
  return all;
}
