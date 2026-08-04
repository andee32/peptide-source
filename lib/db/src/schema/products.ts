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
import { bytea } from "./bytea";

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

export const complianceStatusEnum = pgEnum("compliance_status", [
  "blocked",
  "restricted",
  "cleared",
]);

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
  complianceStatus: complianceStatusEnum("compliance_status")
    .notNull()
    .default("cleared"),
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
  // Retail price for KIT variants (priceCents is the wholesale list price for
  // kits). Null = kit is wholesale-only and hidden from the retail store.
  // Vial variants ignore this — priceCents IS their retail price.
  retailPriceCents: integer("retail_price_cents"),
  sku: text("sku").notNull().unique(),
  unitType: unitTypeEnum("unit_type").notNull().default("vial"),
  vialsPerUnit: integer("vials_per_unit").notNull().default(1),
  inStock: boolean("in_stock").notNull().default(true),
  // COA document link for this SKU: a third-party Janoshik verify URL (preferred —
  // tamper-evident proof) or a hosted certificate image. Null = no COA published
  // yet. This is the document link shown as "View COA"; structured per-lot results
  // live separately in coa_results.
  coaUrl: text("coa_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProductVariantSchema = createInsertSchema(
  productVariantsTable
).omit({ id: true, createdAt: true });
export type InsertProductVariant = z.infer<typeof insertProductVariantSchema>;
export type ProductVariant = typeof productVariantsTable.$inferSelect;

// An uploaded catalog image, stored alongside the rest of the operator's binary
// assets rather than in object storage. One row per product: an upload replaces
// the previous image, so `products.imageUrl` can keep pointing at the stable
// public path (/api/products/:id/image) instead of changing on every re-upload.
export const productImagesTable = pgTable("product_images", {
  productId: integer("product_id")
    .primaryKey()
    .references(() => productsTable.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  data: bytea("data").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ProductImage = typeof productImagesTable.$inferSelect;

export const productsRelations = relations(productsTable, ({ many }) => ({
  variants: many(productVariantsTable),
}));

export const productVariantsRelations = relations(productVariantsTable, ({ one }) => ({
  product: one(productsTable, {
    fields: [productVariantsTable.productId],
    references: [productsTable.id],
  }),
}));
