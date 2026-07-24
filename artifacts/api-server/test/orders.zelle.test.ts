import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@atlab/db";
import {
  ordersTable,
  customerAccountsTable,
  customerUsersTable,
} from "@atlab/db/schema";
import { startTestServer, type TestServer } from "./helpers/server";
import { resetDb } from "./helpers/db";
import { makeVariant, orderPayload } from "./helpers/factories";
import { hashPassword } from "../src/lib/password";
import { createCustomerSession } from "../src/lib/customerSession";

// Zelle is WHOLESALE-ONLY, and that is enforced server-side rather than by
// hiding the option in the UI.
//
// The handle identifies the recipient by phone/email rather than an account
// number, so exposing it publicly would publish a direct line to the operating
// bank account. A Zelle transfer is also irreversible with no dispute mechanism
// in either direction, so it is restricted to counterparties already approved.

let server: TestServer;

before(async () => {
  server = await startTestServer();
});
after(async () => {
  await server.close();
});
beforeEach(async () => {
  await resetDb();
  delete process.env.ZELLE_RECIPIENT;
  delete process.env.ZELLE_RECIPIENT_NAME;
});

function createOrder(body: unknown, extraHeaders: Record<string, string> = {}) {
  return fetch(`${server.url}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  });
}

async function approvedAccount() {
  const userId = randomUUID();
  await db.insert(customerUsersTable).values({
    id: userId,
    email: `buyer-${randomUUID()}@example.test`,
    passwordHash: await hashPassword("password12"),
    passwordSetAt: new Date(),
  });
  const [account] = await db
    .insert(customerAccountsTable)
    .values({
      id: randomUUID(),
      businessName: "Test Lab LLC",
      contactName: "Buyer",
      email: `biz-${randomUUID()}@example.test`,
      phone: "555-0100",
      businessType: "research_lab",
      status: "approved",
      customerUserId: userId,
    })
    .returning();
  const session = await createCustomerSession(userId);
  return { account, token: session.token };
}

test("a retail order cannot use Zelle", async () => {
  const { variant } = await makeVariant();

  const res = await createOrder(
    orderPayload(variant.id, { paymentMethod: "zelle" })
  );

  assert.equal(res.status, 422);
  assert.equal(((await res.json()) as { code: string }).code, "ZELLE_WHOLESALE_ONLY");
  assert.equal(
    (await db.select().from(ordersTable)).length,
    0,
    "no order may be created"
  );
});

test("an approved wholesale account can use Zelle", async () => {
  const { variant } = await makeVariant({ unitType: "kit" });
  const { token } = await approvedAccount();

  const res = await createOrder(
    orderPayload(variant.id, {
      paymentMethod: "zelle",
      channel: "wholesale",
      lineItems: [{ variantId: variant.id, quantity: 5 }],
    }),
    { Authorization: `Bearer ${token}` }
  );

  assert.equal(res.status, 201);
  const { id } = (await res.json()) as { id: string };
  const order = await db.query.ordersTable.findFirst({
    where: eq(ordersTable.id, id),
  });
  assert.equal(order?.paymentMethod, "zelle");
  assert.equal(order?.channel, "wholesale");
});

test("Zelle fails closed until a recipient handle is provisioned", async () => {
  const { variant } = await makeVariant({ unitType: "kit" });
  const { token } = await approvedAccount();

  const created = await createOrder(
    orderPayload(variant.id, {
      paymentMethod: "zelle",
      channel: "wholesale",
      lineItems: [{ variantId: variant.id, quantity: 5 }],
    }),
    { Authorization: `Bearer ${token}` }
  );
  const { id } = (await created.json()) as { id: string };

  const res = await fetch(`${server.url}/api/orders/${id}/ach-instructions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(res.status, 503);
  assert.equal(((await res.json()) as { error: string }).error, "zelle_unavailable");
});

// The handle is exposed only to counterparties that are approved NOW. The
// access token is minted at application and never rotated, so an account that
// later fails KYB would otherwise keep re-fetching the live bank handle from the
// idempotent path.
test("a de-approved account stops being served the Zelle handle", async () => {
  process.env.ZELLE_RECIPIENT = "payments@example.test";
  process.env.ZELLE_RECIPIENT_NAME = "AT Lab Sourcing LLC";
  const { variant } = await makeVariant({ unitType: "kit" });
  const { account, token } = await approvedAccount();

  const created = await createOrder(
    orderPayload(variant.id, {
      paymentMethod: "zelle",
      channel: "wholesale",
      lineItems: [{ variantId: variant.id, quantity: 5 }],
    }),
    { Authorization: `Bearer ${token}` }
  );
  const { id } = (await created.json()) as { id: string };

  const first = await fetch(`${server.url}/api/orders/${id}/ach-instructions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(first.status, 201, "approved account is served normally");

  await db
    .update(customerAccountsTable)
    .set({ status: "rejected" })
    .where(eq(customerAccountsTable.id, account.id));

  const after = await fetch(`${server.url}/api/orders/${id}/ach-instructions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(after.status, 403, "the token alone must not keep it flowing");
  const body = await after.text();
  assert.ok(
    !body.includes("payments@example.test"),
    "the handle must not appear in the rejection"
  );
});

test("a malformed Zelle handle keeps the rail closed", async () => {
  const { variant } = await makeVariant({ unitType: "kit" });
  const { token } = await approvedAccount();
  const created = await createOrder(
    orderPayload(variant.id, {
      paymentMethod: "zelle",
      channel: "wholesale",
      lineItems: [{ variantId: variant.id, quantity: 5 }],
    }),
    { Authorization: `Bearer ${token}` }
  );
  const { id } = (await created.json()) as { id: string };

  process.env.ZELLE_RECIPIENT_NAME = "AT Lab Sourcing LLC";
  // Each of these would have flipped the rail live under a non-empty check.
  for (const bad of ["TODO", "changeme", "0000000000", "not-an-email", "555"]) {
    process.env.ZELLE_RECIPIENT = bad;
    const res = await fetch(`${server.url}/api/orders/${id}/ach-instructions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 503, `"${bad}" must not provision the rail`);
  }
});

// The name shown beside the handle must be the one actually registered to it —
// a mismatch in the buyer's bank app means an abandoned transfer.
test("a missing recipient name keeps the rail closed", async () => {
  const { variant } = await makeVariant({ unitType: "kit" });
  const { token } = await approvedAccount();
  const created = await createOrder(
    orderPayload(variant.id, {
      paymentMethod: "zelle",
      channel: "wholesale",
      lineItems: [{ variantId: variant.id, quantity: 5 }],
    }),
    { Authorization: `Bearer ${token}` }
  );
  const { id } = (await created.json()) as { id: string };

  process.env.ZELLE_RECIPIENT = "payments@example.test";
  delete process.env.ZELLE_RECIPIENT_NAME;

  const res = await fetch(`${server.url}/api/orders/${id}/ach-instructions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 503);
});

test("a provisioned Zelle order returns the handle and a reference code", async () => {
  process.env.ZELLE_RECIPIENT = "payments@example.test";
  process.env.ZELLE_RECIPIENT_NAME = "AT Lab Sourcing LLC";
  const { variant } = await makeVariant({ unitType: "kit" });
  const { token } = await approvedAccount();

  const created = await createOrder(
    orderPayload(variant.id, {
      paymentMethod: "zelle",
      channel: "wholesale",
      lineItems: [{ variantId: variant.id, quantity: 5 }],
    }),
    { Authorization: `Bearer ${token}` }
  );
  const { id } = (await created.json()) as { id: string };

  const res = await fetch(`${server.url}/api/orders/${id}/ach-instructions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(res.status, 201);
  const body = (await res.json()) as {
    referenceCode: string;
    instructions: { recipient: string; memo: string; routingNumber?: string };
  };
  assert.equal(body.instructions.recipient, "payments@example.test");
  assert.equal(body.instructions.memo, body.referenceCode);
  assert.equal(
    body.instructions.routingNumber,
    undefined,
    "a Zelle order must never be handed bank routing details"
  );
});
