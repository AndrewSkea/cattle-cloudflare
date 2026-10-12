/**
 * Web Push (RFC 8030) with VAPID (RFC 8292) and aes128gcm payload encryption (RFC 8291), on WebCrypto only.
 * Payloads are encrypted so the service worker can show the reminder without calling the API, which matters
 * because the site sits behind Cloudflare Access and its cookie may have expired by morning.
 */

const enc = new TextEncoder();

export function b64urlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

/** Encrypts a payload for one subscription (single aes128gcm record). */
export async function encryptPayload(payload: string, p256dh: string, auth: string): Promise<Uint8Array> {
  const uaPublic = b64urlDecode(p256dh);
  const authSecret = b64urlDecode(auth);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  // Standard WebCrypto spells the peer key `public`; workers-types names it `$public`, so cast.
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm, local.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const plain = concat(enc.encode(payload), new Uint8Array([2])); // 0x02: last (only) record
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plain));

  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, cipher);
}

/** Signed VAPID JWT for the push service's origin. `publicKey` is the raw uncompressed P-256 key, `privateKey` its scalar d (both base64url). */
async function vapidAuth(endpoint: string, publicKey: string, privateKey: string, subject: string) {
  const pub = b64urlDecode(publicKey);
  const jwk: JsonWebKey = { kty: 'EC', crv: 'P-256', x: b64urlEncode(pub.slice(1, 33)), y: b64urlEncode(pub.slice(33, 65)), d: privateKey, ext: true };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64urlEncode(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64urlEncode(sig)}, k=${publicKey}`;
}

export interface PushTarget { endpoint: string; p256dh: string; auth: string }
export interface PushKeys { publicKey: string; privateKey: string; subject: string }

/** Sends one notification. Returns 'gone' when the browser has dropped the subscription (delete it). */
export async function sendPush(target: PushTarget, payload: object, keys: PushKeys): Promise<'ok' | 'gone' | 'error'> {
  const body = await encryptPayload(JSON.stringify(payload), target.p256dh, target.auth);
  const res = await fetch(target.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuth(target.endpoint, keys.publicKey, keys.privateKey, keys.subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(12 * 3600),
      Urgency: 'normal',
    },
    body,
  });
  if (res.status === 404 || res.status === 410) return 'gone';
  if (!res.ok) {
    console.error('push failed', res.status, (await res.text()).slice(0, 200));
    return 'error';
  }
  return 'ok';
}
