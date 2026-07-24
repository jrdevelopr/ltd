#!/usr/bin/env node
// Build data/inventory.json from data/purchases.csv — products NOT already on the site,
// as inquire-only listings (no price yet). Enrichment (category/offer/image) filled later.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const products = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'products.json'), 'utf8'));

function parseCSV(t){const rows=[];let r=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];
 if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=c}
 else{if(c==='"')q=true;else if(c===','){r.push(f);f=''}else if(c==='\n'){r.push(f);rows.push(r);r=[];f=''}else if(c!=='\r')f+=c}}
 if(f.length||r.length){r.push(f);rows.push(r)}return rows;}
const rows = parseCSV(fs.readFileSync(path.join(ROOT,'data','purchases.csv'),'utf8')).slice(1).filter(r=>r[0]&&r[0].trim());

const norm = s => s.toLowerCase()
 .replace(/\bformerly\b.*$/,'').replace(/-\s*plus exclusive.*$/,'').replace(/\bfor windows\b/,'')
 .replace(/\bai content writer\b/,'').replace(/- social media.*$/,'').replace(/- no-code.*$/,'')
 .replace(/- forms & surveys.*$/,'').replace(/\bseo\b/,'').replace(/[^a-z0-9]+/g,'').trim();

const ALIAS={ 'nifty':'niftypm','anywhere':'anywhereapp','amzimage':'amzimage','formly':'getformly',
 'bitintegrations':'bit-social-integrations','wpfunnels':'getwpfunnels','wordhero':'wordhero',
 'betteruptime':'better-uptime-stack','ewwwimageoptimizer':'ewww-image-optimizer','squirrly':'squirrly',
 'stackable':'wp-stackable','kaliforms':'kaliforms','happyforms':'happy-forms','happyscribe':'happyscribe',
 'smarttask':'smarttask','remastermedia':'remastermedia','wpreset':'wpreset','wp301redirects':'wp301redirects',
 'webtotem':'webtotem','xemailverify':'xemailverify','suitedash':'suitedash','sendfox':'sendfox',
 'encharge':'encharge-email','editordo':'editor-do','feedbear':'feed-bear','postly':'postly','wpadminify':'wp-adminify' };
const SKIP=/^(data retention|appsumo plus yearly|appsumo's|saas pricing strategy|how to sell your business|million dollar email|teachableu|how to launch a book|infinite income|breakout blueprint|sitepoint premium)/i;
const SKIP_PLAN=/digital download/i;

// pretty display name
function clean(name){
  return name
    .replace(/\s*-\s*Plus exclusive.*$/i,'')
    .replace(/\s+formerly\s+.*$/i,'')
    .replace(/\s*-\s*No-Code Startup App Builder.*$/i,'')
    .replace(/\s*-\s*Social Media.*$/i,'')
    .replace(/\s+for Windows\b/i,'')
    .replace(/\s+Startups\b/i,'')
    .replace(/\s+Premium\b/i,'')
    .replace(/\s{2,}/g,' ').trim();
}

const existNorm=new Set(products.map(p=>norm(p.name)));
const existSlug=new Set(products.map(p=>p.slug));

const groups=new Map();
for(const r of rows){
  const name=r[0].trim(), plan=(r[1]||'').trim();
  if(SKIP.test(name)||SKIP_PLAN.test(plan)) continue;
  const n=norm(name);
  let aliasSlug; for(const k in ALIAS){ if(n===k){aliasSlug=ALIAS[k];break;} }
  if(aliasSlug&&existSlug.has(aliasSlug)) continue;
  if(existNorm.has(n)) continue;
  if(!groups.has(n)) groups.set(n,{name:clean(name),plans:[]});
  groups.get(n).plans.push(plan);
}

const flagged=new Set(['encharge','wpcourseware','keywordhero']); // possible-dup / overlap — noted to owner
const inventory=[...groups.values()].map(g=>{
  const slug=g.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const acct=plan=>/tier/i.test(plan)?plan:'AppSumo LTD code';
  return {
    slug, name:g.name, desc:'', homepage:'', image:'', localImg:'',
    status:'available', inquireOnly:true,
    availCount:g.plans.length, soldCount:0, minPrice:null, soldPrice:null,
    units:g.plans.map(p=>({status:'available',priceKind:'inquire',price:null,account:acct(p)})),
    category:'', offer:'', tagline:'',
    flagged: flagged.has(norm(g.name)) || undefined,
  };
}).sort((a,b)=>a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

// guard against slug collision with the for-sale list
for(const it of inventory) if(existSlug.has(it.slug)) it.slug+='-ltd';

fs.writeFileSync(path.join(ROOT,'data','inventory.json'), JSON.stringify(inventory,null,2));
console.log(`inventory.json: ${inventory.length} products, ${inventory.reduce((n,p)=>n+p.availCount,0)} licenses`);
console.log('slugs:', inventory.map(p=>p.slug).join(', '));
