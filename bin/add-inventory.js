#!/usr/bin/env node
// Build data/inventory.json from data/purchases.csv — products NOT already on the site,
// as inquire-only listings. AppSumo model: stacking N codes on ONE account = a higher TIER,
// sold as ONE license (not N). So each product => one sellable account, tier = codes stacked.
// (Separate accounts = separate sales are handled case-by-case, e.g. Nifty lives on the
// for-sale list as 2 accounts.) Preserves enrichment already in inventory.json.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const products = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'products.json'), 'utf8'));
const invPath = path.join(ROOT, 'data', 'inventory.json');
const prev = fs.existsSync(invPath) ? JSON.parse(fs.readFileSync(invPath, 'utf8')) : [];
const prevBySlug = new Map(prev.map(p => [p.slug, p]));

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

function clean(name){ return name
  .replace(/\s*-\s*Plus exclusive.*$/i,'').replace(/\s+formerly\s+.*$/i,'')
  .replace(/\s*-\s*No-Code Startup App Builder.*$/i,'').replace(/\s*-\s*Social Media.*$/i,'')
  .replace(/\s+for Windows\b/i,'').replace(/\s+Startups\b/i,'').replace(/\s+Premium\b/i,'')
  .replace(/\s{2,}/g,' ').trim(); }

const existNorm=new Set(products.map(p=>norm(p.name)));
const existSlug=new Set(products.map(p=>p.slug));

const groups=new Map();
for(const r of rows){
  const name=r[0].trim(), plan=(r[1]||'').trim(), date=(r[2]||'').trim();
  if(SKIP.test(name)||SKIP_PLAN.test(plan)) continue;
  const n=norm(name);
  let aliasSlug; for(const k in ALIAS){ if(n===k){aliasSlug=ALIAS[k];break;} }
  if(aliasSlug&&existSlug.has(aliasSlug)) continue;
  if(existNorm.has(n)) continue;
  if(!groups.has(n)) groups.set(n,{name:clean(name),rows:[]});
  groups.get(n).rows.push({plan,date});
}

const inventory=[...groups.values()].map(g=>{
  const slug=g.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const codeCount=g.rows.length;
  const tierPlan=g.rows.map(x=>x.plan).find(p=>/tier\s*\d+/i.test(p));
  const tier=tierPlan?parseInt(tierPlan.match(/tier\s*(\d+)/i)[1],10):codeCount;
  const dates=[...new Set(g.rows.map(x=>x.date).filter(Boolean))];
  const label=`Tier ${tier} account`+(codeCount>1?` · ${codeCount} codes stacked`:'');
  const pv=prevBySlug.get(slug)||{};
  return {
    slug, name:g.name,
    desc:pv.desc||'', homepage:pv.homepage||'', image:pv.image||'', localImg:pv.localImg||'',
    status:'available', inquireOnly:true,
    availCount:1, soldCount:0, minPrice:null, soldPrice:null,
    tier, codeCount,
    // ONE sellable account (stacked codes -> one higher-tier license, one sale)
    units:[{status:'available',priceKind:'inquire',price:null,account:label}],
    multiDate: dates.length>1 || undefined,   // bought across dates -> confirm if actually 2+ accounts
    category:pv.category||'', offer:pv.offer||'', tagline:pv.tagline||'',
  };
}).sort((a,b)=>a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

for(const it of inventory) if(existSlug.has(it.slug)) it.slug+='-ltd';

fs.writeFileSync(invPath, JSON.stringify(inventory,null,2));
console.log(`inventory.json: ${inventory.length} products (each = ONE license). Tiers & codes:`);
inventory.forEach(p=>console.log(`  ${p.name}: Tier ${p.tier} (${p.codeCount} code${p.codeCount>1?'s':''})${p.multiDate?'  ⚠ bought across multiple dates — confirm if 2+ accounts':''}`));
