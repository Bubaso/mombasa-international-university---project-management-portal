/**
 * Design test: measures the first-wave criteria of
 * docs/TASARIM-GEREKSINIMLERI.md on a real signed-in build, at phone and
 * desktop width, and fails if any of them regress.
 *
 * Why a measurement and not a reviewer's eye: every acceptance criterion in
 * that document is of the form "measurable in a browser". Whether text got
 * bigger is not a matter of opinion, and a class name is not the measurement
 * — `text-xs` is however many pixels Tailwind was told it is, so what gets
 * read here is computed style and real layout rectangles.
 *
 * It is NOT part of `npm run verify`: it needs the live project and a real
 * password, which the gate cannot have. Run it deliberately:
 *
 *   npm run build
 *   DESIGN_EMAIL=… DESIGN_PASSWORD=… npm run test:design
 *
 * It writes the full per-route detail to design-measurement.json so a
 * regression can be read rather than guessed at.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const LABEL = process.argv[2] ?? 'design-measurement';
// Not 4190: that is on the fetch specification's blocked-port list
// (ManageSieve), so `curl` reaches a server there and `fetch` refuses it,
// which reads exactly like a server that never started.
const PORT = Number(process.env.DESIGN_PORT ?? 4191);
const BASE = `http://127.0.0.1:${PORT}`;
const EMAIL = process.env.DESIGN_EMAIL ?? process.env.MEASURE_EMAIL;
const PASSWORD = process.env.DESIGN_PASSWORD ?? process.env.MEASURE_PASSWORD;

/**
 * Every route, or the few you are iterating on.
 *
 * A full sweep is 38 page loads against the live project and takes minutes.
 * While chasing one offender that is waste: `DESIGN_ROUTES=/legal,/readiness`
 * measures those two in seconds. The full list is what runs before a commit,
 * because a fix on one route is routinely a regression on another.
 */
const ALL_ROUTES = [
  '/',
  '/project_info',
  '/legal',
  '/construction',
  '/governance',
  '/readiness',
  '/plan',
  '/reports',
  '/procurement',
  '/finance',
  '/documents',
  '/stakeholders',
  '/calendar',
  '/obligations',
  '/risks',
  '/meetings',
  '/communication',
  '/assistant',
  '/admin',
];

const ROUTES = process.env.DESIGN_ROUTES
  ? process.env.DESIGN_ROUTES.split(',').map((r) => r.trim())
  : ALL_ROUTES;
const PARTIAL = ROUTES.length !== ALL_ROUTES.length;

const WIDTHS = [
  { name: 'phone', width: 390, height: 844, mobile: true },
  { name: 'desktop', width: 1440, height: 900, mobile: false },
];

function resolveChromium() {
  return [process.env.PLAYWRIGHT_CHROMIUM_PATH, '/opt/pw-browsers/chromium'].find(
    (p) => p && existsSync(p),
  );
}

async function launchChromium() {
  const executablePath = resolveChromium();
  if (executablePath) return chromium.launch({ executablePath });
  try {
    return await chromium.launch({ channel: 'chromium' });
  } catch {
    return chromium.launch();
  }
}

async function refuseAStrangerOnThePort(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    if (res.ok) throw new Error(`STRANGER: something already serves ${url}`);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('STRANGER')) throw e;
  }
}

async function waitForServer(url, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error(`server never came up at ${url}`);
}

/**
 * What the page measures about itself.
 *
 * Runs in the browser, so everything here is computed style and real layout
 * rectangles — not class names, which is the whole point: `text-xs` means a
 * different number of pixels depending on what Tailwind was told.
 */
const PROBE = () => {
  const vw = window.innerWidth;

  /** Elements whose own text is theirs, not inherited from a child. */
  const ownsText = (el) =>
    Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);

  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const all = Array.from(document.querySelectorAll('body *'));

  // ---- text below 12px -------------------------------------------------
  const smallText = [];
  for (const el of all) {
    if (!ownsText(el) || !visible(el)) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < 12) {
      smallText.push({
        px: Math.round(size * 10) / 10,
        tag: el.tagName.toLowerCase(),
        text: el.textContent.trim().slice(0, 40),
      });
    }
  }

  // ---- tap targets below 44px -----------------------------------------
  // Checkboxes and radios are exempt: the control is 16px by convention and
  // the label beside it is the target, so measuring the box would report a
  // fault that is not one.
  const TARGETS = 'button, [role="button"], a[href], select, textarea, summary, input';
  const EXEMPT = new Set(['checkbox', 'radio', 'hidden']);
  const smallTargets = [];
  for (const el of document.querySelectorAll(TARGETS)) {
    if (el.tagName === 'INPUT' && EXEMPT.has(el.type)) continue;
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 44) {
      smallTargets.push({
        h: Math.round(r.height * 10) / 10,
        w: Math.round(r.width * 10) / 10,
        tag: el.tagName.toLowerCase(),
        label: (el.getAttribute('aria-label') || el.textContent.trim()).slice(0, 40),
      });
    }
  }

  // ---- horizontal overflow --------------------------------------------
  // Two separate facts. The page rocking sideways is a defect. A register
  // that scrolls inside its own scroller is a deliberate affordance, so it
  // is counted apart rather than lumped in.
  const doc = document.documentElement;
  const main = document.querySelector('main');
  // `main` carries `overflow-y-auto`, and CSS turns an `overflow-x: visible`
  // into `auto` as soon as the other axis scrolls. So the content area became
  // a horizontal scroller nobody asked for, and it ABSORBED the overflow:
  // the document stopped growing, and a first version of this probe — which
  // skipped anything inside a scrolling ancestor — reported zero while /legal
  // was 8px over and /readiness 28px. A number that only looks right is worse
  // than a number that is wrong. `main` is counted as the page, not as an
  // affordance, and only elements inside a scroller SOMEBODY CHOSE are exempt.
  const mainOverflow = main ? Math.max(0, main.scrollWidth - main.clientWidth) : 0;
  const pageOverflow = Math.max(0, doc.scrollWidth - doc.clientWidth, mainOverflow);

  const past = [];
  for (const el of all) {
    if (!visible(el)) continue;
    // Inside something that scrolls on purpose? Then this is not page overflow.
    let inScroller = false;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (p.tagName === 'MAIN') continue; // the page itself, see above
      const ov = getComputedStyle(p).overflowX;
      if ((ov === 'auto' || ov === 'scroll') && p.scrollWidth > p.clientWidth + 1) {
        inScroller = true;
        break;
      }
    }
    if (inScroller) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 && r.width <= vw + 1) {
      past.push({
        over: Math.round((r.right - vw) * 10) / 10,
        tag: el.tagName.toLowerCase(),
        cls: String(el.className).slice(0, 60),
      });
    }
  }

  const scrollers = Array.from(document.querySelectorAll('*'))
    .filter((el) => {
      if (el.tagName === 'MAIN') return false; // counted as page overflow instead
      const ov = getComputedStyle(el).overflowX;
      return (ov === 'auto' || ov === 'scroll') && el.scrollWidth > el.clientWidth + 1;
    })
    .map((el) => ({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 70) }));

  // ---- registers: table or cards? -------------------------------------
  // A register is "cards" when the ROW is the card: `tr` goes to block and
  // takes the border, while the cell inside stays flex so the heading sits
  // left of its value. Reading `display` off the CELL was the first version
  // of this check, and it reported 0 of 3 stacked while the screen plainly
  // showed cards. The cell is flex by design; the row is the card.
  const registers = Array.from(document.querySelectorAll('table.register')).map((t) => {
    const head = t.querySelector('thead');
    const row = t.querySelector('tbody tr');
    const cell = t.querySelector('tbody td:not([colspan])');
    const label = cell ? getComputedStyle(cell, '::before').content : 'none';
    return {
      rows: t.querySelectorAll('tbody tr').length,
      headVisible: head ? visible(head) : false,
      stacked: row ? getComputedStyle(row).display === 'block' : null,
      labelled: !!label && !['none', 'normal', '""', "''"].includes(label),
      scrolls: t.parentElement.scrollWidth > t.parentElement.clientWidth + 1,
    };
  });

  // ---- navigation: labels whole, strips not scrolling (T1-02, T1-08) ----
  //
  // Truncation is measured, not guessed from the class list: an element is
  // truncated when its text is wider than the box it sits in. Five sidebar
  // labels used to be, at every width, and `truncate` meant the screen said
  // nothing about it — the end of the word simply was not there.
  const navLabels = [];
  for (const el of document.querySelectorAll('nav button span, nav a span')) {
    if (!visible(el)) continue;
    const text = el.textContent?.trim() ?? '';
    if (!text) continue;
    if (el.scrollWidth > el.clientWidth + 1) {
      navLabels.push({ text: text.slice(0, 40), scroll: el.scrollWidth, client: el.clientWidth });
    }
  }

  // Any strip of choices: the tab lists on a screen and the nav itself. A
  // strip that scrolls hides options with nothing saying they are there.
  const strips = [];
  for (const el of document.querySelectorAll(
    '[role="tablist"], [aria-label*="sekme"], [aria-label*="bölüm"]',
  )) {
    if (!visible(el)) continue;
    strips.push({
      label: el.getAttribute('aria-label') ?? '',
      scrolls: el.scrollWidth > el.clientWidth + 1,
      options: el.querySelectorAll('button, a').length,
    });
  }

  // Which routes this width can actually reach, for T1-05. On a phone the
  // menu sheet has to be open for its links to be in the document, so the
  // caller opens it before reading this.
  const reachable = [
    ...new Set(
      Array.from(document.querySelectorAll('nav button, nav a'))
        .filter(visible)
        .map((el) => el.getAttribute('data-path') ?? '')
        .filter(Boolean),
    ),
  ];

  // ---- what the first screenful is spent on (T6-01, T6-04, T10-08) ----
  const VH = window.innerHeight;
  const mainTop = main ? main.getBoundingClientRect().top : 0;

  /** Every text-bearing element, so the caller can sort data from prose. */
  const texts = [];
  if (main) {
    for (const el of main.querySelectorAll('p, td, li, h1, h2, h3, h4, span, div')) {
      if (!visible(el)) continue;
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent)
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
      if (own.length < 25) continue;
      const b = el.getBoundingClientRect();
      texts.push({ y: Math.round(b.top - mainTop), h: Math.round(b.height), text: own });
    }
    texts.sort((a, b) => a.y - b.y);
  }

  /** Rows actually on screen: a route with none cannot show one. */
  const registerRows = main
    ? Array.from(main.querySelectorAll('table.register tbody tr')).filter(visible).length
    : 0;

  /** Collapsed explanations, and whether each can be opened. */
  const explains = main
    ? Array.from(main.querySelectorAll('[data-explain]'))
        .filter(visible)
        .map((el) => ({
          id: el.getAttribute('data-explain'),
          open: el.getAttribute('data-open') === 'yes',
          h: Math.round(el.getBoundingClientRect().height),
          hasControl: !!el.querySelector('button[aria-expanded]'),
        }))
    : [];

  /** The dashboard's opening figures. */
  const firstLook = main
    ? Array.from(main.querySelectorAll('[data-first-look] button'))
        .filter(visible)
        .filter((el) => el.getBoundingClientRect().top - mainTop < VH).length
    : 0;

  return {
    smallText,
    smallTargets,
    pageOverflow,
    past,
    scrollers,
    registers,
    navLabels,
    strips,
    reachable,
    texts,
    registerRows,
    explains,
    firstLook,
    viewportHeight: VH,
  };
};

/**
 * Relays the browser's Supabase calls through Node.
 *
 * The container's outbound HTTPS is re-terminated by an agent proxy, and
 * Chromium does not read that proxy's CA, so every call to the project from
 * inside the page fails ERR_CERT_AUTHORITY_INVALID. Node does trust it. So
 * the request is made here instead and the answer handed back — the
 * certificate is still verified, just by the runtime that can verify it.
 * Nothing is skipped and no flag disables a check.
 */
async function relaySupabaseThroughNode(context) {
  await context.route('**://*.supabase.co/**', async (route) => {
    const request = route.request();
    const headers = { ...request.headers() };
    // Set by the relay itself, or meaningless once the body is decoded here.
    for (const k of ['host', 'connection', 'content-length', 'accept-encoding']) delete headers[k];
    try {
      const res = await fetch(request.url(), {
        method: request.method(),
        headers,
        body: request.postDataBuffer() ?? undefined,
        redirect: 'manual',
      });
      const body = Buffer.from(await res.arrayBuffer());
      const out = {};
      res.headers.forEach((v, k) => {
        // Let Playwright frame the response; a stale encoding header would
        // describe a body that has already been decoded.
        if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(k)) out[k] = v;
      });
      await route.fulfill({ status: res.status, headers: out, body });
    } catch (error) {
      await route.abort('failed');
      console.warn(`  relay failed: ${request.url().slice(0, 80)} — ${error.message}`);
    }
  });
}

if (!EMAIL || !PASSWORD) {
  console.error(
    'DESIGN_EMAIL and DESIGN_PASSWORD are needed: these criteria are measured on\n' +
      'screens with records on them, which means signing in to the real project.\n' +
      'Exiting non-zero rather than reporting a pass nothing was checked for.',
  );
  process.exit(1);
}

if (!existsSync(new URL('../dist/index.html', import.meta.url))) {
  console.error('No dist/ to measure. Run `npm run build` first.');
  process.exit(1);
}

/**
 * Every string the application was built with.
 *
 * This is how explanation is told apart from data, and it is not a nicety:
 * the first version of this measurement counted any paragraph over ninety
 * characters as prose, which on the plan screen meant counting the chronology
 * — "Signed by Mr. Mwaeli, Minister of Education…" — as something to hide.
 * Acting on that number would have buried the records the screen exists for.
 *
 * An explanation is written into the source, so it is in the bundle. A record
 * arrives from the project at runtime, so it is not. Nothing else about the
 * two is reliably different.
 */
const BUNDLE = readdirSync(new URL('../dist/assets', import.meta.url))
  .filter((f) => f.endsWith('.js'))
  .map((f) => readFileSync(new URL(`../dist/assets/${f}`, import.meta.url), 'utf8'))
  .join('\n');

/** Was this sentence written into the application, or read from the project? */
const isExplanation = (text) => {
  // A middle slice, because the DOM collapses whitespace and may join a
  // bilingual pair that the source keeps apart.
  const probe = text.replace(/\s+/g, ' ').trim().slice(10, 50);
  return probe.length > 20 && BUNDLE.includes(probe);
};

await refuseAStrangerOnThePort(BASE);

const server = spawn(
  'npx',
  ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--outDir', 'dist'],
  { stdio: 'ignore', detached: true },
);
const down = () => {
  try {
    process.kill(-server.pid);
  } catch {
    /* already gone */
  }
};
process.on('exit', down);
process.on('SIGTERM', () => {
  down();
  process.exit(1);
});

const report = { label: LABEL, widths: {} };

try {
  await waitForServer(BASE);
  const browser = await launchChromium();

  for (const w of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width: w.width, height: w.height },
      isMobile: w.mobile,
      hasTouch: w.mobile,
      deviceScaleFactor: w.mobile ? 3 : 1,
    });
    await relaySupabaseThroughNode(context);
    const page = await context.newPage();

    // Sign in once per context.
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[type="email"]', { timeout: 20000 });
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForSelector('input[type="email"]', { state: 'detached', timeout: 30000 });

    const routes = {};
    for (const route of ROUTES) {
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
      // Let the queries settle: the tables are what we came to measure.
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
      await sleep(900);
      const m = await page.evaluate(PROBE);
      routes[route] = m;
      const flag = [
        m.pageOverflow > 0 ? `overflow ${m.pageOverflow}px` : '',
        w.mobile && m.smallTargets.length ? `${m.smallTargets.length} small targets` : '',
        m.smallText.length ? `${m.smallText.length} small text` : '',
      ]
        .filter(Boolean)
        .join(', ');
      console.log(`  ${w.name} ${route.padEnd(15)} ${flag || 'clean'}`);
    }
    // T6-02, by doing it rather than by inspecting classes: open one
    // explanation and see that more text is there afterwards. A collapsed
    // paragraph that cannot be opened would pass every height check in this
    // file and still have lost what it was hiding.
    if (w.mobile) {
      await page.goto(BASE + '/plan', { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
      await sleep(700);
      const block = page.locator('[data-explain]').first();
      if ((await block.count()) > 0) {
        const before = (await block.innerText()).length;
        const beforeH = (await block.boundingBox())?.height ?? 0;
        await block.locator('button[aria-expanded]').click();
        await sleep(350);
        const after = (await block.innerText()).length;
        const afterH = (await block.boundingBox())?.height ?? 0;
        report.opened = { before, after, beforeH: Math.round(beforeH), afterH: Math.round(afterH) };
      }
    }

    // What a phone can reach (T1-05). The sheet has to be open for its links
    // to be in the document, so it is opened deliberately rather than hoped
    // for: six routes used to be in neither this sheet nor the bottom bar,
    // and a probe that only read the closed bar would have called that fine.
    if (w.mobile) {
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
      await sleep(600);
      const menu = page.locator('nav button').filter({ hasText: /^(Menü|More)$/ });
      await menu.first().click();
      await sleep(600);
      report.menu = await page.evaluate(PROBE);
      console.log(`  phone menu reaches ${report.menu.reachable.length} routes`);
    }

    report.widths[w.name] = routes;
    await context.close();
  }

  await browser.close();
} finally {
  down();
}

const out = new URL(`./${LABEL}.json`, import.meta.url);
writeFileSync(out, JSON.stringify(report, null, 1));

// ---------------------------------------------------------------------------
// The criteria, as assertions.
//
// Each number below is the acceptance criterion of a numbered requirement, so
// a regression names the requirement it broke rather than just a count.
// ---------------------------------------------------------------------------
let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

console.log('');

const totals = {};
for (const [name, routes] of Object.entries(report.widths)) {
  const rs = Object.entries(routes);
  const sum = (f) => rs.reduce((a, [, r]) => a + f(r), 0);
  totals[name] = {
    smallText: sum((r) => r.smallText.length),
    smallTargets: sum((r) => r.smallTargets.length),
    overflowing: rs.filter(([, r]) => r.pageOverflow > 0),
    past: sum((r) => r.past.length),
    scrollers: sum((r) => r.scrollers.length),
    registers: sum((r) => r.registers.length),
    stacked: sum((r) => r.registers.filter((t) => t.stacked).length),
    labelled: sum((r) => r.registers.filter((t) => t.labelled).length),
    headVisible: sum((r) => r.registers.filter((t) => t.headVisible).length),
    registerScrolls: sum((r) => r.registers.filter((t) => t.scrolls).length),
    registerRows: sum((r) => r.registers.reduce((a, t) => a + t.rows, 0)),
    truncated: rs.flatMap(([route, r]) => r.navLabels.map((l) => `${route} "${l.text}"`)),
    scrollingStrips: rs.flatMap(([route, r]) =>
      r.strips.filter((t) => t.scrolls).map((t) => `${route} ${t.label || 'tablist'}`),
    ),
    crowdedStrips: rs.flatMap(([route, r]) =>
      r.strips
        .filter((t) => t.options > 6)
        .map((t) => `${route} ${t.label || 'tablist'} (${t.options})`),
    ),
    strips: sum((r) => r.strips.length),
  };
}

const phone = totals.phone;
const desktop = totals.desktop;

// T3-01: nothing below 12px, at either width. The portal used to run to 9px.
check(phone.smallText === 0, 'T3-01 no text under 12px on a phone', `${phone.smallText} found`);
check(
  desktop.smallText === 0,
  'T3-01 nor on a desktop — the floor is the floor at both widths',
  `${desktop.smallText} found`,
);

// T4-01: every tap target 44px on a phone. Deliberately NOT asserted for
// desktop: a mouse is precise, and forcing 44px there would make a dense
// register taller for nobody's benefit, so `md:min-h-8` is intended and the
// desktop count is reported rather than failed on.
check(
  phone.smallTargets === 0,
  'T4-01 every tap target reaches 44px on a phone',
  `${phone.smallTargets} under`,
);
console.log(
  `     (desktop keeps ${desktop.smallTargets} controls under 44px on purpose — md:min-h-8)`,
);

// T2-01: no route rocks sideways. `main` counts as the page here, not as an
// affordance; see the note in the probe for why that distinction mattered.
check(
  phone.overflowing.length === 0,
  'T2-01 no route overflows horizontally on a phone',
  phone.overflowing.map(([r, m]) => `${r} +${m.pageOverflow}px`).join(', '),
);
check(
  desktop.overflowing.length === 0,
  'T2-01 nor on a desktop',
  desktop.overflowing.map(([r, m]) => `${r} +${m.pageOverflow}px`).join(', '),
);
check(phone.past === 0, 'T2-01 nothing is laid out past the right edge', `${phone.past} elements`);

// T5-01: a register becomes labelled cards on a phone rather than a table
// that scrolls. Asserted only where a register actually rendered — with no
// rows on screen there is nothing to stack, and a pass on an empty screen is
// the kind of pass this repository has been bitten by before.
if (phone.registers > 0) {
  check(
    phone.stacked === phone.registers,
    'T5-01 every register on a phone stacks into cards',
    `${phone.stacked}/${phone.registers}`,
  );
  check(
    phone.labelled === phone.registers,
    'T5-01 and each cell carries its column heading',
    `${phone.labelled}/${phone.registers}`,
  );
  check(
    phone.headVisible === 0,
    'T5-01 with the header row gone, because the labels have replaced it',
    `${phone.headVisible} still showing`,
  );
  check(
    phone.registerScrolls === 0,
    'T5-01 and no register scrolls sideways any more',
    `${phone.registerScrolls} scrolling`,
  );
} else {
  check(false, 'T5-01 could not be measured: no register rendered on any route');
}
if (desktop.registers > 0) {
  check(
    desktop.stacked === 0,
    'T5-01 while a desktop keeps the table — cards there would waste the width',
    `${desktop.stacked} stacked`,
  );
  check(
    desktop.headVisible === desktop.registers,
    'T5-01 and keeps its headings in the header row',
    `${desktop.headVisible}/${desktop.registers}`,
  );
}

// T1-02: a label whose text is wider than its box is a label with its end
// missing. Measured, not inferred from a class name.
check(
  phone.truncated.length === 0,
  'T1-02 no navigation label is truncated on a phone',
  phone.truncated.slice(0, 3).join(', '),
);
check(
  desktop.truncated.length === 0,
  'T1-02 nor on a desktop, where the sidebar is',
  desktop.truncated.slice(0, 3).join(', '),
);

// T1-08: no strip of choices scrolls sideways, at either width.
check(
  phone.scrollingStrips.length === 0,
  'T1-08 no tab strip scrolls sideways on a phone',
  phone.scrollingStrips.slice(0, 3).join(', '),
);
check(
  desktop.scrollingStrips.length === 0,
  'T1-08 nor on a desktop',
  desktop.scrollingStrips.slice(0, 3).join(', '),
);

// T1-07: never more than six choices in one strip.
check(
  phone.crowdedStrips.length === 0 && desktop.crowdedStrips.length === 0,
  'T1-07 no strip offers more than six choices at once',
  [...phone.crowdedStrips, ...desktop.crowdedStrips].slice(0, 3).join(', '),
);

// T1-05: every route in the sidebar is reachable from the phone's menu.
if (report.menu) {
  const onPhone = new Set(report.menu.reachable);
  const unreachable = ROUTES.filter((r) => !onPhone.has(r));
  check(
    PARTIAL || onPhone.size >= 19,
    'T1-05 the phone menu reaches every route',
    `${onPhone.size} reachable`,
  );
  check(
    unreachable.length === 0,
    'T1-05 and none of the measured routes is missing from it',
    unreachable.join(', '),
  );
} else {
  check(false, 'T1-05 could not be measured: the phone menu never opened');
}

// ---------------------------------------------------------------------------
// T6 — the records, not the reasoning, are what a screen opens with
// ---------------------------------------------------------------------------
//
// Two amendments to the requirements as written, both forced by measurement
// and both recorded in docs/TASARIM-GEREKSINIMLERI.md:
//
//   T6-01 asked for a data row in the first screenful on every route. On a
//   route whose registers are empty there is no row to show, and the only way
//   to make one appear sooner would be to hide the empty-state sentences
//   saying WHY it is empty — which T5-05 exists to protect. So the rule
//   applies where there is data, and a route with none is held to the other
//   half of the same intent: the first screenful must say what is missing.
//
//   T6-03 asked for an unread explanation to default to open. That would put
//   the data back off the screen in any browser that cannot keep a
//   preference — a private window, cleared site data — so collapsed is the
//   default and storage remembers only what a reader chose to keep open.
//   Nothing is lost: the full text is one tap away either way.
const phoneRoutes = Object.entries(report.widths.phone ?? {});
const withData = phoneRoutes.filter(([, m]) => m.registerRows > 0);

/** The first thing on this route that came from the project, not the source. */
const firstDataY = (m) => {
  for (const t of m.texts) if (!isExplanation(t.text)) return t.y;
  return null;
};
/** Does the opening screen say what is missing? */
const saysWhatIsMissing = (m) =>
  m.texts.some((t) => t.y < m.viewportHeight && isExplanation(t.text) && t.text.length > 40);

const lateData = withData.filter(([, m]) => {
  const y = firstDataY(m);
  return y === null || y >= m.viewportHeight;
});
check(
  lateData.length === 0,
  'T6-01 every route with register rows shows one in the first screenful',
  lateData.map(([r, m]) => `${r} @${firstDataY(m) ?? 'none'}px`).join(', ') ||
    `${withData.length} of ${phoneRoutes.length} routes have rows on load today`,
);

// `registerRows` counts rows in a register table, which is not the same as
// "has data": the dashboard's figures, the legal case strip and the plan's
// chronology are all records in another shape. So the guarantee that holds
// for EVERY route is the weaker and more useful one — the first screenful is
// never blank and never pure preamble. It either shows something from the
// project or says what is missing.
const openingBlind = phoneRoutes.filter(([, m]) => {
  const y = firstDataY(m);
  if (y !== null && y < m.viewportHeight) return false; // opens on data
  return !saysWhatIsMissing(m); // otherwise it must say why not
});
check(
  openingBlind.length === 0,
  'T6-01 no route opens on neither data nor an explanation of its absence',
  openingBlind.map(([r]) => r).join(', ') || `${phoneRoutes.length} routes`,
);

const onData = phoneRoutes.filter(([, m]) => {
  const y = firstDataY(m);
  return y !== null && y < m.viewportHeight;
});
console.log(
  `     (${onData.length}/${phoneRoutes.length} routes open on records; the rest open on a ` +
    `sentence saying what is not recorded yet)`,
);

// T6-01's mechanism: a collapsed explanation is one line. If this slips, the
// criterion above starts failing for a reason nobody can see in the numbers.
// Two lines of slack, because a long first word can wrap the control.
const fatExplains = phoneRoutes.flatMap(([route, m]) =>
  m.explains.filter((e) => !e.open && e.h > 56).map((e) => `${route} ${e.id} ${e.h}px`),
);
const allExplains = phoneRoutes.flatMap(([, m]) => m.explains);
check(
  allExplains.length > 0,
  'T6-01 the explanations are actually collapsible',
  `${allExplains.length} on screen across ${phoneRoutes.length} routes`,
);
check(
  fatExplains.length === 0,
  'T6-01 and a collapsed one takes a single line',
  fatExplains.slice(0, 4).join(', '),
);

// T6-02: moved, not deleted — every one of them can be opened.
const mute = allExplains.filter((e) => !e.hasControl);
check(
  mute.length === 0,
  'T6-02 each one carries the control that opens it',
  mute.map((e) => e.id).join(', '),
);

if (report.opened) {
  const o = report.opened;
  // Height, not character count. `line-clamp` does not remove the words from
  // the document, it stops painting them — so innerText reads the same open
  // or closed, and the first version of this check failed on 216 → 216 while
  // the box went 44px → 114px. That the text is always in the DOM is worth
  // knowing rather than working around: a collapsed explanation is still
  // there for a screen reader and for the browser's own find.
  check(
    o.afterH > o.beforeH,
    'T6-02 and opening one really does show more of it',
    `${o.beforeH}px → ${o.afterH}px (text was in the document all along: ${o.after} chars)`,
  );
} else {
  check(false, 'T6-02 could not be measured: no explanation was found to open');
}

// T10-08: the dashboard opens on figures rather than on a paragraph.
const dash = report.widths.phone?.['/'];
if (dash) {
  check(
    dash.firstLook >= 3,
    'T10-08 the dashboard opens with at least three figures',
    `${dash.firstLook} in the first screenful`,
  );
}

console.log(
  `\nphone:   text<12px ${phone.smallText} | targets<44px ${phone.smallTargets} | ` +
    `routes overflowing ${phone.overflowing.length}/${ROUTES.length} | past the edge ${phone.past} | ` +
    `scrollers somebody chose ${phone.scrollers} | registers ${phone.registers} (${phone.registerRows} rows)`,
);
console.log(
  `desktop: text<12px ${desktop.smallText} | targets<44px ${desktop.smallTargets} (by design) | ` +
    `routes overflowing ${desktop.overflowing.length}/${ROUTES.length} | registers ${desktop.registers}`,
);

console.log(`\ndetail: ${out.pathname}`);
if (failures > 0) {
  console.error(`\n${failures} design check(s) failed.`);
  process.exit(1);
}
if (PARTIAL) {
  console.log(
    `\nChecks passed on the ${ROUTES.length} route(s) asked for. This is NOT a full` +
      ' pass:\nrun without DESIGN_ROUTES before committing.',
  );
} else {
  console.log('\nAll design checks passed.');
}
