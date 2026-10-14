/**
 * Navigation structure rules (T1-01, T1-04, T1-05).
 *
 * These are facts about the source, not about a layout, so they are checked
 * by reading the source rather than by driving a browser: no credentials, no
 * build, no live project, and fast enough to belong in `npm run verify`.
 * Whether a label actually fits the sidebar is a different question and is
 * measured in `tests/design.mjs`, where a real browser can answer it.
 *
 * Usage: npm run test:nav
 */
import { readFileSync } from 'node:fs';

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const nav = read('src/lib/navigation.ts');
const types = read('src/types/index.ts');

// --- every route is in a group, and only real routes are (T1-05) -----------
//
// Six routes used to be in the sidebar and in neither phone list, so on a
// phone they could not be reached at all. Nobody hid them; the second list
// had just never caught up. One list is what stops that happening again, and
// this is what stops the one list quietly losing a route.

const union = types.slice(
  types.indexOf('export type ActiveTab'),
  types.indexOf(';', types.indexOf('export type ActiveTab')),
);
const declaredTabs = [...union.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
const navTabs = [...nav.matchAll(/^\s*tab: '([a-z_]+)',/gm)].map((m) => m[1]);

check(declaredTabs.length === 19, 'the portal still has nineteen routes', `${declaredTabs.length}`);

const missing = declaredTabs.filter((t) => !navTabs.includes(t));
check(
  missing.length === 0,
  'every route the application declares is in a navigation group',
  missing.length ? `missing: ${missing.join(', ')}` : `all ${navTabs.length}`,
);

const unknown = navTabs.filter((t) => !declaredTabs.includes(t));
check(
  unknown.length === 0,
  'and navigation offers nothing that is not a route',
  unknown.length ? `unknown: ${unknown.join(', ')}` : '',
);

check(
  new Set(navTabs).size === navTabs.length,
  'no route appears in two groups',
  `${navTabs.length} entries, ${new Set(navTabs).size} distinct`,
);

const paths = [...nav.matchAll(/^\s*path: '([^']*)',/gm)].map((m) => m[1]);
check(
  new Set(paths).size === paths.length,
  'and no two routes share a path',
  `${paths.length} paths, ${new Set(paths).size} distinct`,
);

// --- groups are small enough to scan (T1-01) -------------------------------
//
// The sidebar was nineteen flat items of identical weight. Six is the point
// past which a group stops being a group and becomes a list again.

const groupBlocks = nav.split(/^\s*id: '[a-z_]+',$/m).slice(1);
const groupSizes = groupBlocks.map((b) => (b.match(/^\s*tab: '/gm) ?? []).length);
const headings = [...nav.matchAll(/heading: \{ tr: '([^']+)', en: '([^']+)' \}/g)];

check(groupSizes.length >= 2, 'the routes are in named groups', `${groupSizes.length} groups`);
check(
  headings.length === groupSizes.length,
  'every group has a heading in both languages',
  `${headings.length} headings for ${groupSizes.length} groups`,
);
check(
  groupSizes.every((n) => n > 0 && n <= 6),
  'and no group holds more than six routes',
  `sizes: ${groupSizes.join(', ')}`,
);

// --- nothing in navigation asserts a fact (T1-04) --------------------------
//
// The badges here were "Temyiz E062", "Koruma Tedbiri", "API Hazır", "v2.1",
// "E062" and "%52": an appeal number, a court measure, an integration that
// does not exist, a version nobody set, and a construction progress figure.
// Every one of them was a string in a component, and every one of them read
// as today's position to anyone who saw it — the same defect Faz 0 cleared
// off the screen.
//
// A badge driven by a query is fine, which is why the rule is about literals
// rather than about the word: `badge: openCases.length` passes, and
// `badge: language === 'tr' ? 'API Hazır' : 'API Live'` does not.

const NAV_FILES = [
  'src/lib/navigation.ts',
  'src/components/Sidebar.tsx',
  'src/components/MobileBottomNav.tsx',
  'src/components/MobileMoreSheet.tsx',
];

const literalBadges = [];
for (const file of NAV_FILES) {
  const lines = read(file).split('\n');
  lines.forEach((line, i) => {
    // Only where a badge is being GIVEN a value, not where it is described
    // in a comment or read back out.
    const m = /(?:^|[^\w.])badge\s*[:=]\s*(.+)$/.exec(line);
    if (!m) return;
    if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) return;
    if (/['"`]/.test(m[1])) literalBadges.push(`${file}:${i + 1}`);
  });
}
check(
  literalBadges.length === 0,
  'no navigation badge is a typed-in string',
  literalBadges.length ? literalBadges.join(', ') : 'none in four nav files',
);

// --- navigation labels are short (T1-02, cheaply) --------------------------
//
// Five labels used to end in an ellipsis: "Plan, Kilometre Taşları ve Kron…",
// "Uyum ve Akademik Hazır…". Truncation takes exactly the words that tell one
// screen from another. Whether a label fits is really a question for a
// browser and tests/design.mjs measures it there; this is the cheap guard
// that catches a long one before anybody builds.

const labels = [...nav.matchAll(/label: \{ tr: '([^']+)', en: '([^']+)' \}/g)].flatMap((m) => [
  m[1],
  m[2],
]);
const tooLong = labels.filter((l) => l.length > 26);
check(labels.length >= 38, 'every route has a short label in both languages', `${labels.length}`);
check(
  tooLong.length === 0,
  'and none of them is long enough to need truncating',
  tooLong.length
    ? tooLong.join(' | ')
    : `longest ${Math.max(...labels.map((l) => l.length))} chars`,
);

// A title is the full name and is allowed to be long, but it has to exist.
const titles = [...nav.matchAll(/title: \{ tr: '([^']+)', en: '([^']+)' \}/g)];
check(
  titles.length === navTabs.length,
  'and a full title for the page heading',
  `${titles.length} titles for ${navTabs.length} routes`,
);

// --- the phone's bottom bar stays at five (T1-06) --------------------------

const bottom = read('src/components/MobileBottomNav.tsx');
const bottomRoutes = (bottom.match(/^\s*tab: '/gm) ?? []).length;
check(
  bottomRoutes <= 4,
  'the phone bottom bar keeps at most four routes beside the menu',
  `${bottomRoutes} routes + menu = ${bottomRoutes + 1}`,
);

// Both phone surfaces must read the shared list rather than their own copy.
for (const file of ['src/components/Sidebar.tsx', 'src/components/MobileMoreSheet.tsx']) {
  check(
    /from '\.\.\/lib\/navigation'/.test(read(file)),
    `${file.split('/').pop()} reads the shared navigation list`,
  );
}

console.log('');
if (failures > 0) {
  console.error(`${failures} navigation check(s) failed.`);
  process.exit(1);
}
console.log('All navigation checks passed.');
