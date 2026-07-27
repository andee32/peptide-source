import { pgTable, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";

// Admin on/off for each fixed payment rail, per channel. The rail SET is fixed
// in code (crypto_btc, crypto_usdc, ach, wire, zelle) — this table only stores
// whether each is enabled for retail and/or wholesale. A method is actually
// LIVE only when enabled for the channel AND its backend config is provisioned
// (fail-closed guards in services/*); this toggle never bypasses that.
//
// Zelle is wholesale-only by invariant: enabledRetail is forced false and the
// order path rejects Zelle on any retail order regardless of this row.
export const paymentMethodsTable = pgTable("payment_methods", {
  method: text("method").primaryKey(),
  enabledRetail: boolean("enabled_retail").notNull().default(false),
  enabledWholesale: boolean("enabled_wholesale").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type PaymentMethodRow = typeof paymentMethodsTable.$inferSelect;
