# Executive Summary — Lab Standard Initiative
**Date:** 2026-03-29
**Prepared by:** COO
**For:** Founder

---

## 1. Overall Status

The product is **feature-complete at ~75% but not shippable** — the payment and order infrastructure carries active financial risk (fake BTC addresses, duplicate payment records), and the Skeptical First-Timer persona (the hardest conversion challenge) has a 50% readiness score with zero onboarding support.

---

## 2. Top 5 Cross-Cutting Risks

| # | Risk | Owner | Severity |
|---|------|-------|----------|
| 1 | **Fake BTC addresses silently issued in fallback path** — customers send real money to unspendable addresses; unrecoverable funds, immediate chargeback/dispute exposure | CTO | CRITICAL |
| 2 | **Zero test coverage on payment, billing, and order state machine** — any deploy can silently break the revenue path; no CI gate means this ships undetected | CTO | CRITICAL |
| 3 | **Janoshik API never called** — the core trust mechanism (third-party lab verification) is theatre; reviewer submissions validate format only, making the entire COA verification story a liability if discovered | CTO + CPO | CRITICAL |
| 4 | **Batch not linked to orders** — customers cannot verify which batch they received, which breaks the fundamental product promise of traceability and undermines the QR/COA feature | CTO + CPO | HIGH |
| 5 | **No cancel subscription in UI** — subscription endpoint exists but is unreachable; any subscriber who wants to cancel must contact support or dispute via their payment provider, creating churn and chargeback risk | CPO | HIGH |

---

## 3. Top 3 Highest-Leverage Actions

### Action 1 — Kill the Fake BTC Fallback
**Owner:** CTO
**What:** Remove or hard-fail `generateStubBtcAddress`. If BTCPay is unavailable, the BTC payment path must throw an explicit error — never silently generate an unspendable address.
**Expected Outcome:** Eliminates the single highest financial liability in the codebase. Zero cost to fix; infinite cost if it ships.
**Effort:** 2 hours

---

### Action 2 — Wire the Janoshik API
**Owner:** CTO (backend integration) + CPO (UX state for pending/verified/failed)
**What:** Replace the format-only validator with a real Janoshik API call. Surface verification status (pending, verified, failed) in the reviewer submission flow and on product COA display.
**Expected Outcome:** The product's core trust claim becomes real. Without this, the COA verification feature is a compliance and reputational liability, not an asset.
**Effort:** 6–8 hours (API integration + UI states)

---

### Action 3 — Add Cancel Subscription + Batch-to-Order Linkage
**Owner:** CPO (UI wiring) + CTO (batch assignment logic)
**What:** (a) Surface the existing cancel endpoint in the subscription dashboard. (b) Assign a batch ID at order fulfillment and include it in order confirmation emails.
**Expected Outcome:** Removes the most likely support escalation path (cancel request), closes the traceability gap in the product promise, and directly unblocks the Systematic Biohacker persona (60% → ~80%).
**Effort:** ~3.5 hours combined

---

## 4. Proposed 2-Week Sprint

### Sprint 1 — Week 1: Remove Risk, Ship Trust
*Goal: Eliminate financial/legal exposure and make the core product promise real.*

| Task | Owner | Priority |
|------|-------|----------|
| Remove fake BTC fallback — hard fail if BTCPay unavailable | CTO | P0 |
| Fix race condition in order→payment record creation | CTO | P0 |
| Wire Janoshik API in reviewer submission flow | CTO | P0 |
| Add Zod validation on all webhook payloads | CTO | P1 |
| Add DB indexes on all foreign keys | CTO | P1 |
| Cancel subscription button in UI | CPO | P0 |
| Batch assignment to orders + order confirmation email with batch ID | CPO + CTO | P1 |

---

### Sprint 2 — Week 2: Stabilize Infrastructure + Open Acquisition
*Goal: Establish a safety net for deploys and close the onboarding gap for skeptics.*

| Task | Owner | Priority |
|------|-------|----------|
| Set up CI/CD pipeline with type-check gate and npm audit | CTO | P0 |
| Write tests for payment path, webhook handler, order state machine | CTO | P0 |
| Validate env vars at startup (fail fast if misconfigured) | CTO | P1 |
| Lock CORS to allowed origins (remove wildcard) | CTO | P1 |
| "What is Janoshik?" product education explainer (FAQ/modal) | CPO | P1 |
| Purity badge on product cards | CPO | P2 |
| Auto-fill subscription management link in transactional emails | CPO | P2 |
| Fix unbounded concurrent email dispatch in subscription reminders | CTO | P1 |

---

## 5. Launch Readiness Gate

**No public marketing begins until all of the following are true:**

- [ ] **BTC fallback removed** — `generateStubBtcAddress` is dead code or throws; confirmed in code review
- [ ] **Janoshik API is live** — reviewer submissions make a real external API call; verified in staging
- [ ] **Payment path has test coverage** — webhook handler, billing logic, and order state machine have passing tests
- [ ] **CI/CD pipeline is active** — every push runs type-check, tests, and npm audit; no deploy bypasses it
- [ ] **Cancel subscription is reachable in UI** — any logged-in subscriber can self-serve cancel in under 3 clicks
- [ ] **Batch linked to orders** — every fulfilled order has a batch ID and it appears in confirmation email
- [ ] **Skeptical First-Timer score reaches 65%+** — requires Janoshik explainer and purity badge at minimum

**Target gate date:** End of Sprint 2 (2 weeks from sprint start)

---

*Personas ready to acquire on day-1 launch: Crypto-Native Researcher (80%), Longevity Researcher (75%). Hold paid acquisition for Systematic Biohacker and Skeptical First-Timer until gate is cleared.*
