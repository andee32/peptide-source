---
name: testing-storefront
description: How to bring up and test the peptide-source storefront locally (Node 24, Postgres, api-server, vite), including the env-driven BRAND_* palette/font re-skin and its gotchas.
---

# Testing the peptide-source storefront locally

## Bring-up

Node 24 is required (default Node 20 breaks pnpm):

```bash
export PATH=/home/ubuntu/.nvm/versions/node/v24.18.1/bin:$PATH
```

1. `docker compose up -d` — Postgres. **The compose file provisions user/pass/db = `app`/`app`/`app`.**
   Older root `.env` files may still point `DATABASE_URL` at a previous name (e.g. `atlab`), which fails with
   `password authentication failed`. Make `.env` contain
   `DATABASE_URL=postgres://app:app@localhost:5432/app` (or match whatever compose currently declares).
2. `pnpm --filter @app/db run push`
3. `pnpm --filter @app/scripts run seed`
4. `pnpm --filter @app/api-server run dev` (:8080)
5. `pnpm --filter @app/storefront run dev` (:5173)

The API is proxied through vite at `http://localhost:5173/api/...`; it does **not** serve `/health` or
`/api/health` at the root, so don't use that as a readiness probe — `curl localhost:5173/api/retail/products`
instead.

## Dev server: always confirm which process owns :5173

Backgrounding vite with `nohup … &` is unreliable here — the process can be killed with the shell, and a
**stale instance keeps port 5173 while the new one silently falls back to 5174** (vite prints
`Port 5173 is in use, trying another one...`). That produces very misleading "my env change had no effect"
results. Prefer:

- run vite in a persistent interactive/tty shell, and
- before judging any UI, verify the server actually restarted:
  `ps -eo pid,etimes,args | grep "[v]ite.js"` (note: `pkill -f "vite --config"` does **not** match; the
  argv is `vite.js --config`, so use `pkill -f vite.js`), and
  `tail /tmp/sf.log` to confirm it bound to 5173, not 5174.

## Reaching gated UI

- Routes are in `artifacts/storefront/src/App.tsx`.
- `/retail/*` and `/shop` (wholesale kit catalog) are each behind a `RuoGate`: tick all three checkboxes and
  click the enter button. The acknowledgment is stored per browser (localStorage), per channel.
- Admin: `/admin`, credentials come from `ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH` in the root `.env` (the dev
  default is commented in that file).
- Checkout requires a cart item: open a retail product, "Add to Cart", then "Checkout" in the drawer.
- The **COA-Verified badge is hidden for seeded batches** because `seed.ts` inserts them with
  `is_demo = true` and `RetailProductPage` requires `latestBatchIsDemo === false`. To make it visible:
  `docker exec app-postgres psql -U app -d app -c "update batches set is_demo=false where id='RET-2026-001';"`
  Retatrutide / BPC-157 / GHK-Cu are the products that have batches.

## Testing the BRAND_* palette / font re-skin

Colours and fonts come from unprefixed `BRAND_COLOR_*` / `BRAND_FONT_*` keys in the **repo-root** `.env`,
resolved in `lib/brand/src/palette.ts` and emitted by `artifacts/storefront/vite-plugin-brand.ts` as the
virtual module `virtual:brand-palette.css`. They are read at vite **config** time, so **you must restart the
dev server** after every change — HMR will not pick them up.

Verify the resolved values directly instead of guessing from pixels:

```bash
curl -s "localhost:5173/@id/__x00__virtual:brand-palette.css" | grep -o '\-\-brand-[a-z0-9-]*: #[0-9a-f]*'
curl -s localhost:5173/ | grep -o '<link href="[^"]*" rel="stylesheet">'   # the %BRAND_FONT_CSS% injection
```

### Gotcha: quote hex values

`loadEnv`/dotenv treats a value starting with `#` as a comment, so `BRAND_COLOR_PRIMARY=#ff0066` resolves to
`""` and silently falls back to `paletteDefaults` — i.e. **no re-skin, no error**. Always write
`BRAND_COLOR_PRIMARY="#ff0066"` when testing. (`.env.example` may still ship the unquoted form; if a re-skin
"doesn't work", check quoting first.) Verify with:

```bash
node -e "import('vite').then(v=>console.log(JSON.stringify(v.loadEnv('development','<repo-root>',''))))"
```

### Gotcha: empty font URL

An empty `BRAND_FONT_CSS_URL` may not suppress the `<link>` — because empty falls back to the default
Inter/Lato URL, the `if (!url) return ""` path in `fontLink()` can be unreachable from env. Assert on the
served `index.html`, not on how the page looks.

### Known/accepted gap

The `.section-deep` dark hero band's inversion colours are still literal hexes — not a re-skin failure.

## Devin Secrets Needed

None — all credentials for local testing live in the gitignored root `.env` (admin login, DB URL).
