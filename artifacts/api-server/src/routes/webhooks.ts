import { Router, type Request } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "@app/db";
import { ordersTable, paymentRecordsTable, type Order } from "@app/db/schema";
import { btcpayService } from "../services/btcpay";
import { linkMoneyService } from "../services/linkMoney";
import { SETTLEABLE_ORDER_STATUSES } from "../lib/orderStatus";
import { notifyOnOrderConfirmed } from "../lib/fulfillment";
import { sendPaymentFailedEmail } from "../services/email";

const router = Router();

interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

router.post("/webhooks/btcpay", async (req: RequestWithRawBody, res) => {
  const signatureHeader =
    (req.headers["btcpay-sig"] as string | undefined) ?? "";

  // A signature is only meaningful over the exact bytes BTCPay signed. app.ts
  // captures those only for Content-Type: application/json, so when they are
  // missing there is nothing to verify — reject. Re-serialising req.body here
  // would verify the signature against bytes we invented, which is a bypass the
  // moment the middleware order changes (and today it throws on a body that did
  // not parse).
  const rawBody = req.rawBody;
  if (!Buffer.isBuffer(rawBody)) {
    res.status(400).json({ error: "missing_raw_body" });
    return;
  }

  if (!btcpayService.verifyWebhookSignature(rawBody, signatureHeader)) {
    res.status(401).json({ error: "invalid_signature" });
    return;
  }

  const event = req.body as {
    type?: string;
    invoiceId?: string;
    payment?: { id?: string };
    afterSettlement?: { transactionIds?: string[] };
  };

  const { type, invoiceId } = event;

  if (!invoiceId) {
    res.status(200).json({ received: true });
    return;
  }

  const payment = await db.query.paymentRecordsTable.findFirst({
    where: eq(paymentRecordsTable.btcpayInvoiceId, invoiceId),
  });

  if (!payment) {
    res.status(200).json({ received: true, note: "unknown_invoice" });
    return;
  }

  // Moves the payment record and its order together, and only from a status the
  // webhook is allowed to leave. The payment guard makes redelivery a no-op; the
  // order guard stops a replayed settle from resurrecting a refunded order. Both
  // writes share a transaction so neither can land alone.
  async function transition(
    paymentStatus: "confirmed" | "expired" | "failed",
    orderStatus: "confirmed" | "expired" | "failed",
    extra: { txHash?: string | null; confirmedAt?: Date } = {}
  ): Promise<boolean> {
    const result = await db.transaction(async (tx) => {
      const [movedPayment] = await tx
        .update(paymentRecordsTable)
        .set({ status: paymentStatus, ...extra })
        .where(
          and(
            eq(paymentRecordsTable.id, payment!.id),
            eq(paymentRecordsTable.status, "pending")
          )
        )
        .returning();

      // Already in a terminal state — this is a redelivery. Do nothing.
      if (!movedPayment) return { moved: false, movedOrder: null };

      const [movedOrder] = await tx
        .update(ordersTable)
        .set({ status: orderStatus, updatedAt: new Date() })
        .where(
          and(
            eq(ordersTable.id, payment!.orderId),
            inArray(ordersTable.status, SETTLEABLE_ORDER_STATUSES)
          )
        )
        .returning();

      // The payment moved but the order did not, so the order was already in a
      // status the webhook may not leave (refunded, or confirmed by another
      // path). That is a genuine mixed state an operator needs to see — most
      // importantly it can mean funds arrived against a refunded order.
      if (!movedOrder) {
        console.error(
          `[webhook] payment ${payment!.id} moved to ${paymentStatus} but order ` +
            `${payment!.orderId} was not in a webhook-mutable status; needs manual review`
        );
      }

      return { moved: true, movedOrder: movedOrder ?? null };
    });

    // All notifications fire off the response path so a mail hiccup never fails
    // the webhook. Only when the ORDER actually transitioned (movedOrder set) —
    // a payment that moved without its order is the mixed state logged above.
    if (result.movedOrder) {
      if (orderStatus === "confirmed") {
        void notifyOnOrderConfirmed(result.movedOrder).catch((err) =>
          console.error("notifyOnOrderConfirmed error:", err)
        );
      } else {
        // orderStatus is "expired" or "failed" — tell the buyer the payment
        // didn't complete and they were not charged.
        void sendPaymentFailedEmail({
          to: result.movedOrder.shippingEmail,
          orderId: result.movedOrder.id,
          reason: orderStatus,
        }).catch((err) => console.error("sendPaymentFailedEmail error:", err));
      }
    }

    return result.moved;
  }

  if (type === "InvoiceSettled") {
    // Never settle on the webhook payload alone. Read the invoice back from
    // BTCPayServer and require its own verdict to be "Settled" — that is the
    // only status meaning paid in full, and BTCPay has already done the amount
    // arithmetic including tolerances.
    let invoice;
    try {
      invoice = await btcpayService.getInvoice(invoiceId);
    } catch (err) {
      // Fail closed: settle nothing we could not verify. 503 so BTCPay retries.
      console.error(
        `[webhook] could not verify invoice ${invoiceId} before settling:`,
        err
      );
      res.status(503).json({ error: "verification_unavailable" });
      return;
    }

    if (invoice.status !== "Settled") {
      console.warn(
        `[webhook] refusing to settle ${invoiceId}: BTCPay reports status "${invoice.status}"` +
          `${invoice.additionalStatus ? ` (${invoice.additionalStatus})` : ""}`
      );
      res.status(200).json({ received: true, note: "not_settled" });
      return;
    }

    // The invoice must belong to the order we are about to confirm, and must
    // have been raised for the amount we recorded. This catches a mismatched or
    // reused invoice id rather than underpayment, which "Settled" already rules
    // out.
    const claimedOrderId = invoice.metadata?.orderId;
    if (claimedOrderId && claimedOrderId !== payment.orderId) {
      console.error(
        `[webhook] invoice ${invoiceId} claims order ${claimedOrderId} but the ` +
          `payment record belongs to ${payment.orderId}; refusing to settle`
      );
      res.status(200).json({ received: true, note: "order_mismatch" });
      return;
    }

    // amountCents is USD. createRealInvoice always raises invoices in USD, so a
    // non-USD invoice here means that assumption changed and the comparison
    // below would silently compare unlike units — fail closed instead.
    if (invoice.currency !== "USD") {
      console.error(
        `[webhook] invoice ${invoiceId} is denominated in ${invoice.currency}, ` +
          `not USD; refusing to settle`
      );
      res.status(200).json({ received: true, note: "currency_mismatch" });
      return;
    }

    const invoiceCents = Math.round(Number(invoice.amount) * 100);
    if (!Number.isFinite(invoiceCents) || invoiceCents < payment.amountCents) {
      console.error(
        `[webhook] invoice ${invoiceId} is for ${invoice.amount} ${invoice.currency} ` +
          `but the order requires ${payment.amountCents} cents; refusing to settle`
      );
      res.status(200).json({ received: true, note: "amount_mismatch" });
      return;
    }

    // An operator can mark an invoice settled by hand in the BTCPay UI, which
    // reports Settled/Marked with no payment necessarily received. That is a
    // legitimate out-of-band settlement path, so it is not blocked — but it must
    // never pass silently, because it confirms an order for free.
    if (invoice.additionalStatus === "Marked") {
      console.warn(
        `[webhook] invoice ${invoiceId} was MANUALLY marked settled in BTCPay ` +
          `(no on-chain payment implied); confirming order ${payment.orderId} — verify this was intended`
      );
    }

    const txHash =
      event.afterSettlement?.transactionIds?.[0] ?? event.payment?.id ?? null;

    const moved = await transition("confirmed", "confirmed", {
      txHash,
      confirmedAt: new Date(),
    });

    // BTCPay says this invoice is paid, but our payment record was already in a
    // terminal state — a redelivery, or a payment that landed after we expired
    // the invoice. The latter means real funds arrived against a dead order.
    if (!moved) {
      console.warn(
        `[webhook] InvoiceSettled for ${invoiceId} did not move payment ` +
          `${payment.id} (already ${payment.status}); if this was a late payment ` +
          `the funds need manual reconciliation`
      );
    }

    res.status(200).json({ received: true, settled: moved });
    return;
  }

  // A per-payment progress event. It fires as soon as an individual payment
  // confirms on-chain, INCLUDING a partial one, so it must never settle an
  // order on its own. InvoiceSettled above is the only settlement trigger.
  if (type === "InvoicePaymentSettled") {
    res.status(200).json({ received: true, note: "payment_progress" });
    return;
  }

  if (type === "InvoiceExpired") {
    await transition("expired", "expired");
  } else if (type === "InvoiceInvalid") {
    await transition("failed", "failed");
  }

  res.status(200).json({ received: true });
});

/**
 * Link Money (Pay by Bank) payment events.
 *
 * Settlement rule mirrors the BTCPay route: the payload is only a nudge. The
 * transaction is read back from Link and must itself report SUCCEEDED before
 * anything is confirmed — Link's own verdict is the only thing that means the
 * buyer's account was actually debited. `payment.authorized` deliberately does
 * NOT confirm the order: an authorized ACH debit can still be returned days
 * later, and confirming there would ship goods against money that never landed.
 */
router.post("/webhooks/linkmoney", async (req: RequestWithRawBody, res) => {
  const presented =
    (req.headers["x-link-signature"] as string | undefined) ??
    (req.headers["x-linkmoney-signature"] as string | undefined) ??
    (req.headers["x-webhook-secret"] as string | undefined) ??
    "";

  // A signature is only meaningful over the exact bytes Link signed; app.ts
  // captures those only for application/json. Re-serialising req.body would
  // verify against bytes we invented, so reject instead.
  const rawBody = req.rawBody;
  if (!Buffer.isBuffer(rawBody)) {
    res.status(400).json({ error: "missing_raw_body" });
    return;
  }

  if (!linkMoneyService.verifyWebhookSignature(rawBody, presented)) {
    res.status(401).json({ error: "invalid_signature" });
    return;
  }

  const event = req.body as {
    eventType?: string;
    metadata?: {
      resourceId?: string;
      resourceType?: string;
      clientReferenceId?: string;
      achReturnCode?: string;
    };
  };

  const eventType = event.eventType ?? "";
  const transactionId = event.metadata?.resourceId;
  const orderId = event.metadata?.clientReferenceId;

  if (!eventType.startsWith("payment.") || !transactionId || !orderId) {
    res.status(200).json({ received: true, note: "ignored" });
    return;
  }

  const payment = await db.query.paymentRecordsTable.findFirst({
    where: and(
      eq(paymentRecordsTable.orderId, orderId),
      eq(paymentRecordsTable.method, "pay_by_bank")
    ),
  });

  if (!payment) {
    res.status(200).json({ received: true, note: "unknown_payment" });
    return;
  }

  // First event carrying the transaction id binds it to our record. A DIFFERENT
  // id later means two Link transactions exist against one order — never
  // silently rebind, because the read-back below would then be pointed at a
  // transaction the order did not authorise.
  if (payment.linkPaymentId && payment.linkPaymentId !== transactionId) {
    console.error(
      `[webhook] order ${orderId} already bound to Link transaction ` +
        `${payment.linkPaymentId} but event names ${transactionId}; ignoring`
    );
    res.status(200).json({ received: true, note: "transaction_mismatch" });
    return;
  }
  if (!payment.linkPaymentId) {
    await db
      .update(paymentRecordsTable)
      .set({ linkPaymentId: transactionId })
      .where(eq(paymentRecordsTable.id, payment.id));
  }

  async function settle(
    paymentStatus: "confirmed" | "failed",
    orderStatus: "confirmed" | "failed",
    extra: { confirmedAt?: Date } = {}
  ): Promise<{ moved: boolean; movedOrder: Order | null }> {
    return db.transaction(async (tx) => {
      const [movedPayment] = await tx
        .update(paymentRecordsTable)
        .set({ status: paymentStatus, ...extra })
        .where(
          and(
            eq(paymentRecordsTable.id, payment!.id),
            eq(paymentRecordsTable.status, "pending")
          )
        )
        .returning();

      if (!movedPayment) return { moved: false, movedOrder: null };

      const [movedOrder] = await tx
        .update(ordersTable)
        .set({ status: orderStatus, updatedAt: new Date() })
        .where(
          and(
            eq(ordersTable.id, payment!.orderId),
            inArray(ordersTable.status, SETTLEABLE_ORDER_STATUSES)
          )
        )
        .returning();

      if (!movedOrder) {
        console.error(
          `[webhook] payment ${payment!.id} moved to ${paymentStatus} but order ` +
            `${payment!.orderId} was not in a webhook-mutable status; needs manual review`
        );
      }

      return { moved: true, movedOrder: movedOrder ?? null };
    });
  }

  if (eventType === "payment.succeeded" || eventType === "payment.disbursed") {
    let transaction;
    try {
      transaction = await linkMoneyService.getTransaction(transactionId);
    } catch (err) {
      // Fail closed and 503 so Link retries: settle nothing we could not verify.
      console.error(
        `[webhook] could not verify Link transaction ${transactionId}:`,
        err
      );
      res.status(503).json({ error: "verification_unavailable" });
      return;
    }

    if (transaction.transactionStatus !== "SUCCEEDED") {
      console.warn(
        `[webhook] refusing to settle ${transactionId}: Link reports ` +
          `"${transaction.transactionStatus}"`
      );
      res.status(200).json({ received: true, note: "not_settled" });
      return;
    }

    // The debit must be for at least what the order requires, in USD. A short
    // or foreign-denominated debit is not payment for this order.
    if (transaction.amount && transaction.amount.currency !== "USD") {
      console.error(
        `[webhook] transaction ${transactionId} is denominated in ` +
          `${transaction.amount.currency}, not USD; refusing to settle`
      );
      res.status(200).json({ received: true, note: "currency_mismatch" });
      return;
    }
    const paidCents = Math.round((transaction.amount?.value ?? 0) * 100);
    if (!Number.isFinite(paidCents) || paidCents < payment.amountCents) {
      console.error(
        `[webhook] transaction ${transactionId} debited ${paidCents} cents but ` +
          `order ${payment.orderId} requires ${payment.amountCents}; refusing to settle`
      );
      res.status(200).json({ received: true, note: "amount_mismatch" });
      return;
    }

    const result = await settle("confirmed", "confirmed", { confirmedAt: new Date() });
    if (result.movedOrder) {
      void notifyOnOrderConfirmed(result.movedOrder).catch((err) =>
        console.error("notifyOnOrderConfirmed error:", err)
      );
    } else if (!result.moved) {
      console.warn(
        `[webhook] payment.succeeded for ${transactionId} did not move payment ` +
          `${payment.id} (already ${payment.status}); may need reconciliation`
      );
    }

    res.status(200).json({ received: true, settled: result.moved });
    return;
  }

  if (eventType === "payment.failed" || eventType === "payment.canceled") {
    const result = await settle("failed", "failed");
    if (result.movedOrder) {
      void sendPaymentFailedEmail({
        to: result.movedOrder.shippingEmail,
        orderId: result.movedOrder.id,
        reason: "failed",
      }).catch((err) => console.error("sendPaymentFailedEmail error:", err));
    }
    if (event.metadata?.achReturnCode) {
      console.warn(
        `[webhook] Link transaction ${transactionId} failed with ACH return code ` +
          `${event.metadata.achReturnCode}`
      );
    }
    res.status(200).json({ received: true, settled: result.moved });
    return;
  }

  // Everything else (created / pending / authorized / scheduled / initiated) is
  // progress, not settlement. Recorded in the log only.
  res.status(200).json({ received: true, note: "payment_progress" });
});

export default router;
