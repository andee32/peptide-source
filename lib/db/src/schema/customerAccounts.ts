import {
  pgTable,
  text,
  integer,
  timestamp,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { priceTiersTable } from "./pricing";
import { customerUsersTable } from "./customerUsers";

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
  // Informational business-contact email. Login identity + uniqueness live on
  // customer_users.email; this is no longer a login credential (post-cutover).
  email: text("email").notNull(),
  phone: text("phone"),
  taxId: text("tax_id"),
  resaleCertUrl: text("resale_cert_url"),
  status: accountStatusEnum("status").notNull().default("pending"),
  businessType: businessTypeEnum("business_type"),
  priceTierId: integer("price_tier_id").references(() => priceTiersTable.id),
  // The owning login identity. Wholesale auth is "signed-in user whose linked
  // profile is approved" — resolved from the session, never a token. NOT NULL
  // post-cutover (every profile belongs to an identity). onDelete restrict: a
  // KYB/business record must not be silently hard-deleted with its identity.
  customerUserId: text("customer_user_id")
    .notNull()
    .references(() => customerUsersTable.id, { onDelete: "restrict" }),
  kybNotes: text("kyb_notes"),
  approvedAt: timestamp("approved_at"),
  approvedBy: text("approved_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  // 1:1 — one wholesale profile per identity.
  uniqueIndex("customer_accounts_customer_user_id_unique").on(t.customerUserId),
]);

export const insertCustomerAccountSchema = createInsertSchema(
  customerAccountsTable
).omit({ createdAt: true });
export type InsertCustomerAccount = z.infer<typeof insertCustomerAccountSchema>;
export type CustomerAccount = typeof customerAccountsTable.$inferSelect;
