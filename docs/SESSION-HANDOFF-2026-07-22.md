# Session handoff — 2026-07-22

Branch `remediation/payments-email-authz`, **14 commits ahead of main**. `main` is
untouched at `482995a`. Typecheck green across all 4 workspaces; **64 tests, all passing**
(the repo had zero tests at session start).

---

## What landed

### Test harness (was: nothing)

`pnpm --filter @atlab/api-server run test` — scratch DB (`atlab_sourcing_test`), refuses to
drop any database whose name does not end in `_test`. Every fix below was verified by
**deliberately breaking the source and confirming the tests fail**; where a test passed
against both old and new code it is labelled inline as characterisation rather than proof.

### Payment settlement (the money bugs)

| Bug | Was |
|---|---|
| `InvoicePaymentSettled` treated as full settlement | A dust payment against a $4,000 invoice confirmed the order |
| Webhook had no idempotency or terminal guard | A redelivered `InvoiceSettled` walked a **refunded** order back to confirmed |
| Re-POSTing `/crypto-invoice` | Rewound a confirmed order to `awaiting_payment`; on a refunded one, minted a fresh live invoice |
| `confirm-ach` | No status guard, TOCTOU on the payment row — refunded → confirmed in one click |
| `PATCH /admin/orders/:id` | Terminal check read a stale SELECT; concurrent refund silently overwritten |

Settlement now re-reads the invoice from BTCPay and requires its own `Settled` verdict,
plus matching order id, USD denomination and amount. Status predicates live on the UPDATE,
not only on a preceding read. `SETTLEABLE_ORDER_STATUSES` is the complement of terminal —
narrowing it further stranded legitimate late payments rather than preventing bad ones.

### Admin auth

- `/admin/login` no longer emits `ADMIN_SECRET`. It leaked on a **transient DB error**, not
  just an empty table: with the pool killed, login returned `200 {"token":"test-admin-secret"}`.
  Now 503s, and the bootstrap path mints a real revocable session.
- Password change, operator create, and deactivate all require the caller to re-authenticate
  with their **own** password. `currentPassword` used to be optional and was checked against
  the *target's* hash, so the attack was simply to omit it.
- `GET /orders/:id/payment-qr` was the one handler in `orders.ts` with no authorization.

### Catalogue accuracy

All 27 listings were AI-generated and never checked. Verdict: **10 accurate, 12 imprecise,
4 unverifiable, 1 wrong**. Full findings in `docs/CATALOGUE-ACCURACY-REVIEW.md`. Corrections
applied to **both the DB and `seed.ts`** — patching only the DB would be undone by a reseed.

### Zelle

Wholesale-only rail, gated four ways: retail rejected server-side, account must be `approved`
at request time (tokens are never rotated), fails closed until `ZELLE_RECIPIENT` +
`ZELLE_RECIPIENT_NAME`, handle format-validated.

---

## STILL OPEN

### 1. Schema drift — `drizzle push` is currently unsafe

**The highest-priority item here.** `pnpm --filter @atlab/db run push` wants to drop:

- `discount_codes` (1 row)
- `orders.crypto_discount_cents` (**5 rows of live data**)
- `store_settings.crypto_discount_bps`

These are LSI-era leftovers the fork stopped using but never removed from the DB. CLAUDE.md
documents `push` as the migration mechanism, so anyone following the docs and answering "yes"
loses that data. The Zelle enum was added with `ALTER TYPE` to route around it.

Resolve by either declaring the columns in the schema or dropping them deliberately after
confirming they are dead. Not done here because destroying columns with data is the owner's call.

### 2. Transactional email — the original task, not started

Still zero email anywhere. No order confirmation on any channel; the wholesale access token is
shown once at apply and is unrecoverable. Blocked on one decision:

- **SES or nodemailer?** The owner chose AWS SES SDK; the planning swarm cut it, arguing
  nodemailer already works and the swap fixes no defect. Unresolved.

Prerequisite regardless: an ESP account with an authenticated sending domain (DKIM, SPF-aligned
MAIL FROM, DMARC). Without it every email silently goes nowhere.

Note two mail-triggering endpoints are unauthenticated and unrate-limited
(`POST /subscriptions/request-management-link`, `POST /subscriptions`) — they can be looped to
mail-bomb an inbox from the project's own sending identity. Fix before the first real send, or
domain reputation burns on day one.

### 3. Remaining security sequence

From the 24-commit plan, still to do:

- **seq 11** — `trust proxy`. Currently every RUO attestation records the proxy's IP rather than
  the buyer's, and the login limiter loses its IP dimension behind a proxy. Needs
  `TRUST_PROXY_HOPS` set to the real hop count (never `true` — that lets a client forge the
  attestation IP).
- **seq 12** — rate-limit mail-triggering endpoints; close `GET /subscriptions?email=`, which is
  unauthenticated and returns any person's name, plan and next shipment date.
- **seq 13–24** — batched codegen, additive schema push, email templates, password reset,
  wholesale session/claim-link migration.

### 4. Deferred review findings

- `subscriptions.ts` falls back to a **hardcoded signing key** (`lab-mgmt-token-dev-only-insecure`)
  whenever `NODE_ENV !== "production"`. Any deploy that forgets `NODE_ENV` gets forgeable
  management links for every customer.
- `confirm-ach` selects any pending payment record with no filter on `method` — pre-existing,
  admin-gated, but it now also covers Zelle.
- PBKDF2 is 100k iterations, below current OWASP guidance. Migrating needs a versioned hash
  format since `ADMIN_PASSWORD_HASH` encodes no cost parameter.
- No admin audit table. Actor trail for password changes is `console.log` only.

### 5. Owner / counsel decisions

| Item | Status |
|---|---|
| Counsel-approved `ATTESTATION_TEXT` | **Hard launch blocker** — server refuses to boot in production while placeholder |
| Real ACH bank details | Rail 503s until provisioned |
| Real BTCPay credentials | Fails closed until then; after the settlement fix, staging can no longer fake a settle by POSTing a signed body |
| `ZELLE_RECIPIENT` + `ZELLE_RECIPIENT_NAME` | Rail 503s until both set |
| Refund policy | Should refunding a non-`confirmed` order 409? Policy, not a bug — **not implemented** |
| Five products are the active ingredient of an approved drug | Tirzepatide, SS-31/elamipretide, PT-141, MT-1, Tesamorelin — materially different legal posture |
| Reported FDA PCAC meeting 23–24 Jul 2026 | Covers BPC-157, KPV, TB-500, MOTS-c, Semax, Epitalon — **unverified at primary source**, worth checking directly |
| Category taxonomy | `longevity` / `recovery` / `cognitive` are outcome words used as customer-facing headings |

### 6. Catalogue gaps

- **Retail prices are synthetic.** Every single-vial price is `kit × 0.38` — verified: 37 pairs,
  exactly **one** distinct discount value (74%) across all of them. Real pricing never looks
  like that. Currently live on `/retail`.
- **Blend per-component masses unknown.** All three defer to "per lot COA". Two independent
  third-party COAs both diverge from the 50/10/10(/10) market convention, and from each other —
  so the convention is marketing, not a specification.
- **GLOW and KLOW compositions are owner-asserted**, not independently verified. Wolverine was
  confirmed directly (BPC-157 + TB-500).
- All COA/batch data remains fabricated seed data flagged `isDemo`.

### 7. Housekeeping

- **123 untracked `" 2.ts"` files** in `lib/api-zod/src/generated/` and
  `lib/api-client-react/src/generated/`. Verified stale (dated 21 Jul, identical content,
  nothing imports them). Safe to delete; left in place because they predate this session.
- Three inactive rows in `admin_users` from security testing: `ops2@atlab.test`,
  `ops3@atlab.test`, `sec-test-victim@example.com`. Harmless (auth re-checks `isActive`) but
  worth removing before launch.
- **One unexplained test run** reported 6 failures that did not reproduce across 8 subsequent
  runs. The suite is not yet proven deterministic. Watch for it.

---

## Working notes

- Two security-review subagents produced **fabricated findings** with specific file paths, line
  numbers and quoted code for files that do not exist. Verify every finding against the tree
  before acting. The same reviews also caught four real bugs the author missed, including a
  guard that was never exercised by its own tests — so they are worth running, and worth checking.
- After any codegen, restart the storefront and `rm -rf artifacts/storefront/node_modules/.vite`
  or Vite serves a stale module graph.
- Use `preview_start`, not raw bash — raw launches orphan port 8080. One such orphan was found
  and killed this session; it had been serving stale code for 3 hours.
