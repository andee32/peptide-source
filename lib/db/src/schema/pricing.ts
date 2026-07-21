import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productVariantsTable } from "./products";

export const priceTiersTable = pgTable("price_tiers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

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
