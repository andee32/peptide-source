# Sprint Plan: 7 Critical Blockers
**Version:** 1.0
**Date:** March 29, 2026
**Author:** CTO, Lab-Standard-Initiative
**Sprint Duration:** 5 working days (40 hours)
**Engineer Allocation:** 1 full-time senior engineer

---

## Executive Summary

This plan decomposes 7 critical blockers into 28 atomic tasks across 5 days. Total estimated effort: **36–42 hours**. One blocker (#6, Cancel Subscription) was found to be **already implemented** during code audit — reclassified as verification-only. Blocker #3 (Janoshik API) carries the highest uncertainty and is flagged accordingly.

### Blocker Status After Code Audit

| # | Blocker | True Status | Sprint Priority |
|---|---------|-------------|-----------------|
| 1 | BTC address fallback unspendable | Confirmed — stub generates random `bc1q` addresses | P0 |
| 2 | Webhook signature bypass | Confirmed — returns `true` if no secret set | P0 |
| 3 | Janoshik API integration missing | Confirmed — format-only regex validation | P0 (highest uncertainty) |
| 4 | Batch-to-order QR linkage broken | Confirmed — no `batchId` on orders table | P0 |
| 5 | Hardcoded dev secrets | Confirmed — plaintext in `.replit:31-35` | P0 |
| 6 | Cancel subscription missing | **FALSE** — fully implemented at `subscriptions.ts:460-503` | P2 (verify only) |
| 7 | CI/CD absent | Confirmed — zero workflows, zero tests | P1 |

---

## Day 1: Security Hardening (Blockers #5, #2)

### Blocker #5 — Hardcoded Dev Secrets

**Root Cause:** `.replit` file (lines 31-35) contains plaintext `ADMIN_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` committed to version control.

**Related Code:**
- `artifacts/api-server/src/routes/admin.ts:44-79` — reads these env vars for auth
- `artifacts/api-server/src/routes/subscriptions.ts:20-39` — uses `ADMIN_SECRET` as bearer token, falls back to insecure dev token `"lab-mgmt-token-dev-only-insecure"` (line 36)

#### Task 5.1 — Rotate All Compromised Secrets
- **Action:** Generate new `ADMIN_SECRET` (32+ byte random hex), new `ADMIN_PASSWORD_HASH` (re-hash with new password via PBKDF2 100K iterations matching `admin.ts:65`), update `ADMIN_EMAIL` if needed
- **Output:** New secrets stored in Replit Secrets manager (not `.replit` file)
- **Effort:** 1 hour
- **Dependencies:** Replit dashboard access
- **Risk:** Low — rotation is straightforward

#### Task 5.2 — Remove Secrets from `.replit` and Git History
- **Action:** Strip `ADMIN_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` from `.replit` env block. Add `.env` and secret patterns to `.gitignore`. Run `git filter-branch` or `git-filter-repo` to purge from history.
- **Files:** `.replit`, `.gitignore`
- **Effort:** 1.5 hours
- **Dependencies:** Task 5.1 complete
- **Risk:** Medium — history rewrite requires force-push coordination

#### Task 5.3 — Eliminate Insecure Dev Fallback Token
- **Action:** Remove the hardcoded fallback `"lab-mgmt-token-dev-only-insecure"` at `subscriptions.ts:36`. Replace with explicit startup check: if `ADMIN_SECRET` or `MGMT_TOKEN_SECRET` is not set, log error and refuse to start.
- **File:** `artifacts/api-server/src/routes/subscriptions.ts:20-39`
- **Effort:** 0.5 hours
- **Dependencies:** Task 5.1 (new secrets in place)
- **Risk:** Low

#### Task 5.4 — Add Startup Secret Validation
- **Action:** Create a `validateRequiredEnv()` function called at server boot that checks all critical env vars exist (`ADMIN_SECRET`, `DATABASE_URL`, `BTCPAYSERVER_WEBHOOK_SECRET`) and fails fast with descriptive error if missing.
- **File:** New file `artifacts/api-server/src/config/env.ts`, called from `artifacts/api-server/src/index.ts`
- **Effort:** 1 hour
- **Dependencies:** None
- **Risk:** Low

**Subtotal Blocker #5: 4 hours**

---

### Blocker #2 — Webhook Signature Bypass

**Root Cause:** `btcpay.ts:176-177` returns `true` (verification passes) when no webhook secret is configured. Any attacker can forge payment confirmations.

```typescript
// btcpay.ts:175-177 — CURRENT (VULNERABLE)
const secret = BTCPAY_WEBHOOK_SECRET ?? BTCPAY_KEY;
if (!secret) {
  return true;  // ← Allows unsigned webhooks
}
```

#### Task 2.1 — Reject Webhooks When No Secret Configured
- **Action:** Change `return true` to `return false` at `btcpay.ts:177`. Log a warning: `"Webhook rejected: BTCPAYSERVER_WEBHOOK_SECRET not configured"`.
- **File:** `artifacts/api-server/src/services/btcpay.ts:175-178`
- **Effort:** 0.5 hours
- **Dependencies:** Task 5.4 (env validation ensures secret exists)
- **Risk:** Low — breaks nothing if secret is properly configured

#### Task 2.2 — Separate Webhook Secret from API Key
- **Action:** Remove the `?? BTCPAY_KEY` fallback at `btcpay.ts:175`. Webhook secret must be its own dedicated env var `BTCPAYSERVER_WEBHOOK_SECRET`. Never reuse the API key.
- **File:** `artifacts/api-server/src/services/btcpay.ts:175`
- **Effort:** 0.5 hours
- **Dependencies:** BTCPayServer dashboard access to generate webhook secret
- **Risk:** Low

#### Task 2.3 — Add Webhook IP Allowlisting (Defense in Depth)
- **Action:** Add middleware on the `/api/webhooks/btcpay` route that checks `req.ip` against a configurable allowlist (`BTCPAY_ALLOWED_IPS` env var). Log and reject requests from unknown IPs.
- **File:** `artifacts/api-server/src/routes/webhooks.ts` (before line 22)
- **Effort:** 1.5 hours
- **Dependencies:** BTCPayServer server IP(s) known
- **Risk:** Medium — IP may change; make configurable, not hardcoded

#### Task 2.4 — Add Webhook Replay Protection
- **Action:** Store processed `invoiceId` values in a Redis set or in-memory LRU cache with 24h TTL. Reject duplicate webhook deliveries. This prevents replay attacks even if signature is somehow compromised.
- **File:** `artifacts/api-server/src/routes/webhooks.ts:46-54`
- **Effort:** 2 hours
- **Dependencies:** Decide on Redis vs in-memory (in-memory acceptable for single-instance MVP)
- **Risk:** Low

**Subtotal Blocker #2: 4.5 hours**

---

## Day 2: BTC Payment Safety (Blocker #1)

### Blocker #1 — BTC Address Fallback Generates Potentially Spendable Addresses

**Root Cause:** `btcpay.ts:21-27` generates random `bc1q` addresses using `Math.random()`. These are structurally valid SegWit addresses. While astronomically unlikely to match a real wallet, they are not provably unspendable. If a customer sends BTC to one, funds are irretrievably lost.

```typescript
// btcpay.ts:21-27 — CURRENT (DANGEROUS)
function generateStubBtcAddress(): string {
  const chars = "0123456789abcdefghijklmnopqrstuvwxyz";
  const suffix = Array.from({ length: 39 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
  return `bc1q${suffix}`;
}
```

#### Task 1.1 — Block Invoice Creation When BTCPayServer Is Down
- **Action:** When `isConfigured` is `false`, `createInvoice()` should throw a `ServiceUnavailableError` instead of calling `createStubInvoice()`. The `/api/orders/:id/crypto-invoice` endpoint (orders.ts:146-222) should return HTTP 503 with message: `"Crypto payments temporarily unavailable. Please try again later."`
- **Files:** `artifacts/api-server/src/services/btcpay.ts:56`, `artifacts/api-server/src/routes/orders.ts:186-190`
- **Effort:** 1.5 hours
- **Dependencies:** None
- **Risk:** Low — better to refuse payment than lose customer funds

#### Task 1.2 — Remove Stub Invoice Generation Entirely
- **Action:** Delete `generateStubBtcAddress()` (lines 21-27), `generateStubEthAddress()` (lines 29-32), and `createStubInvoice()` (lines 122-149). These are dev-only helpers that should never exist in production code.
- **File:** `artifacts/api-server/src/services/btcpay.ts`
- **Effort:** 1 hour
- **Dependencies:** Task 1.1 (replacement error path exists)
- **Risk:** Low

#### Task 1.3 — Add Frontend Graceful Degradation
- **Action:** Update the crypto checkout UI to handle 503 responses. Show: "Crypto payments are temporarily unavailable. Your order has been saved — you can complete payment when the service is restored." Provide a "Retry" button and optionally a "Switch to other payment" option.
- **Files:** `artifacts/storefront/src/pages/` (checkout flow components)
- **Effort:** 2 hours
- **Dependencies:** Task 1.1 (API returns 503)
- **Risk:** Low

#### Task 1.4 — Add BTCPayServer Health Check Endpoint
- **Action:** Create `GET /api/health/btcpay` that pings the BTCPayServer API and returns status. Use this to proactively disable the crypto checkout option in the UI when BTCPayServer is unreachable.
- **Files:** New route in `artifacts/api-server/src/routes/`, update frontend checkout
- **Effort:** 1.5 hours
- **Dependencies:** None
- **Risk:** Low

**Subtotal Blocker #1: 6 hours**

---

## Day 3: Batch-to-Order Linkage (Blocker #4)

### Blocker #4 — Batch Not Linked to Orders

**Root Cause:** The `orders` table (`lib/db/src/schema/orders.ts:33-52`) has no `batchId` column. Orders store `lineItems` as JSONB with product variant references but no batch assignment. The entire product promise — "scan the QR code on your vial to verify your batch" — is broken because there's no way to know which batch a customer received.

#### Task 4.1 — Add `batchId` Column to Order Line Items
- **Action:** Add a Drizzle migration that creates an `order_line_items` join table:
  ```
  order_line_items: id, orderId (FK), productId (FK), variantId, quantity, batchId (FK, nullable)
  ```
  The `batchId` is nullable because it's assigned at fulfillment time, not at order creation. Migrate existing JSONB `lineItems` data into the new table.
- **File:** `lib/db/src/schema/orders.ts`, new migration file
- **Effort:** 3 hours
- **Dependencies:** None
- **Risk:** Medium — data migration for existing orders

#### Task 4.2 — Create Batch Assignment Admin Endpoint
- **Action:** Add `PATCH /api/admin/orders/:orderId/items/:itemId/assign-batch` that sets the `batchId` on a line item. Validate that the batch exists, belongs to the correct product, and has status `released`.
- **File:** `artifacts/api-server/src/routes/admin.ts`
- **Effort:** 2 hours
- **Dependencies:** Task 4.1 (schema exists)
- **Risk:** Low

#### Task 4.3 — Add Batch Assignment UI to Admin Dashboard
- **Action:** In the admin order detail view, add a dropdown for each line item showing available released batches for that product. On selection, call the assign-batch endpoint. Show batch purity and production date in the dropdown.
- **File:** `artifacts/storefront/src/pages/AdminPage.tsx`
- **Effort:** 2.5 hours
- **Dependencies:** Task 4.2 (API exists)
- **Risk:** Low

#### Task 4.4 — Include Batch Info in Order Confirmation / Customer View
- **Action:** When a customer views their order (or receives order confirmation email), show the assigned batch ID with a link to `/verify/{batchId}`. Update the order detail API response to include batch data.
- **Files:** `artifacts/api-server/src/routes/orders.ts`, email templates, customer order page
- **Effort:** 2 hours
- **Dependencies:** Task 4.1
- **Risk:** Low

**Subtotal Blocker #4: 9.5 hours**

---

## Day 4: Janoshik API Integration (Blocker #3)

### Blocker #3 — Janoshik API Never Called

**Root Cause:** The system stores `janoshikTaskId` in the database and displays Janoshik badges linking to `janoshik.com/order/{taskId}`, but **never validates that the task ID actually exists on Janoshik's servers**. The COA verification story is theatrical — format regex only (`reviewerSubmissions.ts:20-32`).

**⚠️ HIGHEST UNCERTAINTY BLOCKER:** Janoshik does not publish a public API. Integration requires:
1. Confirming Janoshik offers an API (or scraping their results page)
2. Obtaining API credentials / terms of service
3. Understanding their data format

#### Task 3.1 — Research: Confirm Janoshik API Availability
- **Action:** Contact Janoshik directly (email/phone from janoshik.com) to determine:
  - Do they offer an API for result verification?
  - What authentication is required?
  - What data format do results come in?
  - Is there a rate limit?
  - Can we programmatically fetch COA PDFs?
- **Output:** Written summary of API capabilities, or confirmation that no API exists
- **Effort:** 2–4 hours (calendar time may be longer — depends on response time)
- **Dependencies:** None
- **Risk:** **HIGH** — If no API exists, we need a fallback strategy (see Task 3.1b)
- **Owner:** Product/engineering lead (not purely engineering work)

#### Task 3.1b — Fallback: Design Manual Verification Flow (If No API)
- **Action:** If Janoshik has no API, design a manual verification workflow:
  - Admin uploads COA PDF received from Janoshik
  - System extracts/stores key data points (purity %, endotoxin, sterility)
  - PDF stored in object storage, linked to batch
  - Frontend shows "COA verified by manual upload" instead of "API verified"
  - Clearly distinguish from "unverified" status
- **Output:** Design doc for manual flow
- **Effort:** 2 hours
- **Dependencies:** Task 3.1 result (no API)
- **Risk:** Low — this is the pragmatic fallback

#### Task 3.2 — Build Janoshik API Client Service (If API Exists)
- **Action:** Create `artifacts/api-server/src/services/janoshik.ts`:
  - `verifyTaskId(taskId: string): Promise<JanoshikResult | null>` — calls Janoshik API, returns parsed result or null
  - `fetchCoaPdf(taskId: string): Promise<Buffer | null>` — downloads COA PDF
  - Implement retry logic (3 attempts, exponential backoff)
  - Cache results for 24 hours (COA results don't change)
  - Rate limit outbound calls (respect Janoshik's limits)
- **File:** New `artifacts/api-server/src/services/janoshik.ts`
- **Effort:** 4 hours
- **Dependencies:** Task 3.1 (API specs confirmed)
- **Risk:** High — depends entirely on Janoshik's API shape

#### Task 3.3 — Integrate Janoshik Verification into COA Creation
- **Action:** When admin creates a COA result via `POST /api/admin/batches/:id/coa` (`admin.ts:243-299`), if `janoshikTaskId` is provided:
  1. Call `janoshikService.verifyTaskId(taskId)`
  2. If verification succeeds: store `verifiedAt` timestamp, mark COA as `"api_verified"`
  3. If verification fails: reject the COA creation with error "Janoshik task ID not found"
  4. If Janoshik API is unreachable: allow creation but mark as `"pending_verification"`, queue for retry
- **Files:** `artifacts/api-server/src/routes/admin.ts:243-299`, `lib/db/src/schema/batches.ts` (add `verificationStatus` column)
- **Effort:** 2.5 hours
- **Dependencies:** Task 3.2 (client exists)
- **Risk:** Medium

#### Task 3.4 — Update Frontend to Show Verification Status
- **Action:** Update `CoaVisualization.tsx` and `JanoshikBadge.tsx` to distinguish between:
  - ✅ `api_verified` — "Independently verified via Janoshik API"
  - ⏳ `pending_verification` — "Verification in progress"
  - 📄 `manually_uploaded` — "COA document on file"
  - ❌ `unverified` — "Awaiting verification"
- **Files:** `artifacts/storefront/src/components/coa/CoaVisualization.tsx`, `JanoshikBadge.tsx`
- **Effort:** 2 hours
- **Dependencies:** Task 3.3 (status field exists)
- **Risk:** Low

**Subtotal Blocker #3: 8.5–12.5 hours** (range due to API uncertainty)

---

## Day 5: CI/CD Pipeline + Verification (Blockers #7, #6)

### Blocker #7 — CI/CD Absent

**Root Cause:** No `.github/workflows/` directory. No automated testing, linting, type-checking, or deployment gates exist. The only automation is a `post-merge.sh` hook that runs `pnpm install` and DB migrations.

#### Task 7.1 — Create GitHub Actions CI Workflow
- **Action:** Create `.github/workflows/ci.yml`:
  ```yaml
  name: CI
  on: [push, pull_request]
  jobs:
    lint-and-typecheck:
      - pnpm install --frozen-lockfile
      - pnpm -r run lint (if lint scripts exist, add them)
      - pnpm -r run typecheck (tsc --noEmit across packages)
    build:
      - pnpm -r run build
      - Verify artifacts/api-server/dist/index.cjs is produced
      - Verify artifacts/storefront/dist/ is produced
    test:
      - pnpm -r run test (placeholder — no tests yet)
  ```
- **File:** `.github/workflows/ci.yml`
- **Effort:** 2 hours
- **Dependencies:** None
- **Risk:** Low

#### Task 7.2 — Add TypeScript Strict Checks
- **Action:** Ensure `tsconfig.json` has `"strict": true` across all packages. Add `typecheck` script to each package's `package.json`: `"typecheck": "tsc --noEmit"`. Fix any type errors that surface.
- **Files:** `tsconfig.json` files across monorepo, `package.json` files
- **Effort:** 2 hours (depends on existing type error count)
- **Dependencies:** None
- **Risk:** Medium — may surface latent type errors

#### Task 7.3 — Add Secret Scanning
- **Action:** Enable GitHub's built-in secret scanning (repo settings). Additionally, add a `trufflehog` or `gitleaks` step to the CI workflow that scans for secrets in PRs.
- **File:** `.github/workflows/ci.yml` (add step)
- **Effort:** 1 hour
- **Dependencies:** Task 7.1 (workflow exists)
- **Risk:** Low

#### Task 7.4 — Configure Branch Protection
- **Action:** Via GitHub API or UI, configure branch protection on `main`:
  - Require CI to pass before merge
  - Require at least 1 review
  - Prevent force pushes
  - Require up-to-date branches before merging
- **Effort:** 0.5 hours
- **Dependencies:** Task 7.1 (CI must exist to require it)
- **Risk:** Low

**Subtotal Blocker #7: 5.5 hours**

---

### Blocker #6 — Cancel Subscription (RECLASSIFIED: Already Implemented)

**Code Audit Finding:** Cancel subscription is **fully functional**:
- **Backend:** `DELETE /api/subscriptions/:id` at `subscriptions.ts:460-503`
- **Frontend:** Confirmation dialog with cancel button at `CustomerSubscriptionsPage.tsx:482-504`
- **Event logging:** Cancellation events tracked in `subscriptionEventsTable`

**This was likely flagged from outdated information or a different definition of "missing."**

#### Task 6.1 — Verify Cancel Flow End-to-End
- **Action:** Manually test the cancel flow: create a test subscription, cancel via UI, verify database state changes, verify no further billing events occur. Document the test.
- **Effort:** 1 hour
- **Dependencies:** Access to staging environment
- **Risk:** Low

#### Task 6.2 — Add Cancel Confirmation Email
- **Action:** After successful cancellation, send a confirmation email: "Your subscription has been cancelled. No further shipments will be sent. You can reactivate at any time." Check if this email already exists in the email service.
- **File:** `artifacts/api-server/src/services/email.ts` (if exists), `subscriptions.ts:490-500`
- **Effort:** 1 hour
- **Dependencies:** Email service configured
- **Risk:** Low

**Subtotal Blocker #6: 2 hours**

---

## Sprint Schedule Summary

| Day | Blockers | Tasks | Hours |
|-----|----------|-------|-------|
| Day 1 | #5 (Secrets), #2 (Webhook) | 5.1–5.4, 2.1–2.4 | 8.5h |
| Day 2 | #1 (BTC Fallback) | 1.1–1.4 | 6h |
| Day 3 | #4 (Batch-Order Linkage) | 4.1–4.4 | 9.5h |
| Day 4 | #3 (Janoshik API) | 3.1–3.4 | 8.5–12.5h |
| Day 5 | #7 (CI/CD), #6 (Cancel Verify) | 7.1–7.4, 6.1–6.2 | 7.5h |
| **Total** | | **28 tasks** | **40–44h** |

---

## Dependency Graph

```
Task 5.1 (Rotate Secrets)
  └─→ Task 5.2 (Remove from Git)
  └─→ Task 5.3 (Remove dev fallback)

Task 5.4 (Env validation) ─→ Task 2.1 (Reject unsigned webhooks)
Task 2.1 ─→ Task 2.2 (Separate webhook secret)

Task 1.1 (Block stub invoices) ─→ Task 1.2 (Delete stub code)
Task 1.1 ─→ Task 1.3 (Frontend 503 handling)

Task 4.1 (Schema migration) ─→ Task 4.2 (Admin endpoint)
Task 4.2 ─→ Task 4.3 (Admin UI)
Task 4.1 ─→ Task 4.4 (Customer-facing batch info)

Task 3.1 (Research Janoshik) ─→ Task 3.2 (Build client) OR Task 3.1b (Manual fallback)
Task 3.2 ─→ Task 3.3 (Integrate into COA creation)
Task 3.3 ─→ Task 3.4 (Frontend verification status)

Task 7.1 (CI workflow) ─→ Task 7.3 (Secret scanning)
Task 7.1 ─→ Task 7.4 (Branch protection)
```

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Janoshik has no API | HIGH | HIGH | Task 3.1b fallback (manual upload flow) is ready to execute |
| Janoshik API response time > 1 week | HIGH | MEDIUM | Start Task 3.1 on Day 1 (async), build manual flow first |
| Git history rewrite (Task 5.2) causes conflicts | MEDIUM | MEDIUM | Coordinate with all developers, do on a quiet day |
| Existing type errors block CI (Task 7.2) | MEDIUM | LOW | Allow `typecheck` to warn-only initially, fix incrementally |
| Batch migration breaks existing orders (Task 4.1) | LOW | HIGH | Write reversible migration, test on staging first |
| BTCPayServer IP changes break allowlist (Task 2.3) | LOW | MEDIUM | Make IP list configurable via env var, not hardcoded |

---

## Definition of Done (Per Task)

Each task is complete when:
1. Code change is committed to a feature branch
2. Manually tested on staging environment
3. No regressions in existing functionality
4. PR opened with description referencing this sprint plan
5. (After Day 5) CI pipeline passes on the PR

## Success Criteria (Sprint)

- [ ] No hardcoded secrets in repository (verified by `gitleaks` scan)
- [ ] Webhook endpoint rejects unsigned/unverified requests
- [ ] Crypto checkout returns 503 when BTCPayServer is unavailable (not a fake address)
- [ ] Orders can be linked to specific batches at fulfillment time
- [ ] Janoshik integration strategy confirmed (API or manual) and Phase 1 implemented
- [ ] CI pipeline runs on every push and PR
- [ ] Branch protection enforced on `main`
