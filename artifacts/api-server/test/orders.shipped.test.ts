import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, type TestServer } from "./helpers/server";
import { resetDb } from "./helpers/db";
import { seedOrderWithPayment } from "./helpers/factories";

// The "shipped" stage: an admin marks a CONFIRMED (paid) order shipped and
// records the dropshipper's tracking. Only confirmed → shipped is allowed, and
// shippedAt is stamped once. ADMIN_SECRET is set in env.ts.
const ADMIN = { "Content-Type": "application/json", "x-admin-key": "test-admin-secret" };

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

function patch(id: string, body: unknown) {
  return fetch(`${server.url}/api/admin/orders/${id}`, {
    method: "PATCH",
    headers: ADMIN,
    body: JSON.stringify(body),
  });
}

test("a confirmed order can be marked shipped with tracking, stamping shippedAt", async () => {
  const { orderId } = await seedOrderWithPayment({
    orderStatus: "confirmed",
    paymentStatus: "confirmed",
  });
  const res = await patch(orderId, { status: "shipped", trackingNumber: "1Z999", carrier: "UPS" });
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    status: string;
    trackingNumber: string;
    carrier: string;
    shippedAt: string | null;
  };
  assert.equal(body.status, "shipped");
  assert.equal(body.trackingNumber, "1Z999");
  assert.equal(body.carrier, "UPS");
  assert.ok(body.shippedAt, "shippedAt is stamped");
});

test("only a confirmed order can be marked shipped", async () => {
  const { orderId } = await seedOrderWithPayment({ orderStatus: "awaiting_payment" });
  const res = await patch(orderId, { status: "shipped" });
  assert.equal(res.status, 409);
});

test("shippedAt is stamped once and not overwritten on a later patch", async () => {
  const { orderId } = await seedOrderWithPayment({ orderStatus: "confirmed" });
  const r1 = await patch(orderId, { status: "shipped" });
  assert.equal(r1.status, 200);
  const first = (await r1.json()) as { shippedAt: string };

  // Add tracking later while still "shipped" — shippedAt must not move.
  const r2 = await patch(orderId, { status: "shipped", trackingNumber: "1Z-later" });
  assert.equal(r2.status, 200);
  const second = (await r2.json()) as { shippedAt: string; trackingNumber: string };
  assert.equal(second.shippedAt, first.shippedAt, "shippedAt unchanged on re-patch");
  assert.equal(second.trackingNumber, "1Z-later");
});
