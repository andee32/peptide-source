import {
  pgTable,
  text,
  integer,
  jsonb,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customerAccountsTable } from "./customerAccounts";
import { customerUsersTable } from "./customerUsers";
import { discountCodesTable } from "./discountCodes";

// Bank-settled rails only, alongside crypto. Never a card processor —
// Stripe/PayPal/Square/Shopify Payments prohibit this vertical and freeze funds.
//
// zelle is WHOLESALE-ONLY and enforced as such server-side. It identifies the
// recipient by phone/email rather than an account number, so exposing it on the
// public storefront would publish a direct line to the operating bank account,
// and it has no dispute mechanism in either direction. Restricting it to
// approved B2B accounts keeps it to counterparties we already know.
export const paymentMethodEnum = pgEnum("payment_method", [
  "crypto_btc",
  "crypto_usdc",
  "ach",
  "wire",
  "zelle",
]);

export const orderChannelEnum = pgEnum("order_channel", ["retail", "wholesale"]);

export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "awaiting_payment",
  "confirmed",
  "failed",
  "expired",
  "refunded",
]);

export const paymentRecordStatusEnum = pgEnum("payment_record_status", [
  "pending",
  "confirmed",
  "expired",
  "failed",
]);

export const ordersTable = pgTable("orders", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  lineItems: jsonb("line_items").notNull(),
  subtotalCents: integer("subtotal_cents").notNull(),
  // discountCents stays authoritative for totals; the columns below give it
  // provenance. Order creation asserts
  // discountCents === promoDiscountCents + cryptoDiscountCents.
  discountCents: integer("discount_cents").notNull().default(0),
  // Slot A source: 'code' | 'subscription' (validated in app code, no pgEnum);
  // null when no promotion applied.
  discountSource: text("discount_source"),
  // Snapshot of the code string as redeemed; set iff discountSource === 'code'.
  discountCode: text("discount_code"),
  discountCodeId: integer("discount_code_id").references(
    () => discountCodesTable.id
  ),
  promoDiscountCents: integer("promo_discount_cents").notNull().default(0),
  cryptoDiscountCents: integer("crypto_discount_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull(),
  paymentMethod: paymentMethodEnum("payment_method").notNull(),
  channel: orderChannelEnum("channel").notNull().default("retail"),
  accountId: text("account_id").references(() => customerAccountsTable.id),
  // Set at checkout when a B2C shopper is signed in. Null for guest orders —
  // those are still reachable by shippingEmail match.
  customerUserId: text("customer_user_id").references(
    () => customerUsersTable.id
  ),
  status: orderStatusEnum("status").notNull().default("pending"),
  shippingName: text("shipping_name").notNull(),
  shippingEmail: text("shipping_email").notNull(),
  shippingAddress1: text("shipping_address1").notNull(),
  shippingAddress2: text("shipping_address2"),
  shippingCity: text("shipping_city").notNull(),
  shippingState: text("shipping_state").notNull(),
  shippingZip: text("shipping_zip").notNull(),
  shippingCountry: text("shipping_country").notNull().default("US"),
  trackingNumber: text("tracking_number"),
  carrier: text("carrier"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;

export const paymentRecordsTable = pgTable("payment_records", {
  id: text("id").primaryKey(),
  orderId: text("order_id")
    .notNull()
    .references(() => ordersTable.id, { onDelete: "cascade" }),
  btcpayInvoiceId: text("btcpay_invoice_id"),
  currency: text("currency").notNull(),
  amount: text("amount").notNull(),
  amountCents: integer("amount_cents").notNull(),
  paymentAddress: text("payment_address"),
  paymentUrl: text("payment_url"),
  method: text("method"),
  referenceCode: text("reference_code"),
  bankLast4: text("bank_last4"),
  txHash: text("tx_hash"),
  confirmedAt: timestamp("confirmed_at"),
  expiresAt: timestamp("expires_at").notNull(),
  status: paymentRecordStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type PaymentRecord = typeof paymentRecordsTable.$inferSelect;
