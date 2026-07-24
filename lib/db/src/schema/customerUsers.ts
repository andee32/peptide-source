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
  // NULL = invited but not yet activated (holds an unusable sentinel hash);
  // set = the user has chosen a real password. This is the AUTHORITATIVE
  // "activated" signal — never test the sentinel string. Backs the migration
  // invite flow (account-unification design).
  passwordSetAt: timestamp("password_set_at"),
  name: text("name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Single-use tokens for password reset AND migration invite (same flow, longer
// TTL for invite). Only the sha256 of the token is stored; the raw token is
// emailed once and never persisted.
export const passwordResetTokensTable = pgTable("password_reset_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  customerUserId: text("customer_user_id")
    .notNull()
    .references(() => customerUsersTable.id, { onDelete: "cascade" }),
  purpose: text("purpose").notNull(), // "reset" (1h TTL) | "invite" (long TTL)
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type PasswordResetToken = typeof passwordResetTokensTable.$inferSelect;

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
