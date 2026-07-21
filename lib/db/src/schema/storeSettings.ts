import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";

// Global store settings — a single fixed row (id='default'). Holds admin-controlled
// storefront toggles. Read publicly (GET /settings), written via admin (PATCH
// /admin/settings). The seed upserts the 'default' row so it always exists.
export const storeSettingsTable = pgTable("store_settings", {
  id: text("id").primaryKey().default("default"),
  showVialImages: boolean("show_vial_images").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type StoreSettings = typeof storeSettingsTable.$inferSelect;
