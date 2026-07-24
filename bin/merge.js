#!/usr/bin/env node
// Merge enrichment out*.json (from research agents) into data/products.json
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SCRATCH = process.env.SCRATCH || '/tmp/claude-1000/-home-jrdevelopr/a54e093a-5970-4741-a78a-8267be64db82/scratchpad';
const DATAFILE = process.env.DATAFILE || 'data/products.json';   // which dataset to enrich
const OUTPREFIX = process.env.OUTPREFIX || 'out';                // scratchpad enrichment file prefix
const products = JSON.parse(fs.readFileSync(path.join(ROOT, DATAFILE), 'utf8'));
const bySlug = new Map(products.map(p => [p.slug, p]));

let merged = 0, imgs = 0;
for (let i = 0; i < 12; i++) {
  const f = path.join(SCRATCH, `${OUTPREFIX}${i}.json`);
  if (!fs.existsSync(f)) continue;
  let arr;
  try { arr = JSON.parse(fs.readFileSync(f, 'utf8')); }
  catch (e) { console.warn(`skip out${i}.json (parse error: ${e.message})`); continue; }
  for (const e of arr) {
    const p = bySlug.get(e.slug);
    if (!p) { console.warn(`  no product for slug ${e.slug}`); continue; }
    if (e.category) p.category = e.category;
    if (e.tagline) p.tagline = e.tagline;
    if (e.offer) p.offer = e.offer;
    if (e.officialUrl && !p.homepage) p.homepage = e.officialUrl;
    // prefer an existing imgur image; else take the researched one as remote src
    if (e.imageUrl && !p.image) { p.image = e.imageUrl; imgs++; }
    merged++;
  }
}
fs.writeFileSync(path.join(ROOT, DATAFILE), JSON.stringify(products, null, 2));
const noCat = products.filter(p => !p.category).map(p => p.name);
const noImg = products.filter(p => !p.image).map(p => p.name);
const noOffer = products.filter(p => !p.offer).map(p => p.name);
console.log(`merged enrichment for ${merged} entries (+${imgs} new image srcs)`);
console.log(`missing category (${noCat.length}): ${noCat.join(', ') || 'none'}`);
console.log(`missing image src (${noImg.length}): ${noImg.join(', ') || 'none'}`);
console.log(`missing offer copy (${noOffer.length}): ${noOffer.join(', ') || 'none'}`);
