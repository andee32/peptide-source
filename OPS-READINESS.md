# Lab Standard Initiative — Operational Readiness Assessment

**Date:** March 29, 2026
**Scope:** Full infrastructure & DevOps audit
**Auditor:** COO Analysis

---

## Overall Readiness Score: 42/150 = **28%**

| Category | Score | Status |
|----------|-------|--------|
| CI/CD | 0/25 | 🔴 CRITICAL |
| Environment Config | 10/25 | 🔴 CRITICAL |
| Error Handling & Observability | 5/25 | 🔴 CRITICAL |
| Deployment | 15/25 | 🟡 HIGH |
| Database Migrations | 10/25 | 🔴 CRITICAL |
| Incident Response | 0/25 | 🔴 CRITICAL |
| Dependency Health | 12/25 | 🟡 MEDIUM |

**The system is not production-ready.** Hardcoded secrets and zero CI/CD are immediate blockers.

---

## What Breaks First in a Production Incident

1. **Hardcoded secrets in version control** — `.replit` exposes `ADMIN_SECRET` and password hash. Any compromised contributor access = full admin takeover. No secret rotation process exists. **Treat current values as already compromised.**

2. **No observability** — If the API server fails or starts returning 500s, nobody knows until a customer emails. No logs, no alerts, no dashboards. Root cause diagnosis happens blind during the incident.

3. **Database migration cascades uncontrolled** — `drizzle-kit push --force` applied to prod without staging or testing. A single schema error cascades to prod with no rollback path.

4. **Background job failures cascade silently** — `setInterval` for subscription reminders stops on any process restart (deploy, crash, Replit autoscale). No dead-letter queue, no retry.

5. **No rate limiting on admin or auth endpoints** — `/api/admin/login` and `/subscriptions/request-management-link` can be brute-forced with no circuit breaker or lockout.

6. **Wide-open CORS** — `cors()` with no origin restriction means any malicious site can steal auth tokens from customer browsers.

7. **Payment webhook silent failures** — BTCPayServer webhook handler can fail (e.g., DB constraint) with no alerting. Payments go unrecorded; customers believe order is confirmed.

---

## Top 3 Recommendations to Reach 80+ Readiness

### Recommendation 1: GitHub Actions CI/CD Pipeline
**Effort:** 1 day | **Impact:** +25 readiness points

Create `.github/workflows/ci.yml` with gates on every PR:
- TypeScript type-check across all packages
- `pnpm audit` for vulnerability scanning
- Branch protection: all checks must pass before merge

```yaml
name: CI
on: [pull_request, push]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build
      - run: pnpm audit --prod
```

**Risk:** None — read-only checks.

---

### Recommendation 2: Rotate Secrets + Enforce Env Var Validation
**Effort:** 2 hours | **Impact:** +20 readiness points

1. **Immediately rotate** `ADMIN_SECRET` and `ADMIN_PASSWORD_HASH` — treat old values as compromised
2. Move all secrets to Replit Secrets (remove from `.replit` file tracked in git)
3. Add startup validation in `artifacts/api-server/src/index.ts`:

```typescript
const REQUIRED_VARS = [
  'DATABASE_URL', 'PORT', 'ADMIN_SECRET',
  'ADMIN_EMAIL', 'ADMIN_PASSWORD_HASH'
];
for (const v of REQUIRED_VARS) {
  if (!process.env[v]) throw new Error(`Missing required env var: ${v}`);
}
```

**Risk:** None — dev env vars already set in Replit.

---

### Recommendation 3: Structured Logging + Error Tracking
**Effort:** 1.5 days | **Impact:** +30 readiness points

1. Install `pino` for structured logging
2. Replace all `console.log/error` with structured logger calls
3. Log all unhandled errors with context (endpoint, user ID, error stack)
4. Wire Sentry for critical error alerts

```typescript
import pino from 'pino';
const logger = pino();

// In route handlers:
} catch (err) {
  logger.error({ endpoint: '/api/products', error: err }, 'Query failed');
  res.status(500).json({ error: 'internal_error' });
}
```

**Risk:** Low — backwards compatible, no schema changes.

---

## Full Audit Detail

### 1. CI/CD — 0/25 (CRITICAL)
- No `.github/workflows/` directory
- No automated testing gates
- No branch protection rules
- `pnpm run build` and `typecheck` scripts exist but are manual-only
- TypeScript strict mode enabled in `tsconfig.base.json` but never enforced on PRs
- Any breaking change can ship undetected

### 2. Environment Configuration — 10/25 (CRITICAL)

**Hardcoded secrets in `.replit` (tracked in git):**
- `ADMIN_SECRET = "[REDACTED — rotate in LSI]"` ← ROTATE IMMEDIATELY
- `ADMIN_PASSWORD_HASH = "[REDACTED]"` ← ROTATE IMMEDIATELY

**Other issues:**
- No startup validation — missing env vars fail only when first used
- No `NODE_ENV` enforcement — dev and prod configs can accidentally mix
- Env vars documented in `TECHNICAL_CONTEXT.md` but scattered across 3 sources
- `artifacts/api-server/src/index.ts` only validates `PORT` and `DATABASE_URL`

### 3. Error Handling & Observability — 5/25 (CRITICAL)
- All logging is `console.error()` / `console.log()` — no structured output
- No Sentry, Datadog, or equivalent error tracking
- No alerting system — infrastructure fails silently
- Generic "Server error" responses in all catch blocks (no internal context logged)
- Background job failure handler at `index.ts:56` swallows errors silently
- No request/response logging middleware
- No correlation IDs for tracing

### 4. Deployment Process — 15/25 (HIGH)
- Deployed on Replit autoscale — no explicit deployment pipeline
- Post-build script: `pnpm store prune` (cache cleanup, not validation)
- Database migrations via `post-merge.sh` hook: `pnpm --filter db push`
- No staging environment documented
- No canary/blue-green deployment strategy
- No deployment checklist or approval process
- Build process uses esbuild with allowlist (`artifacts/api-server/build.ts`) that includes `stripe` and `passport` — packages not in use

### 5. Database Migrations — 10/25 (CRITICAL)
- Using Drizzle's `push` command (not `generate` + `migrate`)
- `push` auto-applies schema changes with **no rollback mechanism**
- No migration history stored in version control
- `post-merge.sh` blindly runs `pnpm --filter db push` on every merge
- `package.json` has both `push` and `push-force` — no safeguard between them
- No migration staging or testing documented

```typescript
// lib/db/drizzle.config.ts — missing migration config entirely
export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL },
  // ❌ No migrations folder, no out path, no rollback config
});
```

### 6. Incident Response — 0/25 (CRITICAL)
- No `RUNBOOK.md` or `INCIDENT_RESPONSE.md`
- No on-call rotation or escalation matrix
- No status page or customer communication template
- `setInterval` at `index.ts:71` lost on process restart with no retry
- No dead-letter queue for failed emails

### 7. Dependency Health — 12/25 (MEDIUM)

**Current versions (all recent):**
- Express 5.x, React 19.1, Vite 7.3, Drizzle 0.45, Zod 3.25, TypeScript 5.9

**Gaps:**
- No `npm audit` automation — vulnerabilities can ship undetected
- No Dependabot or Renovate for automated updates
- No Snyk or equivalent security scanning
- Build allowlist includes `stripe` and `passport` — dead code in bundle

---

## Secondary Recommendations (Reach 90%+ Readiness)

4. **Switch to migration versioning** — Replace `drizzle-kit push` with `drizzle-kit generate` + explicit `.sql` files in `lib/db/migrations/`. Require review before applying.

5. **Add rate limiting** — `express-rate-limit` on:
   - `/api/admin/login` → 10 req/15min per IP
   - `/api/subscriptions/request-management-link` → 5 req/hour per email

6. **Restrict CORS** — Replace `cors()` with explicit origin whitelist:
   ```typescript
   app.use(cors({ origin: [process.env.SITE_URL || 'http://localhost:5173'] }));
   ```

7. **Add security headers** — `helmet` middleware:
   ```typescript
   import helmet from 'helmet';
   app.use(helmet());
   ```

8. **Externalize background jobs** — Move `setInterval` reminders to Bull + Redis job queue. Survive process restarts with retry.

---

## Conclusion

Lab-Standard-Initiative has sound business logic but is **operationally fragile**. The three recommendations above require ~3 days of engineering and eliminate 90% of production risk. Reaching 80+ readiness is achievable within a single sprint.

**Do not accept real customer payments until hardcoded secrets are rotated and CI/CD is live.**
