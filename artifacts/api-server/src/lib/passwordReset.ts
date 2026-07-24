import { createHash, randomBytes } from "crypto";
import { eq, and, isNull, gt } from "drizzle-orm";
import { db } from "@atlab/db";
import { passwordResetTokensTable } from "@atlab/db/schema";

// Password-reset / migration-invite tokens. Same discipline as customer
// sessions: only the sha256 of the token is stored; the raw token is returned
// once (emailed) and never persisted, so DB read access yields no usable token.

export type ResetPurpose = "reset" | "invite";

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const INVITE_TTL_MS = 21 * 24 * 60 * 60 * 1000; // 21 days

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Mints a token, persists only its hash, returns the raw token to email. */
export async function createResetToken(
  customerUserId: string,
  purpose: ResetPurpose,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(
    Date.now() + (purpose === "invite" ? INVITE_TTL_MS : RESET_TTL_MS),
  );
  await db.insert(passwordResetTokensTable).values({
    tokenHash: hashResetToken(token),
    customerUserId,
    purpose,
    expiresAt,
  });
  return { token, expiresAt };
}

/**
 * Atomically consumes a token: marks it used and returns its owner, only if it
 * is unused and unexpired. The conditional UPDATE is the single-use race guard —
 * two concurrent resets can't both succeed. Returns null on any failure (never
 * distinguishes unknown vs expired vs used, so it is not an oracle).
 */
export async function consumeResetToken(
  token: string,
): Promise<{ customerUserId: string; purpose: ResetPurpose } | null> {
  const [row] = await db
    .update(passwordResetTokensTable)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(passwordResetTokensTable.tokenHash, hashResetToken(token)),
        isNull(passwordResetTokensTable.usedAt),
        gt(passwordResetTokensTable.expiresAt, new Date()),
      ),
    )
    .returning({
      customerUserId: passwordResetTokensTable.customerUserId,
      purpose: passwordResetTokensTable.purpose,
    });
  if (!row) return null;
  return {
    customerUserId: row.customerUserId,
    purpose: row.purpose as ResetPurpose,
  };
}
