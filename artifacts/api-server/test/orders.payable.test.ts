import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "@atlab/db";
import { ordersTable, paymentRecordsTable } from "@atlab/db/schema";
import { startTestServer, type TestServer } from "./helpers/server";
import { resetDb } from "./helpers/db";
import { seedOrderWithPayment } from "./helpers/factories";

// Minting a payment instrument also sets the order to awaiting_payment. Without
// a status check that is a way to walk a settled order backwards: a buyer who
// holds their own order's capability URL re-POSTs /crypto-invoice on a CONFIRMED
// order, it drops out of confirmed revenue and reads as unpaid to ops. On a
// REFUNDED order it also mints a fresh live invoice — combined with the ACH
// confirm path, a complete refund reversal.

let server: TestServer;

before(async () => {
  server = await startTestServer();
});
after(async () => {
  await server.close();
});
beforeEach(async () => {
  await resetDb();
});

function mintInvoice(orderId: string) {
  return fetch(`${server.url}/api/orders/${orderId}/crypto-invoice`, {
    method: "POST",
  });
}

async function orderStatus(orderId: string) {
  const row = await db.query.ordersTable.findFirst({
    where: eq(ordersTable.id, orderId),
  });
  return row?.status;
}

async function paymentCount(orderId: string) {
  const rows = await db
    .select()
    .from(paymentRecordsTable)
    .where(eq(paymentRecordsTable.orderId, orderId));
  return rows.length;
}

test("a confirmed order cannot be walked back to awaiting_payment", async () => {
  const { orderId } = await seedOrderWithPayment({
    orderStatus: "confirmed",
    paymentStatus: "confirmed",
  });

  const res = await mintInvoice(orderId);

  assert.equal(res.status, 409);
  assert.equal(await orderStatus(orderId), "confirmed");
  assert.equal(await paymentCount(orderId), 1, "no new payment record");
});

test("a refunded order cannot be given a fresh invoice", async () => {
  const { orderId } = await seedOrderWithPayment({
    orderStatus: "refunded",
    paymentStatus: "confirmed",
  });

  const res = await mintInvoice(orderId);

  assert.equal(res.status, 409);
  assert.equal(await orderStatus(orderId), "refunded");
  assert.equal(await paymentCount(orderId), 1, "no new payment record");
});

// The guard must not be so tight that it breaks legitimate retries: an expired
// invoice is exactly the case where a buyer needs a new one.
//
// BTCPAYSERVER_URL is set to an unresolvable host in the test env, so the mint
// gets past the guard and then fails at the network call. That surfaces as a 500
// from Express's default handler (createInvoice throws a plain TypeError, not
// PaymentRailUnavailableError, because the rail IS configured — just
// unreachable). Asserting the exact code keeps this honest: 500 means the guard
// allowed it through, 409 would mean the guard rejected it.
test("an expired order can still be paid", async () => {
  const { orderId } = await seedOrderWithPayment({
    orderStatus: "expired",
    paymentStatus: "expired",
  });

  const res = await mintInvoice(orderId);

  assert.equal(res.status, 500, "expected to pass the guard and fail at BTCPay");
  assert.equal(await orderStatus(orderId), "expired");
  assert.equal(await paymentCount(orderId), 1, "no record written on failure");
});

// ── payment-qr ───────────────────────────────────────────────────────────────

test("payment-qr serves a code for a live guest invoice", async () => {
  const { orderId } = await seedOrderWithPayment({ paymentStatus: "pending" });

  const res = await fetch(`${server.url}/api/orders/${orderId}/payment-qr`);

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/png");
});

test("payment-qr does not serve a code for a settled invoice", async () => {
  const { orderId } = await seedOrderWithPayment({
    orderStatus: "confirmed",
    paymentStatus: "confirmed",
  });

  const res = await fetch(`${server.url}/api/orders/${orderId}/payment-qr`);

  // A scannable code for an invoice that can no longer be credited invites a
  // payment nobody will receive.
  assert.equal(res.status, 404);
});

test("payment-qr 404s for an unknown order", async () => {
  const res = await fetch(
    `${server.url}/api/orders/00000000-0000-0000-0000-000000000000/payment-qr`
  );
  assert.equal(res.status, 404);
});

// A pending order with a live pending invoice takes the idempotency
// short-circuit and never reaches the guard, so this only pins that the retry
// path still returns the existing invoice rather than minting a second one.
test("a pending order with a live invoice returns the existing one", async () => {
  const { orderId } = await seedOrderWithPayment({
    orderStatus: "pending",
    paymentStatus: "pending",
  });

  const res = await mintInvoice(orderId);

  assert.equal(res.status, 200);
  assert.equal(await paymentCount(orderId), 1, "no duplicate invoice minted");
});
