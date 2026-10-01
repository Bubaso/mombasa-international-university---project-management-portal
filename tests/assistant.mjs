/**
 * The assistant's rules, tested directly (M13-04, M13-07, M13-08).
 *
 * These three decisions are made before or after the model is called and
 * cannot be observed from the browser, so the smoke test cannot reach them:
 * which five tasks exist, what counts as asking for a legal opinion, and what
 * counts as an answer being cited. They are also the three where getting it
 * wrong means either a generated legal opinion or an answer with nothing
 * behind it reaching somebody who will act on it.
 *
 * Usage: npm run test:assistant
 */
import {
  DRAFT_LABEL_EN,
  DRAFT_LABEL_TR,
  HOUSE_RULES,
  TASKS,
  asksForLegalAdvice,
  citesAnySource,
  labelled,
  marker,
} from '../supabase/functions/ai-assistant/rules.js';

let failures = 0;
const check = (ok, label, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

// ---------------------------------------------------------------------------
// M13-07: five uses, and no sixth
// ---------------------------------------------------------------------------

const EXPECTED = [
  'archive_question',
  'meeting_minutes',
  'translation',
  'weekly_digest',
  'document_summary',
];

check(
  Object.keys(TASKS).length === 5,
  'there are exactly five defined uses',
  `(${Object.keys(TASKS).length})`,
);
check(
  EXPECTED.every((name) => name in TASKS),
  'and they are the five the requirement names',
);
check(
  Object.values(TASKS).every((spec) => spec.instruction.trim().length > 0),
  'each one carries its own instruction, written server-side',
);
// The three that transform text must not also retrieve, and the two that
// retrieve must not need the caller to paste anything. Getting this crossed
// would mean a task that silently reads the archive when the person thought
// they were having their own notes tidied.
check(
  Object.values(TASKS).every((spec) =>
    spec.takesText ? spec.retrieval === 'none' : spec.retrieval !== 'none',
  ),
  'a task either reads the archive or works on supplied text, never both',
);
check(
  HOUSE_RULES.includes('Use only the records supplied') &&
    HOUSE_RULES.includes('You do not give legal advice'),
  'the house rules every task inherits say both of the things they must',
);

// ---------------------------------------------------------------------------
// M13-08: the label, and the refusal
// ---------------------------------------------------------------------------

const sample = labelled('The board resolved to renew the permit.');
check(
  sample.startsWith(DRAFT_LABEL_TR) && sample.includes(DRAFT_LABEL_EN),
  'generated text is labelled a draft in both languages, in code',
);
check(
  labelled('   padded   ').includes('padded'),
  'and the label survives whatever whitespace the model sends',
);

const ASKS = [
  'Should we appeal the order?',
  'Can we sue the county over the boundary?',
  'Are we liable for the contractor’s delay?',
  'Is it legal to resume work under the order?',
  'What are our chances on the contempt application?',
  'Give me a legal opinion on the lease.',
  'Will we win the appeal?',
  'Do we have a case against the surveyor?',
  'Dava açabilir miyiz?',
  'Hukuken haklı mıyız sence?',
  'Haklı mıyız?',
  'Bu yasal mı?',
  'Ne yapmalıyız?',
  'Kazanır mıyız?',
  'Bu konuda hukuki görüş ver.',
  'Gecikmeden sorumlu muyuz?',
];

for (const question of ASKS) {
  check(asksForLegalAdvice(question), `refuses: ${question}`);
}

// The other half of the test, and the half that matters for usefulness: a
// question about what the record SAYS is not a request for an opinion, and
// treating it as one would make the assistant useless for its main job.
const DOES_NOT_ASK = [
  'What was decided about renewing the permit?',
  'When was the last hearing on ELC/134/2013?',
  'Which obligations fall due in November?',
  'Who signed the trust deed?',
  'Ruhsat yenilemesi hakkında ne karar verildi?',
  'Son duruşma ne zamandı?',
  'Kasımda vadesi gelen yükümlülükler neler?',
  'Mütevelli heyeti kaç kişiden oluşuyor?',
  'Summarise the order of 9 February.',
];

for (const question of DOES_NOT_ASK) {
  check(!asksForLegalAdvice(question), `answers: ${question}`);
}

check(!asksForLegalAdvice(''), 'an empty question is not a request for an opinion');
check(!asksForLegalAdvice(undefined), 'and neither is a missing one');

// ---------------------------------------------------------------------------
// M13-04: no sources, no answer
// ---------------------------------------------------------------------------

const SOURCES = [
  { kind: 'legal_case', id: '11111111-1111-1111-1111-111111111111' },
  { kind: 'meeting_note', id: '22222222-2222-2222-2222-222222222222' },
];

check(
  marker(SOURCES[0]) === '[legal_case:11111111-1111-1111-1111-111111111111]',
  'a record is cited by kind and id',
);
check(
  citesAnySource(`The permit was renewed ${marker(SOURCES[1])}.`, SOURCES),
  'an answer that cites a supplied record passes',
);
check(
  !citesAnySource('The permit was renewed in March.', SOURCES),
  'an answer that cites nothing is rejected',
);
// The case worth having a test for. A citation-shaped string with an id
// nobody supplied is not a citation; it is a fabrication that looks like one,
// and counting it would defeat the whole check.
check(
  !citesAnySource(
    'The permit was renewed [legal_case:deadbeef-0000-0000-0000-000000000000].',
    SOURCES,
  ),
  'and an invented citation does not count as one',
);
check(
  !citesAnySource('See [legal_case] and [meeting_note:].', SOURCES),
  'nor does a marker with the id left off',
);
check(!citesAnySource('anything', []), 'with no records supplied, nothing is cited');

console.log(
  failures === 0 ? '\nAll assistant rule checks passed.' : `\n${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
