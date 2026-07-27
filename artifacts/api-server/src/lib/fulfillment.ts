import { eq } from "drizzle-orm";
import { db } from "@atlab/db";
import { storeSettingsTable, ordersTable } from "@atlab/db/schema";
import {
  sendFulfillmentEmail,
  sendOrderConfirmationEmail,
} from "../services/email";

type OrderRow = typeof ordersTable.$inferSelect;
type LineItem = { productName: string; variantName: string; quantity: number; unitPriceCents: number };

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
    const settings = await db.query.storeSettingsTable.findFirst({
      where: eq(storeSettingsTable.id, "default"),
    });
    const to = settings?.fulfillmentEmail?.trim();
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
