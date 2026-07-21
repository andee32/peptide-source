# Lab-Standard-Initiative: Full Codebase Review

**Reviewer:** CTO Agent
**Date:** 2026-03-29
**Scope:** All server-side routes, services, database schemas, security posture, CI/CD readiness
**Repository:** ~75 TypeScript source files across monorepo (api-server, storefront, mockup-sandbox, lib/*)

---

## Severity Legend

| Level | Meaning | SLA |
|-------|---------|-----|
| **P0** | Critical — active exploit path, data loss, or compliance blocker | Fix before next deploy |
| **P1** | High — significant security, correctness, or reliability gap | Fix within 1 sprint |
| **P2** | Medium — code quality, performance, or maintainability concern | Fix within 2 sprints |

---

## P0 — Critical Findings

### P0-1: Hardcoded Admin Secrets in Version-Controlled `.replit`

**File:** `.replit:31-35`

```
[userenv.development]
ADMIN_SECRET = "[REDACTED — rotate in LSI]"

[userenv.shared]
ADMIN_EMAIL = "andee32@gmail.com"
ADMIN_PASSWORD_HASH = "[REDACTED]"
```

**Impact:** Anyone with repository read access (collaborators, forks, leaked repo) can authenticate as admin. The `ADMIN_SECRET` is the *only* credential needed — it's returned directly as the auth token on login (see P0-2).

**Remediation:**
1. **Rotate immediately:** Generate new `ADMIN_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`.
2. Move all secrets to environment-only config (Replit Secrets, `.env` files).
3. Add `.env*` to `.gitignore` (currently missing — see P0-3).
4. Consider using `git filter-repo` to scrub secrets from git history.

---

### P0-2: Admin Login Returns Raw Secret as Auth Token

**File:** `artifacts/api-server/src/routes/admin.ts:79`

```ts
res.json({ token: adminSecret });
```

On successful login, the server returns `process.env.ADMIN_SECRET` verbatim as the bearer token. This means:
- The admin secret is leaked over every login response.
- There is no session expiry — the token is valid forever.
- There is no per-session uniqueness — every admin session shares the same credential.
- If the login response is logged or intercepted, the permanent admin key is compromised.

**Remediation:**
1. Generate short-lived JWTs or opaque session tokens on login.
2. Implement token expiry (e.g., 1-hour TTL with refresh).
3. Never return the raw infrastructure secret to clients.

---

### P0-3: `.env` Files Not Git-Ignored

**File:** `.gitignore` (full contents reviewed)

The `.gitignore` has no entry for `.env`, `.env.local`, `.env.production`, or similar patterns. If any developer creates a `.env` file, it will be tracked by default.

**Remediation:** Add to `.gitignore`:
```
.env
.env.*
!.env.example
```

---

### P0-4: Webhook Signature Verification Bypassed When Unconfigured

**File:** `artifacts/api-server/src/services/btcpay.ts:175-178`

```ts
verifyWebhookSignature(rawBody, signatureHeader): boolean {
  const secret = BTCPAY_WEBHOOK_SECRET ?? BTCPAY_KEY;
  if (!secret) {
    return true;  // <-- BYPASSED
  }
```

If neither `BTCPAYSERVER_WEBHOOK_SECRET` nor `BTCPAYSERVER_API_KEY` is set, **all webhook payloads are accepted as authentic**. An attacker can POST a forged `InvoiceSettled` event to `/api/webhooks/btcpay` and mark any order as confirmed/paid without sending any crypto.

**Remediation:**
1. Fail closed: `if (!secret) return false;`
2. Log a startup warning when webhook secret is not configured.
3. Add an integration test that verifies rejection when no secret is present.

---

### P0-5: Admin Auth Uses Non-Constant-Time String Comparison

**File:** `artifacts/api-server/src/routes/admin.ts:25`

```ts
if (key !== adminSecret) {
```

The `adminAuth` middleware compares the `x-admin-key` header to `ADMIN_SECRET` using `!==`, which is vulnerable to timing attacks. This is inconsistent with the login endpoint, which correctly uses `timingSafeEqual`.

**File:** `artifacts/api-server/src/routes/subscriptions.ts:44`
```ts
function isAdmin(req: Request): boolean {
  return !!ADMIN_SECRET && req.headers["x-admin-key"] === ADMIN_SECRET;
}
```
Same issue duplicated here.

**File:** `artifacts/api-server/src/routes/reviewerSubmissions.ts:17`
```ts
function isAdmin(req: Request): boolean {
  return !!ADMIN_SECRET && req.headers["x-admin-key"] === ADMIN_SECRET;
}
```
And again here.

**Remediation:** Use `timingSafeEqual` for all secret comparisons across all three files.

---

### P0-6: Subscription Access Token Compared Without Timing-Safe Equality

**File:** `artifacts/api-server/src/routes/subscriptions.ts:65`

```ts
if (accessToken && accessToken === sub.accessToken) return true;
```

Subscription access tokens (32-byte hex strings) are compared with `===`, making them susceptible to timing attacks that can leak the token byte-by-byte.

**Remediation:** Use `timingSafeEqual(Buffer.from(accessToken), Buffer.from(sub.accessToken))` with a length pre-check.

---

## P1 — High Severity Findings

### P1-1: No CORS Restrictions — Wide Open to Any Origin

**File:** `artifacts/api-server/src/app.ts:7`

```ts
app.use(cors());
```

The CORS middleware is invoked with zero configuration, meaning `Access-Control-Allow-Origin: *` is returned for every request. This allows any website to make authenticated API calls on behalf of users.

**Remediation:**
```ts
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(",") ?? ["https://thelabstandard.com"],
  credentials: true,
}));
```

---

### P1-2: No Rate Limiting on Any Endpoint

No rate limiting middleware is present anywhere in the codebase. Critical endpoints vulnerable to abuse:

| Endpoint | Risk |
|----------|------|
| `POST /api/admin/login` | Brute-force password attack |
| `POST /api/orders` | Order flooding / resource exhaustion |
| `POST /api/subscriptions` | Spam subscription creation |
| `POST /api/subscriptions/request-management-link` | Email bombing |
| `POST /api/reviewer-submissions` | Spam submissions |

**Remediation:** Add `express-rate-limit` with tiered limits:
- Admin login: 5 attempts per 15 minutes per IP
- Order creation: 10 per minute per session
- Email endpoints: 3 per minute per email address

---

### P1-3: Stub BTC Address Generation Uses `Math.random()` (Non-Cryptographic)

**File:** `artifacts/api-server/src/services/btcpay.ts:22-27`

```ts
function generateStubBtcAddress(): string {
  const chars = "0123456789abcdefghijklmnopqrstuvwxyz";
  const suffix = Array.from({ length: 39 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
  return `bc1q${suffix}`;
```

`Math.random()` is not cryptographically secure. While this is labeled as a "stub," there is no runtime guard preventing it from being used in production if BTCPay is unconfigured. Compare with `generateStubEthAddress()` on line 29-31 which correctly uses `crypto.randomBytes()`.

**Remediation:**
1. Use `crypto.randomBytes()` for both stub generators.
2. Add a startup check that blocks the server from starting in production without BTCPay configured.
3. Log a warning when stub invoices are generated.

---

### P1-4: Stub Invoices Silently Used in Production

**File:** `artifacts/api-server/src/services/btcpay.ts:53-57`

```ts
async createInvoice(...): Promise<BTCPayInvoice> {
  if (this.isConfigured) {
    return this.createRealInvoice(orderId, amountCents, currency);
  }
  return this.createStubInvoice(orderId, amountCents, currency);
}
```

If BTCPay environment variables are not set, the service silently falls back to generating fake invoices with fake addresses. Combined with P0-4 (webhook bypass), an attacker could:
1. Create an order (gets stub invoice)
2. POST a forged webhook event → order marked "confirmed"
3. Receive goods without paying

**Remediation:**
1. In production (`NODE_ENV=production`), throw an error instead of falling back to stubs.
2. Prefix stub invoice IDs with `STUB-` (already done, good) **and** add a check in the webhook handler to reject `STUB-` invoice IDs.

---

### P1-5: No `helmet` Security Headers

The Express app does not use `helmet` or manually set security headers. Missing headers include:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security`
- `Content-Security-Policy`

**Remediation:** `npm install helmet` and add `app.use(helmet())`.

---

### P1-6: Order Lookup Requires No Authentication

**File:** `artifacts/api-server/src/routes/orders.ts:132-144`

```ts
router.get("/orders/:id", async (req, res) => {
  const order = await db.query.ordersTable.findFirst({
    where: eq(ordersTable.id, req.params.id),
  });
```

Anyone who knows (or guesses) an order UUID can retrieve full order details including PII: shipping name, email, address, payment information. UUIDs provide only ~122 bits of entropy, but the lack of any auth check means automated enumeration is possible.

**Remediation:** Require either admin auth or a session token / order access token to view order details.

---

### P1-7: Admin Auth Logic Duplicated Across 3 Files

The `isAdmin()` function is independently defined in:
1. `artifacts/api-server/src/routes/admin.ts:18-30` (as `adminAuth` middleware)
2. `artifacts/api-server/src/routes/subscriptions.ts:43-45`
3. `artifacts/api-server/src/routes/reviewerSubmissions.ts:16-18`

Each implementation has subtly different behavior (middleware vs. inline check). This violates DRY and means security fixes must be applied in 3 places.

**Remediation:** Extract a shared `isAdmin` middleware to `server/middleware/auth.ts` and import everywhere.

---

### P1-8: No Database Transaction Wrapping for Multi-Step Mutations

**File:** `artifacts/api-server/src/routes/orders.ts:103-130` (order creation)
**File:** `artifacts/api-server/src/routes/orders.ts:193-209` (invoice + payment record + order status update)
**File:** `artifacts/api-server/src/routes/subscriptions.ts:189-208` (subscription + event insert)

All multi-table writes are performed as separate queries without `db.transaction()`. If any intermediate query fails, the database is left in an inconsistent state (e.g., payment record created but order status not updated).

**Remediation:** Wrap all multi-step mutations in `await db.transaction(async (tx) => { ... })`.

---

## P2 — Medium Severity Findings

### P2-1: N+1 Query Pattern in Multiple List Endpoints

**Files:**
- `artifacts/api-server/src/routes/batches.ts:33-53` — Each batch triggers 2 additional queries
- `artifacts/api-server/src/routes/products.ts:58-97` — Each product triggers 3 additional queries
- `artifacts/api-server/src/routes/admin.ts:103-129` — Each batch triggers 2 additional queries
- `artifacts/api-server/src/routes/reviewerSubmissions.ts:133-152` — Each submission triggers 1 query

With N products, listing products makes `1 + 3N` queries. At 50 products, that's 151 queries per request.

**Remediation:** Use Drizzle's `with:` clause for eager loading, or batch queries with `inArray()`.

---

### P2-2: Zero Test Coverage

There are **no test files** in the entire repository (no `*.test.ts`, `*.spec.ts`, no test directories, no test dependencies in `package.json`).

**Impact:** No automated verification of:
- Webhook signature validation logic
- Order total calculations / crypto discount
- Subscription billing date arithmetic
- Admin auth flows
- COA data integrity

**Remediation:** Establish a test foundation:
1. Add `vitest` as a dev dependency.
2. Write critical-path unit tests first: webhook verification, order pricing, admin auth.
3. Add integration tests for order → payment → webhook → confirmation flow.

---

### P2-3: Zero CI/CD Pipeline

No `.github/workflows/`, no CI configuration of any kind. This means:
- No automated type-checking on PR
- No linting enforcement
- No test execution
- No secret scanning
- No build verification
- No branch protection enforcement

**Remediation:** Create `.github/workflows/ci.yml` with:
```yaml
- pnpm install
- pnpm run typecheck
- pnpm run build
- pnpm test (when tests exist)
```
Enable GitHub branch protection requiring CI pass before merge.

---

### P2-4: Hardcoded BTC Exchange Rate in Stub

**File:** `artifacts/api-server/src/services/btcpay.ts:35`

```ts
const btcRate = 85000;
```

The stub BTC conversion uses a hardcoded $85,000 rate. While only used in dev stubs, this could mislead QA/testing if the stub path is accidentally active.

**Remediation:** Add a comment noting this is a stub-only value, or fetch a real rate from a price API.

---

### P2-5: Email Templates Contain Direct Email Parameter in URLs

**File:** `artifacts/api-server/src/services/email.ts:65`

```ts
const dashboardUrl = `${SITE_URL}/account/subscriptions?email=${encodeURIComponent(data.to)}`;
```

The confirmation and reminder emails include a URL with the customer's email as a query parameter. This means:
- Email addresses appear in server access logs
- Email addresses may appear in analytics/tracking tools
- URL sharing could expose the email

The management link flow (`subscriptions.ts:247`) correctly uses a signed token instead. The email templates should do the same.

**Remediation:** Use the management token flow for all email links, not raw email query params.

---

### P2-6: No Request Body Size Limits

**File:** `artifacts/api-server/src/app.ts:25`

```ts
app.use(express.json());
```

No `limit` option is set, so Express defaults to 100KB. This is somewhat reasonable, but the `express.raw()` middleware for webhooks (`app.ts:11`) also has no explicit limit, and JSONB fields like `lineItems`, `shippingAddress`, and `heavyMetals` have no server-side size caps beyond Zod validation.

**Remediation:** Set explicit limits: `express.json({ limit: '50kb' })`, `express.raw({ limit: '50kb' })`.

---

### P2-7: Error Details Leaked in Zod Validation Responses

**File:** `artifacts/api-server/src/routes/orders.ts:41`

```ts
res.status(400).json({ error: "validation_error", message: String(parsed.error) });
```

Zod error objects contain full schema details including field names, types, and constraints. Returning `String(parsed.error)` exposes internal schema structure to clients.

**Remediation:** Return sanitized error messages. Most other endpoints already do this correctly with `parsed.error.message` or `parsed.error.issues[0]?.message`.

---

### P2-8: Janoshik COA Integration is Manual-Only

The Janoshik COA integration consists of:
- A `janoshikTaskId` text field on `coa_results` table (`lib/db/src/schema/batches.ts:59`)
- Manual entry via the `POST /admin/batches/:id/coa` endpoint
- No automated fetching, syncing, or verification against Janoshik's API

There is no automated integration with Janoshik's systems — no API client, no scheduled sync, no webhook receiver for COA results. All COA data is manually entered by admins.

**Impact:** Manual entry is error-prone and doesn't scale. The `janoshikTaskId` field exists but serves only as a reference label, not as a verification link.

**Remediation (phased):**
1. **Phase 1:** Add admin UI validation that `janoshikTaskId` follows the expected format (partially done via reviewer submissions regex: `/^[A-Z]{1,4}[0-9]{4,12}$/i`).
2. **Phase 2:** Build a Janoshik API client to verify task IDs and auto-populate COA data.
3. **Phase 3:** Add a batch QR code → COA viewer flow that verifies data against Janoshik's public records.

---

### P2-9: Subscription Billing Has No Payment Collection

The subscription system tracks `nextBillingDate` and supports skip/pause/cancel, but has **no payment collection flow**. There is:
- No recurring charge trigger
- No connection to BTCPay for subscription renewals
- No `renewed` event ever emitted (the enum value exists but is never used)
- No cron job or scheduler to process due subscriptions

The subscription system is effectively a **shipment scheduler without billing**.

**Remediation:**
1. Document whether subscriptions are prepaid or pay-per-cycle.
2. If pay-per-cycle, implement a renewal job that creates orders + crypto invoices.
3. Add the `renewed` event emission when renewal succeeds.

---

### P2-10: `isAdmin` Check Uses Non-Strict Comparison Pattern

**File:** `artifacts/api-server/src/routes/subscriptions.ts:44`

```ts
return !!ADMIN_SECRET && req.headers["x-admin-key"] === ADMIN_SECRET;
```

If `ADMIN_SECRET` is an empty string `""`, `!!""` is `false` so this is safe. But if someone sets `ADMIN_SECRET=0` or `ADMIN_SECRET=false`, the double-bang could produce unexpected behavior. The check should explicitly verify the secret is a non-empty string.

---

## Architecture & Quality Summary

### What's Done Well
- **Zod validation** on all public-facing endpoints with proper error handling
- **Timing-safe comparisons** in login and management token verification (though inconsistently applied elsewhere)
- **Webhook raw body preservation** for signature verification (`app.ts:10-23`)
- **Idempotent crypto invoice creation** — reuses pending invoices (`orders.ts:162-182`)
- **Subscription event sourcing** — all state changes logged to `subscription_events` table
- **Generated API types** from OpenAPI spec via `orval` — single source of truth for client/server contracts
- **Database schema design** — clean normalization, proper foreign keys with cascade deletes, enum types

### What Needs Immediate Attention
1. **Secret rotation and removal from VCS** (P0-1, P0-3)
2. **Fail-closed webhook verification** (P0-4)
3. **Token-based admin auth** replacing raw secret passthrough (P0-2)
4. **Consistent timing-safe comparisons** across all auth paths (P0-5, P0-6)

### What Needs Near-Term Investment
1. **Rate limiting and security headers** (P1-1, P1-2, P1-5)
2. **Authentication on order lookups** (P1-6)
3. **Database transactions** for multi-step operations (P1-8)
4. **Test suite and CI/CD pipeline** (P2-2, P2-3)

---

## File Index (All Files Reviewed)

| File | Lines | Review Status |
|------|-------|---------------|
| `.replit` | 36 | P0 finding |
| `.gitignore` | 50 | P0 finding |
| `artifacts/api-server/src/app.ts` | 30 | P1 findings |
| `artifacts/api-server/src/routes/admin.ts` | 536 | P0, P1 findings |
| `artifacts/api-server/src/routes/webhooks.ts` | 93 | Reviewed (delegates to btcpay service) |
| `artifacts/api-server/src/routes/orders.ts` | 247 | P1 findings |
| `artifacts/api-server/src/routes/subscriptions.ts` | 677 | P0, P2 findings |
| `artifacts/api-server/src/routes/products.ts` | 212 | P2 findings |
| `artifacts/api-server/src/routes/batches.ts` | 159 | P2 findings |
| `artifacts/api-server/src/routes/reviewerSubmissions.ts` | 217 | P0 finding |
| `artifacts/api-server/src/routes/health.ts` | 11 | Clean |
| `artifacts/api-server/src/routes/index.ts` | 22 | Clean |
| `artifacts/api-server/src/services/btcpay.ts` | 192 | P0, P1 findings |
| `artifacts/api-server/src/services/email.ts` | 202 | P2 finding |
| `lib/db/src/schema/products.ts` | 76 | Clean |
| `lib/db/src/schema/orders.ts` | 80 | Clean |
| `lib/db/src/schema/batches.ts` | 67 | Clean |
| `lib/db/src/schema/subscriptions.ts` | 84 | Clean |
| `lib/db/src/schema/reviewerSubmissions.ts` | 49 | Clean |
| `package.json` | 16 | P2 (no test deps) |

---

## Summary Scoreboard

| Severity | Count | Status |
|----------|-------|--------|
| **P0** | 6 | Must fix before any production traffic |
| **P1** | 8 | Fix within next sprint |
| **P2** | 10 | Scheduled for next 2 sprints |
| **Total** | 24 | |

**Overall Assessment:** The codebase has solid foundational patterns (Zod validation, typed schemas, event sourcing) but has **critical security gaps** that make it unsafe for production traffic. The P0 findings — particularly hardcoded secrets, webhook bypass, and raw secret as auth token — represent active exploit paths that must be addressed before any public deployment.
