import { Router, type Request } from "express";
import { z } from "zod/v4";
import { eq, and, inArray, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import QRCode from "qrcode";
import { db } from "@atlab/db";
import {
  ordersTable,
  paymentRecordsTable,
  productVariantsTable,
  productsTable,
  customerAccountsTable,
  priceListEntriesTable,
  orderAttestationsTable,
  storeSettingsTable,
  discountCodesTable,
} from "@atlab/db/schema";
import { btcpayService, PaymentRailUnavailableError, type CryptoCurrency } from "../services/btcpay";
import { resolveCustomerUser } from "../lib/customerSession";
import { extractAccountToken } from "../lib/wholesaleSession";
import { quoteRateLimit, createOrderRateLimit } from "../lib/rateLimit";
import {
  resolveDiscounts,
  normalizeCode,
  type DiscountCodeRecord,
} from "../lib/discounts";
import {
  generateAchReferenceCode,
  buildBankInstructions,
  isAchProvisioned,
  ACH_EXPIRY_DAYS,
} from "../services/ach";

const router = Router();

// Retail crypto discount is admin-configured (store_settings.crypto_discount_bps);
// this default only covers a missing settings row.
const DEFAULT_CRYPTO_DISCOUNT_BPS = 1000;

async function getCryptoDiscountBps(): Promise<number> {
  const row = await db.query.storeSettingsTable.findFirst({
    where: eq(storeSettingsTable.id, "default"),
    columns: { cryptoDiscountBps: true },
  });
  return row?.cryptoDiscountBps ?? DEFAULT_CRYPTO_DISCOUNT_BPS;
}

/**
 * Authorization for a single order. An order id is a UUID, but it is handed out
 * in confirmation links and (previously) in order-history listings, so it can
 * not be the only thing standing between a caller and the buyer's full name,
 * email and shipping address.
 *
 * - customerUserId set  -> require that customer's session
 * - accountId set       -> require that wholesale account's access token
 *   (same predicate as GET /accounts/:id)
 * - neither set         -> genuine guest order; the id stays a capability URL,
 *   which is what lets the confirmation page work with no credential
 */
async function canReadOrder(
  req: Request,
  order: { customerUserId: string | null; accountId: string | null }
): Promise<boolean> {
  if (order.customerUserId) {
    const user = await resolveCustomerUser(req);
    return user?.id === order.customerUserId;
  }

  if (order.accountId) {
    const account = await db.query.customerAccountsTable.findFirst({
      where: eq(customerAccountsTable.id, order.accountId),
    });
    if (!account?.accessToken) return false;
    return extractAccountToken(req) === account.accessToken;
  }

  return true;
}

const FORBIDDEN = {
  error: "forbidden",
  message: "Not authorized to access this order",
};

// RUO (Research Use Only) attestation snapshot. The full text is persisted with
// every order so we can prove exactly what the signer affirmed at purchase time.
const ATTESTATION_VERSION = "v1-2026-07";
// PLACEHOLDER — replace with counsel-approved copy before launch.
const ATTESTATION_TEXT =
  "I affirm that all products in this order are purchased strictly for laboratory " +
  "research use only (RUO). They are not intended for, and will not be used in, " +
  "human or veterinary diagnostic, therapeutic, or personal use. I certify that I " +
  "am authorized to make this purchase on behalf of the named recipient and that " +
  "the information provided is accurate. [PLACEHOLDER]";

// Fail closed in production: the persisted attestation is the compliance record
// of record and must never ship as placeholder legal copy. Dev/prototype is
// unaffected.
if (process.env.NODE_ENV === "production" && /PLACEHOLDER/i.test(ATTESTATION_TEXT)) {
  throw new Error(
    "Refusing to start: ATTESTATION_TEXT is placeholder — replace with counsel-approved copy"
  );
}

const CRYPTO_METHODS = ["crypto_btc", "crypto_usdc"] as const;
function isCryptoMethod(m: string): boolean {
  return (CRYPTO_METHODS as readonly string[]).includes(m);
}

const lineItemInputSchema = z.object({
  variantId: z.number().int().positive(),
  quantity: z.number().int().min(1).max(100),
});

const createOrderSchema = z.object({
  accountId: z.string().nullish(),
  token: z.string().nullish(),
  sessionId: z.string().optional(),
  lineItems: z.array(lineItemInputSchema).min(1).max(50),
  ruoAffirmed: z.boolean(),
  signerName: z.string().min(1).max(200),
  paymentMethod: z.enum(["crypto_btc", "crypto_usdc", "ach", "wire"]),
  discountCode: z.string().max(64).nullish(),
  shippingName: z.string().min(1).max(200),
  shippingEmail: z.string().email(),
  shippingAddress1: z.string().min(1).max(500),
  shippingAddress2: z.string().optional(),
  shippingCity: z.string().min(1).max(200),
  shippingState: z.string().min(1).max(100),
  shippingZip: z.string().min(1).max(20),
  shippingCountry: z.string().default("US"),
});

// Pricing-relevant subset of createOrderSchema — POST /orders/quote runs the
// identical pipeline with no writes.
const quoteOrderSchema = z.object({
  accountId: z.string().nullish(),
  token: z.string().nullish(),
  lineItems: z.array(lineItemInputSchema).min(1).max(50),
  paymentMethod: z.enum(["crypto_btc", "crypto_usdc", "ach", "wire"]),
  discountCode: z.string().max(64).nullish(),
});

// Thrown inside the order transaction when the atomic code consumption finds
// the code no longer redeemable (raced to exhaustion, deactivated, or expired
// between validation and insert). Rolls the whole order back.
class CodeConsumptionError extends Error {}

type PricedOrder = {
  ok: true;
  isWholesale: boolean;
  channel: "retail" | "wholesale";
  resolvedLineItems: Array<{
    variantId: number;
    productName: string;
    variantName: string;
    quantity: number;
    unitPriceCents: number;
  }>;
  subtotalCents: number;
  promoDiscountCents: number;
  cryptoDiscountCents: number;
  discountCents: number;
  totalCents: number;
  discountSource: "code" | null;
  discountCode: string | null;
  discountCodeId: number | null;
};
type PricingError = { ok: false; status: number; body: Record<string, unknown> };

/**
 * The single pricing + discount pipeline shared verbatim by POST /orders and
 * POST /orders/quote (no-writes preview). Performs variant resolution, stock &
 * compliance gates, wholesale auth/kit/MOQ/tier pricing, and discount
 * resolution via resolveDiscounts(). Never writes.
 */
async function priceOrderRequest(input: {
  accountId?: string | null;
  token?: string | null;
  lineItems: Array<{ variantId: number; quantity: number }>;
  paymentMethod: "crypto_btc" | "crypto_usdc" | "ach" | "wire";
  discountCode?: string | null;
}): Promise<PricedOrder | PricingError> {
  const variantIds = input.lineItems.map((li) => li.variantId);

  const variants = await db
    .select({
      id: productVariantsTable.id,
      name: productVariantsTable.name,
      priceCents: productVariantsTable.priceCents,
      retailPriceCents: productVariantsTable.retailPriceCents,
      inStock: productVariantsTable.inStock,
      unitType: productVariantsTable.unitType,
      productId: productVariantsTable.productId,
      productName: productsTable.name,
      complianceStatus: productsTable.complianceStatus,
      published: productsTable.published,
    })
    .from(productVariantsTable)
    .innerJoin(productsTable, eq(productVariantsTable.productId, productsTable.id))
    .where(inArray(productVariantsTable.id, variantIds));

  const variantMap = new Map(variants.map((v) => [v.id, v]));

  const missingIds = variantIds.filter((id) => !variantMap.has(id));
  if (missingIds.length > 0) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "invalid_variant",
        message: `Variant(s) not found: ${missingIds.join(", ")}`,
      },
    };
  }

  const outOfStock = input.lineItems.filter((li) => !variantMap.get(li.variantId)?.inStock);
  if (outOfStock.length > 0) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "out_of_stock",
        message: `Variant(s) out of stock: ${outOfStock.map((li) => li.variantId).join(", ")}`,
      },
    };
  }

  // Per-SKU merchandising + compliance gate. Unlisted must also mean unsellable:
  // both catalogs filter `published`, so without this an unpublished product
  // (pulled for a bad COA or supply issue) stays orderable by variant id.
  const blocked = input.lineItems.filter((li) => {
    const v = variantMap.get(li.variantId);
    return v?.complianceStatus === "blocked" || v?.published === false;
  });
  if (blocked.length > 0) {
    return {
      ok: false,
      status: 422,
      body: {
        error: "unprocessable_entity",
        code: "SKU_NOT_AVAILABLE",
        message: `One or more items are not available for sale: variant(s) ${blocked
          .map((li) => li.variantId)
          .join(", ")}.`,
      },
    };
  }

  // ── Wholesale path: authenticate account, enforce kit-only + MOQ, resolve
  // tier pricing. Retail path (no accountId) is unchanged.
  const isWholesale = !!input.accountId;
  const priceOverrides = new Map<number, number>();

  // Retail kit pricing: kits sell retail only at their admin-set
  // retailPriceCents (above wholesale list by pricing discipline). A kit with
  // no retail price is wholesale-only — hard-rejected so a guest can never buy
  // at the wholesale list price.
  if (!isWholesale) {
    const unpricedKits = input.lineItems.filter((li) => {
      const v = variantMap.get(li.variantId)!;
      return v.unitType === "kit" && v.retailPriceCents == null;
    });
    if (unpricedKits.length > 0) {
      return {
        ok: false,
        status: 422,
        body: {
          error: "unprocessable_entity",
          code: "KIT_WHOLESALE_ONLY",
          message: `Kit variant(s) ${unpricedKits
            .map((li) => li.variantId)
            .join(", ")} are available to wholesale accounts only. Apply for a wholesale account to order them.`,
        },
      };
    }
  }

  if (isWholesale) {
    const account = await db.query.customerAccountsTable.findFirst({
      where: eq(customerAccountsTable.id, input.accountId!),
    });
    if (
      !account ||
      account.status !== "approved" ||
      !input.token ||
      !account.accessToken ||
      account.accessToken !== input.token
    ) {
      return {
        ok: false,
        status: 403,
        body: {
          error: "forbidden",
          message: "Wholesale account is not approved or the access token is invalid",
        },
      };
    }

    const nonKit = input.lineItems.filter(
      (li) => variantMap.get(li.variantId)?.unitType !== "kit"
    );
    if (nonKit.length > 0) {
      return {
        ok: false,
        status: 422,
        body: {
          error: "unprocessable_entity",
          code: "WHOLESALE_KIT_REQUIRED",
          message: `Wholesale orders may only contain kit variants. Non-kit variant(s): ${nonKit
            .map((li) => li.variantId)
            .join(", ")}`,
        },
      };
    }

    const totalKits = input.lineItems.reduce((sum, li) => sum + li.quantity, 0);
    if (totalKits < 5) {
      return {
        ok: false,
        status: 422,
        body: {
          error: "unprocessable_entity",
          code: "MOQ_NOT_MET",
          message: `Wholesale minimum order quantity is 5 kits (mixed SKUs count toward the total); this order has ${totalKits}.`,
        },
      };
    }

    if (account.priceTierId !== null) {
      const entries = await db
        .select({
          variantId: priceListEntriesTable.variantId,
          priceCents: priceListEntriesTable.priceCents,
        })
        .from(priceListEntriesTable)
        .where(
          and(
            eq(priceListEntriesTable.priceTierId, account.priceTierId),
            inArray(priceListEntriesTable.variantId, variantIds)
          )
        );
      for (const e of entries) priceOverrides.set(e.variantId, e.priceCents);
    }
  }

  const resolvedLineItems = input.lineItems.map((li) => {
    const v = variantMap.get(li.variantId)!;
    // Wholesale: tier override ?? list price. Retail: kits at their retail
    // price (validated non-null above), vials at list price.
    const unitPriceCents = isWholesale
      ? priceOverrides.get(li.variantId) ?? v.priceCents
      : v.unitType === "kit"
        ? v.retailPriceCents!
        : v.priceCents;
    return {
      variantId: li.variantId,
      productName: v.productName,
      variantName: v.name,
      quantity: li.quantity,
      unitPriceCents,
    };
  });

  const subtotalCents = resolvedLineItems.reduce(
    (sum, item) => sum + item.unitPriceCents * item.quantity,
    0
  );

  // ── Discounts: the resolveDiscounts() choke point. Look the code row up
  // here (impure), decide there (pure).
  const rawCode = input.discountCode?.trim() ? normalizeCode(input.discountCode) : null;
  let codeRecord: DiscountCodeRecord | null = null;
  if (rawCode && !isWholesale) {
    codeRecord =
      (await db.query.discountCodesTable.findFirst({
        where: eq(discountCodesTable.code, rawCode),
      })) ?? null;
  }

  const resolution = resolveDiscounts({
    isWholesale,
    isCrypto: isCryptoMethod(input.paymentMethod),
    subtotalCents,
    cryptoBps: await getCryptoDiscountBps(),
    codeInput: input.discountCode,
    codeRecord,
  });

  if (!resolution.ok) {
    return {
      ok: false,
      status: 422,
      body: {
        error: "unprocessable_entity",
        code: resolution.code,
        message: resolution.message,
      },
    };
  }

  return {
    ok: true,
    isWholesale,
    channel: isWholesale ? "wholesale" : "retail",
    resolvedLineItems,
    subtotalCents,
    promoDiscountCents: resolution.promoDiscountCents,
    cryptoDiscountCents: resolution.cryptoDiscountCents,
    discountCents: resolution.discountCents,
    totalCents: resolution.totalCents,
    discountSource: resolution.discountSource,
    discountCode: resolution.discountCode,
    discountCodeId: resolution.discountCodeId,
  };
}

router.post("/orders/quote", quoteRateLimit, async (req, res) => {
  const parsed = quoteOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: String(parsed.error) });
    return;
  }
  const priced = await priceOrderRequest(parsed.data);
  if (!priced.ok) {
    res.status(priced.status).json(priced.body);
    return;
  }
  res.json({
    subtotalCents: priced.subtotalCents,
    promoDiscountCents: priced.promoDiscountCents,
    cryptoDiscountCents: priced.cryptoDiscountCents,
    discountCents: priced.discountCents,
    totalCents: priced.totalCents,
    discountSource: priced.discountSource,
    discountCode: priced.discountCode,
  });
});

router.post("/orders", createOrderRateLimit, async (req, res) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: String(parsed.error) });
    return;
  }

  const data = parsed.data;

  // Server-side RUO affirmation gate. This must be exactly true — a missing or
  // false value is a hard reject before any pricing or order work.
  if (data.ruoAffirmed !== true) {
    res.status(400).json({
      error: "ruo_not_affirmed",
      message: "The Research Use Only (RUO) attestation must be affirmed to place an order.",
    });
    return;
  }

  const priced = await priceOrderRequest(data);
  if (!priced.ok) {
    res.status(priced.status).json(priced.body);
    return;
  }
  const {
    isWholesale,
    channel,
    resolvedLineItems,
    subtotalCents,
    promoDiscountCents,
    cryptoDiscountCents,
    discountCents,
    totalCents,
    discountSource,
    discountCode,
    discountCodeId,
  } = priced;

  // Provenance invariant — the flat columns must always reconstruct the
  // authoritative discount (docs/discount-system-design.md).
  if (discountCents !== promoDiscountCents + cryptoDiscountCents) {
    throw new Error("discount provenance mismatch: slots do not sum to discountCents");
  }

  const orderId = randomUUID();

  // Optional B2C account linkage: if a retail shopper is signed in, stamp the
  // order so it shows up in their history. Guest checkout is unaffected.
  const customerUser = isWholesale ? null : await resolveCustomerUser(req);

  // Insert the order and its RUO attestation atomically — the attestation is the
  // compliance record of record and must never exist without its order (or vice
  // versa). Capture the requester's IP + user-agent for the audit trail.
  try {
    await db.transaction(async (tx) => {
      // Atomic code consumption — the conditional UPDATE is the race fix. Zero
      // rows updated means the code was exhausted/deactivated/expired between
      // validation and here: roll the order back. Never check-then-increment.
      if (discountCodeId !== null) {
        const consumed = await tx
          .update(discountCodesTable)
          .set({ timesUsed: sql`${discountCodesTable.timesUsed} + 1` })
          .where(
            and(
              eq(discountCodesTable.id, discountCodeId),
              eq(discountCodesTable.active, true),
              sql`(${discountCodesTable.expiresAt} IS NULL OR ${discountCodesTable.expiresAt} > now())`,
              sql`(${discountCodesTable.maxUses} IS NULL OR ${discountCodesTable.timesUsed} < ${discountCodesTable.maxUses})`
            )
          )
          .returning({ id: discountCodesTable.id });
        if (consumed.length === 0) {
          throw new CodeConsumptionError();
        }
      }

      await tx.insert(ordersTable).values({
      id: orderId,
      sessionId: data.sessionId ?? randomUUID(),
      lineItems: resolvedLineItems,
      subtotalCents,
      discountCents,
      discountSource,
      discountCode,
      discountCodeId,
      promoDiscountCents,
      cryptoDiscountCents,
      totalCents,
      paymentMethod: data.paymentMethod,
      channel,
      accountId: isWholesale ? data.accountId! : null,
      customerUserId: customerUser?.id ?? null,
      status: "pending",
      shippingName: data.shippingName,
      shippingEmail: data.shippingEmail,
      shippingAddress1: data.shippingAddress1,
      shippingAddress2: data.shippingAddress2,
      shippingCity: data.shippingCity,
      shippingState: data.shippingState,
      shippingZip: data.shippingZip,
      shippingCountry: data.shippingCountry,
    });

      await tx.insert(orderAttestationsTable).values({
        orderId,
        accountId: isWholesale ? data.accountId! : null,
        attestationVersion: ATTESTATION_VERSION,
        attestationText: ATTESTATION_TEXT,
        ruoAffirmed: data.ruoAffirmed,
        signerName: data.signerName,
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      });
    });
  } catch (err) {
    if (err instanceof CodeConsumptionError) {
      res.status(422).json({
        error: "unprocessable_entity",
        code: "CODE_EXHAUSTED",
        message: "That discount code has reached its redemption limit.",
      });
      return;
    }
    throw err;
  }

  res.status(201).json({
    id: orderId,
    subtotalCents,
    discountCents,
    discountSource,
    discountCode,
    promoDiscountCents,
    cryptoDiscountCents,
    totalCents,
    paymentMethod: data.paymentMethod,
    status: "pending",
    channel,
  });
});

router.get("/orders/:id", async (req, res) => {
  const order = await db.query.ordersTable.findFirst({
    where: eq(ordersTable.id, req.params.id),
  });
  if (!order) {
    res.status(404).json({ error: "not_found", message: "Order not found" });
    return;
  }
  if (!(await canReadOrder(req, order))) {
    res.status(403).json(FORBIDDEN);
    return;
  }
  const payment = await db.query.paymentRecordsTable.findFirst({
    where: eq(paymentRecordsTable.orderId, order.id),
  });
  res.json({ ...order, payment: payment ?? null });
});

router.post("/orders/:id/crypto-invoice", async (req, res) => {
  const order = await db.query.ordersTable.findFirst({
    where: eq(ordersTable.id, req.params.id),
  });
  if (!order) {
    res.status(404).json({ error: "not_found", message: "Order not found" });
    return;
  }
  if (!(await canReadOrder(req, order))) {
    res.status(403).json(FORBIDDEN);
    return;
  }
  if (!isCryptoMethod(order.paymentMethod)) {
    res.status(400).json({
      error: "invalid_payment_method",
      message: "This order does not use a crypto payment method",
    });
    return;
  }

  const existingPending = await db.query.paymentRecordsTable.findFirst({
    where: eq(paymentRecordsTable.orderId, order.id),
  });
  if (existingPending && existingPending.status === "pending") {
    const qrPaymentUri =
      existingPending.currency === "BTC"
        ? `bitcoin:${existingPending.paymentAddress}?amount=${existingPending.amount}`
        : `ethereum:${existingPending.paymentAddress}?value=${existingPending.amount}`;
    res.json({
      paymentRecordId: existingPending.id,
      btcpayInvoiceId: existingPending.btcpayInvoiceId,
      currency: existingPending.currency,
      amount: existingPending.amount,
      amountCents: existingPending.amountCents,
      paymentAddress: existingPending.paymentAddress,
      paymentUrl: existingPending.paymentUrl,
      expiresAt: existingPending.expiresAt.toISOString(),
      qrPaymentUri,
    });
    return;
  }

  const currency: CryptoCurrency =
    order.paymentMethod === "crypto_btc" ? "BTC" : "USDC";
  let invoice;
  try {
    invoice = await btcpayService.createInvoice(
      order.id,
      order.totalCents,
      currency
    );
  } catch (err) {
    if (err instanceof PaymentRailUnavailableError) {
      res.status(err.statusCode).json({
        error: "payment_unavailable",
        message: err.message,
      });
      return;
    }
    throw err;
  }

  const recordId = randomUUID();
  await db.insert(paymentRecordsTable).values({
    id: recordId,
    orderId: order.id,
    btcpayInvoiceId: invoice.invoiceId,
    currency: invoice.currency,
    amount: invoice.amount,
    amountCents: invoice.amountCents,
    paymentAddress: invoice.paymentAddress,
    paymentUrl: invoice.paymentUrl,
    expiresAt: invoice.expiresAt,
    status: "pending",
  });

  await db
    .update(ordersTable)
    .set({ status: "awaiting_payment" })
    .where(eq(ordersTable.id, order.id));

  res.status(201).json({
    paymentRecordId: recordId,
    btcpayInvoiceId: invoice.invoiceId,
    currency: invoice.currency,
    amount: invoice.amount,
    amountCents: invoice.amountCents,
    paymentAddress: invoice.paymentAddress,
    paymentUrl: invoice.paymentUrl,
    expiresAt: invoice.expiresAt.toISOString(),
    qrPaymentUri: invoice.qrPaymentUri,
  });
});

router.post("/orders/:id/ach-instructions", async (req, res) => {
  const order = await db.query.ordersTable.findFirst({
    where: eq(ordersTable.id, req.params.id),
  });
  if (!order) {
    res.status(404).json({ error: "not_found", message: "Order not found" });
    return;
  }
  if (!(await canReadOrder(req, order))) {
    res.status(403).json(FORBIDDEN);
    return;
  }
  if (order.paymentMethod !== "ach" && order.paymentMethod !== "wire") {
    res.status(400).json({
      error: "invalid_payment_method",
      message: "This order does not use the ACH/wire payment rail",
    });
    return;
  }

  // Fail closed: never hand a buyer placeholder bank details. Until the real
  // beneficiary banking info is provisioned via env, the ACH rail is unavailable.
  if (!isAchProvisioned()) {
    res.status(503).json({ error: "ach_unavailable" });
    return;
  }

  // Idempotent: return the existing pending ACH record if one already exists.
  const existing = await db.query.paymentRecordsTable.findFirst({
    where: eq(paymentRecordsTable.orderId, order.id),
  });
  if (existing && existing.status === "pending" && existing.referenceCode) {
    res.status(200).json({
      paymentRecordId: existing.id,
      orderId: order.id,
      referenceCode: existing.referenceCode,
      amountCents: existing.amountCents,
      amount: existing.amount,
      currency: existing.currency,
      status: existing.status,
      expiresAt: existing.expiresAt.toISOString(),
      instructions: buildBankInstructions(existing.referenceCode),
    });
    return;
  }

  const referenceCode = generateAchReferenceCode();
  const recordId = randomUUID();
  const amount = (order.totalCents / 100).toFixed(2);
  const expiresAt = new Date(Date.now() + ACH_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  // Create the pending payment record and advance the order status atomically —
  // neither write should land without the other.
  await db.transaction(async (tx) => {
    await tx.insert(paymentRecordsTable).values({
      id: recordId,
      orderId: order.id,
      currency: "USD",
      amount,
      amountCents: order.totalCents,
      method: "ach",
      referenceCode,
      expiresAt,
      status: "pending",
    });

    await tx
      .update(ordersTable)
      .set({ status: "awaiting_payment" })
      .where(eq(ordersTable.id, order.id));
  });

  res.status(201).json({
    paymentRecordId: recordId,
    orderId: order.id,
    referenceCode,
    amountCents: order.totalCents,
    amount,
    currency: "USD",
    status: "pending",
    expiresAt: expiresAt.toISOString(),
    instructions: buildBankInstructions(referenceCode),
  });
});

router.get("/orders/:id/payment-qr", async (req, res) => {
  // Same authorization as every other per-order endpoint: the QR encodes the
  // pay-to address and the exact amount, which for a wholesale order discloses
  // the tier-priced total.
  const order = await db.query.ordersTable.findFirst({
    where: eq(ordersTable.id, req.params.id),
  });
  if (!order) {
    res.status(404).json({ error: "not_found", message: "Order not found" });
    return;
  }
  if (!(await canReadOrder(req, order))) {
    res.status(403).json(FORBIDDEN);
    return;
  }

  const payment = await db.query.paymentRecordsTable.findFirst({
    where: eq(paymentRecordsTable.orderId, req.params.id),
  });
  if (!payment?.paymentAddress) {
    res.status(404).json({ error: "not_found", message: "Payment record not found" });
    return;
  }
  const qrUri =
    payment.currency === "BTC"
      ? `bitcoin:${payment.paymentAddress}?amount=${payment.amount}`
      : `ethereum:${payment.paymentAddress}?value=${payment.amount}`;
  const qrPng = await QRCode.toBuffer(qrUri, {
    type: "png",
    width: 300,
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
  });
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.send(qrPng);
});

export default router;
