/**
 * Bir belgeden metin: .pdf, .docx ve düz metin.
 *
 * `rules.js` gibi düz JavaScript ve ayrı bir dosya, ki hem Deno fonksiyonu
 * hem `tests/intake.mjs` aynı kodu kullansın. Çıkarmanın doğruluğu
 * tarayıcıdan görülemez ve yanlış olduğunda sonucu sessizdir: metin boş
 * gelirse alım "okunamadı" der, ama yarısı gelirse model yarım belgeyi
 * sınıflandırır ve bunu kimse fark etmez.
 */

/**
 * .docx içinden metin.
 *
 * Bir .docx, içinde XML olan bir zip. `word/document.xml` paragraf
 * etiketlerini taşır; `</w:p>` satır sonu sayılır, gerisi atılır. Harici
 * bir kütüphane kullanılmıyor: tek ihtiyaç duyulan şey zip açmak ve bunu
 * `DecompressionStream` yapıyor.
 */
/** @param {Uint8Array} bytes @returns {Promise<string>} */
export async function textFromDocx(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Yerel dosya başlıklarını tarayıp word/document.xml'i bul.
  for (let i = 0; i + 30 < bytes.length; i++) {
    if (view.getUint32(i, true) !== 0x04034b50) continue;
    const method = view.getUint16(i + 8, true);
    const compressed = view.getUint32(i + 18, true);
    const nameLength = view.getUint16(i + 26, true);
    const extraLength = view.getUint16(i + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(i + 30, i + 30 + nameLength));
    const start = i + 30 + nameLength + extraLength;
    if (name !== 'word/document.xml') continue;

    const body = bytes.subarray(start, start + compressed);
    let xml;
    if (method === 0) {
      xml = new TextDecoder().decode(body);
    } else if (method === 8) {
      const stream = new Blob([body]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      xml = await new Response(stream).text();
    } else {
      throw new Error(`this .docx uses compression method ${method}, which is not supported`);
    }

    return xml
      .replace(/<\/w:p>/g, '\n')
      .replace(/<w:tab[^>]*\/>/g, '\t')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  throw new Error('this .docx has no word/document.xml in it');
}

/**
 * PDF içinden metin, ve kaç sayfadan.
 *
 * `unpdf` Deno'da çalışan, pdf.js üzerine kurulu bir sarmalayıcı. Taranmış
 * bir PDF'ten metin çıkmaz — o durumda bu fonksiyon boş döner ve çağıran
 * bunu "okunamadı" diye kaydeder. Taranmış belgeyi modele görüntü olarak
 * göndermek 5. fazın işi; burada yanlış cevap vermek yerine cevap
 * vermemek doğru.
 */
/** @param {Uint8Array} bytes @returns {Promise<{text: string, pages: number}>} */
export async function textFromPdf(bytes) {
  const { extractText, getDocumentProxy } = await import('npm:unpdf@0.12.1');
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return { text: String(text ?? '').trim(), pages: pdf.numPages };
}

/**
 * @typedef {{text: string, pages: number | null}} Extracted
 * @param {Uint8Array} bytes
 * @param {string} name
 * @param {string} contentType
 * @returns {Promise<Extracted>}
 */
export async function extract(bytes, name, contentType) {
  const lower = name.toLowerCase();
  if (contentType.startsWith('text/') || lower.endsWith('.txt') || lower.endsWith('.md')) {
    return { text: new TextDecoder().decode(bytes).trim(), pages: null };
  }
  if (lower.endsWith('.docx') || contentType.includes('wordprocessingml')) {
    return { text: await textFromDocx(bytes), pages: null };
  }
  if (lower.endsWith('.pdf') || contentType === 'application/pdf') {
    const { text, pages } = await textFromPdf(bytes);
    return { text, pages };
  }
  throw new Error(`this function reads .pdf, .docx and plain text; ${name} is none of them`);
}
