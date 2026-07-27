import { eq } from "drizzle-orm";
import { db } from "@atlab/db";
import { storeSettingsTable, ordersTable } from "@atlab/db/schema";
import { sendFulfillmentEmail } from "../services/email";

type OrderRow = typeof ordersTable.$inferSelect;
type LineItem = { productName: string; variantName: string; quantity: number };

/**
 * Fire-and-forget on the confirmed transition: notify the dropshipper so they
 * can fulfil the order. The recipient is the admin-set fulfillmentEmail; when
 * it's empty (or SMTP is unconfigured) this logs instead of sending. Call after
 * the settle transaction commits, off the response path.
 */
export async function notifyFulfillmentOnConfirm(order: OrderRow): Promise<void> {
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
  const lineItems: LineItem[] = Array.isArray(order.lineItems)
    ? (order.lineItems as LineItem[]).map((li) => ({
        productName: li.productName,
        variantName: li.variantName,
        quantity: li.quantity,
      }))
    : [];
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
}
