import app from "./app";
import { db } from "@atlab/db";
import { eq, and, gte, lte } from "drizzle-orm";
import { subscriptionsTable, subscriptionPlansTable } from "@atlab/db/schema";
import { sendSubscriptionReminderEmail } from "./services/email";
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
  });
}

start().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
