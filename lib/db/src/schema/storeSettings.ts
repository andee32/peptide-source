import { pgTable, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";

// Global store settings — a single fixed row (id='default'). Holds admin-controlled
// storefront toggles. Read publicly (GET /settings), written via admin (PATCH
// /admin/settings). The seed upserts the 'default' row so it always exists.
export const storeSettingsTable = pgTable("store_settings", {
  id: text("id").primaryKey().default("default"),
  showVialImages: boolean("show_vial_images").notNull().default(true),
  // Retail crypto-payment discount in basis points (1000 = 10%). 0 disables it.
  // Applied server-side at order creation; wholesale orders never receive it.
  cryptoDiscountBps: integer("crypto_discount_bps").notNull().default(1000),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type StoreSettings = typeof storeSettingsTable.$inferSelect;
