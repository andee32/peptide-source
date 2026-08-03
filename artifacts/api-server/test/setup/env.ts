// Preloaded via `node --import` BEFORE any test file is evaluated.
//
// This has to run first because both @app/db (lib/db/src/index.ts) and
// services/btcpay.ts read process.env at module-evaluation time — importing
// either one before these are set either throws or bakes in the wrong config.
//
// DATABASE_URL is pointed at a scratch database that createTestDb.ts owns.
// Nothing here ever touches the dev database.

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://localhost:5432/app_test";

process.env.DATABASE_URL = TEST_DB_URL;
process.env.NODE_ENV = "test";

// BTCPay: configured with throwaway values so the signature path is exercisable.
// Individual tests that need the UNCONFIGURED (fail-closed) behaviour delete
// these and re-import the module under test in their own process.
process.env.BTCPAYSERVER_URL = "https://btcpay.invalid";
process.env.BTCPAYSERVER_API_KEY = "test-api-key";
process.env.BTCPAYSERVER_STORE_ID = "test-store";
process.env.BTCPAYSERVER_WEBHOOK_SECRET = "test-webhook-secret";

// Admin break-glass credentials used by the admin route tests.
process.env.ADMIN_SECRET = "test-admin-secret";

export const TEST_DATABASE_URL = TEST_DB_URL;
