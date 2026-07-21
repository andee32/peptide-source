import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  real,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const categoryEnum = pgEnum("category", [
  "metabolic",
  "longevity",
  "recovery",
  "cognitive",
  "other",
]);

export const sourcingPathEnum = pgEnum("sourcing_path", [
  "usa_domestic",
  "asia_warehouse",
]);

export const unitTypeEnum = pgEnum("unit_type", ["vial", "kit"]);

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  category: categoryEnum("category").notNull().default("other"),
  sourcingPath: sourcingPathEnum("sourcing_path"),
  shortDescription: text("short_description").notNull(),
  longDescription: text("long_description").notNull().default(""),
  featured: boolean("featured").notNull().default(false),
  imageUrl: text("image_url"),
  published: boolean("published").notNull().default(true),
  researchUses: text("research_uses").array().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;

export const productVariantsTable = pgTable("product_variants", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => productsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  concentration: text("concentration").notNull(),
  sizeml: real("size_ml").notNull(),
  priceCents: integer("price_cents").notNull(),
  sku: text("sku").notNull().unique(),
  unitType: unitTypeEnum("unit_type").notNull().default("vial"),
  vialsPerUnit: integer("vials_per_unit").notNull().default(1),
  inStock: boolean("in_stock").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProductVariantSchema = createInsertSchema(
  productVariantsTable
).omit({ id: true, createdAt: true });
export type InsertProductVariant = z.infer<typeof insertProductVariantSchema>;
export type ProductVariant = typeof productVariantsTable.$inferSelect;

export const productsRelations = relations(productsTable, ({ many }) => ({
  variants: many(productVariantsTable),
}));

export const productVariantsRelations = relations(productVariantsTable, ({ one }) => ({
  product: one(productsTable, {
    fields: [productVariantsTable.productId],
    references: [productsTable.id],
  }),
}));
