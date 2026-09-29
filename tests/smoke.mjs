/**
 * Smoke test: every route and every legal sub-tab must render without a
 * runtime error, with no backend configured.
 *
 * That last condition is the point. The app reads its data from Supabase, and
 * when it is unreachable every query falls back to an empty list — which is
 * exactly the state that used to crash two of the legal sub-tabs and blank the
 * rest. Running with no credentials keeps that path covered.
 *
 * Usage: npm run build && npm run test:smoke
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = Number(process.env.SMOKE_PORT ?? 4173);
const BASE = `http://127.0.0.1:${PORT}`;

const ROUTES = [
  '/',
  '/project_info',
  '/legal',
  '/construction',
  '/governance',
  '/finance',
  '/documents',
  '/communication',
];

/** Each legal sub-tab, matched by the visible label in either language. */
const LEGAL_TABS = {
  hearing_brief: /Duruşma Brifingi|Hearing Brief/i,
  bench_qa: /Hâkimler Heyeti|Bench Q/i,
  authorities: /İçtihat|Authorities/i,
  overview: /Temyiz Dosyası|Appeal File/i,
  grounds: /Temyiz İtirazları|Grounds of Appeal/i,
  action_plan: /Eylem Planı|Action Plan/i,
  who_is_who: /Kim Kimdir|Who is Who/i,
  timeline: /Dava Tarihçesi|Case History/i,
};

/** A page that rendered its shell has at least this much text. */
const MIN_TEXT = 200;

async function waitForServer(url, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await sleep(250);
  }
  throw new Error(`Preview server did not come up at ${url}`);
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1'], {
  stdio: 'ignore',
});

let browser;
let failures = 0;

const check = (ok, label, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

try {
  await waitForServer(BASE);
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  });
  const page = await browser.newPage();

  let pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  for (const route of ROUTES) {
    pageErrors = [];
    await page.goto(BASE + route, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const text = (await page.textContent('body'))?.trim() ?? '';
    check(
      pageErrors.length === 0 && text.length > MIN_TEXT,
      route.padEnd(16),
      `text=${text.length} errors=${pageErrors.length}${pageErrors[0] ? ` — ${pageErrors[0].slice(0, 120)}` : ''}`,
    );
  }

  await page.goto(BASE + '/legal', { waitUntil: 'networkidle' });
  for (const [tab, label] of Object.entries(LEGAL_TABS)) {
    pageErrors = [];
    await page.locator('button').filter({ hasText: label }).first().click();
    await page.waitForTimeout(300);
    const text = (await page.textContent('body'))?.trim() ?? '';
    check(
      pageErrors.length === 0 && text.length > MIN_TEXT,
      `/legal → ${tab}`.padEnd(16),
      `text=${text.length} errors=${pageErrors.length}${pageErrors[0] ? ` — ${pageErrors[0].slice(0, 120)}` : ''}`,
    );
  }

  // Cross-view links used to be relative, resolving under the current route
  // (/legal/documents) instead of to the sibling route.
  pageErrors = [];
  await page.goto(BASE + '/legal', { waitUntil: 'networkidle' });
  await page
    .locator('button')
    .filter({ hasText: /Belge Kasasını Aç|Access Vault|Tam Layihayı|Open Full Brief/ })
    .first()
    .click();
  await page.waitForTimeout(400);
  const path = new URL(page.url()).pathname;
  check(path === '/documents', 'in-app navigation', `→ ${path} (expected /documents)`);
} finally {
  await browser?.close();
  server.kill();
}

console.log(failures === 0 ? '\nAll smoke checks passed.' : `\n${failures} smoke check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
