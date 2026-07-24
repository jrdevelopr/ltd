#!/usr/bin/env node
// Parse the raw software CSV into a clean grouped products.json.
// Groups multiple license "accounts" of the same product into one product with N units.
const fs = require('fs');
const path = require('path');

const CSV = path.join(__dirname, '..', 'data', 'software.csv');

// --- minimal RFC4180 CSV parser ---
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const raw = fs.readFileSync(CSV, 'utf8');
const rows = parseCSV(raw);

// header is row index 1 (row 0 is a note): Status,Software Title,Price,Description,Account,Link,Misc
const dataRows = rows.slice(2).filter(r => (r[1] || '').trim() && (r[0] || '').trim());

const IMGUR = /(https?:\/\/i\.imgur\.com\/\S+?\.(?:png|jpe?g|gif))/i;
const URLRE = /(https?:\/\/[^\s,]+)/i;

function parsePrice(s) {
  s = (s || '').trim();
  if (!s) return { kind: 'offer', amount: null };
  if (/not for sale/i.test(s)) return { kind: 'na', amount: null };
  if (/makeoffer|make offer/i.test(s)) return { kind: 'offer', amount: null };
  const n = parseFloat(s.replace(/[^0-9.]/g, ''));
  if (isNaN(n) || n <= 0) return { kind: 'offer', amount: null };
  return { kind: 'fixed', amount: n };
}

// product-grouping key: strip trailing account/tier markers
function productKey(title) {
  let t = title.trim();
  t = t.replace(/\s*[-–]\s*acct\s*\d+/ig, '');
  t = t.replace(/\s*acct\s*\d+/ig, '');
  t = t.replace(/\s*[-–]\s*\d+(st|nd|rd|th)\s+acct/ig, '');
  t = t.replace(/\s*[-–]\s*A\.?I\.?\s+Writer/ig, ''); // "Rytr - A.I Writer"
  t = t.replace(/\s{2,}/g, ' ').trim();
  return t.toLowerCase();
}
// display name for the product (prettier of the grouped titles)
function displayName(title) {
  let t = title.trim();
  t = t.replace(/\s*[-–]\s*acct\s*\d+/ig, '');
  t = t.replace(/\s*acct\s*\d+/ig, '');
  t = t.replace(/\s*[-–]\s*\d+(st|nd|rd|th)\s+acct/ig, '');
  t = t.replace(/\s*[-–]\s*A\.?I\.?\s+Writer/ig, ''); // "Rytr - A.I Writer" -> "Rytr"
  t = t.replace(/\s{2,}/g, ' ').trim();
  return t;
}

const groups = new Map();
for (const r of dataRows) {
  const status = (r[0] || '').trim().toLowerCase();     // available | sold
  const title = (r[1] || '').trim();
  const price = parsePrice(r[2]);
  const desc = (r[3] || '').trim().replace(/\s*https?:\/\/\S+/g, '').trim();
  const account = (r[4] || '').trim();
  const link = (r[5] || '').trim();
  const misc = (r[6] || '').trim();

  // find an image url anywhere in link/misc/desc
  let image = '';
  for (const f of [link, misc, r[3] || '']) {
    const m = f.match(IMGUR); if (m) { image = m[1]; break; }
  }
  // find a homepage url in link (only if it's a real url and not an image)
  let homepage = '';
  const lm = link.match(URLRE);
  if (lm && !IMGUR.test(lm[1]) && !/bit\.ly/i.test(lm[1])) homepage = lm[1];

  const key = productKey(title);
  if (!groups.has(key)) {
    groups.set(key, {
      key,
      name: displayName(title),
      desc: '',
      homepage: '',
      image: '',
      units: [],
    });
  }
  const g = groups.get(key);
  if (desc && desc.length > g.desc.length) g.desc = desc;
  if (homepage && !g.homepage) g.homepage = homepage;
  if (image && !g.image) g.image = image;
  g.units.push({ status: status === 'sold' ? 'sold' : 'available', price, account, rawTitle: title });
}

// summarize each product
const products = [...groups.values()].map(g => {
  const avail = g.units.filter(u => u.status === 'available');
  const sold = g.units.filter(u => u.status === 'sold');
  const fixedPrices = avail.filter(u => u.price.kind === 'fixed').map(u => u.price.amount);
  const minPrice = fixedPrices.length ? Math.min(...fixedPrices) : null;
  const soldPrices = sold.filter(u => u.price.kind === 'fixed').map(u => u.price.amount);
  const soldPrice = soldPrices.length ? Math.max(...soldPrices) : null;
  const status = avail.length ? 'available' : 'sold';
  const slug = g.key.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    slug,
    name: g.name,
    desc: g.desc,
    homepage: g.homepage,
    image: g.image,        // remote src (imgur) if any; enrichment fills the rest
    localImg: '',          // filled after download
    status,
    availCount: avail.length,
    soldCount: sold.length,
    minPrice,
    soldPrice,
    units: g.units.map(u => ({
      status: u.status,
      priceKind: u.price.kind,
      price: u.price.amount,
      account: u.account,
    })),
    // enrichment fields (filled later)
    category: '',
    offer: '',
    tagline: '',
  };
}).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

fs.writeFileSync(path.join(__dirname, '..', 'data', 'products.json'), JSON.stringify(products, null, 2));

// report
const totAvail = products.reduce((n, p) => n + p.availCount, 0);
const totSold = products.reduce((n, p) => n + p.soldCount, 0);
console.log(`products (grouped): ${products.length}`);
console.log(`units — available: ${totAvail}, sold: ${totSold}`);
console.log(`with imgur image: ${products.filter(p => p.image).length}`);
console.log(`with homepage url: ${products.filter(p => p.homepage).length}`);
console.log('\n=== groups with >1 unit ===');
for (const p of products.filter(p => p.units.length > 1))
  console.log(`  ${p.name}: ${p.availCount} avail / ${p.soldCount} sold  (prices: ${p.units.map(u=>u.price||u.priceKind).join(', ')})`);
console.log('\n=== all product names ===');
console.log(products.map(p => `${p.status==='sold'?'[SOLD] ':''}${p.name}${p.minPrice?` $${p.minPrice}`:' (offer)'}`).join('\n'));
