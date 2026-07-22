import { randomUUID } from "crypto";
import { db } from "@atlab/db";
import { adminUsersTable } from "@atlab/db/schema";

// Migrate the single env-provisioned admin credential into admin_users so the
// original owner login keeps working once the table becomes the source of
// truth. Idempotent and non-destructive: an existing row (possibly with a
// password changed via the console) is never clobbered.
// "<32 hex salt>:<64 hex key>" — the exact PBKDF2 serialization lib/password.ts
// produces. Validated before the insert so a plaintext password mistakenly put
// in ADMIN_PASSWORD_HASH can never be persisted into admin_users (where it
// would silently never match, and would sit in the DB in the clear).
const PASSWORD_HASH_RE = /^[0-9a-f]{32}:[0-9a-f]{64}$/;

export async function ensureBootstrapAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;
  if (!email || !passwordHash) return;

  if (!PASSWORD_HASH_RE.test(passwordHash)) {
    console.error(
      "[bootstrap] Refusing to seed admin user: ADMIN_PASSWORD_HASH is not a " +
        "PBKDF2 'salt:hash' digest (expected 32 hex chars, ':', 64 hex chars). " +
        "It looks like a plaintext password or a malformed value."
    );
    return;
  }

  try {
    const inserted = await db
      .insert(adminUsersTable)
      .values({
        id: randomUUID(),
        email,
        passwordHash,
        name: "Owner",
        isActive: true,
      })
      .onConflictDoNothing({ target: adminUsersTable.email })
      .returning({ id: adminUsersTable.id });

    if (inserted.length > 0) {
      console.log(`[bootstrap] Seeded admin user ${email} from env credentials`);
    }
  } catch (err) {
    console.error("[bootstrap] ensureBootstrapAdmin failed:", err);
  }
}
