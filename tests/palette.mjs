/**
 * Chart palette rules (T10-01, T10-02, T9-01).
 *
 * Pure arithmetic over `src/lib/palette.ts`: no browser, no build, no
 * credentials, so it runs inside `npm run verify` and a colour cannot be
 * changed without the consequence being measured.
 *
 * The colour maths below is the Machado, Oliveira & Fernandes (2009)
 * colour-vision-deficiency simulation at severity 1.0 together with OKLab,
 * copied from the dataviz skill's `validate_palette.js` so the numbers here
 * are the same numbers that tool reports. It is copied rather than imported
 * because that tool lives outside the repository and CI has no access to it.
 * The thresholds are its thresholds: ΔE is Euclidean distance in OKLab ×100,
 * and the simulation model is part of the calibration rather than an
 * implementation detail — swapping in another one would move borderline
 * pairs and invalidate the numbers.
 *
 * Usage: npm run test:palette
 */
import { readFileSync } from 'node:fs';

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

// --- the maths --------------------------------------------------------------

const MACHADO = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

const hex2srgb = (h) => {
  const s = h.trim().replace(/^#/, '');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
};
const s2lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lin = (h) => hex2srgb(h).map(s2lin);
const relLum = (h) => {
  const [r, g, b] = lin(h);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
function oklabFromLin([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
const simulate = (h, kind) => {
  const [r, g, b] = lin(h);
  const M = MACHADO[kind];
  const clamp = (c) => Math.max(0, Math.min(1, c));
  return M.map((row) => clamp(row[0] * r + row[1] * g + row[2] * b));
};
const deltaE = (h1, h2, kind) => {
  const a = oklabFromLin(kind ? simulate(h1, kind) : lin(h1));
  const b = oklabFromLin(kind ? simulate(h2, kind) : lin(h2));
  return 100 * Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
};
const lightness = (h) => oklabFromLin(lin(h))[0];
const chroma = (h) => {
  const [, a, b] = oklabFromLin(lin(h));
  return Math.hypot(a, b);
};
/** The worst a pair looks to someone who cannot see one of the cone types. */
const worstCvd = (a, b) => Math.min(deltaE(a, b, 'protan'), deltaE(a, b, 'deutan'));

// The dataviz skill's thresholds, not invented here.
const CVD_TARGET = 8.0;
const NORMAL_FLOOR = 15.0;
const CHROMA_FLOOR = 0.1;
const CONTRAST_MIN = 3.0; // a mark against its surface
const TEXT_MIN = 4.5; // body text (T9-01)
const SURFACE = '#fcfcfb';
const ORDINAL_MIN_DL = 0.06;

// --- what the application says it uses --------------------------------------

const src = readFileSync(new URL('../src/lib/palette.ts', import.meta.url), 'utf8');
const list = (name) => {
  const m = new RegExp(`export const ${name} = \\[([^\\]]*)\\]`).exec(src);
  return m ? [...m[1].matchAll(/'(#[0-9a-f]{6})'/g)].map((x) => x[1]) : [];
};
const CATEGORICAL = list('CATEGORICAL');
const CATEGORICAL_FILL = list('CATEGORICAL_FILL');
const statusBlock = /export const STATUS = \{([\s\S]*?)\} as const;/.exec(src)?.[1] ?? '';
const STATUS = Object.fromEntries(
  [...statusBlock.matchAll(/(\w+): '(#[0-9a-f]{6})'/g)].map((m) => [m[1], m[2]]),
);
const INK = /export const INK = '(#[0-9a-f]{6})'/.exec(src)?.[1] ?? '';
const GRID = /export const GRID = '(#[0-9a-f]{6})'/.exec(src)?.[1] ?? '';

check(CATEGORICAL.length >= 2, 'the categorical palette is readable from source', `${CATEGORICAL}`);
check(
  Object.keys(STATUS).length === 4,
  'and four status colours are named',
  Object.keys(STATUS).join(', '),
);

// --- T10-01: the categorical palette, on every pair -------------------------
//
// Every pair, not just adjacent ones. Adjacent-only would pass a palette that
// is correct in one arrangement and wrong in another, which is precisely the
// trap a third hue laid here: violet reads fine beside magenta and vanishes
// beside blue.
const pairs = CATEGORICAL.flatMap((a, i) => CATEGORICAL.slice(i + 1).map((b) => [a, b]));
const dim = pairs.filter(([a, b]) => worstCvd(a, b) < CVD_TARGET);
check(
  dim.length === 0,
  `T10-01 every categorical pair stays ${CVD_TARGET} apart under protanopia and deuteranopia`,
  dim.length
    ? dim.map(([a, b]) => `${a}↔${b} ΔE ${worstCvd(a, b).toFixed(1)}`).join(', ')
    : pairs.map(([a, b]) => `${a}↔${b} ΔE ${worstCvd(a, b).toFixed(1)}`).join(', '),
);
const same = pairs.filter(([a, b]) => deltaE(a, b) < NORMAL_FLOOR);
check(
  same.length === 0,
  'T10-01 and is separable to full colour vision too',
  same.length ? same.map(([a, b]) => `${a}↔${b} ΔE ${deltaE(a, b).toFixed(1)}`).join(', ') : '',
);
const grey = CATEGORICAL.filter((c) => chroma(c) < CHROMA_FLOOR);
check(
  grey.length === 0,
  'T10-01 and no slot reads as grey',
  grey.length ? grey.map((c) => `${c} C=${chroma(c).toFixed(3)}`).join(', ') : '',
);
const faint = [...CATEGORICAL, ...Object.values(STATUS)].filter(
  (c) => contrast(c, SURFACE) < CONTRAST_MIN,
);
check(
  faint.length === 0,
  `T10-01 every mark clears ${CONTRAST_MIN}:1 against the chart surface`,
  faint.length ? faint.map((c) => `${c} ${contrast(c, SURFACE).toFixed(2)}:1`).join(', ') : '',
);

// --- T10-02: status is reserved ---------------------------------------------
const reused = Object.entries(STATUS).filter(([, v]) =>
  [...CATEGORICAL, ...CATEGORICAL_FILL].includes(v),
);
check(
  reused.length === 0,
  'T10-02 no status colour is also a series colour',
  reused.map(([k, v]) => `${k} ${v}`).join(', '),
);

// The distinction a reader takes at a glance, and the one the old palette got
// wrong: #0ca30c against #d03b3b was ΔE 4.1 under deuteranopia.
const goodBad = worstCvd(STATUS.good, STATUS.critical);
check(
  goodBad >= CVD_TARGET,
  'T10-02 "fine" and "critical" are told apart without colour vision',
  `${STATUS.good}↔${STATUS.critical} ΔE ${goodBad.toFixed(1)} (was 4.1)`,
);

// Severity survives greyscale and print: the three steps fall light to dark.
const ramp = [STATUS.warning, STATUS.serious, STATUS.critical];
const Ls = ramp.map(lightness);
check(
  Ls.every((l, i) => i === 0 || l < Ls[i - 1]),
  'T10-02 and severity reads light to dark, so it survives greyscale',
  Ls.map((l) => l.toFixed(3)).join(' > '),
);
const thin = Ls.slice(1)
  .map((l, i) => [ramp[i], ramp[i + 1], Math.abs(l - Ls[i])])
  .filter(([, , g]) => g < ORDINAL_MIN_DL);
check(
  thin.length === 0,
  `T10-02 with a visible step between each (≥ ${ORDINAL_MIN_DL})`,
  thin.length ? thin.map(([a, b, g]) => `${a}↔${b} ΔL ${g.toFixed(3)}`).join(', ') : '',
);

// One cross-role pair sits under the normal-vision floor on purpose, and the
// test records it rather than letting it drift unnoticed: `warning` against
// the orange series. They are never the same kind of mark — the Gantt draws
// phases as bars and milestones as shapes, and its legend names the shapes —
// which is the secondary encoding the method calls for. What this guards is
// that it does not get WORSE, and that no other cross-role pair joins it.
const KNOWN_CLOSE = [['warning', CATEGORICAL[1]]];
const crossRole = [];
for (const [key, value] of Object.entries(STATUS)) {
  for (const series of CATEGORICAL) {
    if (KNOWN_CLOSE.some(([k, s]) => k === key && s === series)) continue;
    const d = deltaE(value, series);
    if (d < NORMAL_FLOOR) crossRole.push(`${key}↔${series} ΔE ${d.toFixed(1)}`);
  }
}
check(
  crossRole.length === 0,
  'T10-02 and no other status colour can be mistaken for a series',
  crossRole.join(', '),
);
const known = deltaE(STATUS.warning, CATEGORICAL[1]);
check(
  known >= 12,
  'T10-02 while the one pair that is close stays where it was',
  `warning↔${CATEGORICAL[1]} ΔE ${known.toFixed(1)}, separated by shape and label`,
);

// --- T9-01: ink is text, and held to text contrast --------------------------
check(
  contrast(INK, '#ffffff') >= TEXT_MIN,
  `T9-01 axis ink clears ${TEXT_MIN}:1 on white`,
  `${INK} ${contrast(INK, '#ffffff').toFixed(2)}:1`,
);
// And the grid is supposed to recede — a rule competing with the data is a
// defect in the other direction.
check(
  contrast(GRID, '#ffffff') < 2,
  'T9-01 while the grid stays recessive',
  `${GRID} ${contrast(GRID, '#ffffff').toFixed(2)}:1`,
);

// --- nothing draws with a colour outside this file --------------------------
//
// The seven constants were spelled out in two components, so a change in one
// silently disagreed with the other.
const CHART_FILES = ['src/components/plan/GanttPanel.tsx', 'src/components/reports/CurvePanel.tsx'];
const stray = [];
for (const file of CHART_FILES) {
  const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  for (const m of text.matchAll(/'#[0-9a-fA-F]{6}'/g)) stray.push(`${file} ${m[0]}`);
}
check(
  stray.length === 0,
  'T11-01 the chart components carry no colour of their own',
  stray.join(', '),
);

console.log('');
if (failures > 0) {
  console.error(`${failures} palette check(s) failed.`);
  process.exit(1);
}
console.log('All palette checks passed.');
