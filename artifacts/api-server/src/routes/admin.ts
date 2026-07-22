import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, and, ne, asc, desc, count, inArray, notInArray, sql } from "drizzle-orm";
import { createHash, timingSafeEqual } from "crypto";
import { db } from "@atlab/db";
import {
  batchesTable,
  coaResultsTable,
  productsTable,
  productVariantsTable,
  adminUsersTable,
  customerAccountsTable,
  priceTiersTable,
  ordersTable,
  paymentRecordsTable,
  orderAttestationsTable,
  storeSettingsTable,
  categoryEnum,
  batchStatusEnum,
  testTypeEnum,
  accountStatusEnum,
  orderStatusEnum,
  orderChannelEnum,
  complianceStatusEnum,
  sourcingPathEnum,
  unitTypeEnum,
} from "@atlab/db/schema";
import { z } from "zod/v4";
import { randomUUID } from "crypto";
import { hashPassword, verifyPassword, verifyDummyPassword } from "../lib/password";
import {
  authenticateAdmin,
  createAdminSession,
  revokeAdminSessions,
  adminActorEmail,
} from "../lib/adminSession";
import { loginRateLimit } from "../lib/rateLimit";
import {
  SETTLEABLE_ORDER_STATUSES,
  TERMINAL_ORDER_STATUSES,
} from "../lib/orderStatus";

const router: IRouter = Router();

// Every /admin request resolves to a live admin_sessions row -> an active
// admin_users row (or the ops break-glass secret). This is what makes
// deactivation and password reset actually revoke access — the previous
// "token == ADMIN_SECRET" check consulted no user state at all.
async function adminAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const identity = await authenticateAdmin(req);
  if (!identity) {
    res.status(401).json({ error: "unauthorized", message: "Invalid admin key" });
    return;
  }
  req.adminIdentity = identity;
  next();
}

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Validates the legacy single env credential. Retained as the safety fallback
// for when admin_users is empty (fresh DB, or the bootstrap insert failed) so a
// misconfigured table can never lock the owner out of the console.
async function envCredentialMatches(email: string, password: string): Promise<boolean> {
  const storedEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const storedHash = process.env.ADMIN_PASSWORD_HASH;
  if (!storedEmail || !storedHash) return false;

  // Digest first so the comparison is fixed-length and cannot throw on a
  // length mismatch (which would itself leak the stored email's length).
  const emailMatch = timingSafeEqual(
    createHash("sha256").update(storedEmail).digest(),
    createHash("sha256").update(email).digest()
  );
  if (!emailMatch) return false;

  return verifyPassword(password, storedHash);
}

router.post("/admin/login", loginRateLimit, async (req: Request, res: Response): Promise<void> => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_request", message: "Email and password are required" });
    return;
  }

  const { password } = parsed.data;
  const email = parsed.data.email.trim().toLowerCase();

  // Primary path: the admin_users table. Success mints an opaque session token
  // bound to this operator — NOT the shared ADMIN_SECRET.
  try {
    const user = await db.query.adminUsersTable.findFirst({
      where: eq(adminUsersTable.email, email),
    });

    if (user) {
      // Verify before branching on isActive so both failures cost the same.
      const passwordOk = await verifyPassword(password, user.passwordHash);
      if (!passwordOk || !user.isActive) {
        res.status(401).json({ error: "unauthorized", message: "Invalid credentials" });
        return;
      }
      const session = await createAdminSession(user.id);
      res.json({ token: session.token, expiresAt: session.expiresAt.toISOString() });
      return;
    }

    const [{ total }] = await db.select({ total: count() }).from(adminUsersTable);
    if (total > 0) {
      // Unknown operator: burn the same CPU a real verify would, so response
      // time does not disclose which emails are provisioned.
      await verifyDummyPassword(password);
      res.status(401).json({ error: "unauthorized", message: "Invalid credentials" });
      return;
    }
  } catch (err) {
    console.error("adminLogin lookup error (falling back to env credential):", err);
  }

  // Fallback: table empty (or unreachable) — accept the env credential. There
  // is no admin_users row to bind a session to here, so this path (and only
  // this path) hands back the ops break-glass secret.
  if (!(await envCredentialMatches(email, password))) {
    res.status(401).json({ error: "unauthorized", message: "Invalid credentials" });
    return;
  }

  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    res.status(503).json({ error: "not_configured", message: "Admin credentials not configured" });
    return;
  }
  res.json({ token: adminSecret });
});

router.use("/admin", adminAuth);

// ── Admin user management ────────────────────────────────────────────────────
// Multiple back-office operators, each with their own password. These rows are
// the source of truth for console access: /admin/login mints a session bound to
// one of them, and adminAuth re-checks the row on every request.
// passwordHash is never serialized out.

function serializeAdminUser(u: typeof adminUsersTable.$inferSelect) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    isActive: u.isActive,
    createdAt: u.createdAt.toISOString(),
  };
}

router.get("/admin/users", async (_req, res) => {
  try {
    const users = await db.query.adminUsersTable.findMany({
      orderBy: [asc(adminUsersTable.createdAt)],
    });
    res.json(users.map(serializeAdminUser));
  } catch (err) {
    console.error("admin listAdminUsers error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

const CreateAdminUserSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(200).optional(),
});

router.post("/admin/users", async (req, res) => {
  const parsed = CreateAdminUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "bad_request",
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();

  try {
    const existing = await db.query.adminUsersTable.findFirst({
      where: eq(adminUsersTable.email, email),
    });
    if (existing) {
      res.status(409).json({
        error: "conflict",
        message: "An admin user with that email already exists",
      });
      return;
    }

    const [created] = await db
      .insert(adminUsersTable)
      .values({
        id: randomUUID(),
        email,
        passwordHash: await hashPassword(parsed.data.password),
        name: parsed.data.name ?? null,
      })
      .returning();

    res.status(201).json(serializeAdminUser(created));
  } catch (err) {
    console.error("admin createAdminUser error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

const PatchAdminUserSchema = z.object({
  name: z.string().min(1).max(200).nullable().optional(),
  isActive: z.boolean().optional(),
});

router.patch("/admin/users/:id", async (req, res) => {
  const parsed = PatchAdminUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_request", message: parsed.error.message });
    return;
  }

  try {
    const user = await db.query.adminUsersTable.findFirst({
      where: eq(adminUsersTable.id, req.params.id),
    });
    if (!user) {
      res.status(404).json({ error: "not_found", message: "Admin user not found" });
      return;
    }

    // Never let the last active operator be deactivated — that would leave the
    // console reachable only through the env fallback.
    if (parsed.data.isActive === false && user.isActive) {
      const [{ total }] = await db
        .select({ total: count() })
        .from(adminUsersTable)
        .where(eq(adminUsersTable.isActive, true));
      if (total <= 1) {
        res.status(409).json({
          error: "conflict",
          message: "Cannot deactivate the last active admin user",
        });
        return;
      }
    }

    const updates: Partial<typeof adminUsersTable.$inferInsert> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;

    if (Object.keys(updates).length === 0) {
      res.json(serializeAdminUser(user));
      return;
    }

    const [updated] = await db
      .update(adminUsersTable)
      .set(updates)
      .where(eq(adminUsersTable.id, req.params.id))
      .returning();

    // Deactivation must take effect now, not at session expiry.
    if (parsed.data.isActive === false) {
      await revokeAdminSessions(user.id);
    }

    res.json(serializeAdminUser(updated));
  } catch (err) {
    console.error("admin patchAdminUser error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

const SetAdminPasswordSchema = z.object({
  password: z.string().min(8).max(200),
  currentPassword: z.string().min(1).max(200).optional(),
});

router.post("/admin/users/:id/password", async (req, res) => {
  const parsed = SetAdminPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "bad_request",
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    });
    return;
  }

  try {
    const user = await db.query.adminUsersTable.findFirst({
      where: eq(adminUsersTable.id, req.params.id),
    });
    if (!user) {
      res.status(404).json({ error: "not_found", message: "Admin user not found" });
      return;
    }

    // currentPassword is optional (an admin can reset a peer), but when supplied
    // it must be correct — that is the self-service change-password path.
    if (
      parsed.data.currentPassword !== undefined &&
      !(await verifyPassword(parsed.data.currentPassword, user.passwordHash))
    ) {
      res.status(401).json({ error: "unauthorized", message: "Current password is incorrect" });
      return;
    }

    await db
      .update(adminUsersTable)
      .set({ passwordHash: await hashPassword(parsed.data.password) })
      .where(eq(adminUsersTable.id, req.params.id));

    // A password change must invalidate every session opened under the old
    // one — otherwise "reset their password" locks nobody out.
    await revokeAdminSessions(user.id);

    res.json({ ok: true });
  } catch (err) {
    console.error("admin setAdminUserPassword error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

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

// No .default() on the shared shape. A default survives .partial(), so on an
// UPDATE Zod fills every absent key and .set() writes the injected value: a PUT
// carrying only {name} silently emptied longDescription and reset featured to
// false. Defaults are applied on create only, below.
const ProductFieldsSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
  category: z.enum(CATEGORY_VALUES),
  // Provenance shown to buyers. Editable because it is a factual claim about the
  // product, and correcting it previously required SQL.
  sourcingPath: z.enum(sourcingPathEnum.enumValues).nullable().optional(),
  shortDescription: z.string().min(1).max(500),
  longDescription: z.string(),
  featured: z.boolean(),
  published: z.boolean(),
  imageUrl: z.string().url().nullable().optional(),
  researchUses: z.array(z.string()),
});

const CreateProductSchema = ProductFieldsSchema.extend({
  longDescription: z.string().default(""),
  featured: z.boolean().default(false),
  published: z.boolean().default(true),
  researchUses: z.array(z.string()).default([]),
});

// Absent key means "leave it alone", never "reset to default".
const UpdateProductSchema = ProductFieldsSchema.partial();

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

// unitType is load-bearing: the wholesale rules (kit-only, 5-kit MOQ) are
// enforced against it at checkout, so a wrong value makes a variant either
// unsellable to wholesale or wrongly sellable. It had no admin control at all.
//
// vialsPerUnit backs the "10-vial kit" claim in every product description. The
// refine keeps the two coherent: a single vial is one vial by definition, and a
// kit of one is not a kit. Without it the copy and the data can drift silently.
// No .default() here, deliberately. A default survives .partial(), so Zod fills
// absent keys on an UPDATE and .set() then writes the injected value — a PUT
// carrying only vialsPerUnit would silently rewrite unitType to "vial" and
// convert a wholesale kit into a single vial. Defaults belong on create only.
const VariantFieldsSchema = z.object({
  name: z.string().min(1).max(200),
  concentration: z.string().min(1).max(100),
  sizeml: z.number().positive(),
  priceCents: z.number().int().positive(),
  sku: z.string().min(1).max(100),
  unitType: z.enum(unitTypeEnum.enumValues),
  vialsPerUnit: z.number().int().positive().max(1000),
  inStock: z.boolean(),
});

function vialsMatchUnitType(v: {
  unitType?: "vial" | "kit";
  vialsPerUnit?: number;
}): boolean {
  if (v.unitType === undefined || v.vialsPerUnit === undefined) return true;
  return v.unitType === "vial" ? v.vialsPerUnit === 1 : v.vialsPerUnit > 1;
}

const UNIT_MISMATCH =
  "A vial must have vialsPerUnit 1; a kit must have more than 1.";

const CreateVariantSchema = VariantFieldsSchema.extend({
  unitType: z.enum(unitTypeEnum.enumValues).default("vial"),
  vialsPerUnit: z.number().int().positive().max(1000).default(1),
  inStock: z.boolean().default(true),
}).refine(vialsMatchUnitType, { message: UNIT_MISMATCH });

// Partial with no defaults: an absent key means "leave it alone", never "reset".
const UpdateVariantSchema = VariantFieldsSchema.partial().refine(
  vialsMatchUnitType,
  { message: UNIT_MISMATCH }
);

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

    // Validate the MERGED row, not just the patch: sending unitType alone would
    // otherwise pass the schema refine and leave a stale vialsPerUnit behind —
    // e.g. a "kit" still recorded as holding one vial.
    if (
      !vialsMatchUnitType({
        unitType: parsed.data.unitType ?? existing.unitType,
        vialsPerUnit: parsed.data.vialsPerUnit ?? existing.vialsPerUnit,
      })
    ) {
      res.status(400).json({ error: "bad_request", message: UNIT_MISMATCH });
      return;
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
      updates.approvedBy = adminActorEmail(req);
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

    // Settle the payment record and confirm the order atomically — same shape as
    // the BTCPay webhook settle path. Both updates carry their own status
    // predicate rather than trusting the SELECT above: without them two
    // concurrent confirmations both succeed, and an order an admin has already
    // refunded is confirmed a second time.
    const settled = await db.transaction(async (tx) => {
      const [movedPayment] = await tx
        .update(paymentRecordsTable)
        .set(paymentUpdates)
        .where(
          and(
            eq(paymentRecordsTable.id, payment.id),
            eq(paymentRecordsTable.status, "pending")
          )
        )
        .returning();

      if (!movedPayment) return false;

      const [movedOrder] = await tx
        .update(ordersTable)
        .set({ status: "confirmed", updatedAt: new Date() })
        .where(
          and(
            eq(ordersTable.id, order.id),
            inArray(ordersTable.status, SETTLEABLE_ORDER_STATUSES)
          )
        )
        .returning();

      if (!movedOrder) {
        console.error(
          `[admin] ACH payment ${payment.id} was confirmed but order ${order.id} ` +
            `was not in a settleable status; needs manual review`
        );
      }

      return true;
    });

    if (!settled) {
      res.status(409).json({
        error: "conflict",
        message: "This payment has already been settled",
      });
      return;
    }

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

    // The terminal check above reads the SELECTed row, which is already stale.
    // When this request changes status, re-assert non-terminality on the UPDATE
    // so a refund committed in between cannot be silently overwritten.
    const guard = and(
      eq(ordersTable.id, order.id),
      parsed.data.status !== undefined
        ? notInArray(ordersTable.status, [...TERMINAL_ORDER_STATUSES])
        : undefined
    );

    const [updated] = await db.transaction(async (tx) =>
      tx.update(ordersTable).set(updates).where(guard).returning()
    );

    if (!updated) {
      res.status(409).json({
        error: "conflict",
        message: "Order reached a terminal status before this change was applied",
      });
      return;
    }

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

    // The status predicate lives on the UPDATE, not just the check above: two
    // concurrent refund clicks would otherwise both pass the SELECT and both
    // write, recording the refund twice.
    const [updated] = await db
      .update(ordersTable)
      .set({ status: "refunded", updatedAt: new Date() })
      .where(
        and(eq(ordersTable.id, order.id), ne(ordersTable.status, "refunded"))
      )
      .returning();

    if (!updated) {
      res.status(409).json({ error: "conflict", message: "Order is already refunded" });
      return;
    }

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

// ── Store settings ───────────────────────────────────────────────────────────
// Global storefront toggles (single 'default' row). Upserts if the row is absent.
const PatchSettingsSchema = z
  .object({
    showVialImages: z.boolean().optional(),
  })
  .refine((v) => v.showVialImages !== undefined, {
    message: "At least one of showVialImages is required",
  });

router.patch("/admin/settings", async (req, res) => {
  const parsed = PatchSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_request", message: parsed.error.message });
    return;
  }
  try {
    const updates: Partial<typeof storeSettingsTable.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (parsed.data.showVialImages !== undefined) {
      updates.showVialImages = parsed.data.showVialImages;
    }

    const [row] = await db
      .insert(storeSettingsTable)
      .values({ id: "default", ...updates })
      .onConflictDoUpdate({ target: storeSettingsTable.id, set: updates })
      .returning();

    res.json({ showVialImages: row.showVialImages });
  } catch (err) {
    console.error("admin patchSettings error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

export default router;
