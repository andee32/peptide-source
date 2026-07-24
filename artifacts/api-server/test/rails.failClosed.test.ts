import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { db, pool } from "@atlab/db";
import { paymentRecordsTable } from "@atlab/db/schema";
import { resetDb } from "./helpers/db";
import { makeVariant, orderPayload } from "./helpers/factories";

// Pins the non-negotiable: an unconfigured payment rail FAILS CLOSED. It must
// never fabricate a pay-to address or hand out placeholder bank details, because
// a buyer who sends funds to a made-up address loses them irretrievably.
//
// services/btcpay.ts reads its env vars at MODULE scope, so the vars must be
// cleared before the module is first imported. That is why this file imports the
// app dynamically instead of using helpers/server.ts (which imports it statically).

delete process.env.BTCPAYSERVER_URL;
delete process.env.BTCPAYSERVER_API_KEY;
delete process.env.BTCPAYSERVER_STORE_ID;
// ACH reads env at call time; leaving these unset is the unprovisioned state.
delete process.env.ACH_BANK_NAME;
delete process.env.ACH_ROUTING_NUMBER;
delete process.env.ACH_ACCOUNT_NUMBER;

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
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
  await pool.end();
});

beforeEach(async () => {
  await resetDb();
});

async function createOrder(variantId: number, paymentMethod: string) {
  const res = await fetch(`${url}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(orderPayload(variantId, { paymentMethod })),
  });
  assert.equal(res.status, 201);
  return ((await res.json()) as { id: string }).id;
}

test("unconfigured BTCPay returns 503 and writes no payment record", async () => {
  const { variant } = await makeVariant();
  const orderId = await createOrder(variant.id, "crypto_btc");

  const res = await fetch(`${url}/api/orders/${orderId}/crypto-invoice`, {
    method: "POST",
  });

  assert.equal(res.status, 503);
  assert.equal(((await res.json()) as { error: string }).error, "payment_unavailable");

  // The critical assertion: no half-created payment record, and therefore no
  // fabricated pay-to address anywhere in the system.
  const records = await db.select().from(paymentRecordsTable);
  assert.equal(records.length, 0);
});

test("unprovisioned ACH returns 503 and writes no payment record", async () => {
  const { variant } = await makeVariant();
  const orderId = await createOrder(variant.id, "ach");

  const res = await fetch(`${url}/api/orders/${orderId}/ach-instructions`, {
    method: "POST",
  });

  assert.equal(res.status, 503);
  assert.equal(((await res.json()) as { error: string }).error, "ach_unavailable");

  const records = await db.select().from(paymentRecordsTable);
  assert.equal(records.length, 0);
});
