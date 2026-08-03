import app from "./app";
import { db } from "@app/db";
import { eq, and, gte, lte, isNull, inArray } from "drizzle-orm";
import {
  subscriptionsTable,
  subscriptionPlansTable,
  ordersTable,
} from "@app/db/schema";
import {
  sendSubscriptionReminderEmail,
  sendUnpaidRecoveryEmail,
  type OrderPaymentMethod,
} from "./services/email";
import { ensureBootstrapAdmin } from "./lib/bootstrapAdmin";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function dispatchReminders() {
  try {
    const now = new Date();
    const in3Days = new Date(now);
    in3Days.setDate(in3Days.getDate() + 3);
    const in4Days = new Date(now);
    in4Days.setDate(in4Days.getDate() + 4);

    const upcoming = await db
      .select({
        id: subscriptionsTable.id,
        customerEmail: subscriptionsTable.customerEmail,
        customerName: subscriptionsTable.customerName,
        intervalDays: subscriptionsTable.intervalDays,
        nextBillingDate: subscriptionsTable.nextBillingDate,
        planName: subscriptionPlansTable.name,
      })
      .from(subscriptionsTable)
      .innerJoin(subscriptionPlansTable, eq(subscriptionsTable.planId, subscriptionPlansTable.id))
      .where(
        and(
          eq(subscriptionsTable.status, "active"),
          gte(subscriptionsTable.nextBillingDate, in3Days),
          lte(subscriptionsTable.nextBillingDate, in4Days)
        )
      );

    for (const sub of upcoming) {
      sendSubscriptionReminderEmail({
        to: sub.customerEmail,
        customerName: sub.customerName || sub.customerEmail,
        planName: sub.planName,
        intervalDays: sub.intervalDays,
        nextBillingDate: sub.nextBillingDate,
        subscriptionId: sub.id,
      }).catch((err) => console.error("[reminders] send failed:", err));
    }

    if (upcoming.length > 0) {
      console.log(`[reminders] Dispatched ${upcoming.length} 3-day renewal reminders`);
    }
  } catch (err) {
    console.error("[reminders] Dispatch error:", err);
  }
}

// One-time buyer nudge for orders still unpaid a few days after placement.
// Bounded on both ends: older than RECOVERY_MIN_AGE (72h — long enough that an
// in-flight ACH/wire transfer, which clears in 1–3 business days, isn't nagged
// while the funds are still moving) and newer than RECOVERY_MAX_AGE (don't chase
// ancient abandoned orders). recoveryEmailedAt makes it idempotent — each order
// is nudged at most once regardless of how many times the sweep runs.
const RECOVERY_MIN_AGE_MS = 72 * 60 * 60 * 1000;
const RECOVERY_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

async function dispatchUnpaidRecovery() {
  try {
    const now = Date.now();
    const olderThan = new Date(now - RECOVERY_MIN_AGE_MS);
    const newerThan = new Date(now - RECOVERY_MAX_AGE_MS);

    const unpaid = await db
      .select({
        id: ordersTable.id,
        shippingEmail: ordersTable.shippingEmail,
        paymentMethod: ordersTable.paymentMethod,
        totalCents: ordersTable.totalCents,
      })
      .from(ordersTable)
      .where(
        and(
          inArray(ordersTable.status, ["pending", "awaiting_payment"]),
          isNull(ordersTable.recoveryEmailedAt),
          lte(ordersTable.createdAt, olderThan),
          gte(ordersTable.createdAt, newerThan)
        )
      );

    for (const order of unpaid) {
      // Stamp first, then send. If the send throws it's caught per-order and the
      // order stays stamped — one failed reminder is better than a nightly loop
      // re-emailing the same buyer.
      await db
        .update(ordersTable)
        .set({ recoveryEmailedAt: new Date() })
        .where(eq(ordersTable.id, order.id));
      sendUnpaidRecoveryEmail({
        to: order.shippingEmail,
        orderId: order.id,
        paymentMethod: order.paymentMethod as OrderPaymentMethod,
        totalCents: order.totalCents,
      }).catch((err) => console.error("[recovery] send failed:", err));
    }

    if (unpaid.length > 0) {
      console.log(`[recovery] Dispatched ${unpaid.length} unpaid-order reminders`);
    }
  } catch (err) {
    console.error("[recovery] Dispatch error:", err);
  }
}

// Migrate the env-provisioned owner credential into admin_users (idempotent)
// BEFORE accepting traffic — otherwise the first /admin/login can race the seed
// and fall through to the env break-glass path. Wrapped in an async entrypoint
// because the server bundles to CJS, which has no top-level await.
async function start(): Promise<void> {
  await ensureBootstrapAdmin();

  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    dispatchReminders();
    setInterval(dispatchReminders, TWENTY_FOUR_HOURS);
    dispatchUnpaidRecovery();
    setInterval(dispatchUnpaidRecovery, TWENTY_FOUR_HOURS);
  });
}

start().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
