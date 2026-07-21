import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, asc, desc } from "drizzle-orm";
import { pbkdf2Sync, timingSafeEqual } from "crypto";
import { db } from "@atlab/db";
import {
  batchesTable,
  coaResultsTable,
  productsTable,
  productVariantsTable,
  categoryEnum,
  batchStatusEnum,
  testTypeEnum,
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

export default router;
