// Phase 4 of the account unification (docs/account-unification-design.md).
// Links every existing wholesale customer_accounts row to a login identity
// (customer_users), stamps that account's past orders with the identity, and
// mints a set-password "invite" for accounts that don't yet have a usable
// password. Idempotent. DRY-RUN by default — pass --commit to write.
//
//   node --import tsx ./src/backfillWholesaleIdentities.ts            (dry-run)
//   node --import tsx ./src/backfillWholesaleIdentities.ts --commit   (writes)
//
// Never sends email directly — invites are minted as tokens and the set-password
// links are printed (and, with --commit, persisted) so they can be sent manually
// or via CSV until SMTP is provisioned.
import { createHash, randomBytes, randomUUID, pbkdf2Sync } from "crypto";
import { eq, and, isNull, isNotNull } from "drizzle-orm";
import {
  db,
  pool,
  customerAccountsTable,
  customerUsersTable,
  passwordResetTokensTable,
  ordersTable,
} from "@atlab/db";

const COMMIT = process.argv.includes("--commit");
const INVITE_TTL_MS = 21 * 24 * 60 * 60 * 1000;

// Unusable sentinel hash: pbkdf2 of random bytes nobody holds. Distinct from the
// login DUMMY hash; passwordSetAt=null is the authoritative "not activated"
// signal, this only satisfies NOT NULL. Matches the app's pbkdf2 format
// (iterations:salt:hash) so verifyPassword runs full cost, never short-circuits.
function sentinelHash(): string {
  const salt = randomBytes(16).toString("hex");
  const secret = randomBytes(32).toString("hex");
  const hash = pbkdf2Sync(secret, salt, 100_000, 64, "sha512").toString("hex");
  return `100000:${salt}:${hash}`;
}

const norm = (e: string) => e.trim().toLowerCase();
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

type Plan = {
  actions: string[];
  invites: Array<{ email: string; link: string }>;
  collisions: string[];
  linked: number;
  created: number;
  ordersStamped: number;
};

async function run(): Promise<Plan> {
  const plan: Plan = {
    actions: [],
    invites: [],
    collisions: [],
    linked: 0,
    created: 0,
    ordersStamped: 0,
  };
  const base = process.env.PUBLIC_APP_URL ?? "";

  // Approved first so future approvals are pre-linked; then the rest.
  const accounts = await db.select().from(customerAccountsTable);
  accounts.sort((a, b) =>
    a.status === "approved" && b.status !== "approved" ? -1 : 1,
  );

  for (const acct of accounts) {
    if (acct.customerUserId) {
      plan.actions.push(`skip ${acct.businessName}: already linked`);
      continue;
    }
    const email = norm(acct.email);
    const existing = await db.query.customerUsersTable.findFirst({
      where: eq(customerUsersTable.email, email),
    });

    let userId: string;
    let needsInvite = false;

    if (existing) {
      // Exact email match — link. This may be a DIFFERENT human's retail login;
      // flag it. Cutover requires email-ownership verification before such an
      // account gains wholesale powers (design §5).
      userId = existing.id;
      plan.collisions.push(
        `REVIEW: ${acct.businessName} (${email}) links to an EXISTING login ${existing.id}` +
          (existing.passwordSetAt ? " [has active password]" : " [invite-only]"),
      );
      needsInvite = !existing.passwordSetAt;
      if (COMMIT) {
        await db
          .update(customerAccountsTable)
          .set({ customerUserId: userId })
          .where(eq(customerAccountsTable.id, acct.id));
      }
      plan.linked++;
    } else {
      // No match — create an invite-only identity (sentinel password).
      userId = randomUUID();
      needsInvite = true;
      plan.created++;
      plan.actions.push(`create login for ${acct.businessName} (${email})`);
      if (COMMIT) {
        await db.insert(customerUsersTable).values({
          id: userId,
          email,
          passwordHash: sentinelHash(),
          passwordSetAt: null,
          name: acct.contactName,
        });
        await db
          .update(customerAccountsTable)
          .set({ customerUserId: userId })
          .where(eq(customerAccountsTable.id, acct.id));
      }
    }

    // Stamp this account's past orders with the identity so order history +
    // canReadOrder collapse onto the session after login.
    const stampable = await db
      .select({ id: ordersTable.id })
      .from(ordersTable)
      .where(
        and(eq(ordersTable.accountId, acct.id), isNull(ordersTable.customerUserId)),
      );
    plan.ordersStamped += stampable.length;
    if (COMMIT && stampable.length) {
      await db
        .update(ordersTable)
        .set({ customerUserId: userId })
        .where(
          and(
            eq(ordersTable.accountId, acct.id),
            isNull(ordersTable.customerUserId),
          ),
        );
    }

    // Invite: only for identities without a usable password, and only if one
    // isn't already outstanding (idempotent).
    if (needsInvite) {
      const outstanding = await db
        .select({ h: passwordResetTokensTable.tokenHash })
        .from(passwordResetTokensTable)
        .where(
          and(
            eq(passwordResetTokensTable.customerUserId, userId),
            eq(passwordResetTokensTable.purpose, "invite"),
            isNull(passwordResetTokensTable.usedAt),
          ),
        );
      if (outstanding.length === 0) {
        const token = randomBytes(32).toString("hex");
        const link = `${base}/account/reset-password?token=${token}`;
        plan.invites.push({ email, link });
        if (COMMIT) {
          await db.insert(passwordResetTokensTable).values({
            tokenHash: hashToken(token),
            customerUserId: userId,
            purpose: "invite",
            expiresAt: new Date(Date.now() + INVITE_TTL_MS),
          });
        }
      } else {
        plan.actions.push(`skip invite for ${email}: one already outstanding`);
      }
    }
  }
  return plan;
}

const plan = await run();
console.log(`\n=== Backfill ${COMMIT ? "(COMMIT — writes applied)" : "(DRY-RUN — no writes)"} ===`);
console.log(`accounts linked to existing logins: ${plan.linked}`);
console.log(`new login identities created:       ${plan.created}`);
console.log(`past orders stamped with identity:  ${plan.ordersStamped}`);
console.log(`set-password invites minted:        ${plan.invites.length}`);
if (plan.collisions.length) {
  console.log(`\n--- SAME-EMAIL MERGES TO REVIEW (${plan.collisions.length}) ---`);
  plan.collisions.forEach((c) => console.log("  " + c));
}
if (plan.invites.length) {
  console.log(`\n--- INVITE LINKS (send manually / CSV until SMTP) ---`);
  plan.invites.forEach((i) => console.log(`  ${i.email}\t${i.link}`));
}
if (plan.actions.length) {
  console.log(`\n--- other actions ---`);
  plan.actions.forEach((a) => console.log("  " + a));
}
if (!COMMIT) console.log(`\nRe-run with --commit to apply. (Idempotent — safe to re-run.)`);
await pool.end();
