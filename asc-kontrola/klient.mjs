// Klient App Store Connect API TYLKO DO ODCZYTU: jedyna wysyłana metoda to GET (nie ma parametru metody, więc nic nie da się zapisać ani usunąć).
// Błąd zawiera tylko status, kody i tytuły błędów Apple (bez treści odpowiedzi, bez identyfikatorów obiektów) — repozytoria z workflow bywają publiczne.
import { createPrivateKey, sign as cryptoSign } from 'node:crypto';

export const API = 'https://api.appstoreconnect.apple.com';

const b64u = b => Buffer.from(b).toString('base64url');
/** Token JWT ES256 (ważny 10 minut) — bez zależności, tylko `crypto`. */
export function makeJwt({ keyId, issuerId, keyPem, now = Math.floor(Date.now() / 1000) }) {
  const head = b64u(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const body = b64u(JSON.stringify({ iss: issuerId, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' }));
  const sig = cryptoSign('sha256', Buffer.from(`${head}.${body}`), { key: createPrivateKey(keyPem), dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${b64u(sig)}`;
}

/** Ścieżka do komunikatu błędu: bez zapytania i bez identyfikatorów. */
export const safePath = path => path.split('?')[0].replace(API, '').replace(/\/([0-9a-f]{8}-[0-9a-f-]{27}|\d{5,})(?=\/|$)/gi, '/{id}');

export function makeReadClient({ fetchFn = fetch, token, sleep = ms => new Promise(r => setTimeout(r, ms)) }) {
  async function get(path) {
    const url = path.startsWith('http') ? path : API + path;
    for (let attempt = 0; ; attempt++) {
      const res = await fetchFn(url, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 429 && attempt < 3) { await sleep(2000 * (attempt + 1)); continue; }
      let json = null; try { json = await res.json(); } catch { json = null; }
      if (!res.ok) {
        const errs = (json?.errors ?? []).map(e => [e.code, e.title].filter(Boolean).join(': ')).filter(Boolean).join('; ');
        const err = new Error(`GET ${safePath(path)} → ${res.status}${errs ? ` (${errs})` : ''}`); err.status = res.status; throw err;
      }
      return json;
    }
  }
  /** Wszystkie strony listy (links.next); zwraca { data, included } — `included` to zasoby dołączone przez `include`. */
  async function list(path, limit = 200) {
    const data = []; const included = [];
    let next = path + (path.includes('?') ? '&' : '?') + `limit=${limit}`;
    while (next) { const j = await get(next); data.push(...(j?.data ?? [])); included.push(...(j?.included ?? [])); next = j?.links?.next ?? null; }
    return { data, included };
  }
  return { get, list };
}
