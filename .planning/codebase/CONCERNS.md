# Codebase Concerns

**Analysis Date:** 2026-06-22

## Critical Security Vulnerabilities (P0)

### Hardcoded Admin Secrets in Version Control
- **Issue:** `.replit` file contains plaintext `ADMIN_SECRET` and `ADMIN_PASSWORD_HASH`
- **Files:** `.replit:31-35`
- **Impact:** Anyone with repository read access can authenticate as admin. Hardcoded values are permanently compromised.
- **Fix approach:** 
  1. Rotate all secrets immediately
  2. Move to environment-only configuration (Replit Secrets)
  3. Add `.env*` to `.gitignore`
  4. Consider `git filter-repo` to scrub history

### Admin Login Returns Raw Secret as Token
- **Issue:** Login endpoint returns `process.env.ADMIN_SECRET` verbatim as bearer token
- **Files:** `artifacts/api-server/src/routes/admin.ts:79`
- **Impact:** Infrastructure secret leaked on every login; no expiry; no session uniqueness; permanent credential if response intercepted
- **Fix approach:**
  1. Generate short-lived JWTs (1-hour TTL) on successful login
  2. Implement token refresh mechanism
  3. Never return raw infrastructure secrets to clients

### Webhook Signature Verification Bypassed When Unconfigured
- **Issue:** If `BTCPAYSERVER_WEBHOOK_SECRET` is missing, all webhook payloads accepted as authentic
- **Files:** `artifacts/api-server/src/services/btcpay.ts:175-178` (`return true` when no secret present)
- **Impact:** Attacker can POST forged payment confirmation events, marking orders as paid without actual crypto sent
- **Fix approach:**
  1. Fail closed: `if (!secret) return false;`
  2. Log startup warning if webhook secret unconfigured
  3. Add integration test verifying rejection of unsigned payloads

### Admin Auth Uses Non-Timing-Safe String Comparison
- **Issue:** `x-admin-key` header compared using `!==` instead of `timingSafeEqual`
- **Files:** 
  - `artifacts/api-server/src/routes/admin.ts:25`
  - `artifacts/api-server/src/routes/subscriptions.ts:44`
  - `artifacts/api-server/src/routes/reviewerSubmissions.ts:17`
- **Impact:** Vulnerable to timing attacks that leak admin secret byte-by-byte
- **Fix approach:** Use `timingSafeEqual(Buffer.from(key), Buffer.from(adminSecret))` in all three files

### Subscription Access Token Vulnerable to Timing Attacks
- **Issue:** Subscription access tokens compared with `===` instead of constant-time equality
- **Files:** `artifacts/api-server/src/routes/subscriptions.ts:65`
- **Impact:** 32-byte hex tokens leaked via timing side-channel
- **Fix approach:** Use `timingSafeEqual` with length pre-check before comparison

## High-Impact Vulnerabilities (P1)

### No CORS Restrictions — Accepts Any Origin
- **Issue:** CORS middleware configured with zero options, returns `Access-Control-Allow-Origin: *`
- **Files:** `artifacts/api-server/src/app.ts:7`
- **Impact:** Any website can make authenticated API calls on behalf of users in their browser
- **Fix approach:**
  ```typescript
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",") ?? ["https://thelabstandard.com"],
    credentials: true,
  }));
  ```

### No Rate Limiting on Critical Endpoints
- **Issue:** No rate limiting middleware anywhere in codebase
- **Files:** All route files lack `express-rate-limit`
- **Impact:** Brute-force vulnerable endpoints: `/api/admin/login`, `/api/orders`, `/api/subscriptions/request-management-link` (email bombing)
- **Fix approach:**
  1. Add `express-rate-limit` with tiered limits
  2. `/api/admin/login`: 5 attempts per 15 minutes per IP
  3. `/api/orders`: 10 per minute per session
  4. Email endpoints: 3 per minute per email address

### Stub Crypto Address Generation Uses Non-Cryptographic Random
- **Issue:** BTC stub address generation uses `Math.random()` instead of `crypto.randomBytes()`
- **Files:** `artifacts/api-server/src/services/btcpay.ts:22-27`
- **Impact:** Predictable addresses in stub mode. If stub path accidentally used in production, addresses are guessable
- **Fix approach:**
  1. Use `crypto.randomBytes()` for both BTC and ETH stub generators
  2. Add startup validation blocking server in production without BTCPay configured
  3. Log warning when stub invoices are generated

### Stub Invoices Silently Used in Production
- **Issue:** Service falls back to stub invoices when BTCPay unconfigured with no warning
- **Files:** `artifacts/api-server/src/services/btcpay.ts:53-57`
- **Impact:** Combined with webhook bypass (P0-4), attacker can: create order → forge webhook → mark confirmed → receive goods without paying
- **Fix approach:**
  1. In production (`NODE_ENV=production`), throw error instead of fallback
  2. Add check in webhook handler to reject `STUB-` prefixed invoice IDs
  3. Log startup warning in non-production environments

### No Security Headers
- **Issue:** Express app missing helmet security headers
- **Files:** `artifacts/api-server/src/app.ts` (no helmet usage)
- **Impact:** Missing: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`, `Content-Security-Policy`
- **Fix approach:** `npm install helmet && app.use(helmet())`

### Order Lookup Requires No Authentication
- **Issue:** `GET /api/orders/:id` returns full order details (PII: name, email, address, payment info) with no auth check
- **Files:** `artifacts/api-server/src/routes/orders.ts:132-144`
- **Impact:** UUID enumeration possible (122 bits entropy); PII exposed to anyone who guesses or brute-forces order ID
- **Fix approach:** Require either admin auth or session token / order access token for retrieval

### Admin Auth Logic Duplicated Across 3 Files
- **Issue:** `isAdmin()` function defined independently in admin.ts, subscriptions.ts, reviewerSubmissions.ts
- **Files:** 
  - `artifacts/api-server/src/routes/admin.ts:18-30`
  - `artifacts/api-server/src/routes/subscriptions.ts:43-45`
  - `artifacts/api-server/src/routes/reviewerSubmissions.ts:16-18`
- **Impact:** DRY violation; security fixes must be applied in 3 places independently
- **Fix approach:** Extract shared `isAdmin` middleware to `artifacts/api-server/src/middleware/auth.ts`

### No Database Transaction Wrapping for Multi-Step Mutations
- **Issue:** Multi-table writes are separate queries without `db.transaction()` wrapping
- **Files:**
  - `artifacts/api-server/src/routes/orders.ts:103-130` (order creation)
  - `artifacts/api-server/src/routes/orders.ts:193-209` (invoice + payment record + order status)
  - `artifacts/api-server/src/routes/subscriptions.ts:189-208` (subscription + event insert)
- **Impact:** If intermediate query fails, database left in inconsistent state (payment recorded but order status not updated)
- **Fix approach:** Wrap all multi-step mutations in `await db.transaction(async (tx) => { ... })`

## Medium-Impact Concerns (P2)

### N+1 Query Pattern in List Endpoints
- **Issue:** Multiple list endpoints trigger N additional queries per row
- **Files:**
  - `artifacts/api-server/src/routes/batches.ts:33-53` — 2 queries per batch
  - `artifacts/api-server/src/routes/products.ts:58-97` — 3 queries per product
  - `artifacts/api-server/src/routes/admin.ts:103-129` — 2 queries per batch
  - `artifacts/api-server/src/routes/reviewerSubmissions.ts:133-152` — 1 query per submission
- **Impact:** At 50 products, listing makes 151 queries instead of 1
- **Fix approach:** Use Drizzle's `with:` clause for eager loading, or batch with `inArray()`

### Zero Test Coverage
- **Issue:** No test files, no test framework, no test dependencies in `package.json`
- **Files:** Entire codebase
- **Impact:** No automated verification of: webhook signature validation, order pricing, subscription arithmetic, admin auth, COA integrity
- **Fix approach:**
  1. Add `vitest` as dev dependency
  2. Write critical-path unit tests first: webhook verification, order pricing, admin auth
  3. Add integration tests for order → payment → webhook → confirmation flow

### Zero CI/CD Pipeline
- **Issue:** No `.github/workflows/`, no CI configuration
- **Files:** Missing entirely
- **Impact:** No automated type-checking on PR, no linting enforcement, no test execution, no secret scanning
- **Fix approach:** Create `.github/workflows/ci.yml` with typecheck, build, test; enable branch protection

### Hardcoded BTC Exchange Rate in Stub
- **Issue:** Stub BTC conversion uses hardcoded `const btcRate = 85000`
- **Files:** `artifacts/api-server/src/services/btcpay.ts:35`
- **Impact:** Could mislead QA/testing if stub path accidentally active
- **Fix approach:** Comment noting stub-only value, or fetch real rate from price API

### Email Templates Expose Email Address in URL
- **Issue:** Confirmation/reminder emails include customer email as query parameter in URLs
- **Files:** `artifacts/api-server/src/services/email.ts:65`
- **Impact:** Email addresses appear in server access logs, analytics, and URL shares expose personal data
- **Fix approach:** Use signed token flow (like management link) instead of raw email in URLs

### No Request Body Size Limits
- **Issue:** `express.json()` and `express.raw()` have no explicit `limit` option
- **Files:** `artifacts/api-server/src/app.ts:25,11`
- **Impact:** Express defaults to 100KB, but JSONB fields (`lineItems`, `shippingAddress`, `heavyMetals`) have no server-side caps beyond Zod validation
- **Fix approach:** Set explicit limits: `express.json({ limit: '50kb' })`, `express.raw({ limit: '50kb' })`

### Error Details Leaked in Zod Validation Responses
- **Issue:** Zod error object returned as string includes full schema structure
- **Files:** `artifacts/api-server/src/routes/orders.ts:41`
- **Impact:** Schema details exposed to clients
- **Fix approach:** Return sanitized error messages (most other endpoints already do this correctly)

## Architectural Fragilities

### Janoshik COA Integration is Manual-Only
- **Issue:** `janoshikTaskId` field exists but serves only as reference label
- **Files:** `lib/db/src/schema/batches.ts:59`
- **Problem:** No automated fetching, syncing, or verification against Janoshik API. All COA data manually entered by admins.
- **Risk:** Manual entry is error-prone and doesn't scale; COA integrity unverified
- **Fix approach (phased):**
  1. Phase 1: Add validation that `janoshikTaskId` follows expected format
  2. Phase 2: Build Janoshik API client to verify task IDs and auto-populate
  3. Phase 3: Add QR code → COA viewer that verifies against Janoshik's public records

### Subscription Billing Has No Payment Collection
- **Issue:** Subscription system tracks `nextBillingDate` and supports skip/pause/cancel, but has no payment collection flow
- **Files:** `artifacts/api-server/src/routes/subscriptions.ts` (entire subscription handler)
- **Problem:** 
  - No recurring charge trigger
  - No connection to BTCPay for renewals
  - No `renewed` event ever emitted (enum exists but unused)
  - No cron job to process due subscriptions
  - Effectively a shipment scheduler without billing
- **Fix approach:**
  1. Document whether subscriptions are prepaid or pay-per-cycle
  2. If pay-per-cycle, implement renewal job creating orders + crypto invoices
  3. Add `renewed` event emission on renewal success

### `isAdmin` Check Uses Unsafe Boolean Coercion
- **Issue:** `!!ADMIN_SECRET && req.headers["x-admin-key"] === ADMIN_SECRET`
- **Files:** `artifacts/api-server/src/routes/subscriptions.ts:44`
- **Problem:** If `ADMIN_SECRET=0` or `ADMIN_SECRET=false` (string), `!!""` is `false` but type coercion could fail
- **Fix approach:** Explicitly check `typeof ADMIN_SECRET === 'string' && ADMIN_SECRET.length > 0`

## Missing Features with Revenue/Trust Impact

### Order Payment Confirmation Email
- **Issue:** No post-payment confirmation sent to customer
- **Impact:** Every paying customer lacks proof of transaction; increases support load and refund disputes
- **Risk Priority:** HIGH
- **Effort:** 1-2 hours (wire email call into BTCPay webhook handler)

### Failed/Expired Payment Notifications
- **Issue:** Crypto invoices expire after 30 minutes with no customer notification
- **Impact:** Lost orders from silent failures; platform feels broken
- **Risk Priority:** HIGH
- **Effort:** 1-2 hours (add email triggers to expired/failed webhook handlers)

### Subscription Reactivation (Resume)
- **Issue:** No endpoint to resume paused subscriptions
- **Impact:** Paused subscriptions become permanent; customers must repurchase to resume
- **Risk Priority:** HIGH
- **Effort:** 3-4 hours (add resume endpoint, update state machine, log events)

### Reviewer Purity Stats Display Hardcoded
- **Issue:** Stats card shows "100% Purity Confirmation" regardless of actual test results
- **Impact:** False marketing claim if compliance audits; ledger loses credibility
- **Risk Priority:** MEDIUM
- **Effort:** 2-3 hours (query actual purity data; aggregate dynamically)

### BTCPay Configuration Validation & Warnings
- **Issue:** Stub mode activates silently without warning when BTCPay config missing
- **Impact:** If deployed to production unconfigured, all "payments" are fake
- **Risk Priority:** MEDIUM
- **Effort:** 2-3 hours (validate config on startup; block payment routes or fail loudly)

## Operational Readiness Gaps

### No Structured Logging
- **Issue:** All logging is `console.log/error` with no structured format
- **Files:** All route handlers
- **Impact:** Impossible to trace requests; no correlation IDs for debugging
- **Fix approach:** Use `pino` for structured JSON logging

### No Error Tracking Service
- **Issue:** No Sentry, Datadog, or equivalent
- **Impact:** Infrastructure failures silent; no alerting; blind incident diagnosis
- **Fix approach:** Wire Sentry for critical error alerts with context

### No Monitoring or Alerting
- **Issue:** If API server fails, nobody knows until customer emails
- **Impact:** Longer incident detection time; no proactive capacity planning
- **Fix approach:** Add health check endpoint; wire uptime monitoring

### No Database Migration Versioning
- **Issue:** Using Drizzle's `push` command (not `generate` + `migrate`)
- **Files:** `lib/db/drizzle.config.ts`
- **Problem:** `push` auto-applies with no rollback mechanism; no migration history in VCS; `post-merge.sh` runs blindly on every merge
- **Fix approach:** Switch to `drizzle-kit generate` + explicit `.sql` files in `lib/db/migrations/`; require review before applying

### Background Job Failures Cascade Silently
- **Issue:** `setInterval` for subscription reminders at `artifacts/api-server/src/index.ts:71` stops on process restart
- **Impact:** Reminders lost on deploy, crash, or autoscale with no retry
- **Fix approach:** Move to Bull + Redis job queue with exponential backoff retry

### No Dependency Vulnerability Scanning
- **Issue:** No `npm audit` automation; no Dependabot or Snyk
- **Impact:** Vulnerabilities can ship undetected
- **Fix approach:** Add `pnpm audit --prod` to CI; enable Dependabot

## Reviewer Webhook Reliability
- **Issue:** Webhook fires once; failures logged but not retried
- **Files:** `artifacts/api-server/src/routes/reviewerSubmissions.ts`
- **Impact:** Reviewer notifications lost on transient failures
- **Fix approach:** Implement retry queue with exponential backoff

---

**Summary:** Codebase has solid foundation (Zod validation, typed schemas, event sourcing) but has **6 critical security gaps** and **14 high/medium concerns**. Critical P0 findings (hardcoded secrets, webhook bypass, raw secret tokens) must be fixed before any production traffic. P1-P2 concerns require 2-3 sprints to fully address.
