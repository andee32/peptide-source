---
paths:
  - "artifacts/api-server/src/routes/orders.ts"
  - "artifacts/api-server/src/routes/webhooks.ts"
  - "artifacts/api-server/src/services/**"
  - "lib/db/src/schema/orders.ts"
  - "lib/db/src/schema/attestations.ts"
---

# Payments & compliance invariants (load-bearing — do not regress)

**Payment rails:** crypto-first via BTCPayServer + ACH/wire only. **Never add
Stripe / PayPal / Square / Shopify Payments or generic card processing** — they
prohibit this vertical and freeze funds. `card` is being removed from the payment
enum in Phase 3.

**Fail closed:**
- `services/btcpay.ts` must never fabricate a pay-to address when unconfigured — it
  throws `PaymentRailUnavailableError` (503). Do not reintroduce stub addresses.
- Webhook signature verification rejects when `BTCPAYSERVER_WEBHOOK_SECRET` is unset
  and never falls back to the API key; verify over the raw body with
  `timingSafeEqual`; reject before any DB mutation.

**Compliance gate (Phase 3, HARD launch blocker):**
- Every order persists a server-side, timestamped RUO attestation record — not a
  client checkbox.
- Per-SKU `complianceStatus` (blocked | restricted | cleared): non-cleared SKUs are
  unlisted and unsellable. **Retatrutide stays hard-blocked pending counsel.**
- Prices are always server-derived; the client never sends a price.
