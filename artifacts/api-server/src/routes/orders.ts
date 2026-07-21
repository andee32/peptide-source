import { Router } from "express";
import { z } from "zod/v4";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import QRCode from "qrcode";
import { db } from "@atlab/db";
import {
  ordersTable,
  paymentRecordsTable,
  productVariantsTable,
  productsTable,
} from "@atlab/db/schema";
import { btcpayService, PaymentRailUnavailableError, type CryptoCurrency } from "../services/btcpay";

const router = Router();

const CRYPTO_DISCOUNT_RATE = 0.1;

const lineItemInputSchema = z.object({
  variantId: z.number().int().positive(),
  quantity: z.number().int().min(1).max(100),
});

const createOrderSchema = z.object({
  sessionId: z.string().optional(),
  lineItems: z.array(lineItemInputSchema).min(1).max(50),
  paymentMethod: z.enum(["card", "crypto_btc", "crypto_usdc"]),
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
  const variantIds = data.lineItems.map((li) => li.variantId);

  const variants = await db
    .select({
      id: productVariantsTable.id,
      name: productVariantsTable.name,
      priceCents: productVariantsTable.priceCents,
      inStock: productVariantsTable.inStock,
      productId: productVariantsTable.productId,
      productName: productsTable.name,
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

  const resolvedLineItems = data.lineItems.map((li) => {
    const v = variantMap.get(li.variantId)!;
    return {
      variantId: li.variantId,
      productName: v.productName,
      variantName: v.name,
      quantity: li.quantity,
      unitPriceCents: v.priceCents,
    };
  });

  const subtotalCents = resolvedLineItems.reduce(
    (sum, item) => sum + item.unitPriceCents * item.quantity,
    0
  );
  const isCrypto = data.paymentMethod !== "card";
  const discountCents = isCrypto
    ? Math.round(subtotalCents * CRYPTO_DISCOUNT_RATE)
    : 0;
  const totalCents = subtotalCents - discountCents;
  const orderId = randomUUID();

  await db.insert(ordersTable).values({
    id: orderId,
    sessionId: data.sessionId ?? randomUUID(),
    lineItems: resolvedLineItems,
    subtotalCents,
    discountCents,
    totalCents,
    paymentMethod: data.paymentMethod,
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

  res.status(201).json({
    id: orderId,
    subtotalCents,
    discountCents,
    totalCents,
    paymentMethod: data.paymentMethod,
    status: "pending",
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
  if (order.paymentMethod === "card") {
    res.status(400).json({
      error: "invalid_payment_method",
      message: "This order uses card payment — not a crypto order",
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

router.get("/orders/:id/payment-qr", async (req, res) => {
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
