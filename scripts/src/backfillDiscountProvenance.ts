// One-time backfill for the discount-provenance columns
// (docs/discount-system-design.md, Phase B). Before promo codes existed, the
// crypto payment incentive was the only mechanism that ever wrote
// orders.discount_cents, so stamping every discounted order as crypto is
// provably correct. Idempotent: only touches rows whose provenance columns are
// still zero. Safe to re-run; must run before the first code-bearing order.
import { sql } from "drizzle-orm";
import { db, pool } from "@atlab/db";

const result = await db.execute(sql`
  UPDATE orders
  SET crypto_discount_cents = discount_cents
  WHERE discount_cents > 0
    AND promo_discount_cents = 0
    AND crypto_discount_cents = 0
`);

console.log(`Backfilled ${result.rowCount ?? 0} order(s).`);
await pool.end();
