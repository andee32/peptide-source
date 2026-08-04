import { Router, type IRouter } from "express";
import { eq, and, asc, desc, ne, isNotNull } from "drizzle-orm";
import { db } from "@app/db";
import {
  productsTable,
  productVariantsTable,
  productImagesTable,
  batchesTable,
  coaResultsTable,
  coaDocumentsTable,
  categoryEnum,
} from "@app/db/schema";
import {
  ListProductsQueryParams,
  ListProductsResponse,
  GetProductParams,
  GetProductResponse,
  ListCoaLibraryResponse,
} from "@app/api-zod";
import { resolveWholesaleAccount } from "../lib/wholesaleSession";
import { coaDownloadRateLimit } from "../lib/rateLimit";

const router: IRouter = Router();

// The kit catalog is the wholesale price book — industry norm (and Phase 1
// design) is that tier/kit pricing is approved-accounts-only. The retail
// storefront reads /retail/products instead, which stays public.
const WHOLESALE_REQUIRED = {
  error: "wholesale_required",
  message:
    "The wholesale kit catalog is available to approved wholesale accounts. Apply for an account or sign in to view kit pricing.",
} as const;

// Public COA library — every published, non-blocked SKU that has a COA on file.
// No pricing, so it's safe to expose without wholesale auth (mirrors the public
// COA library). Backs the searchable COA library UI.
router.get("/coa-library", async (_req, res) => {
  try {
    const rows = await db
      .select({
        productName: productsTable.name,
        slug: productsTable.slug,
        category: productsTable.category,
        sku: productVariantsTable.sku,
        name: productVariantsTable.name,
        unitType: productVariantsTable.unitType,
        coaUrl: productVariantsTable.coaUrl,
        // Values the AI extraction read off an uploaded certificate. Null for a
        // SKU whose COA is an external link (nothing to extract from).
        purityPercent: coaDocumentsTable.purityPercent,
        labName: coaDocumentsTable.labName,
        testedAt: coaDocumentsTable.testedAt,
      })
      .from(productVariantsTable)
      .innerJoin(productsTable, eq(productVariantsTable.productId, productsTable.id))
      .leftJoin(
        coaDocumentsTable,
        eq(coaDocumentsTable.variantId, productVariantsTable.id)
      )
      .where(
        and(
          isNotNull(productVariantsTable.coaUrl),
          eq(productsTable.published, true),
          ne(productsTable.complianceStatus, "blocked")
        )
      )
      .orderBy(asc(productsTable.name), asc(productVariantsTable.priceCents));

    // coaUrl is non-null by the WHERE above; narrow the type for the schema.
    const entries = rows.map((r) => ({
      ...r,
      coaUrl: r.coaUrl!,
      testedAt: r.testedAt ? r.testedAt.toISOString() : null,
    }));
    res.json(ListCoaLibraryResponse.parse(entries));
  } catch (err) {
    console.error("listCoaLibrary error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

// Public download for a per-SKU COA document uploaded in admin. Gated on the
// owning product being published and not blocked — an unpublished SKU's
// certificate is not public. Served as an attachment with nosniff, and the
// filename is server-derived, never the uploaded originalname.
router.get("/variants/:id/coa-file", coaDownloadRateLimit, async (req, res) => {
  try {
    const variantId = Number(req.params.id);
    if (!Number.isInteger(variantId) || variantId <= 0) {
      res.status(404).json({ error: "not_found", message: "No COA document available" });
      return;
    }

    const [row] = await db
      .select({
        published: productsTable.published,
        complianceStatus: productsTable.complianceStatus,
        sku: productVariantsTable.sku,
        mimeType: coaDocumentsTable.mimeType,
        data: coaDocumentsTable.data,
      })
      .from(coaDocumentsTable)
      .innerJoin(
        productVariantsTable,
        eq(coaDocumentsTable.variantId, productVariantsTable.id)
      )
      .innerJoin(productsTable, eq(productVariantsTable.productId, productsTable.id))
      .where(eq(coaDocumentsTable.variantId, variantId))
      .orderBy(desc(coaDocumentsTable.createdAt))
      .limit(1);

    if (!row || row.published !== true || row.complianceStatus === "blocked") {
      res.status(404).json({ error: "not_found", message: "No COA document available" });
      return;
    }

    const ext =
      row.mimeType === "application/pdf" ? "pdf"
      : row.mimeType === "image/png" ? "png"
      : row.mimeType === "image/webp" ? "webp"
      : "jpg";

    // Scrub the SKU before it lands in a quoted header parameter — a stray quote
    // would break out of the filename, and Node rejects control chars outright.
    const safeSku = row.sku.replace(/[^A-Za-z0-9._-]/g, "-");
    res.setHeader("Content-Type", row.mimeType);
    res.setHeader("Content-Disposition", `inline; filename="coa-${safeSku}.${ext}"`);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(row.data);
  } catch (err) {
    console.error("getVariantCoaFile error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

// Public catalog image for a product. Served from the API rather than a static
// directory because the bytes live in Postgres; the path is stable across
// re-uploads, so it is cached by ETag instead of a versioned URL.
router.get("/products/:id/image", async (req, res) => {
  try {
    const productId = Number(req.params.id);
    if (!Number.isInteger(productId) || productId <= 0) {
      res.status(400).json({ error: "bad_request", message: "Invalid product id" });
      return;
    }

    const [row] = await db
      .select({
        published: productsTable.published,
        complianceStatus: productsTable.complianceStatus,
        mimeType: productImagesTable.mimeType,
        data: productImagesTable.data,
        updatedAt: productImagesTable.updatedAt,
      })
      .from(productImagesTable)
      .innerJoin(productsTable, eq(productImagesTable.productId, productsTable.id))
      .where(eq(productImagesTable.productId, productId))
      .limit(1);

    if (!row || row.published !== true || row.complianceStatus === "blocked") {
      res.status(404).json({ error: "not_found", message: "No image available" });
      return;
    }

    // The path never changes, so the ETag is what lets a re-upload invalidate a
    // cached image instead of serving the old bytes until max-age expires.
    const etag = `W/"${productId}-${row.updatedAt.getTime()}"`;
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "public, max-age=300");
    res.setHeader("Content-Type", row.mimeType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.headers["if-none-match"] === etag) {
      res.status(304).end();
      return;
    }
    res.send(row.data);
  } catch (err) {
    console.error("getProductImage error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

router.get("/products", async (req, res) => {
  try {
    if (!(await resolveWholesaleAccount(req))) {
      res.status(401).json(WHOLESALE_REQUIRED);
      return;
    }
    const queryResult = ListProductsQueryParams.safeParse(req.query);
    if (!queryResult.success) {
      res.status(400).json({ error: "bad_request", message: queryResult.error.message });
      return;
    }
    const { category } = queryResult.data;
    const featuredRaw = req.query.featured;
    const featured =
      featuredRaw === "true" ? true : featuredRaw === "false" ? false : undefined;

    const validCategories = categoryEnum.enumValues;
    if (category && !(validCategories as readonly string[]).includes(category)) {
      res.status(400).json({
        error: "bad_request",
        message: `Invalid category. Must be one of: ${validCategories.join(", ")}`,
      });
      return;
    }
    const categoryFilter = category
      ? (category as (typeof categoryEnum.enumValues)[number])
      : undefined;

    const products = await db.query.productsTable.findMany({
      where: (p, { eq: eqFn, and, ne }) => {
        const conditions = [eqFn(p.published, true), ne(p.complianceStatus, "blocked")];
        if (categoryFilter) {
          conditions.push(eqFn(p.category, categoryFilter));
        }
        if (featured === true) {
          conditions.push(eqFn(p.featured, true));
        }
        return and(...conditions);
      },
      orderBy: [asc(productsTable.id)],
    });

    const result = await Promise.all(
      products.map(async (product) => {
        const variants = await db.query.productVariantsTable.findMany({
          where: and(
            eq(productVariantsTable.productId, product.id),
            eq(productVariantsTable.unitType, "kit"),
          ),
          orderBy: [asc(productVariantsTable.priceCents)],
        });

        const latestBatch = await db.query.batchesTable.findFirst({
          where: (b, { eq: eqFn, and }) =>
            and(eqFn(b.productId, product.id), eqFn(b.status, "released")),
          orderBy: [desc(batchesTable.productionDate)],
        });

        let latestBatchPurity: number | null = null;
        if (latestBatch) {
          const purityCoa = await db.query.coaResultsTable.findFirst({
            where: (c, { eq: eqFn, and }) =>
              and(eqFn(c.batchId, latestBatch.id), eqFn(c.testType, "purity")),
          });
          latestBatchPurity = purityCoa?.purityPercent ?? null;
        }

        const startingPriceCents =
          variants.length > 0 ? Math.min(...variants.map((v) => v.priceCents)) : 0;

        return {
          id: product.id,
          name: product.name,
          slug: product.slug,
          category: product.category,
          complianceStatus: product.complianceStatus,
          shortDescription: product.shortDescription,
          featured: product.featured,
          imageUrl: product.imageUrl ?? null,
          startingPriceCents,
          latestBatchId: latestBatch?.id ?? null,
          latestBatchStatus: latestBatch?.status ?? null,
          latestBatchPurity: latestBatchPurity ?? null,
          latestBatchIsDemo: latestBatch?.isDemo ?? null,
          variants: variants.map((v) => ({
            id: v.id,
            name: v.name,
            concentration: v.concentration,
            sizeml: v.sizeml,
            vialsPerUnit: v.vialsPerUnit,
            priceCents: v.priceCents,
            sku: v.sku,
            inStock: v.inStock,
            coaUrl: v.coaUrl,
          })),
        };
      })
    );

    const validated = ListProductsResponse.parse(result);
    res.json(validated);
  } catch (err) {
    console.error("listProducts error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

router.get("/products/:id", async (req, res) => {
  try {
    if (!(await resolveWholesaleAccount(req))) {
      res.status(401).json(WHOLESALE_REQUIRED);
      return;
    }
    const paramsResult = GetProductParams.safeParse(req.params);
    if (!paramsResult.success) {
      res.status(404).json({ error: "not_found", message: "Product not found" });
      return;
    }
    const { id } = paramsResult.data;

    const product = await db.query.productsTable.findFirst({
      where: (p, { eq: eqFn, and, ne }) =>
        and(eqFn(p.id, id), eqFn(p.published, true), ne(p.complianceStatus, "blocked")),
    });

    if (!product) {
      res.status(404).json({ error: "not_found", message: "Product not found" });
      return;
    }

    const variants = await db.query.productVariantsTable.findMany({
      where: and(
        eq(productVariantsTable.productId, product.id),
        eq(productVariantsTable.unitType, "kit"),
      ),
      orderBy: [asc(productVariantsTable.priceCents)],
    });

    const latestBatch = await db.query.batchesTable.findFirst({
      where: (b, { eq: eqFn, and }) =>
        and(eqFn(b.productId, product.id), eqFn(b.status, "released")),
      orderBy: [desc(batchesTable.productionDate)],
    });

    let latestBatchDetail = null;
    let latestBatchPurity: number | null = null;

    if (latestBatch) {
      const coaResults = await db.query.coaResultsTable.findMany({
        where: eq(coaResultsTable.batchId, latestBatch.id),
      });

      const purityCoa = coaResults.find((c) => c.testType === "purity");
      latestBatchPurity = purityCoa?.purityPercent ?? null;

      latestBatchDetail = {
        id: latestBatch.id,
        productId: latestBatch.productId,
        productName: product.name,
        productionDate: latestBatch.productionDate,
        status: latestBatch.status,
        isDemo: latestBatch.isDemo,
        purityPercent: latestBatchPurity ?? null,
        notes: latestBatch.notes ?? null,
        coaResults: coaResults.map((c) => ({
          id: c.id,
          testType: c.testType,
          purityPercent: c.purityPercent ?? null,
          endotoxinEuPerMl: c.endotoxinEuPerMl ?? null,
          sterilityPass: c.sterilityPass ?? null,
          heavyMetals:
            (c.heavyMetals as Array<{
              element: string;
              resultPpm: number;
              limitPpm: number;
              pass: boolean;
            }> | null) ?? null,
          labName: c.labName,
          testedAt: c.testedAt,
          janoshikTaskId: c.janoshikTaskId ?? null,
        })),
      };
    }

    let latestBatchHasCoaFile = false;
    if (latestBatch && latestBatch.status === "released" && latestBatch.isDemo === false) {
      const coaDoc = await db.query.coaDocumentsTable.findFirst({
        where: eq(coaDocumentsTable.batchId, latestBatch.id),
        columns: { id: true },
      });
      latestBatchHasCoaFile = coaDoc !== undefined && coaDoc !== null;
    }

    const startingPriceCents =
      variants.length > 0 ? Math.min(...variants.map((v) => v.priceCents)) : 0;

    const responseData = {
      id: product.id,
      name: product.name,
      slug: product.slug,
      category: product.category,
      complianceStatus: product.complianceStatus,
      shortDescription: product.shortDescription,
      longDescription: product.longDescription,
      featured: product.featured,
      imageUrl: product.imageUrl ?? null,
      startingPriceCents,
      latestBatchId: latestBatch?.id ?? null,
      latestBatchStatus: latestBatch?.status ?? null,
      latestBatchPurity: latestBatchPurity ?? null,
      latestBatchIsDemo: latestBatch?.isDemo ?? null,
      latestBatchHasCoaFile,
      researchUses: product.researchUses,
      variants: variants.map((v) => ({
        id: v.id,
        name: v.name,
        concentration: v.concentration,
        sizeml: v.sizeml,
        vialsPerUnit: v.vialsPerUnit,
        priceCents: v.priceCents,
        sku: v.sku,
        inStock: v.inStock,
        coaUrl: v.coaUrl,
      })),
      latestBatch: latestBatchDetail,
    };

    const validated = GetProductResponse.parse(responseData);
    res.json(validated);
  } catch (err) {
    console.error("getProduct error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

export default router;
