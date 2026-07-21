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
prohibit this vertical and freeze funds. `card` has been removed from the payment
enum. ACH is gated off (`VITE_ACH_ENABLED`, backend 503) until real bank details
are provisioned — never show placeholder bank info as authoritative.

**Fail closed:**
- `services/btcpay.ts` must never fabricate a pay-to address when unconfigured — it
  throws `PaymentRailUnavailableError` (503). Do not reintroduce stub addresses.
- Webhook signature verification rejects when `BTCPAYSERVER_WEBHOOK_SECRET` is unset
  and never falls back to the API key; verify over the raw body with
  `timingSafeEqual`; reject before any DB mutation.

**Compliance model:** everything is research-use-only.
- Every order persists a server-side, timestamped RUO attestation record — not a
  client checkbox. `ATTESTATION_TEXT` is placeholder-guarded (server refuses to
  start in production until counsel-approved copy replaces it).
- Per-SKU `complianceStatus` (blocked | restricted | cleared) exists as a dormant
  admin control; per owner decision nothing is gated per-SKU (all `cleared`,
  incl. Retatrutide). Do not re-block SKUs by default.
- Prices are always server-derived; the client never sends a price.
