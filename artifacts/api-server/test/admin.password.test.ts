import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@app/db";
import { adminUsersTable } from "@app/db/schema";
import { startTestServer, type TestServer } from "./helpers/server";
import { resetDb } from "./helpers/db";
import { hashPassword, verifyPassword } from "../src/lib/password";

// Changing an admin password must require the CALLER to re-authenticate with
// their own password.
//
// Previously currentPassword was optional, and when supplied it was verified
// against the TARGET's hash — which a peer resetter would not know, so the
// attack was simply to omit the field. A stolen 12h session could reset the
// owner's password and, because a password change revokes sessions, lock the
// owner out permanently. Re-authentication is what makes a live session
// insufficient on its own.

const ADMIN_SECRET = "test-admin-secret";

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

async function makeAdmin(email: string, password: string) {
  const [row] = await db
    .insert(adminUsersTable)
    .values({
      id: randomUUID(),
      email,
      passwordHash: await hashPassword(password),
      name: email,
      isActive: true,
    })
    .returning();
  return row;
}

async function sessionFor(email: string, password: string) {
  const res = await fetch(`${server.url}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return ((await res.json()) as { token: string }).token;
}

function setPassword(
  token: string,
  targetId: string,
  body: Record<string, unknown>
) {
  return fetch(`${server.url}/api/admin/users/${targetId}/password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-key": token },
    body: JSON.stringify(body),
  });
}

async function hashOf(id: string) {
  const row = await db.query.adminUsersTable.findFirst({
    where: eq(adminUsersTable.id, id),
  });
  return row!.passwordHash;
}

test("a session alone cannot reset a peer's password", async () => {
  const attacker = await makeAdmin("attacker@example.test", "attacker-pw");
  const victim = await makeAdmin("victim@example.test", "victim-pw");
  const token = await sessionFor("attacker@example.test", "attacker-pw");

  const before = await hashOf(victim.id);
  const res = await setPassword(token, victim.id, { password: "hijacked-pw" });

  assert.equal(res.status, 400, "must demand re-authentication");
  assert.equal(await hashOf(victim.id), before, "victim hash unchanged");
  assert.ok(
    await verifyPassword("victim-pw", await hashOf(victim.id)),
    "victim can still log in with their original password"
  );
  assert.ok(attacker.id !== victim.id);
});

test("the caller's own password is what authorises a peer reset", async () => {
  const owner = await makeAdmin("owner@example.test", "owner-pw");
  const peer = await makeAdmin("peer@example.test", "peer-pw");
  const token = await sessionFor("owner@example.test", "owner-pw");

  // Supplying the TARGET's password is not sufficient — that was the old,
  // wrong check.
  const wrong = await setPassword(token, peer.id, {
    password: "new-pw-12345",
    currentPassword: "peer-pw",
  });
  assert.equal(wrong.status, 401);
  assert.ok(await verifyPassword("peer-pw", await hashOf(peer.id)));

  // Supplying the CALLER's own password is.
  const right = await setPassword(token, peer.id, {
    password: "new-pw-12345",
    currentPassword: "owner-pw",
  });
  assert.equal(right.status, 200);
  assert.ok(await verifyPassword("new-pw-12345", await hashOf(peer.id)));
  assert.ok(owner.id !== peer.id);
});

test("self-service change still works and still needs the current password", async () => {
  const owner = await makeAdmin("owner@example.test", "owner-pw");
  const token = await sessionFor("owner@example.test", "owner-pw");

  const missing = await setPassword(token, owner.id, { password: "brand-new-pw" });
  assert.equal(missing.status, 400);

  const wrong = await setPassword(token, owner.id, {
    password: "brand-new-pw",
    currentPassword: "not-my-password",
  });
  assert.equal(wrong.status, 401);
  assert.ok(await verifyPassword("owner-pw", await hashOf(owner.id)));

  const ok = await setPassword(token, owner.id, {
    password: "brand-new-pw",
    currentPassword: "owner-pw",
  });
  assert.equal(ok.status, 200);
  assert.ok(await verifyPassword("brand-new-pw", await hashOf(owner.id)));
});

// Revocation is half of what made the original bug an account takeover: the
// reset locked the victim out. Nothing previously asserted it still fires.
test("a peer reset revokes the victim's sessions but not the actor's", async () => {
  const owner = await makeAdmin("owner@example.test", "owner-pw");
  const peer = await makeAdmin("peer@example.test", "peer-pw");
  const ownerToken = await sessionFor("owner@example.test", "owner-pw");
  const peerToken = await sessionFor("peer@example.test", "peer-pw");

  const peerBefore = await fetch(`${server.url}/api/admin/users`, {
    headers: { "x-admin-key": peerToken },
  });
  assert.equal(peerBefore.status, 200);

  const res = await setPassword(ownerToken, peer.id, {
    password: "reset-by-owner",
    currentPassword: "owner-pw",
  });
  assert.equal(res.status, 200);

  const peerAfter = await fetch(`${server.url}/api/admin/users`, {
    headers: { "x-admin-key": peerToken },
  });
  assert.equal(peerAfter.status, 401, "victim's session must be revoked");

  const ownerAfter = await fetch(`${server.url}/api/admin/users`, {
    headers: { "x-admin-key": ownerToken },
  });
  assert.equal(ownerAfter.status, 200, "actor's own session must survive");
  assert.ok(owner.id !== peer.id);
});

// The takeover primitive did not live only on the password route: a stolen
// session could provision a new operator and deactivate every real one, with
// the last-active guard satisfied by the row it had just created.
test("a session alone cannot provision a new operator", async () => {
  await makeAdmin("attacker@example.test", "attacker-pw");
  const token = await sessionFor("attacker@example.test", "attacker-pw");

  const res = await fetch(`${server.url}/api/admin/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-key": token },
    body: JSON.stringify({ email: "planted@evil.test", password: "planted-pw" }),
  });

  assert.equal(res.status, 400, "must demand re-authentication");
  const rows = await db.select().from(adminUsersTable);
  assert.ok(
    !rows.some((r) => r.email === "planted@evil.test"),
    "no operator may be provisioned without re-authentication"
  );
});

test("a session alone cannot deactivate another operator", async () => {
  await makeAdmin("attacker@example.test", "attacker-pw");
  const victim = await makeAdmin("victim@example.test", "victim-pw");
  const token = await sessionFor("attacker@example.test", "attacker-pw");

  const res = await fetch(`${server.url}/api/admin/users/${victim.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "x-admin-key": token },
    body: JSON.stringify({ isActive: false }),
  });

  assert.equal(res.status, 400);
  const row = await db.query.adminUsersTable.findFirst({
    where: eq(adminUsersTable.id, victim.id),
  });
  assert.equal(row!.isActive, true, "victim must remain active");
});

// A rename grants nothing durable, so it must NOT be gated — over-tightening
// would push operators toward break-glass, which has no re-auth at all.
test("a rename does not require re-authentication", async () => {
  await makeAdmin("owner@example.test", "owner-pw");
  const target = await makeAdmin("target@example.test", "target-pw");
  const token = await sessionFor("owner@example.test", "owner-pw");

  const res = await fetch(`${server.url}/api/admin/users/${target.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "x-admin-key": token },
    body: JSON.stringify({ name: "Renamed" }),
  });

  assert.equal(res.status, 200);
});

// Break-glass has no admin_users row to re-authenticate against, so it stays
// permitted — it is the documented recovery path when the table is unusable.
test("break-glass can still reset a password", async () => {
  const owner = await makeAdmin("owner@example.test", "owner-pw");

  const res = await setPassword(ADMIN_SECRET, owner.id, {
    password: "recovered-pw",
  });

  assert.equal(res.status, 200);
  assert.ok(await verifyPassword("recovered-pw", await hashOf(owner.id)));
});
