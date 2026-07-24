# AT Lab Sourcing — Account Unification Design

**Status:** design, ready to build. **Owner:** Andy. **Date:** 2026-07-24.
**Depends on:** merge of `origin/remediation/payments-email-authz` into `main` (Phase 1, hard prerequisite).

One customer identity = **email + password + bearer session** (the retail auth, already in production). Wholesale becomes an **optional, admin-approved profile** hung off a signed-in user. The plaintext `accessToken` capability is deleted; wholesale gets real login + password recovery; `accountId`/tier/`channel` are server-derived, closing a spoofing gap.

---

## 1. Goals & non-goals

**Goals**
- Collapse `customer_users` (identity) and `customer_accounts` (wholesale) onto one identity: email + `passwordHash` + `customer_sessions`.
- Wholesale = a signed-in user with a linked `approved` profile (+ tier). No second login system.
- Delete the localStorage `accessToken` (clear-text, non-expiring, non-rotatable, spoofable).
- Give wholesale buyers password recovery and immediate, status-based revocation.
- Server-derive `accountId` / `priceTierId` / `channel` from the session — never trust client input.
- Migrate every existing approved token-only account with **zero lockout**.
- Compose with the Zelle rail (`channel`-gated) from the remediation branch, not clobber it.

**Non-goals (explicitly rejected)**
- **No generic roles/permissions table.** Entitlement is one bit (`status='approved'`) + a `priceTierId`, already the `customer_accounts` row. A roles layer is speculative abstraction (CLAUDE.md). If ever needed, add later.
- **No N:M user↔profile.** Ship 1:1 (partial unique index) as a documented constraint; a join table is deferred, not built.
- **No parallel `wholesale_profiles` table.** Repurpose `customer_accounts` in place so every `orders.accountId` / `order_attestations.accountId` FK stays valid — no FK repointing.
- **No B2C subscription changes.** `subscriptions.ts` has its own unrelated `accessToken` column — leave alone.
- **No rewrite of `order.channel` on historical orders.** It is immutable per-order truth.

---

## 2. Current state (verified)

- **Retail (B2C):** `customer_users` (email unique, `passwordHash`, name) + `customer_sessions` (PK = `sha256(token)`, `customerUserId` cascade, `expiresAt`). 32-byte bearer, raw returned once, 30-day self-pruning TTL. `Authorization: Bearer`. Resolved per-handler by `resolveCustomerUser(req)` / `requireCustomer`. Guest checkout allowed. No password recovery exists yet.
- **Wholesale (B2B):** `customer_accounts` (email unique, `status` enum, `priceTierId`, `accessToken` 32-byte hex minted **at apply time**, stored **in the clear**, partial-unique where `accessToken <> ''`). "Login" = paste `accountId` + `accessToken` into `/wholesale/account`, stored in localStorage under `wholesale_session`. Transport: `x-account-token` header, plus a `token` **body field** at checkout.
- **Token consumers (backend):** catalog gate `products.ts:32,128`; checkout auth + tier pricing `orders.ts:279-298` (body `token`); per-order read `canReadOrder` `orders.ts:60-78` (header); `accounts.ts:85`; `admin.ts:831,1125` (strip token).
- **Token consumers (frontend):** `useWholesaleSession.ts`, `ProductsPage`, `ProductDetailPage`, `CheckoutPage`, `OrderConfirmationPage`, `WholesaleAccountPage`, `WholesaleApplyPage`.
- **Order stamping:** wholesale orders set `customerUserId = null` (`orders.ts:488,531`); attestation mirrors `accountId` (`orders.ts:545`).
- **Spoofing gap (verified):** `isWholesale = !!input.accountId` with a client-supplied `accountId` + body `token` (`orders.ts:252,286`). Client asserts the account; server trusts it.

---

## 3. Target model (Drizzle sketches)

`customer_users` / `customer_sessions` — **unchanged**, become the sole identity + auth. Add one nullable column:

```ts
// customerUsers.ts — customer_users
passwordSetAt: timestamp("password_set_at"), // NULL = invited/not-yet-activated; set = active
```

`customer_accounts` — repurposed **in place** as the wholesale PROFILE (physical name kept to preserve FKs):

```ts
// customerAccounts.ts
customerUserId: text("customer_user_id")
  .references(() => customerUsersTable.id, { onDelete: "restrict" }), // nullable in migration; NOT NULL at cutover
// 1:1 — one profile per identity:
// uniqueIndex("customer_accounts_customer_user_id_unique")
//   .on(t.customerUserId).where(sql`customer_user_id is not null`)  // partial: many NULLs allowed mid-migration

// KEEP: status (pending/approved/rejected/suspended), priceTierId, business/KYB fields, approvedAt/By.
// email: DROP .unique() at cutover — demotes to informational business-contact email.
// accessToken + its partial unique index: DROP at cutover only.
```

**FK-delete policy conflict — resolved:** use `onDelete: "restrict"` (not cascade). The profile is a KYB/business record that may need retention; deleting an identity must not silently hard-delete it. (Overrides the winning proposal's `cascade`.)

New table — recovery + invite share one table:

```ts
// password_reset_tokens
tokenHash: text("token_hash").primaryKey(),        // sha256 of 32-byte token; raw emailed once, never stored
customerUserId: text().references(() => customerUsersTable.id, { onDelete: "cascade" }).notNull(),
purpose: text("purpose").notNull(),                // "reset" (1h TTL) | "invite" (14–30d TTL)
expiresAt: timestamp("expires_at").notNull(),
usedAt: timestamp("used_at"),                      // single-use
createdAt: timestamp("created_at").defaultNow().notNull(),
```

**Orders / attestations — schema unchanged; stamping changes:**
- `orders.customerUserId` stamped **always** (retail and wholesale).
- `orders.accountId` set only when acting wholesale; resolved **server-side** from the session profile.
- `orders.channel` remains the durable server-side truth (Zelle reads it). Never backfilled/rewritten.
- `order_attestations.accountId` **retained**, derived from `orders.accountId` at insert (self-contained, auditable). No structural change.
- `pricing.ts` (`price_tiers` / `price_list_entries`) — unchanged; tier resolves off the session profile, not a body field.

**Identity-email collision resolved:** login uniqueness lives **only** on `customer_users.email`. `customer_accounts.email` loses its unique constraint. One table owns login identity — no cross-table collision on merge.

**Password state:** invited-but-not-activated users get an **unusable sentinel `passwordHash`** (hash of discarded random bytes, distinct from `DUMMY_PASSWORD_HASH`, no input can match, not timing-distinguishable) to satisfy `notNull`. `passwordSetAt IS NULL` is the **authoritative** "not activated" signal — never sentinel-string matching.

---

## 4. Auth flow (session-based wholesale)

**One mechanism.** `resolveCustomerUser(req)` (Bearer → `customer_sessions` → `customer_users`) is reused verbatim; `customerSession.ts` unchanged.

**Wholesale resolution — rewrite `lib/wholesaleSession.ts`:**
```ts
async function resolveWholesaleAccount(req): Promise<WholesaleAccount | null> {
  const user = await resolveCustomerUser(req);
  if (!user) return null;
  const acct = await db.query.customerAccountsTable.findFirst({
    where: eq(customerAccountsTable.customerUserId, user.id),
  });
  return acct && acct.status === "approved" ? acct : null;
}
// resolveWholesaleProfile(req): same, ANY status — for /auth/me to show pending/rejected.
```
Same `WholesaleAccount` return shape → call sites change transport only. `extractAccountToken` deleted at cutover. Revocation = admin moves `status` off `approved` (immediate) or revokes the user's sessions.

**Catalog gate** (`products.ts:32,128`): call rewritten resolver; `x-account-token` → `Authorization: Bearer`. 401 `wholesale_required` unchanged.

**Checkout / `priceOrderRequest`** (`orders.ts:252,279-298`): client sends explicit `channel: 'retail' | 'wholesale'` intent (default `retail`). `channel === 'wholesale'` requires the session to resolve an **approved** profile (else 403). `accountId` + `priceTierId` come from that profile — **never** from the body. Remove `accountId` and `token` from `createOrderSchema` / `quoteOrderSchema` (`orders.ts:116,137`). Kit-only + 5-kit-MOQ + tier-pricing rules otherwise unchanged. An approved user can still place a retail (non-kit) order → `channel=retail`, no `accountId`.

> **Explicit intent vs cart-inference — resolved:** use the explicit `channel` flag (winning proposal), not "approved account AND kit cart" inference. Deriving wholesale from cart contents mis-channels edge carts and forces retail-intent orders through kit/MOQ rules.

**Per-order read** (`canReadOrder`, `orders.ts:60-78`): since unified orders always carry `customerUserId`, collapse to `user.id === order.customerUserId`. A transitional `accountId`→profile→user fallback covers legacy orders until the backfill stamps them.

**`GET /accounts/:id`** (`accounts.ts:85`): authorize on admin OR `profile.customerUserId === user.id`. No header token.

**Password recovery (new, prerequisite):**
- `POST /auth/forgot-password` — always 200, rate-limited, timing-neutral; mint a `purpose="reset"` token only if the email exists; email the link.
- `POST /auth/reset-password` — validate hash + unexpired + unused → set `passwordHash`, set `passwordSetAt`, mark `usedAt`, optionally revoke sessions.
- The migration invite is the same flow with `purpose="invite"` + long TTL.
- Email send is **placeholder-guarded** (fail closed in production until real SMTP is provisioned — same discipline as `ATTESTATION_TEXT` / ACH).

**`/auth/me`** gains a wholesale block, the single frontend source (replaces `useWholesaleSession`):
```jsonc
"wholesale": { "accountId": "...", "status": "approved|pending|rejected|suspended",
               "businessName": "...", "priceTierName": "..." } | null
```

---

## 5. Migration plan for existing token accounts — **zero lockout** (load-bearing)

**Invariant:** after backfill, **every** approved account can authenticate via email + password recovery **independent of any token** — so removing the token later cannot lock anyone out. Cutover is gated on **evidence** (metered legacy-token traffic ≈ 0), never a calendar date.

**Step 0 — prerequisite:** ship password recovery (§4). No wholesale changes; retail benefits immediately.

**Step 1 — additive schema (zero behavior change):** add `customer_accounts.customerUserId` (nullable) + partial unique index; add `password_reset_tokens`; add `customer_users.passwordSetAt`. `accessToken` untouched. Deploys with no runtime change.

**Step 2 — backfill script** (`scripts/`, idempotent, **`--dry-run` first** per Andy's side-effect rule). For every `customer_accounts` row (approved first, then pending so future approvals are pre-linked):
- **a.** Normalize email (trim + lowercase).
- **b. Exact normalized-email match to an existing `customer_users`** → **LINK** (set `customerUserId`). Do **not** touch their `passwordHash`. If they already have a usable password (`passwordSetAt` set) → send a "wholesale access enabled" notice, **no** invite. If sentinel → invite like a fresh user.
- **c. No match** → CREATE a `customer_users` (id `randomUUID()`, email, name = `contactName`, sentinel `passwordHash`, `passwordSetAt = null`); set `customerUserId`.
- **d.** For each linked user without a usable password, mint a `purpose="invite"` token and queue the set-password email.
- **e.** Also stamp `orders.customerUserId` on that account's existing orders (so `canReadOrder` collapses and pre-migration order history appears after login).
- **f.** Idempotent: re-runs link existing users, skip already-invited accounts, never duplicate a user or issue a second live invite.

**Email-collision takeover (sharpest security risk).** A wholesale contact email that already belongs to a **different human's** retail `customer_user` — auto-linking would silently grant that person wholesale powers. Mitigations:
- Auto-link **only** exact normalized-email matches; **log every link**.
- Dry-run renders a **same-email merge report**; Andy reviews it before any live send.
- Route ambiguous cases to an **admin review queue**.
- **Require email verification before a pre-existing retail identity gains wholesale powers** (the retail account must confirm ownership).

**SMTP-unprovisioned reality.** This repo has no SMTP (like ACH/ATTESTATION). Invite send is placeholder-guarded AND the backfill supports a **CSV export of `{email, set-password link}`** for manual send — migration is never blocked on email infra. (Lockout is impossible: legacy token still works; `forgot-password` still works once SMTP lands.)

**Step 3 — dual-auth transition window (anti-lockout core).** `resolveWholesaleAccount` accepts **either** (a) a valid Bearer session whose user has an approved linked profile, **or** (b) the legacy `x-account-token` (original predicate, unchanged). Checkout accepts **either** session-derived context **or** legacy body `{accountId, token}`, preferring the session. `order.channel` is set to `wholesale` in both paths. Ship the session-based frontend in this window; old localStorage tokens keep working for buyers who haven't logged in yet. **Meter every legacy-path hit** (deprecation metric).

**Step 4 — cutover (evidence-gated, NOT calendar-gated).** Once legacy-token traffic is ≈ 0 (after reminder emails + admin resends + a floor window): flip `resolveWholesaleAccount` to session-only; remove `x-account-token` acceptance and the `token` body field from order schemas; remove the paste-token login form and the apply-page token display.

**Step 5 — cleanup migration.** Drop `accessToken` + its partial unique index; drop `customer_accounts.email` unique; flip `customerUserId` → `NOT NULL`; remove `accessToken`-stripping in `serializeAccount` / admin order view. Regenerate types. Final typecheck.
**Exit criterion:** a grep proving **no** remaining `x-account-token` read and **no** client-supplied `accountId`/body-token trust path anywhere.

**New applications (during/after):** `POST /accounts/apply` requires a signed-in `customer_user` (register-or-sign-in first), creates the linked profile, mints **no** token.

---

## 6. Zelle + payment reconciliation

**Order of operations is non-negotiable: reconcile/merge `origin/remediation/payments-email-authz` into `main` FIRST (Phase 1), before any unification code.** It is 15 ahead / 7 behind `main`, predating the discount-system (`c87afec`) and catalog-split (`1bfb2c5`) commits → a **3-way reconcile, not a fast-forward**. Both branches edit `paymentMethodEnum`, the `orders` table, `orders.ts`, `openapi.yaml`, `CheckoutPage.tsx`, and generated files.

**Reconcile targets:**
- `paymentMethodEnum` → union `[crypto_btc, crypto_usdc, ach, wire, zelle]`; the `orders` table keeps **main's** discount-provenance columns (`discountSource`, `discountCode`, `discountCodeId`, `promoDiscountCents`, `cryptoDiscountCents`) **AND** gains the `zelle` value.
- `priceOrderRequest` keeps **main's** `resolveDiscounts` pipeline **AND** gains the branch's Zelle handling.
- `openapi.yaml`: reconcile by hand, then `pnpm --filter @atlab/api-spec run codegen`. **Never hand-edit** `api-zod` / `api-client-react` (regenerate `paymentMethod.ts`, `zelleInstructions.ts`, etc.).
- Pull in the branch's payment hardening (webhook verify, ACH replay/TOCTOU, admin re-auth, settled-order payment rejection, `lib/orderStatus.ts`) and its **integration-test harness** — the harness becomes the green-signal gate for the merge and for unification.

**Composition with unification (the coupling to get right).** Zelle's wholesale-only enforcement reads two signals:
1. **Creation-time** `paymentMethod === "zelle" && !isWholesale` → 422 `ZELLE_WHOLESALE_ONLY`.
2. **`/ach-instructions`** `order.channel !== "wholesale"` (on an already-persisted order).

Unification **redefines `isWholesale`** (now: authenticated user + approved profile + explicit `channel:'wholesale'` intent). Therefore the `isWholesale` redefinition in `priceOrderRequest` **and** the Zelle creation gate **must move in the SAME edit**, both keying off the new session signal. Because `order.channel` is persisted from the (now server-derived) wholesale context at insert and **never** rewritten, `/ach-instructions` needs **no change** — it reads the durable truth.

Net: because `isWholesale` is now server-derived, a spoofed `accountId` can no longer unlock Zelle — unification **strengthens** the gate. Do **not** re-express Zelle gating in terms of `accountId` or token; keep it on `channel`. `BANK_METHODS=[ach,wire,zelle]`, `isZelleProvisioned()` (fail-closed), `buildZelleInstructions()` (throw-on-unprovisioned) are untouched.

---

## 7. Admin UX

- **Approval flow** (`PATCH /admin/accounts/:id`, `admin.ts:877-921`) keeps its shape: set `status`, `priceTierId`, `kybNotes`; stamp `approvedAt`/`approvedBy` on →approved. It **no longer touches any token**. Moving off `approved` revokes wholesale on the next request — immediate. `PatchAccountSchema` unchanged.
- **Account list/detail** (`serializeAccount`, `admin.ts:831`): show the linked login email, and `passwordSetAt`-derived state — **"active"** vs **"invite pending"** — plus a **"resend set-password email"** action (mints a `purpose="invite"` token). This is the operational lever against lockout.
- **Legacy-path counter:** a dashboard count of accounts still transacting via the legacy token (fed by the deprecation metric) tells the admin when it is safe to trigger cutover.
- **New-application review:** the applicant is already a signed-in, contactable `customer_user`, not an anonymous token holder.
- **Cleanup:** once `accessToken` is dropped, remove the token-stripping in `serializeAccount` and the admin order view (`admin.ts:1125`) — nothing left to strip.
- **Frontend:** `WholesaleAccountPage` → normal email/password login (reuse retail) + a wholesale-status panel driven by `/auth/me`. `WholesaleApplyPage` → "sign in or create account, then apply", no token display/copy. `useWholesaleSession.ts` **deleted**.

---

## 8. API surface (OpenAPI changes)

Edit `openapi.yaml`, then `pnpm --filter @atlab/api-spec run codegen`. Never hand-edit generated packages.

**Added**
- `POST /auth/forgot-password` → 200 always (rate-limited).
- `POST /auth/reset-password` `{ token, password }` → 200 / 400.
- `GET /auth/me` response: add nullable `wholesale { accountId, status, businessName, priceTierName }`.
- `paymentMethod` enum: add `zelle` (from remediation merge); `ZelleInstructions` schema (from remediation merge).

**Changed**
- `createOrderSchema` / `quoteOrderSchema`: **remove** `accountId`, **remove** `token`; **add** `channel: 'retail' | 'wholesale'` (default `retail`).
- `POST /accounts/apply`: requires auth (Bearer); response no longer returns `accessToken`.
- `GET /accounts/:id`: session-authorized; response already omits `accessToken`.

**Removed (at cutover)**
- `x-account-token` header parameter everywhere it appears.
- `customer_accounts.accessToken` from any serialized admin response.

---

## 9. Phased rollout (each shippable + typecheckable)

**Green-signal gate:** `pnpm run typecheck` must pass every phase; from Phase 1 on, the remediation branch's integration harness must be green.

- **Phase 1 — Reconcile & merge `origin/remediation/payments-email-authz`.** 3-way reconcile of `orders.ts` / `openapi.yaml` / `CheckoutPage.tsx` / `paymentMethodEnum` against the discount + catalog-split commits; bring in Zelle rail, payment hardening, and the integration harness. Regenerate codegen. **Gate:** typecheck + Zelle/hardening integration tests + discount-provenance invariant test green. Independently shippable; unification does not start until this lands.
- **Phase 2 — Password recovery.** `password_reset_tokens` + `passwordSetAt` + `/auth/forgot-password` + `/auth/reset-password` + rate limits + placeholder-guarded email. No wholesale changes. **Gate:** typecheck; unit tests on token issue/expiry/single-use + reset round-trip on scratch DB.
- **Phase 3 — Additive schema link.** Add `customer_accounts.customerUserId` (nullable) + partial unique index; extend `/auth/me` with the wholesale block. Regenerate types. Zero behavior change. **Gate:** typecheck; migration applies clean on scratch DB.
- **Phase 4 — Backfill + invites.** `scripts/backfillWholesaleIdentities.ts` (idempotent, `--dry-run` first): link/create users, stamp `orders.customerUserId`, mint invites (or CSV export). Renders the same-email merge report. Data-only, no runtime change. **Gate:** dry-run reviewed by Andy; live send only on his explicit approval; re-run is a no-op.
- **Phase 5 — Dual-auth transition window.** `resolveWholesaleAccount` accepts session OR legacy token; checkout accepts session-derived OR legacy body; redefine `isWholesale` in `priceOrderRequest` **and** the Zelle creation gate in the **same edit**; server-resolve `accountId`/tier; frontend (delete `useWholesaleSession`; update `ProductsPage`/`ProductDetailPage`/`CheckoutPage`/`OrderConfirmationPage`/`WholesaleAccountPage`). Both paths work. **Gate:** typecheck; e2e that a legacy token AND a session both reach the kit catalog + wholesale checkout, and that a Zelle order still requires wholesale.
- **Phase 6 — New apply flow.** `POST /accounts/apply` requires a signed-in user, mints no token; `WholesaleApplyPage` drops token display; admin gains resend-invite + linked-identity + legacy-path visibility. **Gate:** typecheck; apply → admin-approve → login → order path.
- **Phase 7 — Cutover + cleanup (evidence-gated: legacy-token traffic ≈ 0, stragglers re-invited).** Remove `x-account-token` acceptance and the body-token field; drop `accessToken` + partial index; drop `customer_accounts.email` unique; flip `customerUserId` → NOT NULL; remove token-stripping in admin. Regenerate types. **Gate:** final typecheck + build + full integration suite; **grep proves no remaining `x-account-token` read or client-supplied `accountId`/body-token trust path.**

---

## 10. Risks & guardrails

- **Botched Phase-1 reconcile** silently drops discount-provenance columns / `resolveDiscounts`, or loses the Zelle gate. → Reconcile `openapi.yaml` then regenerate; require the discount-provenance invariant test AND the Zelle integration test green before merge.
- **Email-collision takeover** (wholesale contact email = a different human's retail account). → Auto-link exact normalized matches only; log every link; dry-run merge report reviewed before send; admin review queue; email verification before a pre-existing retail identity gains wholesale.
- **Lockout during migration** (bounced invites / no SMTP). → Legacy-token path alive through the whole window; cutover gated on metered traffic ≈ 0, never a date; admin resend-invite; CSV export fallback so migration never blocks on email infra.
- **Sentinel `passwordHash`** could enable enumeration or a 500. → Hash no input can produce, not timing-distinguishable; such logins return clean 401 (never 500) and still pay `verifyDummyPassword` cost; `passwordSetAt IS NULL` (not string-matching) is the activation signal.
- **`isWholesale` drift** between `priceOrderRequest` and the Zelle creation gate → retail buyers reach Zelle, or approved wholesale buyers are blocked. → Redefine both in one edit; keep `order.channel` server-derived, never client input.
- **Rewriting `order.channel`** on historical orders corrupts Zelle gating + reporting retroactively. → `channel` is immutable; never backfill/rewrite it.
- **Residual client-trust path** after cutover reopens the spoofing gap. → Phase-7 exit is a grep proving no `x-account-token` read and no body-supplied `accountId`/token anywhere.
- **Order-history cross-leak** when linking a profile onto an existing retail user (guest-order claiming still does not verify email). → Keep `/auth/orders` and the wholesale order listing scoped; linking a profile must not retroactively expose unrelated guest orders; require email verification on the pre-existing-retail-identity path.
- **1:1 user↔profile** breaks for one person running two businesses. → Ship 1:1 (partial unique index) as a documented known constraint; defer a join table.
- **FK-delete on the KYB record.** → `onDelete: "restrict"` protects the business record from identity deletion.
- **No route/integration tests today** (backend under-tested). → Phase 1 imports the remediation harness; add wholesale-session + backfill tests alongside Phases 3–5 and promote them into the green-signal gate.
