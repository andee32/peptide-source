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

export const paymentMethodEnum = pgEnum("payment_method", [
  "crypto_btc",
  "crypto_usdc",
  "ach",
  "wire",
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
  discountCents: integer("discount_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull(),
  paymentMethod: paymentMethodEnum("payment_method").notNull(),
  channel: orderChannelEnum("channel").notNull().default("retail"),
  accountId: text("account_id").references(() => customerAccountsTable.id),
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
