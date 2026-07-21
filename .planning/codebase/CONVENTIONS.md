# Coding Conventions

**Analysis Date:** 2026-06-22

## Naming Patterns

**Files:**
- Components: PascalCase (e.g., `ProductCard.tsx`, `AdminPage.tsx`)
- Utilities: camelCase (e.g., `utils.ts`, `email.ts`, `btcpay.ts`)
- Routes: camelCase (e.g., `products.ts`, `webhooks.ts`, `admin.ts`)
- Hooks: camelCase with `use` prefix (e.g., `use-mobile.tsx`, `use-toast.ts`)
- Schemas: PascalCase + suffix (e.g., `products.ts`, `orders.ts`, `subscriptions.ts`)

**Functions:**
- camelCase throughout (e.g., `sendSubscriptionConfirmEmail`, `getTransport`, `verifyBtcpaySignature`)
- Async functions same as sync (no suffix) (e.g., `async function dispatchReminders()`)
- Private functions at module level (no underscore prefix): `function adminAuth(...)`
- Internal helpers in services: `getTransport()` (internal, not exported)
- Event handlers: descriptive name starting with verb (e.g., `onChange`, `handleClick`)

**Variables:**
- camelCase (e.g., `cartItems`, `latestBatch`, `purityPercent`)
- Constants: UPPER_SNAKE_CASE (e.g., `TWENTY_FOUR_HOURS`, `MOBILE_BREAKPOINT`, `FROM`, `SITE_URL`)
- Boolean flags: prefixed with `is` or `has` (e.g., `isLoading`, `isMobile`, `inStock`, `featured`)
- Template/Config imports: UPPER_CASE (e.g., `FROM` for email constant)

**Types:**
- Interfaces: PascalCase with `Type` suffix when used for function context (e.g., `CartContextType`, `ButtonProps`)
- Standalone interfaces: PascalCase (e.g., `SubscriptionConfirmEmailData`, `ManagementLinkEmailData`)
- Discriminated unions: match payload structure (e.g., `type: "InvoiceSettled" | "InvoicePaymentSettled"`)
- Enum types: PascalCase (e.g., `categoryEnum`, `batchStatusEnum`)
- Generic constraints: T, U, K patterns standard

## Code Style

**Formatting:**
- Prettier ^3.8.1 (configured in `package.json` root; no config file present)
- Line length default (80 chars inferred from code samples)
- Single quotes for strings (see `email.ts`, `products.ts`)
- Trailing commas in objects/arrays when multiline
- Space after `if/for/while` keywords

**Linting:**
- No ESLint config detected
- TypeScript strict mode enforced via `tsconfig.base.json`
- Type checking: `noImplicitAny: true`, `noImplicitThis: true`, `strictNullChecks: true`
- Return type inference: explicit return types on exported functions (see `sendSubscriptionConfirmEmail(): Promise<void>`)

## Import Organization

**Order:**
1. Third-party framework imports (e.g., `express`, `React`, `drizzle-orm`)
2. Type-only imports (marked with `type` keyword)
3. Internal workspace packages (`@workspace/*`)
4. Relative imports (e.g., `./routes`, `@/components`)

**Examples:**

Express route file (`products.ts`):
```typescript
import { Router, type IRouter } from "express";
import { eq, asc, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { productsTable, categoryEnum } from "@workspace/db/schema";
import { ListProductsQueryParams, ListProductsResponse } from "@workspace/api-zod";
```

React component (`App.tsx`):
```typescript
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { CartProvider } from "@/contexts/cart";
import { HomePage } from "@/pages/HomePage";
```

**Path Aliases:**
- `@/` → `artifacts/storefront/src/` (storefront only)
- `@workspace/*` → workspace packages in `lib/` or `artifacts/`

## Error Handling

**HTTP Routes (Express):**
- Immediate early returns on validation failure: `if (!result.success) { res.status(400)... return; }`
- Standard error shape: `{ error: string, message: string }`
- Error codes: `"bad_request"`, `"not_found"`, `"unauthorized"`, `"internal_error"`, `"not_configured"`
- Validation with Zod: `safeParse()` first, check `.success` property
- Database errors: catch in try-catch, log with context, return 500

Pattern from `products.ts`:
```typescript
const queryResult = ListProductsQueryParams.safeParse(req.query);
if (!queryResult.success) {
  res.status(400).json({ error: "bad_request", message: queryResult.error.message });
  return;
}
const { category } = queryResult.data;
```

**Services (Email, BTC Pay):**
- Graceful degradation: services return early if config is missing
- Log degradation: `console.log("[email] SMTP not configured — skipping...")`
- Never throw in service functions; return void or Promise<void>
- Async operation failures caught but not re-thrown: `.catch((err) => console.error(...))`

Pattern from `email.ts`:
```typescript
function getTransport(): Transporter | null {
  const host = process.env.SMTP_HOST;
  // ...
  if (!host || !user || !pass || !from) return null;
  return createTransport({ ... });
}

export async function sendSubscriptionConfirmEmail(data): Promise<void> {
  const transport = getTransport();
  if (!transport) {
    console.log(`[email] SMTP not configured — skipping confirm email to ${data.to}`);
    return;
  }
  // Send logic
}
```

**React Components:**
- Context consumers throw if provider missing: `throw new Error("useCart must be used within a CartProvider")`
- No try-catch in event handlers; let errors bubble to boundary

## Logging

**Framework:** `console.*` only (no third-party logger)

**Patterns:**
- Prefixed with module/feature in brackets: `[email]`, `[reminders]`, `[webhooks]`
- `console.log()` for info/degradation: `console.log("[email] SMTP not configured...")`
- `console.error()` for exceptions: `console.error("[reminders] Dispatch error:", err)`
- Log level indicated by method name (log vs error)
- Full error objects passed to error logs for stack traces

From `index.ts`:
```typescript
console.log(`[reminders] Dispatched ${upcoming.length} 3-day renewal reminders`);
console.error("[reminders] Dispatch error:", err);
```

From route error handling:
```typescript
console.error("listProducts error:", err);
res.status(500).json({ error: "internal_error", message: "Server error" });
```

## Comments

**When to Comment:**
- Explain why, not what: `// @replit: no hover, and add primary border` (why design decision)
- Technical context: `// Our exports make assumptions about the title of the API being "Api"`
- Non-obvious logic only (rare in this codebase)

**JSDoc/TSDoc:**
- Not used; explicit TypeScript types replace inline docs
- Function signatures include parameter and return types

Pattern (no JSDoc observed):
```typescript
export async function sendSubscriptionConfirmEmail(
  data: SubscriptionConfirmEmailData
): Promise<void> {
  // Type annotation is the documentation
}
```

## Function Design

**Size:** 
- Most functions 20-50 lines (average observed)
- Routes: 20-40 lines per endpoint
- Service functions: 30-100 lines (email templates inflate size)
- UI components: 50-150 lines (render + state)

**Parameters:**
- Named objects over multiple positional args (see `SubscriptionConfirmEmailData`)
- Destructure in function signature when simple: `({ children }: { children: React.ReactNode })`
- Optional parameters marked with `?` in types

**Return Values:**
- Explicit return types always on exported functions
- Promise<T> for async; void for side-effect only
- Validation layers return `{ success: true; data: T } | { success: false; error: ... }`
- Services return early (not null returns); void for fire-and-forget

## Module Design

**Exports:**
- Default export for page components: `export default App`
- Named exports for utility functions: `export async function sendSubscriptionConfirmEmail(...)`
- Type exports marked with `export type`: `export type CartItem = { ... }`
- Mixed named and default exports acceptable (routes use default, types use named)

**Barrel Files:**
- Root schema index re-exports all tables: `lib/db/src/schema/index.ts` exports from each file
- Component UI barrel: `ui/` folder, no barrel file observed (direct imports from `ui/button.tsx`)
- Page barrel not used; direct imports from `pages/`

Pattern from `lib/db/src/schema/index.ts`:
```typescript
// Re-exports all tables and types for single-line imports
export { productsTable, insertProductSchema, type Product } from "./products";
export { batchesTable, ... } from "./batches";
```

**Relationships:**
- One responsibility per file
- Related concerns grouped by feature (e.g., all subscription code in `subscriptions.ts`)
- Schema + types + Zod schema in same file (see `products.ts`)
- Drizzle relations in same file as tables

---

*Convention analysis: 2026-06-22*
