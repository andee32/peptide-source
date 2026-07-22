import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "@atlab/db";
import { paymentRecordsTable } from "@atlab/db/schema";
import { resetDb } from "./helpers/db";
import { seedOrderWithPayment } from "./helpers/factories";

// Pins the fail-closed rule for webhook verification: with no
// BTCPAYSERVER_WEBHOOK_SECRET configured, EVERY webhook is rejected. It must
// never fall back to the API key, and never accept because "there is nothing to
// check against" — that would let anyone forge a payment settlement.
//
// Own file with a dynamic import: services/btcpay.ts captures the secret at
// module scope, so it has to be absent before the module is first loaded.

delete process.env.BTCPAYSERVER_WEBHOOK_SECRET;
const API_KEY = process.env.BTCPAYSERVER_API_KEY ?? "test-api-key";

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

async function post(body: string, sig: string) {
  return fetch(`${url}/api/webhooks/btcpay`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "btcpay-sig": sig },
    body,
  });
}

async function statusOf(paymentId: string) {
  const row = await db.query.paymentRecordsTable.findFirst({
    where: eq(paymentRecordsTable.id, paymentId),
  });
  return row?.status;
}

test("rejects a well-formed webhook when no webhook secret is configured", async () => {
  const { paymentId, invoiceId } = await seedOrderWithPayment();
  const body = JSON.stringify({ type: "InvoiceSettled", invoiceId });
  const sig = `sha256=${createHmac("sha256", "any-secret").update(body).digest("hex")}`;

  const res = await post(body, sig);

  assert.equal(res.status, 401);
  assert.equal(await statusOf(paymentId), "pending");
});

// Regression guard for the specific bug called out in services/btcpay.ts: the
// webhook secret must never silently fall back to the BTCPay API key.
test("does not accept a signature made with the API key as the secret", async () => {
  const { paymentId, invoiceId } = await seedOrderWithPayment();
  const body = JSON.stringify({ type: "InvoiceSettled", invoiceId });
  const sig = `sha256=${createHmac("sha256", API_KEY).update(body).digest("hex")}`;

  const res = await post(body, sig);

  assert.equal(res.status, 401);
  assert.equal(await statusOf(paymentId), "pending");
});
