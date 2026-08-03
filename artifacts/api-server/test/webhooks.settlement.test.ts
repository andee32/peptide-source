import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { eq } from "drizzle-orm";
import { db, pool } from "@app/db";
import { ordersTable, paymentRecordsTable } from "@app/db/schema";
import { resetDb } from "./helpers/db";
import { seedOrderWithPayment } from "./helpers/factories";
import { signBtcpayBody } from "./helpers/btcpaySig";

// Regression tests for the two settlement bugs:
//
//   1. InvoicePaymentSettled was treated as full settlement. That event fires
//      per individual payment as soon as it confirms on-chain, including a
//      partial one — so a dust payment against a $4,000 invoice confirmed the
//      order and it counted toward confirmed revenue.
//
//   2. The settle UPDATE was unconditional. A redelivered InvoiceSettled — BTCPay
//      retries, or an operator clicks redeliver — walked a REFUNDED order back
//      to confirmed.
//
// A fake BTCPayServer stands in for the real one so the actual fetch path in
// getInvoice() is exercised rather than mocked out.

const SECRET = "test-webhook-secret";

let btcpayReply: { status: number; body: unknown } = {
  status: 200,
  body: {},
};

// Records what the server actually asked BTCPay for, so a implementation that
// fetched the wrong invoice id or dropped the auth header cannot pass.
let lastRequest: { url: string; auth: string | undefined } | null = null;

const fakeBtcpay: HttpServer = await new Promise((resolve) => {
  const s = createServer((req, res) => {
    lastRequest = {
      url: req.url ?? "",
      auth: req.headers.authorization,
    };
    res.writeHead(btcpayReply.status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(btcpayReply.body));
  });
  s.listen(0, () => resolve(s));
});

const btcpayPort = (fakeBtcpay.address() as AddressInfo).port;
process.env.BTCPAYSERVER_URL = `http://127.0.0.1:${btcpayPort}`;
process.env.BTCPAYSERVER_API_KEY = "test-api-key";
process.env.BTCPAYSERVER_STORE_ID = "test-store";
process.env.BTCPAYSERVER_WEBHOOK_SECRET = SECRET;

const { default: app } = await import("../src/app");

let server: Server;
let url: string;

before(async () => {
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
  await new Promise<void>((r, j) => fakeBtcpay.close((e) => (e ? j(e) : r())));
  await pool.end();
});

beforeEach(async () => {
  await resetDb();
  btcpayReply = { status: 200, body: {} };
  lastRequest = null;
});

async function sendWebhook(payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  return fetch(`${url}/api/webhooks/btcpay`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "btcpay-sig": signBtcpayBody(body, SECRET),
    },
    body,
  });
}

async function statuses(orderId: string, paymentId: string) {
  const order = await db.query.ordersTable.findFirst({
    where: eq(ordersTable.id, orderId),
  });
  const payment = await db.query.paymentRecordsTable.findFirst({
    where: eq(paymentRecordsTable.id, paymentId),
  });
  return { order: order?.status, payment: payment?.status };
}

// ── Bug 1: underpayment ──────────────────────────────────────────────────────

test("InvoicePaymentSettled alone never confirms an order", async () => {
  const { orderId, paymentId, invoiceId } = await seedOrderWithPayment({
    totalCents: 400_000,
  });

  const res = await sendWebhook({ type: "InvoicePaymentSettled", invoiceId });

  assert.equal(res.status, 200);
  assert.deepEqual(await statuses(orderId, paymentId), {
    order: "awaiting_payment",
    payment: "pending",
  });
});

test("refuses to settle when BTCPay reports a partial payment", async () => {
  const { orderId, paymentId, invoiceId, totalCents } =
    await seedOrderWithPayment({ totalCents: 400_000 });

  // BTCPay's verdict on an underpaid invoice: still Processing.
  btcpayReply = {
    status: 200,
    body: {
      id: invoiceId,
      status: "Processing",
      additionalStatus: "PaidPartial",
      amount: (totalCents / 100).toFixed(2),
      currency: "USD",
      metadata: { orderId },
    },
  };

  const res = await sendWebhook({ type: "InvoiceSettled", invoiceId });

  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { note: string }).note, "not_settled");
  assert.deepEqual(await statuses(orderId, paymentId), {
    order: "awaiting_payment",
    payment: "pending",
  });
});

test("settles when BTCPay confirms the invoice is Settled", async () => {
  const { orderId, paymentId, invoiceId, totalCents } =
    await seedOrderWithPayment({ totalCents: 400_000 });

  btcpayReply = {
    status: 200,
    body: {
      id: invoiceId,
      status: "Settled",
      amount: (totalCents / 100).toFixed(2),
      currency: "USD",
      metadata: { orderId },
    },
  };

  const res = await sendWebhook({ type: "InvoiceSettled", invoiceId });

  assert.equal(res.status, 200);
  assert.deepEqual(await statuses(orderId, paymentId), {
    order: "confirmed",
    payment: "confirmed",
  });

  // The verification really went to BTCPay, for THIS invoice, authenticated.
  assert.ok(lastRequest, "expected a call out to BTCPayServer");
  assert.ok(
    lastRequest!.url.includes(encodeURIComponent(invoiceId)),
    `expected the invoice id in ${lastRequest!.url}`
  );
  assert.equal(lastRequest!.auth, "token test-api-key");
});

// ── Bug 2: replay ────────────────────────────────────────────────────────────

// The load-bearing test for the order guard. The two cases below seed a
// non-pending payment record, so the PAYMENT guard short-circuits before the
// order UPDATE is reached — meaning they pass even with the order guard deleted.
// Here the payment is genuinely pending, so only the order guard can stop a
// refunded order being confirmed.
test("a settle against a refunded order leaves the order refunded", async () => {
  const { orderId, paymentId, invoiceId, totalCents } =
    await seedOrderWithPayment({
      orderStatus: "refunded",
      paymentStatus: "pending",
      totalCents: 400_000,
    });

  btcpayReply = {
    status: 200,
    body: {
      id: invoiceId,
      status: "Settled",
      amount: (totalCents / 100).toFixed(2),
      currency: "USD",
      metadata: { orderId },
    },
  };

  await sendWebhook({ type: "InvoiceSettled", invoiceId });

  // The payment legitimately settles — money did arrive — but the order must
  // stay refunded rather than being resurrected.
  assert.deepEqual(await statuses(orderId, paymentId), {
    order: "refunded",
    payment: "confirmed",
  });
});

test("an expiry against a refunded order leaves the order refunded", async () => {
  const { orderId, paymentId, invoiceId } = await seedOrderWithPayment({
    orderStatus: "refunded",
    paymentStatus: "pending",
  });

  await sendWebhook({ type: "InvoiceExpired", invoiceId });

  assert.deepEqual(await statuses(orderId, paymentId), {
    order: "refunded",
    payment: "expired",
  });
});

test("refuses to settle an invoice denominated in another currency", async () => {
  const { orderId, paymentId, invoiceId, totalCents } =
    await seedOrderWithPayment({ totalCents: 400_000 });

  btcpayReply = {
    status: 200,
    body: {
      id: invoiceId,
      status: "Settled",
      amount: (totalCents / 100).toFixed(2),
      currency: "EUR",
      metadata: { orderId },
    },
  };

  const res = await sendWebhook({ type: "InvoiceSettled", invoiceId });

  assert.equal(
    ((await res.json()) as { note: string }).note,
    "currency_mismatch"
  );
  assert.deepEqual(await statuses(orderId, paymentId), {
    order: "awaiting_payment",
    payment: "pending",
  });
});

test("a replayed settle does not resurrect a refunded order", async () => {
  const { orderId, paymentId, invoiceId, totalCents } =
    await seedOrderWithPayment({
      orderStatus: "refunded",
      paymentStatus: "confirmed",
      totalCents: 400_000,
    });

  btcpayReply = {
    status: 200,
    body: {
      id: invoiceId,
      status: "Settled",
      amount: (totalCents / 100).toFixed(2),
      currency: "USD",
      metadata: { orderId },
    },
  };

  const res = await sendWebhook({ type: "InvoiceSettled", invoiceId });

  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { settled: boolean }).settled, false);
  assert.deepEqual(await statuses(orderId, paymentId), {
    order: "refunded",
    payment: "confirmed",
  });
});

test("a duplicate settle delivery is a no-op", async () => {
  const { orderId, paymentId, invoiceId, totalCents } =
    await seedOrderWithPayment({ totalCents: 400_000 });

  btcpayReply = {
    status: 200,
    body: {
      id: invoiceId,
      status: "Settled",
      amount: (totalCents / 100).toFixed(2),
      currency: "USD",
      metadata: { orderId },
    },
  };

  const first = await sendWebhook({ type: "InvoiceSettled", invoiceId });
  assert.equal(((await first.json()) as { settled: boolean }).settled, true);

  const second = await sendWebhook({ type: "InvoiceSettled", invoiceId });
  assert.equal(((await second.json()) as { settled: boolean }).settled, false);

  assert.deepEqual(await statuses(orderId, paymentId), {
    order: "confirmed",
    payment: "confirmed",
  });
});

// ── Verification failures ────────────────────────────────────────────────────

test("fails closed when BTCPay cannot be reached", async () => {
  const { orderId, paymentId, invoiceId } = await seedOrderWithPayment();
  btcpayReply = { status: 500, body: { error: "boom" } };

  const res = await sendWebhook({ type: "InvoiceSettled", invoiceId });

  assert.equal(res.status, 503);
  assert.deepEqual(await statuses(orderId, paymentId), {
    order: "awaiting_payment",
    payment: "pending",
  });
});

test("refuses to settle when the invoice belongs to another order", async () => {
  const { orderId, paymentId, invoiceId, totalCents } =
    await seedOrderWithPayment();

  btcpayReply = {
    status: 200,
    body: {
      id: invoiceId,
      status: "Settled",
      amount: (totalCents / 100).toFixed(2),
      currency: "USD",
      metadata: { orderId: "some-other-order" },
    },
  };

  const res = await sendWebhook({ type: "InvoiceSettled", invoiceId });

  assert.equal(((await res.json()) as { note: string }).note, "order_mismatch");
  assert.deepEqual(await statuses(orderId, paymentId), {
    order: "awaiting_payment",
    payment: "pending",
  });
});

test("refuses to settle an invoice raised for less than the order total", async () => {
  const { orderId, paymentId, invoiceId } = await seedOrderWithPayment({
    totalCents: 400_000,
  });

  btcpayReply = {
    status: 200,
    body: {
      id: invoiceId,
      status: "Settled",
      amount: "1.00",
      currency: "USD",
      metadata: { orderId },
    },
  };

  const res = await sendWebhook({ type: "InvoiceSettled", invoiceId });

  assert.equal(((await res.json()) as { note: string }).note, "amount_mismatch");
  assert.deepEqual(await statuses(orderId, paymentId), {
    order: "awaiting_payment",
    payment: "pending",
  });
});

// ── Expiry / invalid still work, and are also guarded ────────────────────────

test("expiry moves a pending order to expired", async () => {
  const { orderId, paymentId, invoiceId } = await seedOrderWithPayment();

  await sendWebhook({ type: "InvoiceExpired", invoiceId });

  assert.deepEqual(await statuses(orderId, paymentId), {
    order: "expired",
    payment: "expired",
  });
});

test("expiry cannot expire an already-confirmed order", async () => {
  const { orderId, paymentId, invoiceId } = await seedOrderWithPayment({
    orderStatus: "confirmed",
    paymentStatus: "confirmed",
  });

  await sendWebhook({ type: "InvoiceExpired", invoiceId });

  assert.deepEqual(await statuses(orderId, paymentId), {
    order: "confirmed",
    payment: "confirmed",
  });
});
