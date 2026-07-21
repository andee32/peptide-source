# Technology Stack

**Analysis Date:** 2026-06-22

## Languages

**Primary:**
- TypeScript 5.9.2 - All source code, across frontend, backend, and shared libraries
- JavaScript - Runtime for Node.js backend and browser frontend

**Secondary:**
- SQL - Postgres database queries (via Drizzle ORM)

## Runtime

**Environment:**
- Node.js 24 (referenced in `.claude/CLAUDE.md`)

**Package Manager:**
- pnpm (enforced via preinstall hook in `package.json`)
- Lockfile: `pnpm-lock.yaml` present

## Frameworks

**Core:**
- Express.js 5 - HTTP API server at `artifacts/api-server/`, mounted at `/api`, port 8080
- React 19.1.0 - Frontend storefront at `artifacts/storefront/`
- Vite 7.3.0 - Build tool and dev server for React frontend and component sandbox

**Testing:**
- No test framework detected in `package.json` or workspace configs

**Build/Dev:**
- tsx 4.21.0 - TypeScript execution for Node.js dev scripts and builds
- esbuild 0.27.3 - JavaScript bundler for Express server (`artifacts/api-server/build.ts`)
- Drizzle Kit 0.31.9 - Database schema management and migrations
- Orval 8.5.2 - OpenAPI to TypeScript code generator (for API client)

**Routing:**
- Wouter 3.3.5 - Lightweight React router for SPA navigation (storefront)

## Key Dependencies

**Critical:**
- drizzle-orm 0.45.1 - Type-safe ORM for Postgres, core data layer
- pg 8.20.0 - PostgreSQL driver
- zod 3.25.76 - Runtime schema validation (API requests, db output)
- drizzle-zod 0.8.3 - Zod schema generation from Drizzle tables

**Database & Persistence:**
- pg - Postgres client library
- drizzle-orm - ORM with schema definition in `lib/db/src/schema/`

**UI Components:**
- @radix-ui/* (17 sub-packages) - Headless component library for storefront
- tailwindcss 4.1.14 - Utility-first CSS framework
- @tailwindcss/vite 4.1.14 - Vite integration for Tailwind
- @tailwindcss/typography 0.5.15 - Typography plugin
- shadcn/ui components - Pre-styled Radix UI components in `artifacts/storefront/src/components/ui/`
- framer-motion 12.23.24 - Animation library
- lucide-react 0.545.0 - Icon library
- recharts 2.15.2 - React charting library
- embla-carousel-react 8.6.0 - Carousel component
- vaul 1.1.2 - Drawer/modal component
- sonner 2.0.7 - Toast notification library
- react-day-picker 9.11.1 - Date picker component

**Forms & Validation:**
- react-hook-form 7.55.0 - Form state management
- @hookform/resolvers 3.10.0 - Zod resolver for react-hook-form
- input-otp 1.4.2 - OTP input component
- react-icons 5.4.0 - Icon library

**State & Data Fetching:**
- @tanstack/react-query 5.90.21 - Server state management and caching
- @workspace/api-client-react - Generated React Query hooks from OpenAPI (in `lib/api-client-react/`)

**Email:**
- nodemailer 8.0.3 - SMTP client for transactional emails (subscriptions, management links)

**Utilities:**
- qrcode 1.5.4 - QR code generation for batch verification (`GET /api/batches/:id/qr`)
- date-fns 3.6.0 - Date manipulation and formatting
- class-variance-authority 0.7.1 - CSS class composition utility
- clsx 2.1.1 - Classname composition
- tailwind-merge 3.3.1 - Tailwind class merging utility
- next-themes 0.4.6 - Theme management (dark mode)
- cookie-parser 1.4.7 - Cookie parsing middleware
- cors 2 - CORS middleware for Express

**Development Only:**
- @types/* - TypeScript type definitions for all major dependencies
- @vitejs/plugin-react 5.0.4 - React Fast Refresh for Vite
- @replit/vite-plugin-cartographer, @replit/vite-plugin-dev-banner, @replit/vite-plugin-runtime-error-modal - Replit-specific dev plugins

## Configuration

**Environment:**
- Required vars (see `.claude/CLAUDE.md` for comprehensive list):
  - `DATABASE_URL` - Postgres connection string
  - `PORT` - Server port (Express and Vite dev servers)
  - `NODE_ENV` - Development or production
  - `ADMIN_SECRET` - Admin API key for `/api/admin/*` endpoints
  - `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` - Admin login credentials (bcrypt hash)
  - `BTCPAYSERVER_URL`, `BTCPAYSERVER_API_KEY`, `BTCPAYSERVER_STORE_ID`, `BTCPAYSERVER_WEBHOOK_SECRET` - Crypto payment gateway
  - `BTCPAYSERVER_USDC_METHOD` - USDC payment method identifier (defaults to `ETH_USDC20`)
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` - Email delivery
  - `PUBLIC_URL`, `SITE_URL` - URLs for QR codes and email links
  - `REVIEWER_WEBHOOK_URL` - Optional outbound notification endpoint
  - `VITE_SEGMENT_WRITE_KEY` - Segment analytics write key (optional)
  - `BASE_PATH` - Vite base path configuration

**Build:**
- `tsconfig.base.json` - Root TypeScript config (ES2022 target, strict null checks, no unused locals check disabled)
- `tsconfig.json` - Root reference config
- Individual `tsconfig.json` in `artifacts/api-server/`, `artifacts/storefront/`, `scripts/` (uses `references` for workspace build)
- `pnpm-workspace.yaml` - Workspace configuration with catalog and overrides for Darwin-only native binaries

**Database:**
- `lib/db/drizzle.config.ts` - Drizzle configuration pointing to schema in `lib/db/src/schema/index.ts`
- Dialect: `postgresql`

## Platform Requirements

**Development:**
- Node.js 24+
- pnpm 9+ (enforced by preinstall hook)
- macOS preferred (Replit artifacts suggest Darwin-first design)
- `DATABASE_URL` pointing to accessible Postgres instance

**Production:**
- Node.js 24+
- Postgres database
- SMTP server (for transactional emails)
- BTCPayServer instance (optional, falls back to stub invoices if unconfigured)
- Static file hosting or reverse proxy for React build output

---

*Stack analysis: 2026-06-22*
