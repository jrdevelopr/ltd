// Password hashing and session cookies for the admin, on WebCrypto.
//
// The old admin used Node's scrypt, which Workers do not have, so this is PBKDF2-SHA256.
// The iteration count is stored next to the hash so it can be raised later without
// breaking existing logins. It is deliberately moderate: the free Workers plan allows
// about 10 ms of CPU per request, and a login must fit inside that. Brute force is
// answered by the per-IP attempt limit in admin.js rather than by hash cost alone.
export const PBKDF2_ITERATIONS = 20000; // measured ~6-7 ms CPU on the free plan; raise on Workers Paid
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16)));

export async function hashPassword(password, saltHex, iterations = PBKDF2_ITERATIONS) {
  const salt = saltHex ? unhex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return { hash: hex(bits), salt: hex(salt), iterations };
}

function equal(a, b) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function verifyPassword(password, admin) {
  const { hash } = await hashPassword(password, admin.salt, Number(admin.iterations) || PBKDF2_ITERATIONS);
  return equal(hash, admin.hash);
}

export const SESSION_HOURS = 12;
export const COOKIE = 'ltdadm';

async function hmac(secretHex, msg) {
  const key = await crypto.subtle.importKey('raw', unhex(secretHex), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}

export function newSecret() { return hex(crypto.getRandomValues(new Uint8Array(32))); }

export async function issueSession(secretHex) {
  const exp = Date.now() + SESSION_HOURS * 3600 * 1000;
  const sig = await hmac(secretHex, `admin.${exp}`);
  return `${COOKIE}=${exp}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_HOURS * 3600}`;
}
export const clearSession = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export async function checkSession(request, secretHex) {
  if (!secretHex) return false;
  const c = (request.headers.get('cookie') || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(COOKIE + '='));
  if (!c) return false;
  const [exp, sig] = c.slice(COOKIE.length + 1).split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return equal(await hmac(secretHex, `admin.${exp}`), sig);
}
