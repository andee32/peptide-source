# Architecture

**Analysis Date:** 2026-06-22

## Pattern Overview

**Overall:** Layered monorepo with API-first separation. Express backend generates OpenAPI spec; frontend consumes generated client via Orval codegen pipeline. Shared schema definitions via Drizzle ORM and Zod.

**Key Characteristics:**
- TypeScript project references enable per-workspace compilation with shared `tsconfig.base.json`
- API spec drives code generation (Orval) for both React Query hooks and Zod schemas
- Data layer (Drizzle) is shared across API and codegen; single source of truth for schema
- Backend routes follow resource-oriented REST; frontend uses React Query for caching and invalidation

## Layers

**Database / Drizzle ORM Layer:**
- Purpose: Define schema, relations, enums, and Zod insert schemas
- Location: `lib/db/src/schema/`
- Contains: `products.ts`, `batches.ts`, `orders.ts`, `subscriptions.ts`, `reviewerSubmissions.ts`
- Depends on: Drizzle, Zod
- Used by: API routes directly; Orval codegen reads schema files for type generation

**API Specification Layer:**
- Purpose: Single source of truth for REST API contract
- Location: `lib/api-spec/openapi.yaml`
- Contains: OpenAPI 3.1 endpoint definitions, request/response schemas, tags
- Depends on: (none — manually maintained)
- Used by: Orval codegen pipeline to generate client and Zod validators

**Generated Client/Validation Layer:**
- Purpose: Auto-generated React Query hooks and Zod schemas from OpenAPI
- Locations: 
  - `lib/api-client-react/src/generated/` — React Query hooks (react-query mode, split output)
  - `lib/api-zod/src/generated/` — Zod schemas and TypeScript types
- Depends on: OpenAPI spec (via Orval)
- Used by: Storefront for API calls; API server routes for request/response validation

**Backend Routes Layer:**
- Purpose: Handle HTTP requests, validate input, query DB, send responses
- Location: `artifacts/api-server/src/routes/`
- Contains: `products.ts`, `batches.ts`, `orders.ts`, `subscriptions.ts`, `admin.ts`, `webhooks.ts`, `reviewerSubmissions.ts`, `health.ts`
- Depends on: Drizzle DB, Zod schemas from `@workspace/api-zod`, services
- Used by: Express app at `/api` mount point

**Backend Services Layer:**
- Purpose: Encapsulate external integrations and business logic
- Location: `artifacts/api-server/src/services/`
- Contains: `btcpay.ts` (crypto payments with fallback stub mode), `email.ts` (SMTP/Nodemailer)
- Depends on: Crypto, Nodemailer, external APIs
- Used by: Routes for payment and email operations

**Frontend Application Layer:**
- Purpose: React 19 SPA with Wouter routing
- Location: `artifacts/storefront/src/`
- Contains: Pages, components, contexts, hooks, utilities
- Depends on: React Query hooks from `@workspace/api-client-react`, Tailwind, shadcn UI
- Used by: Browser entry point at `artifacts/storefront/src/main.tsx`

**Frontend Page Routing:**
- Location: `artifacts/storefront/src/App.tsx`
- Routes: Homepage, product catalog, batch verification, checkout (crypto/card), order confirmation, reviewer submissions, admin (batches/subscriptions/submissions), research kits, subscription management
- Pattern: Wouter `<Switch>` with `/admin/*` prefix routes to `AdminPage`, others to `StorefrontRouter`

**Frontend Context/State:**
- Purpose: App-wide state without Redux
- Locations: `artifacts/storefront/src/contexts/`
- Contains: `CartContext` (localStorage-backed cart), `AnalyticsProvider` (Segment scaffold, cookie-gated)
- Pattern: React Context + local storage sync for cart; QueryClient for server state via React Query

## Data Flow

**Product Catalog Read:**

1. Frontend calls `useListProducts()` hook (auto-generated from OpenAPI)
2. Hook fires `GET /api/products` with optional `?category=X&featured=true` query params
3. Route validates input via `ListProductsQueryParams` (Zod schema from codegen)
4. Route queries `productsTable` filtered by `published=true`, joins variants and latest batch COA
5. Returns `ListProductsResponse` validated against Zod, sent as JSON
6. React Query caches response with default stale time
7. Frontend renders products via `ProductCard` component

**Crypto Order Flow:**

1. Frontend: User adds items to cart (stored in localStorage via `CartContext`)
2. Frontend: Submits cart as `POST /api/orders` with line items, shipping, `paymentMethod: "crypto_btc" | "crypto_usdc"`
3. Backend: Validates via `createOrderSchema`, checks stock, calculates 10% crypto discount
4. Backend: Creates `ordersTable` entry with `status: "pending"`
5. Frontend: Receives order ID, calls `POST /api/orders/:id/crypto-invoice`
6. Backend: Calls `btcpayService.createInvoice()` (real or stub based on env config)
7. Backend: Stores `paymentRecordsTable` entry with invoice, payment address, expiry
8. Frontend: Shows QR code and payment address via `GET /api/orders/:id/payment-qr`
9. BTCPayServer webhook: `POST /api/webhooks/btcpay` with HMAC-SHA256 signature
10. Backend: Verifies signature, updates `paymentRecordsTable.status` to `"confirmed"`, updates `ordersTable.status` to `"confirmed"`

**Subscription Renewal Flow:**

1. Server startup: `index.ts` calls `dispatchReminders()` every 24 hours
2. Query: Find subscriptions with `status: "active"` and `nextBillingDate` between now and 4 days from now
3. For each: Call `sendSubscriptionReminderEmail()` (Nodemailer or no-op if SMTP not configured)
4. Emails include management link to `GET /api/subscriptions/management?token=<accessToken>`
5. Frontend: `CustomerSubscriptionsPage` fetches via `useFetchManagementToken()` hook
6. Token expires in 60 minutes; customer can skip/cancel/pause via `PATCH /api/subscriptions/:id`

**State Management:**

- **Server State:** React Query with default caching; mutations invalidate via tags (`useListProducts`, `useGetProduct`, etc.)
- **Client State:** Cart lives in `CartContext` (localStorage-backed); themes/preferences would go here
- **Auth State:** Not explicit in this phase — subscriptions use email + one-time token in URL query param (no persistent sessions)

## Key Abstractions

**BTCPayService:**
- Purpose: Encapsulate crypto payment creation and webhook verification
- Examples: `artifacts/api-server/src/services/btcpay.ts`
- Pattern: Singleton service with sync check (`isConfigured`); falls back to stub invoices if env vars missing. Stubs generate fake addresses and QR URIs for local dev.

**Zod + OpenAPI Codegen:**
- Purpose: Single source of truth for API contract; eliminates request/response type mismatch
- Examples: `ListProductsQueryParams.safeParse()` in `products.ts` route; generated types in `@workspace/api-zod`
- Pattern: Routes validate input via codegen'd Zod schemas; responses are parsed before sending to ensure conformance

**React Query Hooks:**
- Purpose: Data fetching, caching, mutation handling without Redux
- Examples: `useListProducts()`, `useGetProduct(id)`, generated in `@workspace/api-client-react/src/generated/`
- Pattern: Orval generates split output (one file per operation); custom fetch wrapper at `artifacts/storefront/src/lib/api-client.ts` adds error handling

**Cart Context:**
- Purpose: Ephemeral shopping cart state isolated from server
- Pattern: useState with localStorage side effect via useEffect; no API calls until checkout

## Entry Points

**API Server:**
- Location: `artifacts/api-server/src/index.ts`
- Triggers: `pnpm --filter @workspace/api-server run dev` (tsx watch) or production boot on port 8080
- Responsibilities: Parse PORT env var, import Express app, attach reminder dispatcher, listen

**Express App:**
- Location: `artifacts/api-server/src/app.ts`
- Triggers: Imported by `index.ts`
- Responsibilities: Set up CORS, raw body capture for BTCPay webhook HMAC verification, mount `/api` router, JSON/urlencoded parsing

**API Router:**
- Location: `artifacts/api-server/src/routes/index.ts`
- Triggers: Mounted at `/api` in app.ts
- Responsibilities: Compose sub-routers (health, products, batches, admin, orders, webhooks, reviewerSubmissions, subscriptions)

**Storefront Entry:**
- Location: `artifacts/storefront/src/main.tsx`
- Triggers: Vite dev server or production build
- Responsibilities: Mount React app to `#root`, attach providers (Analytics, Cart, QueryClient)

**App Router:**
- Location: `artifacts/storefront/src/App.tsx`
- Triggers: Rendered by main.tsx
- Responsibilities: Nested Wouter routing — `/admin/*` → AdminPage, else StorefrontRouter with nested public routes

## Error Handling

**Strategy:** Synchronous validation via Zod at route level; async errors logged and returned as JSON error responses.

**Patterns:**

- **Input Validation:** Routes call `Schema.safeParse(req.body | req.params | req.query)`, return 400 with error message if invalid
- **Not Found:** Routes check if resource exists; return 404 with `{ error: "not_found", message: "..." }`
- **Business Logic Errors:** E.g., out-of-stock variants return 400 with specific error code (`error: "out_of_stock"`)
- **External Service Errors:** `btcpayService.createInvoice()` throws on HTTP error; callers catch and return 500
- **Async Email Errors:** `sendSubscriptionReminderEmail()` catches internally, logs, continues (fire-and-forget)
- **Frontend:** React Query treats non-2xx as error; error boundary or per-hook error handling; no global error toast shown in this phase

## Cross-Cutting Concerns

**Logging:**
- Backend: `console.error()` and `console.log()` to stdout (no logger library)
- Pattern: Prefix log messages with context, e.g., `[reminders]`, `[email]`, `listProducts error:`
- Frontend: No logging configured; debug via browser DevTools

**Validation:**
- Backend: Zod schemas from codegen + manual Zod schemas (e.g., `createOrderSchema`) at route level
- Pattern: Always call `.safeParse()` and check `.success` before using data
- Frontend: No explicit validation (trust API responses are well-formed via OpenAPI contract)

**Authentication:**
- Subscriptions: Email + one-time token (URL query param), expires in 60 minutes, no session state
- Admin: `x-admin-key` header matching `ADMIN_SECRET` env var (all admin routes)
- Pattern: Middleware or route-level check for header presence and equality

**Pagination:**
- Not implemented — all endpoints return full result sets (e.g., `GET /products` returns all published products)
- Sorting: Routes use Drizzle `orderBy()`; e.g., products sorted by `id`, variants by price

---

*Architecture analysis: 2026-06-22*
