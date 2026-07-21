# Lab-Standard-Initiative — Technical Context Document

**Audit Date:** 2026-03-29 (re-validated)
**Auditor:** CTO Agent (Claude)
**Repository:** `andee32/Lab-Standard-Initiative`
**Remote:** `https://github.com/andee32/Lab-Standard-Initiative.git`
**Branch Audited:** `origin/master` (31 commits, HEAD at `874fd96`)

---

## 1. Executive Summary

Lab-Standard-Initiative (branded **The Lab Standard**) is a **crypto-first e-commerce platform for research peptides** with integrated lab verification, community testing, and subscription commerce. The codebase is a TypeScript pnpm monorepo (~23,600 lines across hand-written + generated code) deployed on Replit with a PostgreSQL database.

| Attribute | Value |
|---|---|
| **Primary Language** | TypeScript 5.9 |
| **Runtime** | Node.js 24 |
| **Package Manager** | pnpm (workspaces) |
| **Backend** | Express 5 + Drizzle ORM |
| **Frontend** | React 19 + Vite 7 + Tailwind CSS 4 |
| **Database** | PostgreSQL (via Drizzle ORM) |
| **Deployment** | Replit (autoscale) |
| **CI/CD** | **None configured** |
| **Test Coverage** | **Zero tests** |
| **Total Commits** | 31 (on `master`) |

---

## 2. Architecture Overview

```
                    +---------------------+
                    |   Storefront (SPA)  |
                    |  React + Wouter     |
                    |  Tailwind + shadcn  |
                    +---------+-----------+
                              |
                    REST API (/api/*)
                              |
                    +---------+-----------+
                    |   API Server        |
                    |   Express 5         |
                    |   Zod validation    |
                    +---------+-----------+
                              |
              +---------------+---------------+
              |               |               |
     +--------+--+   +-------+-----+  +------+--------+
     | PostgreSQL |   | BTCPayServer|  | SMTP (Email)  |
     | Drizzle    |   | (Payments)  |  | (Nodemailer)  |
     +------------+   +-------------+  +---------------+
```

### Monorepo Structure

```
/
├── artifacts/
│   ├── api-server/       # Express 5 REST API (backend)
│   ├── storefront/       # React SPA (customer-facing)
│   └── mockup-sandbox/   # UI prototyping sandbox
├── lib/
│   ├── db/               # Drizzle ORM schema + connection (PostgreSQL)
│   ├── api-spec/         # OpenAPI 3.1 spec (single source of truth)
│   ├── api-zod/          # Generated Zod validators from OpenAPI
│   └── api-client-react/ # Generated React Query hooks from OpenAPI
├── scripts/              # Database seeding (products, subscriptions)
├── package.json          # Root workspace config
├── pnpm-workspace.yaml   # Workspace + dependency catalog
└── tsconfig.base.json    # Shared TypeScript config (strict mode)
```

### Code Generation Pipeline

```
openapi.yaml  ──(Orval)──►  lib/api-zod/src/generated/     (48 type files)
                         └►  lib/api-client-react/src/generated/  (React Query hooks)
```

This ensures type safety across the full stack — the OpenAPI spec is the contract, and both server validation (Zod) and client data-fetching (React Query) are generated from it.

---

## 3. Tech Stack Detail

### 3.1 Backend (`artifacts/api-server/`)

| Layer | Technology | Notes |
|---|---|---|
| Framework | Express 5 | All routes under `/api` prefix |
| ORM | Drizzle ORM 0.45 | PostgreSQL driver, type-safe queries |
| Validation | Zod 3.25 | Generated from OpenAPI spec |
| Auth | Custom (PBKDF2 + HMAC-SHA256) | Admin key header + management tokens |
| Payments | BTCPayServer | BTC + USDC, webhook-driven |
| Email | Nodemailer 8 | SMTP with graceful degradation |
| QR Codes | qrcode 1.5 | Batch verification + payment URIs |

**Key files by size:**
- `src/routes/subscriptions.ts` — 677 lines (largest route file)
- `src/routes/admin.ts` — 536 lines
- `src/services/email.ts` — Email templates (HTML + plaintext)
- `src/services/btcpay.ts` — BTCPayServer API integration

### 3.2 Frontend (`artifacts/storefront/`)

| Layer | Technology | Notes |
|---|---|---|
| Framework | React 19 | SPA, no SSR |
| Routing | Wouter 3.3 | Lightweight client-side routing |
| Styling | Tailwind CSS 4 + shadcn/ui | 60+ Radix UI components |
| State | React Query (TanStack) | Server state management |
| Forms | React Hook Form + Zod | Client-side validation |
| Analytics | Segment.io | Consent-gated |
| Animations | Framer Motion | Page transitions |

**Largest page components:**
- `AdminPage.tsx` — 2,179 lines (product/batch/subscription management)
- `CheckoutPage.tsx` — 889 lines (crypto payment flow)
- `CustomerSubscriptionsPage.tsx` — 611 lines

### 3.3 Database Schema (`lib/db/`)

**10 tables across 5 domains:**

| Domain | Tables | Description |
|---|---|---|
| **Catalog** | `products`, `product_variants` | Products with categories, variants with SKU/pricing |
| **Lab Verification** | `batches`, `coa_results` | Manufacturing batches + Certificate of Analysis results (purity, endotoxin, sterility, heavy metals) |
| **Orders** | `orders`, `payment_records` | Crypto-first ordering with BTC/USDC payment tracking |
| **Subscriptions** | `subscription_plans`, `subscriptions`, `subscription_events` | Research kit auto-replenishment (30/60/90 day intervals) |
| **Community** | `reviewer_submissions` | Third-party independent lab verification submissions |

**Key enums:**
- Product categories: `metabolic`, `longevity`, `recovery`, `cognitive`, `other`
- Batch status: `pending`, `released`, `quarantined`
- COA test types: `purity`, `endotoxin`, `sterility`, `heavyMetals`
- Payment methods: `card`, `crypto_btc`, `crypto_usdc`
- Order status: `pending`, `awaiting_payment`, `confirmed`, `failed`, `expired`

---

## 4. API Surface

### Public Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/healthz` | Health check |
| `GET` | `/api/products` | List published products (filter: category, featured) |
| `GET` | `/api/products/:id` | Product detail with variants + latest batch |
| `GET` | `/api/batches` | List batches (filter: productId) |
| `GET` | `/api/batches/:id` | Batch detail with COA results |
| `GET` | `/api/batches/:id/qr` | QR code PNG for batch verification |
| `POST` | `/api/orders` | Create order (10% crypto discount applied) |
| `GET` | `/api/orders/:id` | Order detail with payment record |
| `POST` | `/api/orders/:id/crypto-invoice` | Generate BTC/USDC invoice via BTCPay |
| `GET` | `/api/orders/:id/payment-qr` | Payment QR code PNG |
| `GET` | `/api/subscription-plans` | List subscription plans |
| `GET` | `/api/subscription-plans/:slug` | Plan detail |
| `POST` | `/api/subscriptions` | Create subscription (returns access token) |
| `GET` | `/api/subscriptions` | List user subscriptions (email or mgmt token) |
| `PATCH` | `/api/subscriptions/:id/skip` | Skip next billing cycle |
| `DELETE` | `/api/subscriptions/:id` | Cancel subscription |
| `POST` | `/api/subscriptions/request-management-link` | Send magic link email |
| `POST` | `/api/reviewer-submissions` | Submit independent test result |
| `GET` | `/api/reviewer-submissions` | Public: approved results only |
| `GET` | `/api/reviewer-submissions/stats` | Approved submission count |

### Admin Endpoints (require `X-Admin-Key` header)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/admin/login` | Admin login (email + password) |
| `GET/POST/PUT/DELETE` | `/api/admin/products[/:id]` | Full product CRUD |
| `POST/PUT/DELETE` | `/api/admin/products/:id/variants` | Variant management |
| `GET/POST/PUT` | `/api/admin/batches[/:id]` | Batch management |
| `POST/DELETE` | `/api/admin/batches/:id/coa` | COA result management |
| `PATCH` | `/api/reviewer-submissions/:id` | Approve/reject submissions |
| `GET` | `/api/admin/subscriptions` | Stats + subscription list |
| `PATCH` | `/api/admin/subscriptions/:id/status` | Change subscription status |
| `POST` | `/api/admin/subscriptions/dispatch-reminders` | Trigger reminder emails |

### Webhook

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/webhooks/btcpay` | BTCPay payment status updates (HMAC-SHA256 verified) |

---

## 5. Authentication & Security

### 5.1 Authentication Model

The system uses **three authentication tiers** (no traditional user accounts):

1. **Admin Key** — `X-Admin-Key` header validated against `ADMIN_SECRET` env var. Admin login via PBKDF2 password hashing (100K iterations, SHA-256).
2. **Subscription Access Tokens** — 32-byte random hex tokens, generated at subscription creation, stored in localStorage on client.
3. **Management Tokens** — HMAC-SHA256 signed, 15-minute expiry, email-based magic links.

### 5.2 Security Strengths

- Timing-safe equality checks (`timingSafeEqual`) on all security comparisons (`admin.ts:56`, `subscriptions.ts:30`)
- PBKDF2 with 100K iterations for admin passwords (`admin.ts:51`)
- HMAC-SHA256 for webhook signature verification (`btcpay.ts`)
- Zod validation on all request bodies — `.safeParse()` with 400 errors
- Access tokens redacted before returning to users
- Email normalization (lowercase + trim) for lookups
- BTCPay webhook raw body capture for signature integrity

### 5.3 Security Concerns

| Severity | Issue | Location | Recommendation |
|---|---|---|---|
| **CRITICAL** | Hardcoded secrets in committed `.replit` file | `.replit:31-35` | Rotate `ADMIN_SECRET` and `ADMIN_PASSWORD_HASH` immediately. Move to Replit Secrets or env-only config. |
| **HIGH** | CORS enabled for all origins | `app.ts` (global `cors()`) | Restrict to specific allowed origins in production |
| **HIGH** | No rate limiting on any endpoint | All routes | Add rate limiting (especially on `/admin/login`, `/subscriptions/request-management-link`) |
| **MEDIUM** | Management token secret fallback to ADMIN_SECRET | `subscriptions.ts:24` | Always require a separate `MGMT_TOKEN_SECRET` in production |
| **MEDIUM** | No HTTPS enforcement at app level | `app.ts` | Rely on Replit proxy or add explicit redirect |
| **LOW** | No CSP/security headers | `app.ts` | Add `helmet` middleware for security headers |
| **LOW** | Dev-mode management URL leaked in response | `subscriptions.ts:262` | Ensure `NODE_ENV=production` is always set in deployment |

---

## 6. Deployment & Infrastructure

### Current Deployment: Replit

| Setting | Value | Source |
|---|---|---|
| Runtime | Node.js 24 | `.replit:1` |
| Router | Application | `.replit:10` |
| Deployment target | Autoscale | `.replit:11` |
| Post-build | `pnpm store prune` | `.replit:14` |
| Database | PostgreSQL | `DATABASE_URL` env var |
| Payment processor | BTCPayServer (external) | `BTCPAYSERVER_URL` env var |
| Email | SMTP (external) | `SMTP_HOST` env var |

### CI/CD Status: **Not Configured**

- No `.github/workflows/` directory
- No GitHub Actions, no branch protection rules
- No automated testing, linting, or type checking on PRs
- Build command exists (`pnpm run build` = typecheck + build) but is not automated

### Background Jobs

- Subscription renewal reminders dispatched every 24 hours via `setInterval` in `index.ts`
- Finds subscriptions with `nextBillingDate` in 3-4 day window and sends reminder emails

---

## 7. Notable Patterns & Constraints

### 7.1 Patterns

- **OpenAPI-first development** — API contract defined in YAML, code generated for both client and server validation
- **pnpm workspace catalog** — Centralized dependency versioning in `pnpm-workspace.yaml`
- **Graceful degradation** — BTCPay and SMTP both fall back to stubs/logging when not configured
- **Crypto-first commerce** — 10% discount for crypto payments; card payments marked "coming soon"
- **Janoshik Analytical integration** — Lab verification via task ID format `^[A-Z]{1,4}[0-9]{4,12}$`

### 7.2 Constraints

- **Replit-coupled** — `.replit` config, Replit Vite plugins, Replit-specific build pipeline
- **No SSR** — Storefront is a pure SPA; SEO depends entirely on client-side rendering
- **Single admin user** — No role-based access; single admin key + single email/password pair
- **No test infrastructure** — Zero test files, no test runner configured, no coverage tooling
- **Large page components** — `AdminPage.tsx` at 2,179 lines suggests need for component decomposition
- **Background job fragility** — `setInterval` for reminders will not survive process restarts without external scheduler

---

## 8. Dependency Health

### Key Runtime Dependencies

| Package | Version | Risk |
|---|---|---|
| Express | 5.x | Stable, well-maintained |
| Drizzle ORM | 0.45 | Active development, minor breaking changes possible |
| React | 19.1 | Latest stable |
| Vite | 7.3 | Latest major |
| Tailwind CSS | 4.1 | Latest major (new engine) |
| Zod | 3.25 | Stable |
| Wouter | 3.3 | Lightweight, community-maintained |

### Missing Infrastructure Dependencies

| Need | Recommendation |
|---|---|
| Test runner | Vitest (integrates with Vite) |
| Security headers | `helmet` middleware |
| Rate limiting | `express-rate-limit` |
| Logging | `pino` or `winston` (structured logging) |
| Error tracking | Sentry or equivalent |

---

## 9. Seed Data (Development)

The `scripts/` package pre-populates:

**Products (5):** Semaglutide, BPC-157, Tirzepatide, Retatrutide, Epithalon
**Variants (10):** Multiple concentrations/sizes per product ($34.99–$119.99)
**Batches (5):** With production dates and statuses
**COA Results (13):** Purity, endotoxin, sterility, heavy metals tests
**Subscription Plans (3):** GLP-1 Metabolic Kit (30d, $84.99), Longevity Starter Kit (60d, $144.99), Next-Gen Metabolic Kit (90d, $109.99)

---

## 10. Environment Variables Reference

| Variable | Required | Used In | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | `lib/db` | PostgreSQL connection string |
| `PORT` | Yes | `api-server` | Server listen port |
| `ADMIN_SECRET` | Yes | `api-server` | Admin API key for protected routes |
| `ADMIN_EMAIL` | Yes | `api-server` | Admin login email |
| `ADMIN_PASSWORD_HASH` | Yes | `api-server` | PBKDF2 hashed password (`salt:hash`) |
| `NODE_ENV` | Recommended | `api-server` | Set to `production` for prod |
| `MGMT_TOKEN_SECRET` | Recommended | `api-server` | Subscription management token secret |
| `BTCPAYSERVER_URL` | For payments | `api-server` | BTCPayServer instance URL |
| `BTCPAYSERVER_API_KEY` | For payments | `api-server` | BTCPay API key |
| `BTCPAYSERVER_STORE_ID` | For payments | `api-server` | BTCPay store identifier |
| `BTCPAYSERVER_WEBHOOK_SECRET` | For payments | `api-server` | Webhook HMAC secret |
| `BTCPAYSERVER_USDC_METHOD` | Optional | `api-server` | USDC payment method (default: `ETH_USDC20`) |
| `SMTP_HOST` | For email | `api-server` | SMTP server hostname |
| `SMTP_PORT` | For email | `api-server` | SMTP port (default: 587) |
| `SMTP_USER` | For email | `api-server` | SMTP username |
| `SMTP_PASS` | For email | `api-server` | SMTP password |
| `SMTP_FROM` | Optional | `api-server` | From address (default: `noreply@thelabstandard.com`) |
| `PUBLIC_URL` | Optional | `api-server` | Base URL for QR codes |
| `SITE_URL` | Optional | `api-server` | Base URL for email links |
| `REVIEWER_WEBHOOK_URL` | Optional | `api-server` | Webhook for reviewer submissions |

---

## 11. CTO Recommendations (Priority-Ordered)

### Immediate (Before Next Deploy)

1. **Rotate compromised secrets** — `.replit:31-35` contains `ADMIN_SECRET` and `ADMIN_PASSWORD_HASH` in version control. Rotate immediately and move to Replit Secrets.
2. **Restrict CORS** — Replace global `cors()` with origin whitelist in `app.ts`.
3. **Add rate limiting** — Install `express-rate-limit` on `/admin/login` and `/subscriptions/request-management-link` at minimum.

### Short-Term (Next Sprint)

4. **Set up CI/CD** — GitHub Actions workflow: typecheck + lint on every PR. Branch protection on `master`.
5. **Add test infrastructure** — Install Vitest, write integration tests for payment and subscription flows first (highest-risk code paths).
6. **Add `helmet`** — Security headers middleware on Express.
7. **Decompose `AdminPage.tsx`** — 2,179 lines; extract into sub-components per tab.

### Medium-Term

8. **Structured logging** — Replace `console.log` with `pino` for production observability.
9. **Error tracking** — Integrate Sentry for both API server and storefront.
10. **SSR or pre-rendering** — Consider for SEO on product and verification pages.
11. **Externalize background jobs** — Move `setInterval` reminder dispatch to a proper job scheduler.

---

---

## 12. Code Metrics

### Lines of Code by Package

| Package | Lines | Description |
|---|---|---|
| `artifacts/api-server/src/` | 2,670 | Backend routes, services, app setup |
| `artifacts/storefront/src/` | 7,469 | Frontend pages, components (excl. shadcn/ui) |
| `lib/db/src/` | 373 | Database schema + connection |
| `lib/api-client-react/src/` | 2,022 | Generated React Query hooks + custom fetch |
| `lib/api-zod/src/` | 1,125 | Generated Zod validators |
| **Total (all `.ts`/`.tsx`)** | **~26,500** | Including generated code |

### Frontend Route Map

| Route | Component | Description |
|---|---|---|
| `/` | `HomePage` | Landing page with hero, featured products |
| `/shop` | `ProductsPage` | Product catalog with category filtering |
| `/products/:slug` | `ProductDetailPage` | Product detail with variants + batch data |
| `/verify` or `/verify/:batchId` | `VerifyPage` | COA verification scanner |
| `/checkout` | `CheckoutPage` | Cart → shipping → crypto payment flow |
| `/orders/:id` | `OrderConfirmationPage` | Order status + payment tracking |
| `/reviewers` | `ReviewersPage` | Public community verification ledger |
| `/reviewers/submit` | `ReviewerSubmitPage` | Submit independent test results |
| `/kits` | `ResearchKitsPage` | Subscription plan catalog |
| `/kits/:slug/subscribe` | `KitSubscribePage` | Subscribe to a research kit |
| `/subscriptions` | `CustomerSubscriptionsPage` | Manage active subscriptions |
| `/admin` | `AdminPage` | Admin dashboard (products, batches, subs) |
| `/admin/batches` | `AdminPage` | Batch management tab (same component) |
| `/admin/reviewer-submissions` | `AdminPage` | Reviewer moderation tab |
| `/admin/subscriptions` | `AdminPage` | Subscription admin tab |

### Frontend Context Providers

The app wraps all routes in 4 context providers (see `App.tsx`):
1. **`AnalyticsProvider`** — Consent-gated Segment.io tracking
2. **`CartProvider`** — Client-side cart state (likely localStorage-backed)
3. **`QueryClientProvider`** — TanStack React Query for API data caching
4. **`TooltipProvider`** — Radix UI tooltip configuration

---

## 13. Outstanding Technical Debt

| # | Category | Item | Effort |
|---|---|---|---|
| 1 | Security | Secrets committed to `.replit` — must rotate | 1 hour |
| 2 | Security | Wide-open CORS (`cors()` with no config) | 30 min |
| 3 | Security | Zero rate limiting on auth/sensitive endpoints | 2 hours |
| 4 | Testing | No test files, no test runner, no coverage | 2-3 days |
| 5 | CI/CD | No automated checks on PRs or deploys | 1 day |
| 6 | Maintainability | `AdminPage.tsx` at 2,179 lines — needs decomposition | 1 day |
| 7 | Observability | `console.log` only — no structured logging | 1 day |
| 8 | Reliability | `setInterval` reminders — lost on process restart | 4 hours |
| 9 | SEO | Pure SPA — no SSR/pre-rendering for product pages | 2-3 days |
| 10 | Security | No `helmet` security headers | 30 min |

---

*This document should be updated after each major architectural milestone. Next audit recommended after CI/CD setup and security remediation are complete.*
