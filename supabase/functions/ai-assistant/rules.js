/**
 * The assistant's rules, separated from its plumbing so they can be tested.
 *
 * Plain JavaScript on purpose: the function runs under Deno and the test runs
 * under Node, and both import this file directly. A rule that decides whether
 * a model gets called at all deserves a test, and a test that needs a build
 * step is a test that stops being run.
 *
 * Tested by tests/assistant.mjs.
 */

// ---------------------------------------------------------------------------
// The label (M13-08)
// ---------------------------------------------------------------------------

/**
 * Applied here rather than requested of the model. A model asked to mark its
 * own output as provisional complies most of the time, and "most of the time"
 * is not a requirement being met. Both languages, because the people who read
 * it work in both.
 */
export const DRAFT_LABEL_EN = 'DRAFT — needs human approval.';
export const DRAFT_LABEL_TR = 'TASLAK — insan onayı gerekir.';

/** @param {string} text */
export function labelled(text) {
  return `${DRAFT_LABEL_TR}\n${DRAFT_LABEL_EN}\n\n${String(text).trim()}`;
}

// ---------------------------------------------------------------------------
// The five uses, and nothing else (M13-07)
// ---------------------------------------------------------------------------

/**
 * The common ground rules. Every task gets these; nothing in a request can
 * negotiate them.
 */
export const HOUSE_RULES = [
  'You are assisting the staff of Mombasa International University, a project',
  'run by the African University Trust of Kenya. The project has been in',
  'litigation for over a decade and the material you are shown is often',
  'confidential.',
  '',
  'Rules you follow without exception:',
  '1. Use only the records supplied below. If they do not contain the answer,',
  '   say so plainly. Do not supply general knowledge about Kenyan law, this',
  '   project, or anything else.',
  '2. Cite every claim with the marker of the record it came from, in square',
  '   brackets, exactly as given — for example [legal_case:3f2a...]. A',
  '   sentence without a citation must not be written.',
  '3. You do not give legal advice, legal opinions, or predictions about',
  '   litigation. Where a legal question arises, quote and cite the recorded',
  '   opinion if one is supplied, and otherwise say that the question needs',
  '   the project advocate.',
  '4. A record marked `confidential` may be used, but say in the answer that',
  '   the source is confidential so the reader knows not to forward it.',
  '5. Answer in the language of the question. If the question is Turkish,',
  '   answer in Turkish.',
].join('\n');

/**
 * @typedef {{retrieval: 'question' | 'digest' | 'none', takesText: boolean, instruction: string}} TaskSpec
 * @type {Record<string, TaskSpec>}
 */
export const TASKS = {
  // (a) Soru-cevap over the archive.
  archive_question: {
    retrieval: 'question',
    takesText: false,
    instruction: [
      'Answer the question from the records supplied.',
      'Be short. Where records disagree, say that they disagree and cite both.',
      'Where the answer depends on a date, give the date.',
    ].join('\n'),
  },

  // (b) Notes into structured minutes. The notes are the caller's own, so
  // there is nothing to retrieve.
  meeting_minutes: {
    retrieval: 'none',
    takesText: true,
    instruction: [
      'Turn the rough notes below into structured minutes, under exactly',
      'these headings, omitting any heading the notes say nothing about:',
      'Discussed / Decisions / Actions (with owner and date where stated) /',
      'Open questions.',
      'Invent nothing. If an action has no owner in the notes, write',
      '"owner not stated" rather than guessing one.',
      'Keep the language of the notes.',
    ].join('\n'),
  },

  // (c) A TR↔EN suggestion. The requirement calls it a suggestion, and
  // meeting_notes.is_machine_translation exists so one can be stored as
  // unapproved — which is where this output is meant to land, by the caller's
  // hand and not this function's (M13-09).
  translation: {
    retrieval: 'none',
    takesText: true,
    instruction: [
      'Translate the text below between Turkish and English, in whichever',
      'direction it is not already in.',
      'This is a legal and construction archive: keep case numbers, plot',
      'numbers, statute names, party names and figures exactly as written,',
      'and do not translate them.',
      'Where a term has no settled equivalent, give your rendering and put',
      'the original in brackets after it.',
      'Output the translation only.',
    ].join('\n'),
  },

  // (d) A draft weekly summary, from the week's deadlines and open decisions.
  weekly_digest: {
    retrieval: 'digest',
    takesText: false,
    instruction: [
      'Write a short weekly note for the trustees from the records supplied.',
      'Three parts: what falls due, what is waiting on a decision and whose',
      'decision it is, and anything marked as needing attention.',
      'Order by what is most urgent. Cite every item. Do not editorialise and',
      'do not say the project is going well or badly.',
    ].join('\n'),
  },

  // (e) A long document, shortened. Again the caller supplies the text: the
  // vault stores files and nothing in this portal extracts text from a PDF,
  // so pretending otherwise would be the dishonest option.
  document_summary: {
    retrieval: 'none',
    takesText: true,
    instruction: [
      'Summarise the document below for somebody who has to act on it.',
      'Lead with what it requires of whom and by when. Then the reasoning,',
      'briefly. Then anything it leaves unresolved.',
      'Quote exactly any wording that creates an obligation or a deadline.',
      'Invent nothing and leave nothing material out.',
    ].join('\n'),
  },
};

// ---------------------------------------------------------------------------
// The legal question (M13-08)
// ---------------------------------------------------------------------------

/**
 * Asking for an opinion, as opposed to asking what the record says.
 *
 * This is a pattern list, not a classifier, and it is written here so nobody
 * mistakes it for one. It catches the ordinary phrasings in both languages;
 * the house rules above are the backstop for what it misses, and the draft
 * label is the backstop for that. What it buys is the strongest version of
 * the rule for the cases it does catch: the model is never called at all, so
 * there is no generated opinion for a label to sit on top of.
 */
export const ASKING_FOR_ADVICE = [
  /\b(should|shall)\s+we\b/i,
  /\bcan\s+we\s+(sue|appeal|claim|evict|demolish|build|proceed)\b/i,
  /\bare\s+we\s+(liable|entitled|allowed|obliged)\b/i,
  /\bis\s+it\s+(legal|lawful|enforceable|valid|binding)\b/i,
  /\b(do|does)\s+(we|it)\s+have\s+a\s+(case|claim|right)\b/i,
  /\bwhat\s+are\s+our\s+(chances|prospects|odds)\b/i,
  /\blegal\s+(advice|opinion)\b/i,
  /\bwill\s+we\s+win\b/i,
  // Turkish. The suffix carries the question, so the stems are matched loosely
  // and both the dotted and dotless i are allowed for a keyboard without them.
  //
  // These end with a lookahead rather than \b, and the reason is a trap worth
  // naming: JavaScript's \b is ASCII, so it sees ı, ş, ö and ü as non-word
  // characters and finds no boundary after them. /yasal m[ıi]\b/ therefore
  // never matched "yasal mı" — the pattern looked right and silently let the
  // question through to the model. \p{L} with the u flag is the version that
  // works for both alphabets.
  /\bdava\s+a[çc]abilir\s+miyiz(?![\p{L}\p{N}])/iu,
  /\bhukuk[ei]n(?![\p{L}\p{N}])/iu,
  /\bhakl[ıi]\s+m[ıi]y[ıi]z(?![\p{L}\p{N}])/iu,
  /\byasal\s+m[ıi](?![\p{L}\p{N}])/iu,
  /\bne\s+yapmal[ıi]y[ıi]z(?![\p{L}\p{N}])/iu,
  /\bkazan[ıi]r\s+m[ıi]y[ıi]z(?![\p{L}\p{N}])/iu,
  /\bhukuk[ıi]\s+g[öo]r[üu][şs](?![\p{L}\p{N}])/iu,
  /\bsorumlu\s+(muyuz|mu)(?![\p{L}\p{N}])/iu,
];

/** @param {string} question */
export function asksForLegalAdvice(question) {
  const text = String(question ?? '');
  return ASKING_FOR_ADVICE.some((pattern) => pattern.test(text));
}

// ---------------------------------------------------------------------------
// Citations (M13-04)
// ---------------------------------------------------------------------------

/** The marker a record is cited by, and the answer is checked for. */
export function marker(row) {
  return `[${row.kind}:${row.id}]`;
}

/**
 * Did the answer actually cite something it was given?
 *
 * The check is deliberately against the supplied records rather than against
 * the shape of a marker. An answer that invents `[legal_case:…]` with an id
 * nobody handed it has cited nothing — it has produced a citation-shaped
 * string, which is worse than none, and this returns false for it.
 *
 * @param {string} text
 * @param {{kind: string, id: string}[]} sources
 */
export function citesAnySource(text, sources) {
  const answer = String(text ?? '');
  return (sources ?? []).some((row) => answer.includes(marker(row)));
}
