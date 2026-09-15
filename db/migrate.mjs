// One-time migration: data/products.json + data/inventory.json + data/config.json -> SQL.
// Prints SQL to stdout; pipe into `wrangler d1 execute ltd --remote --file`.
import fs from 'node:fs';
const read = (f) => { try { const j = JSON.parse(fs.readFileSync(`data/${f}.json`, 'utf8')); return Array.isArray(j) ? j : j.products || []; } catch { return []; } };
const cfg = (() => { try { return JSON.parse(fs.readFileSync('data/config.json', 'utf8')); } catch { return {}; } })();
const q = (v) => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const j = (v) => v == null ? 'NULL' : q(JSON.stringify(v));
const out = [];
let sort = 0, units = 0;
for (const [source, arr] of [['products', read('products')], ['inventory', read('inventory')]]) {
  for (const p of arr) {
    out.push(`INSERT INTO products (slug,source,name,descr,homepage,image,local_img,category,offer,tagline,appsumo_url,appsumo_image,inquire_only,license_tiers,reviews,highlights,tier,code_count,multi_date,sort,updated_at) VALUES (${[
      q(p.slug), q(source), q(p.name), q(p.desc), q(p.homepage), q(p.image), q(p.localImg), q(p.category), q(p.offer), q(p.tagline),
      q(p.appsumoUrl), q(p.appsumoImage), p.inquireOnly ? 1 : 0, j(p.licenseTiers), j(p.reviews), j(p.highlights), p.tier == null ? 'NULL' : Number(p.tier), p.codeCount == null ? 'NULL' : Number(p.codeCount), p.multiDate == null ? 'NULL' : (p.multiDate ? 1 : 0), sort++, q(new Date().toISOString()),
    ].join(',')});`);
    (p.units || []).forEach((u, idx) => {
      out.push(`INSERT INTO units (slug,idx,status,price_kind,price,account) VALUES (${[q(p.slug), idx, q(u.status || 'available'), q(u.priceKind || 'fixed'), u.price == null ? 'NULL' : Number(u.price), q(u.account)].join(',')});`);
      units++;
    });
  }
}
for (const [k, v] of Object.entries(cfg)) out.push(`INSERT INTO config (key,value) VALUES (${q(k)},${q(typeof v === 'string' ? v : JSON.stringify(v))});`);
fs.writeFileSync('db/seed.sql', out.join('\n') + '\n');
console.error(`seed.sql: ${sort} products, ${units} units, ${Object.keys(cfg).length} config keys`);
