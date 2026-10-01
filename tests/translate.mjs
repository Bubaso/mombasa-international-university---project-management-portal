/**
 * The one translation rule that must never break (M3-10).
 *
 * Everything else about automatic translation is visible: the queue says what
 * is unapproved, the badge says a field holds a machine's words, the smoke
 * test reads both off the screen. This rule is not visible, and its failure is
 * silent and destructive: if missingHalves() ever names a field that already
 * says something, a machine overwrites what a person wrote — in the other
 * language, where the person who wrote it may not look again for months.
 *
 * It is pure logic over a row, so it is tested here rather than through a
 * browser. src/lib/translate.ts is compiled on the fly because its only import
 * is a type, which erases: there is nothing to link.
 *
 * Usage: npm run test:translate
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = mkdtempSync(join(tmpdir(), 'miu-translate-'));
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
      'src/lib/translate.ts',
      '--outDir',
      out,
      '--module',
      'esnext',
      '--target',
      'es2022',
      '--moduleResolution',
      'bundler',
      // Pinned, because tsc widens rootDir to cover every file it had to read
      // for types and the emitted path moves with it.
      '--rootDir',
      'src',
    ],
    { stdio: 'pipe' },
  );
} catch (error) {
  console.error('Could not compile src/lib/translate.ts');
  console.error(error.stdout?.toString() ?? error.message);
  process.exit(1);
}

const {
  TRANSLATED_TABLES,
  columnsOf,
  enColumn,
  fieldsOf,
  markedColumn,
  missingHalves,
  translates,
} = await import(join(out, 'lib', 'translate.js'));

// --- the registry ----------------------------------------------------------

// 42 tables and 70 pairs: the 41 and 68 measured when the registry was built,
// plus site_incidents' narrative and response, which 0037 added. The numbers
// are hard-coded so a new bilingual table cannot arrive without somebody
// deciding whether a machine may write into it.
check(
  TRANSLATED_TABLES.length === 42,
  'the registry covers every bilingual table it may write to',
  `${TRANSLATED_TABLES.length}`,
);
check(
  TRANSLATED_TABLES.reduce((n, t) => n + fieldsOf(t).length, 0) === 70,
  'and every bilingual field pair in them',
  `${TRANSLATED_TABLES.reduce((n, t) => n + fieldsOf(t).length, 0)}`,
);
// An incident narrative is written at the gate in whichever language the
// writer has, and read by trustees in the other. It is translated like any
// other register — but the marker matters more here than anywhere: a sentence
// that may be read in court should say when a machine chose its words.
check(
  translates('site_incidents') && fieldsOf('site_incidents').length === 2,
  'an incident narrative and the response to it are both translated (0037)',
);
check(
  TRANSLATED_TABLES.every((t) =>
    fieldsOf(t).every((f) => f.en && f.tr && f.en !== f.tr && f.labelEn && f.labelTr),
  ),
  'each pair has two different columns and a name a reviewer would recognise',
);
check(
  TRANSLATED_TABLES.every((t) => fieldsOf(t).every((f) => f.labelEn !== f.base)),
  'and no field falls back to showing a reviewer its column name',
  TRANSLATED_TABLES.flatMap((t) =>
    fieldsOf(t)
      .filter((f) => f.labelEn === f.base)
      .map((f) => f.base),
  ).join(', '),
);
// `notifications` is the one pair left out on purpose: a notification is
// raised with both languages already written, so translating one would be
// rewriting a message that has already been delivered.
check(!translates('notifications'), 'a notification is not translated after it has been sent');
// A candidate's text is a quotation from a minute and 0032 refuses to let
// anybody rewrite it. A backfill that tried had its UPDATE refused and wrote
// the marker anyway — a claim of machine text in an empty field, which is the
// state this feature exists to prevent.
check(!translates('action_candidates'), 'a quotation from a minute is not translated in place');
check(!translates('supplier_reviews'), 'nor is an append-only register rewritten');
check(
  translates('obligations') && !translates('profiles'),
  'a table is in the registry or it is not',
);

check(
  enColumn('meetings', 'title') === 'title',
  'meetings.title is the pair that breaks the convention',
);
check(enColumn('obligations', 'title') === 'title_en', 'and the exception is for that table alone');
check(
  columnsOf('decisions').includes('id') && columnsOf('decisions').length === 5,
  'a sweep reads the id and both halves of each pair, and nothing else',
  columnsOf('decisions').join(', '),
);

// --- the rule --------------------------------------------------------------

check(
  missingHalves('meetings', { title: 'Meeting with the Governor', title_tr: null }).length === 1,
  'an English title with no Turkish is a gap',
);
check(
  missingHalves('meetings', { title: 'Meeting with the Governor', title_tr: 'Valiyle görüşme' })
    .length === 0,
  'a title that has both languages is left alone',
);
check(
  missingHalves('meetings', { title: 'Meeting', title_tr: '   ' }).length === 1,
  'whitespace is not a translation',
);
check(
  missingHalves('meetings', { title: '', title_tr: '' }).length === 0,
  'and an empty pair is an empty field, not a gap — there is nothing to translate from',
);

// The direction has to come out of which side is filled, not out of a default.
const intoTr = missingHalves('decisions', {
  text_en: 'The board resolved to wait.',
  text_tr: null,
  rationale_en: null,
  rationale_tr: null,
});
check(
  intoTr.length === 1 && intoTr[0].into === 'tr' && intoTr[0].from === 'en',
  'an English-only field is translated into Turkish',
);
const intoEn = missingHalves('decisions', {
  text_en: null,
  text_tr: 'Kurul beklemeye karar verdi.',
  rationale_en: null,
  rationale_tr: null,
});
check(
  intoEn.length === 1 && intoEn[0].into === 'en' && intoEn[0].from === 'tr',
  'and a Turkish-only one into English',
);
check(
  intoEn[0].column === 'text_en' && intoEn[0].source === 'Kurul beklemeye karar verdi.',
  'the gap names the column to write and the text to work from',
);

// The rule, stated as the thing it prevents: no gap ever names a column that
// already says something.
const crowded = {
  question_en: 'Who signs the variation?',
  question_tr: 'Tadili kim imzalar?',
  detail_en: 'The registry asked on 12 April.',
  detail_tr: null,
  answer_en: null,
  answer_tr: 'Mütevelli heyeti.',
};
const gaps = missingHalves('open_questions', crowded);
check(
  gaps.every((g) => !crowded[g.column] || crowded[g.column].trim() === ''),
  'no gap ever names a column that already says something',
  gaps.map((g) => g.column).join(', '),
);
check(
  gaps.length === 2 &&
    gaps.some((g) => g.column === 'detail_tr') &&
    gaps.some((g) => g.column === 'answer_en'),
  'and a record with three pairs in three states reports exactly the two gaps',
  gaps.map((g) => g.column).join(', '),
);

// An entity nobody registered is not translated by accident.
check(
  missingHalves('profiles', { full_name: 'Somebody', title_tr: null }).length === 0,
  'a table that is not in the registry is not translated',
);

// --- which column a badge is about (0035) ---------------------------------
//
// The badge follows the column the words came from, not the language the
// reader asked for, because bilingualFrom falls back. These three rules were
// in the hook, where nothing could test them, and a mutation that dropped the
// null case survived the browser tests — which is why they are here.

check(markedColumn('decisions', 'text', 'tr') === 'text_tr', 'a badge names <base>_<side>');
check(markedColumn('decisions', 'text', 'en') === 'text_en', 'in either direction');
check(
  markedColumn('decisions', 'text', null) === null,
  'a field empty in both languages has nothing on screen to mark',
);
check(
  markedColumn('meetings', 'title', 'en') === 'title',
  'and meetings.title keeps its name, being the pair that breaks the convention',
);
check(
  markedColumn('meetings', 'title', 'tr') === 'title_tr',
  'while its Turkish half follows the convention like everything else',
);
check(
  markedColumn('obligations', 'title', 'en') === 'title_en',
  'the exception is for that one table, not for every title',
);

rmSync(out, { recursive: true, force: true });

console.log(failures === 0 ? '\nAll translation rule checks passed.' : `\n${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
