// Drops and recreates the scratch test database, then applies the Drizzle
// schema to it. Run once before the suite (`pnpm run test:db`).
//
// SAFETY: this issues DROP DATABASE. It refuses to run against any database
// whose name does not end in `_test`, so pointing TEST_DATABASE_URL at the dev
// database (atlab_sourcing) aborts instead of destroying it.

import { execFileSync } from "node:child_process";
import pg from "pg";
import { TEST_DATABASE_URL } from "./env";

const url = new URL(TEST_DATABASE_URL);
const dbName = url.pathname.replace(/^\//, "");

if (!dbName.endsWith("_test")) {
  console.error(
    `Refusing to drop "${dbName}": the test database name must end in "_test".`
  );
  process.exit(1);
}

const maintenanceUrl = new URL(TEST_DATABASE_URL);
maintenanceUrl.pathname = "/postgres";

const admin = new pg.Client({ connectionString: maintenanceUrl.toString() });
await admin.connect();
await admin.query(`DROP DATABASE IF EXISTS ${JSON.stringify(dbName)}`);
await admin.query(`CREATE DATABASE ${JSON.stringify(dbName)}`);
await admin.end();

// push-force skips drizzle-kit's interactive rename prompt. That prompt is the
// documented cause of a push silently not applying; on a database we just
// created there is nothing to rename, so forcing is safe here.
execFileSync("pnpm", ["--filter", "@atlab/db", "run", "push-force"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
});

console.log(`Test database ready: ${dbName}`);
