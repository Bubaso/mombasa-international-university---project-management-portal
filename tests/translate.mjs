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

const { TRANSLATES, missingHalves, tableFor } = await import(join(out, 'lib', 'translate.js'));

// --- the registry ----------------------------------------------------------

check(Object.keys(TRANSLATES).length > 0, 'the registry names at least one entity');
check(
  Object.values(TRANSLATES).every((e) => e.table && e.fields.length > 0),
  'and every entry names a table and at least one field pair',
);
check(
  Object.values(TRANSLATES).every((e) =>
    e.fields.every((f) => f.en && f.tr && f.en !== f.tr && f.labelEn && f.labelTr),
  ),
  'every pair has two different columns and a name a reviewer would recognise',
);
check(tableFor('meeting') === 'meetings', 'an entity kind resolves to its table');
check(tableFor('nothing_like_it') === null, 'and an unknown one resolves to nothing');

// --- the rule --------------------------------------------------------------

check(
  missingHalves('meeting', { title: 'Meeting with the Governor', title_tr: null }).length === 1,
  'an English title with no Turkish is a gap',
);
check(
  missingHalves('meeting', { title: 'Meeting with the Governor', title_tr: 'Valiyle görüşme' })
    .length === 0,
  'a title that has both languages is left alone',
);
check(
  missingHalves('meeting', { title: 'Meeting', title_tr: '   ' }).length === 1,
  'whitespace is not a translation',
);
check(
  missingHalves('meeting', { title: '', title_tr: '' }).length === 0,
  'and an empty pair is an empty field, not a gap — there is nothing to translate from',
);

// The direction has to come out of which side is filled, not out of a default.
const intoTr = missingHalves('decision', {
  text_en: 'The board resolved to wait.',
  text_tr: null,
  rationale_en: null,
  rationale_tr: null,
});
check(
  intoTr.length === 1 && intoTr[0].into === 'tr' && intoTr[0].from === 'en',
  'an English-only field is translated into Turkish',
);
const intoEn = missingHalves('decision', {
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
const gaps = missingHalves('open_question', crowded);
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
  missingHalves('obligation', { title_en: 'Something', title_tr: null }).length === 0,
  'an entity that is not in the registry is not translated',
);

rmSync(out, { recursive: true, force: true });

console.log(failures === 0 ? '\nAll translation rule checks passed.' : `\n${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
