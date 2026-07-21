# External Integrations

**Analysis Date:** 2026-06-22

## APIs & External Services

**Crypto Payments:**
- BTCPayServer - Custodial crypto payment processing for orders
  - SDK/Client: Custom HTTP client in `artifacts/api-server/src/services/btcpay.ts`
  - Auth: `BTCPAYSERVER_API_KEY` (API key)
  - Webhook secret: `BTCPAYSERVER_WEBHOOK_SECRET` (HMAC-SHA256 verification)
  - Endpoint: `POST /api/webhooks/btcpay` receives payment status updates
  - Currencies: BTC, USDC (via `BTCPAYSERVER_USDC_METHOD`, defaults to `ETH_USDC20`)
  - Status: Placeholder/unconfigured — no live store wired as of last activity
  - Stub fallback: Creates fake invoices locally when credentials absent

**Lab Analysis Verification:**
- Janoshik - Third-party lab analysis verification service (placeholder integration)
  - Integration: Links to Janoshik order pages (not API-driven, just referential)
  - Field: `janoshikTaskId` stored in `coa_results` table
  - UI: `artifacts/storefront/src/components/coa/JanoshikBadge.tsx` links to `https://janoshik.com/order/{taskId}`
  - Status: Placeholder only — no actual API integration implemented

**Analytics:**
- Segment - Customer event tracking (optional, cookie-consent gated)
  - SDK/Client: CDN script `https://cdn.segment.com/analytics.js/v1/{writeKey}/analytics.min.js`
  - Auth: `VITE_SEGMENT_WRITE_KEY` (Segment write key, loaded client-side)
  - Implementation: `artifacts/storefront/src/contexts/analytics.tsx`
  - Consent: Behind cookie banner in `artifacts/storefront/src/components/layout/CookieBanner.tsx`
  - Events tracked: `Verification Scan` on batch detail pages (and other standard lifecycle events)
  - Status: Scaffold only — fires if `VITE_SEGMENT_WRITE_KEY` is set and user consents

## Data Storage

**Databases:**
- PostgreSQL (primary)
  - Connection: `DATABASE_URL` environment variable
  - Client: `pg` (native Node.js Postgres driver)
  - ORM: Drizzle ORM (`drizzle-orm`)
  - Schema location: `lib/db/src/schema/index.ts`
  - Tables: `products`, `product_variants`, `batches`, `coa_results`, `orders`, `payment_records`, `reviewer_submissions`, `subscriptions`, `subscription_plans`
  - Migrations: Managed via `drizzle-kit` (`pnpm --filter @workspace/db run push`)

**File Storage:**
- Local filesystem only - No cloud storage integration
- QR code generation: In-memory PNG output from `qrcode` library
- No S3, Cloudinary, or other external file service

**Caching:**
- None configured - Direct database queries (Drizzle ORM without query-level caching)
- Client-side: React Query (TanStack React Query) caches API responses per default TTL

## Authentication & Identity

**Admin Authentication:**
- Custom HTTP header-based
  - Method: Bearer token via `x-admin-key` header matching `ADMIN_SECRET`
  - Implementation: `artifacts/api-server/src/routes/admin.ts`, `artifacts/api-server/src/routes/reviewerSubmissions.ts`
  - Credentials: `ADMIN_EMAIL` and `ADMIN_PASSWORD_HASH` (bcrypt) stored in env (no login UI)

**Subscription Management:**
- Magic link tokens (JWT-like)
  - Implementation: `artifacts/api-server/src/routes/subscriptions.ts`
  - Token secret: `MGMT_TOKEN_SECRET` (falls back to `ADMIN_SECRET`)
  - Flow: Customer enters email → receives management link → token grants access to manage own subscriptions
  - Expiration: Configurable (referenced in email sending)

**No user accounts** - Storefront is read-only, orders and subscriptions identified by email

## Monitoring & Observability

**Error Tracking:**
- None configured (no Sentry, Rollbar, etc.)
- Console logging only for errors and reminders

**Logs:**
- Console output:
  - `artifacts/api-server/src/index.ts` logs server startup and reminder dispatch results
  - `artifacts/api-server/src/services/email.ts` logs SMTP config status and failures
  - `artifacts/api-server/src/services/btcpay.ts` would log API errors
  - Frontend: No structured logging (normal React console warnings)

**Monitoring:**
- Health check endpoint: `GET /api/health` (empty route defined in `artifacts/api-server/src/routes/health.ts`)

## CI/CD & Deployment

**Hosting:**
- Replit (evidenced by `@replit/vite-plugin-*` and `.replit` file presence)
- Can run on any Node.js host (Express + Postgres + static hosting)

**CI Pipeline:**
- None detected - No GitHub Actions, CircleCI, or equivalent

**Build Process:**
- Root: `pnpm run build` → `pnpm run typecheck && pnpm -r --if-present run build`
  - Typecheck: `pnpm run typecheck:libs` (tsc on lib workspaces) + `pnpm -r --filter "./artifacts/**" --filter "./scripts" --if-present run typecheck`
  - Each workspace runs own `build` script
- API server: `pnpm --filter @workspace/api-server run build` → `tsx ./build.ts` (esbuild bundle)
- Storefront: `pnpm --filter @workspace/storefront run build` → `vite build` (outputs to `dist/public/`)
- Dev: `pnpm --filter @workspace/api-server run dev` (tsx watch), `pnpm --filter @workspace/storefront run dev` (Vite dev server)

## Environment Configuration

**Required env vars:**
- `DATABASE_URL` - Postgres connection
- `PORT` - Server port for both Express and Vite dev servers
- `NODE_ENV` - `development` or `production`
- `ADMIN_SECRET` - Admin API key
- `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` - Admin credentials
- `SITE_URL` - Base URL for email links (defaults to `https://thelabstandard.com`)
- `PUBLIC_URL` - URL for QR code generation (defaults to request origin)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` - Email delivery
- `BASE_PATH` - Vite base path (e.g., `/` or `/lab/`)

**Optional env vars:**
- `BTCPAYSERVER_URL`, `BTCPAYSERVER_API_KEY`, `BTCPAYSERVER_STORE_ID`, `BTCPAYSERVER_WEBHOOK_SECRET`, `BTCPAYSERVER_USDC_METHOD` - Crypto payments (falls back to stub if absent)
- `VITE_SEGMENT_WRITE_KEY` - Segment analytics
- `REVIEWER_WEBHOOK_URL` - Outbound reviewer notifications
- `MGMT_TOKEN_SECRET` - Subscription management token secret (uses `ADMIN_SECRET` if absent)

**Secrets location:**
- Environment variables (no `.env` file committed)
- Must be set in deployment platform (Replit, container, etc.)

## Webhooks & Callbacks

**Incoming:**
- `POST /api/webhooks/btcpay` - BTCPayServer payment status notifications
  - Auth: HMAC-SHA256 signature verification using `BTCPAYSERVER_WEBHOOK_SECRET`
  - Raw body capture: `app.ts` uses custom middleware to preserve raw body for verification
  - Triggers: Payment confirmed, expired, failed states
  - Status: Unconfigured (BTCPayServer integration incomplete)

**Outgoing:**
- `REVIEWER_WEBHOOK_URL` (optional) - Notifies external system of reviewer submissions
  - Location: Referenced in `artifacts/api-server/src/routes/reviewerSubmissions.ts`
  - Implementation status: Unclear — may be unimplemented

**Email Callbacks:**
- No inbound webhooks
- Outbound transactional emails sent via SMTP to:
  - Order confirmation emails
  - Subscription confirmation emails
  - Subscription renewal reminders (dispatched every 24 hours for subscriptions 3-4 days before renewal)
  - Subscription management link emails

## Third-Party Service Dependencies

**None critically operational:**
- BTCPayServer - Optional (payment processing)
- SMTP - Required for email but can be stubbed (logs URLs instead)
- Segment - Optional (analytics)
- Janoshik - Reference-only (no API integration)

---

*Integration audit: 2026-06-22*
