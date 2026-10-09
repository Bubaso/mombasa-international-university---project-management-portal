/**
 * Web push, written out rather than taken from a library (M11-05).
 *
 * Two specifications, both short and both unforgiving:
 *
 *   RFC 8292 (VAPID) — the sender proves who it is with a JWT signed over
 *   P-256, so a push service will accept the request and an endpoint cannot
 *   be driven by anybody who merely knows it.
 *
 *   RFC 8291 — the payload is encrypted to the subscription's own key before
 *   it leaves, so the push service forwards bytes it cannot read. This is the
 *   part worth not getting wrong: an off-by-one in the key derivation
 *   produces a request the push service accepts with a 201 and a browser
 *   silently drops. The function would report every notification sent and
 *   none would arrive.
 *
 * So this is written against Web Crypto, with no dependency, and
 * `tests/push.mjs` proves it by decrypting its own output with the
 * recipient's private key. A round trip is evidence; a version number is not.
 *
 * Everything here runs unchanged in Deno and in Node 22, because the test has
 * to exercise the same code the edge function sends with — a crypto module
 * tested through a reimplementation of itself is tested against nothing.
 */

const encoder = new TextEncoder();

/**
 * A byte array over a plain ArrayBuffer. TypeScript 5.7 made `Uint8Array`
 * generic over its buffer, and an unannotated `Uint8Array` defaults to
 * `ArrayBufferLike` — which includes SharedArrayBuffer and so is not a
 * `BufferSource`. Naming the buffer is the honest fix; casting at each Web
 * Crypto call would hide the same mismatch in whichever direction it next
 * appears.
 */
type Bytes = Uint8Array<ArrayBuffer>;

function bytes(length: number): Bytes {
  return new Uint8Array(new ArrayBuffer(length));
}

export function b64urlToBytes(value: string): Bytes {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const out = bytes(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function bytesToB64url(input: Uint8Array): string {
  let binary = '';
  for (const byte of input) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...parts: Uint8Array[]): Bytes {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = bytes(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** Big-endian, which is what both specifications mean by a number. */
function u16(value: number): Bytes {
  const out = bytes(2);
  out.set([(value >> 8) & 0xff, value & 0xff]);
  return out;
}

function u32(value: number): Bytes {
  const out = bytes(4);
  out.set([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);
  return out;
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, length: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits) as Bytes;
}

export interface PushSubscriptionKeys {
  /** The endpoint the push service gave the browser. */
  endpoint: string;
  /** The subscription's public key, base64url, uncompressed P-256 point. */
  p256dh: string;
  /** The subscription's auth secret, base64url, sixteen bytes. */
  auth: string;
}

export interface EncryptedPayload {
  body: Bytes;
  /** The one header this encoding needs; the rest are VAPID's. */
  contentEncoding: 'aes128gcm';
}

/**
 * RFC 8291 §3.4 and RFC 8188: an aes128gcm body is its own header —
 * salt, record size, the sender's public key — followed by one record.
 *
 * `saltOverride` and `senderKeyOverride` exist for the test, which has to
 * produce a known-input ciphertext to decrypt. Nothing in the function path
 * passes them.
 */
export async function encryptPayload(
  subscription: PushSubscriptionKeys,
  plaintext: string,
  overrides?: { salt?: Bytes; senderKey?: CryptoKeyPair },
): Promise<EncryptedPayload> {
  const recipientPublicRaw = b64urlToBytes(subscription.p256dh);
  const authSecret = b64urlToBytes(subscription.auth);

  const senderPair =
    overrides?.senderKey ??
    ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair);

  const senderPublicRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', senderPair.publicKey),
  ) as Bytes;

  const recipientPublic = await crypto.subtle.importKey(
    'raw',
    recipientPublicRaw,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );

  // The shared secret, which both sides can compute and the push service
  // cannot.
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: recipientPublic },
    senderPair.privateKey,
    256,
  );
  const shared = new Uint8Array(sharedBits) as Bytes;

  // RFC 8291 §3.3. The "WebPush: info" string binds the derivation to this
  // pair of keys, which is what stops a ciphertext being replayed at a
  // different subscription.
  const prkInfo = concat(encoder.encode('WebPush: info\0'), recipientPublicRaw, senderPublicRaw);
  const ikm = await hkdf(authSecret, shared, prkInfo, 32);

  const salt = overrides?.salt ?? (crypto.getRandomValues(bytes(16)) as Bytes);
  const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);

  // RFC 8188 §2: the record is the plaintext plus a delimiter of 0x02 for the
  // last record. No padding is added: padding hides the length of a message
  // from an observer who is already being handed the endpoint, and a reader
  // of this code should not have to wonder whether the 0x02 is padding or the
  // delimiter.
  const delimiter = bytes(1);
  delimiter[0] = 0x02;
  const record = concat(encoder.encode(plaintext), delimiter);

  const key = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, key, record),
  ) as Bytes;

  // The aes128gcm header: salt(16) ‖ rs(4) ‖ idlen(1) ‖ keyid.
  const idlen = bytes(1);
  idlen[0] = senderPublicRaw.length;
  const header = concat(salt, u32(4096), idlen, senderPublicRaw);

  return { body: concat(header, sealed), contentEncoding: 'aes128gcm' };
}

/**
 * The inverse, for the test. This is not used when sending — a browser does
 * it — and it is here so the round trip exercises the same derivation rather
 * than a second guess at it.
 */
export async function decryptPayload(
  recipientPrivate: CryptoKey,
  recipientPublicRaw: Bytes,
  authSecret: Bytes,
  body: Bytes,
): Promise<string> {
  const salt = body.slice(0, 16);
  const idlen = body[20];
  if (idlen === undefined) throw new Error('truncated aes128gcm header');
  const senderPublicRaw = body.slice(21, 21 + idlen);
  const sealed = body.slice(21 + idlen);

  const senderPublic = await crypto.subtle.importKey(
    'raw',
    senderPublicRaw,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: senderPublic },
    recipientPrivate,
    256,
  );

  const prkInfo = concat(encoder.encode('WebPush: info\0'), recipientPublicRaw, senderPublicRaw);
  const ikm = await hkdf(authSecret, new Uint8Array(sharedBits), prkInfo, 32);
  const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);

  const key = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['decrypt']);
  const opened = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, key, sealed),
  ) as Bytes;

  // Strip the record delimiter the sender appended.
  const end = opened.length - 1;
  if (opened[end] !== 0x02) throw new Error('record delimiter is not 0x02');
  return new TextDecoder().decode(opened.slice(0, end));
}

/**
 * RFC 8292. The JWT the push service checks, and the one thing in this file
 * that proves who the sender is.
 *
 * `aud` is the push service's own origin, not ours: a token minted for one
 * service must not be replayable at another.
 */
export async function vapidHeader(input: {
  endpoint: string;
  publicKey: string;
  privateKeyD: string;
  subject: string;
  now?: number;
}): Promise<string> {
  const audience = new URL(input.endpoint).origin;
  const issuedFor = Math.floor((input.now ?? Date.now()) / 1000) + 12 * 60 * 60;

  const header = bytesToB64url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = bytesToB64url(
    encoder.encode(JSON.stringify({ aud: audience, exp: issuedFor, sub: input.subject })),
  );
  const signingInput = encoder.encode(`${header}.${claims}`);

  const raw = b64urlToBytes(input.publicKey);
  const key = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      d: input.privateKeyD,
      // The public point, split, which is how JWK wants it.
      x: bytesToB64url(raw.slice(1, 33)),
      y: bytesToB64url(raw.slice(33, 65)),
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, signingInput),
  ) as Bytes;

  const jwt = `${header}.${claims}.${bytesToB64url(signature)}`;
  return `vapid t=${jwt}, k=${input.publicKey}`;
}

/** What the push service is told, beyond the body. */
export function pushHeaders(input: {
  authorization: string;
  ttlSeconds: number;
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
}): Record<string, string> {
  return {
    authorization: input.authorization,
    'content-encoding': 'aes128gcm',
    'content-type': 'application/octet-stream',
    ttl: String(input.ttlSeconds),
    urgency: input.urgency ?? 'normal',
  };
}

export const RECIPIENT_KEY_BYTES = 65;
export const AUTH_SECRET_BYTES = 16;

/** u16 is exported only because the test asserts the header layout. */
export { u16 };
