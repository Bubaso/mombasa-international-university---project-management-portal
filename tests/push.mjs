/**
 * Web push, proved rather than trusted (M11-05).
 *
 * The reason this file exists: an off-by-one in RFC 8291's key derivation
 * produces a request a push service answers with 201 and a browser silently
 * discards. The portal would record every notification as sent and none would
 * arrive — which is the exact failure this whole project is built to refuse.
 * A version number on a library is not evidence against that. A round trip
 * is: encrypt with the sending code, decrypt with the recipient's private
 * key, and get the plaintext back.
 *
 * The VAPID half is checked the same way, by verifying the signature with the
 * public key the header advertises.
 *
 * Usage: npm run test:push
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = mkdtempSync(join(tmpdir(), 'miu-push-'));
let failures = 0;
const check = (ok, label, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

try {
  execFileSync(
    'npx',
    [
      'tsc',
      'supabase/functions/send-notifications/webpush.ts',
      '--outDir',
      out,
      '--module',
      'esnext',
      '--target',
      'es2022',
      '--moduleResolution',
      'bundler',
      '--lib',
      'es2022,dom',
      '--strict',
      '--skipLibCheck',
    ],
    { stdio: 'pipe' },
  );
} catch (error) {
  console.error('Could not compile the web push module');
  console.error(error.stdout?.toString() ?? error.message);
  process.exit(1);
}

const mod = await import(join(out, 'webpush.js'));
const { encryptPayload, decryptPayload, vapidHeader, b64urlToBytes, bytesToB64url } = mod;

const { subtle } = globalThis.crypto;

// --- a subscription, the way a browser produces one ------------------------

const recipient = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
  'deriveBits',
]);
const recipientPublicRaw = new Uint8Array(await subtle.exportKey('raw', recipient.publicKey));
const authSecret = crypto.getRandomValues(new Uint8Array(16));

const subscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/eXaMpLe-EnDpOiNt',
  p256dh: bytesToB64url(recipientPublicRaw),
  auth: bytesToB64url(authSecret),
};

check(recipientPublicRaw.length === 65, 'a subscription key is an uncompressed P-256 point');
check(recipientPublicRaw[0] === 0x04, 'and says so in its first byte');
check(authSecret.length === 16, 'and the auth secret is sixteen bytes');

// --- the round trip, which is the whole point ------------------------------

const message = JSON.stringify({
  title: 'Duruşma yarın',
  body: 'ELC temyizi, 09:00, Mombasa',
  topic: 'hearing',
});

const sealed = await encryptPayload(subscription, message);
check(sealed.contentEncoding === 'aes128gcm', 'the payload declares the encoding it used');

/**
 * Caught on purpose. A wrong derivation makes AES-GCM throw, and an uncaught
 * throw kills the suite with a stack trace — so the one failure this file
 * exists to report would be the one it reports worst. Named failure, every
 * time.
 */
const open = async (label, ...args) => {
  try {
    return await decryptPayload(...args);
  } catch (error) {
    check(false, label, `threw: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};

const opened = await open(
  'the recipient decrypts exactly what was sent — the derivation is right',
  recipient.privateKey,
  recipientPublicRaw,
  authSecret,
  sealed.body,
);
if (opened !== null) {
  check(
    opened === message,
    'the recipient decrypts exactly what was sent — the derivation is right',
    opened === message ? '' : `got ${opened.slice(0, 40)}`,
  );
}

// Turkish in the body, because a notification that arrives as mojibake is a
// notification nobody reads.
const turkish = JSON.stringify({ title: 'Şişli — İzmir', body: 'Çağrı güncellendi (ğüşıöç)' });
const sealedTr = await encryptPayload(subscription, turkish);
const openedTr = await open(
  'and Turkish letters survive the encoding intact',
  recipient.privateKey,
  recipientPublicRaw,
  authSecret,
  sealedTr.body,
);
if (openedTr !== null) {
  check(openedTr === turkish, 'and Turkish letters survive the encoding intact');
}

// --- the header layout RFC 8188 specifies ----------------------------------

check(sealed.body.length > 21 + 65, 'the body carries its own header');
const idlen = sealed.body[20];
check(idlen === 65, 'the key id length names a full P-256 point', String(idlen));
const rs =
  (sealed.body[16] << 24) | (sealed.body[17] << 16) | (sealed.body[18] << 8) | sealed.body[19];
check(rs === 4096, 'the record size is written big-endian', String(rs));

// Two sends of the same message differ, because the salt and the sender key
// are fresh each time. A deterministic ciphertext would leak that two
// recipients were told the same thing.
const again = await encryptPayload(subscription, message);
check(
  bytesToB64url(again.body) !== bytesToB64url(sealed.body),
  'two sends of one message produce different ciphertext',
);

// A ciphertext is bound to the subscription it was made for: another
// subscription cannot open it.
const other = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const otherPublicRaw = new Uint8Array(await subtle.exportKey('raw', other.publicKey));
let refused = false;
try {
  await decryptPayload(other.privateKey, otherPublicRaw, authSecret, sealed.body);
} catch {
  refused = true;
}
check(refused, 'and another subscription cannot open it');

// The auth secret is part of the derivation, so the right key with the wrong
// secret fails too.
let refusedSecret = false;
try {
  await decryptPayload(
    recipient.privateKey,
    recipientPublicRaw,
    crypto.getRandomValues(new Uint8Array(16)),
    sealed.body,
  );
} catch {
  refusedSecret = true;
}
check(refusedSecret, 'nor the right key with the wrong auth secret');

// --- VAPID, verified with the key it advertises ----------------------------

const signing = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
  'verify',
]);
const vapidPublicRaw = new Uint8Array(await subtle.exportKey('raw', signing.publicKey));
const vapidPublic = bytesToB64url(vapidPublicRaw);
const vapidJwk = await subtle.exportKey('jwk', signing.privateKey);

const NOW = Date.parse('2026-10-01T12:00:00Z');
const header = await vapidHeader({
  endpoint: subscription.endpoint,
  publicKey: vapidPublic,
  privateKeyD: vapidJwk.d,
  subject: 'mailto:portal@miu.example',
  now: NOW,
});

check(header.startsWith('vapid t='), 'the authorization header is a vapid token');
check(header.includes(`k=${vapidPublic}`), 'and advertises the public key it was signed with');

const token = header.slice('vapid t='.length).split(',')[0];
const [h, c, s] = token.split('.');
const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(c)));

check(
  claims.aud === 'https://fcm.googleapis.com',
  'the audience is the push service, not this portal',
  claims.aud,
);
check(
  claims.exp === Math.floor(NOW / 1000) + 12 * 60 * 60,
  'and the token expires twelve hours out, not never',
);
check(claims.sub === 'mailto:portal@miu.example', 'with a subject a push service can complain to');

const verified = await subtle.verify(
  { name: 'ECDSA', hash: 'SHA-256' },
  signing.publicKey,
  b64urlToBytes(s),
  new TextEncoder().encode(`${h}.${c}`),
);
check(verified, 'and the signature verifies against that key');

// A token minted for one service must not verify as being for another.
const elsewhere = await vapidHeader({
  endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/eXaMpLe',
  publicKey: vapidPublic,
  privateKeyD: vapidJwk.d,
  subject: 'mailto:portal@miu.example',
  now: NOW,
});
const elsewhereClaims = JSON.parse(
  new TextDecoder().decode(
    b64urlToBytes(elsewhere.slice('vapid t='.length).split(',')[0].split('.')[1]),
  ),
);
check(
  elsewhereClaims.aud === 'https://updates.push.services.mozilla.com',
  'a second endpoint gets a token for its own origin',
  elsewhereClaims.aud,
);

rmSync(out, { recursive: true, force: true });
console.log(failures === 0 ? '\nAll push checks passed.' : `\n${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
