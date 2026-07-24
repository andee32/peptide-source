import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, and, asc, desc, count, sql } from "drizzle-orm";
import { createHash, timingSafeEqual } from "crypto";
import multer from "multer";
import { db } from "@atlab/db";
import {
  batchesTable,
  coaResultsTable,
  coaDocumentsTable,
  productsTable,
  productVariantsTable,
  adminUsersTable,
  customerAccountsTable,
  priceTiersTable,
  ordersTable,
  paymentRecordsTable,
  orderAttestationsTable,
  storeSettingsTable,
  discountCodesTable,
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
import { randomUUID } from "crypto";
import { hashPassword, verifyPassword, verifyDummyPassword } from "../lib/password";
import {
  authenticateAdmin,
  createAdminSession,
  revokeAdminSessions,
  adminActorEmail,
} from "../lib/adminSession";
import { loginRateLimit } from "../lib/rateLimit";
import { extractCoaFromFile } from "../services/coaExtract";

const router: IRouter = Router();

const ALLOWED_COA_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const coaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter(_req, file, cb) {
    cb(null, ALLOWED_COA_MIME.has(file.mimetype));
  },
});

// multer's `.single()` middleware reports rejections (oversize file,
// malformed multipart body) by calling `next(err)` from the middleware
// layer, before the route handler's own try/catch runs. There is no
// app-wide (err, req, res, next) error handler, so an unwrapped chain
// falls through to Express's default HTML error page, breaking the API's
// JSON error contract. This wrapper converts multer rejections into the
// same { error, message } JSON shape the rest of this router uses.
function uploadCoaFile(req: Request, res: Response, next: NextFunction) {
  coaUpload.single("file")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      res.status(status).json({
        error: "bad_request",
        message:
          err.code === "LIMIT_FILE_SIZE"
            ? "File too large (max 10 MB)"
            : `Upload error: ${err.message}`,
      });
      return;
    }
    if (err) {
      res.status(400).json({ error: "bad_request", message: "Upload failed" });
      return;
    }
    next();
  });
}

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
      const documents = await db.query.coaDocumentsTable.findMany({
        where: eq(coaDocumentsTable.batchId, batch.id),
        columns: { id: true, filename: true, sizeBytes: true, createdAt: true },
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
        documents,
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

router.post("/admin/batches/:id/coa-file", uploadCoaFile, async (req, res) => {
  try {
    // multer's `.single()` middleware is typed as a plain (path-agnostic)
    // RequestHandler, so chaining it here widens req.params to
    // ParamsDictionary (string | string[]) instead of the path-literal-
    // inferred `{ id: string }`. The route pattern guarantees a single value.
    const batchId = req.params.id as string;

    const batch = await db.query.batchesTable.findFirst({
      where: eq(batchesTable.id, batchId),
    });
    if (!batch) {
      res.status(404).json({ error: "not_found", message: "Batch not found" });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({
        error: "bad_request",
        message: "Missing or unsupported file (allowed: PDF, JPEG, PNG, WebP; max 10 MB)",
      });
      return;
    }

    const documentId = randomUUID();
    await db.insert(coaDocumentsTable).values({
      id: documentId,
      batchId,
      filename: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      data: file.buffer,
    });

    // Soft-fail: extraction never blocks the upload. Null => admin enters manually.
    const extracted = await extractCoaFromFile(file.buffer, file.mimetype);

    res.status(201).json({ documentId, filename: file.originalname, extracted });
  } catch (err) {
    console.error("admin uploadCoaFile error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

router.delete("/admin/batches/:id/coa-file/:docId", async (req, res) => {
  try {
    const { id: batchId, docId } = req.params;
    const deleted = await db
      .delete(coaDocumentsTable)
      .where(and(eq(coaDocumentsTable.id, docId), eq(coaDocumentsTable.batchId, batchId)))
      .returning({ id: coaDocumentsTable.id });
    if (deleted.length === 0) {
      res.status(404).json({ error: "not_found", message: "Document not found" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("admin deleteCoaFile error:", err);
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

// The whole dual-price model rests on retail sitting above wholesale: a kit
// listed at or below its wholesale list price sells on the public storefront
// below what accounts pay. Enforced server-side (the admin UI hint is advisory);
// a fat-fingered decimal is far likelier than any attacker here.
function kitPricingViolation(
  unitType: "vial" | "kit",
  priceCents: number,
  retailPriceCents: number | null | undefined,
): string | null {
  if (unitType !== "kit") return null;
  if (retailPriceCents == null) return null;
  if (retailPriceCents > priceCents) return null;
  return `A kit's retail price ($${(retailPriceCents / 100).toFixed(2)}) must be above its wholesale list price ($${(priceCents / 100).toFixed(2)}).`;
}

const CreateVariantSchema = z.object({
  name: z.string().min(1).max(200),
  concentration: z.string().min(1).max(100),
  sizeml: z.number().positive(),
  priceCents: z.number().int().positive(),
  // Kit variants only: the retail price. Null/absent keeps the kit
  // wholesale-only (hidden from the retail store).
  retailPriceCents: z.number().int().positive().nullish(),
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
    // Defensive: this route creates vials (unitType defaults in the DB), so a
    // retail price here is only meaningful if kits ever become creatable —
    // reject an inverted pair now rather than let one be persisted.
    if (
      parsed.data.retailPriceCents != null &&
      parsed.data.retailPriceCents <= parsed.data.priceCents
    ) {
      res.status(422).json({
        error: "unprocessable_entity",
        code: "KIT_PRICING_INVERTED",
        message:
          "A retail price must be above the wholesale list price.",
      });
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
    const putViolation = kitPricingViolation(
      existing.unitType,
      parsed.data.priceCents ?? existing.priceCents,
      parsed.data.retailPriceCents !== undefined
        ? parsed.data.retailPriceCents
        : existing.retailPriceCents,
    );
    if (putViolation) {
      res.status(422).json({
        error: "unprocessable_entity",
        code: "KIT_PRICING_INVERTED",
        message: putViolation,
      });
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
          retailPriceCents: v.retailPriceCents,
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
    retailPriceCents: z.number().int().positive().nullable().optional(),
    inStock: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.priceCents !== undefined ||
      v.retailPriceCents !== undefined ||
      v.inStock !== undefined,
    { message: "At least one field is required" },
  );

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
    const patchViolation = kitPricingViolation(
      existing.unitType,
      parsed.data.priceCents ?? existing.priceCents,
      parsed.data.retailPriceCents !== undefined
        ? parsed.data.retailPriceCents
        : existing.retailPriceCents,
    );
    if (patchViolation) {
      res.status(422).json({
        error: "unprocessable_entity",
        code: "KIT_PRICING_INVERTED",
        message: patchViolation,
      });
      return;
    }

    const updates: Partial<typeof productVariantsTable.$inferInsert> = {};
    if (parsed.data.priceCents !== undefined) updates.priceCents = parsed.data.priceCents;
    if (parsed.data.retailPriceCents !== undefined)
      updates.retailPriceCents = parsed.data.retailPriceCents;
    if (parsed.data.inStock !== undefined) updates.inStock = parsed.data.inStock;

    const [updated] = await db.update(productVariantsTable).set(updates).where(eq(productVariantsTable.id, id)).returning();
    res.json(updated);
  } catch (err) {
    console.error("admin patchVariant error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});


// ── Discount codes ───────────────────────────────────────────────────────────
// Retail promo codes (docs/discount-system-design.md). Codes are never
// hard-deleted — orders reference them for per-code reporting; deactivate
// instead. Consumption happens atomically in POST /orders, not here.

const CODE_PATTERN = /^[A-Za-z0-9-]+$/;

const CreateDiscountCodeSchema = z.object({
  code: z
    .string()
    .min(2)
    .max(64)
    .regex(CODE_PATTERN, "Letters, digits, and hyphens only"),
  percentBps: z.number().int().min(1).max(5000),
  expiresAt: z.string().nullish(),
  maxUses: z.number().int().min(1).nullish(),
  note: z.string().max(500).nullish(),
});

const PatchDiscountCodeSchema = z.object({
  code: z
    .string()
    .min(2)
    .max(64)
    .regex(CODE_PATTERN, "Letters, digits, and hyphens only")
    .optional(),
  percentBps: z.number().int().min(1).max(5000).optional(),
  expiresAt: z.string().nullish(),
  maxUses: z.number().int().min(1).nullish(),
  active: z.boolean().optional(),
  note: z.string().max(500).nullish(),
});

function parseExpiry(
  raw: string | null | undefined
): { ok: true; value: Date | null } | { ok: false } {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  // A bare date means "valid through the end of that day", not its first
  // instant — new Date("2026-08-01") is UTC midnight, which would expire the
  // code before the displayed day even starts in any western timezone.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const d = new Date(dateOnly ? `${raw}T23:59:59.999Z` : raw);
  if (Number.isNaN(d.getTime())) return { ok: false };
  return { ok: true, value: d };
}

const discountCodeReportColumns = {
  confirmedOrders: sql<number>`count(${ordersTable.id}) filter (where ${ordersTable.status} = 'confirmed')`.mapWith(Number),
  confirmedRevenueCents: sql<number>`coalesce(sum(${ordersTable.totalCents}) filter (where ${ordersTable.status} = 'confirmed'), 0)`.mapWith(Number),
};

function discountCodeAdminShape(
  row: typeof discountCodesTable.$inferSelect,
  report: { confirmedOrders: number; confirmedRevenueCents: number }
) {
  return {
    id: row.id,
    code: row.code,
    percentBps: row.percentBps,
    active: row.active,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    maxUses: row.maxUses,
    timesUsed: row.timesUsed,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    ...report,
  };
}

router.get("/admin/discount-codes", async (_req, res) => {
  try {
    const rows = await db
      .select({
        row: discountCodesTable,
        ...discountCodeReportColumns,
      })
      .from(discountCodesTable)
      .leftJoin(ordersTable, eq(ordersTable.discountCodeId, discountCodesTable.id))
      .groupBy(discountCodesTable.id)
      .orderBy(desc(discountCodesTable.createdAt));

    res.json(
      rows.map((r) =>
        discountCodeAdminShape(r.row, {
          confirmedOrders: r.confirmedOrders,
          confirmedRevenueCents: r.confirmedRevenueCents,
        })
      )
    );
  } catch (err) {
    console.error("admin listDiscountCodes error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

router.post("/admin/discount-codes", async (req, res) => {
  const parsed = CreateDiscountCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_request", message: String(parsed.error) });
    return;
  }
  const expiry = parseExpiry(parsed.data.expiresAt);
  if (!expiry.ok) {
    res.status(400).json({ error: "bad_request", message: "expiresAt is not a valid date" });
    return;
  }
  try {
    const [row] = await db
      .insert(discountCodesTable)
      .values({
        code: parsed.data.code.toUpperCase(),
        percentBps: parsed.data.percentBps,
        expiresAt: expiry.value,
        maxUses: parsed.data.maxUses ?? null,
        note: parsed.data.note ?? null,
      })
      .returning();
    res
      .status(201)
      .json(discountCodeAdminShape(row, { confirmedOrders: 0, confirmedRevenueCents: 0 }));
  } catch (err) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as { code?: string }).code === "23505"
    ) {
      res.status(409).json({ error: "conflict", message: "That code already exists" });
      return;
    }
    console.error("admin createDiscountCode error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

router.patch("/admin/discount-codes/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "bad_request", message: "Invalid id" });
    return;
  }
  const parsed = PatchDiscountCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_request", message: String(parsed.error) });
    return;
  }
  const expiryProvided = "expiresAt" in (req.body as Record<string, unknown>);
  const expiry = parseExpiry(parsed.data.expiresAt);
  if (!expiry.ok) {
    res.status(400).json({ error: "bad_request", message: "expiresAt is not a valid date" });
    return;
  }
  try {
    const existing = await db.query.discountCodesTable.findFirst({
      where: eq(discountCodesTable.id, id),
    });
    if (!existing) {
      res.status(404).json({ error: "not_found", message: "Discount code not found" });
      return;
    }

    // Freeze rule (server-enforced): once redeemed, the code's economics are
    // history — deactivate and mint a new code instead of editing them. The
    // pre-check gives a friendly 422; the conditional WHERE below closes the
    // race with a first redemption landing mid-request.
    const touchesFrozen =
      parsed.data.code !== undefined || parsed.data.percentBps !== undefined;
    if (existing.timesUsed > 0 && touchesFrozen) {
      res.status(422).json({
        error: "unprocessable_entity",
        code: "CODE_FROZEN",
        message:
          "code and percentBps are frozen once a code has been redeemed. Deactivate this code and create a new one to change economics.",
      });
      return;
    }

    const updates: Partial<typeof discountCodesTable.$inferInsert> = {};
    if (parsed.data.code !== undefined) updates.code = parsed.data.code.toUpperCase();
    if (parsed.data.percentBps !== undefined) updates.percentBps = parsed.data.percentBps;
    if (expiryProvided) updates.expiresAt = expiry.value;
    if ("maxUses" in (req.body as Record<string, unknown>))
      updates.maxUses = parsed.data.maxUses ?? null;
    if (parsed.data.active !== undefined) updates.active = parsed.data.active;
    if ("note" in (req.body as Record<string, unknown>)) updates.note = parsed.data.note ?? null;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "bad_request", message: "No fields to update" });
      return;
    }

    const [row] = await db
      .update(discountCodesTable)
      .set(updates)
      .where(
        touchesFrozen
          ? and(
              eq(discountCodesTable.id, id),
              eq(discountCodesTable.timesUsed, 0)
            )
          : eq(discountCodesTable.id, id)
      )
      .returning();

    if (!row) {
      // The conditional WHERE matched nothing: a redemption raced in between
      // the freeze pre-check and this update.
      res.status(422).json({
        error: "unprocessable_entity",
        code: "CODE_FROZEN",
        message:
          "code and percentBps are frozen once a code has been redeemed. Deactivate this code and create a new one to change economics.",
      });
      return;
    }

    const [report] = await db
      .select(discountCodeReportColumns)
      .from(ordersTable)
      .where(eq(ordersTable.discountCodeId, id));

    res.json(
      discountCodeAdminShape(row, {
        confirmedOrders: report?.confirmedOrders ?? 0,
        confirmedRevenueCents: report?.confirmedRevenueCents ?? 0,
      })
    );
  } catch (err) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as { code?: string }).code === "23505"
    ) {
      res.status(409).json({ error: "conflict", message: "That code already exists" });
      return;
    }
    console.error("admin patchDiscountCode error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

router.get("/admin/discount-codes/:id/report", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "bad_request", message: "Invalid id" });
    return;
  }
  try {
    const existing = await db.query.discountCodesTable.findFirst({
      where: eq(discountCodesTable.id, id),
    });
    if (!existing) {
      res.status(404).json({ error: "not_found", message: "Discount code not found" });
      return;
    }
    const [report] = await db
      .select(discountCodeReportColumns)
      .from(ordersTable)
      .where(eq(ordersTable.discountCodeId, id));
    res.json({
      id: existing.id,
      code: existing.code,
      timesUsed: existing.timesUsed,
      confirmedOrders: report?.confirmedOrders ?? 0,
      confirmedRevenueCents: report?.confirmedRevenueCents ?? 0,
    });
  } catch (err) {
    console.error("admin discountCodeReport error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

// ── Store settings ───────────────────────────────────────────────────────────
// Global storefront toggles (single 'default' row). Upserts if the row is absent.
const PatchSettingsSchema = z
  .object({
    showVialImages: z.boolean().optional(),
    cryptoDiscountBps: z.number().int().min(0).max(5000).optional(),
  })
  .refine(
    (v) => v.showVialImages !== undefined || v.cryptoDiscountBps !== undefined,
    { message: "At least one field is required" },
  );

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
    if (parsed.data.cryptoDiscountBps !== undefined) {
      updates.cryptoDiscountBps = parsed.data.cryptoDiscountBps;
    }

    const [row] = await db
      .insert(storeSettingsTable)
      .values({ id: "default", ...updates })
      .onConflictDoUpdate({ target: storeSettingsTable.id, set: updates })
      .returning();

    res.json({
      showVialImages: row.showVialImages,
      cryptoDiscountBps: row.cryptoDiscountBps,
    });
  } catch (err) {
    console.error("admin patchSettings error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

export default router;
