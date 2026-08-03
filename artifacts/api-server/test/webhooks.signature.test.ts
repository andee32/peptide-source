import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "@app/db";
import { paymentRecordsTable } from "@app/db/schema";
import { startTestServer, type TestServer } from "./helpers/server";
import { resetDb } from "./helpers/db";
import { seedOrderWithPayment } from "./helpers/factories";
import { signBtcpayBody } from "./helpers/btcpaySig";

// Pins the non-negotiable: the BTCPay webhook rejects unsigned/mis-signed
// requests BEFORE any DB mutation. Every rejection case below asserts the
// seeded payment record is untouched, which is the part that actually matters —
// a 401 that already wrote to the DB would still be a settlement forgery.

const SECRET = "test-webhook-secret";

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

async function post(body: string, sig: string | null) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (sig !== null) headers["btcpay-sig"] = sig;
  return fetch(`${server.url}/api/webhooks/btcpay`, {
    method: "POST",
    headers,
    body,
  });
}

async function paymentStatus(paymentId: string) {
  const row = await db.query.paymentRecordsTable.findFirst({
    where: eq(paymentRecordsTable.id, paymentId),
  });
  return row?.status;
}

test("rejects a webhook with no btcpay-sig header, without mutating", async () => {
  const { paymentId, invoiceId } = await seedOrderWithPayment();
  const body = JSON.stringify({ type: "InvoiceSettled", invoiceId });

  const res = await post(body, null);

  assert.equal(res.status, 401);
  assert.equal(await paymentStatus(paymentId), "pending");
});

test("rejects a signature computed over a different body", async () => {
  const { paymentId, invoiceId } = await seedOrderWithPayment();
  const signed = JSON.stringify({ type: "InvoiceSettled", invoiceId: "other" });
  const sent = JSON.stringify({ type: "InvoiceSettled", invoiceId });

  const res = await post(sent, signBtcpayBody(signed, SECRET));

  assert.equal(res.status, 401);
  assert.equal(await paymentStatus(paymentId), "pending");
});

test("rejects a signature made with the wrong secret", async () => {
  const { paymentId, invoiceId } = await seedOrderWithPayment();
  const body = JSON.stringify({ type: "InvoiceSettled", invoiceId });

  const res = await post(body, signBtcpayBody(body, "not-the-secret"));

  assert.equal(res.status, 401);
  assert.equal(await paymentStatus(paymentId), "pending");
});

// Exercises the timingSafeEqual path specifically: same length, different
// bytes. A length mismatch short-circuits before the comparison.
test("rejects a same-length signature with different bytes", async () => {
  const { paymentId, invoiceId } = await seedOrderWithPayment();
  const body = JSON.stringify({ type: "InvoiceSettled", invoiceId });
  const valid = signBtcpayBody(body, SECRET);
  const tampered =
    valid.slice(0, -1) + (valid.endsWith("a") ? "b" : "a");

  assert.equal(tampered.length, valid.length);
  const res = await post(body, tampered);

  assert.equal(res.status, 401);
  assert.equal(await paymentStatus(paymentId), "pending");
});

// app.ts captures raw bytes only for Content-Type: application/json. Any other
// content type leaves req.rawBody unset, and the handler must refuse rather than
// verify a signature over a re-serialised body. Before this was fixed the same
// request threw (Buffer.from(JSON.stringify(undefined))) and returned 500.
test("rejects a request whose raw body was never captured", async () => {
  const { paymentId, invoiceId } = await seedOrderWithPayment();
  const body = JSON.stringify({ type: "InvoiceSettled", invoiceId });

  const res = await fetch(`${server.url}/api/webhooks/btcpay`, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      "btcpay-sig": signBtcpayBody(body, SECRET),
    },
    body,
  });

  assert.equal(res.status, 400);
  assert.equal(
    ((await res.json()) as { error: string }).error,
    "missing_raw_body"
  );
  assert.equal(await paymentStatus(paymentId), "pending");
});

// Positive control. Without this the suite would still pass if the handler
// rejected everything unconditionally.
test("accepts a correctly signed webhook", async () => {
  const { invoiceId } = await seedOrderWithPayment();
  const body = JSON.stringify({ type: "InvoiceProcessing", invoiceId });

  const res = await post(body, signBtcpayBody(body, SECRET));

  assert.equal(res.status, 200);
});
