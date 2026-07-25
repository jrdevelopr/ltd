#!/usr/bin/env node
/* LTD Software Vault — admin backend (LAN/VPN-only, port 8093).
 * Dependency-free Node http server.
 *  - First visit: one-time setup screen to create the admin password
 *    (scrypt hash + session secret stored in ~/.config/ltd-admin/env, 600).
 *  - Login -> HMAC-signed HttpOnly session cookie (12h).
 *  - Edit products/inventory (prices, sold, units, copy), set Messenger link,
 *    every save rewrites the JSON + rebuilds the static site (live via volume mount).
 *  - Publish button -> git add/commit/push.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PORT = 8093;
const CONF_DIR = path.join(process.env.HOME || '/home/jrdevelopr', '.config', 'ltd-admin');
const ENV_FILE = path.join(CONF_DIR, 'env');
const SESSION_HOURS = 12;

/* ---------- credential store ---------- */
function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) return null;
  const env = Object.fromEntries(fs.readFileSync(ENV_FILE, 'utf8').split('\n').filter(Boolean).map(l => {
    const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)];
  }));
  return env.LTD_ADMIN_HASH ? env : null;
}
function saveCredentials(password) {
  fs.mkdirSync(CONF_DIR, { recursive: true, mode: 0o700 });
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  const out = [
    'LTD_ADMIN_USER=admin',
    'LTD_ADMIN_SALT=' + salt.toString('hex'),
    'LTD_ADMIN_HASH=' + hash.toString('hex'),
    'LTD_SESSION_SECRET=' + crypto.randomBytes(32).toString('hex'),
    '',
  ].join('\n');
  fs.writeFileSync(ENV_FILE, out, { mode: 0o600 });
}
function verifyPassword(password) {
  const env = loadEnv(); if (!env) return false;
  const hash = crypto.scryptSync(password, Buffer.from(env.LTD_ADMIN_SALT, 'hex'), 64);
  const stored = Buffer.from(env.LTD_ADMIN_HASH, 'hex');
  return hash.length === stored.length && crypto.timingSafeEqual(hash, stored);
}

/* ---------- sessions ---------- */
function sign(value) {
  const env = loadEnv();
  return crypto.createHmac('sha256', env.LTD_SESSION_SECRET).update(value).digest('hex');
}
function makeSession() {
  const exp = Date.now() + SESSION_HOURS * 3600 * 1000;
  const v = 'v1.' + exp;
  return v + '.' + sign(v);
}
function checkSession(req) {
  const env = loadEnv(); if (!env) return false;
  const cookie = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('ltdadm='));
  if (!cookie) return false;
  const val = cookie.slice(7);
  const i = val.lastIndexOf('.');
  if (i < 0) return false;
  const v = val.slice(0, i), sig = val.slice(i + 1);
  if (sign(v) !== sig) return false;
  const exp = parseInt(v.split('.')[1], 10);
  return Number.isFinite(exp) && Date.now() < exp;
}

/* ---------- login rate limit ---------- */
const attempts = new Map(); // ip -> [timestamps]
function rateLimited(ip) {
  const now = Date.now();
  const arr = (attempts.get(ip) || []).filter(t => now - t < 10 * 60 * 1000);
  attempts.set(ip, arr);
  return arr.length >= 10;
}
function noteAttempt(ip) { (attempts.get(ip) || attempts.set(ip, []).get(ip)).push(Date.now()); }

/* ---------- data ---------- */
const FILES = { products: path.join(ROOT, 'data', 'products.json'), inventory: path.join(ROOT, 'data', 'inventory.json') };
const CONFIG = path.join(ROOT, 'data', 'config.json');
function readData(which) { return JSON.parse(fs.readFileSync(FILES[which], 'utf8')); }
function writeData(which, arr) { fs.writeFileSync(FILES[which], JSON.stringify(arr, null, 2)); }
function readConfig() { try { return JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch { return {}; } }
function rebuild() { execFileSync('node', [path.join(ROOT, 'bin', 'build.js')], { cwd: ROOT }); }

function applyPatch(p, patch) {
  if (typeof patch.category === 'string') p.category = patch.category.slice(0, 60);
  if (typeof patch.tagline === 'string') p.tagline = patch.tagline.slice(0, 120);
  if (typeof patch.offer === 'string') p.offer = patch.offer.slice(0, 1200);
  if (typeof patch.inquireOnly === 'boolean') p.inquireOnly = patch.inquireOnly;
  if (Array.isArray(patch.units)) {
    p.units = patch.units.slice(0, 20).map((u, i) => {
      const prev = p.units[i] || {};
      const price = (u.price === null || u.price === '' || u.price === undefined) ? null : Math.max(0, Number(u.price) || 0) || null;
      const status = u.status === 'sold' ? 'sold' : 'available';
      return {
        status,
        priceKind: price != null ? 'fixed' : (p.inquireOnly ? 'inquire' : 'offer'),
        price,
        account: typeof u.account === 'string' ? u.account.slice(0, 120) : (prev.account || ''),
      };
    });
  }
  // recompute derived fields
  const avail = p.units.filter(u => u.status === 'available');
  const sold = p.units.filter(u => u.status === 'sold');
  const fixed = avail.filter(u => u.priceKind === 'fixed' && u.price != null).map(u => u.price);
  p.availCount = avail.length; p.soldCount = sold.length;
  p.minPrice = fixed.length ? Math.min(...fixed) : null;
  const soldFixed = sold.filter(u => u.price != null).map(u => u.price);
  p.soldPrice = soldFixed.length ? Math.max(...soldFixed) : (p.soldPrice || null);
  p.status = avail.length ? 'available' : 'sold';
  if (p.minPrice != null && p.inquireOnly) p.inquireOnly = false; // priced -> for sale
}

/* ---------- helpers ---------- */
function body(req, cb) {
  let b = ''; req.on('data', c => { b += c; if (b.length > 200000) req.destroy(); });
  req.on('end', () => cb(b));
}
function json(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }
function html(res, code, s) { res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(s); }
function redirect(res, to, cookie) {
  const h = { Location: to }; if (cookie) h['Set-Cookie'] = cookie;
  res.writeHead(302, h); res.end();
}
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ---------- pages ---------- */
const SHELL = (title, inner) => `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title>
<style>
:root{--bg:#f6f7f9;--panel:#fff;--ink:#0f1720;--muted:#5b6675;--line:#e6e9ee;--brand:#2563eb;--gold:#b8860b;--good:#0f9d58;--bad:#e11d48}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14.5px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:1060px;margin:0 auto;padding:20px}
.top{display:flex;align-items:center;gap:10px;padding:14px 20px;background:var(--panel);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5}
.top b{font-size:16px}.top .sp{flex:1}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:20px;box-shadow:0 1px 2px rgba(16,24,40,.06);margin-bottom:16px}
input,select,textarea{font:inherit;padding:9px 11px;border:1px solid var(--line);border-radius:9px;background:var(--bg);color:var(--ink);width:100%}
textarea{min-height:70px}label{font-size:12px;font-weight:700;color:var(--muted);display:block;margin:10px 0 4px;text-transform:uppercase;letter-spacing:.04em}
.btn{display:inline-block;font-weight:700;border:0;border-radius:9px;padding:10px 16px;cursor:pointer;font-size:14px}
.btn-p{background:var(--brand);color:#fff}.btn-g{background:var(--bg);border:1px solid var(--line);color:var(--ink)}
.btn-good{background:var(--good);color:#fff}.btn-warn{background:var(--gold);color:#fff}
table{width:100%;border-collapse:collapse}th{font-size:11px;text-transform:uppercase;color:var(--muted);text-align:left;padding:8px 10px;border-bottom:1px solid var(--line)}
td{padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:middle}
tr.rowitem{cursor:pointer}tr.rowitem:hover{background:#eef3fd}
.pill{font-size:11px;font-weight:800;padding:3px 9px;border-radius:999px}
.pill.av{background:#e6f6ec;color:var(--good)}.pill.so{background:#eceff3;color:#9aa3af}.pill.inq{background:#e8effd;color:var(--brand)}
.unit{display:flex;gap:8px;align-items:center;margin:6px 0}
.unit input[type=number]{width:110px}.unit select{width:130px}.unit .acct{flex:1}
.msg{padding:10px 14px;border-radius:9px;font-weight:600;margin:10px 0;display:none}
.msg.ok{background:#e6f6ec;color:var(--good);display:block}.msg.err{background:#fde8ec;color:var(--bad);display:block}
.filters{display:flex;gap:8px;margin:0 0 12px;flex-wrap:wrap}
.chip{border:1px solid var(--line);background:var(--panel);border-radius:999px;padding:6px 13px;cursor:pointer;font-size:13px;font-weight:600;color:var(--muted)}
.chip.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.editor{background:#f2f6ff;border-top:2px solid var(--brand)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:700px){.grid2{grid-template-columns:1fr}}
</style></head><body>${inner}</body></html>`;

const SETUP_PAGE = SHELL('LTD Admin — first-run setup', `<div class="wrap" style="max-width:440px;margin-top:8vh">
<div class="card"><h2 style="margin:0 0 4px">🔐 Set your admin password</h2>
<p style="color:var(--muted)">First-run setup — this locks the LTD Vault admin. Username is <b>admin</b>.</p>
<form method="post" action="/setup">
<label>New password (min 8 chars)</label><input type="password" name="pw" minlength="8" required autofocus>
<label>Confirm</label><input type="password" name="pw2" minlength="8" required>
<p></p><button class="btn btn-p" style="width:100%">Create &amp; log in</button></form></div></div>`);

const LOGIN_PAGE = (err) => SHELL('LTD Admin — log in', `<div class="wrap" style="max-width:400px;margin-top:10vh">
<div class="card"><h2 style="margin:0 0 4px">LTD Vault — Admin</h2>
<p style="color:var(--muted)">Log in to manage prices, sales and inventory.</p>
${err ? `<div class="msg err">${esc(err)}</div>` : ''}
<form method="post" action="/login">
<label>Username</label><input name="user" value="admin" autocomplete="username">
<label>Password</label><input type="password" name="pw" required autofocus autocomplete="current-password">
<p></p><button class="btn btn-p" style="width:100%">Log in</button></form></div></div>`);

const APP_PAGE = SHELL('LTD Vault — Admin', `
<div class="top"><b>🗄️ LTD Vault Admin</b><span style="color:var(--muted)">edit → saves &amp; rebuilds the live site</span>
<span class="sp"></span>
<button class="btn btn-warn" onclick="publish()">Publish to GitHub</button>
<a class="btn btn-g" href="http://192.168.20.108:8089/" target="_blank">View site</a>
<a class="btn btn-g" href="/logout">Log out</a></div>
<div class="wrap">
<div id="msg" class="msg"></div>
<div class="card"><b>Site settings</b>
<div class="grid2">
<div><label>Facebook Messenger link (m.me/… — empty hides the button)</label><input id="cfgMessenger" placeholder="https://m.me/yourname"></div>
<div><label>Inquiry email</label><input id="cfgEmail" placeholder="you@example.com"></div>
</div><p></p><button class="btn btn-p" onclick="saveConfig()">Save settings</button></div>
<div class="filters" id="filters">
<span class="chip on" data-f="all">All</span><span class="chip" data-f="forsale">For sale</span>
<span class="chip" data-f="inquire">Inquire (need prices)</span><span class="chip" data-f="sold">Sold</span></div>
<div class="card" style="padding:6px 6px 2px"><table><thead><tr>
<th>Product</th><th>Source</th><th>Status</th><th>Price</th><th>Units</th></tr></thead>
<tbody id="rows"></tbody></table></div>
</div>
<script>
let DATA={products:[],inventory:[]},FILTER='all',OPEN=null;
const $=s=>document.querySelector(s);
function flash(ok,txt){const m=$('#msg');m.className='msg '+(ok?'ok':'err');m.textContent=txt;setTimeout(()=>m.className='msg',3500);}
async function load(){
  const r=await fetch('/api/products');if(r.status===401)return location.href='/';
  const j=await r.json();DATA=j.data;$('#cfgMessenger').value=j.config.messengerUrl||'';$('#cfgEmail').value=j.config.inquireEmail||'';render();}
function rows(){
  const out=[];
  for(const file of ['products','inventory'])for(const p of DATA[file]){
    const st=p.status==='sold'?'sold':(p.inquireOnly?'inquire':'forsale');
    if(FILTER!=='all'&&FILTER!==st)continue;
    out.push({file,p,st});}
  out.sort((a,b)=>a.p.name.toLowerCase().localeCompare(b.p.name.toLowerCase()));return out;}
function render(){
  $('#rows').innerHTML=rows().map(({file,p,st})=>{
    const pill=st==='sold'?'<span class="pill so">SOLD</span>':st==='inquire'?'<span class="pill inq">INQUIRE</span>':'<span class="pill av">FOR SALE</span>';
    const price=p.minPrice!=null?('$'+p.minPrice):(p.inquireOnly?'—':'offer');
    const key=file+':'+p.slug;
    let row='<tr class="rowitem" onclick="toggle(\\''+key+'\\')"><td><b>'+p.name+'</b></td><td style="color:var(--muted)">'+(file==='products'?'for-sale list':'inventory')+'</td><td>'+pill+'</td><td>'+price+'</td><td>'+p.units.length+'</td></tr>';
    if(OPEN===key)row+='<tr class="editor"><td colspan="5">'+editor(file,p)+'</td></tr>';
    return row;}).join('')||'<tr><td colspan="5" style="color:var(--muted);padding:30px;text-align:center">Nothing matches this filter.</td></tr>';}
function editor(file,p){
  const units=p.units.map((u,i)=>'<div class="unit"><span class="acct"><input value="'+(u.account||'').replace(/"/g,'&quot;')+'" id="u_a_'+i+'" placeholder="label"></span>'
   +'<input type="number" min="0" step="1" placeholder="price $" id="u_p_'+i+'" value="'+(u.price!=null?u.price:'')+'">'
   +'<select id="u_s_'+i+'"><option value="available"'+(u.status!=='sold'?' selected':'')+'>available</option><option value="sold"'+(u.status==='sold'?' selected':'')+'>sold</option></select></div>').join('');
  return '<div class="grid2"><div><label>Category</label><input id="e_cat" value="'+(p.category||'').replace(/"/g,'&quot;')+'">'
   +'<label>Tagline</label><input id="e_tag" value="'+(p.tagline||'').replace(/"/g,'&quot;')+'"></div>'
   +'<div><label>Offer copy</label><textarea id="e_off">'+(p.offer||'')+'</textarea></div></div>'
   +'<label><input type="checkbox" id="e_inq" style="width:auto;margin-right:6px"'+(p.inquireOnly?' checked':'')+'>Inquire-only (no public price)</label>'
   +'<label>Licenses / units — set a price to make one buyable; mark sold when it sells</label>'+units
   +'<p></p><button class="btn btn-good" onclick="save(\\''+file+'\\',\\''+p.slug+'\\','+p.units.length+')">💾 Save &amp; rebuild site</button> '
   +'<button class="btn btn-g" onclick="OPEN=null;render()">Cancel</button>';}
function toggle(key){OPEN=OPEN===key?null:key;render();}
async function save(file,slug,n){
  const units=[];for(let i=0;i<n;i++)units.push({account:$('#u_a_'+i).value,price:$('#u_p_'+i).value===''?null:Number($('#u_p_'+i).value),status:$('#u_s_'+i).value});
  const patch={category:$('#e_cat').value,tagline:$('#e_tag').value,offer:$('#e_off').value,inquireOnly:$('#e_inq').checked,units};
  const r=await fetch('/api/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({file,slug,patch})});
  const j=await r.json();flash(r.ok,r.ok?'Saved — live site rebuilt.':(j.error||'save failed'));if(r.ok){OPEN=null;await load();}}
async function saveConfig(){
  const r=await fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({messengerUrl:$('#cfgMessenger').value.trim(),inquireEmail:$('#cfgEmail').value.trim()})});
  flash(r.ok,r.ok?'Settings saved — site rebuilt.':'failed');}
async function publish(){
  flash(true,'Publishing…');const r=await fetch('/api/publish',{method:'POST'});const j=await r.json();
  flash(r.ok,r.ok?(j.pushed?'Published to GitHub.':'Nothing new to publish.'):(j.error||'publish failed'));}
document.querySelectorAll('#filters .chip').forEach(c=>c.onclick=()=>{document.querySelectorAll('#filters .chip').forEach(x=>x.classList.remove('on'));c.classList.add('on');FILTER=c.dataset.f;OPEN=null;render();});
load();
</script>`);

/* ---------- server ---------- */
const server = http.createServer((req, res) => {
  const ip = req.socket.remoteAddress || '?';
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  // first-run setup
  if (!loadEnv()) {
    if (req.method === 'POST' && p === '/setup') {
      return body(req, b => {
        const f = new URLSearchParams(b);
        const pw = f.get('pw') || '', pw2 = f.get('pw2') || '';
        if (pw.length < 8 || pw !== pw2) return html(res, 400, SETUP_PAGE);
        saveCredentials(pw);
        return redirect(res, '/', `ltdadm=${makeSession()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_HOURS * 3600}`);
      });
    }
    return html(res, 200, SETUP_PAGE);
  }

  if (req.method === 'POST' && p === '/login') {
    if (rateLimited(ip)) return html(res, 429, LOGIN_PAGE('Too many attempts — wait 10 minutes.'));
    return body(req, b => {
      const f = new URLSearchParams(b);
      noteAttempt(ip);
      if ((f.get('user') || 'admin') === (loadEnv().LTD_ADMIN_USER || 'admin') && verifyPassword(f.get('pw') || '')) {
        return redirect(res, '/', `ltdadm=${makeSession()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_HOURS * 3600}`);
      }
      return html(res, 401, LOGIN_PAGE('Wrong username or password.'));
    });
  }
  if (p === '/logout') return redirect(res, '/', 'ltdadm=; HttpOnly; Path=/; Max-Age=0');

  const authed = checkSession(req);
  if (p === '/') return html(res, 200, authed ? APP_PAGE : LOGIN_PAGE(''));

  if (!authed) return json(res, 401, { error: 'unauthorized' });

  if (p === '/api/products') {
    return json(res, 200, { data: { products: readData('products'), inventory: readData('inventory') }, config: readConfig() });
  }
  if (req.method === 'POST' && p === '/api/save') {
    return body(req, b => {
      try {
        const { file, slug, patch } = JSON.parse(b);
        if (!FILES[file]) return json(res, 400, { error: 'bad file' });
        const arr = readData(file);
        const item = arr.find(x => x.slug === slug);
        if (!item) return json(res, 404, { error: 'no such product' });
        applyPatch(item, patch || {});
        writeData(file, arr);
        rebuild();
        return json(res, 200, { ok: true });
      } catch (e) { return json(res, 500, { error: String(e.message || e) }); }
    });
  }
  if (req.method === 'POST' && p === '/api/config') {
    return body(req, b => {
      try {
        const { messengerUrl = '', inquireEmail = '' } = JSON.parse(b);
        if (messengerUrl && !/^https:\/\//.test(messengerUrl)) return json(res, 400, { error: 'messenger link must be https' });
        const cfg = readConfig();
        cfg.messengerUrl = messengerUrl.slice(0, 200);
        if (inquireEmail) cfg.inquireEmail = inquireEmail.slice(0, 120);
        fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2));
        rebuild();
        return json(res, 200, { ok: true });
      } catch (e) { return json(res, 500, { error: String(e.message || e) }); }
    });
  }
  if (req.method === 'POST' && p === '/api/publish') {
    try {
      execFileSync('git', ['add', '-A'], { cwd: ROOT });
      let pushed = false;
      try {
        execFileSync('git', ['commit', '-m', 'admin: update listings via LTD Vault admin'], { cwd: ROOT });
        pushed = true;
      } catch { /* nothing to commit */ }
      if (pushed) execFileSync('git', ['push', 'origin', 'main'], { cwd: ROOT });
      return json(res, 200, { ok: true, pushed });
    } catch (e) { return json(res, 500, { error: String(e.message || e) }); }
  }
  return json(res, 404, { error: 'not found' });
});

server.listen(PORT, '0.0.0.0', () => console.log(`ltd-admin listening on :${PORT} (LAN-only by network design)`));
