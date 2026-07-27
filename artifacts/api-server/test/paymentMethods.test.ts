import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { db } from "@atlab/db";
import { paymentMethodsTable } from "@atlab/db/schema";
import { startTestServer, type TestServer } from "./helpers/server";
import { resetDb } from "./helpers/db";
import { makeVariant, orderPayload } from "./helpers/factories";

// Admin can turn each fixed rail on/off per channel; the toggle is enforced
// server-side at order creation, not just hidden in the UI. Zelle can never be
// enabled for retail (wholesale-only invariant). ADMIN_SECRET is set in env.ts.
const ADMIN = { "x-admin-key": "test-admin-secret" };

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

function retailOrder(variantId: number) {
  return fetch(`${server.url}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(orderPayload(variantId, { paymentMethod: "crypto_btc" })),
  });
}

test("a retail order with a method disabled for retail is rejected", async () => {
  await db.insert(paymentMethodsTable).values({
    method: "crypto_btc",
    enabledRetail: false,
    enabledWholesale: true,
  });
  const { variant } = await makeVariant();
  const res = await retailOrder(variant.id);
  assert.equal(res.status, 422);
  assert.equal(((await res.json()) as { code: string }).code, "PAYMENT_METHOD_UNAVAILABLE");
});

test("enabling the method for retail lets the order through", async () => {
  await db.insert(paymentMethodsTable).values({
    method: "crypto_btc",
    enabledRetail: true,
    enabledWholesale: true,
  });
  const { variant } = await makeVariant();
  const res = await retailOrder(variant.id);
  assert.equal(res.status, 201);
});

test("no explicit row = allowed (unseeded/test DBs keep working)", async () => {
  const { variant } = await makeVariant();
  const res = await retailOrder(variant.id);
  assert.equal(res.status, 201);
});

test("admin cannot enable Zelle for retail (wholesale-only)", async () => {
  const res = await fetch(`${server.url}/api/admin/payment-methods/zelle`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...ADMIN },
    body: JSON.stringify({ enabledRetail: true }),
  });
  assert.equal(res.status, 400);
});

test("admin patch of an unknown method is 404 (rail set is fixed)", async () => {
  const res = await fetch(`${server.url}/api/admin/payment-methods/stripe`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...ADMIN },
    body: JSON.stringify({ enabledRetail: true }),
  });
  assert.equal(res.status, 404);
});

test("GET /payment-methods reflects enable + configured per channel", async () => {
  // Crypto is configured in the test env (BTCPAYSERVER_* set); enable it for retail.
  await db.insert(paymentMethodsTable).values({
    method: "crypto_btc",
    enabledRetail: true,
    enabledWholesale: true,
  });
  const res = await fetch(`${server.url}/api/payment-methods?channel=retail`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { methods: { method: string; available: boolean }[] };
  assert.equal(body.methods.find((m) => m.method === "crypto_btc")?.available, true);
  // Zelle is wholesale-only → never available on the retail channel.
  assert.equal(body.methods.find((m) => m.method === "zelle")?.available, false);
});
