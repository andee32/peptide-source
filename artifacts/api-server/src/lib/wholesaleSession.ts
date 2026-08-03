import type { Request } from "express";
import { eq } from "drizzle-orm";
import { db } from "@app/db";
import { customerAccountsTable } from "@app/db/schema";
import { resolveCustomerUser } from "./customerSession";

/**
 * Wholesale session resolution — the kit catalog (and its pricing) is
 * account-holders-only, so every wholesale-catalog route resolves the caller's
 * signed-in identity to an APPROVED linked account row before returning
 * anything.
 *
 * Same predicate as order creation and GET /accounts/:id: the wholesale profile
 * (customer_accounts) linked to the session's identity via customerUserId. Post
 * account-unification there is no access token — auth is the retail session and
 * the account's `approved` status. Access is revoked by moving the account off
 * `approved`; the status check below is what enforces it on every request.
 */
export type WholesaleAccount = typeof customerAccountsTable.$inferSelect;

/**
 * Resolves the request's APPROVED wholesale account, or null. Session-authenticated: the signed-in user's linked profile, if approved.
 */
export async function resolveWholesaleAccount(
  req: Request
): Promise<WholesaleAccount | null> {
  const user = await resolveCustomerUser(req);
  if (!user) return null;
  const account = await db.query.customerAccountsTable.findFirst({
    where: eq(customerAccountsTable.customerUserId, user.id),
  });
  return account && account.status === "approved" ? account : null;
}

/**
 * The signed-in user's wholesale profile, ANY status (approved/pending/rejected/
 * suspended) — for display on /auth/me. Distinct from resolveWholesaleAccount
 * which returns only approved rows for gating. Reads by the linked
 * customerUserId (account-unification); returns null until the account is
 * linked by the backfill, or when the caller has no session / no profile.
 */
export async function resolveWholesaleProfile(
  req: Request
): Promise<WholesaleAccount | null> {
  const user = await resolveCustomerUser(req);
  if (!user) return null;
  return (
    (await db.query.customerAccountsTable.findFirst({
      where: eq(customerAccountsTable.customerUserId, user.id),
    })) ?? null
  );
}
