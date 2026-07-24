import { Router, type IRouter } from "express";
import { eq, and, asc, desc } from "drizzle-orm";
import { db } from "@atlab/db";
import {
  productsTable,
  productVariantsTable,
  batchesTable,
  coaResultsTable,
  categoryEnum,
} from "@atlab/db/schema";
import {
  ListProductsQueryParams,
  ListProductsResponse,
  GetProductParams,
  GetProductResponse,
} from "@atlab/api-zod";
import { resolveWholesaleAccount } from "../lib/wholesaleSession";

const router: IRouter = Router();

// The kit catalog is the wholesale price book — industry norm (and Phase 1
// design) is that tier/kit pricing is approved-accounts-only. The retail
// storefront reads /retail/products instead, which stays public.
const WHOLESALE_REQUIRED = {
  error: "wholesale_required",
  message:
    "The wholesale kit catalog is available to approved wholesale accounts. Apply for an account or sign in to view kit pricing.",
} as const;

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
