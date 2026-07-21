import {
  pgTable,
  text,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";

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
