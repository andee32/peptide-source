import { createHash, randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import type { Request } from "express";
import { db } from "@app/db";
import {
  customerSessionsTable,
  customerUsersTable,
  type CustomerUser,
} from "@app/db/schema";

export const SESSION_TTL_DAYS = 30;

// Sessions are stored by digest, never in the clear: the token is a bearer
// credential, so a leaked DB dump (or a stray log of a row) must not be
// replayable. sha256 with no salt is correct here — the token is already 256
// bits of entropy, so there is nothing to brute-force.
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function bearerToken(req: Request): string | undefined {
  const raw = req.headers.authorization;
  if (!raw) return undefined;
  const [scheme, value] = raw.split(" ");
  if (!value || scheme.toLowerCase() !== "bearer") return undefined;
  return value.trim() || undefined;
}

export async function createCustomerSession(
  customerUserId: string
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
  );
  await db
    .insert(customerSessionsTable)
    .values({ tokenHash: hashSessionToken(token), customerUserId, expiresAt });
  return { token, expiresAt };
}

export async function deleteCustomerSession(token: string): Promise<void> {
  await db
    .delete(customerSessionsTable)
    .where(eq(customerSessionsTable.tokenHash, hashSessionToken(token)));
}

// Resolves the signed-in retail shopper, or null. Expired sessions are deleted
// on sight so the table self-prunes.
export async function resolveCustomerUser(
  req: Request
): Promise<CustomerUser | null> {
  const token = bearerToken(req);
  if (!token) return null;
  const tokenHash = hashSessionToken(token);

  const session = await db.query.customerSessionsTable.findFirst({
    where: eq(customerSessionsTable.tokenHash, tokenHash),
  });
  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    await db
      .delete(customerSessionsTable)
      .where(eq(customerSessionsTable.tokenHash, tokenHash));
    return null;
  }

  const user = await db.query.customerUsersTable.findFirst({
    where: eq(customerUsersTable.id, session.customerUserId),
  });
  return user ?? null;
}
