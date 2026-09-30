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

/** One case file, so the legal record panels render rather than reporting none. */
const TEST_CASE = {
  id: '00000000-0000-0000-0000-0000000000cc',
  case_number: 'ELC/134/2013',
  title: 'Smoke case',
  court: 'ELC Mombasa',
  case_type: 'Land',
  current_status: 'Active',
  priority: 'high',
  risk_level: 'high',
  filing_date: '2013-01-01',
  next_hearing_date: null,
  description_en: null,
  description_tr: null,
  key_issues: [],
  documents_count: 0,
  confidentiality: 'internal',
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

/**
 * Two documents, because the distinction the vault exists to make is between
 * them: one whose stored bytes the server has read and digested, and one it
 * has not. A screen that showed them the same way would be the screen Faz 0
 * removed.
 */
const VERIFIED_DIGEST = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';

const TEST_DOCUMENTS = [
  {
    id: '00000000-0000-0000-0000-0000000000d1',
    title: 'Smoke deed',
    category: 'trust_deed',
    status: 'under_review',
    description_en: null,
    description_tr: null,
    confidentiality: 'internal',
    current_version_id: '00000000-0000-0000-0000-0000000000e1',
    versions: [{ count: 2 }],
  },
  {
    id: '00000000-0000-0000-0000-0000000000d2',
    title: 'Smoke contract',
    category: 'contract_mou',
    status: 'under_review',
    description_en: null,
    description_tr: null,
    confidentiality: 'internal',
    current_version_id: '00000000-0000-0000-0000-0000000000e2',
    versions: [{ count: 1 }],
  },
];

const TEST_VERSIONS = [
  {
    id: '00000000-0000-0000-0000-0000000000e1',
    document_id: '00000000-0000-0000-0000-0000000000d1',
    version_no: 2,
    storage_path: 'd1/e1',
    file_name: 'deed.pdf',
    content_type: 'application/pdf',
    byte_size: 24576,
    sha256: VERIFIED_DIGEST,
    digest_computed_at: '2026-09-01T10:05:00Z',
    uploaded_at: '2026-09-01T10:00:00Z',
    note: null,
    uploader: { full_name: 'Smoke Test' },
  },
  {
    // No digest: the server has not read these bytes back yet, or they never
    // arrived. Either way the screen has to say so.
    id: '00000000-0000-0000-0000-0000000000e2',
    document_id: '00000000-0000-0000-0000-0000000000d2',
    version_no: 1,
    storage_path: 'd2/e2',
    file_name: 'contract.pdf',
    content_type: 'application/pdf',
    byte_size: 8192,
    sha256: null,
    digest_computed_at: null,
    uploaded_at: '2026-09-02T09:00:00Z',
    note: null,
    uploader: { full_name: 'Smoke Test' },
  },
];

/**
 * One block with two tasks: one that somebody has evidenced, one that nobody
 * has. The pair is the whole point of the screen — a reported percentage and
 * an unreported one must not look the same.
 */
const TEST_BLOCK = {
  id: '00000000-0000-0000-0000-0000000000f1',
  code: 'A1',
  name: 'Smoke block',
  floors: 3,
  total_area_sqm: 2400,
  state: 'in_progress',
  purpose_en: null,
  purpose_tr: null,
  phase_id: null,
  started_on: '2026-01-10',
  target_completion: '2026-12-01',
  contractor_id: '00000000-0000-0000-0000-0000000000f2',
  confidentiality: 'internal',
  phase: null,
  engineer: { full_name: 'Smoke Test' },
  contractor: { name: 'Smoke Contracting' },
};

const TEST_BLOCK_PROGRESS = [
  {
    construction_block_id: TEST_BLOCK.id,
    code: 'A1',
    name: 'Smoke block',
    state: 'in_progress',
    confidentiality: 'internal',
    construction_tasks: 2,
    preservation_tasks: 1,
    tasks_with_evidence: 1,
    percent_complete: 45,
    last_reported_at: '2026-09-20T09:00:00Z',
    last_captured_at: '2026-09-18T09:00:00Z',
  },
  {
    // Nothing reported: this one must read as unknown, not as zero.
    construction_block_id: '00000000-0000-0000-0000-0000000000f9',
    code: 'B2',
    name: 'Unvisited block',
    state: 'planned',
    confidentiality: 'internal',
    construction_tasks: 1,
    preservation_tasks: 0,
    tasks_with_evidence: 0,
    percent_complete: null,
    last_reported_at: null,
    last_captured_at: null,
  },
];

const UNVISITED_BLOCK = {
  ...TEST_BLOCK,
  id: '00000000-0000-0000-0000-0000000000f9',
  code: 'B2',
  name: 'Unvisited block',
  state: 'planned',
  contractor: null,
  engineer: null,
};

/** A live prohibition reaching open work on the block (M7-06). */
const TEST_CONFLICT = {
  site_task_id: '00000000-0000-0000-0000-0000000000f5',
  task_title_en: 'Pour the raft',
  task_title_tr: null,
  task_state: 'in_progress',
  task_kind: 'construction',
  construction_block_id: TEST_BLOCK.id,
  obligation_id: '00000000-0000-0000-0000-0000000000f6',
  obligation_title_en: 'Do not interfere with the boundary',
  obligation_title_tr: null,
  obligation_source: 'court_order',
  source_legal_order_id: null,
  acknowledged: false,
};

/**
 * One transaction with a receipt and no audit, and one with neither. The
 * badge is the point: the old screen set it from a boolean with a default,
 * so it appeared on things nobody had audited.
 */
const TEST_TRANSACTIONS = [
  {
    id: '00000000-0000-0000-0000-0000000000a1',
    reference_no: 'PV-1001',
    date: '2026-09-01',
    category: 'civil_construction',
    description: 'Substructure, first claim',
    payee: 'Smoke Contracting',
    external_reference: null,
    amount: 2000000,
    currency: 'KES',
    fx_rate_to_kes: 1,
    amount_kes: 2000000,
    budget_line_id: null,
    payment_voucher_id: null,
    document_id: '00000000-0000-0000-0000-0000000000d1',
    verified: true,
    audited_at: null,
    audit_note: null,
    confidentiality: 'internal',
    auditor: null,
  },
  {
    id: '00000000-0000-0000-0000-0000000000a2',
    reference_no: 'PV-1002',
    date: '2026-09-10',
    category: 'legal_defence',
    description: 'Counsel fees',
    payee: 'Smoke Advocates',
    external_reference: null,
    amount: 20000,
    currency: 'USD',
    fx_rate_to_kes: 130,
    amount_kes: 2600000,
    budget_line_id: null,
    payment_voucher_id: null,
    // No document, so it reads as unverified whatever anybody would prefer.
    document_id: null,
    verified: false,
    audited_at: null,
    audit_note: null,
    confidentiality: 'internal',
    auditor: null,
  },
];

/** Pledged, received and the gap between them, never added together. */
const TEST_DONATIONS = [
  {
    donation_id: '00000000-0000-0000-0000-0000000000b1',
    donor_name: 'A Turkish foundation',
    donor_stakeholder_id: null,
    pledged_on: '2026-06-01',
    state: 'partly_received',
    pledged_currency: 'TRY',
    pledged_amount: 1000000,
    pledged_amount_kes: 4000000,
    received_kes: 1200000,
    outstanding_kes: 2800000,
    tranche_count: 1,
    unevidenced_tranches: 0,
    confidentiality: 'internal',
  },
];

const ROUTES = [
  '/',
  '/project_info',
  '/legal',
  '/construction',
  '/governance',
  '/stakeholders',
  '/meetings',
  '/obligations',
  '/calendar',
  '/finance',
  '/documents',
  '/communication',
  '/admin',
];

/** Each legal sub-tab, matched by the visible label in either language. */
const LEGAL_TABS = {
  hearings: /^Duruşmalar$|^Hearings$/i,
  filings: /Layiha ve Süreler|Filings & Deadlines/i,
  orders: /Mahkeme Kararları|Court Orders/i,
  evidence: /Deliller ve Zincir|Evidence & Custody/i,
  counsel: /Avukatlar ve Görüşler|Counsel & Opinions/i,
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

  await page.route('**/rest/v1/legal_cases**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([TEST_CASE]),
    }),
  );

  await page.route('**/rest/v1/financial_transactions**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEST_TRANSACTIONS),
    }),
  );

  await page.route('**/rest/v1/donation_position**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEST_DONATIONS),
    }),
  );

  await page.route('**/rest/v1/construction_blocks**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([TEST_BLOCK, UNVISITED_BLOCK]),
    }),
  );

  await page.route('**/rest/v1/block_progress**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEST_BLOCK_PROGRESS),
    }),
  );

  await page.route('**/rest/v1/site_task_conflicts**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([TEST_CONFLICT]),
    }),
  );

  await page.route('**/rest/v1/document_vault**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEST_DOCUMENTS),
    }),
  );

  await page.route('**/rest/v1/document_versions**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEST_VERSIONS),
    }),
  );

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

  // --- the legal record ------------------------------------------------------
  // M5-16 decides who may write on a file. A director keeps it; somebody
  // outside the organisation who is not counsel gets the record read-only.
  pageErrors = [];
  await page.goto(BASE + '/legal', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page
    .locator('button')
    .filter({ hasText: /^Duruşmalar$|^Hearings$/i })
    .first()
    .click();
  await page.waitForTimeout(300);
  const directorLegal = (await page.textContent('body')) ?? '';
  check(
    pageErrors.length === 0 && /Duruşma ekle|Add/.test(directorLegal),
    'director may keep the legal record',
  );

  await actAs(EXTERNAL_AUTHORITY);
  pageErrors = [];
  await page.goto(BASE + '/legal', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page
    .locator('button')
    .filter({ hasText: /^Duruşmalar$|^Hearings$/i })
    .first()
    .click();
  await page.waitForTimeout(300);
  const contractorLegal = (await page.textContent('body')) ?? '';
  check(
    pageErrors.length === 0 && !/Duruşma ekle/.test(contractorLegal),
    'somebody outside who is not counsel gets it read-only',
  );
  await actAs(TEST_AUTHORITY);

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

  // --- the vault says which files it has actually read ----------------------
  // The old screen printed "SHA-256 verified" over a page where no file could
  // exist. These three checks are the inverse of that: a digest appears only
  // for the version the server has read, the one it has not is named as
  // unverified rather than left blank, and the page counts them.
  pageErrors = [];
  await page.goto(BASE + '/documents', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const vaultView = (await page.textContent('body')) ?? '';
  check(
    pageErrors.length === 0 && vaultView.includes(VERIFIED_DIGEST.slice(0, 8)),
    'a verified version shows the digest the server computed',
  );
  check(
    /doğrulanmadı|unverified/.test(vaultView),
    'and one with no digest is named unverified rather than shown as clean',
  );
  check(
    /1 belgenin geçerli sürümü doğrulanmamış|1 documents have an unverified current version/.test(
      vaultView,
    ),
    'with the count stated where it cannot be missed',
  );
  check(/Belge ekle|Add a document/.test(vaultView), 'a director may put documents in the vault');

  // M9 write access follows app.can_write, which does not include somebody
  // outside the organisation — so the control is not drawn for them either.
  await actAs(EXTERNAL_AUTHORITY);
  pageErrors = [];
  await page.goto(BASE + '/documents', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const contractorVault = (await page.textContent('body')) ?? '';
  check(
    pageErrors.length === 0 && !/Belge ekle|Add a document/.test(contractorVault),
    'an external party is not offered the upload control',
  );
  await actAs(TEST_AUTHORITY);

  // --- the site says what it knows and what it does not ---------------------
  // The module this replaces put a typed percentage on every block. These
  // three checks are the inverse: a computed figure where there is evidence,
  // a named absence where there is none, and the court order above both.
  pageErrors = [];
  await page.goto(BASE + '/construction', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const siteView = (await page.textContent('body')) ?? '';
  check(
    pageErrors.length === 0 && /45%/.test(siteView),
    'a block with evidence shows the computed figure',
  );
  check(
    /raporlanmadı|not reported/.test(siteView),
    'and one nobody has reported on says so rather than showing nought',
  );
  check(
    /Do not interfere with the boundary/.test(siteView) &&
      /yasağın kapsamında|live prohibition/.test(siteView),
    'open work under a court order is surfaced above the progress',
  );

  await actAs(EXTERNAL_AUTHORITY);
  pageErrors = [];
  await page.goto(BASE + '/construction', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const contractorSite = (await page.textContent('body')) ?? '';
  check(
    pageErrors.length === 0 && !/Görev ekle|Add a task/.test(contractorSite),
    'an outside firm is not offered the planning controls',
  );
  await actAs(TEST_AUTHORITY);

  // --- money says what is backed and what is only claimed -------------------
  // Three of the things Faz 0 took the words off lived on this screen.
  pageErrors = [];
  await page.goto(BASE + '/finance', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page
    .locator('button')
    .filter({ hasText: /^Kasa defteri$|^Ledger$/ })
    .first()
    .click();
  await page.waitForTimeout(400);
  const ledgerView = (await page.textContent('body')) ?? '';
  check(
    pageErrors.length === 0 && /denetlenmedi|not audited/.test(ledgerView),
    'nothing is audited until an auditor says so',
  );
  // Counted rather than searched for: the page legitimately explains the word
  // "audited" in its subtitle, so asserting the word is absent would be a
  // test about the prose. Both fixtures carry no audit, so both rows say so.
  check(
    (ledgerView.match(/denetlenmedi|not audited/g) ?? []).length === TEST_TRANSACTIONS.length,
    'and every row says so, because none of the data carries a badge',
  );
  check(
    /belgesiz|no document/.test(ledgerView),
    'a transaction with nothing attached is named as such',
  );
  check(
    // Recorded in dollars, shown in dollars, with the base figure beside it.
    /\$ 20,000/.test(ledgerView) && /KShs 2,600,000/.test(ledgerView),
    'an amount keeps the currency it was recorded in, and shows the base too',
  );

  // A director may keep the ledger; awarding the badge is not theirs.
  check(
    /İşlem kaydet|Record a transaction/.test(ledgerView),
    'a director may record a transaction',
  );
  check(
    !/Denetledim|Mark audited/.test(ledgerView),
    'but is not offered the control that marks one audited',
  );

  pageErrors = [];
  await page
    .locator('button')
    .filter({ hasText: /^Bağışlar$|^Donations$/ })
    .first()
    .click();
  await page.waitForTimeout(400);
  const donationView = (await page.textContent('body')) ?? '';
  check(
    pageErrors.length === 0 &&
      /KShs 4,000,000/.test(donationView) &&
      /KShs 1,200,000/.test(donationView) &&
      /KShs 2,800,000/.test(donationView),
    'a pledge, what arrived and the gap are three separate figures',
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
  // (/legal/documents) instead of to the sibling route. The link lives on the
  // appeal-file tab, which is no longer the one /legal opens on.
  pageErrors = [];
  await page.goto(BASE + '/legal', { waitUntil: 'networkidle' });
  await page
    .locator('button')
    .filter({ hasText: /Temyiz Dosyası|Appeal File/ })
    .first()
    .click();
  await page.waitForTimeout(400);
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
