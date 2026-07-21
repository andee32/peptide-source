# Testing Patterns

**Analysis Date:** 2026-06-22

## Test Framework

**Runner:**
- Not configured
- No test framework detected (no jest.config.*, vitest.config.*, @testing-library/*, vitest, jest in any package.json)

**Assertion Library:**
- Not applicable

**Run Commands:**
- No test scripts in workspace root or any workspace package
- `pnpm run typecheck` is the only automated verification command

## Test File Organization

**Location:**
- Not applicable (no test files found)

**Naming:**
- Not applicable

**Structure:**
- Not applicable

## Test Structure

**Suite Organization:**
- Not applicable

**Patterns:**
- Not applicable

## Mocking

**Framework:**
- Not configured

**Patterns:**
- Not applicable

**What to Mock:**
- Not applicable

**What NOT to Mock:**
- Not applicable

## Fixtures and Factories

**Test Data:**
- Seed script exists: `scripts/src/seed.ts` generates test data for database
- Seed includes: 5 peptides, 10 variants, 5 batches, 15 COA results, 3 approved reviewer submissions
- Run with: `pnpm --filter @workspace/scripts run seed`

**Location:**
- `scripts/src/seed.ts` contains all fixture generation

## Coverage

**Requirements:**
- None enforced

**View Coverage:**
- Not applicable

## Test Types

**Unit Tests:**
- Not present

**Integration Tests:**
- Not present

**E2E Tests:**
- Not present

## Current Testing Approach

**TypeScript Typechecking (de facto test):**
- Root command: `pnpm run typecheck`
- Runs: `tsc --build` on libs, then per-workspace checks with `noEmit`
- Full strict mode enabled in `tsconfig.base.json`:
  - `noImplicitAny: true` — every variable must have a type
  - `noImplicitThis: true` — no implicit `this` context
  - `strictNullChecks: true` — null/undefined must be explicit
  - `noImplicitReturns: true` — all code paths must return
  - `noFallthroughCasesInSwitch: true` — switch cases must have breaks
  - `isolatedModules: true` — each file must be valid in isolation

This enforces correctness at compile time without runtime tests.

**Manual Testing:**
- Dev servers run locally with full stack
- Database seed populated manually before testing
- Browser/Postman testing of endpoints
- Email templates previewed in HTML directly

## Verification Strategy

For new code without automated tests, use this approach:

**API Route Changes:**
1. Verify endpoint signature matches OpenAPI spec
2. Validate request bodies with Zod schemas (will fail at runtime if invalid)
3. Test with curl/Postman:
   ```bash
   curl -X GET http://localhost:8080/api/products
   curl -X POST http://localhost:8080/api/orders -H "Content-Type: application/json" -d '{"..." }'
   ```
4. Check database state with `pnpm --filter @workspace/db run studio` (Drizzle Studio)

**Service Function Changes:**
1. Verify signature returns expected type
2. TypeScript compiler will catch wrong parameters
3. Manual smoke test in route that uses service
4. Check logs for errors

**Component Changes:**
1. Start dev server: `pnpm --filter @workspace/storefront run dev`
2. Navigate to component in browser
3. Verify visual output and interactions
4. Check browser console for errors

**Database Schema Changes:**
1. Modify schema in `lib/db/src/schema/*.ts`
2. Run `pnpm --filter @workspace/db run push` to apply migration
3. Seed if needed: `pnpm --filter @workspace/scripts run seed`
4. Verify existing queries still work (TypeScript will catch type mismatches)

## Built-in Type Safety

The codebase relies on TypeScript strict mode as primary correctness mechanism:

**Zod Validation (API Contracts):**
- Request bodies validated via `.safeParse()` in every route
- Generated schemas from OpenAPI ensure consistency
- Type inference from Zod keeps runtime data aligned with types

Example from `products.ts`:
```typescript
const queryResult = ListProductsQueryParams.safeParse(req.query);
if (!queryResult.success) {
  res.status(400).json({ error: "bad_request", message: queryResult.error.message });
  return; // Early return, no bad data proceeds
}
const { category } = queryResult.data; // queryResult.data is typed correctly
```

**Drizzle ORM (Database Correctness):**
- Schema-driven queries prevent SQL injection
- Column names and types must match schema definitions
- Type inference from tables makes query results strongly typed

**React Type Safety:**
- Functional component props typed with interfaces
- Context types prevent misuse of hooks
- Event handlers properly typed

## When to Add Tests

Add automated tests when:
1. **Logic is complex** — business rules with multiple branches (e.g., discount calculation, subscription renewal logic)
2. **Bugs are production-critical** — payment processing, order confirmation, crypto transactions
3. **Regressions are common** — frequently refactored functions

**Low priority for tests:**
- Presentational components (visual regression is caught in browser)
- API route error paths (validation is built in via Zod)
- Simple CRUD endpoints (ORM prevents most SQL bugs)

## Recommended Test Setup

If tests are added later, use this setup:

**Framework:** Vitest (faster than Jest, native ESM support for monorepo)

**Structure:**
```
artifacts/api-server/
├── src/
│   ├── routes/
│   │   ├── products.ts
│   │   └── products.test.ts
│   └── services/
│       ├── email.ts
│       └── email.test.ts
└── vitest.config.ts
```

**Pattern:**
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sendSubscriptionConfirmEmail } from '../services/email';

describe('sendSubscriptionConfirmEmail', () => {
  beforeEach(() => {
    process.env.SMTP_HOST = 'smtp.test.com';
    // Mock nodemailer
    vi.mock('nodemailer');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sends email when SMTP configured', async () => {
    // Test expects email to be sent
  });

  it('logs and returns early when SMTP not configured', async () => {
    delete process.env.SMTP_HOST;
    // Should return early without throwing
  });
});
```

---

*Testing analysis: 2026-06-22*
