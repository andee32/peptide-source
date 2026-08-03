import { eq } from "drizzle-orm";
import { db } from "@app/db";
import { storeSettingsTable, ordersTable } from "@app/db/schema";
import {
  sendFulfillmentEmail,
  sendOrderConfirmationEmail,
  sendPaymentInstructionsEmail,
  sendOpsOrderReceivedEmail,
  type OrderPaymentMethod,
} from "../services/email";

type OrderRow = typeof ordersTable.$inferSelect;
type LineItem = { productName: string; variantName: string; quantity: number; unitPriceCents: number };

// The operator inbox. Reuses the admin-set fulfillmentEmail as the ops address —
// in a single-operator shop the shipper and the person watching for incoming
// bank transfers are the same. Empty = no operator notification.
async function fulfillmentAddress(): Promise<string | undefined> {
  const settings = await db.query.storeSettingsTable.findFirst({
    where: eq(storeSettingsTable.id, "default"),
  });
  return settings?.fulfillmentEmail?.trim() || undefined;
}

function orderLineItems(order: OrderRow): LineItem[] {
  return Array.isArray(order.lineItems)
    ? (order.lineItems as LineItem[]).map((li) => ({
        productName: li.productName,
        variantName: li.variantName,
        quantity: li.quantity,
        unitPriceCents: li.unitPriceCents,
      }))
    : [];
}

/**
 * Fire-and-forget on the confirmed transition. Sends BOTH:
 *  - the buyer's order-confirmation email (to the order's shipping email), and
 *  - the dropshipper's fulfilment notice (to the admin-set fulfillmentEmail).
 * Each is guarded independently so one failure can't block the other, and both
 * are placeholder-guarded (log until SMTP is configured). Call after the settle
 * transaction commits, off the response path.
 */
export async function notifyOnOrderConfirmed(order: OrderRow): Promise<void> {
  const lineItems = orderLineItems(order);

  // Buyer confirmation.
  try {
    await sendOrderConfirmationEmail({
      to: order.shippingEmail,
      order: { id: order.id, lineItems, totalCents: order.totalCents },
    });
  } catch (err) {
    console.error("sendOrderConfirmationEmail error:", err);
  }

  // Dropshipper fulfilment notice.
  try {
    const to = await fulfillmentAddress();
    if (!to) {
      console.log(
        `[fulfillment] order ${order.id} confirmed — no fulfillment email set, shipper not notified`
      );
      return;
    }
    await sendFulfillmentEmail({
      to,
      order: {
        id: order.id,
        channel: order.channel,
        lineItems,
        shippingName: order.shippingName,
        shippingAddress1: order.shippingAddress1,
        shippingAddress2: order.shippingAddress2,
        shippingCity: order.shippingCity,
        shippingState: order.shippingState,
        shippingZip: order.shippingZip,
        shippingCountry: order.shippingCountry,
      },
    });
  } catch (err) {
    console.error("sendFulfillmentEmail error:", err);
  }
}

/**
 * Fire-and-forget on order PLACEMENT (status pending, payment not yet made).
 * Sends BOTH:
 *  - the buyer's "how to pay" instructions for the rail they chose, and
 *  - an ops "order received" notice to the operator inbox.
 * Each is guarded independently and placeholder-guarded (log until SMTP is
 * configured). Call after the create transaction commits, off the response path.
 */
export async function notifyOnOrderPlaced(order: OrderRow): Promise<void> {
  // Buyer payment instructions.
  try {
    await sendPaymentInstructionsEmail({
      to: order.shippingEmail,
      orderId: order.id,
      paymentMethod: order.paymentMethod as OrderPaymentMethod,
      totalCents: order.totalCents,
    });
  } catch (err) {
    console.error("sendPaymentInstructionsEmail error:", err);
  }

  // Ops order-received notice.
  try {
    const to = await fulfillmentAddress();
    if (!to) {
      console.log(
        `[fulfillment] order ${order.id} placed — no operator email set, ops not notified`
      );
      return;
    }
    await sendOpsOrderReceivedEmail({
      to,
      order: {
        id: order.id,
        channel: order.channel,
        paymentMethod: order.paymentMethod as OrderPaymentMethod,
        totalCents: order.totalCents,
        buyerName: order.shippingName,
        buyerEmail: order.shippingEmail,
      },
    });
  } catch (err) {
    console.error("sendOpsOrderReceivedEmail error:", err);
  }
}
