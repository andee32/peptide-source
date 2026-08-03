import { randomUUID } from "node:crypto";
import { db } from "@app/db";
import {
  productsTable,
  productVariantsTable,
  ordersTable,
  paymentRecordsTable,
} from "@app/db/schema";

let seq = 0;
const uniq = () => `${Date.now()}-${++seq}`;

export async function makeVariant(
  opts: {
    priceCents?: number;
    unitType?: "vial" | "kit";
    inStock?: boolean;
    complianceStatus?: "blocked" | "restricted" | "cleared";
  } = {}
) {
  const tag = uniq();
  const [product] = await db
    .insert(productsTable)
    .values({
      name: `Test Peptide ${tag}`,
      slug: `test-peptide-${tag}`,
      shortDescription: "Research use only test fixture",
      complianceStatus: opts.complianceStatus ?? "cleared",
    })
    .returning();

  const [variant] = await db
    .insert(productVariantsTable)
    .values({
      productId: product.id,
      name: "10mg",
      concentration: "10mg/vial",
      sizeml: 2,
      priceCents: opts.priceCents ?? 10_000,
      sku: `TEST-${tag}`,
      unitType: opts.unitType ?? "vial",
      inStock: opts.inStock ?? true,
    })
    .returning();

  return { product, variant };
}

export function orderPayload(
  variantId: number,
  overrides: Record<string, unknown> = {}
) {
  return {
    lineItems: [{ variantId, quantity: 1 }],
    ruoAffirmed: true,
    signerName: "Test Signer",
    paymentMethod: "crypto_btc",
    shippingName: "Test Buyer",
    shippingEmail: "buyer@example.test",
    shippingAddress1: "1 Test St",
    shippingCity: "Testville",
    shippingState: "CA",
    shippingZip: "90001",
    shippingCountry: "US",
    ...overrides,
  };
}

// Seeds an order already sitting at a given status, plus its pending payment
// record — the state a BTCPay webhook would arrive against.
export async function seedOrderWithPayment(
  opts: {
    orderStatus?:
      | "pending"
      | "awaiting_payment"
      | "confirmed"
      | "failed"
      | "expired"
      | "refunded";
    paymentStatus?: "pending" | "confirmed" | "expired" | "failed";
    totalCents?: number;
    btcpayInvoiceId?: string;
  } = {}
) {
  const orderId = randomUUID();
  const totalCents = opts.totalCents ?? 400_000;
  const invoiceId = opts.btcpayInvoiceId ?? `inv-${uniq()}`;

  await db.insert(ordersTable).values({
    id: orderId,
    sessionId: randomUUID(),
    lineItems: [
      {
        variantId: 1,
        productName: "Test Peptide",
        variantName: "10mg",
        quantity: 1,
        unitPriceCents: totalCents,
      },
    ],
    subtotalCents: totalCents,
    discountCents: 0,
    totalCents,
    paymentMethod: "crypto_btc",
    status: opts.orderStatus ?? "awaiting_payment",
    shippingName: "Test Buyer",
    shippingEmail: "buyer@example.test",
    shippingAddress1: "1 Test St",
    shippingCity: "Testville",
    shippingState: "CA",
    shippingZip: "90001",
  });

  const paymentId = randomUUID();
  await db.insert(paymentRecordsTable).values({
    id: paymentId,
    orderId,
    btcpayInvoiceId: invoiceId,
    currency: "BTC",
    amount: (totalCents / 100).toFixed(2),
    amountCents: totalCents,
    paymentAddress: "bc1qtestaddress",
    expiresAt: new Date(Date.now() + 3_600_000),
    status: opts.paymentStatus ?? "pending",
  });

  return { orderId, paymentId, invoiceId, totalCents };
}
