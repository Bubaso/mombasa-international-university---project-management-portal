/**
 * The two things this portal hands to another program (M3-16, M4-15).
 *
 * A file format fails quietly. An unfolded line over 75 octets, an unescaped
 * comma, a date written as a time — each produces a file that imports without
 * complaint and says something the record does not. None of it is visible from
 * the browser, so it is tested here, against the rules of the formats rather
 * than against a snapshot of today's output.
 *
 * Usage: npm run test:exports
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = mkdtempSync(join(tmpdir(), 'miu-exports-'));
let failures = 0;
const check = (ok, label, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

try {
  execFileSync(
    'npx',
    [
      'tsc',
      'src/lib/ics.ts',
      'src/lib/contacts.ts',
      'src/lib/auditFile.ts',
      '--outDir',
      out,
      '--module',
      'esnext',
      '--target',
      'es2022',
      '--moduleResolution',
      'bundler',
      '--rootDir',
      'src',
    ],
    { stdio: 'pipe' },
  );
} catch (error) {
  console.error('Could not compile the export modules');
  console.error(error.stdout?.toString() ?? error.message);
  process.exit(1);
}

const { toIcs } = await import(join(out, 'lib', 'ics.js'));
const { toVCard, toCsv, splitCsv, parseContacts } = await import(join(out, 'lib', 'contacts.js'));
const { toAuditFile, auditFileName } = await import(join(out, 'lib', 'auditFile.js'));

const NOW = '2026-10-01T12:00:00.000Z';
const entry = (over = {}) => ({
  kind: 'obligation',
  id: '0b000000-0000-0000-0000-000000000001',
  titleEn: 'File the annual return',
  titleTr: 'Yıllık beyanı ver',
  dueOn: '2026-11-25',
  dueAt: null,
  detail: null,
  legalCaseId: null,
  meetingId: null,
  state: null,
  needsAttention: false,
  confidentiality: 'internal',
  ...over,
});

// --- the envelope ----------------------------------------------------------

const basic = toIcs([entry()], { language: 'tr', includeClosed: false, now: NOW });
check(
  basic.text.startsWith('BEGIN:VCALENDAR\r\n') && basic.text.endsWith('END:VCALENDAR\r\n'),
  'the file is a calendar, opened and closed',
);
check(
  /\r\n/.test(basic.text) && !/[^\r]\n/.test(basic.text),
  'every line ends CRLF, as the format requires',
);
check(
  /^VERSION:2\.0$/m.test(basic.text) && /^PRODID:/m.test(basic.text),
  'and carries the two properties a reader needs',
);
check(basic.events === 1 && basic.allDay === 1, 'one event, and it is an all-day one');

// --- a date is not a time --------------------------------------------------

check(
  /^DTSTART;VALUE=DATE:20261125$/m.test(basic.text),
  'a record with a date and no time is an all-day event, not an invented hour',
);
check(
  /^DTEND;VALUE=DATE:20261126$/m.test(basic.text),
  'and ends the following day, which is how all-day is written',
);
check(!/DTSTART:2026/.test(basic.text), 'nothing turns that date into a timestamp');

const timed = toIcs([entry({ kind: 'hearing', dueOn: null, dueAt: '2026-11-25T09:30:00Z' })], {
  language: 'tr',
  includeClosed: false,
  now: NOW,
});
check(/^DTSTART:20261125T093000Z$/m.test(timed.text), 'a recorded time is a timed event');
check(
  !/^DTEND/m.test(timed.text) && !/^DURATION/m.test(timed.text),
  'with no end, because the register does not record one',
);
check(
  /bitiş saati yok/.test(timed.text),
  'and the description says so rather than leaving it to be assumed',
);
check(timed.allDay === 0, 'a timed event is not counted as all-day');

// --- a record with no date is not an event --------------------------------

const undated = toIcs([entry({ dueOn: null, dueAt: null })], {
  language: 'tr',
  includeClosed: false,
  now: NOW,
});
check(
  undated.events === 0 && undated.withheld === 1 && !/BEGIN:VEVENT/.test(undated.text),
  'a record with no date produces no event and leaves nothing half-written',
);

// --- the file leaves the portal's access control behind -------------------

const tiers = [
  entry({ id: 'aaaa0000-0000-0000-0000-000000000001', confidentiality: 'public' }),
  entry({ id: 'aaaa0000-0000-0000-0000-000000000002', confidentiality: 'internal' }),
  entry({ id: 'aaaa0000-0000-0000-0000-000000000003', confidentiality: 'confidential' }),
  entry({ id: 'aaaa0000-0000-0000-0000-000000000004', confidentiality: 'restricted' }),
];
const guarded = toIcs(tiers, { language: 'tr', includeClosed: false, now: NOW });
check(
  guarded.events === 2 && guarded.withheld === 2,
  'confidential and restricted matters stay out of the file by default',
  `events=${guarded.events} withheld=${guarded.withheld}`,
);
const everything = toIcs(tiers, { language: 'tr', includeClosed: true, now: NOW });
check(everything.events === 4, 'and go in only when the caller says so');
check(
  /^CLASS:CONFIDENTIAL$/m.test(everything.text) && /^CLASS:PRIVATE$/m.test(everything.text),
  'carrying the tier as CLASS for the clients that honour it',
);

// --- folding and escaping, which is where a file format goes wrong --------

const long = toIcs([entry({ titleTr: 'Ç'.repeat(120), titleEn: 'C'.repeat(120) })], {
  language: 'tr',
  includeClosed: false,
  now: NOW,
});
const over = long.text
  .split('\r\n')
  .filter((l) => !l.startsWith(' '))
  .filter((l) => new TextEncoder().encode(l).length > 75);
check(over.length === 0, 'no line exceeds 75 octets unfolded', over[0]?.slice(0, 40));
check(
  long.text.includes('\r\n ') && long.text.replace(/\r\n /g, '').includes('Ç'.repeat(40)),
  'and a folded line rejoins into the text that went in',
);
// Multi-byte characters must not be cut in half by the fold.
check(!long.text.includes('�'), 'folding never splits a Turkish character down the middle');

const punctuated = toIcs(
  [entry({ titleTr: 'Beyan; ek belgeler, ve ekler\nikinci satır', titleEn: 'x' })],
  { language: 'tr', includeClosed: false, now: NOW },
);
// Unfolded first, because that is what a reader does and because a fold can
// land between a character and its escape.
const unfold = (text) => text.replace(/\r\n /g, '');
check(unfold(punctuated.text).includes('Beyan\\;'), 'a semicolon is escaped');
check(unfold(punctuated.text).includes('belgeler\\,'), 'a comma is escaped');
check(
  unfold(punctuated.text).includes('ekler\\nikinci'),
  'and a newline becomes the escape, not a real break',
);
const backslashed = toIcs([entry({ titleTr: 'a\\b', titleEn: 'x' })], {
  language: 'tr',
  includeClosed: false,
  now: NOW,
});
check(unfold(backslashed.text).includes('a\\\\b'), 'a backslash is escaped first, not twice');

// --- the identity that makes a re-import an update ------------------------

check(
  /^UID:obligation-0b000000-0000-0000-0000-000000000001@/m.test(basic.text),
  'each event has a stable id, so importing twice updates rather than doubles',
);
check(/^DTSTAMP:20261001T120000Z$/m.test(basic.text), 'and a stamp saying when the file was made');

const urgent = toIcs([entry({ needsAttention: true })], {
  language: 'tr',
  includeClosed: false,
  now: NOW,
});
check(/^PRIORITY:1$/m.test(urgent.text), 'something marked as needing attention says so');

// ===========================================================================
// The stakeholder register, out and back (M4-15)
// ===========================================================================

const person = (over = {}) => ({
  id: '0b000000-0000-0000-0000-000000000001',
  fullName: 'Mr. Tariq Shahbal',
  title: 'Director of Construction',
  organizationId: null,
  organizationName: 'Coast Engineering',
  category: 'contractor',
  email: 'tariq@example.test',
  phone: '+254700000001',
  whatsapp: '+254700000001',
  location: 'Mombasa',
  preferredLanguage: 'en',
  interestTopic: 'Site works',
  stance: 'opponent',
  influence: 5,
  interest: 4,
  relationshipOwner: null,
  relationshipOwnerName: null,
  profileId: null,
  notes: 'Pushes for a settlement that suits his own schedule.',
  confidentiality: 'internal',
  ...over,
});

// --- what must not leave in a vCard ---------------------------------------
//
// The register holds contact facts and the trust's reading of a person. A
// vCard syncs to a phone and is forwarded without a thought, so the second
// kind must not be in it at all — "stance: opponent, influence 5" reaching the
// person it describes is a different class of harm from a leaked number.

const card = toVCard([person()], { includeClosed: false });
check(
  /^BEGIN:VCARD\r\n/.test(card.text) && /END:VCARD\r\n$/.test(card.text),
  'a vCard is opened and closed',
);
check(/^FN:Mr\. Tariq Shahbal$/m.test(card.text), 'it carries the name as the register holds it');
check(
  /^ORG:Coast Engineering$/m.test(card.text) && /^TITLE:Director of Construction$/m.test(card.text),
  'with the organisation and the title',
);
check(/^EMAIL;TYPE=INTERNET:tariq@example\.test$/m.test(card.text), 'and the email');
check(
  !/opponent/i.test(card.text) &&
    !/influence/i.test(card.text) &&
    !/^NOTE/m.test(card.text) &&
    !/settlement/i.test(card.text),
  'and NOTHING of the trust’s assessment of the person',
);
check(
  /^N:Mr\. Tariq Shahbal;;;;$/m.test(card.text),
  'the structured name holds the whole name rather than a guess at its halves',
);
check(/^UID:stakeholder-0b000000/m.test(card.text), 'and a stable id, so a re-import updates');

// One telephone number listed once, not twice under two types.
const oneNumber = toVCard([person({ whatsapp: '+254700000001' })], { includeClosed: false });
check(
  (oneNumber.text.match(/^TEL/gm) ?? []).length === 1,
  'the same number is not listed twice because two columns hold it',
);
const twoNumbers = toVCard([person({ whatsapp: '+254700000009' })], { includeClosed: false });
check(
  (twoNumbers.text.match(/^TEL/gm) ?? []).length === 2,
  'while a different WhatsApp number is its own line',
);

// --- the tier, in both formats --------------------------------------------

const people = [
  person({ id: 'aaaa0000-0000-0000-0000-000000000001', confidentiality: 'internal' }),
  person({ id: 'aaaa0000-0000-0000-0000-000000000002', confidentiality: 'restricted' }),
];
check(
  toVCard(people, { includeClosed: false }).written === 1 &&
    toVCard(people, { includeClosed: false }).withheld === 1,
  'a restricted contact stays out of the file by default',
);
check(toVCard(people, { includeClosed: true }).written === 2, 'and goes in only when asked');

// --- the CSV, and the question it has to ask -------------------------------

const plain = toCsv([person()], { includeClosed: false, includeAssessment: false });
check(
  plain.text.startsWith('\uFEFF'),
  'the CSV begins with a byte-order mark, so Excel reads Turkish',
);
const plainHeader = plain.text.replace(/^\uFEFF/, '').split('\r\n')[0];
check(
  !plainHeader.includes('stance') &&
    !plainHeader.includes('influence') &&
    !plainHeader.includes('notes'),
  'and leaves the assessment out unless it is asked for',
  plainHeader,
);
const full = toCsv([person()], { includeClosed: false, includeAssessment: true });
check(
  full.text.includes('opponent') && full.text.includes('5'),
  'with it, the assessment is there — which is why the screen has to say what it is',
);

// RFC 4180 quoting, which is where a CSV silently breaks.
const awkward = toCsv(
  [person({ fullName: 'Haji, Mohamed "Yusuf"', interestTopic: 'Land\nand access' })],
  { includeClosed: false, includeAssessment: false },
);
check(
  awkward.text.includes('"Haji, Mohamed ""Yusuf"""'),
  'a comma and a quote are quoted and doubled',
);
check(
  splitCsv(awkward.text)[1][0] === 'Haji, Mohamed "Yusuf"',
  'and reading it back gives exactly what went in',
  splitCsv(awkward.text)[1][0],
);
check(
  splitCsv(awkward.text)[1][9] === 'Land\nand access',
  'a line break inside a cell survives the round trip',
);

// --- reading one back ------------------------------------------------------

const existing = [
  person({ id: 'EXISTING', fullName: 'Mr. Tariq Shahbal', email: 'tariq@example.test' }),
];

const good = parseContacts(
  'full_name,email,category\nMme. Frida Mwangi,frida@example.test,legal\n',
  existing,
);
check(good.contacts.length === 1 && good.refused.length === 0, 'a clean row is read');
check(good.contacts[0].category === 'legal', 'with the category the file gave');
check(
  good.contacts[0].takesDefaultGrid === true,
  'and it is flagged as taking the grid default, because nobody assessed this person',
);

const noName = parseContacts('full_name,email\n,nobody@example.test\n', existing);
check(
  noName.contacts.length === 0 && /no name/.test(noName.refused[0].reason),
  'a row with no name is refused, not given a blank one',
);

const noColumn = parseContacts('email,phone\na@b.test,123\n', existing);
check(
  noColumn.contacts.length === 0 && /full_name/.test(noColumn.refused[0].reason),
  'a file with no name column is refused outright',
);

const badCategory = parseContacts('full_name,category\nSomebody,chief_whisperer\n', existing);
check(
  badCategory.contacts.length === 0 && /not a category/.test(badCategory.refused[0].reason),
  'a category this register does not have is refused rather than silently made "other"',
);

const blankCategory = parseContacts('full_name,category\nSomebody,\n', existing);
check(
  blankCategory.contacts.length === 1 &&
    blankCategory.contacts[0].category === 'other' &&
    blankCategory.contacts[0].takesDefaultCategory === true,
  'while a blank one takes the default and says that it did',
);

const dupInFile = parseContacts('full_name\nSomebody\nSomebody\n', existing);
check(
  dupInFile.contacts.length === 1 && /already has a row/.test(dupInFile.refused[0].reason),
  'the same name twice in one file is not imported twice',
);

const onEmail = parseContacts('full_name,email\nTariq Shahbal,tariq@example.test\n', existing);
check(
  onEmail.contacts[0].matches.some((m) => m.on === 'email'),
  'somebody already in the register is reported as a match on their email',
);
const onName = parseContacts('full_name\nMr. Tariq Shahbal\n', existing);
check(
  onName.contacts[0].matches.some((m) => m.on === 'name'),
  'and on their name when the file gives no email',
);
check(
  onName.contacts.length === 1,
  'a match is reported rather than acted on — nothing here writes anything',
);

const extra = parseContacts('full_name,twitter_handle\nSomebody,@x\n', existing);
check(
  extra.ignoredColumns.includes('twitter_handle'),
  'a column this portal has no field for is named rather than dropped in silence',
);

// --- the audit file (M8-16) ------------------------------------------------
//
// This file is the one export that is dangerous when it is merely incomplete.
// Forty payments under the heading "2026-Q1" will be read as the quarter's
// payments by everybody who opens it afterwards, and nothing in a plain CSV
// would say otherwise.

const MANIFEST = {
  code: '2026-Q1',
  startsOn: '2026-01-01',
  endsOn: '2026-03-31',
  state: 'closed',
  closedAt: '2026-04-02T09:00:00.000Z',
  rowsInThePeriod: 44,
  rowsYouCanRead: 40,
  rowsWithheld: 4,
  withheldByTier: { restricted: 4 },
  gaps: {
    vouchers_never_decided: 2,
    vouchers_approved_not_paid: 1,
    vouchers_paid_with_no_ledger_entry: 0,
    ledger_entries_with_no_document: 7,
    ledger_entries_never_audited: 31,
    ledger_entries_with_no_voucher: 5,
    receipts_with_no_document: 3,
    certified_work_not_paid: 1,
  },
  entriesAddedAfterTheClose: 1,
};

const auditRow = (over = {}) => ({
  referenceNo: 'PV-001',
  date: '2026-02-11',
  category: 'civil_construction',
  description: 'Cement, 400 bags',
  amount: 450000,
  currency: 'KES',
  amountKes: 450000,
  payee: 'Coast Hardware',
  paymentVoucherId: null,
  documentId: null,
  auditedAt: null,
  confidentiality: 'internal',
  ...over,
});

const partial = toAuditFile([auditRow()], MANIFEST, { language: 'tr' });

check(
  /DİKKAT: bu dosya dönemin tam kaydı DEĞİLDİR/.test(partial.text),
  'a file missing rows says so in words before it says it in a number',
);
check(
  partial.text.indexOf('DİKKAT') < partial.text.indexOf('44'),
  'and says it first, because a figure in a header is a figure a reader scrolls past',
);
check(partial.complete === false, 'and reports itself as not the complete record');
check(
  /restricted: 4/.test(partial.text),
  'the tier of what was withheld is named, and none of its content is',
);
check(
  !/Cement, 400 bags.*restricted/s.test(partial.text.split('Kayıtlar')[0] ?? ''),
  'no withheld row leaks into the manifest',
);
check(
  /,1\r?\n/.test(partial.text) && /Kapanıştan sonra girilen/.test(partial.text),
  'entries added after the close are in the manifest, not folded into the total',
);
check(
  /Denetlenmemiş kayıt,31/.test(partial.text),
  'the gaps counted at the close travel with the file',
);

const whole = toAuditFile(
  [auditRow()],
  { ...MANIFEST, rowsInThePeriod: 1, rowsYouCanRead: 1, rowsWithheld: 0, withheldByTier: {} },
  { language: 'tr' },
);
check(
  whole.complete === true && !/DİKKAT/.test(whole.text),
  'a file with nothing withheld carries no warning it does not need',
);

// An open period's figures are not a close, and a file taken mid-quarter is
// otherwise indistinguishable from one taken after it.
const openFile = toAuditFile(
  [auditRow()],
  { ...MANIFEST, state: 'open', closedAt: null, gaps: null },
  { language: 'tr' },
);
check(
  /Dönem kapanmadı; bu rakamlar bir kapanış değil/.test(openFile.text),
  'a file taken before the close says the figures are not a close',
);
check(
  /eksikler sayılmadı — bu sıfır demek değil/.test(openFile.text) &&
    !/Denetlenmemiş kayıt,0/.test(openFile.text),
  'and an uncounted gap list is said to be uncounted rather than printed as zeroes',
);

// RFC 4180, the same rules the contact export is held to.
const quoted = toAuditFile(
  [auditRow({ description: 'Cement, 400 bags; "urgent"', payee: 'Coast\r\nHardware' })],
  MANIFEST,
  { language: 'tr' },
);
check(
  /"Cement, 400 bags; ""urgent"""/.test(quoted.text),
  'a comma and a quote in a description survive the file intact',
);
check(
  /"Coast\r\nHardware"/.test(quoted.text),
  'and a newline inside a cell is quoted rather than breaking the row',
);
check(quoted.text.startsWith('﻿'), 'the file opens with a byte-order mark for Excel');
check(
  (quoted.text.match(/\r\n/g) ?? []).length > 10,
  'and the rows are separated the way the format says',
);

check(
  auditFileName('2026-Q1', new Date('2026-04-02T09:00:00Z')) === 'denetim-2026-Q1-2026-04-02.csv',
  'the file is named for its period and the day it was taken',
);
check(
  auditFileName('2026/Q1 (revised)', new Date('2026-04-02T09:00:00Z')) ===
    'denetim-2026-Q1--revised--2026-04-02.csv',
  'and a period code with a slash in it does not become a path',
);

rmSync(out, { recursive: true, force: true });
console.log(failures === 0 ? '\nAll export checks passed.' : `\n${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
