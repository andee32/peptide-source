import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import QRCode from "qrcode";
import { db } from "@atlab/db";
import { coaDownloadRateLimit } from "../lib/rateLimit";
import {
  batchesTable,
  coaDocumentsTable,
  coaResultsTable,
  productsTable,
} from "@atlab/db/schema";
import {
  ListBatchesQueryParams,
  ListBatchesResponse,
  GetBatchParams,
  GetBatchResponse,
} from "@atlab/api-zod";

const router: IRouter = Router();

router.get("/batches", async (req, res) => {
  try {
    const queryResult = ListBatchesQueryParams.safeParse(req.query);
    if (!queryResult.success) {
      res.status(400).json({ error: "bad_request", message: queryResult.error.message });
      return;
    }
    const { productId } = queryResult.data;

    const batches = await db.query.batchesTable.findMany({
      where: productId ? eq(batchesTable.productId, productId) : undefined,
      orderBy: [asc(batchesTable.productionDate)],
    });

    const result = await Promise.all(
      batches.map(async (batch) => {
        const product = await db.query.productsTable.findFirst({
          where: eq(productsTable.id, batch.productId),
        });

        const purityCoa = await db.query.coaResultsTable.findFirst({
          where: (c, { eq: eqFn, and }) =>
            and(eqFn(c.batchId, batch.id), eqFn(c.testType, "purity")),
        });

        return {
          id: batch.id,
          productId: batch.productId,
          productName: product?.name ?? "Unknown",
          productionDate: batch.productionDate,
          status: batch.status,
          isDemo: batch.isDemo,
          purityPercent: purityCoa?.purityPercent ?? null,
        };
      })
    );

    const validated = ListBatchesResponse.parse(result);
    res.json(validated);
  } catch (err) {
    console.error("listBatches error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

router.get("/batches/:id/qr", async (req, res) => {
  try {
    const { id } = req.params;

    const batch = await db.query.batchesTable.findFirst({
      where: eq(batchesTable.id, id),
    });

    if (!batch) {
      res.status(404).json({ error: "not_found", message: "Batch not found" });
      return;
    }

    const publicUrl = process.env.PUBLIC_URL ?? `${req.protocol}://${req.get("host")}`;
    const verifyUrl = `${publicUrl}/verify/${id}?source=qr`;

    const qrBuffer = await QRCode.toBuffer(verifyUrl, {
      type: "png",
      width: 512,
      margin: 2,
      color: { dark: "#0a0a0a", light: "#ffffff" },
    });

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", `inline; filename="batch-${id}-qr.png"`);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(qrBuffer);
  } catch (err) {
    console.error("getBatchQr error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

router.get("/batches/:id", async (req, res) => {
  try {
    const paramsResult = GetBatchParams.safeParse(req.params);
    if (!paramsResult.success) {
      res.status(400).json({ error: "bad_request", message: paramsResult.error.message });
      return;
    }
    const { id } = paramsResult.data;

    const batch = await db.query.batchesTable.findFirst({
      where: eq(batchesTable.id, id),
    });

    if (!batch) {
      res.status(404).json({ error: "not_found", message: "Batch not found" });
      return;
    }

    const product = await db.query.productsTable.findFirst({
      where: eq(productsTable.id, batch.productId),
    });

    const coaResults = await db.query.coaResultsTable.findMany({
      where: eq(coaResultsTable.batchId, batch.id),
    });

    const purityCoa = coaResults.find((c) => c.testType === "purity");

    const isReleasedReal = batch.status === "released" && batch.isDemo === false;
    const coaDoc = isReleasedReal
      ? await db.query.coaDocumentsTable.findFirst({
          where: eq(coaDocumentsTable.batchId, batch.id),
          orderBy: (d, { desc }) => [desc(d.createdAt)],
          columns: { id: true },
        })
      : undefined;

    const responseData = {
      id: batch.id,
      productId: batch.productId,
      productName: product?.name ?? "Unknown",
      productionDate: batch.productionDate,
      status: batch.status,
      isDemo: batch.isDemo,
      purityPercent: purityCoa?.purityPercent ?? null,
      notes: batch.notes ?? null,
      hasCoaFile: coaDoc !== undefined && coaDoc !== null,
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

    const validated = GetBatchResponse.parse(responseData);
    res.json(validated);
  } catch (err) {
    console.error("getBatch error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

router.get("/batches/:id/coa-file", coaDownloadRateLimit, async (req, res) => {
  try {
    // Chaining a path-agnostic middleware (the rate limiter) widens req.params
    // to ParamsDictionary; the route pattern guarantees a single value.
    const id = req.params.id as string;

    const batch = await db.query.batchesTable.findFirst({
      where: eq(batchesTable.id, id),
    });

    // Fail closed: a fabricated demo COA must never be served as a real document.
    if (!batch || batch.status !== "released" || batch.isDemo !== false) {
      res.status(404).json({ error: "not_found", message: "No COA document available" });
      return;
    }

    const doc = await db.query.coaDocumentsTable.findFirst({
      where: eq(coaDocumentsTable.batchId, id),
      orderBy: (d, { desc }) => [desc(d.createdAt)],
    });
    if (!doc) {
      res.status(404).json({ error: "not_found", message: "No COA document available" });
      return;
    }

    const ext =
      doc.mimeType === "application/pdf" ? "pdf"
      : doc.mimeType === "image/png" ? "png"
      : doc.mimeType === "image/webp" ? "webp"
      : "jpg";

    res.setHeader("Content-Type", doc.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="coa-${id}.${ext}"`);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(doc.data);
  } catch (err) {
    console.error("getBatchCoaFile error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

export default router;
