import type { Request } from "express";
import { eq } from "drizzle-orm";
import { db } from "@atlab/db";
import { customerAccountsTable } from "@atlab/db/schema";
import { resolveCustomerUser } from "./customerSession";

/**
 * Wholesale session resolution — the kit catalog (and its pricing) is
 * account-holders-only, so every wholesale-catalog route resolves the caller's
 * x-account-token to an APPROVED account row before returning anything.
 *
 * Same predicate as order creation and GET /accounts/:id: the opaque
 * accessToken minted at application time, presented via the x-account-token
 * header. Not a general auth system — one token per account. Access is revoked
 * today by moving the account off `approved` status (there is no
 * token-rotation endpoint yet); the status check below is what enforces it.
 */
export type WholesaleAccount = typeof customerAccountsTable.$inferSelect;

export function extractAccountToken(req: Request): string | undefined {
  const fromHeader = req.headers["x-account-token"];
  const headerVal = Array.isArray(fromHeader) ? fromHeader[0] : fromHeader;
  return headerVal || undefined;
}

/** Resolves the request's wholesale account, or null when the token is
 * missing, unknown, or the account is not approved. */
export async function resolveWholesaleAccount(
  req: Request
): Promise<WholesaleAccount | null> {
  const token = extractAccountToken(req);
  if (!token) return null;
  const account = await db.query.customerAccountsTable.findFirst({
    where: eq(customerAccountsTable.accessToken, token),
  });
  if (!account || account.status !== "approved" || !account.accessToken) {
    return null;
  }
  return account;
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
