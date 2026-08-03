import { orderStatusEnum } from "@app/db/schema";

// Shared order status predicates.
//
// Every route that writes orders.status must put its predicate on the UPDATE
// itself, not only on a preceding SELECT — otherwise the check and the write can
// disagree across an await, and the whole guard is decorative. Settlement runs on
// two rails (the BTCPay webhook and the admin ACH confirmation) and payment
// instruments are minted on a third, so these lists live here rather than being
// restated per file: a guard duplicated in three places is a guard that drifts.
//
// All three are typed off orderStatusEnum, so adding a status to the schema
// without classifying it here is a compile error rather than a silent hole.

type OrderStatus = (typeof orderStatusEnum.enumValues)[number];

/**
 * Final: no route may transition an order out of these.
 */
export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = ["refunded"];

/**
 * Statuses a settlement may move an order OUT of — everything except terminal.
 *
 * Deliberately permissive. Settlement is already gated on much stronger
 * conditions: the specific payment record must still be pending, BTCPay must
 * independently report the invoice Settled, and the invoice's order id, currency
 * and amount must all match. Narrowing this further does not prevent a bad
 * settlement, it only strands a good one — a late payment against an invoice we
 * already expired would confirm the payment record and leave the order dead,
 * with real funds received and nothing but a log line to show for it.
 *
 * "shipped" is the one narrowing that strands nothing: a shipped order's payment
 * is already confirmed and it can't mint a new one (shipped ∉ PAYABLE), so no
 * legitimate settlement ever targets it — excluding it only prevents a future
 * rail from regressing a fulfilled order back to confirmed.
 */
export const SETTLEABLE_ORDER_STATUSES: readonly OrderStatus[] =
  orderStatusEnum.enumValues.filter(
    (s) => !TERMINAL_ORDER_STATUSES.includes(s) && s !== "shipped"
  );

/**
 * Statuses from which a buyer may (re)mint a payment instrument.
 *
 * An expired or failed order should be payable again — that is a normal retry.
 * A confirmed or refunded one must not be: minting there also resets the order
 * to awaiting_payment, dropping it out of confirmed revenue and handing a
 * refunded order a live pay-to address.
 */
export const PAYABLE_ORDER_STATUSES: readonly OrderStatus[] = [
  "pending",
  "awaiting_payment",
  "expired",
  "failed",
];
