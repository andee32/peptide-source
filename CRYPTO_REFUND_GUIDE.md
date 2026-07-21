# Manual Crypto Refund Process

This guide covers how to process refunds for orders paid via Bitcoin (BTC) or USDC on The Lab Standard platform.

## When Refunds Are Issued

Refunds may be issued in the following scenarios:
- Order cancelled before shipment
- Product out of stock after payment confirmed
- Damaged or incorrect item received
- Chargeback / dispute resolution

## Prerequisites

- Admin access to the database (`ADMIN_SECRET` environment variable)
- Access to the BTCPayServer dashboard (for orders with a live BTCPay invoice)
- The customer's refund wallet address (obtained directly from the customer — never reuse the payment address)

## Step 1: Locate the Order

```bash
# Via psql or any PostgreSQL client
SELECT o.id, o.status, o.total_cents, o.payment_method, o.shipping_email,
       p.currency, p.amount, p.payment_address, p.tx_hash, p.status as payment_status
FROM orders o
LEFT JOIN payment_records p ON p.order_id = o.id
WHERE o.id = '<order-uuid>';
```

Note the `payment_method` (crypto_btc or crypto_usdc), `total_cents`, and `tx_hash`.

## Step 2: Determine Refund Amount

The original charge was already discounted by 10% (Transparency Discount). Refunds are issued at the **crypto amount actually received**, not at the original USD subtotal.

**BTC refund amount**: Use the `amount` column from `payment_records` (e.g. `0.00052929 BTC`).

**USDC refund amount**: Use the `amount` column from `payment_records` (e.g. `44.99`).

For partial refunds, calculate the proportional crypto amount:
```
refund_crypto = original_crypto_amount × (refund_usd / total_usd_paid)
```

## Step 3: Obtain Customer Refund Address

Contact the customer at their `shipping_email` and request:
- **For BTC**: A native SegWit (`bc1q...`) or SegWit (`3...`) receiving address
- **For USDC**: An Ethereum wallet address (`0x...`)

**Never send funds to the original payment address** — that address may be derived from a BTCPayServer hot wallet and is not controlled by the customer.

## Step 4: Send the Refund

### Via BTCPayServer Dashboard (recommended)

1. Log into BTCPayServer → Stores → Pull Payments
2. Create a new Pull Payment for the amount and currency
3. Share the pull payment link with the customer so they can enter their address

### Via direct wallet transfer

If you have direct access to the hot wallet:

**BTC**: Use your wallet software or `bitcoin-cli` to send:
```bash
bitcoin-cli sendtoaddress "<customer_bc1q_address>" <btc_amount>
```

**USDC (Ethereum)**: Use MetaMask or another EVM wallet to transfer the USDC token amount to the customer's `0x` address.

## Step 5: Update the Database

Once the refund transaction broadcasts, record it:

```sql
UPDATE orders
SET status = 'refunded', updated_at = NOW()
WHERE id = '<order-uuid>';

INSERT INTO payment_records (
  id, order_id, btcpay_invoice_id, currency, amount, amount_cents,
  payment_address, tx_hash, status, expires_at, created_at
) VALUES (
  gen_random_uuid(),
  '<order-uuid>',
  NULL,
  '<BTC|USDC>',
  '<refund_crypto_amount>',
  <refund_usd_cents>,
  '<customer_refund_address>',
  '<refund_tx_hash>',
  'confirmed',
  NOW() + INTERVAL '1 year',
  NOW()
);
```

> **Note**: `refunded` is not currently a DB enum value. Add it to `orderStatusEnum` in `lib/db/src/schema/orders.ts` and run `pnpm --filter @workspace/db push` before using it, or simply leave the order in its current state with a note in your support system.

## Step 6: Notify the Customer

Send a confirmation email including:
- The refund transaction hash (for on-chain verification)
- The blockchain explorer link:
  - BTC: `https://mempool.space/tx/<tx_hash>`
  - USDC: `https://etherscan.io/tx/<tx_hash>`
- Expected settlement time (BTC: 1–3 confirmations ~10–30 min, USDC: ~15 seconds on Ethereum mainnet)

## Refund Timeline SLA

| Payment Method | Typical Refund Time |
|---|---|
| BTC (on-chain) | Same business day (if address received) |
| USDC (Ethereum) | Same business day (if address received) |

## Escalation

If a customer has not provided a refund address within 30 days, treat the refund as forfeited per the Terms of Service. If legal action or chargebacks arise, document the refund attempts and preserve the original `tx_hash` as proof of payment.

---

*For internal use only. Last updated: March 2026.*
