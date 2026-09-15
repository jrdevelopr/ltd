// The card-checkout endpoint, ported from admin/server.js when the storefront
// moved to a Worker. Logic is deliberately identical: the client sends only a
// slug and unit index, and every price and name is read from the database, so a
// caller cannot influence what they are charged and an admin edit is live at once.
import { loadProduct } from './db.js';

const ORIGIN = 'https://ltd.jrdevelopr.com';

// Same shape as the original limiter: 30 attempts per IP per 10 minutes. This
// counts per isolate rather than per process, so it is a speed bump rather than
// a hard cap; Stripe and the server-side price lookup are the real protection.
const seen = new Map();
function limited(ip) {
  const now = Date.now();
  const arr = (seen.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  arr.push(now);
  seen.set(ip, arr);
  return arr.length > 30;
}

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export async function checkout(request, env) {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  if (!env.STRIPE_SECRET_KEY) return json(503, { error: 'Card payments are not configured yet.' });
  if (limited(request.headers.get('cf-connecting-ip') || 'unknown')) {
    return json(429, { error: 'Too many attempts — try again in a few minutes.' });
  }
  try {
    const { slug, unit, embed } = await request.json();
    const prod = await loadProduct(env.DB, slug);
    if (!prod || prod.status !== 'available' || prod.inquireOnly) {
      return json(404, { error: 'Not available for card checkout.' });
    }
    const i = Math.floor(Number(unit)) || 0;
    const u = prod.units?.[i];
    if (!u || u.status !== 'available' || u.priceKind !== 'fixed' || !(u.price > 0)) {
      return json(400, { error: 'That license is not card-buyable.' });
    }
    const name = `${prod.name}${u.account ? ` (${u.account})` : ''} - Lifetime Deal`.slice(0, 124);
    const q = new URLSearchParams();
    q.set('mode', 'payment');
    q.set('payment_method_types[0]', 'card');
    if (embed === true) {
      q.set('ui_mode', 'embedded');
      q.set('return_url', `${ORIGIN}/thanks.html?session_id={CHECKOUT_SESSION_ID}`);
    } else {
      q.set('success_url', `${ORIGIN}/thanks.html?session_id={CHECKOUT_SESSION_ID}`);
      q.set('cancel_url', `${ORIGIN}/p/${prod.slug}.html`);
    }
    q.set('line_items[0][quantity]', '1');
    q.set('line_items[0][price_data][currency]', 'usd');
    q.set('line_items[0][price_data][unit_amount]', String(Math.round(u.price * 100)));
    q.set('line_items[0][price_data][product_data][name]', name);
    q.set('metadata[slug]', prod.slug);
    q.set('metadata[unit]', String(i));
    const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: q.toString(),
    });
    const session = await resp.json();
    if (!resp.ok) {
      console.log('stripe error:', session?.error?.message);
      return json(502, { error: 'Could not start card checkout.' });
    }
    return json(200, embed === true ? { clientSecret: session.client_secret } : { url: session.url });
  } catch (e) {
    return json(500, { error: String(e?.message || e) });
  }
}
