import { createHmac, timingSafeEqual } from "crypto";
import { PaymentRailUnavailableError } from "./btcpay";

// Pay by Bank (Link Money) — open-banking ACH debit initiated by the buyer in
// Link's hosted flow. This is a bank rail, NOT a card processor: it stays inside
// the crypto + ACH/wire/Zelle invariant. Never add Stripe/PayPal/Square here.
//
// Two auth schemes, both from the same merchant-portal credentials:
//   * POST /v2/sessions  — HTTP Basic (client id : secret)
//   * everything else    — Bearer token from POST /v1/tokens (client_credentials)
// Docs: https://developer.link.money/quickstart/

const SANDBOX_BASE_URL = "https://api.link-sandbox.money";
const PRODUCTION_BASE_URL = "https://api.link.money";

/** Link's own verdict on a transaction. Only SUCCEEDED means money moved. */
export type LinkTransactionStatus =
  | "CREATED"
  | "PENDING"
  | "AUTHORIZED"
  | "SCHEDULED"
  | "INITIATED"
  | "SUCCEEDED"
  | "RETRYABLE_FAILED"
  | "TERMINAL_FAILED"
  | "CANCELED";

export interface LinkSession {
  sessionKey: string;
  sessionUrl: string;
  requestKey: string;
}

export interface LinkTransaction {
  transactionId: string;
  transactionStatus: LinkTransactionStatus;
  clientReferenceId?: string;
  customerId?: string;
  amount?: { value: number; currency: string };
  accountDetails?: { accountLastFourDigits?: string };
  transactionFailureReason?: { code?: string; description?: string };
}

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

/** Sandbox unless explicitly set to production — never default to real money. */
export function linkMoneyBaseUrl(): string {
  return env("LINKMONEY_ENVIRONMENT") === "production"
    ? PRODUCTION_BASE_URL
    : SANDBOX_BASE_URL;
}

export function linkMoneyEnvironment(): "production" | "sandbox" {
  return env("LINKMONEY_ENVIRONMENT") === "production" ? "production" : "sandbox";
}

/**
 * True only when the rail can actually be used end to end. The webhook secret is
 * part of the gate, not an extra: a Pay by Bank debit settles asynchronously, so
 * without a verifiable callback we would have no trustworthy way to learn that a
 * payment succeeded or was returned.
 */
export function isLinkMoneyProvisioned(): boolean {
  return !!(
    env("LINKMONEY_CLIENT_ID") &&
    env("LINKMONEY_CLIENT_SECRET") &&
    env("LINKMONEY_WEBHOOK_SECRET") &&
    env("LINKMONEY_REDIRECT_URL")
  );
}

interface CachedToken {
  token: string;
  expiresAt: number;
}
const tokenCache = new Map<string, CachedToken>();

/** M2M access token for the v1 APIs. Cached until shortly before it expires. */
async function getAccessToken(scope: "Link-Core" | "Link-Payment"): Promise<string> {
  const cached = tokenCache.get(scope);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const clientId = env("LINKMONEY_CLIENT_ID");
  const clientSecret = env("LINKMONEY_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new PaymentRailUnavailableError();

  const response = await fetch(`${linkMoneyBaseUrl()}/v1/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope,
      grant_type: "client_credentials",
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Link Money token ${response.status}: ${await response.text()}`);
  }

  const body = (await response.json()) as {
    access_token: string;
    expires_in?: number;
  };
  // Renew a minute early so an in-flight request cannot be rejected mid-call.
  const ttlMs = Math.max(60, (body.expires_in ?? 3600) - 60) * 1000;
  tokenCache.set(scope, { token: body.access_token, expiresAt: Date.now() + ttlMs });
  return body.access_token;
}

/** Test seam: drops the cached tokens. */
export function resetLinkMoneyTokenCache(): void {
  tokenCache.clear();
}

export class LinkMoneyService {
  get configured(): boolean {
    return isLinkMoneyProvisioned();
  }

  /**
   * Opens a Pay by Bank session for one order and asks Link to initiate the
   * debit as soon as the buyer finishes linking, so we never hold bank
   * credentials or account numbers ourselves.
   *
   * `requestKey` is Link's idempotency key: replaying it can never debit the
   * buyer twice. It is derived from our payment-record id for that reason, and
   * `clientReferenceId` carries our order id back on every webhook.
   */
  async createSession(input: {
    orderId: string;
    paymentRecordId: string;
    amountCents: number;
    firstName: string;
    lastName: string;
    email: string;
    guestCheckout: boolean;
    customerRef: string;
  }): Promise<LinkSession> {
    if (!this.configured) throw new PaymentRailUnavailableError();

    const clientId = env("LINKMONEY_CLIENT_ID")!;
    const clientSecret = env("LINKMONEY_CLIENT_SECRET")!;
    const redirectUrl = env("LINKMONEY_REDIRECT_URL")!;
    const amount = { value: Number((input.amountCents / 100).toFixed(2)), currency: "USD" };

    const response = await fetch(`${linkMoneyBaseUrl()}/v2/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: JSON.stringify({
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        orderDetails: { totalAmount: amount },
        customerProfile: { id: input.customerRef, guestCheckout: input.guestCheckout },
        paymentDetails: {
          amount,
          requestKey: input.paymentRecordId,
          softDescriptor: (env("LINKMONEY_SOFT_DESCRIPTOR") ?? "RESEARCH SUPPLY").slice(0, 22),
          clientReferenceId: input.orderId,
        },
        redirectUrl,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`Link Money session ${response.status}: ${await response.text()}`);
    }

    const body = (await response.json()) as { sessionKey?: string; sessionUrl?: string };
    if (!body.sessionKey || !body.sessionUrl) {
      throw new Error("Link Money session response missing sessionKey/sessionUrl");
    }
    return {
      sessionKey: body.sessionKey,
      sessionUrl: body.sessionUrl,
      requestKey: input.paymentRecordId,
    };
  }

  /**
   * Authoritative transaction snapshot, read back from Link Money.
   *
   * Deliberately throws rather than returning a "pending"-shaped fallback: a
   * network blip must not be indistinguishable from a genuine non-payment, or a
   * settlement decision could be made on a state we never observed.
   */
  async getTransaction(transactionId: string): Promise<LinkTransaction> {
    if (!this.configured) throw new PaymentRailUnavailableError();

    const token = await getAccessToken("Link-Payment");
    const response = await fetch(
      `${linkMoneyBaseUrl()}/v1/transactions/${encodeURIComponent(transactionId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(10_000),
      }
    );

    if (!response.ok) {
      throw new Error(`Link Money transaction ${response.status}: ${await response.text()}`);
    }
    return (await response.json()) as LinkTransaction;
  }

  /**
   * Verifies an inbound webhook against the secretKey registered with
   * /v1/webhook/subscribe.
   *
   * Link's published docs do not specify the signature header or algorithm, so
   * both shapes seen in the wild are accepted: an HMAC-SHA256 of the raw body,
   * and the shared secret presented verbatim. Both are compared in constant
   * time, and an absent secret rejects everything — this fails CLOSED.
   *
   * This is only an authenticity check. Nothing settles on the payload alone;
   * the webhook route reads the transaction back from Link before moving money
   * state, so even a forged callback that passed here could not confirm an order.
   */
  verifyWebhookSignature(rawBody: string | Buffer, presented: string): boolean {
    const secret = env("LINKMONEY_WEBHOOK_SECRET");
    if (!secret) {
      console.warn(
        "[linkmoney] Webhook rejected: LINKMONEY_WEBHOOK_SECRET is not configured."
      );
      return false;
    }
    if (!presented) return false;

    const candidate = presented.startsWith("sha256=") ? presented.slice(7) : presented;
    const hmac = createHmac("sha256", secret).update(rawBody).digest("hex");

    return constantTimeEquals(candidate, hmac) || constantTimeEquals(candidate, secret);
  }
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export const linkMoneyService = new LinkMoneyService();
