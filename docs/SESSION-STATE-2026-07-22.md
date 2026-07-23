# Session state — 2026-07-22

Branch `claude/fon-a74da7`, 4 commits, clean tree, **not pushed** (no git remote
exists in this repo). Typecheck green, 28 unit tests green.

---

## What landed

| Commit | Scope |
|---|---|
| `76347a9` | chore(dev): worktree-friendly launch config; pnpm `allowBuilds` stub fixed |
| `06b9224` | fix(ui): design-system + a11y pass (contrast, popover token, age gate, admin colors) |
| `c87afec` | feat(discounts): two-slot discount system (promo codes + crypto incentive) |
| `1bfb2c5` | feat(catalog): wholesale/retail catalog split + retail kit pricing |

### Discount system (`docs/discount-system-design.md` is the spec)
Two-slot model, capped at 2 by construction: **Slot A** = one promotion (promo
codes now; subscription discounts reserved), **Slot B** = crypto payment
incentive, applied *sequentially* on the post-promo amount. Wholesale gets
neither — a code on a wholesale order is a hard 422. Every discounted cent is
attributable via flat provenance columns on `orders`, asserted to sum to
`discountCents` at insert. Codes consume atomically inside the order
transaction (conditional UPDATE, never check-then-increment).

The crypto discount rate is now an admin setting
(`store_settings.crypto_discount_bps`), not a hardcoded 10%.

### Catalog split
Wholesale pricing is the thing worth gating — public retail catalogs are the
industry norm, and FDA/FTC enforcement targets marketing copy, not catalog
visibility (see "Research findings" below).

- `GET /products*` require an APPROVED wholesale account's `x-account-token`.
- `/retail` is the public storefront, behind the age/RUO interstitial.
- Retail buyers can buy **kits** only when an admin sets
  `productVariants.retailPriceCents`; null = wholesale-only and hidden.
  Wholesale continues to pay `tier ?? list`. Server 422s
  (`KIT_PRICING_INVERTED`) if a kit's retail price is not above its list price.
- One pricing pipeline (`priceOrderRequest`) backs both order creation and
  `POST /orders/quote`, so preview and charge cannot diverge.

---

## Research findings (why the gating is shaped this way)

- Open retail catalogs with public retail prices are **industry standard**;
  entry age/RUO gates are voluntary and inconsistently applied.
- No enforcement action found turned on catalog *visibility*, and no statute
  restricts *viewing* RUO compounds. The April 2026 FDA warning letters (seven
  peptide sellers) turned on **therapeutic claims in product copy**, bundling
  with bacteriostatic water, and obfuscated naming. RUO disclaimers gave zero
  protection.
- Gating **wholesale/tier pricing** behind approved accounts is the norm
  (peptide wholesalers and the Sigma-Aldrich quote-gated model alike).
- Processors review live catalogs and terminate peptide merchants — another
  reason the crypto-first/no-Stripe stance is correct, and another reason
  product *copy* is the risk surface.

---

## Open items

### Launch gates (blocking)
- **`trust proxy`** must be set to the real hop count at deploy, or every rate
  limiter collapses into one shared bucket behind a load balancer.
- **Counsel** must approve `ATTESTATION_TEXT` (placeholder-guarded — the server
  refuses to boot in production until replaced).
- **Finance** must provision real ACH bank details (currently 503-gated).
- **Product copy review** — descriptions carry wholesale/therapeutic-adjacent
  phrasing. This is the actual regulatory risk surface per the research above.

### Known gaps (not blocking, decided to defer)
- `POST /subscriptions` creates a recurring shipment obligation with **no RUO
  attestation record**, unlike `POST /orders`. Real compliance gap; matters for
  the B2C revival phase.
- `GET /subscriptions?email=` returns a subscriber's plan and status to anyone
  who guesses the email.
- Wholesale token lives in `localStorage` alongside the Segment script — an XSS
  or supply-chain compromise reads it. Acceptable for Phase 1; consider
  short-lived server-minted sessions later.
- Accounts panel can filter "suspended" but has no suspend/reactivate action.
- No token-rotation endpoint — wholesale access is revoked via account status.
- `ReviewersPage` / `ReviewerSubmitPage` are unrouted donor leftovers (the
  reviewer ledger is dropped per the fork notes); the latter would 401 now.
- Admin micro-labels are 10–11px — a design call, not a bug.

### Dev-only data to clear before launch
- Discount code **`TEST10`** (10%, unlimited) — deactivate in Admin → Discounts.
- **`$189`** retail price on the Tirzepatide 10mg kit — demo value.

### Decisions made this session (reversible)
- Age gate stays scoped to the retail store, remembered per browser.
- Homepage "Featured Compounds" stays public (reads the retail catalog).
- Kits are retail-sellable but hidden until priced — safe default.

---

## Environment hazard

`~/Documents/atlabsourcing` is being **actively synced by a cloud tool**
(iCloud/Dropbox). It generated 123 byte-identical conflict copies (`api 2.ts`,
`account 2.ts`, …), and produced a fresh one mid-session. These were removed
and never committed, but syncing a live git repo with `node_modules` risks real
corruption. Recommend excluding the folder from sync.

## Dev notes

- This worktree's API runs on **8081** (`PORT=8081 pnpm --filter
  @atlab/api-server run dev`); 8080 belongs to the main checkout.
- `pnpm` may need `--config.verify-deps-before-run=false` in this worktree.
- Gate before "done": `pnpm run typecheck` **and**
  `pnpm --filter @atlab/api-server run test`.
