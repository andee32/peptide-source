import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@atlab/db";
import { customerUsersTable, ordersTable } from "@atlab/db/schema";
import { startTestServer, type TestServer } from "./helpers/server";
import { resetDb } from "./helpers/db";
import { seedOrderWithPayment } from "./helpers/factories";
import { hashPassword } from "../src/lib/password";
import { createCustomerSession } from "../src/lib/customerSession";

// Post-purchase claim: a guest who just created an account links the order they
// placed. Guardrails — must be signed in, the identity's email must match the
// order's shipping email, and an already-linked order can't be taken over. The
// factory seeds shippingEmail "buyer@example.test".

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

async function makeUser(email: string) {
  const id = randomUUID();
  await db.insert(customerUsersTable).values({
    id,
    email,
    passwordHash: await hashPassword("password12"),
    passwordSetAt: new Date(),
  });
  const session = await createCustomerSession(id);
  return { id, token: session.token };
}

function claim(id: string, token: string | null) {
  return fetch(`${server.url}/api/orders/${id}/claim`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

test("a signed-in user claims their own guest order (email matches)", async () => {
  const { id: userId, token } = await makeUser("buyer@example.test");
  const { orderId } = await seedOrderWithPayment({ orderStatus: "confirmed" });
  const res = await claim(orderId, token);
  assert.equal(res.status, 200);
  const order = await db.query.ordersTable.findFirst({ where: eq(ordersTable.id, orderId) });
  assert.equal(order?.customerUserId, userId);
});

test("claiming without a session is 401", async () => {
  const { orderId } = await seedOrderWithPayment({});
  assert.equal((await claim(orderId, null)).status, 401);
});

test("a different email cannot claim the order (403)", async () => {
  const { token } = await makeUser("someone-else@example.test");
  const { orderId } = await seedOrderWithPayment({});
  const res = await claim(orderId, token);
  assert.equal(res.status, 403);
  const order = await db.query.ordersTable.findFirst({ where: eq(ordersTable.id, orderId) });
  assert.equal(order?.customerUserId, null, "order must stay unlinked");
});

test("an already-linked order returns 409 to a different account", async () => {
  const { id: userA } = await makeUser("a@example.test");
  const { token: tokenB } = await makeUser("b@example.test");
  const { orderId } = await seedOrderWithPayment({});
  await db.update(ordersTable).set({ customerUserId: userA }).where(eq(ordersTable.id, orderId));
  assert.equal((await claim(orderId, tokenB)).status, 409);
});

test("re-claiming your own order is an idempotent 200", async () => {
  const { token } = await makeUser("buyer@example.test");
  const { orderId } = await seedOrderWithPayment({});
  assert.equal((await claim(orderId, token)).status, 200);
  assert.equal((await claim(orderId, token)).status, 200);
});
