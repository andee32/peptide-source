# AT Lab Sourcing — CLAUDE.md

**Status: active build.** Hard-fork of Lab-Standard-Initiative (LSI), created 2026-07-21.
The AT Lab B2B/B2C peptide platform. LSI stays frozen and untouched — this repo does
NOT share packages with it (standalone `@atlab/*` workspaces).

## What it is

An AT Lab Sourcing–branded peptide commerce platform built on LSI's engine. Reuses
LSI's crypto-payment / per-lot COA registry / spec-driven API core near-verbatim, and
adds the three layers LSI lacked: a **B2B wholesale layer** (accounts + KYB, 10-vial
kits, 5-kit MOQ, tiered price books), the **AT Lab light-first design system**, and a
**real server-side RUO compliance gate**. B2B-first; B2C (subscriptions) is a later phase.

Roadmap phases: **0** fork & harden (this) · **1** B2B core · **2** rebrand · **3**
compliance gate (HARD launch blocker) · **4** B2C revival.

## Non-negotiables

- **Payments: crypto-first (BTCPay) + ACH/wire + Zelle only. NEVER Stripe / PayPal /
  Square / Shopify Payments** — they prohibit this vertical and freeze funds. `card` is
  being removed from the payment enum in Phase 3. **Zelle is wholesale-only**, rejected
  server-side on retail orders, re-checks that the account is still `approved` on every
  request, and stays 503 until `ZELLE_RECIPIENT` + `ZELLE_RECIPIENT_NAME` are provisioned.
- **Everything is research-use-only (RUO) — not for human or animal consumption.** The
  compliance model is a **server-side RUO attestation per order** (buyer affirms research
  use; stored as the record-of-record), NOT per-SKU blocking. Per owner decision, we do
  **not** gate individual products — `complianceStatus` stays as a dormant admin control
  (defaults to `cleared` for all SKUs, incl. Retatrutide); do not re-block SKUs by default.
  Before launch, counsel must approve the attestation text (`ATTESTATION_TEXT` in orders.ts)
  and finance must provision real ACH bank details — both are placeholder-guarded.
- **Never hand out a fabricated pay-to address.** `services/btcpay.ts` fails CLOSED (503)
  when unconfigured, and rejects unsigned/unconfigured webhooks. Do not reintroduce stubs.
- **No secrets in the tree.** Env comes from `.env` (gitignored); see `.env.example`.

## Monorepo layout

pnpm workspaces, Node 24, TS 5.9, TS project references (`extends tsconfig.base.json`).
Workspaces renamed from LSI's `@workspace/*` to `@atlab/*`:

```
artifacts/api-server   @atlab/api-server   Express 5 API, /api, port 8080
artifacts/storefront   @atlab/storefront   React 19 + Vite + Wouter + Tailwind v4 + shadcn
artifacts/mockup-sandbox @atlab/mockup-sandbox  component preview
lib/db                 @atlab/db           Drizzle + Postgres schema
lib/api-spec           @atlab/api-spec     OpenAPI 3.1 + Orval codegen
lib/api-zod            @atlab/api-zod       Zod schemas (GENERATED — do not hand-edit)
lib/api-client-react   @atlab/api-client-react  React Query hooks (GENERATED)
scripts                @atlab/scripts      seed.ts
```

## Dev commands

- Install: `pnpm install` (preinstall rejects npm/yarn). Keep the non-darwin `overrides:`
  block in `pnpm-workspace.yaml` intact.
- Typecheck all: `pnpm run typecheck`. Build: `pnpm run build`.
- API: `pnpm --filter @atlab/api-server run dev` (loads root `.env` via `--env-file-if-exists`).
- Storefront: `pnpm --filter @atlab/storefront run dev`.
- DB push: `pnpm --filter @atlab/db run push` (needs `DATABASE_URL`).
- Regenerate API types: edit `lib/api-spec/openapi.yaml`, then
  `pnpm --filter @atlab/api-spec run codegen`. **Never hand-edit api-zod / api-client-react.**
- Seed: `pnpm --filter @atlab/scripts run seed`.

## Build, test & verify

- **Green-signal gate:** there is no test suite yet, so `pnpm run typecheck` is the
  gate — it must pass before any change is considered done (a Stop hook enforces it).
  Add tests alongside new features and promote the suite to the gate once it exists.
- `pnpm run build` requires the native esbuild/rollup/oxide toolchain installed for
  this platform (the LSI `overrides` block originally stripped the host binaries).
- **Before committing** changes to payments, auth, or compliance
  (`orders.ts`, `webhooks.ts`, `services/btcpay.ts`, `admin.ts`, `attestations.ts`),
  run the `security-reviewer` subagent. Run `code-reviewer` on non-trivial diffs.
- Never mark work done without showing the typecheck (and, once available, build)
  result. Never wire live BTCPay/SMTP/DB endpoints in a test — use a scratch DB.

## Design system

Source of truth: `design-system/tokens.css` + `design-system/theme.tailwind.css`
(extracted from live atlabsourcing.org). Light-first: bg `#f5f4f0`, navy `#1a4d6e`
= structure, teal `#00b4c4` = primary action, gold `#c8a84b` = premium/COA-verified.
Deep-navy `#0a1628` is a section treatment, not the app default. Phase 2 rewrites
`artifacts/storefront/src/index.css` from these tokens and self-hosts Syne/Lato/DM Mono.

## Built so far (through 2026-07-27) — Phase 1 largely complete

- **Unified accounts.** One identity = `customer_users` (email + password + session);
  the wholesale profile (`customer_accounts`) is an admin-approved add-on linked via
  `customerUserId` — no access tokens. **Guest checkout stays the default**; optional
  account creation added at checkout + post-purchase (`POST /orders/:id/claim`, email-gated).
- **Wholesale tiers = editable % off list** (`price_tiers.discountBps`, DB CHECK 0..9000),
  managed in **Admin → Price Tiers**. Server derives every wholesale price.
- **Payment methods = admin on/off per channel** (`payment_methods` table; **Admin →
  Payments**) with per-key config readiness — replaces the `VITE_*_ENABLED` build flags.
  A rail is live only when enabled AND its backend config is provisioned (fail-closed
  guards unchanged). Zelle's retail toggle is permanently locked off.
- **Order lifecycle gained a `shipped` stage** (confirmed → shipped, `shippedAt` +
  tracking; revenue counts confirmed+shipped).
- **Emails wired** via SMTP/nodemailer, placeholder-guarded (log until SMTP set). On
  placement: buyer rail-aware "how to pay" (links to the order page, never embeds live
  bank/crypto/Zelle detail) + ops "order received". On confirm: buyer order-confirmation +
  shipper/fulfillment notice. On ship: shipment. On payment expiry/invalid (BTCPay webhook):
  buyer payment-failed. On wholesale approve/reject: buyer decision email. Daily sweep:
  one-time unpaid-order recovery reminder (72h–14d old; idempotent via
  `orders.recoveryEmailedAt`). Plus password reset/invite. Shipper/ops address =
  `store_settings.fulfillmentEmail` (admin-only, set in Settings). SMTP currently points at
  **Resend on the `aletheahealth.ai` domain — INTERIM**; move to an AT Lab domain before
  launch (see memory).
- **RUO entry gates** for both retail and wholesale (shared `RuoGate`). Admin nav is
  Customers (identity-centric) + Price Tiers + Payments, responsive.
- Backend is now covered by integration tests (`test/**` via node:test) + vitest units.

## Fork notes / gotchas

- Trust model is first-party COAs + direct owner relationship — the LSI public
  "reviewer ledger" and any hardcoded purity stat are dropped (Phase 2), not kept.
- Server derives all prices; the client never sends a price. Wholesale prices resolve
  from the account's assigned tier (`discountBps` % off list).
- Original LSI blockers still to clear beyond Phase 0: batch↔order linkage, subscription
  reactivation, and placeholder Janoshik integration. (The order-email set is now complete.)
- LSI reference docs copied in (SPRINT-PLAN-CRITICAL-BLOCKERS.md, PRODUCT-GAP-AUDIT.md,
  etc.) describe the donor's pre-fork state — read as history, not current truth.
