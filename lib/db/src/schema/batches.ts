import {
  pgTable,
  text,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable, productVariantsTable } from "./products";
import { bytea } from "./bytea";

export const batchStatusEnum = pgEnum("batch_status", [
  "pending",
  "released",
  "quarantined",
]);

export const testTypeEnum = pgEnum("test_type", [
  "purity",
  "endotoxin",
  "sterility",
  "heavyMetals",
]);

export const batchesTable = pgTable("batches", {
  id: text("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => productsTable.id, { onDelete: "cascade" }),
  status: batchStatusEnum("status").notNull().default("pending"),
  productionDate: timestamp("production_date").notNull().defaultNow(),
  // Fail-safe demo flag: defaults to true so any un-flagged/seeded batch is
  // treated as fabricated demo data and never presented as a real COA.
  isDemo: boolean("is_demo").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBatchSchema = createInsertSchema(batchesTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertBatch = z.infer<typeof insertBatchSchema>;
export type Batch = typeof batchesTable.$inferSelect;

export const coaResultsTable = pgTable("coa_results", {
  id: text("id").primaryKey(),
  batchId: text("batch_id")
    .notNull()
    .references(() => batchesTable.id, { onDelete: "cascade" }),
  testType: testTypeEnum("test_type").notNull(),
  purityPercent: real("purity_percent"),
  endotoxinEuPerMl: real("endotoxin_eu_per_ml"),
  sterilityPass: boolean("sterility_pass"),
  heavyMetals: jsonb("heavy_metals"),
  labName: text("lab_name").notNull().default("Janoshik Analytical"),
  testedAt: timestamp("tested_at").notNull().defaultNow(),
  janoshikTaskId: text("janoshik_task_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCoaResultSchema = createInsertSchema(coaResultsTable).omit({
  createdAt: true,
});
export type InsertCoaResult = z.infer<typeof insertCoaResultSchema>;
export type CoaResult = typeof coaResultsTable.$inferSelect;

// A COA document hangs off EITHER a production batch (lot-specific COA) or a
// product variant (the peptide/SKU's current certificate) — never both, never
// neither. Most first-party COAs are per-SKU, so variant-scoped is the common
// case; batch-scoped stays for genuinely lot-specific results.
export const coaDocumentsTable = pgTable(
  "coa_documents",
  {
    id: text("id").primaryKey(),
    batchId: text("batch_id").references(() => batchesTable.id, {
      onDelete: "cascade",
    }),
    variantId: integer("variant_id").references(() => productVariantsTable.id, {
      onDelete: "cascade",
    }),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    data: bytea("data").notNull(),
    // Values read off the document by the AI extraction pass. Nullable: the
    // extractor fails soft (no API key / unreadable scan), and an operator can
    // correct or clear any field. Displayed alongside the COA link.
    purityPercent: real("purity_percent"),
    endotoxinEuPerMl: real("endotoxin_eu_per_ml"),
    sterilityPass: boolean("sterility_pass"),
    labName: text("lab_name"),
    testedAt: timestamp("tested_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    // Exactly one owner. Enforced in the DB so no code path can orphan a
    // document or attach it to both.
    check(
      "coa_documents_one_owner",
      sql`(${t.batchId} IS NOT NULL AND ${t.variantId} IS NULL) OR (${t.batchId} IS NULL AND ${t.variantId} IS NOT NULL)`
    ),
  ]
);

export const insertCoaDocumentSchema = createInsertSchema(coaDocumentsTable).omit({
  createdAt: true,
});
export type InsertCoaDocument = z.infer<typeof insertCoaDocumentSchema>;
export type CoaDocument = typeof coaDocumentsTable.$inferSelect;
