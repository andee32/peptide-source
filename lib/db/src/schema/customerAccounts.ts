import {
  pgTable,
  text,
  integer,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { priceTiersTable } from "./pricing";

export const accountStatusEnum = pgEnum("account_status", [
  "pending",
  "approved",
  "rejected",
  "suspended",
]);

export const businessTypeEnum = pgEnum("business_type", [
  "research_lab",
  "clinic",
  "reseller",
  "distributor",
  "other",
]);

export const customerAccountsTable = pgTable("customer_accounts", {
  id: text("id").primaryKey(),
  businessName: text("business_name").notNull(),
  contactName: text("contact_name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  taxId: text("tax_id"),
  resaleCertUrl: text("resale_cert_url"),
  status: accountStatusEnum("status").notNull().default("pending"),
  businessType: businessTypeEnum("business_type"),
  priceTierId: integer("price_tier_id").references(() => priceTiersTable.id),
  accessToken: text("access_token").notNull().default(""),
  kybNotes: text("kyb_notes"),
  approvedAt: timestamp("approved_at"),
  approvedBy: text("approved_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCustomerAccountSchema = createInsertSchema(
  customerAccountsTable
).omit({ createdAt: true });
export type InsertCustomerAccount = z.infer<typeof insertCustomerAccountSchema>;
export type CustomerAccount = typeof customerAccountsTable.$inferSelect;
