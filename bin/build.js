#!/usr/bin/env node
// Build the static storefront from data/products.json into site/index.html + site/p/<slug>.html
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SITE = path.join(ROOT, 'site');
const products = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'products.json'), 'utf8'));

const PAYPAL_EMAIL = 'paypal@shrockservice.com';  // receives Buy Now payments (carries item name + id)
const SITE_URL = 'https://ltd.jrdevelopr.com';
const SITE_NAME = 'LTD Software Vault';

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const img = p => p.localImg || `img/${p.slug}.svg`;

// PayPal "Buy Now" (Payments Standard _xclick) — sends item_name + item_number so the
// seller sees exactly which product/license was paid for. amount omitted => buyer sets it (offers).
function payForm(amount, itemName, itemNumber, btnClass, btnHtml) {
  const nm = itemName.length > 124 ? itemName.slice(0, 124) : itemName;
  const amt = amount != null ? `<input type="hidden" name="amount" value="${Number(amount).toFixed(2)}">` : '';
  return `<form action="https://www.paypal.com/cgi-bin/webscr" method="post" target="_blank" rel="noopener" class="payform">
<input type="hidden" name="cmd" value="_xclick">
<input type="hidden" name="business" value="${esc(PAYPAL_EMAIL)}">
<input type="hidden" name="item_name" value="${esc(nm)}">
<input type="hidden" name="item_number" value="${esc(itemNumber)}">
${amt}<input type="hidden" name="currency_code" value="USD">
<input type="hidden" name="no_shipping" value="1">
<button type="submit" class="btn ${btnClass}">${btnHtml}</button>
</form>`;
}

// PayPal wordmark used inside the yellow button
const PP = '<span class="pp"><i>Pay</i><em>Pal</em></span>';
const SEARCH_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>';

function head(title, desc, image, canonical) {
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${canonical}">
${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%232563eb'/><text x='16' y='23' font-size='18' text-anchor='middle' fill='white' font-family='sans-serif' font-weight='bold'>%24</text></svg>">
<link rel="stylesheet" href="${canonical === SITE_URL + '/' ? '' : '../'}style.css">
<script>(function(){var t=localStorage.getItem('theme');if(t)document.documentElement.setAttribute('data-theme',t);})();</script>
</head><body>`;
}

const topbar = rel => `<div class="topbar"><div class="wrap">
<a class="brand" href="${rel}index.html"><span class="dot"></span> ${SITE_NAME}</a>
<div class="spacer"></div>
<button class="themebtn" onclick="(function(){var d=document.documentElement,n=d.getAttribute('data-theme')==='dark'?'light':'dark';d.setAttribute('data-theme',n);localStorage.setItem('theme',n);})()">◐ Theme</button>
</div></div>`;

const footer = `<div class="footer wrap">Prices are one-time lifetime-deal transfers. Secure checkout via
<b>PayPal</b> — the product name travels with your payment. Accounts/codes transferred after payment clears. Questions or offers welcome.</div>`;

/* ---------------- index ---------------- */
function buildIndex() {
  const totalAvail = products.reduce((n, p) => n + p.availCount, 0);
  const totalValue = products.reduce((n, p) => n + (p.minPrice ? p.minPrice * p.availCount : 0), 0);
  const cats = [...new Set(products.map(p => p.category).filter(Boolean))].sort();

  // compact client data
  const data = products.map(p => ({
    slug: p.slug, name: p.name, tag: p.tagline || '', cat: p.category || 'Software',
    desc: p.desc || '', status: p.status, avail: p.availCount, sold: p.soldCount,
    min: p.minPrice, soldp: p.soldPrice, img: img(p),
  }));

  const html = head(
    `${SITE_NAME} — Lifetime Deal Software for Sale`,
    `A curated vault of ${totalAvail} lifetime-deal software licenses for sale — WordPress plugins, SaaS tools, AI apps and more. One-time payment, transferred to you.`,
    '', SITE_URL + '/') +
    topbar('') +
    `<div class="wrap hero">
      <h1>Lifetime software deals, one-time price.</h1>
      <p>A personal vault of premium lifetime-deal (LTD) licenses — WordPress plugins, SaaS apps, AI tools and more — going to new owners at a fraction of retail. Browse the list, open any item for details, and grab it with PayPal.</p>
      <div class="stats">
        <div class="stat"><b>${totalAvail}</b><span>licenses available</span></div>
        <div class="stat"><b>${products.filter(p=>p.status==='available').length}</b><span>unique products</span></div>
        <div class="stat"><b>~${money(totalValue)}</b><span>total list value</span></div>
      </div>
      <div class="notice">💡 Every price is a one-time payment. Click a row for the full offer &amp; a PayPal button.</div>
    </div>

    <div class="controls"><div class="wrap">
      <div class="searchrow">
        <div class="search">${SEARCH_SVG}<input id="q" type="search" placeholder="Search software, category, description…" autocomplete="off"></div>
        <div class="seg" id="statusSeg">
          <button data-st="available" class="on">Available</button>
          <button data-st="all">All</button>
          <button data-st="sold">Sold</button>
        </div>
      </div>
      <div class="chips" id="cats">
        <span class="chip on" data-cat="">All categories</span>
        ${cats.map(c => `<span class="chip" data-cat="${esc(c)}">${esc(c)}</span>`).join('')}
      </div>
    </div></div>

    <div class="wrap">
      <div class="tablewrap">
        <table>
          <thead><tr>
            <th data-sort="name">Software</th>
            <th data-sort="cat" class="hidem">Category</th>
            <th data-sort="units" class="hidem nsort">Availability</th>
            <th data-sort="price">Price</th>
            <th class="nsort">Status</th>
            <th class="nsort c-view"></th>
          </tr></thead>
          <tbody id="rows"></tbody>
        </table>
        <div class="empty" id="empty" style="display:none">No software matches your search.</div>
      </div>
    </div>` +
    footer +
    `<script>const PRODUCTS=${JSON.stringify(data)};</script>
<script>
const $=s=>document.querySelector(s), rowsEl=$('#rows'), emptyEl=$('#empty');
let state={q:'',cat:'',status:'available',sort:'name',dir:1};
const money=n=>'$'+Number(n).toLocaleString('en-US',{maximumFractionDigits:0});
function priceCell(p){
  if(p.status==='sold') return '<span class="strike">'+(p.soldp?money(p.soldp):'Sold')+'</span>';
  if(p.min==null) return '<span class="price offer">Make offer</span>';
  const from=p.avail>1||p.sold>0?'<span class="from">from </span>':'';
  return '<span class="price">'+from+money(p.min)+'</span>';
}
function row(p){
  const units=p.status==='sold'?'—':(p.avail+' license'+(p.avail>1?'s':''))+(p.sold?' · '+p.sold+' sold':'');
  const badge=p.status==='sold'?'<span class="badge so">SOLD</span>':'<span class="badge av">AVAILABLE</span>';
  return '<tr class="'+(p.status==='sold'?'sold':'')+'" onclick="location.href=\\'p/'+p.slug+'.html\\'">'
    +'<td><div class="pname"><img class="thumb" loading="lazy" src="'+p.img+'" alt="" onerror="this.style.visibility=\\'hidden\\'">'
      +'<div class="pn-txt"><b>'+p.name+'</b><small>'+(p.tag||p.desc||'')+'</small></div></div></td>'
    +'<td class="hidem"><span class="cat">'+p.cat+'</span></td>'
    +'<td class="hidem"><span class="units">'+units+'</span></td>'
    +'<td>'+priceCell(p)+'</td>'
    +'<td>'+badge+'</td>'
    +'<td class="c-view"><span class="viewbtn">View →</span></td></tr>';
}
function apply(){
  let list=PRODUCTS.filter(p=>{
    if(state.status==='available'&&p.status!=='available')return false;
    if(state.status==='sold'&&p.status!=='sold')return false;
    if(state.cat&&p.cat!==state.cat)return false;
    if(state.q){const h=(p.name+' '+p.cat+' '+p.tag+' '+p.desc).toLowerCase();if(!h.includes(state.q))return false;}
    return true;
  });
  list.sort((a,b)=>{
    let r=0;
    if(state.sort==='name')r=a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    else if(state.sort==='cat')r=(a.cat).localeCompare(b.cat)||a.name.localeCompare(b.name);
    else if(state.sort==='price'){const av=a.min==null?1e9:a.min,bv=b.min==null?1e9:b.min;r=av-bv;}
    return r*state.dir;
  });
  rowsEl.innerHTML=list.map(row).join('');
  emptyEl.style.display=list.length?'none':'block';
}
$('#q').addEventListener('input',e=>{state.q=e.target.value.trim().toLowerCase();apply();});
document.querySelectorAll('#statusSeg button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('#statusSeg button').forEach(x=>x.classList.remove('on'));
  b.classList.add('on');state.status=b.dataset.st;apply();});
document.querySelectorAll('#cats .chip').forEach(c=>c.onclick=()=>{
  document.querySelectorAll('#cats .chip').forEach(x=>x.classList.remove('on'));
  c.classList.add('on');state.cat=c.dataset.cat;apply();});
document.querySelectorAll('th[data-sort]').forEach(th=>th.onclick=()=>{
  const s=th.dataset.sort;if(s==='units')return;
  if(state.sort===s)state.dir*=-1;else{state.sort=s;state.dir=1;}apply();});
apply();
</script>
</body></html>`;
  fs.writeFileSync(path.join(SITE, 'index.html'), html);
}

/* ---------------- product pages ---------------- */
function buildProduct(p) {
  const availUnits = p.units.filter(u => u.status === 'available');
  const soldUnits = p.units.filter(u => u.status === 'sold');
  const priceLabel = p.minPrice != null
    ? `<div class="pricebox"><span class="big">${money(p.minPrice)}</span><span class="lbl">${p.availCount>1?`· ${p.availCount} available`:'one-time payment'}</span></div>`
    : `<div class="pricebox"><span class="big" style="color:var(--gold)">Make an Offer</span></div>`;

  const primaryName = `${p.name} — Lifetime Deal`;
  const primaryBtn = p.status === 'sold'
    ? `<span class="btn sold">Sold out</span>`
    : (p.minPrice != null
        ? payForm(p.minPrice, primaryName, p.slug, 'btn-pay', `Buy with ${PP} · ${money(p.minPrice)}`)
        : payForm(null, primaryName, p.slug, 'btn-offer', `Make an Offer via ${PP}`));

  function unitRow(u, i) {
    const label = u.account ? esc(u.account) : `License ${i + 1}`;
    if (u.status === 'sold')
      return `<div class="unit"><div class="u-meta"><b>${label}</b><small>No longer available</small></div>
        <span class="u-price strike">${u.price ? money(u.price) : 'Sold'}</span><span class="btn sold">Sold</span></div>`;
    const price = u.priceKind === 'fixed' ? u.price : null;
    const itemName = `${p.name}${u.account ? ` (${u.account})` : ''} — Lifetime Deal`;
    const btn = price != null
      ? payForm(price, itemName, p.slug, 'btn-pay', `Buy · ${PP}`)
      : payForm(null, itemName, p.slug, 'btn-offer', 'Make an Offer');
    return `<div class="unit"><div class="u-meta"><b>${label}</b><small>Lifetime deal · transferred after payment</small></div>
      <span class="u-price">${price != null ? money(price) : 'Offer'}</span>${btn}</div>`;
  }

  const unitsPanel = (availUnits.length || soldUnits.length) ? `
    <div class="panel">
      <h2>${p.availCount > 1 ? `${p.availCount} licenses available` : 'Get this deal'}</h2>
      ${availUnits.map(unitRow).join('')}
      ${soldUnits.map((u,i)=>unitRow(u, availUnits.length+i)).join('')}
    </div>` : '';

  const offer = p.offer || p.desc || `${p.name} — a lifetime-deal software license available for a one-time payment.`;
  const homepage = p.homepage ? `<p class="readmore">Learn more at the official site: <a href="${esc(p.homepage)}" target="_blank" rel="noopener nofollow">${esc(p.homepage.replace(/^https?:\/\//,'').replace(/\/$/,''))}</a></p>` : '';

  const html = head(
    `${p.name} — Lifetime Deal ${p.minPrice != null ? '· ' + money(p.minPrice) : ''} | ${SITE_NAME}`,
    (p.tagline ? p.tagline + '. ' : '') + (p.desc || offer).slice(0, 155),
    p.localImg ? SITE_URL + '/' + img(p) : '',
    `${SITE_URL}/p/${p.slug}.html`) +
    topbar('../') +
    `<div class="pwrap">
      <a class="back" href="../index.html">← Back to all software</a>
      <div class="phead">
        <div class="media"><img src="../${img(p)}" alt="${esc(p.name)}" onerror="this.parentNode.style.display='none'"></div>
        <div>
          <div class="tag">${esc(p.category || 'Software')}${p.tagline ? ' · ' + esc(p.tagline) : ''}</div>
          <h1>${esc(p.name)}</h1>
          ${priceLabel}
          <p class="offer">${esc(offer)}</p>
          ${primaryBtn}
          <div class="trust">
            <span>🔒 Pay securely via PayPal</span><span>♾️ Lifetime license</span><span>↩️ Transferred after payment</span>
          </div>
        </div>
      </div>
      ${unitsPanel}
      <div class="panel">
        <h2>About ${esc(p.name)}</h2>
        <p style="color:var(--muted);margin:.2em 0">${esc(p.desc || offer)}</p>
        ${homepage}
      </div>
    </div>` +
    footer + `</body></html>`;
  fs.writeFileSync(path.join(SITE, 'p', p.slug + '.html'), html);
}

buildIndex();
products.forEach(buildProduct);
console.log(`built index.html + ${products.length} product pages`);
