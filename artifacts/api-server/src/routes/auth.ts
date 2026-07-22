import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { eq, and, desc, inArray } from "drizzle-orm";
import { db } from "@atlab/db";
import {
  customerUsersTable,
  ordersTable,
  productVariantsTable,
  productsTable,
  type CustomerUser,
} from "@atlab/db/schema";
import { z } from "zod/v4";
import {
  hashPassword,
  verifyPassword,
  verifyDummyPassword,
} from "../lib/password";
import {
  bearerToken,
  createCustomerSession,
  deleteCustomerSession,
  resolveCustomerUser,
} from "../lib/customerSession";
import { loginRateLimit, registerRateLimit } from "../lib/rateLimit";

const router: IRouter = Router();

// B2C retail accounts. Optional by design — guest checkout on POST /orders is
// unchanged; signing in only adds order history and reorder.

function publicUser(user: CustomerUser) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
  };
}

async function requireCustomer(
  req: Request,
  res: Response
): Promise<CustomerUser | null> {
  const user = await resolveCustomerUser(req);
  if (!user) {
    res.status(401).json({
      error: "unauthorized",
      message: "Sign in to access this resource",
    });
    return null;
  }
  return user;
}

const RegisterSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(200).optional(),
});

router.post("/auth/register", registerRateLimit, async (req: Request, res: Response) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "validation_error",
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();

  try {
    const existing = await db.query.customerUsersTable.findFirst({
      where: eq(customerUsersTable.email, email),
    });
    if (existing) {
      res.status(409).json({
        error: "conflict",
        message: "An account with that email already exists",
      });
      return;
    }

    const id = randomUUID();
    const [user] = await db
      .insert(customerUsersTable)
      .values({
        id,
        email,
        passwordHash: await hashPassword(parsed.data.password),
        name: parsed.data.name ?? null,
      })
      .returning();

    const session = await createCustomerSession(user.id);
    res.status(201).json({
      token: session.token,
      expiresAt: session.expiresAt.toISOString(),
      user: publicUser(user),
    });
  } catch (err) {
    console.error("registerCustomer error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

const LoginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(200),
});

router.post("/auth/login", loginRateLimit, async (req: Request, res: Response) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "validation_error",
      message: "Email and password are required",
    });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();

  try {
    const user = await db.query.customerUsersTable.findFirst({
      where: eq(customerUsersTable.email, email),
    });

    // Always pay the full derivation cost, even for an unknown email, so
    // response time does not disclose whether the address is registered.
    if (!user) {
      await verifyDummyPassword(parsed.data.password);
      res
        .status(401)
        .json({ error: "unauthorized", message: "Invalid credentials" });
      return;
    }

    if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
      res
        .status(401)
        .json({ error: "unauthorized", message: "Invalid credentials" });
      return;
    }

    const session = await createCustomerSession(user.id);
    res.json({
      token: session.token,
      expiresAt: session.expiresAt.toISOString(),
      user: publicUser(user),
    });
  } catch (err) {
    console.error("loginCustomer error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

router.post("/auth/logout", async (req: Request, res: Response) => {
  const token = bearerToken(req);
  try {
    if (token) {
      await deleteCustomerSession(token);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("logoutCustomer error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

router.get("/auth/me", async (req: Request, res: Response) => {
  try {
    const user = await requireCustomer(req, res);
    if (!user) return;
    res.json(publicUser(user));
  } catch (err) {
    console.error("getCurrentCustomer error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

// A shopper's retail orders: strictly those stamped with their user id at
// checkout. Ownership is NOT inferred from shippingEmail — registration does
// not verify the address, so an email match would let anyone claim a stranger's
// guest orders (and, through the order ids, their shipping PII) simply by
// registering that address. Retroactively claiming guest orders requires a
// verified email; deferred until that plumbing exists.
function customerOrdersWhere(user: CustomerUser) {
  return and(
    eq(ordersTable.channel, "retail"),
    eq(ordersTable.customerUserId, user.id)
  );
}

router.get("/auth/orders", async (req: Request, res: Response) => {
  try {
    const user = await requireCustomer(req, res);
    if (!user) return;

    const orders = await db
      .select({
        id: ordersTable.id,
        status: ordersTable.status,
        channel: ordersTable.channel,
        paymentMethod: ordersTable.paymentMethod,
        subtotalCents: ordersTable.subtotalCents,
        discountCents: ordersTable.discountCents,
        discountSource: ordersTable.discountSource,
        discountCode: ordersTable.discountCode,
        promoDiscountCents: ordersTable.promoDiscountCents,
        cryptoDiscountCents: ordersTable.cryptoDiscountCents,
        totalCents: ordersTable.totalCents,
        lineItems: ordersTable.lineItems,
        trackingNumber: ordersTable.trackingNumber,
        carrier: ordersTable.carrier,
        createdAt: ordersTable.createdAt,
      })
      .from(ordersTable)
      .where(customerOrdersWhere(user))
      .orderBy(desc(ordersTable.createdAt));

    res.json(orders);
  } catch (err) {
    console.error("listCustomerOrders error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

type StoredLineItem = {
  variantId: number;
  productName?: string;
  variantName?: string;
  quantity: number;
  unitPriceCents?: number;
};

// Rebuilds a cart payload from a past order. Prices are re-derived from the
// current catalog — a stale unitPriceCents from the old order is never trusted.
router.post("/auth/reorder/:orderId", async (req: Request, res: Response) => {
  try {
    const user = await requireCustomer(req, res);
    if (!user) return;

    const order = await db.query.ordersTable.findFirst({
      where: and(
        eq(ordersTable.id, String(req.params.orderId)),
        customerOrdersWhere(user)!
      ),
    });
    if (!order) {
      res.status(404).json({ error: "not_found", message: "Order not found" });
      return;
    }

    const stored = (order.lineItems as StoredLineItem[]) ?? [];
    const variantIds = [...new Set(stored.map((li) => li.variantId))];

    const variants = variantIds.length
      ? await db
          .select({
            id: productVariantsTable.id,
            name: productVariantsTable.name,
            priceCents: productVariantsTable.priceCents,
            retailPriceCents: productVariantsTable.retailPriceCents,
            unitType: productVariantsTable.unitType,
            inStock: productVariantsTable.inStock,
            productId: productVariantsTable.productId,
            productName: productsTable.name,
            productSlug: productsTable.slug,
            complianceStatus: productsTable.complianceStatus,
            published: productsTable.published,
          })
          .from(productVariantsTable)
          .innerJoin(
            productsTable,
            eq(productVariantsTable.productId, productsTable.id)
          )
          .where(inArray(productVariantsTable.id, variantIds))
      : [];

    const variantMap = new Map(variants.map((v) => [v.id, v]));

    const items = [];
    const unavailable: number[] = [];
    for (const li of stored) {
      const v = variantMap.get(li.variantId);
      // Mirror the POST /orders gate: a compliance-blocked SKU is unsellable,
      // so it must not reappear in a rebuilt cart either.
      if (
        !v ||
        !v.inStock ||
        v.complianceStatus === "blocked" ||
        !v.published
      ) {
        unavailable.push(li.variantId);
        continue;
      }
      // This is a B2C (retail) cart. A kit without a retail price is
      // wholesale-only — POST /orders would reject it, and echoing its
      // wholesale list price here would both mislead the buyer and expose the
      // price book. Kits with a retail price rebuild at THAT price.
      if (v.unitType === "kit" && v.retailPriceCents == null) {
        unavailable.push(li.variantId);
        continue;
      }
      items.push({
        variantId: v.id,
        productName: v.productName,
        productSlug: v.productSlug,
        variantName: v.name,
        quantity: li.quantity,
        unitPriceCents:
          v.unitType === "kit" ? v.retailPriceCents! : v.priceCents,
      });
    }

    res.json({ sourceOrderId: order.id, lineItems: items, unavailable });
  } catch (err) {
    console.error("reorderFromOrder error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

export default router;
