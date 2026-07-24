const fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');
const products=JSON.parse(fs.readFileSync(path.join(ROOT,'data','products.json'),'utf8'));
// --- csv parse ---
function parseCSV(t){const rows=[];let r=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];
 if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=c}
 else{if(c==='"')q=true;else if(c===','){r.push(f);f=''}else if(c==='\n'){r.push(f);rows.push(r);r=[];f=''}else if(c!=='\r')f+=c}}
 if(f.length||r.length){r.push(f);rows.push(r)}return rows;}
const rows=parseCSV(fs.readFileSync(path.join(ROOT,'data','purchases.csv'),'utf8')).slice(1).filter(r=>r[0]&&r[0].trim());

// normalize for matching
const norm=s=>s.toLowerCase()
 .replace(/\bformerly\b.*$/,'').replace(/-\s*plus exclusive.*$/,'').replace(/\bfor windows\b/,'')
 .replace(/\bai content writer\b/,'').replace(/- social media.*$/,'').replace(/- no-code.*$/,'')
 .replace(/- forms & surveys.*$/,'').replace(/\bseo\b/,'').replace(/[^a-z0-9]+/g,'').trim();

// explicit aliases: purchase-name-substring -> existing slug
const ALIAS={ 'nifty':'niftypm','anywhere':'anywhereapp','amzimage':'amzimage','formly':'getformly',
 'bitintegrations':'bit-social-integrations','wpfunnels':'getwpfunnels','wordhero':'wordhero',
 'betteruptime':'better-uptime-stack','ewwwimageoptimizer':'ewww-image-optimizer','squirrly':'squirrly',
 'stackable':'wp-stackable','kaliforms':'kaliforms','happyforms':'happy-forms','happyscribe':'happyscribe',
 'smarttask':'smarttask','remastermedia':'remastermedia','wpreset':'wpreset','wp301redirects':'wp301redirects',
 'webtotem':'webtotem','xemailverify':'xemailverify','suitedash':'suitedash','sendfox':'sendfox',
 'editordo':'editor-do','feedbear':'feed-bear','postly':'postly','wpadminify':'wp-adminify',
 'brizydesignkit':'brizy-webuilder','kingsumo':null };

// items to skip (non-transferable: courses, ebooks, guides, appsumo internal, subscriptions)
const SKIP=/^(data retention|appsumo plus yearly|appsumo's|saas pricing strategy|how to sell your business|million dollar email|teachableu|how to launch a book|infinite income|breakout blueprint|sitepoint premium)/i;
const SKIP_PLAN=/digital download/i;

const existNorm=new Set(products.map(p=>norm(p.name)));
const existSlug=new Set(products.map(p=>p.slug));

const counts={}, skipped={}, matched={};
for(const [name,plan] of rows.map(r=>[r[0].trim(),(r[1]||'').trim()])){
  if(SKIP.test(name)||SKIP_PLAN.test(plan)){skipped[name]=(skipped[name]||0)+1;continue;}
  const n=norm(name);
  // alias?
  let aliasSlug=undefined;
  for(const k in ALIAS){if(n===k){aliasSlug=ALIAS[k];break;}}
  if(aliasSlug&&existSlug.has(aliasSlug)){matched[name]=(matched[name]||0)+1;continue;}
  if(aliasSlug===null){/*kingsumo -> new, fallthrough*/}
  if(existNorm.has(n)){matched[name]=(matched[name]||0)+1;continue;}
  counts[name]=(counts[name]||0)+1;
}
console.log('=== NEW (not on site) — product : licenses owned ===');
Object.entries(counts).sort().forEach(([k,v])=>console.log(`  ${v}x  ${k}`));
console.log(`\nNEW unique products: ${Object.keys(counts).length}, total licenses: ${Object.values(counts).reduce((a,b)=>a+b,0)}`);
console.log('\n=== matched to existing (skipped, already listed) ===');
console.log('  '+Object.keys(matched).sort().join(' · '));
console.log('\n=== skipped as non-software (courses/ebooks/guides/subscriptions) ===');
console.log('  '+Object.keys(skipped).sort().join(' · '));
