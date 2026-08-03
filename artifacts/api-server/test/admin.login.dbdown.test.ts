import { test, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { db, pool } from "@app/db";
import { adminUsersTable } from "@app/db/schema";
import app from "../src/app";
import { hashPassword } from "../src/lib/password";

// The subtle half of the login fix: a DATABASE ERROR must not downgrade to the
// env-credential path.
//
// The lookup used to sit inside a try whose catch only logged and fell through,
// so a transient DB blip — not just an empty admin_users table — routed the
// operator to the env credential and returned the shared ADMIN_SECRET verbatim.
// That secret never expires, has no session row, and revokeAdminSessions cannot
// reach it, so one hiccup converted a session login into a permanent master key
// sitting in the browser.
//
// Own file: it kills the connection pool, which would break every other test in
// the process. node:test gives each file its own process.

const ADMIN_SECRET = "test-admin-secret";

// Env credential is valid and would be accepted if the code fell through.
process.env.ADMIN_EMAIL = "owner@example.test";
process.env.ADMIN_PASSWORD_HASH = await hashPassword("env-fallback-pass");

const server: Server = await new Promise((resolve) => {
  const s = app.listen(0, () => resolve(s));
});
const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

after(async () => {
  await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
});

test("a database failure fails closed instead of issuing the shared secret", async () => {
  // Sanity: the pool works before we break it.
  await db.select().from(adminUsersTable).limit(1);

  // Break it. Every subsequent query throws.
  await pool.end();

  const res = await fetch(`${url}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "owner@example.test",
      password: "env-fallback-pass",
    }),
  });

  const raw = await res.text();

  assert.equal(res.status, 503, `expected fail-closed, got ${res.status}: ${raw}`);
  assert.ok(
    !raw.includes(ADMIN_SECRET),
    "the response must never contain the break-glass secret"
  );
});
