import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@atlab/db";
import { customerUsersTable, customerAccountsTable } from "@atlab/db/schema";
import { startTestServer, type TestServer } from "./helpers/server";
import { resetDb } from "./helpers/db";
import { hashPassword } from "../src/lib/password";
import { createCustomerSession } from "../src/lib/customerSession";

// Account-unification Phase 6: applying for wholesale requires a signed-in
// identity, links the profile to it, and mints NO access token.

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

const applyBody = {
  businessName: "New Lab",
  contactName: "Owner",
  email: "biz@example.test",
  phone: "5551234",
  businessType: "research_lab",
};

async function signedInUser() {
  const id = randomUUID();
  await db.insert(customerUsersTable).values({
    id,
    email: `u-${randomUUID()}@example.test`,
    passwordHash: await hashPassword("password12"),
    passwordSetAt: new Date(),
  });
  const session = await createCustomerSession(id);
  return { id, token: session.token };
}

test("applying without a session is 401", async () => {
  const res = await fetch(`${server.url}/api/accounts/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(applyBody),
  });
  assert.equal(res.status, 401);
});

test("applying signed-in links the profile and issues no token", async () => {
  const { id, token } = await signedInUser();
  const res = await fetch(`${server.url}/api/accounts/apply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(applyBody),
  });
  assert.equal(res.status, 201);
  const body = (await res.json()) as { id: string; status: string; accessToken?: string };
  assert.equal(body.status, "pending");
  assert.equal(body.accessToken, undefined); // no token minted

  const [acct] = await db
    .select()
    .from(customerAccountsTable)
    .where(eq(customerAccountsTable.id, body.id));
  assert.equal(acct.customerUserId, id);
  assert.equal(acct.accessToken, ""); // sentinel empty, never a real token
});

test("a second application from the same identity is 409", async () => {
  const { token } = await signedInUser();
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  const first = await fetch(`${server.url}/api/accounts/apply`, {
    method: "POST",
    headers,
    body: JSON.stringify(applyBody),
  });
  assert.equal(first.status, 201);
  const second = await fetch(`${server.url}/api/accounts/apply`, {
    method: "POST",
    headers,
    body: JSON.stringify(applyBody),
  });
  assert.equal(second.status, 409);
});
