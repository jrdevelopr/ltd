#!/usr/bin/env node
// Build the static storefront from data/products.json (+ data/inventory.json) into
// site/index.html + site/p/<slug>.html
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SITE = path.join(ROOT, 'site');
const forSale = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'products.json'), 'utf8'));
const invFile = path.join(ROOT, 'data', 'inventory.json');
const inventory = fs.existsSync(invFile) ? JSON.parse(fs.readFileSync(invFile, 'utf8')) : [];
const products = [...forSale, ...inventory]
  .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

const PAYPAL_BIZ = 'YTJ6CLJMBBZAL';               // PayPal Merchant ID — receives Buy Now payments
const INQUIRE_EMAIL = 'jrdevelopr@gmail.com';     // inquiries land here (carries product name + id)
const MESSENGER_URL = '';                         // set to your m.me/<user> or FB page URL to show a "Message me" button (leave '' to hide)
const PAY_METHODS = ['paypal', 'visa', 'mastercard', 'amex']; // accepted-payment logos shown on buyable items (PayPal checkout also takes cards)
const SITE_URL = 'https://ltd.jrdevelopr.com';
const SITE_NAME = 'LTD Software Vault';

// self-hosted inline-SVG payment logos (no external requests; CSP-safe)
const PAYLOGO = {
  paypal: `<svg viewBox="0 0 46 28" aria-label="PayPal"><rect width="46" height="28" rx="5" fill="#fff" stroke="#e6e9ee"/><text x="6" y="19" font-family="Arial,Helvetica,sans-serif" font-weight="bold" font-size="12" font-style="italic" fill="#003087">Pay</text><text x="25" y="19" font-family="Arial,Helvetica,sans-serif" font-weight="bold" font-size="12" font-style="italic" fill="#009cde">Pal</text></svg>`,
  visa: `<svg viewBox="0 0 46 28" aria-label="Visa"><rect width="46" height="28" rx="5" fill="#fff" stroke="#e6e9ee"/><text x="23" y="19" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="bold" font-size="12" font-style="italic" fill="#1a1f71">VISA</text></svg>`,
  mastercard: `<svg viewBox="0 0 46 28" aria-label="Mastercard"><rect width="46" height="28" rx="5" fill="#fff" stroke="#e6e9ee"/><circle cx="20" cy="14" r="7" fill="#eb001b"/><circle cx="27" cy="14" r="7" fill="#f79e1b" fill-opacity=".85"/></svg>`,
  amex: `<svg viewBox="0 0 46 28" aria-label="American Express"><rect width="46" height="28" rx="5" fill="#1f72cd"/><text x="23" y="18" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="bold" font-size="8.5" fill="#fff">AMEX</text></svg>`,
  cash: `<svg viewBox="0 0 46 28" aria-label="Cash"><rect width="46" height="28" rx="5" fill="#0f9d58"/><text x="23" y="19" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="bold" font-size="10" fill="#fff">CASH</text></svg>`,
  check: `<svg viewBox="0 0 46 28" aria-label="Check"><rect width="46" height="28" rx="5" fill="#fff" stroke="#e6e9ee"/><text x="23" y="19" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="bold" font-size="9" fill="#5b6675">CHECK</text></svg>`,
};
const paysStrip = () => `<div class="pays"><span class="pays-lbl">Pay with</span>${PAY_METHODS.map(m => PAYLOGO[m] || '').join('')}</div>`;

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const img = p => p.localImg || `img/${p.slug}.svg`;

const PP = '<span class="pp"><i>Pay</i><em>Pal</em></span>';
const SEARCH_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>';

// PayPal Buy Now (Payments Standard) — carries item_name + item_number to the seller.
function payForm(amount, itemName, itemNumber, btnClass, btnHtml) {
  const nm = itemName.length > 124 ? itemName.slice(0, 124) : itemName;
  const amt = amount != null ? `<input type="hidden" name="amount" value="${Number(amount).toFixed(2)}">` : '';
  return `<form action="https://www.paypal.com/cgi-bin/webscr" method="post" target="_blank" rel="noopener" class="payform">
<input type="hidden" name="cmd" value="_xclick">
<input type="hidden" name="charset" value="utf-8">
<input type="hidden" name="business" value="${esc(PAYPAL_BIZ)}">
<input type="hidden" name="item_name" value="${esc(nm)}">
<input type="hidden" name="item_number" value="${esc(itemNumber)}">
${amt}<input type="hidden" name="currency_code" value="USD">
<input type="hidden" name="no_shipping" value="1">
<button type="submit" class="btn ${btnClass}">${btnHtml}</button>
</form>`;
}
// Inquiry mailto — pre-filled, enticing, and tagged with the product name + slug.
function inquireHref(name, slug) {
  const subject = `Inquiry: ${name} [${slug}]`;
  const body = `Hi,\n\nI'm interested in your ${name} lifetime-deal license. Is it still available, and what price are you looking for? I'm ready to make an offer.\n\n(Product ref: ${slug})\n\nThanks!`;
  return `mailto:${INQUIRE_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
function inquireBtn(name, slug, cls, label) {
  return `<a class="btn ${cls}" href="${inquireHref(name, slug)}">${label}</a>`;
}

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

const footer = `<div class="footer wrap">These are lifetime licenses I'm passing on personally — no store, no middleman.
Pay me directly with <b>PayPal</b>, or <a href="mailto:${INQUIRE_EMAIL}">email me</a> to ask about anything or make an offer.
Items marked <b>“open to offers”</b> are ones I still use but would sell for the right price. Once payment clears I transfer the account/codes to you.</div>`;

// "Other ways to reach me" — email always, Facebook Messenger only when MESSENGER_URL is set.
function contactPanel(p) {
  const email = `<a class="btn btn-ghost" href="${inquireHref(p.name, p.slug)}">✉️ Email me about this</a>`;
  const msgr = MESSENGER_URL
    ? `<a class="btn btn-ghost" href="${esc(MESSENGER_URL)}" target="_blank" rel="noopener">💬 Message me on Facebook</a>`
    : '<!-- Facebook Messenger: set MESSENGER_URL near the top of bin/build.js (e.g. https://m.me/yourname) and this button appears -->';
  return `<div class="panel">
    <h2>Buy from me, or just reach out</h2>
    <p style="color:var(--muted);margin:.2em 0 14px">You're buying directly from me — grab it with PayPal above, or get in touch and I'll sort you out. Happy to answer questions or take a fair offer.</p>
    <div class="contact-btns">${email}${msgr}</div>
  </div>`;
}
// Optional "what each license gets you" panel — populated from the AppSumo deal page.
function tiersPanel(p) {
  if (!p.licenseTiers || !p.licenseTiers.length) return '';
  const tiers = p.licenseTiers.map(t =>
    `<div class="tier"><b>${esc(t.label)}</b><ul>${(t.features || []).map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>`).join('');
  const src = p.appsumoUrl ? `<p class="readmore">Original deal details from the AppSumo page: <a href="${esc(p.appsumoUrl)}" target="_blank" rel="noopener nofollow">view on AppSumo</a></p>` : '';
  return `<div class="panel"><h2>What you get with this deal</h2><div class="tiers">${tiers}</div>${src}</div>`;
}

/* ---------------- index ---------------- */
function buildIndex() {
  const priced = products.filter(p => p.status === 'available' && !p.inquireOnly);
  const inq = products.filter(p => p.inquireOnly);
  const forSaleLic = priced.reduce((n, p) => n + p.availCount, 0);
  const inqLic = inq.reduce((n, p) => n + p.availCount, 0);
  const cats = [...new Set(products.map(p => p.category).filter(Boolean))].sort();

  const data = products.map(p => ({
    slug: p.slug, name: p.name, tag: p.tagline || '', cat: p.category || 'Software',
    desc: p.desc || '', status: p.status, inq: !!p.inquireOnly, avail: p.availCount, sold: p.soldCount,
    min: p.minPrice, soldp: p.soldPrice, img: img(p),
  }));

  const html = head(
    `${SITE_NAME} — Lifetime Deal Software for Sale`,
    `${forSaleLic}+ lifetime-deal software licenses for sale plus ${inqLic} more open to offers — WordPress plugins, SaaS tools, AI apps and more. One-time payment, transferred to you.`,
    '', SITE_URL + '/') +
    topbar('') +
    `<div class="wrap hero">
      <h1>My lifetime-deal software — up for grabs.</h1>
      <p>Over the years I've picked up a big stack of lifetime software deals — WordPress plugins, SaaS apps, AI tools and more — and I'm passing them on to new owners. Some are priced and ready to go; many I still use but would happily sell for the right price. You're buying straight from me: pay with PayPal, or just email/message me.</p>
      <div class="stats">
        <div class="stat"><b>${forSaleLic}</b><span>licenses for sale</span></div>
        <div class="stat"><b>${inq.length}</b><span>more open to offers</span></div>
        <div class="stat"><b>${products.filter(p=>p.status!=='sold').length}</b><span>total products</span></div>
      </div>
      <div class="notice">💡 See something you want that isn't priced? Hit <b>Inquire</b> — I'm open to reasonable offers.</div>
    </div>

    <div class="controls"><div class="wrap">
      <div class="searchrow">
        <div class="search">${SEARCH_SVG}<input id="q" type="search" placeholder="Search software, category, description…" autocomplete="off"></div>
        <div class="seg" id="statusSeg">
          <button data-st="available" class="on">For sale</button>
          <button data-st="inquire">Inquire</button>
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
  if(p.inq) return '<span class="price offer">Open to offers</span>';
  if(p.min==null) return '<span class="price offer">Make offer</span>';
  const from=p.avail>1||p.sold>0?'<span class="from">from </span>':'';
  return '<span class="price">'+from+money(p.min)+'</span>';
}
function row(p){
  const units=p.status==='sold'?'—':(p.avail+' license'+(p.avail>1?'s':''))+(p.sold?' · '+p.sold+' sold':'');
  const badge=p.status==='sold'?'<span class="badge so">SOLD</span>':(p.inq?'<span class="badge inq">INQUIRE</span>':'<span class="badge av">FOR SALE</span>');
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
    if(state.status==='available'&&(p.status==='sold'||p.inq))return false;
    if(state.status==='inquire'&&!p.inq)return false;
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
  const offer = p.offer || p.desc || `${p.name} — a lifetime-deal software license.`;

  let priceLabel, primaryBtn, entice = '';
  if (p.inquireOnly) {
    priceLabel = `<div class="pricebox"><span class="big" style="color:var(--gold)">Open to offers</span></div>`;
    primaryBtn = inquireBtn(p.name, p.slug, 'btn-offer', `Inquire &amp; make an offer`);
    entice = `<p class="entice">Still in active use — but everything here is for sale at the right price. Send an offer and it could be yours.</p>`;
  } else if (p.status === 'sold') {
    priceLabel = `<div class="pricebox"><span class="big" style="color:var(--sold)">Sold</span></div>`;
    primaryBtn = `<span class="btn sold">Sold out</span>`;
  } else if (p.minPrice != null) {
    priceLabel = `<div class="pricebox"><span class="big">${money(p.minPrice)}</span><span class="lbl">${p.availCount>1?`· ${p.availCount} available`:'one-time payment'}</span></div>`;
    primaryBtn = payForm(p.minPrice, `${p.name} - Lifetime Deal`, p.slug, 'btn-pay', `Buy with ${PP} · ${money(p.minPrice)}`);
  } else {
    priceLabel = `<div class="pricebox"><span class="big" style="color:var(--gold)">Make an Offer</span></div>`;
    primaryBtn = payForm(null, `${p.name} - Lifetime Deal`, p.slug, 'btn-offer', `Make an Offer via ${PP}`);
  }

  function unitRow(u, i) {
    const label = u.account ? esc(u.account) : `License ${i + 1}`;
    if (u.status === 'sold')
      return `<div class="unit"><div class="u-meta"><b>${label}</b><small>No longer available</small></div>
        <span class="u-price strike">${u.price ? money(u.price) : 'Sold'}</span><span class="btn sold">Sold</span></div>`;
    if (p.inquireOnly || u.priceKind === 'inquire')
      return `<div class="unit"><div class="u-meta"><b>${label}</b><small>Lifetime deal · open to offers</small></div>
        ${inquireBtn(p.name, p.slug, 'btn-offer', 'Inquire')}</div>`;
    const price = u.priceKind === 'fixed' ? u.price : null;
    const itemName = `${p.name}${u.account ? ` (${u.account})` : ''} - Lifetime Deal`;
    const btn = price != null
      ? payForm(price, itemName, p.slug, 'btn-pay', `Buy · ${PP}`)
      : payForm(null, itemName, p.slug, 'btn-offer', 'Make an Offer');
    return `<div class="unit"><div class="u-meta"><b>${label}</b><small>Lifetime deal · transferred after payment</small></div>
      <span class="u-price">${price != null ? money(price) : 'Offer'}</span>${btn}</div>`;
  }

  const unitsHeading = p.inquireOnly
    ? (p.availCount > 1 ? `${p.availCount} licenses available — open to offers` : 'Available — open to offers')
    : (p.availCount > 1 ? `${p.availCount} licenses available` : 'Get this deal');
  const unitsPanel = (availUnits.length || soldUnits.length) ? `
    <div class="panel">
      <h2>${unitsHeading}</h2>
      ${availUnits.map(unitRow).join('')}
      ${soldUnits.map((u,i)=>unitRow(u, availUnits.length+i)).join('')}
    </div>` : '';

  const trust = p.inquireOnly
    ? `<span>✉️ Reply within a day</span><span>♾️ Lifetime license</span><span>🤝 Open to fair offers</span>`
    : `<span>🔒 Pay securely via PayPal</span><span>♾️ Lifetime license</span><span>↩️ Transferred after payment</span>`;

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
          ${p.reviews && p.reviews.rating ? `<div class="rating">⭐ ${esc(p.reviews.rating)}${p.reviews.count ? ` · ${esc(p.reviews.count)} AppSumo reviews` : ''}</div>` : ''}
          ${priceLabel}
          <p class="offer">${esc(offer)}</p>
          ${entice}
          ${primaryBtn}
          ${(!p.inquireOnly && p.status !== 'sold') ? paysStrip() : ''}
          <div class="trust">${trust}</div>
        </div>
      </div>
      ${unitsPanel}
      ${tiersPanel(p)}
      <div class="panel">
        <h2>About ${esc(p.name)}</h2>
        <p style="color:var(--muted);margin:.2em 0">${esc(p.desc || offer)}</p>
        ${homepage}
      </div>
      ${contactPanel(p)}
    </div>` +
    footer + `</body></html>`;
  fs.writeFileSync(path.join(SITE, 'p', p.slug + '.html'), html);
}

buildIndex();
products.forEach(buildProduct);
console.log(`built index.html + ${products.length} product pages (${forSale.length} for-sale, ${inventory.length} inventory)`);
