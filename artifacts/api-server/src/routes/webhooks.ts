import { Router, type Request } from "express";
import { eq } from "drizzle-orm";
import { timingSafeEqual, createHmac } from "crypto";
import { db } from "@atlab/db";
import { ordersTable, paymentRecordsTable } from "@atlab/db/schema";
import { btcpayService } from "../services/btcpay";

const router = Router();

interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

function verifyBtcpaySignature(
  rawBody: string | Buffer,
  signatureHeader: string
): boolean {
  const verified = btcpayService.verifyWebhookSignature(rawBody, signatureHeader);
  return verified;
}

router.post("/webhooks/btcpay", async (req: RequestWithRawBody, res) => {
  const signatureHeader =
    (req.headers["btcpay-sig"] as string | undefined) ?? "";

  const rawBody: Buffer | string =
    req.rawBody ?? Buffer.from(JSON.stringify(req.body));

  if (!verifyBtcpaySignature(rawBody, signatureHeader)) {
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
