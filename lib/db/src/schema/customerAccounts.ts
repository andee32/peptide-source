import {
  pgTable,
  text,
  integer,
  timestamp,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
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
  email: text("email").notNull().unique(),
  phone: text("phone"),
  taxId: text("tax_id"),
  resaleCertUrl: text("resale_cert_url"),
  status: accountStatusEnum("status").notNull().default("pending"),
  businessType: businessTypeEnum("business_type"),
  priceTierId: integer("price_tier_id").references(() => priceTiersTable.id),
  // Looked up by resolveWholesaleAccount() on every kit-catalog request; a
  // duplicate would resolve to an arbitrary row. Uniqueness is enforced by a
  // partial index below — empty string means "no token issued" (never accepted
  // by the falsy guard) and may legitimately repeat across accounts that never
  // got one. Access is revoked via account status, not by clearing this column.
  accessToken: text("access_token").notNull().default(""),
  // The owning login identity (account-unification). Nullable during the
  // migration window (backfill links existing accounts; flips to NOT NULL at
  // cutover). Once linked, wholesale auth is "signed-in user whose profile is
  // approved" — the accessToken is retired at cutover. onDelete restrict: a
  // KYB/business record must not be silently hard-deleted with its identity.
  customerUserId: text("customer_user_id").references(
    () => customerUsersTable.id,
    { onDelete: "restrict" },
  ),
  kybNotes: text("kyb_notes"),
  approvedAt: timestamp("approved_at"),
  approvedBy: text("approved_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("customer_accounts_access_token_unique")
    .on(t.accessToken)
    .where(sql`${t.accessToken} <> ''`),
  // 1:1 — one wholesale profile per identity. Partial so the many NULLs during
  // migration don't collide.
  uniqueIndex("customer_accounts_customer_user_id_unique")
    .on(t.customerUserId)
    .where(sql`${t.customerUserId} is not null`),
]);

export const insertCustomerAccountSchema = createInsertSchema(
  customerAccountsTable
).omit({ createdAt: true });
export type InsertCustomerAccount = z.infer<typeof insertCustomerAccountSchema>;
export type CustomerAccount = typeof customerAccountsTable.$inferSelect;
