# Discount System — Design Spec

**Status:** approved design, ready to implement. Supersedes the hardcoded-crypto-discount era.
**Grounding verified against this tree (2026-07-22):** the `cryptoDiscountBps` conversion is **already landed** — `orders.ts` L32–38/L287 reads the setting via `getCryptoDiscountBps()`, `routes/settings.ts` L18 returns it, `admin.ts` L1298–1330 accepts it. Do not re-plan that wiring. The only stale remnant is the "10% Transparency Discount" copy at `lib/api-spec/openapi.yaml` L225.

---

## Goals & non-goals

**Goals**

1. Give `orders.discountCents` provenance — today it is a bare number implying "crypto" by convention.
2. Add retail promo codes: the affiliate-attribution and campaign lever.
3. Keep the crypto discount doing its actual job — steering buyers onto the preferred payment rail — even while a promo runs.
4. One choke point: a pure `resolveDiscounts()` function called once in `POST /orders`. Totals freeze at creation; BTCPay/ACH keep charging `totalCents` verbatim, unchanged.
5. Reserve a seat for B2C subscription discounts (roadmap Phase 4) without building anything now.

**Non-goals (deliberate exclusions — reopening any of these reopens the stacking matrix this design exists to avoid)**

- **No wholesale discounts, ever.** Wholesale concessions go through absolute price tiers, full stop. Tiers are pricing, not discounts, and never write to `discountCents`.
- No SKU-scoped or line-level discounts. Order-level only; `lineItems` jsonb keeps undiscounted `unitPriceCents`.
- No fixed-amount codes, no per-customer limits (guest checkout has no identity), no multi-code stacking, no retail volume breaks (MOQ + tiers already encode volume economics), no segment rules engine.
- No price-tier CRUD — that is Phase-1 wholesale work. **Parked idea for that backlog, not this system:** `price_tiers.discountBps` as a Stage-1 *pricing* fallback ("X% off retail" when no `price_list_entries` row exists) — a real solo-founder win over authoring full price lists, but it is wholesale base pricing and must never touch `discountCents`.

## Judge-conflict resolution (recorded so it isn't relitigated)

- **Best-one-wins vs. stacking:** the winning proposal made crypto and promo compete (best-one-wins). Both judges flagged the cost: every promo campaign would silently neutralize the incentive to pay crypto — a strategic own-goal for a crypto-first shop. **Resolved: two slots.** Slot A = one promotion (promo code now; subscription later, best-of within the slot). Slot B = crypto payment incentive, retail-only, applied sequentially on the post-promotion amount. Stacking depth is capped at exactly 2 by construction; there is no matrix.
- **Provenance shape:** jsonb breakdown (Two-Slot Ledger) vs. flat columns (winner). With at most two known slots, flat columns are sufficient, SQL-queryable, and drift-proof. **Resolved: flat columns**, one per slot, plus a Slot-A source discriminator reserved for `subscription`.
- **Abandoned-order code burn:** atomic increment at creation (winner) vs. counting live orders (Two-Slot). **Resolved: atomic increment**, with the escape hatch named now (see Risks). Status-filtered counting is rejected permanently — it couples code exhaustion to expiry-sweep health.

---

## Mechanisms (per channel)

| Channel | Mechanism | Slot | Notes |
|---|---|---|---|
| Retail | Crypto payment incentive | B | Existing. `store_settings.crypto_discount_bps` (0–5000), admin-tunable. |
| Retail | Promo code | A | New. Percent-only (bps), one code per order, hard-validated. |
| Retail | Subscription discount | A (reserved) | Roadmap Phase 4. Best-of vs. code within Slot A. **Zero code now.** |
| Wholesale | Price tiers (`price_list_entries`) | — | Existing, unchanged. Pricing, not a discount. `discountCents = 0` always. |
| Wholesale | *(nothing else)* | — | A submitted code is a hard 422, never silently ignored. |

---

## Data model (Drizzle sketches)

```ts
// lib/db/src/schema/discountCodes.ts (new)
export const discountCodesTable = pgTable("discount_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),        // stored UPPERCASE; lookup uppercases input
  percentBps: integer("percent_bps").notNull(), // 1..5000 (same ceiling as cryptoDiscountBps)
  active: boolean("active").notNull().default(true),
  expiresAt: timestamp("expires_at"),           // null = never
  maxUses: integer("max_uses"),                 // null = unlimited (total uses, not per-customer)
  timesUsed: integer("times_used").notNull().default(0),
  note: text("note"),                           // attribution ledger: "affiliate — @DrSmith"
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
// Never hard-deleted (orders FK + snapshot the code). Deactivate instead.
```

```ts
// lib/db/src/schema/orders.ts — add to ordersTable
// discountCents (existing) stays authoritative; insert asserts
// discountCents === promoDiscountCents + cryptoDiscountCents.
discountSource: text("discount_source"),      // Slot A source: 'code' | 'subscription'; null if Slot A empty
discountCode: text("discount_code"),          // snapshot string; set iff discountSource === 'code'
discountCodeId: integer("discount_code_id")   // FK join key for per-code reporting
  .references(() => discountCodesTable.id),
promoDiscountCents: integer("promo_discount_cents").notNull().default(0),   // Slot A amount
cryptoDiscountCents: integer("crypto_discount_cents").notNull().default(0), // Slot B amount
```

`discount_source` is plain text validated in app code (no pgEnum) — avoids enum-migration churn when `subscription` activates.

**One-time backfill (must run before any code order exists):**
`UPDATE orders SET crypto_discount_cents = discount_cents WHERE discount_cents > 0;`
Provably correct — crypto is the only mechanism that has ever written `discountCents`.

No `store_settings` changes; no new tables beyond `discount_codes`.

---

## Price-resolution algorithm

One pure function, the single choke point. Any future "let this code work for wholesale" / "stack two codes" request is answered by changing this function's rules explicitly — never by a call-site bypass.

```
resolveDiscounts({ isWholesale, paymentMethod, subtotalCents, code?, cryptoBps })
```

Called once inside `POST /orders`. Totals freeze at creation; nothing downstream recomputes (BTCPay invoice, ACH record charge `totalCents` verbatim — existing invariant, unchanged).

**Stage 0 — base prices (pricing, not discounts).** Unchanged from today (`orders.ts` L257–266): wholesale unit price = `price_list_entries(tier, variant) ?? variant.priceCents`; retail = `variant.priceCents`. `subtotalCents = Σ unit × qty`.

**Wholesale short-circuit.** `discountCents = 0` always. A submitted `discountCode` → **422 `CODE_NOT_APPLICABLE`**. Crypto bps never applies (existing invariant preserved verbatim). Done.

**Slot A — one promotion (retail only).** If a code was submitted it must be *fully* valid — exists, `active`, not expired, `timesUsed < maxUses` — or the order is rejected (**422 `INVALID_DISCOUNT_CODE`** / **`CODE_EXHAUSTED`**). An invalid code never silently degrades to no-discount: on refundless crypto rails, a buyer paying full price while believing they got a discount is a dispute magnet. This rule is load-bearing.

```
promoDiscountCents = min(round(subtotalCents * percentBps / 10000), subtotalCents)
running = subtotalCents - promoDiscountCents
```

Future: `subscription` becomes a second Slot-A candidate; server computes both in cents, keeps the larger, records only the winner (tie → code, preserving affiliate attribution). No schema change needed.

**Slot B — payment incentive (retail only).** Sequential on the running total, *not* additive bps (10% code then 10% crypto = 19%, never 20%):

```
cryptoDiscountCents = isCrypto ? round(running * cryptoBps / 10000) : 0
```

Slots stack because they buy different things: A moves the sale, B moves the payment rail.

**Finalize.**
`discountCents = promoDiscountCents + cryptoDiscountCents; totalCents = subtotalCents - discountCents.` Clamps guarantee `totalCents ≥ 0`; both bps ceilings are 5000, so worst-case total erosion is bounded at 75% (realistic: crypto stays ~1000 bps → a max code yields 55%). Persist all provenance columns.

**Code consumption — atomic, inside the existing order+attestation transaction:**

```sql
UPDATE discount_codes SET times_used = times_used + 1
WHERE id = $1 AND active
  AND (expires_at IS NULL OR expires_at > now())
  AND (max_uses IS NULL OR times_used < max_uses);
-- 0 rows updated → roll back, 422 CODE_EXHAUSTED
```

No check-then-increment in app code, ever — the conditional UPDATE is the race fix.

---

## Admin UX

Follows existing `admin.ts` patterns throughout: `adminAuth` middleware, zod `safeParse` → 400 `bad_request`, try/catch → 500 `internal_error`, multi-write in `db.transaction`.

1. **Settings page (exists).** `cryptoDiscountBps` field already wired. Add: 2–3 sample effective prices next to the input (real variants, computed client-side) so bps tuning shows dollars, not basis points. Reuse the same sample-price widget on the code-create form.
2. **New "Discounts" page** — one table + one create form.
   - Table: code, percent, timesUsed/maxUses, expiresAt, note, active toggle, and per-row report figures (see 4). No delete button — deactivate only.
   - Create: code (auto-uppercased), percent (≤ 50%), optional expiry, optional maxUses, optional note.
   - **Edit rules, server-enforced in PATCH** (not just UI omission): once `timesUsed > 0`, `code` and `percentBps` are frozen (422 on attempt); `expiresAt`, `maxUses`, `active`, `note` stay editable — so the founder can extend a live campaign or raise a burned-down cap in one click. To change economics, deactivate and mint a new code.
3. **Order detail + customer order history**: render provenance — "Discount: −$12.40 (code LAUNCH10) −$8.20 (crypto payment)". Orders predating the backfill columns render normally (backfill stamps them as crypto).
4. **Affiliate report** — `GET /admin/discount-codes/:id/report`: `timesUsed` plus count and `sum(totalCents)` of orders `WHERE discount_code_id = :id AND status = 'confirmed'`. Confirmed-only sidesteps the abandoned-order overcount. This one GROUP-BY-free query is the entire affiliate payout report.

---

## API surface (OpenAPI additions — edit `openapi.yaml`, then codegen; never hand-edit api-zod / api-client-react)

- `CreateOrderRequest` + `discountCode?: string` (trim, uppercase server-side, max 64).
- **`POST /orders/quote`** (public): same request shape as create, runs the *exact* `resolveDiscounts()` pipeline — no writes, no `times_used` increment. Returns `subtotalCents`, `promoDiscountCents`, `cryptoDiscountCents`, `totalCents`, applied source/code. One code path for preview and creation kills preview-drift by construction. Rate-limit it; rejection reasons stay generic on this public surface (detail lives in admin).
- Order responses (create, admin detail, `routes/auth.ts` history projection) gain `discountSource`, `discountCode`, `promoDiscountCents`, `cryptoDiscountCents`.
- Admin: `GET/POST /admin/discount-codes`, `PATCH /admin/discount-codes/:id` (freeze rules above), `GET /admin/discount-codes/:id/report`.
- New 422 codes: `CODE_NOT_APPLICABLE`, `INVALID_DISCOUNT_CODE`, `CODE_EXHAUSTED` (style-matched to `WHOLESALE_KIT_REQUIRED` / `MOQ_NOT_MET`).
- Fix stale copy at L225 ("optional 10% Transparency Discount") → settings-driven wording; grep storefront for any hardcoded "10%" copy and make it read `GET /settings`.

---

## Phased rollout (each phase shippable + green `pnpm run typecheck` alone)

**Phase A — copy fix only.** The bps conversion is already landed; this phase is just the stale `openapi.yaml` L225 description + any hardcoded storefront "10%" copy → codegen. *Verify:* typecheck; storefront shows the settings-driven percentage after an admin bps change.

**Phase B — provenance + resolver (behavior-identical).** New order columns, db push, **run the backfill**, extract existing logic into pure `resolveDiscounts()` with unit tests (sequential math, clamps, wholesale-zero, rounding), stamp `cryptoDiscountCents` on new orders, assert sum === `discountCents` at insert, render provenance on admin order detail. *Verify:* typecheck + tests; a crypto order's columns sum correctly; backfill row counts match `discount_cents > 0`.

**Phase C — promo codes end-to-end (server).** `discount_codes` table; `discountCode` on create + `POST /orders/quote` in openapi → codegen; Slot-A validation + atomic consumption in the order transaction; 422 codes; admin CRUD with server-enforced freeze rules + report endpoint. **Run security-reviewer (touches `orders.ts`).** *Verify:* typecheck; tests for expired/exhausted/wholesale-submitted 422s, stacking math, and a concurrency test at `maxUses = 1`.

**Phase D — UI.** Storefront checkout code field backed by `/orders/quote` (itemized preview: code line + crypto line); cart resurfaces a creation-time 422 if a code exhausts between quote and checkout — never silently retries without the code. Admin Discounts page + sample-effective-prices widget; history projection fields. *Verify:* typecheck; manual quote-vs-created-order totals match to the cent.

**Phase E — deferred until B2C subscriptions actually land.** `subscription` joins Slot A best-of with its own settings bps; checkout must then say *which* Slot-A discount won and why ("code LAUNCH10 applied — larger than your subscriber discount"). Zero code before then; the slot model reserved the seat.

---

## Risks & guardrails

- **Abandoned-order code burn.** `times_used` increments at creation; expired BTCPay invoices overstate redemptions and can exhaust a capped code. Accepted for v1 — raising `maxUses` is a one-click edit (see freeze rules). **Named escape hatch, implement only when it bites:** conditional decrement in the existing order-expiry path for unpaid orders carrying a `discount_code_id`. Document this in a comment next to the increment. Never move to status-filtered live-order counting.
- **Margin erosion via stacking.** Bounded by the two 5000-bps ceilings and made visible by sample effective prices in admin and itemized lines on order detail. Founder prices codes knowing crypto stacks on top.
- **maxUses race.** Closed by the conditional UPDATE inside the transaction. If any future path adds a second consumption site, it must reuse the same statement.
- **Provenance drift.** `discountCents` and the slot columns are redundant by design; the insert assertion protects new orders. Any future manual-adjustment feature must write both or it reintroduces unattributed discounts.
- **Code enumeration via `/orders/quote`.** Rate-limit; generic public error text; detailed reasons admin-only.
- **Silent-ignore temptation.** Restated because it will come up: invalid codes are hard 422s everywhere. No refund lever exists on crypto rails.
- **Refunds (future).** Manual today; a partially-refunded discounted order prorates against `totalCents` using the slot columns. The columns make this possible; no refund tooling is built here.
- **Scope-creep tripwires.** Fixed-amount codes, SKU scoping, per-customer limits, wholesale codes, retail volume breaks, code stacking — all rejected above with reasons. Changing any of them means editing `resolveDiscounts()`'s slot rules in this spec first.
