import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, type TestServer } from "./helpers/server";
import { resetDb } from "./helpers/db";

// The shipper/fulfillment email is admin-configurable and must NOT be exposed on
// the public GET /settings. ADMIN_SECRET is set in env.ts.
const ADMIN = { "Content-Type": "application/json", "x-admin-key": "test-admin-secret" };

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

function patchSettings(body: unknown) {
  return fetch(`${server.url}/api/admin/settings`, {
    method: "PATCH",
    headers: ADMIN,
    body: JSON.stringify(body),
  });
}

test("admin can set + read the fulfillment email; the public endpoint never exposes it", async () => {
  const set = await patchSettings({ fulfillmentEmail: "shipper@example.test" });
  assert.equal(set.status, 200);
  assert.equal(((await set.json()) as { fulfillmentEmail: string }).fulfillmentEmail, "shipper@example.test");

  const adminGet = await fetch(`${server.url}/api/admin/settings`, { headers: ADMIN });
  assert.equal(((await adminGet.json()) as { fulfillmentEmail: string }).fulfillmentEmail, "shipper@example.test");

  const pub = await fetch(`${server.url}/api/settings`);
  const pubBody = (await pub.json()) as Record<string, unknown>;
  assert.equal("fulfillmentEmail" in pubBody, false, "shipper email must not be public");
});

test("an invalid fulfillment email is rejected", async () => {
  const res = await patchSettings({ fulfillmentEmail: "not-an-email" });
  assert.equal(res.status, 400);
});

test("an empty string clears the fulfillment email", async () => {
  await patchSettings({ fulfillmentEmail: "x@y.test" });
  const clr = await patchSettings({ fulfillmentEmail: "" });
  assert.equal(clr.status, 200);
  assert.equal(((await clr.json()) as { fulfillmentEmail: string | null }).fulfillmentEmail, null);
});

test("GET /admin/settings requires the admin key", async () => {
  const res = await fetch(`${server.url}/api/admin/settings`);
  assert.equal(res.status, 401);
});
