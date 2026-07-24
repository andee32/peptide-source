import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productVariantsTable } from "./products";

export const priceTiersTable = pgTable(
  "price_tiers",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    isDefault: boolean("is_default").notNull().default(false),
    // Wholesale discount off list price, in basis points (1000 = 10%). The
    // server derives every wholesale kit price as list × (1 − discountBps/10000).
    // A per-SKU price_list_entry, if present, still overrides this.
    discountBps: integer("discount_bps").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    // Hard guarantee behind the app-level 0..9000 validation: a value written
    // outside the API can't invert pricing (>10000 → free, negative → above list).
    check("price_tiers_discount_bps_range", sql`${t.discountBps} >= 0 AND ${t.discountBps} <= 9000`),
  ],
);

export const insertPriceTierSchema = createInsertSchema(priceTiersTable).omit({
  id: true,
  createdAt: true,
});
export type InsertPriceTier = z.infer<typeof insertPriceTierSchema>;
export type PriceTier = typeof priceTiersTable.$inferSelect;

export const priceListEntriesTable = pgTable(
  "price_list_entries",
  {
    id: serial("id").primaryKey(),
    priceTierId: integer("price_tier_id")
      .notNull()
      .references(() => priceTiersTable.id, { onDelete: "cascade" }),
    variantId: integer("variant_id")
      .notNull()
      .references(() => productVariantsTable.id, { onDelete: "cascade" }),
    priceCents: integer("price_cents").notNull(),
  },
  (t) => [
    uniqueIndex("price_list_entries_tier_variant_uq").on(
      t.priceTierId,
      t.variantId
    ),
  ]
);

export const insertPriceListEntrySchema = createInsertSchema(
  priceListEntriesTable
).omit({ id: true });
export type InsertPriceListEntry = z.infer<typeof insertPriceListEntrySchema>;
export type PriceListEntry = typeof priceListEntriesTable.$inferSelect;
