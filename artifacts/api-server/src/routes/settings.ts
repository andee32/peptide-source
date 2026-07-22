import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@atlab/db";
import { storeSettingsTable } from "@atlab/db/schema";
import { GetSettingsResponse } from "@atlab/api-zod";

const router: IRouter = Router();

// Public — global storefront settings. Falls back to the default (showVialImages
// true) when the 'default' row is absent, so the storefront never 404s here.
router.get("/settings", async (_req, res) => {
  try {
    const row = await db.query.storeSettingsTable.findFirst({
      where: eq(storeSettingsTable.id, "default"),
    });
    const validated = GetSettingsResponse.parse({
      showVialImages: row?.showVialImages ?? true,
      cryptoDiscountBps: row?.cryptoDiscountBps ?? 1000,
    });
    res.json(validated);
  } catch (err) {
    console.error("getSettings error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

export default router;
