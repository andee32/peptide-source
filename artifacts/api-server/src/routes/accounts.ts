import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID, randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@atlab/db";
import {
  customerAccountsTable,
  priceTiersTable,
  businessTypeEnum,
} from "@atlab/db/schema";
import { z } from "zod/v4";

const router: IRouter = Router();

function isAdmin(req: Request): boolean {
  const adminSecret = process.env.ADMIN_SECRET;
  return !!adminSecret && req.headers["x-admin-key"] === adminSecret;
}

function extractAccountToken(req: Request): string | undefined {
  const fromHeader = req.headers["x-account-token"];
  const headerVal = Array.isArray(fromHeader) ? fromHeader[0] : fromHeader;
  const fromQuery = req.query.token as string | undefined;
  return headerVal || fromQuery || undefined;
}

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
    const existing = await db.query.customerAccountsTable.findFirst({
      where: eq(customerAccountsTable.email, data.email),
    });
    if (existing) {
      res.status(409).json({
        error: "conflict",
        message: "An account with that email already exists",
      });
      return;
    }

    const id = randomUUID();
    const accessToken = randomBytes(32).toString("hex");

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
      accessToken,
    });

    res.status(201).json({ id, status: "pending", accessToken });
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
      isAdmin(req) ||
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
