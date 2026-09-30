/**
 * Smoke test: the sign-in gate holds, and once past it every route and every
 * legal sub-tab renders without a runtime error while the backend returns
 * nothing.
 *
 * That last condition is the point. Empty data is exactly the state that used
 * to crash two of the legal sub-tabs and blank the rest, so it stays covered.
 *
 * Supabase is intercepted rather than run: the app is built against a dummy
 * project and every call to it is answered here. There is deliberately no
 * bypass inside the application — a test-only way past the gate is a way past
 * the gate.
 *
 * Usage: npm run test:smoke
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = Number(process.env.SMOKE_PORT ?? 4173);
const BASE = `http://127.0.0.1:${PORT}`;

/**
 * Some environments ship a shared Chromium that does not match the revision
 * Playwright expects to download. Prefer an explicit override, then a shared
 * build if one is present, and otherwise let Playwright resolve its own.
 */
function resolveChromium() {
  const candidates = [process.env.PLAYWRIGHT_CHROMIUM_PATH, '/opt/pw-browsers/chromium'];
  return candidates.find((p) => p && existsSync(p));
}

/** The person the intercepted backend reports as signed in. */
const TEST_PROFILE = {
  id: '00000000-0000-0000-0000-0000000000aa',
  full_name: 'Smoke Test',
  email: 'smoke@example.test',
  role: 'project_director',
  organization: 'AUTK',
  clearance: 'restricted',
  is_active: true,
  expires_at: null,
};

/**
 * What public.current_authority() would answer for that person. The console
 * asks the database this rather than reading the profile row, because the row
 * says nothing about a delegation in force.
 */
const TEST_AUTHORITY = {
  role: 'project_director',
  roles: ['project_director'],
  clearance: 'restricted',
  isInternal: true,
  isAdmin: false,
  delegations: [],
};

/** The same question answered for someone outside the organisation. */
const EXTERNAL_AUTHORITY = {
  role: 'contractor',
  roles: ['contractor'],
  clearance: 'internal',
  isInternal: false,
  isAdmin: false,
  delegations: [],
};

/** One meeting, so the detail page renders rather than reporting it missing. */
const TEST_MEETING = {
  id: '00000000-0000-0000-0000-0000000000bb',
  title: 'Smoke meeting',
  held_at: '2026-09-01T10:00:00Z',
  location: 'Mombasa',
  kind: 'trustee',
  priority: 'normal',
  status: 'completed',
  minutes_status: 'draft',
  continues_meeting_id: null,
  confidentiality: 'internal',
  preparer: null,
  continues: null,
  meeting_attendees: [{ count: 0 }],
};

const ROUTES = [
  '/',
  '/project_info',
  '/legal',
  '/construction',
  '/governance',
  '/stakeholders',
  '/meetings',
  '/obligations',
  '/finance',
  '/documents',
  '/communication',
  '/admin',
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
  try {
    browser = await chromium.launch({ executablePath: resolveChromium() });
  } catch (error) {
    console.error(
      'Could not start Chromium. Install it with `npx playwright install chromium`, ' +
        'or point PLAYWRIGHT_CHROMIUM_PATH at an existing build.',
    );
    throw error;
  }
  const page = await browser.newPage();

  let pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  // --- the gate, before anything is signed in --------------------------------
  await page.route('**/rest/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.route('**/auth/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );

  await page.goto(BASE + '/legal', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const gateText = (await page.textContent('body')) ?? '';
  check(
    /Giriş yap|Sign in/.test(gateText) && !/Hukuk İşleri|Legal Affairs/.test(gateText),
    'signed-out visitor is stopped at sign-in',
  );

  // --- signed in -------------------------------------------------------------
  // Playwright tries the most recently registered handler first, so the
  // specific profiles route has to be added after the catch-all to win.
  await page.route('**/rest/v1/profiles**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEST_PROFILE),
    }),
  );

  /** Swaps who the intercepted backend says the caller is allowed to be. */
  const actAs = (authority) =>
    page.route('**/rest/v1/rpc/current_authority', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(authority),
      }),
    );

  await actAs(TEST_AUTHORITY);

  // Served as an object or an array depending on which call it is, the way
  // PostgREST answers .maybeSingle() and a plain select differently.
  await page.route('**/rest/v1/meetings**', (route) => {
    const single = route.request().url().includes('id=eq.');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(single ? TEST_MEETING : [TEST_MEETING]),
    });
  });

  // A session in storage is what supabase-js reads on start, so this puts the
  // app in the state it would be in after a real sign-in.
  await page.addInitScript((profile) => {
    const oneHour = Math.floor(Date.now() / 1000) + 3600;
    window.localStorage.setItem(
      'sb-smoke-auth-token',
      JSON.stringify({
        access_token: 'smoke-access-token',
        refresh_token: 'smoke-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: oneHour,
        user: { id: profile.id, email: profile.email, aud: 'authenticated', role: 'authenticated' },
      }),
    );
  }, TEST_PROFILE);

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

  // --- the meeting record ---------------------------------------------------
  // Every M3 record type renders at once here, so a shape mistake in any of
  // them shows up as a page error rather than as a quiet blank.
  pageErrors = [];
  await page.goto(BASE + `/meetings/${TEST_MEETING.id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const detail = (await page.textContent('body')) ?? '';
  check(
    pageErrors.length === 0 &&
      /Katılımcılar|Who was there/.test(detail) &&
      /Tutanak|The note/.test(detail) &&
      /Kararlar|Decisions/.test(detail) &&
      /Aksiyonlar|Actions/.test(detail) &&
      /Açık sorular|Open questions/.test(detail),
    '/meetings/:id  ',
    `errors=${pageErrors.length}${pageErrors[0] ? ` — ${pageErrors[0].slice(0, 120)}` : ''}`,
  );

  // --- the console offers only what the policies allow ----------------------
  // Its whole premise is that a control the database would refuse is never
  // drawn, so this is the assertion that matters most about it.
  pageErrors = [];
  await page.goto(BASE + '/admin', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const directorView = (await page.textContent('body')) ?? '';
  check(
    /Kapsam|Scope/.test(directorView) && /Olağanüstü yetki|Emergency delegation/.test(directorView),
    'director sees scope and delegation',
  );
  check(
    !/Kişi davet et|Invite someone/.test(directorView),
    'director is not offered the invite control',
    'inviting is an administrator’s to do',
  );
  check(/Denetim kaydı|Audit trail/.test(directorView), 'director can read the audit trail');

  // The register is the project's political map, so who may keep it is the
  // same question the console answers about everything else.
  pageErrors = [];
  await page.goto(BASE + '/stakeholders', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const directorRegister = (await page.textContent('body')) ?? '';
  check(/Paydaş ekle|Add a stakeholder/.test(directorRegister), 'director may keep the register');

  await actAs(EXTERNAL_AUTHORITY);
  pageErrors = [];
  await page.goto(BASE + '/stakeholders', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const contractorRegister = (await page.textContent('body')) ?? '';
  check(
    pageErrors.length === 0 && !/Paydaş ekle|Add a stakeholder/.test(contractorRegister),
    'an external party is not offered the register controls',
  );

  pageErrors = [];
  await page.goto(BASE + '/admin', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const contractorView = (await page.textContent('body')) ?? '';
  check(
    pageErrors.length === 0 && /Sizin erişiminiz|Your access/.test(contractorView),
    'an external party still sees their own access',
  );
  check(
    !/Olağanüstü yetki|Emergency delegation/.test(contractorView) &&
      !/Denetim kaydı|Audit trail/.test(contractorView) &&
      !/Kayda özel paylaşım|Sharing/.test(contractorView),
    'an external party is shown none of the administrative sections',
  );
  await actAs(TEST_AUTHORITY);

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
