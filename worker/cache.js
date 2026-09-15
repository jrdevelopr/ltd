// Short-lived in-memory cache for rendered pages, one per isolate.
//
// Why not the Cache API: pages served from Cloudflare's cache get the zone's
// Browser Cache TTL stamped onto them (four hours by default), which would let a
// visitor's browser keep a stale price long after an admin changed it. Holding the
// render in isolate memory for a minute keeps D1 reads and render CPU low while the
// response still carries max-age=0, so browsers revalidate on every load and see
// an edit within a minute anywhere in the world.
import { invalidateCatalogue } from './db.js';

const TTL_MS = 60 * 1000;
const memo = new Map(); // url -> { exp, status, body, headers }

export async function cached(request, ctx, produce) {
  const key = new URL(request.url).pathname;
  const hit = memo.get(key);
  if (hit && hit.exp > Date.now()) return new Response(hit.body, { status: hit.status, headers: hit.headers });
  const res = await produce();
  if (res.ok) {
    const body = await res.clone().text();
    memo.set(key, { exp: Date.now() + TTL_MS, status: res.status, body, headers: [...res.headers] });
  }
  return res;
}

// The admin calls this after a save so its own next view is fresh at once. Other
// isolates and other colos simply age out within TTL_MS.
export async function purge(origin, slug) {
  invalidateCatalogue();
  memo.delete('/'); memo.delete('/index.html');
  if (slug) memo.delete(`/p/${slug}.html`);
}
