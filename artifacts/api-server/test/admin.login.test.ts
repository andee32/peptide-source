import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@atlab/db";
import { adminUsersTable, adminSessionsTable } from "@atlab/db/schema";
import { startTestServer, type TestServer } from "./helpers/server";
import { resetDb } from "./helpers/db";
import { hashPassword } from "../src/lib/password";

// The owner's standing invariant: /admin/login must NEVER hand back the shared
// ADMIN_SECRET. That secret does not expire, has no admin_sessions row, and is
// untouched by revokeAdminSessions — so issuing it makes "deactivate this
// operator" and "reset their password" silent no-ops.
//
// It previously leaked on the bootstrap fallback, and that fallback was reachable
// from a mere transient DB error, not just an empty table.

const ADMIN_SECRET = "test-admin-secret";
const OWNER_EMAIL = "owner@example.test";
const OWNER_PASSWORD = "correct-horse-battery";

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

function login(email: string, password: string) {
  return fetch(`${server.url}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

async function seedOwner(opts: { isActive?: boolean } = {}) {
  const [row] = await db
    .insert(adminUsersTable)
    .values({
      id: randomUUID(),
      email: OWNER_EMAIL,
      passwordHash: await hashPassword(OWNER_PASSWORD),
      name: "Owner",
      isActive: opts.isActive ?? true,
    })
    .returning();
  return row;
}

test("a valid login returns a bound session, never the shared secret", async () => {
  await seedOwner();

  const res = await login(OWNER_EMAIL, OWNER_PASSWORD);
  assert.equal(res.status, 200);

  const raw = await res.text();
  assert.ok(
    !raw.includes(ADMIN_SECRET),
    "no part of the response may contain the break-glass secret"
  );
  const body = JSON.parse(raw) as { token: string; expiresAt?: string };
  assert.ok(body.expiresAt, "a real session carries an expiry");
});

// The invariant that actually matters. "Never returns ADMIN_SECRET" is only
// valuable because the thing it returns instead can be REVOKED — that is the
// whole reason the shared secret was a problem. Assert revocability directly
// rather than inferring it from the token's shape.
test("the issued token is revoked by deactivating the operator", async () => {
  const owner = await seedOwner();
  const { token } = (await (await login(OWNER_EMAIL, OWNER_PASSWORD)).json()) as {
    token: string;
  };

  const before = await fetch(`${server.url}/api/admin/users`, {
    headers: { "x-admin-key": token },
  });
  assert.equal(before.status, 200, "a fresh session should authenticate");

  // Exactly one session row, storing only the hash — never the raw token.
  const sessions = await db.select().from(adminSessionsTable);
  assert.equal(sessions.length, 1);
  assert.equal(
    sessions[0].tokenHash,
    createHash("sha256").update(token).digest("hex")
  );
  assert.notEqual(sessions[0].tokenHash, token, "raw token must not be stored");

  await db
    .update(adminUsersTable)
    .set({ isActive: false })
    .where(eq(adminUsersTable.id, owner.id));

  const after = await fetch(`${server.url}/api/admin/users`, {
    headers: { "x-admin-key": token },
  });
  assert.equal(after.status, 401, "deactivation must revoke the live session");
});

test("a failed bootstrap login seeds nothing", async () => {
  const envEmail = process.env.ADMIN_EMAIL;
  const envHash = process.env.ADMIN_PASSWORD_HASH;
  process.env.ADMIN_EMAIL = "bootstrap@example.test";
  process.env.ADMIN_PASSWORD_HASH = await hashPassword("bootstrap-pass");

  try {
    const res = await login("bootstrap@example.test", "WRONG-password");
    assert.equal(res.status, 401);
    // A failed authentication must not provision an account.
    assert.equal((await db.select().from(adminUsersTable)).length, 0);
  } finally {
    if (envEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = envEmail;
    if (envHash === undefined) delete process.env.ADMIN_PASSWORD_HASH;
    else process.env.ADMIN_PASSWORD_HASH = envHash;
  }
});

test("an inactive admin cannot log in", async () => {
  await seedOwner({ isActive: false });

  const res = await login(OWNER_EMAIL, OWNER_PASSWORD);

  assert.equal(res.status, 401);
});

test("a wrong password is rejected", async () => {
  await seedOwner();

  const res = await login(OWNER_EMAIL, "not-the-password");

  assert.equal(res.status, 401);
});

// The bootstrap path: admin_users is genuinely empty and the env credential is
// the only way in. It must still mint a real, revocable session rather than
// handing over ADMIN_SECRET.
test("bootstrap login seeds a row and issues a session, not the secret", async () => {
  const envEmail = process.env.ADMIN_EMAIL;
  const envHash = process.env.ADMIN_PASSWORD_HASH;
  process.env.ADMIN_EMAIL = "bootstrap@example.test";
  process.env.ADMIN_PASSWORD_HASH = await hashPassword("bootstrap-pass");

  try {
    // Table is empty from resetDb().
    const res = await login("bootstrap@example.test", "bootstrap-pass");
    assert.equal(res.status, 200);

    const body = (await res.json()) as { token: string; expiresAt?: string };
    assert.notEqual(body.token, ADMIN_SECRET);
    assert.ok(body.expiresAt, "bootstrap must also produce a real session");

    // And it must have persisted an admin_users row, so the next login takes
    // the normal path rather than the fallback.
    const rows = await db.select().from(adminUsersTable);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].email, "bootstrap@example.test");
  } finally {
    if (envEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = envEmail;
    if (envHash === undefined) delete process.env.ADMIN_PASSWORD_HASH;
    else process.env.ADMIN_PASSWORD_HASH = envHash;
  }
});

// With rows present, the env credential is NOT a second way in — otherwise a
// leaked env password would bypass deactivation of every console account.
test("the env credential is not accepted once admin_users is populated", async () => {
  await seedOwner();

  const envEmail = process.env.ADMIN_EMAIL;
  const envHash = process.env.ADMIN_PASSWORD_HASH;
  process.env.ADMIN_EMAIL = "ghost@example.test";
  process.env.ADMIN_PASSWORD_HASH = await hashPassword("ghost-pass");

  try {
    const res = await login("ghost@example.test", "ghost-pass");
    assert.equal(res.status, 401);
  } finally {
    if (envEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = envEmail;
    if (envHash === undefined) delete process.env.ADMIN_PASSWORD_HASH;
    else process.env.ADMIN_PASSWORD_HASH = envHash;
  }
});
