import { Router, type Request } from "express";
import { eq } from "drizzle-orm";
import { db } from "@atlab/db";
import { ordersTable, paymentRecordsTable } from "@atlab/db/schema";
import { btcpayService } from "../services/btcpay";

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

  if (type === "InvoiceSettled" || type === "InvoicePaymentSettled") {
    const txHash =
      event.afterSettlement?.transactionIds?.[0] ??
      event.payment?.id ??
      null;
    await db
      .update(paymentRecordsTable)
      .set({ status: "confirmed", txHash, confirmedAt: new Date() })
      .where(eq(paymentRecordsTable.id, payment.id));
    await db
      .update(ordersTable)
      .set({ status: "confirmed" })
      .where(eq(ordersTable.id, payment.orderId));
  } else if (type === "InvoiceExpired") {
    await db
      .update(paymentRecordsTable)
      .set({ status: "expired" })
      .where(eq(paymentRecordsTable.id, payment.id));
    await db
      .update(ordersTable)
      .set({ status: "expired" })
      .where(eq(ordersTable.id, payment.orderId));
  } else if (type === "InvoiceInvalid") {
    await db
      .update(paymentRecordsTable)
      .set({ status: "failed" })
      .where(eq(paymentRecordsTable.id, payment.id));
    await db
      .update(ordersTable)
      .set({ status: "failed" })
      .where(eq(ordersTable.id, payment.orderId));
  }

  res.status(200).json({ received: true });
});

export default router;
