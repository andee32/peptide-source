import { test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@app/db";
import { ordersTable, paymentRecordsTable } from "@app/db/schema";
import { startTestServer, type TestServer } from "./helpers/server";
import { resetDb } from "./helpers/db";

// Pins the settlement rule for the Pay by Bank rail: an inbound webhook is a
// nudge, never a settlement. Nothing confirms an order unless (a) the callback
// is authentic, and (b) Link itself reports the transaction SUCCEEDED for at
// least the order total, read back over the API. An ACH debit that is merely
// authorized can still be returned days later.

const SECRET = "test-link-webhook-secret";
const TRANSACTION_ID = "txn-1";

let server: TestServer;
let realFetch: typeof globalThis.fetch;

before(async () => {
  server = await startTestServer();
  realFetch = globalThis.fetch;
});
after(async () => {
  globalThis.fetch = realFetch;
  await server.close();
});
beforeEach(async () => {
  await resetDb();
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

/**
 * Intercepts only calls to Link Money's API so the handler's read-back is
 * scripted; the test's own requests to the local server still go out for real.
 */
function stubLinkApi(transaction: Record<string, unknown> | { status: number }) {
  const passthrough = realFetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (!url.includes("link-sandbox.money")) return passthrough(input as never, init);
    if (url.endsWith("/v1/tokens")) {
      return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), {
        status: 200,
      });
    }
    if ("status" in transaction && Object.keys(transaction).length === 1) {
      return new Response("upstream error", { status: transaction.status as number });
    }
    return new Response(JSON.stringify(transaction), { status: 200 });
  }) as typeof globalThis.fetch;
}

async function seedPayByBankOrder(totalCents = 12_500) {
  const orderId = randomUUID();
  await db.insert(ordersTable).values({
    id: orderId,
    sessionId: randomUUID(),
    lineItems: [
      {
        variantId: 1,
        productName: "Test Peptide",
        variantName: "10mg",
        quantity: 1,
        unitPriceCents: totalCents,
      },
    ],
    subtotalCents: totalCents,
    discountCents: 0,
    totalCents,
    paymentMethod: "pay_by_bank",
    status: "awaiting_payment",
    shippingName: "Test Buyer",
    shippingEmail: "buyer@example.test",
    shippingAddress1: "1 Test St",
    shippingCity: "Testville",
    shippingState: "CA",
    shippingZip: "90001",
  });

  const paymentId = randomUUID();
  await db.insert(paymentRecordsTable).values({
    id: paymentId,
    orderId,
    currency: "USD",
    amount: (totalCents / 100).toFixed(2),
    amountCents: totalCents,
    method: "pay_by_bank",
    paymentUrl: "https://link.test/s/1",
    linkSessionKey: "sk_1",
    expiresAt: new Date(Date.now() + 3_600_000),
    status: "pending",
  });

  return { orderId, paymentId, totalCents };
}

function eventBody(eventType: string, orderId: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: randomUUID(),
    creationTime: new Date().toISOString(),
    eventType,
    metadata: {
      resourceId: TRANSACTION_ID,
      resourceType: "payment",
      clientReferenceId: orderId,
      transactionType: "DEBIT",
      ...extra,
    },
  });
}

async function post(body: string, signature: string | null) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (signature !== null) headers["x-link-signature"] = signature;
  return realFetch(`${server.url}/api/webhooks/linkmoney`, {
    method: "POST",
    headers,
    body,
  });
}

function sign(body: string, secret = SECRET) {
  return createHmac("sha256", secret).update(body).digest("hex");
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

test("rejects an unsigned webhook without mutating", async () => {
  const { orderId, paymentId } = await seedPayByBankOrder();

  const res = await post(eventBody("payment.succeeded", orderId), null);

  assert.equal(res.status, 401);
  assert.deepEqual(await statuses(orderId, paymentId), {
    order: "awaiting_payment",
    payment: "pending",
  });
});

test("rejects a signature made with the wrong secret", async () => {
  const { orderId, paymentId } = await seedPayByBankOrder();
  const body = eventBody("payment.succeeded", orderId);

  const res = await post(body, sign(body, "not-the-secret"));

  assert.equal(res.status, 401);
  assert.deepEqual(await statuses(orderId, paymentId), {
    order: "awaiting_payment",
    payment: "pending",
  });
});

test("payment.authorized does not confirm the order", async () => {
  const { orderId, paymentId } = await seedPayByBankOrder();
  const body = eventBody("payment.authorized", orderId);

  const res = await post(body, sign(body));

  assert.equal(res.status, 200);
  assert.deepEqual(await statuses(orderId, paymentId), {
    order: "awaiting_payment",
    payment: "pending",
  });
});

test("payment.succeeded settles once Link confirms SUCCEEDED for the full amount", async () => {
  const { orderId, paymentId, totalCents } = await seedPayByBankOrder();
  stubLinkApi({
    transactionId: TRANSACTION_ID,
    transactionStatus: "SUCCEEDED",
    amount: { value: totalCents / 100, currency: "USD" },
  });
  const body = eventBody("payment.succeeded", orderId);

  const res = await post(body, sign(body));

  assert.equal(res.status, 200);
  assert.deepEqual(await statuses(orderId, paymentId), {
    order: "confirmed",
    payment: "confirmed",
  });
});

test("a redelivered payment.succeeded is a no-op", async () => {
  const { orderId, paymentId, totalCents } = await seedPayByBankOrder();
  stubLinkApi({
    transactionId: TRANSACTION_ID,
    transactionStatus: "SUCCEEDED",
    amount: { value: totalCents / 100, currency: "USD" },
  });
  const body = eventBody("payment.succeeded", orderId);

  await post(body, sign(body));
  const second = await post(body, sign(body));

  assert.equal(second.status, 200);
  assert.equal(
    ((await second.json()) as { settled: boolean }).settled,
    false
  );
  assert.deepEqual(await statuses(orderId, paymentId), {
    order: "confirmed",
    payment: "confirmed",
  });
});

test("does not settle when Link still reports the transaction pending", async () => {
  const { orderId, paymentId, totalCents } = await seedPayByBankOrder();
  stubLinkApi({
    transactionId: TRANSACTION_ID,
    transactionStatus: "PENDING",
    amount: { value: totalCents / 100, currency: "USD" },
  });
  const body = eventBody("payment.succeeded", orderId);

  const res = await post(body, sign(body));

  assert.equal(res.status, 200);
  assert.deepEqual(await statuses(orderId, paymentId), {
    order: "awaiting_payment",
    payment: "pending",
  });
});

test("does not settle a short debit", async () => {
  const { orderId, paymentId, totalCents } = await seedPayByBankOrder();
  stubLinkApi({
    transactionId: TRANSACTION_ID,
    transactionStatus: "SUCCEEDED",
    amount: { value: totalCents / 100 - 1, currency: "USD" },
  });
  const body = eventBody("payment.succeeded", orderId);

  const res = await post(body, sign(body));

  assert.equal(res.status, 200);
  assert.deepEqual(await statuses(orderId, paymentId), {
    order: "awaiting_payment",
    payment: "pending",
  });
});

test("does not settle a non-USD debit", async () => {
  const { orderId, paymentId, totalCents } = await seedPayByBankOrder();
  stubLinkApi({
    transactionId: TRANSACTION_ID,
    transactionStatus: "SUCCEEDED",
    amount: { value: totalCents / 100, currency: "CAD" },
  });
  const body = eventBody("payment.succeeded", orderId);

  const res = await post(body, sign(body));

  assert.equal(res.status, 200);
  assert.deepEqual(await statuses(orderId, paymentId), {
    order: "awaiting_payment",
    payment: "pending",
  });
});

test("503s so Link retries when the transaction cannot be verified", async () => {
  const { orderId, paymentId } = await seedPayByBankOrder();
  stubLinkApi({ status: 500 });
  const body = eventBody("payment.succeeded", orderId);

  const res = await post(body, sign(body));

  assert.equal(res.status, 503);
  assert.deepEqual(await statuses(orderId, paymentId), {
    order: "awaiting_payment",
    payment: "pending",
  });
});

test("payment.failed fails the order without any read-back", async () => {
  const { orderId, paymentId } = await seedPayByBankOrder();
  const body = eventBody("payment.failed", orderId, { achReturnCode: "R03" });

  const res = await post(body, sign(body));

  assert.equal(res.status, 200);
  assert.deepEqual(await statuses(orderId, paymentId), {
    order: "failed",
    payment: "failed",
  });
});

// A second Link transaction naming an order already bound to a different one
// must never be honoured — the read-back would otherwise be pointed at a
// transaction the order never authorised.
test("ignores an event naming a different transaction for the same order", async () => {
  const { orderId, paymentId, totalCents } = await seedPayByBankOrder();
  await db
    .update(paymentRecordsTable)
    .set({ linkPaymentId: "other-transaction" })
    .where(eq(paymentRecordsTable.id, paymentId));
  stubLinkApi({
    transactionId: TRANSACTION_ID,
    transactionStatus: "SUCCEEDED",
    amount: { value: totalCents / 100, currency: "USD" },
  });
  const body = eventBody("payment.succeeded", orderId);

  const res = await post(body, sign(body));

  assert.equal(res.status, 200);
  assert.deepEqual(await statuses(orderId, paymentId), {
    order: "awaiting_payment",
    payment: "pending",
  });
});

test("rejects a request whose raw body was never captured", async () => {
  const { orderId, paymentId } = await seedPayByBankOrder();
  const body = eventBody("payment.succeeded", orderId);

  const res = await realFetch(`${server.url}/api/webhooks/linkmoney`, {
    method: "POST",
    headers: { "Content-Type": "text/plain", "x-link-signature": sign(body) },
    body,
  });

  assert.equal(res.status, 400);
  assert.deepEqual(await statuses(orderId, paymentId), {
    order: "awaiting_payment",
    payment: "pending",
  });
});
