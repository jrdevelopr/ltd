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

// site config — editable from the admin app (data/config.json overrides the defaults here)
const CONFIG = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'config.json'), 'utf8')); } catch { return {}; } })();
const PAYPAL_BIZ = 'YTJ6CLJMBBZAL';               // PayPal Merchant ID — receives Buy Now payments
const INQUIRE_EMAIL = CONFIG.inquireEmail || 'jrdevelopr@gmail.com';  // inquiries land here (carries product name + id)
const MESSENGER_URL = CONFIG.messengerUrl || '';  // m.me/<user> link shows a "Message me" button ('' hides; set via admin)
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
// Stripe card checkout — server-side endpoint /api/stripe-checkout (price from server data)
function stripeBtn(slug, unitIdx, label) {
  return `<button type="button" class="btn btn-card" data-stripe="${esc(slug)}|${unitIdx}">${label}</button>`;
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
<link rel="icon" href="${FAVICON}">
<link rel="stylesheet" href="${canonical === SITE_URL + '/' ? '' : '../'}style.css">
<script>(function(){var t=localStorage.getItem('theme');if(t)document.documentElement.setAttribute('data-theme',t);})();</script>
</head><body>`;
}

// Logo: vault-wheel mark — rounded square in the brand gradient with a white vault dial.
const LOGO_SVG = `<svg class="logomark" viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2563eb"/><stop offset="1" stop-color="#0ea5a4"/></linearGradient></defs><rect width="48" height="48" rx="12" fill="url(#lg)"/><circle cx="24" cy="24" r="12.5" fill="none" stroke="#fff" stroke-width="3.4"/><g stroke="#fff" stroke-width="3.4" stroke-linecap="round"><line x1="24" y1="4.5" x2="24" y2="11.5"/><line x1="24" y1="36.5" x2="24" y2="43.5"/><line x1="4.5" y1="24" x2="11.5" y2="24"/><line x1="36.5" y1="24" x2="43.5" y2="24"/></g><circle cx="24" cy="24" r="4" fill="#fff"/></svg>`;
const FAVICON = `data:image/svg+xml,${encodeURIComponent(LOGO_SVG.replace(' class="logomark"', ' xmlns="http://www.w3.org/2000/svg"'))}`;

const topbar = rel => {
  const forSaleLic = products.filter(p => p.status === 'available' && !p.inquireOnly).reduce((n, p) => n + p.availCount, 0);
  const contactMail = `mailto:${INQUIRE_EMAIL}?subject=${encodeURIComponent('LTD Software Vault — question / offer')}`;
  const msgr = MESSENGER_URL ? `<a class="topbtn" href="${esc(MESSENGER_URL)}" target="_blank" rel="noopener">💬 Messenger</a>` : '';
  return `<div class="topbar"><div class="wrap">
<a class="brand" href="${rel}index.html">${LOGO_SVG}<span class="b1">LTD</span><span class="b2">Software Vault</span></a>
<span class="topline hidem">Lifetime software deals — one-time price, direct from me</span>
<div class="spacer"></div>
<span class="topstat hidem"><b>${forSaleLic}</b> licenses for sale</span>
<a class="topbtn" href="${contactMail}">✉️ Contact me</a>${msgr}
<button class="themebtn" onclick="(function(){var d=document.documentElement,n=d.getAttribute('data-theme')==='dark'?'light':'dark';d.setAttribute('data-theme',n);localStorage.setItem('theme',n);})()">◐ Theme</button>
</div></div>`;
};

// shared embedded-checkout modal — stacked above the catalog's product modal;
// Esc (capture phase) closes only the checkout when it's open.
const CHECKOUT_MODAL = `
<div id="coModal" class="comodal" hidden>
  <div class="comodal-back" id="coBack"></div>
  <div class="comodal-card">
    <div class="comodal-head"><span class="t">🔒 Secure card checkout</span><span class="s">Payments processed by Shrock Services LLC — the name on the form &amp; your statement</span><button id="coClose" aria-label="Close">✕</button></div>
    <div id="coLoading" class="comodal-note">Loading secure checkout…</div>
    <div id="coError" class="comodal-note comodal-err" hidden>Couldn't start card checkout — PayPal still works, or email me.</div>
    <div id="coMount"></div>
  </div>
</div>
<script src="https://js.stripe.com/v3/"><\/script>
<script>
(function(){
  var inst=null;
  function closeCo(){var m=document.getElementById('coModal');if(!m||m.hidden)return false;
    m.hidden=true;document.body.style.overflow='';
    if(inst){try{inst.destroy();}catch(e){}inst=null;}
    document.getElementById('coMount').innerHTML='';return true;}
  function hostedFallback(parts){
    // plain redirect to Stripe-hosted checkout — works even where scripts/embeds are blocked
    return fetch('/api/stripe-checkout',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({slug:parts[0],unit:Number(parts[1])})})
      .then(function(r){return r.json();})
      .then(function(j){if(j&&j.url){location.href=j.url;return true;}return false;})
      .catch(function(){return false;});
  }
  document.addEventListener('click',function(e){
    if(e.target&&(e.target.id==='coBack'||e.target.id==='coClose')){closeCo();return;}
    var b=e.target.closest&&e.target.closest('[data-stripe]');if(!b)return;
    var parts=b.getAttribute('data-stripe').split('|');
    if(!window.Stripe){ // stripe.js blocked/unavailable -> skip the modal entirely
      b.textContent='Opening secure checkout…';hostedFallback(parts);return;
    }
    var m=document.getElementById('coModal');
    m.hidden=false;document.body.style.overflow='hidden';
    document.getElementById('coError').hidden=true;document.getElementById('coLoading').hidden=false;
    fetch('/api/stripe-checkout',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({slug:parts[0],unit:Number(parts[1]),embed:true})})
      .then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j};});})
      .then(function(x){
        if(!x.ok||!x.j.clientSecret)throw new Error(x.j.error||'failed');
        return Stripe('pk_live_51HzSIsAcMAUfCdYvN6qglzGilTpREkDyJ5k4uww8IVJhMNLZ5Akztr9SbQBHCDfMr2qyLL3gjzI9sHUWjFFv62Ht00LazVUnjb')
          .initEmbeddedCheckout({clientSecret:x.j.clientSecret});})
      .then(function(c){inst=c;document.getElementById('coLoading').hidden=true;inst.mount('#coMount');})
      .catch(function(err){
        hostedFallback(parts).then(function(ok){
          if(ok)return;
          document.getElementById('coLoading').hidden=true;
          var el=document.getElementById('coError');el.textContent=(err&&err.message?err.message:'failed')+' — PayPal still works, or email me.';el.hidden=false;});
      });
  });
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'&&closeCo())e.stopImmediatePropagation();
  },true);
})();
<\/script>`;

const footer = `<div class="footer wrap">These are lifetime licenses I'm passing on personally — no store, no middleman.
Pay me directly with <b>PayPal</b>, or <a href="mailto:${INQUIRE_EMAIL}">email me</a> to ask about anything or make an offer.
Items marked <b>“open to offers”</b> are ones I still use but would sell for the right price. Once payment clears I transfer the account/codes to you.<br>
Software is sold <b>as-is</b>, with a full refund if for some reason it's non-transferable.</div>`;

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
  const srcUrl = p.appsumoUrl || '';
  const srcLabel = /appsumo\.com/i.test(srcUrl) ? 'view on AppSumo' : 'view the original deal page';
  const src = srcUrl ? `<p class="readmore">Original deal details: <a href="${esc(srcUrl)}" target="_blank" rel="noopener nofollow">${srcLabel}</a></p>` : '';
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
    min: p.minPrice, soldp: p.soldPrice, img: img(p), tier: p.tier || null, code: p.codeCount || null,
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
      <details class="howto">
        <summary>How buying from me works</summary>
        <div class="howto-body">
          <p>These are lifetime software deals from my own AppSumo account that I'm passing along at a discount. I keep it simple and honest: you'll see which tier you're getting, what it unlocks, and how the handover happens before you pay.</p>
          <ul>
            <li><b>You'll know the tier and the real limits</b> — seats, usage, features — not just a product name.</li>
            <li><b>I tell you the transfer method up front</b> — usually an unredeemed code you activate on your own account, or a vendor ownership transfer to your email.</li>
            <li><b>Proof before payment</b> — I'll show a screenshot from my AppSumo dashboard so you can see the tier and status.</li>
            <li><b>PayPal welcome</b> — Goods &amp; Services is fine, so you're covered.</li>
            <li><b>Ask me anything first</b> — happy to confirm a deal's transfer policy with the vendor before you commit.</li>
          </ul>
          <p class="fineprint">Straight talk: reselling sits outside AppSumo's own terms, so transferability depends on each software vendor, and resold deals fall outside AppSumo's 60-day refund window. I do my best to list only deals that can actually be transferred — and if one ever turns out not to be, I'll refund you in full. Otherwise, software is sold <b>as-is</b>.</p>
        </div>
      </details>
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
        <button class="favtoggle" id="favToggle" title="Show only your favorites">♥ Favorites <span id="favCount"></span></button>
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
    </div>

    <div class="modal" id="modal" hidden>
      <div class="modal-back" onclick="closeModal()"></div>
      <div class="modal-card" role="dialog" aria-modal="true">
        <button class="modal-x" onclick="closeModal()" aria-label="Close">✕</button>
        <div class="modal-body" id="modalBody"></div>
      </div>
    </div>` +
    footer + CHECKOUT_MODAL +
    `<script>const PRODUCTS=${JSON.stringify(data)};</script>
<script>
const $=s=>document.querySelector(s), rowsEl=$('#rows'), emptyEl=$('#empty');
let state={q:'',cat:'',status:'available',sort:'name',dir:1,fav:false};
const money=n=>'$'+Number(n).toLocaleString('en-US',{maximumFractionDigits:0});
function priceCell(p){
  if(p.status==='sold') return '<span class="strike">'+(p.soldp?money(p.soldp):'Sold')+'</span>';
  if(p.inq) return '<span class="price offer">Open to offers</span>';
  if(p.min==null) return '<span class="price offer">Make offer</span>';
  const from=p.avail>1||p.sold>0?'<span class="from">from </span>':'';
  return '<span class="price">'+from+money(p.min)+'</span>';
}
function row(p){
  let units;
  if(p.status==='sold') units='—';
  else if(p.inq) units='Tier '+p.tier+' · 1 license'+(p.code>1?' ('+p.code+' codes)':'');
  else units=(p.avail+' license'+(p.avail>1?'s':''))+(p.sold?' · '+p.sold+' sold':'');
  const badge=p.status==='sold'?'<span class="badge so">SOLD</span>':(p.inq?'<span class="badge inq">INQUIRE</span>':'<span class="badge av">FOR SALE</span>');
  const fav=FAVS.has(p.slug);
  return '<tr class="'+(p.status==='sold'?'sold':'')+'" onclick="openModal(\\''+p.slug+'\\')">'
    +'<td><div class="pname"><img class="thumb" loading="lazy" src="'+p.img+'" alt="" onerror="this.style.visibility=\\'hidden\\'">'
      +'<div class="pn-txt"><b>'+p.name+'</b><small>'+(p.tag||p.desc||'')+'</small></div></div></td>'
    +'<td class="hidem"><span class="cat">'+p.cat+'</span></td>'
    +'<td class="hidem"><span class="units">'+units+'</span></td>'
    +'<td>'+priceCell(p)+'</td>'
    +'<td>'+badge+'</td>'
    +'<td class="c-fav"><button class="favbtn'+(fav?' on':'')+'" title="Favorite" onclick="event.stopPropagation();toggleFav(\\''+p.slug+'\\',this)">'+(fav?'♥':'♡')+'</button></td>'
    +'<td class="c-view"><a class="viewbtn" href="p/'+p.slug+'.html" onclick="event.stopPropagation()">View →</a></td></tr>';
}
/* favorites (localStorage) */
let FAVS=new Set();try{FAVS=new Set(JSON.parse(localStorage.getItem('ltd-favs')||'[]'))}catch(e){}
function saveFavs(){localStorage.setItem('ltd-favs',JSON.stringify([...FAVS]));updateFavUI();}
function toggleFav(slug,btn){FAVS.has(slug)?FAVS.delete(slug):FAVS.add(slug);saveFavs();
  if(btn){const on=FAVS.has(slug);btn.classList.toggle('on',on);btn.textContent=on?'♥':'♡';}
  if(state.fav)apply();}
function updateFavUI(){const c=FAVS.size;document.getElementById('favCount').textContent=c?('('+c+')'):'';}
/* modal detail view */
async function openModal(slug){
  try{
    const r=await fetch('p/'+slug+'.html');if(!r.ok)throw 0;
    const doc=new DOMParser().parseFromString(await r.text(),'text/html');
    const w=doc.querySelector('.pwrap');if(!w)throw 0;
    const back=w.querySelector('.back');if(back)back.remove();
    document.getElementById('modalBody').innerHTML=w.innerHTML;
    const m=document.getElementById('modal');m.hidden=false;m.scrollTop=0;
    m.querySelector('.modal-card').scrollTop=0;document.body.style.overflow='hidden';
  }catch(e){location.href='p/'+slug+'.html';}
}
function closeModal(){const m=document.getElementById('modal');m.hidden=true;
  document.getElementById('modalBody').innerHTML='';document.body.style.overflow='';}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
function apply(){
  let list=PRODUCTS.filter(p=>{
    if(state.fav&&!FAVS.has(p.slug))return false;
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
document.getElementById('favToggle').onclick=function(){
  state.fav=!state.fav;this.classList.toggle('on',state.fav);apply();};
updateFavUI();
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
    const tierNote = p.tier ? `· Tier ${p.tier} account${p.codeCount > 1 ? ` (${p.codeCount} AppSumo codes stacked)` : ''}` : '';
    priceLabel = `<div class="pricebox"><span class="big" style="color:var(--gold)">Open to offers</span><span class="lbl">${tierNote}</span></div>`;
    primaryBtn = inquireBtn(p.name, p.slug, 'btn-offer', `Inquire &amp; make an offer`);
    entice = `<p class="entice">Still in active use — but everything here is for sale at the right price. Send an offer and it could be yours.</p>`;
  } else if (p.status === 'sold') {
    priceLabel = `<div class="pricebox"><span class="big" style="color:var(--sold)">Sold</span></div>`;
    primaryBtn = `<span class="btn sold">Sold out</span>`;
  } else if (p.minPrice != null) {
    priceLabel = `<div class="pricebox"><span class="big">${money(p.minPrice)}</span><span class="lbl">${p.availCount>1?`· ${p.availCount} available`:'one-time payment'}</span></div>`;
    const firstIdx = p.units.findIndex(u => u.status === 'available' && u.priceKind === 'fixed' && u.price != null);
    primaryBtn = `<div class="buyrow">` +
      payForm(p.minPrice, `${p.name} - Lifetime Deal`, p.slug, 'btn-pay', `Buy with ${PP} · ${money(p.minPrice)}`) +
      (firstIdx >= 0 ? stripeBtn(p.slug, firstIdx, `💳 Pay by Card · ${money(p.minPrice)}`) : '') +
      `</div>`;
  } else {
    priceLabel = `<div class="pricebox"><span class="big" style="color:var(--gold)">Make an Offer</span></div>`;
    primaryBtn = payForm(null, `${p.name} - Lifetime Deal`, p.slug, 'btn-offer', `Make an Offer via ${PP}`);
  }

  function unitRow(u, i, origIdx) {
    const label = u.account ? esc(u.account) : `License ${i + 1}`;
    if (u.status === 'sold')
      return `<div class="unit"><div class="u-meta"><b>${label}</b><small>No longer available</small></div>
        <span class="u-price strike">${u.price ? money(u.price) : 'Sold'}</span><span class="btn sold">Sold</span></div>`;
    if (p.inquireOnly || u.priceKind === 'inquire')
      return `<div class="unit"><div class="u-meta"><b>${label}</b><small>Lifetime deal · one account, sold as a single sale (not per code) · open to offers</small></div>
        ${inquireBtn(p.name, p.slug, 'btn-offer', 'Inquire')}</div>`;
    const price = u.priceKind === 'fixed' ? u.price : null;
    const itemName = `${p.name}${u.account ? ` (${u.account})` : ''} - Lifetime Deal`;
    const btn = price != null
      ? `<span class="buyrow">${payForm(price, itemName, p.slug, 'btn-pay', `Buy · ${PP}`)}${stripeBtn(p.slug, origIdx, '💳 Card')}</span>`
      : payForm(null, itemName, p.slug, 'btn-offer', 'Make an Offer');
    return `<div class="unit"><div class="u-meta"><b>${label}</b><small>Lifetime deal · transferred after payment</small></div>
      <span class="u-price">${price != null ? money(price) : 'Offer'}</span>${btn}</div>`;
  }

  const unitsHeading = p.inquireOnly
    ? `One license${p.tier ? ` · Tier ${p.tier}` : ''} — open to offers`
    : (p.availCount > 1 ? `${p.availCount} licenses available` : 'Get this deal');
  const availIdx = p.units.map((u, ix) => ({ u, ix })).filter(x => x.u.status === 'available');
  const soldIdx = p.units.map((u, ix) => ({ u, ix })).filter(x => x.u.status === 'sold');
  const unitsPanel = (availIdx.length || soldIdx.length) ? `
    <div class="panel">
      <h2>${unitsHeading}</h2>
      ${availIdx.map((x, i) => unitRow(x.u, i, x.ix)).join('')}
      ${soldIdx.map((x, i) => unitRow(x.u, availIdx.length + i, x.ix)).join('')}
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
          ${p.reviews && p.reviews.rating ? `<div class="rating">⭐ ${esc(p.reviews.rating)}${p.reviews.count ? ` · ${esc(p.reviews.count)} ${/appsumo\.com/i.test(p.appsumoUrl || '') ? 'AppSumo reviews' : 'reviews'}` : ''}</div>` : ''}
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
    footer + CHECKOUT_MODAL + `</body></html>`;
  fs.writeFileSync(path.join(SITE, 'p', p.slug + '.html'), html);
}

buildIndex();
products.forEach(buildProduct);
console.log(`built index.html + ${products.length} product pages (${forSale.length} for-sale, ${inventory.length} inventory)`);
