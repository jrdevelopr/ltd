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
