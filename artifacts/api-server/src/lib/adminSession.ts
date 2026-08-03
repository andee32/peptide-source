import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { Request } from "express";
import { db } from "@app/db";
import {
  adminSessionsTable,
  adminUsersTable,
  type AdminUser,
} from "@app/db/schema";

export const ADMIN_SESSION_TTL_HOURS = 12;

// Console sessions are stored by digest only — see customerSession.ts for why.
export function hashAdminToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The credential the console presents. Historically the shared ADMIN_SECRET. */
export function adminKeyFromRequest(req: Request): string | undefined {
  const raw = req.headers["x-admin-key"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() || undefined;
}

export async function createAdminSession(
  adminUserId: string
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(
    Date.now() + ADMIN_SESSION_TTL_HOURS * 60 * 60 * 1000
  );
  await db
    .insert(adminSessionsTable)
    .values({ tokenHash: hashAdminToken(token), adminUserId, expiresAt });
  return { token, expiresAt };
}

/**
 * Kills every live session for an operator. Called whenever their standing to
 * use the console changes — deactivation and password reset. Without this,
 * both controls are cosmetic.
 */
export async function revokeAdminSessions(
  adminUserId: string,
  // Optional transaction handle so a caller can revoke in the SAME transaction
  // as the change that motivated it. A password write that commits while its
  // revoke rolls back leaves sessions opened under the old password live
  // against the new one.
  tx: Pick<typeof db, "update"> = db
): Promise<void> {
  await tx
    .update(adminSessionsTable)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(adminSessionsTable.adminUserId, adminUserId),
        isNull(adminSessionsTable.revokedAt)
      )
    );
}

/**
 * Constant-time comparison against the ops break-glass secret. Digesting first
 * gives both sides a fixed length, so timingSafeEqual cannot throw and the
 * comparison leaks neither length nor content.
 */
export function isBreakGlassKey(key: string | undefined): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || !key) return false;
  return timingSafeEqual(
    createHash("sha256").update(key).digest(),
    createHash("sha256").update(secret).digest()
  );
}

export type AdminIdentity = {
  /** The operator behind the request, or null on the break-glass path. */
  user: AdminUser | null;
  breakGlass: boolean;
};

/**
 * Resolves an admin request to an identity, or null if unauthenticated.
 *
 * Session first: the token issued by /admin/login is looked up, and the backing
 * admin_users row must still exist, be active, and the session unexpired and
 * unrevoked. That chain is what makes deactivation take effect immediately.
 *
 * The env ADMIN_SECRET remains accepted as an ops break-glass fallback so a
 * broken/empty admin_users table can never lock the owner out — but it is no
 * longer what a normal login hands back.
 */
export async function authenticateAdmin(
  req: Request
): Promise<AdminIdentity | null> {
  const key = adminKeyFromRequest(req);
  if (!key) return null;

  try {
    const session = await db.query.adminSessionsTable.findFirst({
      where: eq(adminSessionsTable.tokenHash, hashAdminToken(key)),
    });
    if (session) {
      if (session.revokedAt !== null) return null;
      if (session.expiresAt.getTime() <= Date.now()) return null;

      const user = await db.query.adminUsersTable.findFirst({
        where: eq(adminUsersTable.id, session.adminUserId),
      });
      if (!user || !user.isActive) return null;
      return { user, breakGlass: false };
    }
  } catch (err) {
    // A DB outage must not silently downgrade auth — fall through to
    // break-glass, which is the documented recovery path.
    console.error("authenticateAdmin session lookup failed:", err);
  }

  return isBreakGlassKey(key) ? { user: null, breakGlass: true } : null;
}

/** Boolean form for routes that only branch on "is this an admin?". */
export async function isAdminRequest(req: Request): Promise<boolean> {
  return (await authenticateAdmin(req)) !== null;
}

/** Email to stamp on audit fields. Falls back on the break-glass path. */
export function adminActorEmail(req: Request): string {
  return (
    req.adminIdentity?.user?.email ??
    process.env.ADMIN_EMAIL?.trim().toLowerCase() ??
    "admin"
  );
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      adminIdentity?: AdminIdentity;
    }
  }
}
