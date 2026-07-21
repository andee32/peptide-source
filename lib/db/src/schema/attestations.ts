import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { ordersTable } from "./orders";
import { customerAccountsTable } from "./customerAccounts";

// Server-side RUO (Research Use Only) attestation, persisted per order. This is
// the compliance record of record — never a client-side checkbox. One row is
// written in the same flow as each order insert (see routes/orders.ts).
export const orderAttestationsTable = pgTable("order_attestations", {
  id: serial("id").primaryKey(),
  orderId: text("order_id")
    .notNull()
    .references(() => ordersTable.id, { onDelete: "cascade" }),
  accountId: text("account_id").references(() => customerAccountsTable.id),
  attestationVersion: text("attestation_version").notNull(),
  attestationText: text("attestation_text").notNull(),
  ruoAffirmed: boolean("ruo_affirmed").notNull(),
  signerName: text("signer_name").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type OrderAttestation = typeof orderAttestationsTable.$inferSelect;
