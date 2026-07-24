#!/usr/bin/env node
// Download each product's hero image locally (never hotlink). SVG lettered-tile fallback.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const IMGDIR = path.join(ROOT, 'site', 'img');
fs.mkdirSync(IMGDIR, { recursive: true });
const DATAFILE = process.env.DATAFILE || 'data/products.json';
const products = JSON.parse(fs.readFileSync(path.join(ROOT, DATAFILE), 'utf8'));
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' };

function hue(s){let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))>>>0;return h%360;}
function initials(name){
  const w=name.replace(/[^a-zA-Z0-9 ]/g,'').split(/\s+/).filter(Boolean);
  return ((w[0]?.[0]||'S')+(w[1]?.[0]||w[0]?.[1]||'')).toUpperCase();
}
function fallback(p){
  const h=hue(p.name), c1=`hsl(${h} 70% 52%)`, c2=`hsl(${(h+40)%360} 70% 42%)`;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 300">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
<rect width="480" height="300" fill="url(#g)"/>
<text x="240" y="150" font-family="Segoe UI,Arial,sans-serif" font-size="120" font-weight="800" fill="rgba(255,255,255,.92)" text-anchor="middle" dominant-baseline="central">${initials(p.name)}</text>
<text x="240" y="250" font-family="Segoe UI,Arial,sans-serif" font-size="24" font-weight="600" fill="rgba(255,255,255,.85)" text-anchor="middle">${(p.name||'').slice(0,26).replace(/[<&>]/g,'')}</text></svg>`;
  fs.writeFileSync(path.join(IMGDIR, p.slug + '.svg'), svg);
  return 'img/' + p.slug + '.svg';
}

let ok = 0, fell = 0;
for (const p of products) {
  let done = false;
  if (p.image && /^https?:\/\//.test(p.image)) {
    const tmp = path.join('/tmp', 'ltdimg_' + p.slug);
    try {
      execFileSync('curl', ['-sL', '--max-time', '25', '-A', UA, '-o', tmp, p.image], { stdio: 'ignore' });
      const mime = execFileSync('file', ['-b', '--mime-type', tmp]).toString().trim();
      const size = fs.statSync(tmp).size;
      if (EXT[mime] && size > 800) {
        const dest = 'img/' + p.slug + '.' + EXT[mime];
        fs.copyFileSync(tmp, path.join(ROOT, 'site', dest));
        p.localImg = dest; ok++; done = true;
      }
      fs.unlinkSync(tmp);
    } catch (e) { /* fall through */ }
  }
  if (!done) { p.localImg = fallback(p); fell++; }
}
fs.writeFileSync(path.join(ROOT, DATAFILE), JSON.stringify(products, null, 2));
console.log(`images (${DATAFILE}): ${ok} downloaded, ${fell} lettered-tile fallbacks`);
