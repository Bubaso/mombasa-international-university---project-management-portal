/**
 * The service worker's push half, driven by real push events (M11-05).
 *
 * Why this suite exists separately from smoke.mjs: the push handler lives in
 * the generated service worker, not in the page, so nothing the smoke suite
 * does can reach it. A handler that throws, or shows nothing, or routes a
 * click to a path the router does not have, fails in exactly the way this
 * project refuses — the device stays silent and looks no different from a
 * notification that was never sent.
 *
 * The events are delivered with Chrome DevTools Protocol's
 * ServiceWorker.deliverPushMessage, which hands the worker the same
 * PushEvent a push service would. No push service and no subscription are
 * involved, so this tests the handler rather than the network: the encryption
 * and the VAPID signature are tested by round-trip in tests/push.mjs, and the
 * database state machine by tests/db/policies.test.sql.
 *
 * Usage: npm run test:push:sw
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = Number(process.env.PUSH_SW_PORT ?? 4174);
const BASE = `http://127.0.0.1:${PORT}`;

function resolveChromium() {
  const candidates = [process.env.PLAYWRIGHT_CHROMIUM_PATH, '/opt/pw-browsers/chromium'];
  return candidates.find((p) => p && existsSync(p));
}

/**
 * Refuses to run against a server this suite did not start.
 *
 * waitForServer is satisfied by anything answering on the port, which makes a
 * stale `vite preview` from an earlier run indistinguishable from the one
 * spawned here — and it will be serving whatever directory that run built.
 * That happened: an orphan on 4173 kept serving the real build while this
 * suite believed it was testing the smoke build, and every route failed at the
 * sign-in gate for a reason that had nothing to do with the code. It could as
 * easily have passed for the wrong reason.
 */
async function refuseAStrangerOnThePort(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      throw new Error(
        `Something is already serving ${url}. It is not this suite's server, and whatever ` +
          'it is built from is what would be tested. Stop it (by pid, not `pkill -f`, which ' +
          'matches the shell running it) and try again.',
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Something is already serving'))
      throw error;
    // Nothing listening, which is what we want.
  }
}

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

await refuseAStrangerOnThePort(BASE);

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1'], {
  stdio: 'ignore',
  // A process group of its own: `npx vite` is a wrapper, so killing the
  // child this handle points at leaves the real vite running and holding
  // the port. Signalling -pid takes the wrapper and everything under it.
  detached: true,
});

/**
 * Takes the preview server down with this process, however it ends.
 *
 * `server.kill()` in a finally block covers a normal exit, but not a SIGTERM —
 * and `timeout 600 node tests/...` sends exactly that, killing the suite and
 * leaving `vite preview` holding the port. Those orphans are what the guard
 * above had to be written for; these handlers are why it should rarely fire.
 */
/** Kills the preview server's whole process group, wrapper included. */
const stopServer = () => {
  try {
    if (server.pid) process.kill(-server.pid);
  } catch {
    // already gone
  }
};

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    stopServer();
    process.exit(1);
  });
}
process.on('exit', stopServer);

let browser;
let failures = 0;
const check = (ok, label, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

try {
  await waitForServer(BASE);
  browser = await chromium.launch({ executablePath: resolveChromium() });
  const ctx = await browser.newContext();
  // Granted up front: the handler's job is what is being tested, not the
  // permission dialog, which lib/push.ts owns and smoke.mjs covers.
  await ctx.grantPermissions(['notifications'], { origin: BASE });
  const page = await ctx.newPage();

  const workerErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') workerErrors.push(m.text());
  });

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });

  // Polled rather than awaited: an install that never finishes is a state
  // worth naming, and `ready` would only ever time out.
  let activated = false;
  for (let i = 0; i < 40; i++) {
    activated = await page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      return !!(r && r.active && r.active.state === 'activated');
    });
    if (activated) break;
    await sleep(500);
  }
  check(activated, 'the generated service worker installs and activates');
  check(
    workerErrors.length === 0,
    'importScripts("push-sw.js") does not break the install',
    workerErrors.slice(0, 2).join(' | '),
  );

  const cdp = await ctx.newCDPSession(page);
  await cdp.send('ServiceWorker.enable');
  const registrationId = await new Promise((resolve) => {
    cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => {
      const r = (e.registrations ?? []).find((x) => x.scopeURL.startsWith(BASE));
      if (r) resolve(String(r.registrationId));
    });
    setTimeout(() => resolve(null), 10000);
    void page.evaluate(() => navigator.serviceWorker.getRegistration());
  });
  check(registrationId != null, 'the registration is reachable over CDP');
  if (registrationId == null) throw new Error('no registration id; nothing can be delivered');

  const clear = () =>
    page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      for (const n of await r.getNotifications()) n.close();
    });

  /** Delivers one push and returns the notifications it produced. */
  async function deliver(data) {
    await clear();
    await cdp.send('ServiceWorker.deliverPushMessage', {
      origin: BASE,
      registrationId,
      data: typeof data === 'string' ? data : JSON.stringify(data),
    });
    for (let i = 0; i < 20; i++) {
      const shown = await page.evaluate(async () => {
        const r = await navigator.serviceWorker.getRegistration();
        return (await r.getNotifications()).map((n) => ({
          title: n.title,
          body: n.body,
          tag: n.tag,
          data: n.data,
        }));
      });
      if (shown.length > 0) return shown;
      await sleep(250);
    }
    return [];
  }

  // --- a notification that says what it is ---------------------------------
  const hearing = await deliver({
    title: 'Duruşma yarın',
    body: 'ELC itirazı, 09:00 — Mombasa',
    topic: 'hearing',
    entityKind: 'legal_case',
    entityId: '00000000-0000-0000-0000-00000000beef',
    threadId: null,
  });
  check(hearing.length === 1, 'a push shows exactly one notification', `got ${hearing.length}`);
  check(hearing[0]?.title === 'Duruşma yarın', 'with the title it was sent');
  check(
    hearing[0]?.body === 'ELC itirazı, 09:00 — Mombasa',
    'and the Turkish body intact, em dash and all',
    hearing[0]?.body,
  );
  check(hearing[0]?.tag === 'hearing', 'tagged by topic, so a sweep does not stack four bars');

  // --- the click route, against the app's real routes -----------------------
  //
  // These five are every entity kind app.sweep_notifications raises. A route
  // the router does not have falls through its catch-all to the dashboard, so
  // a wrong value here is a click that silently lands on the wrong screen.
  const ROUTED = [
    ['obligation', '/obligations'],
    ['legal_case', '/legal'],
    ['action_item', '/meetings'],
    ['risk', '/risks'],
    ['budget_line', '/finance'],
  ];
  for (const [kind, route] of ROUTED) {
    const shown = await deliver({ title: kind, body: 'x', topic: 'deadline', entityKind: kind });
    check(
      shown[0]?.data?.route === route,
      `a ${kind} notification carries the route ${route}`,
      `got ${shown[0]?.data?.route}`,
    );
  }

  const thread = await deliver({
    title: 'Konuya cevap',
    body: 'x',
    topic: 'thread_reply',
    threadId: '00000000-0000-0000-0000-0000000000c1',
  });
  check(
    thread[0]?.data?.route === '/communication',
    'a thread reply goes to the inbox, where the thread is',
    `got ${thread[0]?.data?.route}`,
  );

  // An unknown kind must not be guessed at. The inbox shows the notification
  // itself, which is the truthful answer in every case.
  const unknown = await deliver({
    title: 'Bilinmeyen',
    body: 'x',
    topic: 'announcement',
    entityKind: 'something_nothing_raises',
  });
  check(
    unknown[0]?.data?.route === '/communication',
    'an unknown entity kind routes to the inbox rather than a guessed screen',
    `got ${unknown[0]?.data?.route}`,
  );

  // --- a payload this device cannot read -----------------------------------
  //
  // The browser requires a visible notification for a push received under a
  // userVisibleOnly subscription, and a silent drop looks — from the device —
  // exactly like a notification that was never sent. So an undecodable
  // payload becomes a notification that says so.
  const unreadable = await deliver('this is not json');
  check(
    unreadable.length === 1,
    'an unreadable payload still shows a notification rather than nothing',
    `got ${unreadable.length}`,
  );
  check(
    /bu cihaz metnini okuyamadı/i.test(unreadable[0]?.body ?? ''),
    'and says the text could not be read, rather than showing an empty bar',
    unreadable[0]?.body,
  );
  check(
    unreadable[0]?.data?.route === '/communication',
    'with a click that still lands somewhere true',
    `got ${unreadable[0]?.data?.route}`,
  );

  // A readable payload that simply has no body is NOT the same fact, and the
  // first draft of the handler printed "could not read its text" over it —
  // a false statement about a device that read the payload perfectly. This
  // assertion is what caught that.
  const bare = await deliver({ title: 'Duyuru', topic: 'announcement' });
  check(bare[0]?.title === 'Duyuru', 'a readable push with no body shows its title');
  check(
    bare[0]?.body === '',
    'and an empty body, not the could-not-read line, because it was read fine',
    `"${bare[0]?.body}"`,
  );

  // A push carrying valid JSON that is not an object is as useless as none.
  const scalar = await deliver('42');
  check(
    /bu cihaz metnini okuyamadı/i.test(scalar[0]?.body ?? ''),
    'a payload that parses to a number is treated as no payload',
    scalar[0]?.body,
  );

  // And a push with no payload at all, which is what a bare ping looks like.
  await clear();
  await cdp.send('ServiceWorker.deliverPushMessage', { origin: BASE, registrationId, data: '' });
  let empty = [];
  for (let i = 0; i < 20; i++) {
    empty = await page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      return (await r.getNotifications()).map((n) => ({ title: n.title, body: n.body }));
    });
    if (empty.length > 0) break;
    await sleep(250);
  }
  check(
    empty.length === 1 && /bu cihaz metnini okuyamadı/i.test(empty[0]?.body ?? ''),
    'a push with no payload at all still shows something, and says what it is',
    JSON.stringify(empty[0] ?? null),
  );

  console.log('');
  if (failures > 0) {
    console.error(`${failures} push service worker check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log('All push service worker checks passed.');
  }
} catch (error) {
  console.error('push-sw suite could not run:', error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  stopServer();
}
