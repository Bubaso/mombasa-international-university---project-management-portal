/**
 * Refuses to let a test build be deployed as the real one.
 *
 * This exists because it happened. `build:smoke` used to write to the same
 * `dist/`, and `npm run verify` ends with the smoke suites — so after a green
 * verify the directory held a bundle pointing at `smoke.supabase.co` with
 * `smoke-anon-key`. Deploying it put the live portal in front of a host that
 * does not exist, and every sign-in answered "Failed to fetch". Nothing was
 * broken in the code; the wrong directory was shipped.
 *
 * The build directories are separate now, which is the actual fix. This is the
 * check that makes the mistake impossible rather than merely unlikely: a
 * marker from the test build in what is about to be deployed stops the deploy,
 * and so does a bundle with no Supabase URL in it at all.
 *
 * Usage: node scripts/check-dist.mjs [dir]
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'dist';
const assets = join(dir, 'assets');

if (!existsSync(assets)) {
  console.error(`${dir}/assets does not exist — run the build first.`);
  process.exit(1);
}

const js = readdirSync(assets)
  .filter((f) => f.endsWith('.js'))
  .map((f) => readFileSync(join(assets, f), 'utf8'));

/** Anything that only the smoke build puts in a bundle. */
const TEST_MARKERS = ['smoke.supabase.co', 'smoke-anon-key', 'smoke.functions.test'];

const found = TEST_MARKERS.filter((m) => js.some((s) => s.includes(m)));
if (found.length > 0) {
  console.error(
    `${dir} is a TEST build, not a deployable one. It contains: ${found.join(', ')}.\n` +
      'Run `npm run build` (not build:smoke) and check again.',
  );
  process.exit(1);
}

// A bundle with no project URL at all is the other way to ship something that
// cannot reach its backend: an empty VITE_SUPABASE_URL fails the same way and
// leaves nothing in the file to notice.
const urls = new Set();
for (const source of js) {
  for (const m of source.matchAll(/https:\/\/([a-z0-9]{20})\.supabase\.co/g)) urls.add(m[1]);
}

if (urls.size === 0) {
  console.error(
    `${dir} carries no Supabase project URL. VITE_SUPABASE_URL was probably empty at build time, ` +
      'which deploys a portal that cannot sign anybody in.',
  );
  process.exit(1);
}
if (urls.size > 1) {
  console.error(`${dir} carries more than one Supabase project: ${[...urls].join(', ')}.`);
  process.exit(1);
}

console.log(`ok   ${dir} is a real build, pointing at ${[...urls][0]}.supabase.co`);
