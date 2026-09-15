// The admin, moved from admin/server.js (a LAN-only Node process) onto the Worker.
// Same pages, same routes, same rules; the JSON files became D1 and the
// "rebuild the site" step disappeared because pages render from D1 on request.
//
// Reachability changed: this now answers on the public hostname at /admin, where
// the old one was only on the LAN. Login is rate limited per IP and the password
// is PBKDF2-hashed; a Cloudflare Access rule on /admin* would add a second wall.
import { SETUP_PAGE, LOGIN_PAGE, APP_PAGE } from './admin-pages.js';
import { getAdmin, setAdmin, loadCatalogue, savePatch, setConfig } from './db.js';
import { hashPassword, verifyPassword, issueSession, clearSession, checkSession, newSecret } from './auth.js';

const attempts = new Map(); // ip -> [timestamps]; 10 tries per 10 minutes, per isolate
const WINDOW = 10 * 60 * 1000;
function rateLimited(ip) {
  const now = Date.now();
  const arr = (attempts.get(ip) || []).filter((t) => now - t < WINDOW);
  attempts.set(ip, arr);
  return arr.length >= 10;
}
const noteAttempt = (ip) => (attempts.get(ip) || attempts.set(ip, []).get(ip)).push(Date.now());

const html = (status, s, extra = {}) =>
  new Response(s, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...extra } });
const json = (status, o, cookie) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...(cookie ? { 'set-cookie': cookie } : {}) } });
const redirect = (to, cookie) =>
  new Response(null, { status: 302, headers: { location: to, ...(cookie ? { 'set-cookie': cookie } : {}) } });

export async function admin(request, env, ctx, purge) {
  const url = new URL(request.url);
  const p = url.pathname;
  const ip = request.headers.get('cf-connecting-ip') || '?';
  const adm = await getAdmin(env.DB);

  // First run: no password yet. Anything under /admin shows the setup screen.
  if (!adm) {
    if (request.method === 'POST' && p === '/admin/setup') {
      const f = new URLSearchParams(await request.text());
      const pw = f.get('pw') || '', pw2 = f.get('pw2') || '';
      if (pw.length < 8 || pw !== pw2) return html(400, SETUP_PAGE);
      const { hash, salt, iterations } = await hashPassword(pw);
      const secret = newSecret();
      await setAdmin(env.DB, { user: 'admin', hash, salt, iterations: String(iterations), secret });
      return redirect('/admin', await issueSession(secret));
    }
    if (p.startsWith('/api/')) return json(401, { error: 'unauthorized' });
    return html(200, SETUP_PAGE);
  }

  if (request.method === 'POST' && p === '/admin/login') {
    if (rateLimited(ip)) return html(429, LOGIN_PAGE('Too many attempts — wait 10 minutes.'));
    const f = new URLSearchParams(await request.text());
    noteAttempt(ip);
    if ((f.get('user') || 'admin') === (adm.user || 'admin') && await verifyPassword(f.get('pw') || '', adm)) {
      return redirect('/admin', await issueSession(adm.secret));
    }
    return html(401, LOGIN_PAGE('Wrong username or password.'));
  }
  if (p === '/admin/logout') return redirect('/admin', clearSession());

  const authed = await checkSession(request, adm.secret);
  if (p === '/admin' || p === '/admin/') return html(200, authed ? APP_PAGE : LOGIN_PAGE(''));
  if (!authed) return json(401, { error: 'unauthorized' });

  if (p === '/api/products') {
    const c = await loadCatalogue(env.DB, { full: true });
    return json(200, { data: { products: c.forSale, inventory: c.inventory }, config: c.config });
  }
  if (request.method === 'POST' && p === '/api/save') {
    try {
      const { file, slug, patch } = await request.json();
      await savePatch(env.DB, file, slug, patch || {});
      ctx.waitUntil(purge(url.origin, slug));
      return json(200, { ok: true });
    } catch (e) { return json(e.status || 500, { error: String(e.message || e) }); }
  }
  if (request.method === 'POST' && p === '/api/config') {
    try {
      const { messengerUrl = '', inquireEmail = '' } = await request.json();
      if (messengerUrl && !/^https:\/\//.test(messengerUrl)) return json(400, { error: 'messenger link must be https' });
      const cfg = { messengerUrl: String(messengerUrl).slice(0, 200) };
      if (inquireEmail) cfg.inquireEmail = String(inquireEmail).slice(0, 120);
      await setConfig(env.DB, cfg);
      ctx.waitUntil(purge(url.origin));
      return json(200, { ok: true });
    } catch (e) { return json(500, { error: String(e.message || e) }); }
  }
  if (request.method === 'POST' && p === '/api/password') {
    try {
      const { current = '', next = '' } = await request.json();
      if (!(await verifyPassword(String(current), adm))) return json(403, { error: 'Current password is wrong.' });
      if (String(next).length < 8) return json(400, { error: 'New password must be at least 8 characters.' });
      const { hash, salt, iterations } = await hashPassword(String(next));
      const secret = newSecret(); // a new signing secret logs every other device out
      await setAdmin(env.DB, { hash, salt, iterations: String(iterations), secret });
      return json(200, { ok: true }, await issueSession(secret));
    } catch (e) { return json(500, { error: String(e.message || e) }); }
  }
  // The old "publish to GitHub" step has no meaning now: every save is already live.
  if (request.method === 'POST' && p === '/api/publish') return json(200, { ok: true, pushed: false });
  return json(404, { error: 'not found' });
}
