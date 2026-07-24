#!/usr/bin/env node
// Merge AppSumo deep-dive results (asout*.json) into products.json + inventory.json:
// licenseTiers (what each tier/# codes unlocks), reviews {rating,count}, appsumoUrl, appsumoImage.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SCRATCH = process.env.SCRATCH || '/tmp/claude-1000/-home-jrdevelopr/a54e093a-5970-4741-a78a-8267be64db82/scratchpad';

const files = { 'data/products.json': null, 'data/inventory.json': null };
for (const f in files) files[f] = fs.existsSync(path.join(ROOT, f)) ? JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')) : [];
const bySlug = new Map();
for (const f in files) for (const p of files[f]) bySlug.set(p.slug, p);

let found = 0, tiers = 0, rated = 0, imgs = 0;
for (let i = 0; i < 16; i++) {
  const fp = path.join(SCRATCH, `asout${i}.json`);
  if (!fs.existsSync(fp)) continue;
  let arr; try { arr = JSON.parse(fs.readFileSync(fp, 'utf8')); }
  catch (e) { console.warn(`skip asout${i}.json (${e.message})`); continue; }
  for (const e of arr) {
    const p = bySlug.get(e.slug);
    if (!p || !e || !e.found) continue;
    found++;
    if (e.appsumoUrl) p.appsumoUrl = e.appsumoUrl;
    if (Array.isArray(e.tiers) && e.tiers.length) {
      p.licenseTiers = e.tiers.filter(t => t && t.label && Array.isArray(t.features) && t.features.length)
        .map(t => ({ label: t.label, features: t.features.slice(0, 8) }));
      if (p.licenseTiers.length) tiers++;
    }
    if (e.rating) { p.reviews = { rating: String(e.rating), count: e.reviewCount ? String(e.reviewCount) : '' }; rated++; }
    if (e.heroImage && /^https?:\/\//.test(e.heroImage)) { p.appsumoImage = e.heroImage; imgs++; }
    if (Array.isArray(e.highlights) && e.highlights.length) p.highlights = e.highlights.slice(0, 5);
  }
}
for (const f in files) fs.writeFileSync(path.join(ROOT, f), JSON.stringify(files[f], null, 2));
const total = files['data/products.json'].length + files['data/inventory.json'].length;
console.log(`AppSumo merge: ${found}/${total} products matched a deal page`);
console.log(`  with tier tables: ${tiers}, with ratings: ${rated}, with candidate images: ${imgs}`);
const noTier = [...bySlug.values()].filter(p => !p.licenseTiers).map(p => p.name);
console.log(`  no tier table (${noTier.length}): ${noTier.join(', ')}`);
