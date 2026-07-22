import { Router, type Request } from "express";
import { z } from "zod/v4";
import { eq, and, inArray, desc } from "drizzle-orm";
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
} from "@atlab/db/schema";
import { btcpayService, PaymentRailUnavailableError, type CryptoCurrency } from "../services/btcpay";
import { resolveCustomerUser } from "../lib/customerSession";
import {
  generateAchReferenceCode,
  buildBankInstructions,
  isAchProvisioned,
  isZelleProvisioned,
  buildZelleInstructions,
  ACH_EXPIRY_DAYS,
} from "../services/ach";
import { PAYABLE_ORDER_STATUSES } from "../lib/orderStatus";

const router = Router();

type OrderStatus = (typeof ordersTable.$inferSelect)["status"];

function rejectIfNotPayable(
  status: OrderStatus,
  res: import("express").Response
): boolean {
  if (PAYABLE_ORDER_STATUSES.includes(status)) return false;
  res.status(409).json({
    error: "conflict",
    message: `Order is ${status} and cannot accept a new payment`,
  });
  return true;
}

const CRYPTO_DISCOUNT_RATE = 0.1;

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

function extractAccountToken(req: Request): string | undefined {
  const fromHeader = req.headers["x-account-token"];
  const headerVal = Array.isArray(fromHeader) ? fromHeader[0] : fromHeader;
  const fromQuery = req.query.token as string | undefined;
  return headerVal || fromQuery || undefined;
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
  paymentMethod: z.enum(["crypto_btc", "crypto_usdc", "ach", "wire", "zelle"]),
  shippingName: z.string().min(1).max(200),
  shippingEmail: z.string().email(),
  shippingAddress1: z.string().min(1).max(500),
  shippingAddress2: z.string().optional(),
  shippingCity: z.string().min(1).max(200),
  shippingState: z.string().min(1).max(100),
  shippingZip: z.string().min(1).max(20),
  shippingCountry: z.string().default("US"),
});

router.post("/orders", async (req, res) => {
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

  const variantIds = data.lineItems.map((li) => li.variantId);

  const variants = await db
    .select({
      id: productVariantsTable.id,
      name: productVariantsTable.name,
      priceCents: productVariantsTable.priceCents,
      inStock: productVariantsTable.inStock,
      unitType: productVariantsTable.unitType,
      productId: productVariantsTable.productId,
      productName: productsTable.name,
      complianceStatus: productsTable.complianceStatus,
    })
    .from(productVariantsTable)
    .innerJoin(productsTable, eq(productVariantsTable.productId, productsTable.id))
    .where(inArray(productVariantsTable.id, variantIds));

  const variantMap = new Map(variants.map((v) => [v.id, v]));

  const missingIds = variantIds.filter((id) => !variantMap.has(id));
  if (missingIds.length > 0) {
    res.status(400).json({
      error: "invalid_variant",
      message: `Variant(s) not found: ${missingIds.join(", ")}`,
    });
    return;
  }

  const outOfStock = data.lineItems.filter((li) => !variantMap.get(li.variantId)?.inStock);
  if (outOfStock.length > 0) {
    res.status(400).json({
      error: "out_of_stock",
      message: `Variant(s) out of stock: ${outOfStock.map((li) => li.variantId).join(", ")}`,
    });
    return;
  }

  // Per-SKU compliance gate: a line item whose product is compliance-blocked is
  // unsellable. (restricted is still orderable — reserved for later.)
  const blocked = data.lineItems.filter(
    (li) => variantMap.get(li.variantId)?.complianceStatus === "blocked"
  );
  if (blocked.length > 0) {
    res.status(422).json({
      error: "unprocessable_entity",
      code: "SKU_NOT_AVAILABLE",
      message: `One or more items are not available for sale: variant(s) ${blocked
        .map((li) => li.variantId)
        .join(", ")}.`,
    });
    return;
  }

  // ── Wholesale path: authenticate account, enforce kit-only + MOQ, resolve
  // tier pricing. Retail path (no accountId) is unchanged.
  const isWholesale = !!data.accountId;

  // Zelle is wholesale-only, enforced here rather than by hiding the option in
  // the UI. It identifies the recipient by phone/email rather than an account
  // number, so exposing it publicly would publish a direct line to the operating
  // bank account — and it has no dispute mechanism in either direction. Limiting
  // it to approved B2B accounts keeps it to counterparties already known.
  if (data.paymentMethod === "zelle" && !isWholesale) {
    res.status(422).json({
      error: "unprocessable_entity",
      code: "ZELLE_WHOLESALE_ONLY",
      message: "Zelle is available to approved wholesale accounts only.",
    });
    return;
  }
  const priceOverrides = new Map<number, number>();

  if (isWholesale) {
    const account = await db.query.customerAccountsTable.findFirst({
      where: eq(customerAccountsTable.id, data.accountId!),
    });
    if (
      !account ||
      account.status !== "approved" ||
      !data.token ||
      !account.accessToken ||
      account.accessToken !== data.token
    ) {
      res.status(403).json({
        error: "forbidden",
        message: "Wholesale account is not approved or the access token is invalid",
      });
      return;
    }

    const nonKit = data.lineItems.filter(
      (li) => variantMap.get(li.variantId)?.unitType !== "kit"
    );
    if (nonKit.length > 0) {
      res.status(422).json({
        error: "unprocessable_entity",
        code: "WHOLESALE_KIT_REQUIRED",
        message: `Wholesale orders may only contain kit variants. Non-kit variant(s): ${nonKit
          .map((li) => li.variantId)
          .join(", ")}`,
      });
      return;
    }

    const totalKits = data.lineItems.reduce((sum, li) => sum + li.quantity, 0);
    if (totalKits < 5) {
      res.status(422).json({
        error: "unprocessable_entity",
        code: "MOQ_NOT_MET",
        message: `Wholesale minimum order quantity is 5 kits (mixed SKUs count toward the total); this order has ${totalKits}.`,
      });
      return;
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

  const resolvedLineItems = data.lineItems.map((li) => {
    const v = variantMap.get(li.variantId)!;
    return {
      variantId: li.variantId,
      productName: v.productName,
      variantName: v.name,
      quantity: li.quantity,
      unitPriceCents: priceOverrides.get(li.variantId) ?? v.priceCents,
    };
  });

  const subtotalCents = resolvedLineItems.reduce(
    (sum, item) => sum + item.unitPriceCents * item.quantity,
    0
  );
  // Wholesale orders never receive the retail crypto discount.
  const isCrypto = isCryptoMethod(data.paymentMethod);
  const discountCents =
    !isWholesale && isCrypto
      ? Math.round(subtotalCents * CRYPTO_DISCOUNT_RATE)
      : 0;
  const totalCents = subtotalCents - discountCents;
  const channel = isWholesale ? "wholesale" : "retail";
  const orderId = randomUUID();

  // Optional B2C account linkage: if a retail shopper is signed in, stamp the
  // order so it shows up in their history. Guest checkout is unaffected.
  const customerUser = isWholesale ? null : await resolveCustomerUser(req);

  // Insert the order and its RUO attestation atomically — the attestation is the
  // compliance record of record and must never exist without its order (or vice
  // versa). Capture the requester's IP + user-agent for the audit trail.
  await db.transaction(async (tx) => {
    await tx.insert(ordersTable).values({
      id: orderId,
      sessionId: data.sessionId ?? randomUUID(),
      lineItems: resolvedLineItems,
      subtotalCents,
      discountCents,
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

  res.status(201).json({
    id: orderId,
    subtotalCents,
    discountCents,
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
    orderBy: [desc(paymentRecordsTable.createdAt)],
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
  if (rejectIfNotPayable(order.status, res)) return;

  const existingPending = await db.query.paymentRecordsTable.findFirst({
    where: eq(paymentRecordsTable.orderId, order.id),
    orderBy: [desc(paymentRecordsTable.createdAt)],
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

  // The BTCPay round trip above takes seconds, so the status read at the top of
  // this handler is stale by now — an admin could have refunded the order in the
  // meantime. Re-assert payability on the UPDATE itself, and keep the record
  // insert in the same transaction so a crash cannot leave a live invoice
  // attached to an order that never advanced.
  const minted = await db.transaction(async (tx) => {
    const [movedOrder] = await tx
      .update(ordersTable)
      .set({ status: "awaiting_payment", updatedAt: new Date() })
      .where(
        and(
          eq(ordersTable.id, order.id),
          inArray(ordersTable.status, PAYABLE_ORDER_STATUSES)
        )
      )
      .returning();

    if (!movedOrder) return false;

    await tx.insert(paymentRecordsTable).values({
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

    return true;
  });

  if (!minted) {
    // The order moved out of a payable status while BTCPay was minting. The
    // invoice exists upstream but is deliberately not recorded against the
    // order, so nothing here can be paid into a settled or refunded order.
    console.warn(
      `[orders] discarded BTCPay invoice ${invoice.invoiceId}: order ${order.id} ` +
        `left a payable status during minting`
    );
    res.status(409).json({
      error: "conflict",
      message: "Order status changed while creating the invoice; please retry",
    });
    return;
  }

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
  const BANK_METHODS = ["ach", "wire", "zelle"] as const;
  if (!(BANK_METHODS as readonly string[]).includes(order.paymentMethod)) {
    res.status(400).json({
      error: "invalid_payment_method",
      message: "This order does not use a bank-transfer payment rail",
    });
    return;
  }
  const isZelle = order.paymentMethod === "zelle";

  // Zelle is wholesale-only. The check at order creation is the primary gate;
  // this one stops a retail order that somehow carries the method from ever
  // being handed a Zelle destination.
  if (isZelle && order.channel !== "wholesale") {
    res.status(422).json({
      error: "unprocessable_entity",
      code: "ZELLE_WHOLESALE_ONLY",
      message: "Zelle is available to approved wholesale accounts only.",
    });
    return;
  }

  // Approval must hold NOW, not merely at order time. The access token is minted
  // at application and never rotated, so without this a buyer whose KYB later
  // failed keeps re-fetching the live operating-bank handle from the idempotent
  // path below — which defeats the entire reason the rail is limited to
  // already-approved counterparties.
  if (isZelle) {
    const account = order.accountId
      ? await db.query.customerAccountsTable.findFirst({
          where: eq(customerAccountsTable.id, order.accountId),
        })
      : null;
    if (account?.status !== "approved") {
      res.status(403).json({
        error: "forbidden",
        code: "ZELLE_WHOLESALE_ONLY",
        message: "Zelle is available to approved wholesale accounts only.",
      });
      return;
    }
  }

  // Fail closed: never hand a buyer a payment destination we have not verified.
  // Until the real details are provisioned via env, the rail is unavailable.
  // A Zelle transfer is irreversible with no dispute path, so a wrong handle
  // means the buyer's funds are simply gone.
  if (isZelle ? !isZelleProvisioned() : !isAchProvisioned()) {
    res.status(503).json({ error: isZelle ? "zelle_unavailable" : "ach_unavailable" });
    return;
  }
  if (rejectIfNotPayable(order.status, res)) return;

  // Idempotent: return the existing pending ACH record if one already exists.
  const existing = await db.query.paymentRecordsTable.findFirst({
    where: eq(paymentRecordsTable.orderId, order.id),
    orderBy: [desc(paymentRecordsTable.createdAt)],
  });
  if (
    existing &&
    existing.status === "pending" &&
    existing.referenceCode &&
    existing.method === (isZelle ? "zelle" : "ach")
  ) {
    res.status(200).json({
      paymentRecordId: existing.id,
      orderId: order.id,
      referenceCode: existing.referenceCode,
      amountCents: existing.amountCents,
      amount: existing.amount,
      currency: existing.currency,
      status: existing.status,
      expiresAt: existing.expiresAt.toISOString(),
      instructions: isZelle
        ? buildZelleInstructions(existing.referenceCode)
        : buildBankInstructions(existing.referenceCode),
    });
    return;
  }

  const referenceCode = generateAchReferenceCode();
  const recordId = randomUUID();
  const amount = (order.totalCents / 100).toFixed(2);
  const expiresAt = new Date(Date.now() + ACH_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  // Create the pending payment record and advance the order status atomically —
  // neither write should land without the other. The status predicate sits on
  // the UPDATE, not just the check above, so a concurrent refund cannot be
  // overwritten between the two.
  const minted = await db.transaction(async (tx) => {
    const [movedOrder] = await tx
      .update(ordersTable)
      .set({ status: "awaiting_payment", updatedAt: new Date() })
      .where(
        and(
          eq(ordersTable.id, order.id),
          inArray(ordersTable.status, PAYABLE_ORDER_STATUSES)
        )
      )
      .returning();

    if (!movedOrder) return false;

    await tx.insert(paymentRecordsTable).values({
      id: recordId,
      orderId: order.id,
      currency: "USD",
      amount,
      amountCents: order.totalCents,
      method: isZelle ? "zelle" : "ach",
      referenceCode,
      expiresAt,
      status: "pending",
    });

    return true;
  });

  if (!minted) {
    res.status(409).json({
      error: "conflict",
      message: "Order status changed while creating the instructions; please retry",
    });
    return;
  }

  res.status(201).json({
    paymentRecordId: recordId,
    orderId: order.id,
    referenceCode,
    amountCents: order.totalCents,
    amount,
    currency: "USD",
    status: "pending",
    expiresAt: expiresAt.toISOString(),
    instructions: isZelle
      ? buildZelleInstructions(referenceCode)
      : buildBankInstructions(referenceCode),
  });
});

router.get("/orders/:id/payment-qr", async (req, res) => {
  // Every sibling handler gates on canReadOrder; this one did not, so an order
  // id alone yielded the pay-to address and amount even for an order belonging
  // to a signed-in customer or a wholesale account.
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
    where: and(
      eq(paymentRecordsTable.orderId, req.params.id),
      eq(paymentRecordsTable.status, "pending")
    ),
    orderBy: [desc(paymentRecordsTable.createdAt)],
  });
  // Only a live, unexpired invoice gets a scannable code — rendering one for a
  // settled or expired invoice invites a payment that can no longer be credited.
  if (!payment?.paymentAddress || payment.expiresAt.getTime() <= Date.now()) {
    res.status(404).json({ error: "not_found", message: "No live payment record for this order" });
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
