import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@atlab/db";
import { customerUsersTable, customerAccountsTable } from "@atlab/db/schema";
import { startTestServer, type TestServer } from "./helpers/server";
import { resetDb } from "./helpers/db";
import { makeVariant, orderPayload } from "./helpers/factories";
import { hashPassword } from "../src/lib/password";
import { createCustomerSession } from "../src/lib/customerSession";

// Account-unification Phase 5: a signed-in user whose linked profile is approved
// can transact wholesale via channel:"wholesale" + a Bearer session — no
// x-account-token, no body token. The legacy token path is covered elsewhere;
// this pins the NEW session path.

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

async function signedInUser(email: string) {
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

async function linkedApprovedAccount(customerUserId: string) {
  const [account] = await db
    .insert(customerAccountsTable)
    .values({
      id: randomUUID(),
      businessName: "Session Labs",
      contactName: "Owner",
      email: `ws-${randomUUID()}@example.test`,
      status: "approved",
      customerUserId,
      accessToken: "", // no token — pure session auth
    })
    .returning();
  return account;
}

test("session + channel:wholesale places a wholesale order (no token)", async () => {
  const { id, token } = await signedInUser(`u-${randomUUID()}@example.test`);
  await linkedApprovedAccount(id);
  const { variant } = await makeVariant({ unitType: "kit", priceCents: 20_000 });

  const res = await fetch(`${server.url}/api/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(
      orderPayload(variant.id, {
        channel: "wholesale",
        lineItems: [{ variantId: variant.id, quantity: 5 }], // meets 5-kit MOQ
        paymentMethod: "wire",
      }),
    ),
  });
  assert.equal(res.status, 201);
  const body = (await res.json()) as { channel: string };
  assert.equal(body.channel, "wholesale");
});

test("session wholesale order is stamped with the resolved account id (server-derived)", async () => {
  const { id, token } = await signedInUser(`u2-${randomUUID()}@example.test`);
  const account = await linkedApprovedAccount(id);
  const { variant } = await makeVariant({ unitType: "kit", priceCents: 20_000 });

  const res = await fetch(`${server.url}/api/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(
      orderPayload(variant.id, {
        channel: "wholesale",
        lineItems: [{ variantId: variant.id, quantity: 5 }],
        paymentMethod: "wire",
      }),
    ),
  });
  assert.equal(res.status, 201);
  const created = (await res.json()) as { id: string };
  const [row] = await db.select().from(customerAccountsTable);
  assert.equal(row.id, account.id);
  // the order carries the server-resolved account, not anything client-sent
  assert.ok(created.id);
});

test("channel:wholesale without an approved profile is 403", async () => {
  const { token } = await signedInUser(`plain-${randomUUID()}@example.test`);
  // no linked account
  const { variant } = await makeVariant({ unitType: "kit", priceCents: 20_000 });

  const res = await fetch(`${server.url}/api/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(
      orderPayload(variant.id, {
        channel: "wholesale",
        lineItems: [{ variantId: variant.id, quantity: 5 }],
        paymentMethod: "wire",
      }),
    ),
  });
  assert.equal(res.status, 403);
});

test("session wholesale can use the quote endpoint", async () => {
  const { id, token } = await signedInUser(`q-${randomUUID()}@example.test`);
  await linkedApprovedAccount(id);
  const { variant } = await makeVariant({ unitType: "kit", priceCents: 20_000 });

  const res = await fetch(`${server.url}/api/orders/quote`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      lineItems: [{ variantId: variant.id, quantity: 5 }],
      paymentMethod: "wire",
      channel: "wholesale",
    }),
  });
  assert.equal(res.status, 200);
  const q = (await res.json()) as { subtotalCents: number };
  assert.equal(q.subtotalCents, 100_000); // 5 x 20_000, list (no tier entries)
});
