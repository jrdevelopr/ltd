import { checkout } from './checkout.js';
// Fallback only. The asset layer serves every real file directly and never
// reaches this code, so these requests stay free and unmetered. Only
// directory-style paths ("/", "/p/") land here, because html_handling is
// "none" and the asset layer will not invent index.html for them. We keep
// html_handling off so that /p/thing.html serves as-is instead of being
// 307-redirected to /p/thing, which would change every indexed product URL.
const SECURITY = {
  'Content-Security-Policy':
    "default-src 'self'; base-uri 'self'; form-action 'self' https://www.paypal.com; " +
    "object-src 'none'; frame-ancestors 'none'; img-src 'self' data: https://*.stripe.com; " +
    "style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://js.stripe.com " +
    "https://static.cloudflareinsights.com; connect-src 'self' https://api.stripe.com " +
    "https://checkout.stripe.com https://m.stripe.com https://cloudflareinsights.com; " +
    "frame-src https://js.stripe.com https://checkout.stripe.com https://m.stripe.com; " +
    "font-src 'self' data:",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), usb=(), interest-cohort=()',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Card checkout. This used to be a Caddy route to the admin service on the
    // lab box; it moved here when the storefront left that box.
    if (url.pathname === '/api/stripe-checkout') return checkout(request, env);
    const last = url.pathname.split('/').pop();
    const path = url.pathname.endsWith('/') ? url.pathname + 'index.html'
      : last.includes('.') ? url.pathname
      : url.pathname + '/index.html';
    const res = await env.ASSETS.fetch(new URL(path, url));
    // _headers does not apply to responses returned from Worker code, so the
    // same headers are set here to keep the security posture identical.
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(SECURITY)) out.headers.set(k, v);
    if (res.status === 200) out.headers.set('Cache-Control', 'public, max-age=300, must-revalidate');
    return out;
  },
};
