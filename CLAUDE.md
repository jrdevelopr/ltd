# ltd — LTD Software Vault storefront (tracked, PUBLIC/ungated)

Static storefront reselling lifetime-deal software licenses. **https://ltd.jrdevelopr.com**
(public, ungated).

**Hosting: everything runs on one Cloudflare Worker** (`ltd`), since 2026-09-15. Nothing is
served from this box any more.

- **The catalogue lives in D1** (database `ltd`, id `0079f3ec-273a-462a-bbcb-d9e4c5f1db74`),
  tables `products`, `units`, `config`, `admin`. `db/schema.sql` is the schema; `db/migrate.mjs`
  turned the old JSON into `db/seed.sql` once. Derived fields (status, counts, min/sold price)
  are computed from `units` at read time, never stored.
- **Pages are rendered on request from D1** by `worker/render.js`, which is `bin/build.js`
  ported verbatim (proven byte-identical on all 96 pages), and held in isolate memory for
  60 s (`worker/cache.js`). Images, `style.css` and `thanks.html` are static assets served free;
  `site/.assetsignore` keeps the old generated HTML out of the upload.
- **The admin is at https://ltd.jrdevelopr.com/admin** (`worker/admin.js`, UI in
  `worker/admin-pages.js`). Username `admin`. Edits are live within a minute, no build, no
  deploy, no publish step. Password is PBKDF2 in D1; change it from the "Admin password" card.
  Login is rate limited per IP; a Cloudflare Access rule on `/admin*` would add a second wall.
- **Card checkout** (`POST /api/stripe-checkout`, `worker/checkout.js`) reads prices from D1.
  The Stripe key is a Worker secret (`wrangler secret put STRIPE_SECRET_KEY`).
- **Deploy** (only needed for code changes now): `npx wrangler@4 deploy` from this folder with
  `CLOUDFLARE_EMAIL`, `CLOUDFLARE_API_KEY`, `CLOUDFLARE_ACCOUNT_ID` from
  `/etc/ubuntulab/cloudflare-new.env`. To try a change first: `npx wrangler@4 deploy --env
  staging` puts it on `ltd-cf.jrdevelopr.com` against the same database; delete that Worker
  again afterwards (`wrangler delete --name ltd-staging`) so the admin login is not exposed twice.
- **Retired, kept for history only:** `admin/server.js` (the LAN admin, unit
  `app-ltd-admin.service` disabled), `bin/build.js`, `bin/parse.js`, `bin/merge.js`,
  `data/products.json`, `data/inventory.json`, `docker-compose.yml`, `Caddyfile`.
  Do not run `bin/build.js` and do not edit the JSON: the database is the only source of
  truth now. `data/software.csv` imports would need a new path (CSV -> D1) if ever wanted.
- **Free-plan CPU note:** a cold page render costs 3-15 ms of CPU and a login about 11 ms,
  against the free plan's 10 ms guideline. Cloudflare tolerates occasional overruns and none
  failed in testing, but Workers Paid ($5/mo) removes the concern entirely.

- **Source of truth:** the D1 database (see Hosting below). `data/products.json` and
  `data/software.csv` are the historical import; they are no longer read by anything.
- **Build pipeline: retired.** The old `parse.js -> merge.js -> fetch-images.js -> build.js` chain
  produced static HTML from the JSON. Pages now render from D1 on request (see Hosting).
- **Payments:** PayPal.Me `paypal.me/shrockbusiness/<amount>` (fixed-price items) or the open
  `paypal.me/shrockbusiness` for "Make an Offer" items. The owner also gave paypal@shrockservice.com.
- **Data model:** each product has `units[]` (individual license accounts, each with its own
  price + status available/sold). Catalog groups them; the product page lists each unit with a
  buy button. Sold items are shown greyed with a SOLD badge (owner directive — social proof).
- **Styling = Tailwind CSS v4.** Authored in `site/src/input.css` (`@import "tailwindcss"` +
  `@theme` tokens aliased to the runtime light/dark CSS vars + component styles), compiled to the
  served `site/style.css` via `npm run css` (or `npm run build` for css+html). Edit `input.css`,
  never `style.css` (it's the built artifact, committed so the container serves it without a build).
  Design tokens are exposed as utilities (`bg-brand`, `text-ink`, `border-line`, …) for new markup.
- **Editing:** change price/copy in `products.json` (or `inventory.json`) then `node bin/build.js`
  + reload (volume mount is live). Re-importing the sheet overwrites `products.json` — re-run
  `merge.js` after. Inventory items live in `data/inventory.json` (one license each; tier = stacked
  codes). AppSumo tier tables/ratings come from `bin/merge-appsumo.js`.
- **Public exposure:** Cloudflare DNS CNAME `ltd` → tunnel UUID, ingress hostname rule in
  `~/server-setup/cloudflared/config.yml` (above the 404 catch-all), Caddy route
  `~/server-setup/caddy/apps.d/ltd.caddy` (ungated — no `import gate`). Repo is PUBLIC — keep secret-free.
- **Admin backend** (`admin/server.js`, native Node, **LAN-only :8093**, not routed publicly):
  login-gated editor for prices/sold/units/copy + site settings (Messenger link, inquiry email →
  `data/config.json`, read by build.js). First visit shows a one-time set-your-password screen;
  scrypt hash + session secret live in `~/.config/ltd-admin/env` (600, outside the repo — delete
  that file to re-run setup). Every save rewrites the JSON + reruns `bin/build.js` (site updates
  instantly via the volume mount). "Publish to GitHub" = git add/commit/push. Persistence: systemd
  unit `app-ltd-admin.service` (install requires owner consent / manual sudo).
- **Stripe card checkout** (added 2026-07-30): each buyable unit offers PayPal *and* "Pay by
  Card". Card flow: `POST /api/stripe-checkout {slug, unit}` — served by the admin service
  (:8093) but publicly routed for that single path via `caddy/apps.d/ltd.caddy` (path `handle`;
  admin auth untouched). Price/name resolved server-side from products/inventory JSON; sold and
  inquire-only items rejected; 30/10min/IP rate limit. `STRIPE_SECRET_KEY` lives in
  `~/.config/ltd-admin/env` (same Shrock Stripe account as Bluegrass). Card price = PayPal price
  (no surcharge). Success → `site/thanks.html`; cancel → the product page.
