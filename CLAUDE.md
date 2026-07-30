# ltd — LTD Software Vault storefront (tracked, PUBLIC/ungated)

Static storefront reselling lifetime-deal software licenses. **https://ltd.jrdevelopr.com**
(public, ungated — no lab-gate), local `:8089`, `caddy:2-alpine` file-server
(`docker compose -p ltd`).

- **Source of truth:** `data/products.json`, generated from `data/software.csv` (the owner's
  Google Sheet, exported CSV). Do NOT hand-edit `index.html`/`p/*.html` — they are built.
- **Build pipeline:** `node bin/parse.js` (csv→products.json, groups duplicate license
  "accounts" into one product with N units) → `node bin/merge.js` (applies enrichment from
  research `out*.json`: category, tagline, offer copy, image src, homepage) → `node
  bin/fetch-images.js` (downloads hero images to `site/img/`, SVG lettered-tile fallback; never
  hotlinks) → `node bin/build.js` (renders `site/index.html` + `site/p/<slug>.html`).
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
