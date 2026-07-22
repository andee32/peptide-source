import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Back-office operators. Passwords are PBKDF2 (100000 / 32 / sha256) stored as
// "salt:hash" — the same scheme the env-based ADMIN_PASSWORD_HASH uses, so the
// bootstrap admin migrates across verbatim.
export const adminUsersTable = pgTable("admin_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAdminUserSchema = createInsertSchema(adminUsersTable).omit({
  createdAt: true,
});
export type InsertAdminUser = z.infer<typeof insertAdminUserSchema>;
export type AdminUser = typeof adminUsersTable.$inferSelect;

// Opaque bearer sessions for the back-office console. The raw token is returned
// once at login and never stored — only its sha256 — so a DB read cannot be
// replayed as a console credential. Every /admin request resolves through here,
// which is what makes deactivation and password reset actually revoke access.
export const adminSessionsTable = pgTable("admin_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  adminUserId: text("admin_user_id")
    .notNull()
    .references(() => adminUsersTable.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  revokedAt: timestamp("revoked_at"),
});

export type AdminSession = typeof adminSessionsTable.$inferSelect;
