import { Router, type IRouter } from "express";
import { eq, and, asc } from "drizzle-orm";
import { db } from "@atlab/db";
import { productsTable, productVariantsTable, categoryEnum } from "@atlab/db/schema";
import {
  ListRetailProductsQueryParams,
  ListRetailProductsResponse,
  GetRetailProductParams,
  GetRetailProductResponse,
} from "@atlab/api-zod";

const router: IRouter = Router();

// Map a product + its single-vial variants into a retail catalog shape.
function toRetail(
  product: typeof productsTable.$inferSelect,
  vialVariants: (typeof productVariantsTable.$inferSelect)[]
) {
  const variants = vialVariants.map((v) => ({
    id: v.id,
    name: v.name,
    concentration: v.concentration,
    priceCents: v.priceCents,
    sku: v.sku,
    inStock: v.inStock,
  }));
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
    variants,
  };
}

router.get("/retail/products", async (req, res) => {
  try {
    const queryResult = ListRetailProductsQueryParams.safeParse(req.query);
    if (!queryResult.success) {
      res.status(400).json({ error: "bad_request", message: queryResult.error.message });
      return;
    }
    const { category } = queryResult.data;

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
      where: (p, { eq: eqFn, and: andFn, ne }) => {
        const conditions = [eqFn(p.published, true), ne(p.complianceStatus, "blocked")];
        if (categoryFilter) {
          conditions.push(eqFn(p.category, categoryFilter));
        }
        return andFn(...conditions);
      },
      orderBy: [asc(productsTable.id)],
    });

    const result = await Promise.all(
      products.map(async (product) => {
        const vialVariants = await db.query.productVariantsTable.findMany({
          where: and(
            eq(productVariantsTable.productId, product.id),
            eq(productVariantsTable.unitType, "vial")
          ),
          orderBy: [asc(productVariantsTable.priceCents)],
        });
        return toRetail(product, vialVariants);
      })
    );

    const validated = ListRetailProductsResponse.parse(result);
    res.json(validated);
  } catch (err) {
    console.error("listRetailProducts error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

router.get("/retail/products/:slug", async (req, res) => {
  try {
    const paramsResult = GetRetailProductParams.safeParse(req.params);
    if (!paramsResult.success) {
      res.status(404).json({ error: "not_found", message: "Product not found" });
      return;
    }
    const { slug } = paramsResult.data;

    const product = await db.query.productsTable.findFirst({
      where: (p, { eq: eqFn, and: andFn, ne }) =>
        andFn(eqFn(p.slug, slug), eqFn(p.published, true), ne(p.complianceStatus, "blocked")),
    });

    if (!product) {
      res.status(404).json({ error: "not_found", message: "Product not found" });
      return;
    }

    const vialVariants = await db.query.productVariantsTable.findMany({
      where: and(
        eq(productVariantsTable.productId, product.id),
        eq(productVariantsTable.unitType, "vial")
      ),
      orderBy: [asc(productVariantsTable.priceCents)],
    });

    const responseData = {
      ...toRetail(product, vialVariants),
      longDescription: product.longDescription,
      researchUses: product.researchUses,
    };

    const validated = GetRetailProductResponse.parse(responseData);
    res.json(validated);
  } catch (err) {
    console.error("getRetailProduct error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

export default router;
