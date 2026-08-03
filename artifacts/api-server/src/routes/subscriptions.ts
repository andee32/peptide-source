import { Router, type IRouter, type Request, type Response } from "express";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { eq, and, desc, lte, gte, or, sql } from "drizzle-orm";
import { db } from "@app/db";
import {
  subscriptionPlansTable,
  subscriptionsTable,
  subscriptionEventsTable,
  subscriptionStatusEnum,
} from "@app/db/schema";
import { z } from "zod/v4";
import {
  sendSubscriptionConfirmEmail,
  sendSubscriptionReminderEmail,
  sendManagementLinkEmail,
} from "../services/email";
import { isAdminRequest } from "../lib/adminSession";

const router: IRouter = Router();

const IS_PRODUCTION = process.env.NODE_ENV === "production";

const MGMT_TOKEN_SECRET = (() => {
  const s = process.env.MGMT_TOKEN_SECRET ?? process.env.ADMIN_SECRET;
  if (!s) {
    if (IS_PRODUCTION) {
      throw new Error(
        "[FATAL] MGMT_TOKEN_SECRET / ADMIN_SECRET env var is required. " +
          "Set one of these environment variables before starting the server in production."
      );
    }
    console.warn(
      "[dev] MGMT_TOKEN_SECRET not set — using insecure dev-only fallback. " +
        "Set MGMT_TOKEN_SECRET or ADMIN_SECRET in production."
    );
    return "lab-mgmt-token-dev-only-insecure";
  }
  return s;
})();

const MGMT_TOKEN_EXPIRE_MS = 15 * 60 * 1000;

function extractRequestToken(req: Request): string | undefined {
  const fromBody = req.body?.token as string | undefined;
  const fromQuery = req.query.token as string | undefined;
  return fromBody || fromQuery || undefined;
}

function extractMgmtToken(req: Request): string | undefined {
  const fromBody = req.body?.mgmt_token as string | undefined;
  const fromQuery = req.query.mgmt_token as string | undefined;
  return fromBody || fromQuery || undefined;
}

async function isAuthorizedForSub(
  req: Request,
  sub: { accessToken: string; customerEmail: string }
): Promise<boolean> {
  if (await isAdminRequest(req)) return true;
  const accessToken = extractRequestToken(req);
  if (accessToken && accessToken === sub.accessToken) return true;
  const mgmtToken = extractMgmtToken(req);
  if (mgmtToken) {
    const verified = verifyMgmtToken(mgmtToken);
    if (verified && verified.email === sub.customerEmail) return true;
  }
  return false;
}

function signMgmtToken(email: string, expiresAt: number): string {
  const payload = `${email}|${expiresAt}`;
  const sig = createHmac("sha256", MGMT_TOKEN_SECRET).update(payload).digest("hex");
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

function verifyMgmtToken(token: string): { email: string } | null {
  try {
    const dot = token.lastIndexOf(".");
    if (dot === -1) return null;
    const payloadB64 = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const payload = Buffer.from(payloadB64, "base64url").toString();
    const expected = createHmac("sha256", MGMT_TOKEN_SECRET).update(payload).digest("hex");
    if (!timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) return null;
    const [email, expStr] = payload.split("|");
    const expiresAt = parseInt(expStr ?? "0", 10);
    if (Date.now() > expiresAt) return null;
    if (!email) return null;
    return { email };
  } catch {
    return null;
  }
}

const CreateSubscriptionSchema = z.object({
  customerEmail: z.string().email(),
  customerName: z.string().min(1).max(200).default(""),
  planId: z.number().int().positive(),
  intervalDays: z.number().int().refine((v) => [30, 60, 90].includes(v), {
    message: "intervalDays must be 30, 60, or 90",
  }),
  shippingAddress: z
    .object({
      name: z.string().min(1),
      address1: z.string().min(1),
      address2: z.string().optional(),
      city: z.string().min(1),
      state: z.string().min(1),
      zip: z.string().min(1),
      country: z.string().default("US"),
    })
    .optional()
    .default({
      name: "",
      address1: "",
      city: "",
      state: "",
      zip: "",
      country: "US",
    }),
  notes: z.string().max(2000).optional(),
});

router.get("/subscription-plans", async (_req: Request, res: Response) => {
  try {
    const plans = await db
      .select()
      .from(subscriptionPlansTable)
      .orderBy(desc(subscriptionPlansTable.featured), subscriptionPlansTable.intervalDays);
    res.json(plans);
  } catch {
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

router.get("/subscription-plans/:slug", async (req: Request, res: Response) => {
  try {
    const plan = await db
      .select()
      .from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.slug, String(req.params.slug)))
      .then((r) => r[0]);

    if (!plan) {
      res.status(404).json({ error: "not_found", message: "Plan not found" });
      return;
    }

    res.json(plan);
  } catch {
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

router.post("/subscriptions", async (req: Request, res: Response) => {
  const parsed = CreateSubscriptionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "validation_error",
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    });
    return;
  }

  const { customerEmail, customerName, planId, intervalDays, shippingAddress, notes } =
    parsed.data;

  try {
    const plan = await db
      .select()
      .from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.id, planId))
      .then((r) => r[0]);

    if (!plan) {
      res.status(404).json({ error: "not_found", message: "Subscription plan not found" });
      return;
    }

    const nextBillingDate = new Date();
    nextBillingDate.setDate(nextBillingDate.getDate() + intervalDays);

    const accessToken = randomBytes(32).toString("hex");

    const [subscription] = await db
      .insert(subscriptionsTable)
      .values({
        customerEmail,
        customerName,
        planId,
        intervalDays,
        nextBillingDate,
        shippingAddress,
        notes,
        status: "active",
        accessToken,
      })
      .returning();

    await db.insert(subscriptionEventsTable).values({
      subscriptionId: subscription.id,
      eventType: "created",
      metadata: { planName: plan.name, intervalDays },
    });

    sendSubscriptionConfirmEmail({
      to: customerEmail,
      customerName: customerName || customerEmail,
      planName: plan.name,
      intervalDays,
      nextBillingDate,
      subscriptionId: subscription.id,
    }).catch((err) => console.error("[email] confirm send failed:", err));

    res.status(201).json({
      id: subscription.id,
      status: subscription.status,
      planName: plan.name,
      intervalDays: subscription.intervalDays,
      nextBillingDate: subscription.nextBillingDate,
      createdAt: subscription.createdAt,
      accessToken: subscription.accessToken,
    });
  } catch {
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

const requestMgmtLinkSchema = z.object({ email: z.string().email() });

router.post("/subscriptions/request-management-link", async (req: Request, res: Response) => {
  const parsed = requestMgmtLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_request", message: "Valid email required" });
    return;
  }

  const email = parsed.data.email.toLowerCase().trim();
  const expiresAt = Date.now() + MGMT_TOKEN_EXPIRE_MS;
  const token = signMgmtToken(email, expiresAt);

  const SITE_URL = process.env.SITE_URL ?? "https://thelabstandard.com";
  const managementUrl = `${SITE_URL}/account/subscriptions?mgmt_token=${encodeURIComponent(token)}`;

  try {
    await sendManagementLinkEmail({
      to: email,
      managementUrl,
      expiresInMinutes: Math.floor(MGMT_TOKEN_EXPIRE_MS / 60000),
    });
  } catch (err) {
    console.error("[mgmt-link] email send failed", err);
  }

  res.json({
    ok: true,
    message: "If an account exists for that email, a management link has been sent.",
    _devUrl: process.env.NODE_ENV !== "production" ? managementUrl : undefined,
  });
});

router.get("/subscriptions", async (req: Request, res: Response) => {
  if (await isAdminRequest(req)) {
    try {
      const subs = await db
        .select({
          id: subscriptionsTable.id,
          customerEmail: subscriptionsTable.customerEmail,
          customerName: subscriptionsTable.customerName,
          status: subscriptionsTable.status,
          intervalDays: subscriptionsTable.intervalDays,
          nextBillingDate: subscriptionsTable.nextBillingDate,
          createdAt: subscriptionsTable.createdAt,
          updatedAt: subscriptionsTable.updatedAt,
          notes: subscriptionsTable.notes,
          shippingAddress: subscriptionsTable.shippingAddress,
          planId: subscriptionsTable.planId,
          planName: subscriptionPlansTable.name,
          planSlug: subscriptionPlansTable.slug,
          planDescription: subscriptionPlansTable.description,
          planBundle: subscriptionPlansTable.productBundle,
          planPriceCents: subscriptionPlansTable.pricePerIntervalCents,
        })
        .from(subscriptionsTable)
        .innerJoin(subscriptionPlansTable, eq(subscriptionsTable.planId, subscriptionPlansTable.id))
        .orderBy(desc(subscriptionsTable.createdAt));
      res.json(subs);
    } catch {
      res.status(500).json({ error: "internal_error", message: "Server error" });
    }
    return;
  }

  let resolvedEmail: string | null = null;

  const mgmtToken = String(req.query.mgmt_token ?? "");
  if (mgmtToken) {
    const verified = verifyMgmtToken(mgmtToken);
    if (!verified) {
      res.status(401).json({ error: "unauthorized", message: "Management link is invalid or expired" });
      return;
    }
    resolvedEmail = verified.email;
  } else {
    const queryParsed = z.object({ email: z.email() }).safeParse(req.query);
    if (!queryParsed.success) {
      res.status(400).json({
        error: "bad_request",
        message: "Provide a valid mgmt_token or email query parameter",
      });
      return;
    }
    resolvedEmail = queryParsed.data.email.toLowerCase().trim();
  }

  try {
    const subs = await db
      .select({
        id: subscriptionsTable.id,
        customerName: subscriptionsTable.customerName,
        status: subscriptionsTable.status,
        intervalDays: subscriptionsTable.intervalDays,
        nextBillingDate: subscriptionsTable.nextBillingDate,
        createdAt: subscriptionsTable.createdAt,
        planId: subscriptionsTable.planId,
        planName: subscriptionPlansTable.name,
        planSlug: subscriptionPlansTable.slug,
        planDescription: subscriptionPlansTable.description,
        planBundle: subscriptionPlansTable.productBundle,
        planPriceCents: subscriptionPlansTable.pricePerIntervalCents,
      })
      .from(subscriptionsTable)
      .innerJoin(subscriptionPlansTable, eq(subscriptionsTable.planId, subscriptionPlansTable.id))
      .where(eq(subscriptionsTable.customerEmail, resolvedEmail))
      .orderBy(desc(subscriptionsTable.createdAt));

    res.json(subs);
  } catch {
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

router.get("/subscriptions/:id", async (req: Request, res: Response) => {
  const idParsed = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!idParsed.success) {
    res.status(400).json({ error: "bad_request", message: "Invalid subscription ID" });
    return;
  }
  const id = idParsed.data;

  try {
    const [row] = await db
      .select({
        id: subscriptionsTable.id,
        customerEmail: subscriptionsTable.customerEmail,
        customerName: subscriptionsTable.customerName,
        status: subscriptionsTable.status,
        intervalDays: subscriptionsTable.intervalDays,
        nextBillingDate: subscriptionsTable.nextBillingDate,
        createdAt: subscriptionsTable.createdAt,
        updatedAt: subscriptionsTable.updatedAt,
        notes: subscriptionsTable.notes,
        shippingAddress: subscriptionsTable.shippingAddress,
        accessToken: subscriptionsTable.accessToken,
        planId: subscriptionsTable.planId,
        planName: subscriptionPlansTable.name,
        planSlug: subscriptionPlansTable.slug,
        planDescription: subscriptionPlansTable.description,
        planBundle: subscriptionPlansTable.productBundle,
        planPriceCents: subscriptionPlansTable.pricePerIntervalCents,
      })
      .from(subscriptionsTable)
      .innerJoin(subscriptionPlansTable, eq(subscriptionsTable.planId, subscriptionPlansTable.id))
      .where(eq(subscriptionsTable.id, id));

    if (!row) {
      res.status(404).json({ error: "not_found", message: "Subscription not found" });
      return;
    }

    if (!(await isAuthorizedForSub(req, row))) {
      res.status(403).json({
        error: "forbidden",
        message: "Provide a valid access token or management link token",
      });
      return;
    }

    const { accessToken: _at, ...safeRow } = row;
    res.json(safeRow);
  } catch {
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

router.patch("/subscriptions/:id/skip", async (req: Request, res: Response) => {
  const idParsed = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!idParsed.success) {
    res.status(400).json({ error: "bad_request", message: "Invalid subscription ID" });
    return;
  }
  const id = idParsed.data;

  try {
    const sub = await db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.id, id))
      .then((r) => r[0]);

    if (!sub) {
      res.status(404).json({ error: "not_found", message: "Subscription not found" });
      return;
    }

    if (!(await isAuthorizedForSub(req, sub))) {
      res.status(403).json({
        error: "forbidden",
        message: "Provide a valid access token or management link token",
      });
      return;
    }

    if (sub.status !== "active") {
      res.status(400).json({ error: "bad_request", message: "Only active subscriptions can be skipped" });
      return;
    }

    const newNextBillingDate = new Date(sub.nextBillingDate);
    newNextBillingDate.setDate(newNextBillingDate.getDate() + sub.intervalDays);

    await db
      .update(subscriptionsTable)
      .set({ nextBillingDate: newNextBillingDate, updatedAt: new Date() })
      .where(eq(subscriptionsTable.id, id));

    await db.insert(subscriptionEventsTable).values({
      subscriptionId: id,
      eventType: "skipped",
      metadata: {
        previousDate: sub.nextBillingDate,
        newDate: newNextBillingDate,
      },
    });

    res.json({
      id,
      status: "active",
      nextBillingDate: newNextBillingDate,
    });
  } catch {
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

router.delete("/subscriptions/:id", async (req: Request, res: Response) => {
  const idParsed = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!idParsed.success) {
    res.status(400).json({ error: "bad_request", message: "Invalid subscription ID" });
    return;
  }
  const id = idParsed.data;

  try {
    const sub = await db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.id, id))
      .then((r) => r[0]);

    if (!sub) {
      res.status(404).json({ error: "not_found", message: "Subscription not found" });
      return;
    }

    if (!(await isAuthorizedForSub(req, sub))) {
      res.status(403).json({
        error: "forbidden",
        message: "Provide a valid access token or management link token",
      });
      return;
    }

    await db
      .update(subscriptionsTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(subscriptionsTable.id, id));

    await db.insert(subscriptionEventsTable).values({
      subscriptionId: id,
      eventType: "cancelled",
      metadata: { cancelledBy: (await isAdminRequest(req)) ? "admin" : "customer" },
    });

    res.json({ id, status: "cancelled" });
  } catch {
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

router.get("/admin/subscriptions", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) {
    res.status(401).json({ error: "unauthorized", message: "Admin key required" });
    return;
  }

  try {
    const now = new Date();
    const in7Days = new Date(now);
    in7Days.setDate(in7Days.getDate() + 7);
    const in30Days = new Date(now);
    in30Days.setDate(in30Days.getDate() + 30);

    const subs = await db
      .select({
        id: subscriptionsTable.id,
        customerEmail: subscriptionsTable.customerEmail,
        customerName: subscriptionsTable.customerName,
        status: subscriptionsTable.status,
        intervalDays: subscriptionsTable.intervalDays,
        nextBillingDate: subscriptionsTable.nextBillingDate,
        createdAt: subscriptionsTable.createdAt,
        notes: subscriptionsTable.notes,
        planName: subscriptionPlansTable.name,
        planSlug: subscriptionPlansTable.slug,
        planPriceCents: subscriptionPlansTable.pricePerIntervalCents,
      })
      .from(subscriptionsTable)
      .innerJoin(
        subscriptionPlansTable,
        eq(subscriptionsTable.planId, subscriptionPlansTable.id)
      )
      .orderBy(subscriptionsTable.nextBillingDate);

    const active = subs.filter((s) => s.status === "active");
    const renewingIn7Days = active.filter(
      (s) => s.nextBillingDate <= in7Days
    );
    const renewingIn30Days = active.filter(
      (s) => s.nextBillingDate <= in30Days
    );

    res.json({
      total: subs.length,
      active: active.length,
      paused: subs.filter((s) => s.status === "paused").length,
      cancelled: subs.filter((s) => s.status === "cancelled").length,
      renewingIn7Days: renewingIn7Days.length,
      renewingIn30Days: renewingIn30Days.length,
      subscriptions: subs,
    });
  } catch {
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

router.post("/admin/subscriptions/dispatch-reminders", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) {
    res.status(401).json({ error: "unauthorized", message: "Admin key required" });
    return;
  }

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

    let sent = 0;
    let failed = 0;
    await Promise.all(
      upcoming.map(async (sub) => {
        try {
          await sendSubscriptionReminderEmail({
            to: sub.customerEmail,
            customerName: sub.customerName || sub.customerEmail,
            planName: sub.planName,
            intervalDays: sub.intervalDays,
            nextBillingDate: sub.nextBillingDate,
            subscriptionId: sub.id,
          });
          sent++;
        } catch {
          failed++;
        }
      })
    );

    res.json({ checked: upcoming.length, sent, failed });
  } catch {
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

router.patch("/admin/subscriptions/:id/status", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) {
    res.status(401).json({ error: "unauthorized", message: "Admin key required" });
    return;
  }

  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "bad_request", message: "Invalid subscription ID" });
    return;
  }

  const parsed = z.object({
    status: z.enum(subscriptionStatusEnum.enumValues),
  }).safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: "Invalid status" });
    return;
  }

  try {
    const sub = await db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.id, id))
      .then((r) => r[0]);

    if (!sub) {
      res.status(404).json({ error: "not_found", message: "Subscription not found" });
      return;
    }

    await db
      .update(subscriptionsTable)
      .set({ status: parsed.data.status, updatedAt: new Date() })
      .where(eq(subscriptionsTable.id, id));

    const eventMap: Record<string, "paused" | "resumed" | "cancelled"> = {
      paused: "paused",
      active: "resumed",
      cancelled: "cancelled",
    };

    if (eventMap[parsed.data.status]) {
      await db.insert(subscriptionEventsTable).values({
        subscriptionId: id,
        eventType: eventMap[parsed.data.status],
        metadata: { by: "admin" },
      });
    }

    res.json({ id, status: parsed.data.status });
  } catch {
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

export default router;
