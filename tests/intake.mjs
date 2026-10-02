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
import { readFileSync } from 'node:fs';
import { extract } from '../supabase/functions/document-intake/extract.js';
import { REGISTERS, readClassification } from '../supabase/functions/ai-assistant/rules.js';
import { readProposals } from '../supabase/functions/ai-assistant/rules.js';
import {
  PROPOSAL_TARGETS,
  modelFields,
  targetFor,
  targetsBriefing,
} from '../supabase/functions/ai-assistant/targets.js';

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

// ---------------------------------------------------------------------------
// Fonksiyonun kaynağındaki iki kural
// ---------------------------------------------------------------------------
//
// İkisi de tarayıcıdan ve birim testinden görülmez, ikisi de kaynağa
// bakılarak sınanabilir, ve ikisinin de bozulması sessizdir.

const FUNCTION_SOURCE = readFileSync(
  new URL('../supabase/functions/document-intake/index.ts', import.meta.url),
  'utf8',
);

// Anahtar başlıkta gider. Sorgu dizesindeki bir anahtar, yukarı akışın hata
// gövdesi log'landığı anda log'a düşer — ve o gövde kütüğe yazılmasa bile
// sunucu kütüğünde durur.
check(
  !/[?&]key=/.test(FUNCTION_SOURCE),
  'the model key is never put in a URL',
  (FUNCTION_SOURCE.match(/.{0,40}[?&]key=.{0,20}/) ?? [''])[0],
);
check(
  FUNCTION_SOURCE.includes("'x-goog-api-key'"),
  'and it travels in the header the provider documents',
);

// Kendini sınama metni sabittir. İstekten gelse, bu uç nokta oturum açmış
// herkese bedava bir model vekili olurdu — ve bunu kimse istemedi.
{
  const branch = FUNCTION_SOURCE.slice(
    FUNCTION_SOURCE.indexOf('if (body.selfTest)'),
    FUNCTION_SOURCE.indexOf('const versionId = body.versionId'),
  );
  check(
    branch.length > 100,
    'the self-test branch is where it is expected',
    `${branch.length} chars`,
  );
  // `body.text` aramak yetmiyordu: bir mutasyon `(body as {...}).text` yazdı
  // ve test geçti. Kural isimle değil sayıyla kuruluyor — dalın içinde
  // `body`, girdiği `if`'teki tek geçişinden fazla görünmemeli.
  const mentionsOfBody = (branch.match(/\bbody\b/g) ?? []).length;
  check(
    branch.includes('SELF_TEST_TEXT') && mentionsOfBody === 1,
    'and its text is fixed in the source, not taken from the request',
    `${mentionsOfBody} mention(s) of the request body`,
  );
  check(/const SELF_TEST_TEXT =\s*\n?\s*'/.test(FUNCTION_SOURCE), 'with the text itself a literal');
  // Aynı isteği kuruyor olmalı: ayrı bir istek kursa sınadığı şey gerçekten
  // gönderilen istek olmazdı.
  check(
    branch.includes('askTheModel(') && branch.includes('buildPrompt('),
    'and it goes through the same request the real path uses',
  );
}

// Yazma yok: dalın içinde hiçbir tablo adı geçmemeli.
{
  const branch = FUNCTION_SOURCE.slice(
    FUNCTION_SOURCE.indexOf('if (body.selfTest)'),
    FUNCTION_SOURCE.indexOf('const versionId = body.versionId'),
  );
  check(
    !branch.includes('document_intake') &&
      !branch.includes('.insert(') &&
      !branch.includes('settle('),
    'and the self-test writes nothing at all',
  );
}

// ---------------------------------------------------------------------------
// Teklifler (M13-14)
// ---------------------------------------------------------------------------

const DOC = [
  'IN THE ENVIRONMENT AND LAND COURT AT MOMBASA. Case No. ELC 134/2013.',
  'The court orders that the respondent shall vacate the suit land by 2026-11-30.',
  'A letter dated 2026-09-14 from the African University Trust of Kenya was produced.',
].join('\n');

const registry = { targetFor, modelFields };

const soundProposal = {
  classifiedAs: 'a court ruling',
  why: 'it carries a case number and an order',
  aboutEn: 'The court orders the respondent to vacate the suit land by the end of November 2026.',
  proposals: [
    {
      register: 'obligation',
      why: 'the order creates a duty to vacate',
      quote: 'The court orders that the respondent shall vacate the suit land by 2026-11-30.',
      values: [
        { name: 'titleEn', value: 'Vacate the suit land' },
        { name: 'source', value: 'court_order' },
        { name: 'obligorName', value: 'the respondent' },
        { name: 'dueOn', value: '2026-11-30' },
        { name: 'prohibits', value: 'false' },
      ],
    },
  ],
};

const readP = (patch) => readProposals({ ...soundProposal, ...patch }, DOC, registry);

{
  const ok = readP({});
  check(
    ok.ok && ok.value.proposals.length === 1,
    'a sound proposal is accepted',
    ok.ok ? '' : ok.why,
  );
  check(
    ok.ok &&
      ok.value.proposals[0].values.dueOn === '2026-11-30' &&
      ok.value.proposals[0].values.prohibits === false,
    'and its fields are read into their own types, not left as strings',
    ok.ok ? JSON.stringify(ok.value.proposals[0].values) : '',
  );
}

// Değerler nesne hâlinde de gelebilmeli: şema değişirse okuyucu ikisini de
// anlasın, yoksa teklif sessizce boş kalır.
check(
  readP({
    proposals: [
      {
        ...soundProposal.proposals[0],
        values: { titleEn: 'Vacate', source: 'court_order', obligorName: 'x', prohibits: 'false' },
      },
    ],
  }).ok,
  'values given as an object are read too',
);

// M13-16'nın teklif tarafı: belgede geçmeyen bir alıntı, kaydın dayanağını
// uydurmaktır ve teklifin tamamını düşürür.
{
  const r = readP({
    proposals: [
      {
        ...soundProposal.proposals[0],
        quote: 'The court orders that the respondent shall pay 4,000,000 shillings.',
      },
    ],
  });
  check(
    r.ok &&
      r.value.proposals.length === 0 &&
      r.value.rejected[0]?.why.includes('not in the document'),
    'a quote that is not in the document throws the proposal away',
    r.ok ? JSON.stringify(r.value.rejected) : r.why,
  );
}
{
  const r = readP({ proposals: [{ ...soundProposal.proposals[0], quote: 'the court' }] });
  check(
    r.ok && r.value.proposals.length === 0 && r.value.rejected[0]?.why.includes('too short'),
    'and a quote too short to carry the claim is refused',
  );
}
// Satır sonu nerede kırılırsa kırılsın: PDF metni sarar, alıntı sarmaz.
check(
  readP({
    proposals: [
      {
        ...soundProposal.proposals[0],
        quote: 'The court orders that the respondent\n  shall vacate the suit land',
      },
    ],
  }).ok === true,
  'a quote broken across lines still matches',
);

// Reddedilenler sayılıyor. Sessizce düşen bir teklif, hiç üretilmemiş bir
// teklifle ekranda aynı görünür.
{
  const r = readP({
    proposals: [{ ...soundProposal.proposals[0], register: 'the_secret_register' }],
  });
  check(
    r.ok && r.value.rejected.length === 1 && r.value.rejected[0].why === 'no such register',
    'a register nobody has is rejected, with the reason kept',
  );
}

// Zorunlu alanı olmayan teklif girmiyor — uydurulmuş bir değerle değil, hiç.
{
  const r = readP({
    proposals: [{ ...soundProposal.proposals[0], values: [{ name: 'titleEn', value: 'Vacate' }] }],
  });
  check(
    r.ok && r.value.proposals.length === 0 && /required/.test(r.value.rejected[0]?.why ?? ''),
    'a proposal missing a required field is rejected rather than half-filled',
    r.ok ? JSON.stringify(r.value.rejected) : '',
  );
}

// Tarih, modelin okuduğu olmalı; hesaplanmış ya da serbest metin değil.
for (const [bad, label] of [
  ['within 30 days', 'prose instead of a date'],
  ['30/11/2026', 'a date in another format'],
  ['2026-13-01', 'a month that does not exist'],
]) {
  const r = readP({
    proposals: [
      {
        ...soundProposal.proposals[0],
        values: [
          ...soundProposal.proposals[0].values.slice(0, 3),
          { name: 'dueOn', value: bad },
          { name: 'prohibits', value: 'false' },
        ],
      },
    ],
  });
  check(
    r.ok && r.value.proposals.length === 0,
    `a due date refused: ${label}`,
    JSON.stringify(r.ok ? r.value.rejected : r.why),
  );
}

// Enum, kütüğün gerçekten tanıdığı değer olmalı.
{
  const r = readP({
    proposals: [
      {
        ...soundProposal.proposals[0],
        values: [
          { name: 'titleEn', value: 'x' },
          { name: 'source', value: 'a_judge_said_so' },
          { name: 'obligorName', value: 'y' },
          { name: 'prohibits', value: 'false' },
        ],
      },
    ],
  });
  check(
    r.ok && r.value.proposals.length === 0,
    'an enum value the register does not have is rejected',
  );
}

// Özet zorunlu: ne olduğu ile ne dediği ayrı sorular, ve ikincisi
// cevaplanmadığında ekran belgenin biçimini anlatmaya düşüyor (ölçüm, 2 Ekim).
check(
  !readP({ aboutEn: '  ' }).ok,
  'an answer that does not say what the document is about is refused',
);
check(!readP({ classifiedAs: '' }).ok, 'nor one that does not say what it is');
check(readP({ proposals: [] }).ok, 'but zero proposals is a valid answer');

// ---------------------------------------------------------------------------
// Hedef tanımı ile yazıcılar aynı anahtarları taşımalı
// ---------------------------------------------------------------------------
//
// Hedefi olup yazıcısı olmayan bir kütük ekranda onaylanabilir görünür ve
// onaylandığında patlar; yazıcısı olup hedefi olmayan bir kütüğe model hiç
// teklif üretemez. İkisi de sessiz.

const PROPOSALS_TS = readFileSync(new URL('../src/api/proposals.ts', import.meta.url), 'utf8');
const writerKeys = [
  ...PROPOSALS_TS.slice(
    PROPOSALS_TS.indexOf('> = {'),
    PROPOSALS_TS.indexOf('export const writableRegisters'),
  ).matchAll(/^ {2}([a-z_]+): (?:async )?\(/gm),
].map((m) => m[1]);

check(
  writerKeys.length > 0,
  'the writer map is where the test expects it',
  `${writerKeys.length} writers`,
);
for (const target of PROPOSAL_TARGETS) {
  check(writerKeys.includes(target.key), `${target.key} has a writer`);
}
for (const key of writerKeys) {
  check(
    PROPOSAL_TARGETS.some((t) => t.key === key),
    `the ${key} writer has a target the model can fill`,
  );
}

// Modelin doldurduğu her alan yazıcıya ulaşmalı. Ulaşmayan alan, ekranda
// doldurulup kütüğe hiç girmeyen alandır — ve bunu kimse fark etmez.
const NEVER_WRITTEN = {
  // Belgedeki ad, sorumlunun kendisi değil: eşleştirme için gösteriliyor,
  // kütüğe sorumlu olarak girmiyor.
  ownerHint: 'shown so the approver can match a name to a profile',
};
for (const target of PROPOSAL_TARGETS) {
  for (const field of target.fields) {
    const reached = PROPOSALS_TS.includes(`'${field.name}'`);
    const excused = Object.prototype.hasOwnProperty.call(NEVER_WRITTEN, field.name);
    check(
      reached || excused,
      `${target.key}.${field.name} reaches the register`,
      excused ? NEVER_WRITTEN[field.name] : '',
    );
  }
}

// Talimat hedefleri anlatmalı: anlatmayan bir alanı model dolduramaz.
{
  const briefing = targetsBriefing();
  const missing = PROPOSAL_TARGETS.flatMap((t) =>
    modelFields(t)
      .filter((f) => !briefing.includes(f.name))
      .map((f) => `${t.key}.${f.name}`),
  );
  check(
    missing.length === 0,
    'every field the model may fill is described in the instruction',
    missing.join(' '),
  );
}

// ---------------------------------------------------------------------------
// Ekran, yapmadığı şeyi iddia etmemeli
// ---------------------------------------------------------------------------

{
  const PANEL = readFileSync(
    new URL('../src/components/assistant/IntakePanel.tsx', import.meta.url),
    'utf8',
  );
  // Rozet 1. fazda "yazma yok" diyordu ve doğruydu. Onay yazdığına göre
  // artık değil; doğru olmayan bir rozet, hiç rozet olmamasından kötüdür.
  check(
    !PANEL.includes("'writes nothing'") && !PANEL.includes("'yazma yok'"),
    'the panel no longer claims it writes nothing, because approving writes',
  );
}

console.log('');
if (failures > 0) {
  console.error(`${failures} intake check(s) failed.`);
  process.exit(1);
}
console.log('All intake checks passed.');
