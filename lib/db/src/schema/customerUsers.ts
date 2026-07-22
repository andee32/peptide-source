import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// B2C retail shoppers. DISTINCT from customer_accounts (the B2B wholesale
// entity, which authenticates with a magic accessToken). Retail accounts are
// optional — guest checkout stays open.
export const customerUsersTable = pgTable("customer_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCustomerUserSchema = createInsertSchema(
  customerUsersTable
).omit({ createdAt: true });
export type InsertCustomerUser = z.infer<typeof insertCustomerUserSchema>;
export type CustomerUser = typeof customerUsersTable.$inferSelect;

// Opaque bearer sessions — revocable server-side (logout), unlike a signed JWT.
// Only the sha256 of the token is persisted; the raw token is returned once at
// login/register and never stored, so DB read access does not yield live
// sessions.
export const customerSessionsTable = pgTable("customer_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  customerUserId: text("customer_user_id")
    .notNull()
    .references(() => customerUsersTable.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type CustomerSession = typeof customerSessionsTable.$inferSelect;
