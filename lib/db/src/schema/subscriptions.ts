import {
  pgTable,
  text,
  serial,
  integer,
  jsonb,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "paused",
  "cancelled",
]);

export const subscriptionEventTypeEnum = pgEnum("subscription_event_type", [
  "created",
  "skipped",
  "cancelled",
  "renewed",
  "paused",
  "resumed",
]);

export const subscriptionPlansTable = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull().default(""),
  intervalDays: integer("interval_days").notNull(),
  productBundle: jsonb("product_bundle").notNull().default([]),
  pricePerIntervalCents: integer("price_per_interval_cents").notNull(),
  imageUrl: text("image_url"),
  featured: integer("featured").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSubscriptionPlanSchema = createInsertSchema(
  subscriptionPlansTable
).omit({ id: true, createdAt: true });
export type InsertSubscriptionPlan = z.infer<
  typeof insertSubscriptionPlanSchema
>;
export type SubscriptionPlan = typeof subscriptionPlansTable.$inferSelect;

export const subscriptionsTable = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  customerEmail: text("customer_email").notNull(),
  customerName: text("customer_name").notNull().default(""),
  planId: integer("plan_id")
    .notNull()
    .references(() => subscriptionPlansTable.id),
  status: subscriptionStatusEnum("status").notNull().default("active"),
  intervalDays: integer("interval_days").notNull(),
  nextBillingDate: timestamp("next_billing_date").notNull(),
  shippingAddress: jsonb("shipping_address").notNull().default({}),
  notes: text("notes"),
  accessToken: text("access_token").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSubscriptionSchema = createInsertSchema(
  subscriptionsTable
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptionsTable.$inferSelect;

export const subscriptionEventsTable = pgTable("subscription_events", {
  id: serial("id").primaryKey(),
  subscriptionId: integer("subscription_id")
    .notNull()
    .references(() => subscriptionsTable.id, { onDelete: "cascade" }),
  eventType: subscriptionEventTypeEnum("event_type").notNull(),
  metadata: jsonb("metadata").default({}),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
});

export type SubscriptionEvent = typeof subscriptionEventsTable.$inferSelect;
