import { createHmac, timingSafeEqual } from "crypto";

const BTCPAY_URL = process.env.BTCPAYSERVER_URL;
const BTCPAY_KEY = process.env.BTCPAYSERVER_API_KEY;
const BTCPAY_STORE = process.env.BTCPAYSERVER_STORE_ID;
const BTCPAY_WEBHOOK_SECRET = process.env.BTCPAYSERVER_WEBHOOK_SECRET;

export type CryptoCurrency = "BTC" | "USDC";

export interface BTCPayInvoice {
  invoiceId: string;
  paymentUrl: string;
  paymentAddress: string;
  currency: CryptoCurrency;
  amount: string;
  amountCents: number;
  expiresAt: Date;
  qrPaymentUri: string;
}

/**
 * Thrown when the crypto rail is not fully configured. Callers should surface
 * a 503 — we NEVER hand a customer a fabricated pay-to address, which would
 * lose their funds irretrievably. (Fork hardening: replaced the old stub path.)
 */
export class PaymentRailUnavailableError extends Error {
  statusCode = 503;
  constructor(message = "Crypto payments are temporarily unavailable. Please try again later.") {
    super(message);
    this.name = "PaymentRailUnavailableError";
  }
}

export class BTCPayService {
  private get isConfigured(): boolean {
    return !!(BTCPAY_URL && BTCPAY_KEY && BTCPAY_STORE);
  }

  async createInvoice(
    orderId: string,
    amountCents: number,
    currency: CryptoCurrency = "BTC"
  ): Promise<BTCPayInvoice> {
    if (!this.isConfigured) {
      throw new PaymentRailUnavailableError();
    }
    return this.createRealInvoice(orderId, amountCents, currency);
  }

  private async createRealInvoice(
    orderId: string,
    amountCents: number,
    currency: CryptoCurrency
  ): Promise<BTCPayInvoice> {
    const paymentMethod =
      currency === "BTC"
        ? "BTC"
        : (process.env.BTCPAYSERVER_USDC_METHOD ?? "ETH_USDC20");
    const response = await fetch(
      `${BTCPAY_URL}/api/v1/stores/${BTCPAY_STORE}/invoices`,
      {
        method: "POST",
        headers: {
          Authorization: `token ${BTCPAY_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: (amountCents / 100).toFixed(2),
          currency: "USD",
          metadata: { orderId },
          checkout: {
            paymentMethods: [paymentMethod],
            expirationMinutes: 30,
          },
        }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`BTCPayServer ${response.status}: ${text}`);
    }

    const invoice = await response.json() as {
      id: string;
      checkoutLink: string;
      expirationTime: number;
      paymentMethodDetails?: Array<{ destination: string; due: string }>;
    };

    const payMethodDetails = invoice.paymentMethodDetails ?? [];
    const payMethod = payMethodDetails[0] ?? { destination: "", due: "0" };
    const address = payMethod.destination;
    const amount = payMethod.due;

    const qrPaymentUri =
      currency === "BTC"
        ? `bitcoin:${address}?amount=${amount}`
        : `ethereum:${address}?value=${amount}`;

    return {
      invoiceId: invoice.id,
      paymentUrl: invoice.checkoutLink,
      paymentAddress: address,
      currency,
      amount,
      amountCents,
      expiresAt: new Date(invoice.expirationTime * 1000),
      qrPaymentUri,
    };
  }

  async getInvoiceStatus(
    invoiceId: string
  ): Promise<"pending" | "confirmed" | "expired" | "failed"> {
    if (!this.isConfigured) {
      return "pending";
    }

    const response = await fetch(
      `${BTCPAY_URL}/api/v1/stores/${BTCPAY_STORE}/invoices/${invoiceId}`,
      { headers: { Authorization: `token ${BTCPAY_KEY}` } }
    );
    if (!response.ok) return "pending";

    const invoice = await response.json() as { status: string };
    if (invoice.status === "Settled" || invoice.status === "Complete") return "confirmed";
    if (invoice.status === "Expired") return "expired";
    if (invoice.status === "Invalid") return "failed";
    return "pending";
  }

  verifyWebhookSignature(
    rawBody: string | Buffer,
    signatureHeader: string
  ): boolean {
    // Fail CLOSED: a dedicated webhook secret is required, and we never reuse
    // the API key for it. No secret => reject every webhook. (Fork hardening:
    // the old code returned true here, letting anyone forge payment callbacks.)
    const secret = BTCPAY_WEBHOOK_SECRET;
    if (!secret) {
      console.warn(
        "[btcpay] Webhook rejected: BTCPAYSERVER_WEBHOOK_SECRET is not configured."
      );
      return false;
    }

    const hmac = createHmac("sha256", secret).update(rawBody).digest("hex");
    const expected = `sha256=${hmac}`;

    const incoming = signatureHeader.startsWith("sha256=")
      ? signatureHeader
      : `sha256=${signatureHeader}`;

    if (expected.length !== incoming.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(incoming));
  }
}

export const btcpayService = new BTCPayService();
