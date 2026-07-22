import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "@atlab/db";
import { ordersTable, paymentRecordsTable } from "@atlab/db/schema";
import { startTestServer, type TestServer } from "./helpers/server";
import { resetDb } from "./helpers/db";
import { seedOrderWithPayment } from "./helpers/factories";

// The BTCPay webhook refuses to move an order out of a terminal status. That
// guard is worth nothing if an admin endpoint can do it instead, so these pin
// the same rule on the ACH settle and refund paths.
//
// Both endpoints previously did SELECT-then-UPDATE with no predicate on the
// UPDATE, so the check and the write could disagree: two concurrent clicks both
// passed the SELECT, and a refunded order could be confirmed a second time.

const ADMIN_KEY = "test-admin-secret";

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

function adminPost(path: string, body: unknown = {}) {
  return fetch(`${server.url}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-key": ADMIN_KEY,
    },
    body: JSON.stringify(body),
  });
}

async function orderStatus(orderId: string) {
  const row = await db.query.ordersTable.findFirst({
    where: eq(ordersTable.id, orderId),
  });
  return row?.status;
}

async function paymentStatus(paymentId: string) {
  const row = await db.query.paymentRecordsTable.findFirst({
    where: eq(paymentRecordsTable.id, paymentId),
  });
  return row?.status;
}

test("confirm-ach cannot confirm a refunded order", async () => {
  const { orderId, paymentId } = await seedOrderWithPayment({
    orderStatus: "refunded",
    paymentStatus: "pending",
  });

  await adminPost(`/api/admin/orders/${orderId}/confirm-ach`);

  // The payment record legitimately settles — the transfer did arrive — but the
  // refund stands.
  assert.equal(await orderStatus(orderId), "refunded");
  assert.equal(await paymentStatus(paymentId), "confirmed");
});

test("confirm-ach is not repeatable", async () => {
  const { orderId } = await seedOrderWithPayment({ paymentStatus: "pending" });

  const first = await adminPost(`/api/admin/orders/${orderId}/confirm-ach`);
  assert.equal(first.status, 200);

  // Sequentially, the handler's own lookup for a PENDING payment record finds
  // none and 404s before reaching the guard. Different status code, same
  // outcome: no second settlement. The 409 path is for the concurrent case
  // below, where both requests get past that lookup.
  const second = await adminPost(`/api/admin/orders/${orderId}/confirm-ach`);
  assert.equal(second.status, 404);

  assert.equal(await orderStatus(orderId), "confirmed");
});

test("an order cannot be refunded twice", async () => {
  const { orderId } = await seedOrderWithPayment({
    orderStatus: "confirmed",
    paymentStatus: "confirmed",
  });

  const first = await adminPost(`/api/admin/orders/${orderId}/refund`);
  assert.equal(first.status, 200);

  const second = await adminPost(`/api/admin/orders/${orderId}/refund`);
  assert.equal(second.status, 409);

  assert.equal(await orderStatus(orderId), "refunded");
});

// Concurrency: the predicate must live on the UPDATE, not only in the preceding
// SELECT, or both requests observe a non-refunded order and both write.
//
// CAVEAT on the two refund cases below: both also pass against the unguarded
// code. Node serialises the handlers at their await points often enough that the
// second SELECT usually lands after the first UPDATE has committed, so the race
// does not reliably reproduce. They document the intended contract and would
// catch a gross regression, but they do NOT prove the refund guard — unlike the
// confirm-ach cases, which do fail without it. The refund race is also the
// milder of the two: the end state is 'refunded' either way, so the damage is a
// duplicate refund event rather than a corrupt order.
test("concurrent refunds settle to exactly one success", async () => {
  const { orderId } = await seedOrderWithPayment({
    orderStatus: "confirmed",
    paymentStatus: "confirmed",
  });

  const results = await Promise.all([
    adminPost(`/api/admin/orders/${orderId}/refund`),
    adminPost(`/api/admin/orders/${orderId}/refund`),
  ]);

  const codes = results.map((r) => r.status).sort();
  assert.deepEqual(codes, [200, 409]);
  assert.equal(await orderStatus(orderId), "refunded");
});

test("concurrent ACH confirmations settle to exactly one success", async () => {
  const { orderId } = await seedOrderWithPayment({ paymentStatus: "pending" });

  const results = await Promise.all([
    adminPost(`/api/admin/orders/${orderId}/confirm-ach`),
    adminPost(`/api/admin/orders/${orderId}/confirm-ach`),
  ]);

  const codes = results.map((r) => r.status).sort();
  assert.deepEqual(codes, [200, 409]);
  assert.equal(await orderStatus(orderId), "confirmed");
});
