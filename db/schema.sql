-- LTD Software Vault catalogue. This replaces data/products.json and
-- data/inventory.json as the source of truth, so an edit in the admin is live
-- immediately with no rebuild and no deploy.
--
-- Only editable facts are stored. Everything the old JSON carried as a derived
-- field (status, availCount, soldCount, minPrice, soldPrice) is computed from
-- the units at read time, using the same rules bin/parse.js used, so the two
-- can never drift apart.

CREATE TABLE IF NOT EXISTS products (
  slug          TEXT PRIMARY KEY,
  source        TEXT NOT NULL DEFAULT 'products',  -- 'products' (for sale) | 'inventory'
  name          TEXT NOT NULL,
  descr         TEXT,          -- 'desc' is reserved in SQL
  homepage      TEXT,
  image         TEXT,
  local_img     TEXT,
  category      TEXT,
  offer         TEXT,
  tagline       TEXT,
  appsumo_url   TEXT,
  appsumo_image TEXT,
  inquire_only  INTEGER NOT NULL DEFAULT 0,
  license_tiers TEXT,          -- JSON array, rendered by the tiers panel
  reviews       TEXT,          -- JSON
  highlights    TEXT,          -- JSON array
  tier          INTEGER,       -- AppSumo tier of the listing, shown on inquire-only items
  code_count    INTEGER,       -- number of stacked codes, same use
  multi_date    INTEGER,       -- flag carried from the sheet import (boolean)
  sort          INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT
);

CREATE TABLE IF NOT EXISTS units (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT NOT NULL,
  idx        INTEGER NOT NULL,   -- position within the product; checkout addresses units by this
  status     TEXT NOT NULL DEFAULT 'available',
  price_kind TEXT NOT NULL DEFAULT 'fixed',
  price      REAL,
  account    TEXT
);
CREATE INDEX IF NOT EXISTS idx_units_slug ON units(slug, idx);

CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT);

-- Admin credentials and the session-signing secret. Passwords are PBKDF2 here
-- rather than scrypt, because Workers expose PBKDF2 through WebCrypto and have
-- no scrypt. That means the existing password does not carry over and is set
-- fresh on first visit, exactly as the original admin did.
CREATE TABLE IF NOT EXISTS admin (key TEXT PRIMARY KEY, value TEXT);
