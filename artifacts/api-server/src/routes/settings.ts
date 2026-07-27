import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@atlab/db";
import { storeSettingsTable } from "@atlab/db/schema";
import { GetSettingsResponse } from "@atlab/api-zod";
import { getPaymentMethodStates } from "../lib/paymentMethods";

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

// Public — which payment methods the storefront should offer for a channel.
// Returns only method + available (available already folds in admin-enabled AND
// backend-configured); no config detail is exposed publicly.
router.get("/payment-methods", async (req, res) => {
  try {
    const channel = req.query.channel === "wholesale" ? "wholesale" : "retail";
    const states = await getPaymentMethodStates();
    const methods = states.map((s) => ({
      method: s.method,
      label: s.label,
      available: channel === "wholesale" ? s.availableWholesale : s.availableRetail,
    }));
    res.json({ channel, methods });
  } catch (err) {
    console.error("getPaymentMethods error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

export default router;
