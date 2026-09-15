// LTD Software Vault on a Cloudflare Worker.
//
//   /                    storefront index, rendered from D1, edge-cached 60 s
//   /p/<slug>.html       product page, same
//   /api/stripe-checkout card checkout (public, prices from D1)
//   /admin, /api/*       the admin and its cookie-gated JSON API
//   everything else      static assets (img/, style.css, thanks.html), served free
//                        by the asset layer before this code runs
import { checkout } from './checkout.js';
import { admin } from './admin.js';
import { loadCatalogue, loadProduct } from './db.js';
import { makeRenderer } from './render.js';
import { cached, purge } from './cache.js';

// Same headers site/_headers gives the static files, so the two paths match.
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
function secure(res, cacheControl) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY)) out.headers.set(k, v);
  if (cacheControl) out.headers.set('cache-control', cacheControl);
  return out;
}
const NOT_FOUND = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Not found — LTD Software Vault</title>
<link rel="stylesheet" href="/style.css"></head><body><div class="wrap" style="padding:60px 20px;max-width:640px;margin:0 auto">
<h1>That one isn't here</h1><p>The listing may have been removed. <a href="/">Back to the full list.</a></p></div></body></html>`;

async function renderPage(env, kind, slug) {
  // The renderer needs every product only for counts in the top bar, so the light,
  // memoised catalogue serves that; a product page adds one full row for itself.
  const cat = await loadCatalogue(env.DB);
  const r = makeRenderer(cat.products, cat.config);
  if (kind === 'index') return r.index();
  const p = await loadProduct(env.DB, slug);
  return p ? r.product(p) : null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/stripe-checkout') return secure(await checkout(request, env));
    if (path === '/admin' || path.startsWith('/admin/') || path.startsWith('/api/')) {
      return secure(await admin(request, env, ctx, purge));
    }

    const m = path.match(/^\/p\/([A-Za-z0-9._-]+)\.html$/);
    const kind = path === '/' || path === '/index.html' ? 'index' : m ? 'product' : null;
    if (kind && (request.method === 'GET' || request.method === 'HEAD')) {
      return cached(request, ctx, async () => {
        const body = await renderPage(env, kind, m && m[1]);
        if (body == null) return secure(new Response(NOT_FOUND, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } }));
        return secure(new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } }), 'public, max-age=0, must-revalidate');
      });
    }

    // Anything else that reached the Worker is a directory-style path the asset
    // layer would not resolve on its own (html_handling is off). Map it to the
    // matching index.html in the assets, or 404.
    const last = path.split('/').pop();
    const target = path.endsWith('/') ? path + 'index.html' : last.includes('.') ? path : path + '/index.html';
    const res = await env.ASSETS.fetch(new URL(target, url));
    return secure(res, res.status === 200 ? 'public, max-age=300, must-revalidate' : undefined);
  },
};
