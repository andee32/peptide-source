import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, and, asc, desc, count, sql } from "drizzle-orm";
import { pbkdf2Sync, timingSafeEqual } from "crypto";
import { db } from "@atlab/db";
import {
  batchesTable,
  coaResultsTable,
  productsTable,
  productVariantsTable,
  customerAccountsTable,
  priceTiersTable,
  ordersTable,
  paymentRecordsTable,
  orderAttestationsTable,
  categoryEnum,
  batchStatusEnum,
  testTypeEnum,
  accountStatusEnum,
  orderStatusEnum,
  orderChannelEnum,
  complianceStatusEnum,
  sourcingPathEnum,
} from "@atlab/db/schema";
import { z } from "zod/v4";

const router: IRouter = Router();

function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    res.status(503).json({ error: "not_configured", message: "Admin access not configured" });
    return;
  }
  const key = req.headers["x-admin-key"];
  if (key !== adminSecret) {
    res.status(401).json({ error: "unauthorized", message: "Invalid admin key" });
    return;
  }
  next();
}

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/admin/login", (req: Request, res: Response): void => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_request", message: "Email and password are required" });
    return;
  }

  const storedEmail = process.env.ADMIN_EMAIL;
  const storedHash = process.env.ADMIN_PASSWORD_HASH;
  const adminSecret = process.env.ADMIN_SECRET;

  if (!storedEmail || !storedHash || !adminSecret) {
    res.status(503).json({ error: "not_configured", message: "Admin credentials not configured" });
    return;
  }

  const { email, password } = parsed.data;

  const emailMatch =
    storedEmail.length === email.length &&
    timingSafeEqual(Buffer.from(storedEmail), Buffer.from(email));

  if (!emailMatch) {
    res.status(401).json({ error: "unauthorized", message: "Invalid credentials" });
    return;
  }

  const [salt, expectedHash] = storedHash.split(":");
  const actualHash = pbkdf2Sync(password, salt, 100000, 32, "sha256").toString("hex");

  let passwordMatch = false;
  try {
    passwordMatch = timingSafeEqual(Buffer.from(actualHash), Buffer.from(expectedHash));
  } catch {
    passwordMatch = false;
  }

  if (!passwordMatch) {
    res.status(401).json({ error: "unauthorized", message: "Invalid credentials" });
    return;
  }

  res.json({ token: adminSecret });
});

router.use("/admin", adminAuth);

router.get("/admin/products", async (_req, res) => {
  try {
    const products = await db.query.productsTable.findMany({
      orderBy: [asc(productsTable.name)],
      with: { variants: { orderBy: [asc(productVariantsTable.name)] } },
    });
    res.json(products);
  } catch (err) {
    console.error("admin listProducts error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

router.get("/admin/batches", async (_req, res) => {
  try {
    const batches = await db.query.batchesTable.findMany({
      orderBy: [desc(batchesTable.productionDate)],
    });

    const result = await Promise.all(batches.map(async (batch) => {
      const product = await db.query.productsTable.findFirst({
        where: eq(productsTable.id, batch.productId),
      });
      const coaResults = await db.query.coaResultsTable.findMany({
        where: eq(coaResultsTable.batchId, batch.id),
      });
      return {
        id: batch.id,
        productId: batch.productId,
        productName: product?.name ?? "Unknown",
        productionDate: batch.productionDate,
        status: batch.status,
        notes: batch.notes ?? null,
        coaResults: coaResults.map(c => ({
          id: c.id,
          testType: c.testType,
          purityPercent: c.purityPercent ?? null,
          endotoxinEuPerMl: c.endotoxinEuPerMl ?? null,
          sterilityPass: c.sterilityPass ?? null,
          heavyMetals: c.heavyMetals ?? null,
          labName: c.labName,
          testedAt: c.testedAt,
          janoshikTaskId: c.janoshikTaskId ?? null,
        })),
      };
    }));

    res.json(result);
  } catch (err) {
    console.error("admin listBatches error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

const CreateBatchSchema = z.object({
  id: z.string().min(1).max(100),
  productId: z.number().int().positive(),
  productionDate: z.string(),
  status: z.enum(batchStatusEnum.enumValues).default("pending"),
  notes: z.string().optional(),
});

router.post("/admin/batches", async (req, res) => {
  try {
    const parsed = CreateBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "bad_request", message: parsed.error.message });
      return;
    }
    const { id, productId, productionDate, status, notes } = parsed.data;

    const existing = await db.query.batchesTable.findFirst({
      where: eq(batchesTable.id, id),
    });
    if (existing) {
      res.status(409).json({ error: "conflict", message: "Batch ID already exists" });
      return;
    }

    const product = await db.query.productsTable.findFirst({
      where: eq(productsTable.id, productId),
    });
    if (!product) {
      res.status(404).json({ error: "not_found", message: "Product not found" });
      return;
    }

    await db.insert(batchesTable).values({
      id,
      productId,
      productionDate: new Date(productionDate),
      status,
      notes: notes ?? null,
    });

    res.status(201).json({ id, productId, status, productionDate });
  } catch (err) {
    console.error("admin createBatch error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

const UpdateBatchSchema = z.object({
  status: z.enum(batchStatusEnum.enumValues).optional(),
  notes: z.string().optional(),
  productionDate: z.string().optional(),
});

router.put("/admin/batches/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const parsed = UpdateBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "bad_request", message: parsed.error.message });
      return;
    }

    const batch = await db.query.batchesTable.findFirst({
      where: eq(batchesTable.id, id),
    });
    if (!batch) {
      res.status(404).json({ error: "not_found", message: "Batch not found" });
      return;
    }

    const updates: Partial<typeof batch> = {};
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;
    if (parsed.data.productionDate !== undefined) {
      updates.productionDate = new Date(parsed.data.productionDate);
    }

    await db.update(batchesTable).set(updates).where(eq(batchesTable.id, id));
    res.json({ id, ...parsed.data });
  } catch (err) {
    console.error("admin updateBatch error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

const HeavyMetalEntrySchema = z.object({
  element: z.string(),
  resultPpm: z.number(),
  limitPpm: z.number(),
  pass: z.boolean(),
});

const CreateCoaSchema = z.object({
  id: z.string().min(1).max(100),
  testType: z.enum(testTypeEnum.enumValues),
  purityPercent: z.number().min(0).max(100).nullable().optional(),
  endotoxinEuPerMl: z.number().min(0).nullable().optional(),
  sterilityPass: z.boolean().nullable().optional(),
  heavyMetals: z.array(HeavyMetalEntrySchema).nullable().optional(),
  labName: z.string().default("Janoshik Analytical"),
  testedAt: z.string(),
  janoshikTaskId: z.string().nullable().optional(),
});

router.post("/admin/batches/:id/coa", async (req, res) => {
  try {
    const { id: batchId } = req.params;

    const batch = await db.query.batchesTable.findFirst({
      where: eq(batchesTable.id, batchId),
    });
    if (!batch) {
      res.status(404).json({ error: "not_found", message: "Batch not found" });
      return;
    }

    const parsed = CreateCoaSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "bad_request", message: parsed.error.message });
      return;
    }

    const {
      id,
      testType,
      purityPercent,
      endotoxinEuPerMl,
      sterilityPass,
      heavyMetals,
      labName,
      testedAt,
      janoshikTaskId,
    } = parsed.data;

    const existing = await db.query.coaResultsTable.findFirst({
      where: eq(coaResultsTable.id, id),
    });
    if (existing) {
      res.status(409).json({ error: "conflict", message: "COA ID already exists" });
      return;
    }

    await db.insert(coaResultsTable).values({
      id,
      batchId,
      testType,
      purityPercent: purityPercent ?? null,
      endotoxinEuPerMl: endotoxinEuPerMl ?? null,
      sterilityPass: sterilityPass ?? null,
      heavyMetals: heavyMetals ?? null,
      labName,
      testedAt: new Date(testedAt),
      janoshikTaskId: janoshikTaskId ?? null,
    });

    res.status(201).json({ id, batchId, testType });
  } catch (err) {
    console.error("admin createCoa error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

router.delete("/admin/coa/:coaId", async (req, res) => {
  try {
    const { coaId } = req.params;
    const coa = await db.query.coaResultsTable.findFirst({
      where: eq(coaResultsTable.id, coaId),
    });
    if (!coa) {
      res.status(404).json({ error: "not_found", message: "COA result not found" });
      return;
    }
    await db.delete(coaResultsTable).where(eq(coaResultsTable.id, coaId));
    res.json({ deleted: coaId });
  } catch (err) {
    console.error("admin deleteCoa error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

const CATEGORY_VALUES = categoryEnum.enumValues;

const CreateProductSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
  category: z.enum(CATEGORY_VALUES),
  shortDescription: z.string().min(1).max(500),
  longDescription: z.string().default(""),
  featured: z.boolean().default(false),
  published: z.boolean().default(true),
  imageUrl: z.string().url().nullable().optional(),
  researchUses: z.array(z.string()).default([]),
});

const UpdateProductSchema = CreateProductSchema.partial();

router.post("/admin/products", async (req, res) => {
  const parsed = CreateProductSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_request", message: parsed.error.message });
    return;
  }
  try {
    const existing = await db.query.productsTable.findFirst({
      where: eq(productsTable.slug, parsed.data.slug),
    });
    if (existing) {
      res.status(409).json({ error: "conflict", message: "A product with that slug already exists" });
      return;
    }
    const [product] = await db.insert(productsTable).values({
      ...parsed.data,
      imageUrl: parsed.data.imageUrl ?? null,
    }).returning();
    res.status(201).json(product);
  } catch (err) {
    console.error("admin createProduct error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

router.put("/admin/products/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "bad_request", message: "Invalid product ID" });
    return;
  }
  const parsed = UpdateProductSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_request", message: parsed.error.message });
    return;
  }
  try {
    const existing = await db.query.productsTable.findFirst({
      where: eq(productsTable.id, id),
    });
    if (!existing) {
      res.status(404).json({ error: "not_found", message: "Product not found" });
      return;
    }
    if (parsed.data.slug && parsed.data.slug !== existing.slug) {
      const slugConflict = await db.query.productsTable.findFirst({
        where: eq(productsTable.slug, parsed.data.slug),
      });
      if (slugConflict) {
        res.status(409).json({ error: "conflict", message: "Slug already in use" });
        return;
      }
    }
    const updates: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
    if ("imageUrl" in parsed.data) updates.imageUrl = parsed.data.imageUrl ?? null;
    const [updated] = await db.update(productsTable).set(updates).where(eq(productsTable.id, id)).returning();
    res.json(updated);
  } catch (err) {
    console.error("admin updateProduct error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

router.delete("/admin/products/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "bad_request", message: "Invalid product ID" });
    return;
  }
  try {
    const existing = await db.query.productsTable.findFirst({
      where: eq(productsTable.id, id),
    });
    if (!existing) {
      res.status(404).json({ error: "not_found", message: "Product not found" });
      return;
    }
    const batches = await db.query.batchesTable.findMany({
      where: eq(batchesTable.productId, id),
    });
    if (batches.length > 0) {
      res.status(409).json({
        error: "conflict",
        message: `Cannot delete: this product has ${batches.length} batch(es). Delete the batches first.`,
      });
      return;
    }
    await db.delete(productsTable).where(eq(productsTable.id, id));
    res.json({ deleted: id });
  } catch (err) {
    console.error("admin deleteProduct error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

const CreateVariantSchema = z.object({
  name: z.string().min(1).max(200),
  concentration: z.string().min(1).max(100),
  sizeml: z.number().positive(),
  priceCents: z.number().int().positive(),
  sku: z.string().min(1).max(100),
  inStock: z.boolean().default(true),
});

const UpdateVariantSchema = CreateVariantSchema.partial();

router.post("/admin/products/:id/variants", async (req, res) => {
  const productId = Number(req.params.id);
  if (!Number.isFinite(productId)) {
    res.status(400).json({ error: "bad_request", message: "Invalid product ID" });
    return;
  }
  const parsed = CreateVariantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_request", message: parsed.error.message });
    return;
  }
  try {
    const product = await db.query.productsTable.findFirst({
      where: eq(productsTable.id, productId),
    });
    if (!product) {
      res.status(404).json({ error: "not_found", message: "Product not found" });
      return;
    }
    const skuConflict = await db.query.productVariantsTable.findFirst({
      where: eq(productVariantsTable.sku, parsed.data.sku),
    });
    if (skuConflict) {
      res.status(409).json({ error: "conflict", message: "SKU already exists" });
      return;
    }
    const [variant] = await db.insert(productVariantsTable).values({
      ...parsed.data,
      productId,
    }).returning();
    res.status(201).json(variant);
  } catch (err) {
    console.error("admin createVariant error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

router.put("/admin/variants/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "bad_request", message: "Invalid variant ID" });
    return;
  }
  const parsed = UpdateVariantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_request", message: parsed.error.message });
    return;
  }
  try {
    const existing = await db.query.productVariantsTable.findFirst({
      where: eq(productVariantsTable.id, id),
    });
    if (!existing) {
      res.status(404).json({ error: "not_found", message: "Variant not found" });
      return;
    }
    if (parsed.data.sku && parsed.data.sku !== existing.sku) {
      const skuConflict = await db.query.productVariantsTable.findFirst({
        where: eq(productVariantsTable.sku, parsed.data.sku),
      });
      if (skuConflict) {
        res.status(409).json({ error: "conflict", message: "SKU already in use" });
        return;
      }
    }
    const [updated] = await db.update(productVariantsTable).set(parsed.data).where(eq(productVariantsTable.id, id)).returning();
    res.json(updated);
  } catch (err) {
    console.error("admin updateVariant error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

router.delete("/admin/variants/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "bad_request", message: "Invalid variant ID" });
    return;
  }
  try {
    const existing = await db.query.productVariantsTable.findFirst({
      where: eq(productVariantsTable.id, id),
    });
    if (!existing) {
      res.status(404).json({ error: "not_found", message: "Variant not found" });
      return;
    }
    await db.delete(productVariantsTable).where(eq(productVariantsTable.id, id));
    res.json({ deleted: id });
  } catch (err) {
    console.error("admin deleteVariant error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

// ── B2B wholesale accounts ──────────────────────────────────────────────────
// All /admin routes below are guarded by the adminAuth middleware above.

async function serializeAccount(account: typeof customerAccountsTable.$inferSelect) {
  let priceTier = null;
  if (account.priceTierId !== null) {
    priceTier =
      (await db.query.priceTiersTable.findFirst({
        where: eq(priceTiersTable.id, account.priceTierId),
      })) ?? null;
  }
  const { accessToken: _at, ...safe } = account;
  return { ...safe, priceTier };
}

router.get("/admin/accounts", async (req, res) => {
  try {
    const statusRaw = req.query.status;
    let statusFilter: (typeof accountStatusEnum.enumValues)[number] | undefined;
    if (typeof statusRaw === "string" && statusRaw.length > 0) {
      if (!(accountStatusEnum.enumValues as readonly string[]).includes(statusRaw)) {
        res.status(400).json({
          error: "bad_request",
          message: `Invalid status. Must be one of: ${accountStatusEnum.enumValues.join(", ")}`,
        });
        return;
      }
      statusFilter = statusRaw as (typeof accountStatusEnum.enumValues)[number];
    }

    const accounts = await db.query.customerAccountsTable.findMany({
      where: statusFilter ? eq(customerAccountsTable.status, statusFilter) : undefined,
      orderBy: [desc(customerAccountsTable.createdAt)],
    });

    const result = await Promise.all(accounts.map(serializeAccount));
    res.json(result);
  } catch (err) {
    console.error("admin listAccounts error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

const PatchAccountSchema = z.object({
  status: z.enum(accountStatusEnum.enumValues).optional(),
  priceTierId: z.number().int().positive().nullable().optional(),
  kybNotes: z.string().max(4000).nullable().optional(),
});

router.patch("/admin/accounts/:id", async (req, res) => {
  const parsed = PatchAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_request", message: parsed.error.message });
    return;
  }
  try {
    const account = await db.query.customerAccountsTable.findFirst({
      where: eq(customerAccountsTable.id, req.params.id),
    });
    if (!account) {
      res.status(404).json({ error: "not_found", message: "Account not found" });
      return;
    }

    if (parsed.data.priceTierId != null) {
      const tier = await db.query.priceTiersTable.findFirst({
        where: eq(priceTiersTable.id, parsed.data.priceTierId),
      });
      if (!tier) {
        res.status(400).json({ error: "bad_request", message: "Price tier not found" });
        return;
      }
    }

    const updates: Partial<typeof customerAccountsTable.$inferInsert> = {};
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if (parsed.data.priceTierId !== undefined) updates.priceTierId = parsed.data.priceTierId;
    if (parsed.data.kybNotes !== undefined) updates.kybNotes = parsed.data.kybNotes;
    if (parsed.data.status === "approved") {
      updates.approvedAt = new Date();
      updates.approvedBy = process.env.ADMIN_EMAIL ?? "admin";
    }

    const [updated] = await db
      .update(customerAccountsTable)
      .set(updates)
      .where(eq(customerAccountsTable.id, req.params.id))
      .returning();

    res.json(await serializeAccount(updated));
  } catch (err) {
    console.error("admin patchAccount error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

router.get("/admin/price-tiers", async (_req, res) => {
  try {
    const tiers = await db.query.priceTiersTable.findMany({
      orderBy: [asc(priceTiersTable.id)],
    });
    res.json(tiers);
  } catch (err) {
    console.error("admin listPriceTiers error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

// ── ACH / wire settlement ────────────────────────────────────────────────────
// Manual reconciliation: an admin confirms an incoming transfer was received,
// which settles the pending payment record and confirms the order. Mirrors the
// BTCPay webhook settle path (routes/webhooks.ts).
const ConfirmAchSchema = z.object({
  bankLast4: z.string().max(4).nullable().optional(),
});

router.post("/admin/orders/:id/confirm-ach", async (req, res) => {
  try {
    const parsed = ConfirmAchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "bad_request", message: parsed.error.message });
      return;
    }

    const order = await db.query.ordersTable.findFirst({
      where: eq(ordersTable.id, req.params.id),
    });
    if (!order) {
      res.status(404).json({ error: "not_found", message: "Order not found" });
      return;
    }

    const payment = await db.query.paymentRecordsTable.findFirst({
      where: and(
        eq(paymentRecordsTable.orderId, order.id),
        eq(paymentRecordsTable.status, "pending")
      ),
    });
    if (!payment) {
      res.status(404).json({
        error: "not_found",
        message: "No pending ACH payment record found for this order",
      });
      return;
    }

    const paymentUpdates: Partial<typeof paymentRecordsTable.$inferInsert> = {
      status: "confirmed",
      confirmedAt: new Date(),
    };
    if (parsed.data.bankLast4 != null) paymentUpdates.bankLast4 = parsed.data.bankLast4;

    // Settle the payment record and confirm the order atomically — mirrors the
    // BTCPay webhook settle path; neither write should land without the other.
    await db.transaction(async (tx) => {
      await tx
        .update(paymentRecordsTable)
        .set(paymentUpdates)
        .where(eq(paymentRecordsTable.id, payment.id));
      await tx
        .update(ordersTable)
        .set({ status: "confirmed" })
        .where(eq(ordersTable.id, order.id));
    });

    res.json({
      orderId: order.id,
      paymentRecordId: payment.id,
      orderStatus: "confirmed",
      paymentStatus: "confirmed",
    });
  } catch (err) {
    console.error("admin confirmAch error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

// ── Dashboard ────────────────────────────────────────────────────────────────
router.get("/admin/stats", async (_req, res) => {
  try {
    const [
      pendingAccountsRows,
      totalAccountsRows,
      totalProductsRows,
      blockedSkusRows,
      outOfStockRows,
      statusRows,
      revenueRows,
    ] = await Promise.all([
      db.select({ c: count() }).from(customerAccountsTable).where(eq(customerAccountsTable.status, "pending")),
      db.select({ c: count() }).from(customerAccountsTable),
      db.select({ c: count() }).from(productsTable),
      db.select({ c: count() }).from(productsTable).where(eq(productsTable.complianceStatus, "blocked")),
      db.select({ c: count() }).from(productVariantsTable).where(eq(productVariantsTable.inStock, false)),
      db.select({ status: ordersTable.status, c: count() }).from(ordersTable).groupBy(ordersTable.status),
      // Only "confirmed" exists among {confirmed, fulfilled, shipped} in orderStatusEnum.
      db
        .select({ total: sql<string>`coalesce(sum(${ordersTable.totalCents}), 0)` })
        .from(ordersTable)
        .where(eq(ordersTable.status, "confirmed")),
    ]);

    const ordersByStatus: Record<string, number> = {};
    for (const s of orderStatusEnum.enumValues) ordersByStatus[s] = 0;
    for (const row of statusRows) ordersByStatus[row.status] = row.c;

    res.json({
      pendingAccounts: pendingAccountsRows[0]?.c ?? 0,
      ordersByStatus,
      revenueCentsConfirmed: Number(revenueRows[0]?.total ?? 0),
      outOfStockVariants: outOfStockRows[0]?.c ?? 0,
      blockedSkus: blockedSkusRows[0]?.c ?? 0,
      totalProducts: totalProductsRows[0]?.c ?? 0,
      totalAccounts: totalAccountsRows[0]?.c ?? 0,
    });
  } catch (err) {
    console.error("admin stats error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

// ── Orders ops ───────────────────────────────────────────────────────────────
router.get("/admin/orders", async (req, res) => {
  try {
    const filters = [];

    const channelRaw = req.query.channel;
    if (typeof channelRaw === "string" && channelRaw.length > 0) {
      if (!(orderChannelEnum.enumValues as readonly string[]).includes(channelRaw)) {
        res.status(400).json({
          error: "bad_request",
          message: `Invalid channel. Must be one of: ${orderChannelEnum.enumValues.join(", ")}`,
        });
        return;
      }
      filters.push(eq(ordersTable.channel, channelRaw as (typeof orderChannelEnum.enumValues)[number]));
    }

    const statusRaw = req.query.status;
    if (typeof statusRaw === "string" && statusRaw.length > 0) {
      if (!(orderStatusEnum.enumValues as readonly string[]).includes(statusRaw)) {
        res.status(400).json({
          error: "bad_request",
          message: `Invalid status. Must be one of: ${orderStatusEnum.enumValues.join(", ")}`,
        });
        return;
      }
      filters.push(eq(ordersTable.status, statusRaw as (typeof orderStatusEnum.enumValues)[number]));
    }

    const orders = await db.query.ordersTable.findMany({
      where: filters.length ? and(...filters) : undefined,
      orderBy: [desc(ordersTable.createdAt)],
    });

    res.json(
      orders.map((o) => ({
        id: o.id,
        createdAt: o.createdAt,
        channel: o.channel,
        status: o.status,
        totalCents: o.totalCents,
        shippingName: o.shippingName,
        shippingEmail: o.shippingEmail,
        accountId: o.accountId ?? null,
        paymentMethod: o.paymentMethod,
      }))
    );
  } catch (err) {
    console.error("admin listOrders error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

router.get("/admin/orders/:id", async (req, res) => {
  try {
    const order = await db.query.ordersTable.findFirst({
      where: eq(ordersTable.id, req.params.id),
    });
    if (!order) {
      res.status(404).json({ error: "not_found", message: "Order not found" });
      return;
    }

    const [payments, attestations] = await Promise.all([
      db.query.paymentRecordsTable.findMany({
        where: eq(paymentRecordsTable.orderId, order.id),
        orderBy: [desc(paymentRecordsTable.createdAt)],
      }),
      db.query.orderAttestationsTable.findMany({
        where: eq(orderAttestationsTable.orderId, order.id),
        orderBy: [asc(orderAttestationsTable.createdAt)],
      }),
    ]);

    let account = null;
    if (order.accountId) {
      account = (await db.query.customerAccountsTable.findFirst({
        where: eq(customerAccountsTable.id, order.accountId),
      })) ?? null;
      if (account) {
        const { accessToken: _at, ...safe } = account;
        account = safe as typeof account;
      }
    }

    res.json({ ...order, payments, attestations, account });
  } catch (err) {
    console.error("admin getOrder error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

// Terminal states cannot transition to a different status.
const TERMINAL_ORDER_STATUSES: readonly string[] = ["refunded"];

const PatchOrderSchema = z
  .object({
    status: z.enum(orderStatusEnum.enumValues).optional(),
    trackingNumber: z.string().max(200).nullable().optional(),
    carrier: z.string().max(100).nullable().optional(),
  })
  .refine((v) => v.status !== undefined || v.trackingNumber !== undefined || v.carrier !== undefined, {
    message: "At least one of status, trackingNumber, or carrier is required",
  });

router.patch("/admin/orders/:id", async (req, res) => {
  const parsed = PatchOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_request", message: parsed.error.message });
    return;
  }
  try {
    const order = await db.query.ordersTable.findFirst({
      where: eq(ordersTable.id, req.params.id),
    });
    if (!order) {
      res.status(404).json({ error: "not_found", message: "Order not found" });
      return;
    }

    if (
      parsed.data.status !== undefined &&
      parsed.data.status !== order.status &&
      TERMINAL_ORDER_STATUSES.includes(order.status)
    ) {
      res.status(409).json({
        error: "conflict",
        message: `Order is in terminal status "${order.status}" and cannot be changed`,
      });
      return;
    }

    const updates: Partial<typeof ordersTable.$inferInsert> = { updatedAt: new Date() };
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if (parsed.data.trackingNumber !== undefined) updates.trackingNumber = parsed.data.trackingNumber;
    if (parsed.data.carrier !== undefined) updates.carrier = parsed.data.carrier;

    const [updated] = await db.transaction(async (tx) =>
      tx.update(ordersTable).set(updates).where(eq(ordersTable.id, order.id)).returning()
    );

    res.json(updated);
  } catch (err) {
    console.error("admin patchOrder error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

// Records a refund. The actual crypto refund is performed off-platform per
// CRYPTO_REFUND_GUIDE.md — this endpoint only sets the order's status of record.
router.post("/admin/orders/:id/refund", async (req, res) => {
  try {
    const order = await db.query.ordersTable.findFirst({
      where: eq(ordersTable.id, req.params.id),
    });
    if (!order) {
      res.status(404).json({ error: "not_found", message: "Order not found" });
      return;
    }
    if (order.status === "refunded") {
      res.status(409).json({ error: "conflict", message: "Order is already refunded" });
      return;
    }

    const [updated] = await db
      .update(ordersTable)
      .set({ status: "refunded", updatedAt: new Date() })
      .where(eq(ordersTable.id, order.id))
      .returning();

    res.json(updated);
  } catch (err) {
    console.error("admin refundOrder error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

// ── Catalog edit ─────────────────────────────────────────────────────────────
// Full catalog including blocked products (unlike the public listing).
router.get("/admin/catalog", async (_req, res) => {
  try {
    const products = await db.query.productsTable.findMany({
      orderBy: [asc(productsTable.name)],
      with: { variants: { orderBy: [asc(productVariantsTable.name)] } },
    });

    res.json(
      products.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        category: p.category,
        featured: p.featured,
        complianceStatus: p.complianceStatus,
        sourcingPath: p.sourcingPath ?? null,
        variants: p.variants.map((v) => ({
          id: v.id,
          sku: v.sku,
          priceCents: v.priceCents,
          inStock: v.inStock,
          unitType: v.unitType,
        })),
      }))
    );
  } catch (err) {
    console.error("admin catalog error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

// Compliance / merchandising controls. complianceStatus is a dormant admin
// control — flipping it here does not auto-block anything downstream.
const PatchProductComplianceSchema = z
  .object({
    featured: z.boolean().optional(),
    complianceStatus: z.enum(complianceStatusEnum.enumValues).optional(),
    sourcingPath: z.enum(sourcingPathEnum.enumValues).nullable().optional(),
  })
  .refine(
    (v) => v.featured !== undefined || v.complianceStatus !== undefined || v.sourcingPath !== undefined,
    { message: "At least one of featured, complianceStatus, or sourcingPath is required" }
  );

router.patch("/admin/products/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "bad_request", message: "Invalid product ID" });
    return;
  }
  const parsed = PatchProductComplianceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_request", message: parsed.error.message });
    return;
  }
  try {
    const existing = await db.query.productsTable.findFirst({
      where: eq(productsTable.id, id),
    });
    if (!existing) {
      res.status(404).json({ error: "not_found", message: "Product not found" });
      return;
    }
    const updates: Partial<typeof productsTable.$inferInsert> = { updatedAt: new Date() };
    if (parsed.data.featured !== undefined) updates.featured = parsed.data.featured;
    if (parsed.data.complianceStatus !== undefined) updates.complianceStatus = parsed.data.complianceStatus;
    if (parsed.data.sourcingPath !== undefined) updates.sourcingPath = parsed.data.sourcingPath;

    const [updated] = await db.update(productsTable).set(updates).where(eq(productsTable.id, id)).returning();
    res.json(updated);
  } catch (err) {
    console.error("admin patchProduct error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

const PatchVariantPricingSchema = z
  .object({
    priceCents: z.number().int().positive().optional(),
    inStock: z.boolean().optional(),
  })
  .refine((v) => v.priceCents !== undefined || v.inStock !== undefined, {
    message: "At least one of priceCents or inStock is required",
  });

router.patch("/admin/variants/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "bad_request", message: "Invalid variant ID" });
    return;
  }
  const parsed = PatchVariantPricingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_request", message: parsed.error.message });
    return;
  }
  try {
    const existing = await db.query.productVariantsTable.findFirst({
      where: eq(productVariantsTable.id, id),
    });
    if (!existing) {
      res.status(404).json({ error: "not_found", message: "Variant not found" });
      return;
    }
    const updates: Partial<typeof productVariantsTable.$inferInsert> = {};
    if (parsed.data.priceCents !== undefined) updates.priceCents = parsed.data.priceCents;
    if (parsed.data.inStock !== undefined) updates.inStock = parsed.data.inStock;

    const [updated] = await db.update(productVariantsTable).set(updates).where(eq(productVariantsTable.id, id)).returning();
    res.json(updated);
  } catch (err) {
    console.error("admin patchVariant error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

export default router;
