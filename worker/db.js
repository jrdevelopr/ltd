// D1 access for the storefront and the admin. Rows are returned in the exact shape
// data/products.json used to have, so the renderer (ported verbatim) and the
// checkout code see no difference between the old JSON and the database.
//
// Derived fields (status, availCount, soldCount, minPrice, soldPrice) are computed
// here from the units, with the same rules bin/parse.js and the old admin used.
// They are never stored, so they can never drift from the units.

const parse = (s) => { if (s == null) return undefined; try { return JSON.parse(s); } catch { return undefined; } };

function derive(units) {
  const avail = units.filter((u) => u.status === 'available');
  const sold = units.filter((u) => u.status === 'sold');
  const fixed = avail.filter((u) => u.priceKind === 'fixed' && u.price != null).map((u) => u.price);
  const soldFixed = sold.filter((u) => u.price != null).map((u) => u.price);
  return {
    status: avail.length ? 'available' : 'sold',
    availCount: avail.length,
    soldCount: sold.length,
    minPrice: fixed.length ? Math.min(...fixed) : null,
    soldPrice: soldFixed.length ? Math.max(...soldFixed) : null,
  };
}

function shape(row, units) {
  const p = {
    slug: row.slug, name: row.name, desc: row.descr ?? undefined, homepage: row.homepage ?? undefined,
    image: row.image ?? undefined, localImg: row.local_img ?? undefined, category: row.category ?? undefined,
    offer: row.offer ?? undefined, tagline: row.tagline ?? undefined, appsumoUrl: row.appsumo_url ?? undefined,
    appsumoImage: row.appsumo_image ?? undefined, inquireOnly: !!row.inquire_only,
    licenseTiers: parse(row.license_tiers), reviews: parse(row.reviews), highlights: parse(row.highlights),
    tier: row.tier ?? undefined, codeCount: row.code_count ?? undefined,
    multiDate: row.multi_date == null ? undefined : !!row.multi_date,
    units: units.map((u) => ({ status: u.status, priceKind: u.price_kind, price: u.price, account: u.account ?? '' })),
  };
  return Object.assign(p, derive(p.units));
}

// Columns the index page and the topbar need. The JSON text columns (license tiers,
// reviews, highlights) are only read for the single product page being rendered:
// parsing them for all 95 products on every request was most of the render's CPU.
const LIGHT = 'slug,source,name,descr,homepage,image,local_img,category,offer,tagline,appsumo_url,appsumo_image,inquire_only,tier,code_count,multi_date,sort';

// Whole catalogue: `products` is every item sorted by name (what the renderer wants),
// `forSale` / `inventory` are the two old files in their stored order (what the admin wants).
// Pass { full: true } to include the JSON columns (the admin API wants them).
// The light form is memoised per isolate for a minute; invalidateCatalogue() drops it.
const CAT_TTL = 60 * 1000;
let catMemo = null; // { exp, value }
export function invalidateCatalogue() { catMemo = null; }
export async function loadCatalogue(db, { full = false } = {}) {
  if (!full && catMemo && catMemo.exp > Date.now()) return catMemo.value;
  const value = await readCatalogue(db, full);
  if (!full) catMemo = { exp: Date.now() + CAT_TTL, value };
  return value;
}
async function readCatalogue(db, full) {
  const [pr, un, cf] = await Promise.all([
    db.prepare(`SELECT ${full ? '*' : LIGHT} FROM products ORDER BY sort, slug`).all(),
    db.prepare('SELECT * FROM units ORDER BY slug, idx').all(),
    db.prepare('SELECT key, value FROM config').all(),
  ]);
  const bySlug = new Map();
  for (const u of un.results) { if (!bySlug.has(u.slug)) bySlug.set(u.slug, []); bySlug.get(u.slug).push(u); }
  const all = pr.results.map((r) => ({ source: r.source, p: shape(r, bySlug.get(r.slug) || []) }));
  const config = Object.fromEntries(cf.results.map((r) => [r.key, r.value]));
  return {
    products: all.map((x) => x.p).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())),
    forSale: all.filter((x) => x.source === 'products').map((x) => x.p),
    inventory: all.filter((x) => x.source === 'inventory').map((x) => x.p),
    config,
  };
}

export async function loadProduct(db, slug) {
  const row = await db.prepare('SELECT * FROM products WHERE slug = ?').bind(slug).first();
  if (!row) return null;
  const un = await db.prepare('SELECT * FROM units WHERE slug = ? ORDER BY idx').bind(slug).all();
  return shape(row, un.results);
}

// The old admin's applyPatch(), applied to the database instead of a JSON file.
// Same field limits, same unit rules, same "priced means for sale" behaviour.
export async function savePatch(db, source, slug, patch) {
  if (source !== 'products' && source !== 'inventory') throw Object.assign(new Error('bad file'), { status: 400 });
  const row = await db.prepare('SELECT * FROM products WHERE slug = ? AND source = ?').bind(slug, source).first();
  if (!row) throw Object.assign(new Error('no such product'), { status: 404 });
  const cur = await loadProduct(db, slug);
  const p = { category: cur.category, tagline: cur.tagline, offer: cur.offer, inquireOnly: cur.inquireOnly, units: cur.units };
  if (typeof patch.category === 'string') p.category = patch.category.slice(0, 60);
  if (typeof patch.tagline === 'string') p.tagline = patch.tagline.slice(0, 120);
  if (typeof patch.offer === 'string') p.offer = patch.offer.slice(0, 1200);
  if (typeof patch.inquireOnly === 'boolean') p.inquireOnly = patch.inquireOnly;
  if (Array.isArray(patch.units)) {
    p.units = patch.units.slice(0, 20).map((u, i) => {
      const prev = cur.units[i] || {};
      const price = (u.price === null || u.price === '' || u.price === undefined) ? null : Math.max(0, Number(u.price) || 0) || null;
      return {
        status: u.status === 'sold' ? 'sold' : 'available',
        priceKind: price != null ? 'fixed' : (p.inquireOnly ? 'inquire' : 'offer'),
        price,
        account: typeof u.account === 'string' ? u.account.slice(0, 120) : (prev.account || ''),
      };
    });
  }
  if (derive(p.units).minPrice != null && p.inquireOnly) p.inquireOnly = false; // priced -> for sale
  const stmts = [
    db.prepare('UPDATE products SET category=?, tagline=?, offer=?, inquire_only=?, updated_at=? WHERE slug=?')
      .bind(p.category ?? null, p.tagline ?? null, p.offer ?? null, p.inquireOnly ? 1 : 0, new Date().toISOString(), slug),
    db.prepare('DELETE FROM units WHERE slug=?').bind(slug),
    ...p.units.map((u, i) => db.prepare('INSERT INTO units (slug, idx, status, price_kind, price, account) VALUES (?,?,?,?,?,?)')
      .bind(slug, i, u.status, u.priceKind, u.price, u.account || null)),
  ];
  await db.batch(stmts); // one transaction: the product is never seen half-updated
  return loadProduct(db, slug);
}

export async function getConfig(db) {
  const r = await db.prepare('SELECT key, value FROM config').all();
  return Object.fromEntries(r.results.map((x) => [x.key, x.value]));
}
export async function setConfig(db, obj) {
  await db.batch(Object.entries(obj).map(([k, v]) =>
    db.prepare('INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, v)));
}

// Admin credentials live in the same database under a tiny key/value table.
export async function getAdmin(db) {
  const r = await db.prepare('SELECT key, value FROM admin').all();
  const o = Object.fromEntries(r.results.map((x) => [x.key, x.value]));
  return o.hash ? o : null;
}
export async function setAdmin(db, obj) {
  await db.batch(Object.entries(obj).map(([k, v]) =>
    db.prepare('INSERT INTO admin (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, v)));
}
