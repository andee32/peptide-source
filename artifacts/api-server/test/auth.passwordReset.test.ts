import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@app/db";
import {
  customerUsersTable,
  customerSessionsTable,
  passwordResetTokensTable,
} from "@app/db/schema";
import { startTestServer, type TestServer } from "./helpers/server";
import { resetDb } from "./helpers/db";
import { hashPassword, verifyPassword } from "../src/lib/password";
import {
  createResetToken,
  hashResetToken,
} from "../src/lib/passwordReset";
import {
  createCustomerSession,
} from "../src/lib/customerSession";

// Password recovery (account-unification Phase 2). forgot-password must never
// leak whether an email exists; reset-password consumes a single-use token,
// sets the password, and revokes every existing session.

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

async function makeCustomer(email: string, password: string) {
  const id = randomUUID();
  await db.insert(customerUsersTable).values({
    id,
    email,
    passwordHash: await hashPassword(password),
    passwordSetAt: new Date(),
  });
  return id;
}

test("forgot-password returns 200 for an unknown email and mints no token", async () => {
  const res = await fetch(`${server.url}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "nobody@example.com" }),
  });
  assert.equal(res.status, 200);
  const tokens = await db.select().from(passwordResetTokensTable);
  assert.equal(tokens.length, 0);
});

test("forgot-password returns 200 for a known email and mints a token", async () => {
  await makeCustomer("known@example.com", "originalpass1");
  const res = await fetch(`${server.url}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "known@example.com" }),
  });
  assert.equal(res.status, 200);
  // The token mint + email happen OFF the response path (so response time can't
  // reveal whether the email is registered — an account-enumeration oracle), so
  // poll briefly for the row rather than reading immediately.
  let tokens = await db.select().from(passwordResetTokensTable);
  for (let i = 0; i < 50 && tokens.length === 0; i++) {
    await new Promise((r) => setTimeout(r, 20));
    tokens = await db.select().from(passwordResetTokensTable);
  }
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].purpose, "reset");
});

test("reset-password sets the new password and revokes existing sessions", async () => {
  const id = await makeCustomer("reset@example.com", "originalpass1");
  const session = await createCustomerSession(id);
  const { token } = await createResetToken(id, "reset");

  const res = await fetch(`${server.url}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password: "brandnewpass2" }),
  });
  assert.equal(res.status, 200);

  const [user] = await db
    .select()
    .from(customerUsersTable)
    .where(eq(customerUsersTable.id, id));
  assert.equal(await verifyPassword("brandnewpass2", user.passwordHash), true);
  assert.ok(user.passwordSetAt);

  // every prior session revoked
  const sessions = await db
    .select()
    .from(customerSessionsTable)
    .where(eq(customerSessionsTable.customerUserId, id));
  assert.equal(sessions.length, 0);
  void session;
});

test("reset-password rejects an invalid token", async () => {
  const res = await fetch(`${server.url}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "not-a-real-token", password: "whatever12" }),
  });
  assert.equal(res.status, 400);
});

test("a reset token is single-use — the second attempt fails", async () => {
  const id = await makeCustomer("single@example.com", "originalpass1");
  const { token } = await createResetToken(id, "reset");

  const first = await fetch(`${server.url}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password: "firstnewpass1" }),
  });
  assert.equal(first.status, 200);

  const second = await fetch(`${server.url}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password: "secondnewpass2" }),
  });
  assert.equal(second.status, 400);
});

test("an expired token is rejected", async () => {
  const id = await makeCustomer("expired@example.com", "originalpass1");
  const token = randomUUID() + randomUUID();
  await db.insert(passwordResetTokensTable).values({
    tokenHash: hashResetToken(token),
    customerUserId: id,
    purpose: "reset",
    expiresAt: new Date(Date.now() - 1000), // already expired
  });
  const res = await fetch(`${server.url}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password: "afterexpiry12" }),
  });
  assert.equal(res.status, 400);
});
