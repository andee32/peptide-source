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

## Fork notes / gotchas

- Trust model is first-party COAs + direct owner relationship — the LSI public
  "reviewer ledger" and any hardcoded purity stat are dropped (Phase 2), not kept.
- Server derives all prices; the client never sends a price. Wholesale prices resolve
  from the account's assigned tier (Phase 1).
- Original LSI blockers still to clear beyond Phase 0: batch↔order linkage, missing
  order/failed-payment emails, subscription reactivation, placeholder Janoshik integration.
- LSI reference docs copied in (SPRINT-PLAN-CRITICAL-BLOCKERS.md, PRODUCT-GAP-AUDIT.md,
  etc.) describe the donor's pre-fork state — read as history, not current truth.
