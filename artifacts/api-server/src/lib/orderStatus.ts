// Shared order status predicates.
//
// Settlement happens on two rails — the BTCPay webhook (routes/webhooks.ts) and
// the admin ACH confirmation (routes/admin.ts). Both must agree on which
// statuses an order may be moved out of, or one becomes a bypass for the other:
// a guard on the webhook is worth nothing if an admin endpoint can confirm a
// refunded order. Keep this list as the single definition.

/**
 * Statuses a settlement path may move an order OUT of. An order that is already
 * confirmed, or that an admin has refunded, is never rewritten by a settlement.
 */
export const SETTLEABLE_ORDER_STATUSES: readonly (
  | "pending"
  | "awaiting_payment"
)[] = ["pending", "awaiting_payment"];

/**
 * Statuses that are final: no further transition is permitted from them by any
 * route. Mirrors the check already enforced on PATCH /admin/orders/:id.
 */
export const TERMINAL_ORDER_STATUSES: readonly string[] = ["refunded"];
