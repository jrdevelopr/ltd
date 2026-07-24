# LTD Software Vault

A static storefront for reselling **lifetime-deal (LTD) software licenses** — WordPress
plugins, SaaS apps, AI tools and more. Browse a spreadsheet-style catalog; each product has its
own page with an image, an offer, license details, and a **PayPal.Me** buy button.

- **Public:** https://ltd.jrdevelopr.com
- **Local:** http://192.168.20.108:8089
- **Payments:** PayPal.Me → `paypal.me/shrockbusiness/<amount>`

## How it works

Pure static site served by `caddy:2-alpine` (no backend). The whole catalog is generated from
one data file, `data/products.json`, which is built from the source spreadsheet
`data/software.csv`.

### Build pipeline

```
node bin/parse.js         # software.csv  -> products.json (groups duplicate license accounts)
node bin/merge.js         # merge research enrichment (out*.json) -> category/offer/image/homepage
node bin/fetch-images.js  # download hero images locally to site/img/ (SVG lettered-tile fallback)
node bin/build.js         # render site/index.html + site/p/<slug>.html
```

Then reload — the `site/` dir is volume-mounted read-only, so no rebuild of the container is needed.

### Editing a listing

Edit the product in `data/products.json` (price lives in `units[].price`, copy in `offer`,
`tagline`, `category`) and re-run `node bin/build.js`. To re-import from the spreadsheet, replace
`data/software.csv` and run the full pipeline (note: `parse.js` overwrites `products.json`, so
re-run `merge.js` afterward to re-apply enrichment).

## Bring up

```
cd ~/apps/ltd && docker compose -p ltd up -d
```
