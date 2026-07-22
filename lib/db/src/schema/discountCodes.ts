import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

// Retail promo codes — Slot A of the two-slot discount model
// (docs/discount-system-design.md). Codes are stored UPPERCASE; lookups
// uppercase the input. Rows are never hard-deleted (orders reference them for
// per-code reporting) — deactivate instead.
export const discountCodesTable = pgTable("discount_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  // 1..5000 (same ceiling as store_settings.crypto_discount_bps).
  percentBps: integer("percent_bps").notNull(),
  active: boolean("active").notNull().default(true),
  expiresAt: timestamp("expires_at"), // null = never expires
  maxUses: integer("max_uses"), // null = unlimited (total uses, not per-customer)
  timesUsed: integer("times_used").notNull().default(0),
  note: text("note"), // attribution ledger: "affiliate — @DrSmith"
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type DiscountCode = typeof discountCodesTable.$inferSelect;
