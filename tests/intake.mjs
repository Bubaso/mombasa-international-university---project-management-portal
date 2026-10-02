/**
 * Belge alımının iki sessiz parçası (M13-13).
 *
 * İkisi de tarayıcıdan görülemez ve ikisi de yanlış olduğunda sonucu
 * sessizdir:
 *
 *   **Metin çıkarma.** Boş gelirse alım "okunamadı" der ve bu görünür. Ama
 *   yarısı gelirse model yarım belgeyi sınıflandırır, kimse fark etmez ve
 *   sınıflandırma yine kendinden emin görünür.
 *
 *   **Sınıflandırmanın kabulü.** Model şeklen doğru ama içeriği uydurma bir
 *   cevap verebilir — var olmayan bir kütüğe işaret eden, ya da ne olduğunu
 *   söyleyip neden öyle dediğini söylemeyen. Böyle bir cevabı saklamak, hiç
 *   cevap saklamamaktan kötüdür, çünkü ekranda diğerlerinden ayırt edilemez.
 *
 * Usage: npm run test:intake
 */
import { deflateRawSync } from 'node:zlib';
import { extract } from '../supabase/functions/document-intake/extract.js';
import { REGISTERS, readClassification } from '../supabase/functions/ai-assistant/rules.js';

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

// ---------------------------------------------------------------------------
// Bir .docx kurmak
// ---------------------------------------------------------------------------
//
// Gerçek bir dosya, çünkü sınanan şey zip başlıklarının taranması. Elle
// kurulmuş bir zip, kütüphaneye güvenmek yerine baytların kendisini
// sınamayı mümkün kılıyor — ve .docx'in iki sıkıştırma hâli (deflate ve
// stored) ayrı kod yolları.

/** @param {{name: string, body: Buffer, deflate: boolean}[]} entries */
function zip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const stored = entry.deflate ? deflateRawSync(entry.body) : entry.body;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(entry.deflate ? 8 : 0, 8);
    header.writeUInt32LE(0, 14); // crc, unread by the extractor
    header.writeUInt32LE(stored.length, 18);
    header.writeUInt32LE(entry.body.length, 22);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(0, 28);
    locals.push(header, name, stored);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(entry.deflate ? 8 : 0, 10);
    dir.writeUInt32LE(stored.length, 20);
    dir.writeUInt32LE(entry.body.length, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, name);
    offset += header.length + name.length + stored.length;
  }
  const localPart = Buffer.concat(locals);
  const centralPart = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralPart.length, 12);
  end.writeUInt32LE(localPart.length, 16);
  return new Uint8Array(Buffer.concat([localPart, centralPart, end]));
}

const DOCUMENT_XML = `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>
<w:p><w:r><w:t>Mahkeme Kararı</w:t></w:r></w:p>
<w:p><w:r><w:t>Dosya No: </w:t></w:r><w:r><w:t>ELC 134/2013</w:t></w:r></w:p>
<w:p><w:r><w:t>Taraflar &amp; vekilleri &lt;aşağıdadır&gt;.</w:t></w:r><w:tab/><w:r><w:t>Son</w:t></w:r></w:p>
</w:body></w:document>`;

const docx = (deflate) =>
  zip([
    { name: '[Content_Types].xml', body: Buffer.from('<Types/>'), deflate },
    { name: 'word/document.xml', body: Buffer.from(DOCUMENT_XML, 'utf8'), deflate },
  ]);

// ---------------------------------------------------------------------------
// Çıkarma
// ---------------------------------------------------------------------------

for (const [label, deflate] of [
  ['compressed', true],
  ['stored uncompressed', false],
]) {
  const text = await extract(docx(deflate), 'ruling.docx', '');
  check(
    text.text.includes('Mahkeme Kararı'),
    `a ${label} .docx gives up its text`,
    JSON.stringify(text.text.slice(0, 30)),
  );
  // Bir satırın iki `<w:r>`'a bölünmesi Word'de olağan: "Dosya No: " ile
  // numarası ayrı çalıştırmalarda durur. Bölünmüş satır birleşmezse bir
  // dava numarası ortadan ikiye ayrılır ve kimse fark etmez.
  check(
    text.text.includes('Dosya No: ELC 134/2013'),
    `and a line split across runs comes back whole (${label})`,
  );
  check(
    text.text.includes('Taraflar & vekilleri <aşağıdadır>.'),
    `with its entities decoded, not left as &amp; (${label})`,
  );
  check(text.text.includes('\t'), `and a tab kept as a tab (${label})`);
  check(
    !text.text.includes('<w:') && !text.text.includes('</w:'),
    `and no markup left in it (${label})`,
  );
  check(text.pages === null, `a .docx reports no page count, rather than a made-up one (${label})`);
}

// Düz metin, olduğu gibi.
{
  const text = await extract(new TextEncoder().encode('  bir satır  '), 'note.txt', 'text/plain');
  check(text.text === 'bir satır', 'plain text comes through trimmed', JSON.stringify(text.text));
}

// Tanımadığı bir tür için cevabı "okuyamadım", boş metin değil: ikisi
// kullanıcıya farklı şeyler söyler.
{
  let threw = null;
  try {
    await extract(new Uint8Array([1, 2, 3]), 'drawing.dwg', 'application/acad');
  } catch (error) {
    threw = error;
  }
  check(threw !== null, 'an unreadable type is refused rather than read as nothing');
  check(
    String(threw?.message ?? '').includes('drawing.dwg'),
    'and the refusal names the file',
    String(threw?.message ?? '').slice(0, 60),
  );
}

// Bir .docx olmayan bir zip, .docx gibi davranmaz.
{
  let threw = null;
  try {
    await extract(
      zip([{ name: 'other.xml', body: Buffer.from('<x/>'), deflate: true }]),
      'x.docx',
      '',
    );
  } catch (error) {
    threw = error;
  }
  check(threw !== null, 'a zip with no word/document.xml is not read as a document');
}

// ---------------------------------------------------------------------------
// Sınıflandırmanın kabulü
// ---------------------------------------------------------------------------

const sound = {
  classifiedAs: 'a court ruling',
  why: 'it is headed with a case number and carries an order',
  touches: ['legal', 'obligations'],
};

check(readClassification(sound).ok, 'a sound classification is accepted');
check(
  readClassification({ ...sound, touches: [] }).ok,
  'and so is one that points at no register — an empty list is an answer',
);
check(
  readClassification({ ...sound, touches: ['legal', 'legal'] }).ok &&
    readClassification({ ...sound, touches: ['legal', 'legal'] }).value.touches.length === 1,
  'a register named twice is counted once',
);

// M13-16'nın sınıflandırma tarafı: ne olduğunu söylemeyen ya da neden öyle
// dediğini söylemeyen bir cevap denetlenemez.
check(!readClassification({ ...sound, classifiedAs: '  ' }).ok, 'a verdict with no verdict is not');
check(!readClassification({ ...sound, why: '' }).ok, 'nor one that does not say why');

// Uydurulmuş bir kütük, teklif yolu açılacak yer olduğu için en tehlikelisi.
{
  const bogus = readClassification({ ...sound, touches: ['the_secret_register'] });
  check(!bogus.ok, 'a register nobody has is refused', bogus.ok ? '' : bogus.why);
}
check(!readClassification({ ...sound, touches: [42] }).ok, 'and a register key that is not text');
check(!readClassification(null).ok, 'an answer that is not an object at all is refused');
check(!readClassification('a court ruling').ok, 'and neither is a bare string');

// Liste boş olmamalı: boşsa model hiçbir kütüğe işaret edemez ve modül
// sessizce işe yaramaz hâle gelir.
check(REGISTERS.length >= 10, 'the register list is populated', `${REGISTERS.length} keys`);
check(
  REGISTERS.includes('document_vault') && REGISTERS.includes('obligations'),
  'and holds the ones the vault and the obligations register need',
);
check(new Set(REGISTERS).size === REGISTERS.length, 'with no key listed twice');

console.log('');
if (failures > 0) {
  console.error(`${failures} intake check(s) failed.`);
  process.exit(1);
}
console.log('All intake checks passed.');
