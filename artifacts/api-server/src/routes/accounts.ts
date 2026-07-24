import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@atlab/db";
import {
  customerAccountsTable,
  priceTiersTable,
  businessTypeEnum,
} from "@atlab/db/schema";
import { z } from "zod/v4";
import { isAdminRequest } from "../lib/adminSession";
import { extractAccountToken } from "../lib/wholesaleSession";
import { resolveCustomerUser } from "../lib/customerSession";

const router: IRouter = Router();

const ApplyAccountSchema = z.object({
  businessName: z.string().min(1).max(200),
  contactName: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().min(1).max(50),
  businessType: z.enum(businessTypeEnum.enumValues),
  taxId: z.string().max(200).nullish(),
  resaleCertUrl: z.string().max(1000).nullish(),
});

router.post("/accounts/apply", async (req: Request, res: Response) => {
  const parsed = ApplyAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "validation_error",
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    });
    return;
  }

  const data = parsed.data;

  try {
    // Account-unification: applying requires a signed-in identity. No access
    // token is minted — wholesale is authenticated by the session once approved.
    const user = await resolveCustomerUser(req);
    if (!user) {
      res.status(401).json({
        error: "unauthorized",
        message: "Sign in or create an account before applying for wholesale.",
      });
      return;
    }

    // 1:1 — one wholesale profile per identity.
    const linked = await db.query.customerAccountsTable.findFirst({
      where: eq(customerAccountsTable.customerUserId, user.id),
    });
    if (linked) {
      res.status(409).json({
        error: "conflict",
        message: "This account already has a wholesale application.",
      });
      return;
    }

    const id = randomUUID();
    await db.insert(customerAccountsTable).values({
      id,
      businessName: data.businessName,
      contactName: data.contactName,
      email: data.email,
      phone: data.phone,
      businessType: data.businessType,
      taxId: data.taxId ?? null,
      resaleCertUrl: data.resaleCertUrl ?? null,
      status: "pending",
      customerUserId: user.id,
      // no accessToken — session-authenticated (empty string = none issued)
    });

    res.status(201).json({ id, status: "pending" });
  } catch (err) {
    console.error("applyForAccount error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

router.get("/accounts/:id", async (req: Request, res: Response) => {
  try {
    const account = await db.query.customerAccountsTable.findFirst({
      where: eq(customerAccountsTable.id, String(req.params.id)),
    });
    if (!account) {
      res.status(404).json({ error: "not_found", message: "Account not found" });
      return;
    }

    const authorized =
      (await isAdminRequest(req)) ||
      (!!account.accessToken && extractAccountToken(req) === account.accessToken);
    if (!authorized) {
      res.status(403).json({
        error: "forbidden",
        message: "Provide a valid account access token",
      });
      return;
    }

    let priceTier = null;
    if (account.priceTierId !== null) {
      priceTier =
        (await db.query.priceTiersTable.findFirst({
          where: eq(priceTiersTable.id, account.priceTierId),
        })) ?? null;
    }

    const { accessToken: _at, ...safe } = account;
    res.json({ ...safe, priceTier });
  } catch (err) {
    console.error("getAccount error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

export default router;
