/**
 * The push half of the service worker (M11-05).
 *
 * Imported by the generated Workbox worker rather than replacing it, so the
 * offline capture built for M3-11 keeps working untouched.
 *
 * Two decisions here are the same honesty rule the rest of the portal runs
 * on, applied to a notification:
 *
 *   * A push that arrives without a readable payload still shows something.
 *     The browser requires a visible notification for a push received under a
 *     userVisibleOnly subscription, and showing a vague one is better than
 *     showing none: a silent drop looks, from the device, exactly like a
 *     notification that was never sent. So an undecodable payload becomes a
 *     notification that says the portal has something and could not read it.
 *
 *   * The click opens the portal at the record, and when the payload carries
 *     no record it opens the inbox rather than guessing a route.
 */

/* global self, clients */

/**
 * Which screen a notification belongs to.
 *
 * These five are every entity kind app.sweep_notifications actually raises —
 * obligation, legal_case, action_item, risk, budget_line — plus a thread,
 * which arrives with a thread id rather than an entity kind. The list is
 * deliberately not longer than that: a route for a kind nothing raises would
 * read as coverage and be untested.
 *
 * The values are the app's own routes from src/App.tsx. A route that does not
 * exist there falls through react-router's catch-all to the dashboard, so a
 * typo here is a click that silently lands on the wrong page.
 */
const ROUTES = {
  obligation: '/obligations',
  legal_case: '/legal',
  action_item: '/meetings',
  risk: '/risks',
  budget_line: '/finance',
};

/** Where a click goes when the payload names no record it can place. */
const INBOX = '/communication';

function routeFor(data) {
  if (data && typeof data.threadId === 'string' && data.threadId) return INBOX;
  if (data && typeof data.entityKind === 'string') {
    const route = ROUTES[data.entityKind];
    if (route) return route;
  }
  // An unknown kind is not a reason to guess a screen. The inbox shows the
  // notification itself, which is the truthful answer in every case.
  return INBOX;
}

/** Shown when this device has no text for a notification it was sent. */
const UNREADABLE =
  'Portalda bir bildirim var; bu cihaz metnini okuyamadı. / A notification is waiting; this device could not read its text.';

self.addEventListener('push', (event) => {
  // Two different facts, and the first draft of this handler conflated them.
  //
  //   * There is no payload, or it will not parse. This device has no text,
  //     and saying so is the honest notification — a blank bar is noise the
  //     reader learns to dismiss, and a silent drop looks, from the device,
  //     exactly like a notification that was never sent.
  //   * The payload parsed and simply carries no body. The device read it
  //     perfectly; there is just nothing beyond the title. Printing "could
  //     not read its text" over that is a false statement about this device,
  //     which is the kind this portal exists to refuse.
  //
  // tests/push-sw.mjs delivers both and asserts they read differently.
  let data = null;
  let readable = false;
  try {
    if (event.data) {
      data = event.data.json();
      readable = data !== null && typeof data === 'object';
    }
  } catch {
    readable = false;
  }

  const title =
    (readable && typeof data.title === 'string' && data.title) ||
    'Mombasa International University';
  const body = readable ? (typeof data.body === 'string' ? data.body : '') : UNREADABLE;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      lang: 'tr',
      // Collapsed per topic, so a sweep that raises four deadline reminders
      // does not stack four bars on a phone.
      tag: (data && data.topic) || 'miu',
      renotify: true,
      data: { ...(readable ? data : {}), route: routeFor(readable ? data : null) },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const route = (event.notification.data && event.notification.data.route) || INBOX;

  event.waitUntil(
    (async () => {
      const open = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of open) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          // Navigating an already-open tab rather than opening a second one:
          // the portal holds unsaved offline capture, and a duplicate tab is
          // how somebody loses it.
          if ('navigate' in client) await client.navigate(route);
          return;
        }
      }
      await clients.openWindow(route);
    })(),
  );
});
