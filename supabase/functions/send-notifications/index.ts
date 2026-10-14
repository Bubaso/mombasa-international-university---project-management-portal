/**
 * Sends the queued push notifications, and records what the push service said
 * (M11-05).
 *
 * The honest boundary of this function, stated once so no screen has to guess
 * it: a push service answering 201 means it accepted the bytes. It does not
 * mean a device displayed anything. So a delivery settles as `sent`, never as
 * `delivered` — `delivered` is reserved for a medium that reports back, and
 * no medium here does.
 *
 * Three other decisions worth knowing before reading the code:
 *
 *   * The rows are claimed and stamped `attempted_at` in one statement, by
 *     `claim_push_deliveries`, so two overlapping runs cannot both send the
 *     same notification to the same device. A run that dies mid-flight leaves
 *     stamped rows rather than ones that look untouched.
 *
 *   * A 404 or a 410 is not a failure to retry. The browser threw its
 *     subscription away, and the subscription is dropped — otherwise one
 *     dead device becomes a permanent failure count on every later run.
 *
 *   * The private VAPID key is read from the environment and never written
 *     anywhere. The database holds only the public half, which is what makes
 *     `app.configured_media()` able to say push is configured without
 *     asserting anything it cannot check.
 *
 * Deploy:
 *   supabase secrets set VAPID_PRIVATE_KEY=... VAPID_PUBLIC_KEY=... VAPID_CONTACT=...
 *   supabase functions deploy send-notifications
 *
 * Call it on a schedule (pg_cron reaches it over http, or any scheduler), and
 * with no body: there is nothing to pass and therefore nothing to get wrong.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { encryptPayload, pushHeaders, vapidHeader } from './webpush.ts';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Long enough to survive a phone being asleep, short enough to be news. */
const TTL_SECONDS = 6 * 60 * 60;

interface Device {
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface Claimed {
  delivery_id: string;
  /** Every device of this delivery's recipient. Settled once for all of them. */
  devices: Device[];
  title_en: string | null;
  title_tr: string | null;
  body: string | null;
  topic: string;
  entity_kind: string | null;
  entity_id: string | null;
  thread_id: string | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });
}

/**
 * What the device shows. Turkish first where there is Turkish, because the
 * trustees read Turkish and a notification in the wrong language is one they
 * open to find out what it was about.
 */
function payloadFor(row: Claimed): string {
  return JSON.stringify({
    title: row.title_tr ?? row.title_en ?? 'MIU',
    body: row.body ?? '',
    topic: row.topic,
    entityKind: row.entity_kind,
    entityId: row.entity_id,
    threadId: row.thread_id,
  });
}

/** What one device said. Collected so the delivery settles on all of them. */
interface Attempt {
  ok: boolean;
  gone: boolean;
  host: string;
  reason: string;
}

async function pushToDevice(
  device: Device,
  payload: string,
  vapid: { publicKey: string; privateKeyD: string; subject: string },
): Promise<Attempt> {
  const host = (() => {
    try {
      return new URL(device.endpoint).host;
    } catch {
      return 'unparseable endpoint';
    }
  })();

  try {
    const sealed = await encryptPayload(
      { endpoint: device.endpoint, p256dh: device.p256dh, auth: device.auth },
      payload,
    );
    const authorization = await vapidHeader({
      endpoint: device.endpoint,
      publicKey: vapid.publicKey,
      privateKeyD: vapid.privateKeyD,
      subject: vapid.subject,
    });

    const response = await fetch(device.endpoint, {
      method: 'POST',
      headers: pushHeaders({ authorization, ttlSeconds: TTL_SECONDS }),
      body: sealed.body,
    });

    if (response.status === 404 || response.status === 410) {
      return {
        ok: false,
        gone: true,
        host,
        reason: `the device's subscription is gone (${response.status})`,
      };
    }

    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 120);
      return { ok: false, gone: false, host, reason: `${response.status} ${detail}`.trim() };
    }

    return { ok: true, gone: false, host, reason: '' };
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, gone: false, host, reason: reason.slice(0, 120) };
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'POST only.' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const privateKeyD = Deno.env.get('VAPID_PRIVATE_KEY');
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const contact = Deno.env.get('VAPID_CONTACT');

  // Supabase has two generations of server-side key. The legacy one is a JWT
  // in SUPABASE_SERVICE_ROLE_KEY; the current one is an `sb_secret_...` value,
  // and a project that has turned the legacy keys off may have only the
  // latter. Reading one name and calling the function "not configured" when
  // the project simply uses the other is a failure that says nothing true
  // about the cause, so all the names it can arrive under are tried and the
  // error names them if none is present.
  const KEY_NAMES = ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'SB_SECRET_KEY'] as const;
  const keyName = KEY_NAMES.find((name) => (Deno.env.get(name) ?? '') !== '');
  const serviceKey = keyName ? Deno.env.get(keyName) : undefined;

  if (!url || !serviceKey) {
    return json(
      {
        error: 'The function has no server-side key.',
        tried: KEY_NAMES,
        remedy: `Set one of these as a function secret, or leave the project's legacy keys enabled.`,
      },
      500,
    );
  }
  if (!privateKeyD || !publicKey || !contact) {
    // Said plainly rather than treated as an empty run: "there is no key" and
    // "there was nothing queued" are different answers and a caller has to be
    // able to tell them apart.
    return json({ error: 'No VAPID key is configured; nothing can be sent.' }, 503);
  }

  // The caller is a scheduler holding the service key. There is no per-user
  // authority to check because the function acts for nobody: it reads a queue
  // the database filled and reports back to the same database.
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.includes(serviceKey)) return json({ error: 'Not for you.' }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data, error } = await admin.rpc('claim_push_deliveries', { p_limit: 100 });
  if (error) {
    console.error('Could not claim deliveries', error);
    return json({ error: error.message }, 500);
  }

  const claimed = (data ?? []) as Claimed[];
  const vapid = { publicKey, privateKeyD, subject: contact };
  let sent = 0;
  let failed = 0;
  let forgotten = 0;

  for (const row of claimed) {
    const devices = Array.isArray(row.devices) ? row.devices : [];

    // Should not happen: the claim refuses a delivery with no device. If it
    // does, the delivery is settled as failed rather than left stamped and
    // silent, because a stamped row is never claimed again.
    if (devices.length === 0) {
      await admin.rpc('settle_push_delivery', {
        p_delivery: row.delivery_id,
        p_state: 'failed',
        p_provider_reference: null,
        p_failure_reason: 'no device was on record for the recipient',
      });
      failed += 1;
      continue;
    }

    const payload = payloadFor(row);
    const attempts: Attempt[] = [];
    for (const device of devices) {
      const attempt = await pushToDevice(device, payload, vapid);
      attempts.push(attempt);
      if (attempt.gone) {
        // The browser discarded this subscription. Drop it, or one dead
        // device becomes a permanent failure count on every later run.
        await admin.rpc('forget_push_subscription', { p_endpoint: device.endpoint });
        forgotten += 1;
      }
    }

    // One delivery, one verdict. It took if any device took it; a dead laptop
    // must not record a push that reached the phone as a failure.
    const accepted = attempts.filter((a) => a.ok);
    if (accepted.length > 0) {
      const hosts = [...new Set(accepted.map((a) => a.host))].join(', ');
      await admin.rpc('settle_push_delivery', {
        p_delivery: row.delivery_id,
        p_state: 'sent',
        // How many devices took it, out of how many were tried. A partial
        // send recorded as a plain success hides a device that stopped
        // working, and the count is the cheapest way to not hide it.
        p_provider_reference: `${accepted.length}/${attempts.length} ${hosts}`,
        p_failure_reason: null,
      });
      sent += 1;
      continue;
    }

    const why = attempts
      .map((a) => `${a.host}: ${a.reason}`)
      .join('; ')
      .slice(0, 300);
    await admin.rpc('settle_push_delivery', {
      p_delivery: row.delivery_id,
      p_state: 'failed',
      p_provider_reference: null,
      p_failure_reason: why || 'every device refused it, with no reason given',
    });
    failed += 1;
  }

  // `claimed` is reported as well as the outcomes, so a run that found
  // nothing is distinguishable from one that sent nothing. `keyUsed` says
  // which key name the project turned out to have, so the first live call
  // does not leave that a guess.
  return json({ claimed: claimed.length, sent, failed, forgotten, keyUsed: keyName });
});
