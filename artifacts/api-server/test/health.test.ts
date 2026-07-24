import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, type TestServer } from "./helpers/server";
import { resetDb } from "./helpers/db";

let server: TestServer;

before(async () => {
  server = await startTestServer();
});

after(async () => {
  await server.close();
});

// Smoke test for the harness itself: proves the app boots against the scratch
// database, serves a route, and that resetDb can talk to the schema.
test("GET /api/healthz returns ok", async () => {
  const res = await fetch(`${server.url}/api/healthz`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "ok" });
});

test("resetDb truncates without error", async () => {
  await resetDb();
});
