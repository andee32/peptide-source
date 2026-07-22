import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc, count } from "drizzle-orm";
import { db } from "@atlab/db";
import {
  reviewerSubmissionsTable,
  reviewerSubmissionStatusEnum,
  reviewerPlatformEnum,
  productsTable,
} from "@atlab/db/schema";
import { z } from "zod/v4";
import { isAdminRequest } from "../lib/adminSession";

const router: IRouter = Router();

const JANOSHIK_TASK_ID_RE = /^[A-Z]{1,4}[0-9]{4,12}$/i;

const CreateSubmissionSchema = z.object({
  reviewerHandle: z.string().min(2).max(100),
  platform: z.enum(reviewerPlatformEnum.enumValues).default("other"),
  janoshikTaskId: z
    .string()
    .min(3)
    .max(50)
    .refine((v) => JANOSHIK_TASK_ID_RE.test(v), {
      message:
        "Janoshik Task ID must be letters followed by digits (e.g. J12345678)",
    }),
  productId: z.number().int().positive(),
  purityPercent: z.number().min(0).max(100).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

async function fireWebhook(submission: {
  id: number;
  reviewerHandle: string;
  platform: string;
  janoshikTaskId: string;
  productId: number;
  purityPercent: number | null;
  notes: string | null;
  submittedAt: Date;
}): Promise<void> {
  const webhookUrl = process.env.REVIEWER_WEBHOOK_URL;
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "reviewer_submission.created",
        submission,
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.warn("reviewer webhook fire failed:", err);
  }
}

router.post("/reviewer-submissions", async (req: Request, res: Response) => {
  const parsed = CreateSubmissionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_request", message: parsed.error.message });
    return;
  }

  const { reviewerHandle, platform, janoshikTaskId, productId, purityPercent, notes } =
    parsed.data;

  const product = await db.query.productsTable.findFirst({
    where: eq(productsTable.id, productId),
  });
  if (!product) {
    res.status(404).json({ error: "not_found", message: "Product not found" });
    return;
  }

  try {
    const [row] = await db
      .insert(reviewerSubmissionsTable)
      .values({
        reviewerHandle,
        platform,
        janoshikTaskId,
        productId,
        purityPercent: purityPercent ?? null,
        notes: notes ?? null,
      })
      .returning();

    void fireWebhook(row);

    res.status(201).json({
      id: row.id,
      status: row.status,
      submittedAt: row.submittedAt,
    });
  } catch (err) {
    console.error("createReviewerSubmission error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

router.get("/reviewer-submissions/stats", async (_req: Request, res: Response) => {
  try {
    const [{ value }] = await db
      .select({ value: count() })
      .from(reviewerSubmissionsTable)
      .where(eq(reviewerSubmissionsTable.status, "approved"));
    res.json({ approvedCount: Number(value) });
  } catch (err) {
    console.error("reviewerSubmissionsStats error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

router.get("/reviewer-submissions", async (req: Request, res: Response) => {
  const adminMode = await isAdminRequest(req);
  try {
    const rows = await db.query.reviewerSubmissionsTable.findMany({
      where: adminMode
        ? undefined
        : eq(reviewerSubmissionsTable.status, "approved"),
      orderBy: [desc(reviewerSubmissionsTable.submittedAt)],
    });

    const withProducts = await Promise.all(
      rows.map(async (r) => {
        const product = await db.query.productsTable.findFirst({
          where: eq(productsTable.id, r.productId),
        });
        return {
          id: r.id,
          reviewerHandle: r.reviewerHandle,
          platform: r.platform,
          janoshikTaskId: r.janoshikTaskId,
          productId: r.productId,
          productName: product?.name ?? "Unknown",
          purityPercent: r.purityPercent ?? null,
          notes: r.notes ?? null,
          status: r.status,
          submittedAt: r.submittedAt,
          reviewedAt: r.reviewedAt ?? null,
        };
      })
    );

    res.json(withProducts);
  } catch (err) {
    console.error("listReviewerSubmissions error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

const PatchSubmissionSchema = z.object({
  status: z.enum(["approved", "rejected"] as const),
  adminNotes: z.string().max(2000).optional(),
});

router.patch(
  "/reviewer-submissions/:id",
  async (req: Request, res: Response) => {
    if (!(await isAdminRequest(req))) {
      res.status(401).json({ error: "unauthorized", message: "Admin key required" });
      return;
    }

    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "bad_request", message: "Invalid id" });
      return;
    }

    const parsed = PatchSubmissionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "bad_request", message: parsed.error.message });
      return;
    }

    const existing = await db.query.reviewerSubmissionsTable.findFirst({
      where: eq(reviewerSubmissionsTable.id, id),
    });
    if (!existing) {
      res.status(404).json({ error: "not_found", message: "Submission not found" });
      return;
    }

    try {
      const reviewedAt = new Date();
      const updates: Record<string, unknown> = {
        status: parsed.data.status,
        reviewedAt,
      };
      if (parsed.data.adminNotes !== undefined) {
        updates.adminNotes = parsed.data.adminNotes ?? null;
      }

      await db
        .update(reviewerSubmissionsTable)
        .set(updates)
        .where(eq(reviewerSubmissionsTable.id, id));

      res.json({ id, status: parsed.data.status, reviewedAt });
    } catch (err) {
      console.error("patchReviewerSubmission error:", err);
      res.status(500).json({ error: "internal_error", message: "Server error" });
    }
  }
);

export default router;
