import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import {
  LinkMoneyService,
  isLinkMoneyProvisioned,
  linkMoneyBaseUrl,
  linkMoneyEnvironment,
  resetLinkMoneyTokenCache,
} from "./linkMoney";
import { PaymentRailUnavailableError } from "./btcpay";

const LINK_VARS = [
  "LINKMONEY_ENVIRONMENT",
  "LINKMONEY_CLIENT_ID",
  "LINKMONEY_CLIENT_SECRET",
  "LINKMONEY_WEBHOOK_SECRET",
  "LINKMONEY_REDIRECT_URL",
  "LINKMONEY_SOFT_DESCRIPTOR",
] as const;

const original = new Map<string, string | undefined>();

function provision(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    LINKMONEY_CLIENT_ID: "client-id",
    LINKMONEY_CLIENT_SECRET: "client-secret",
    LINKMONEY_WEBHOOK_SECRET: "webhook-secret",
    LINKMONEY_REDIRECT_URL: "https://example.test/return",
    ...overrides,
  };
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

beforeEach(() => {
  for (const key of LINK_VARS) {
    original.set(key, process.env[key]);
    delete process.env[key];
  }
  resetLinkMoneyTokenCache();
});

afterEach(() => {
  for (const key of LINK_VARS) {
    const v = original.get(key);
    if (v === undefined) delete process.env[key];
    else process.env[key] = v;
  }
  vi.unstubAllGlobals();
});

describe("environment selection", () => {
  it("defaults to sandbox when unset or unrecognised", () => {
    expect(linkMoneyEnvironment()).toBe("sandbox");
    expect(linkMoneyBaseUrl()).toBe("https://api.link-sandbox.money");

    process.env.LINKMONEY_ENVIRONMENT = "prod";
    expect(linkMoneyBaseUrl()).toBe("https://api.link-sandbox.money");
  });

  it("selects production only on an exact match", () => {
    process.env.LINKMONEY_ENVIRONMENT = "production";
    expect(linkMoneyEnvironment()).toBe("production");
    expect(linkMoneyBaseUrl()).toBe("https://api.link.money");
  });
});

describe("provisioning", () => {
  it("is unprovisioned until every credential is present", () => {
    expect(isLinkMoneyProvisioned()).toBe(false);

    provision({ LINKMONEY_WEBHOOK_SECRET: undefined });
    expect(isLinkMoneyProvisioned()).toBe(false);

    provision({ LINKMONEY_REDIRECT_URL: undefined });
    expect(isLinkMoneyProvisioned()).toBe(false);

    provision();
    expect(isLinkMoneyProvisioned()).toBe(true);
  });

  it("treats whitespace-only values as unset", () => {
    provision({ LINKMONEY_CLIENT_SECRET: "   " });
    expect(isLinkMoneyProvisioned()).toBe(false);
  });

  it("refuses to create a session while unprovisioned", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new LinkMoneyService().createSession({
        orderId: "order-1",
        paymentRecordId: "rec-1",
        amountCents: 1000,
        firstName: "A",
        lastName: "B",
        email: "a@example.test",
        guestCheckout: true,
        customerRef: "a@example.test",
      })
    ).rejects.toBeInstanceOf(PaymentRailUnavailableError);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("createSession", () => {
  it("derives the request server-side and never leaks the secret into the body", async () => {
    provision();
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ sessionKey: "sk_1", sessionUrl: "https://link.test/s/1" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const session = await new LinkMoneyService().createSession({
      orderId: "order-1",
      paymentRecordId: "rec-1",
      amountCents: 12_345,
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.test",
      guestCheckout: true,
      customerRef: "ada@example.test",
    });

    expect(session).toEqual({
      sessionKey: "sk_1",
      sessionUrl: "https://link.test/s/1",
      requestKey: "rec-1",
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.link-sandbox.money/v2/sessions");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from("client-id:client-secret").toString("base64")}`
    );

    const body = JSON.parse(init.body as string);
    expect(body.paymentDetails.amount).toEqual({ value: 123.45, currency: "USD" });
    expect(body.orderDetails.totalAmount).toEqual({ value: 123.45, currency: "USD" });
    // requestKey is Link's idempotency key; clientReferenceId is how webhooks
    // find the order again.
    expect(body.paymentDetails.requestKey).toBe("rec-1");
    expect(body.paymentDetails.clientReferenceId).toBe("order-1");
    expect(body.redirectUrl).toBe("https://example.test/return");
    expect(init.body as string).not.toContain("client-secret");
  });

  it("truncates the soft descriptor to the 22-character bank limit", async () => {
    provision({ LINKMONEY_SOFT_DESCRIPTOR: "A".repeat(40) });
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ sessionKey: "sk", sessionUrl: "u" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await new LinkMoneyService().createSession({
      orderId: "o",
      paymentRecordId: "r",
      amountCents: 100,
      firstName: "A",
      lastName: "B",
      email: "a@example.test",
      guestCheckout: false,
      customerRef: "cust-1",
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string
    );
    expect(body.paymentDetails.softDescriptor).toHaveLength(22);
  });

  it("throws when Link responds without a session url", async () => {
    provision();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ sessionKey: "sk" }), { status: 200 }))
    );

    await expect(
      new LinkMoneyService().createSession({
        orderId: "o",
        paymentRecordId: "r",
        amountCents: 100,
        firstName: "A",
        lastName: "B",
        email: "a@example.test",
        guestCheckout: true,
        customerRef: "c",
      })
    ).rejects.toThrow(/sessionKey\/sessionUrl/);
  });
});

describe("verifyWebhookSignature", () => {
  const body = JSON.stringify({ eventType: "payment.succeeded" });

  it("rejects everything when no secret is configured", () => {
    const service = new LinkMoneyService();
    const hmac = createHmac("sha256", "webhook-secret").update(body).digest("hex");
    expect(service.verifyWebhookSignature(body, hmac)).toBe(false);
  });

  it("accepts an HMAC over the raw body, with or without the sha256= prefix", () => {
    provision();
    const service = new LinkMoneyService();
    const hmac = createHmac("sha256", "webhook-secret").update(body).digest("hex");

    expect(service.verifyWebhookSignature(body, hmac)).toBe(true);
    expect(service.verifyWebhookSignature(body, `sha256=${hmac}`)).toBe(true);
    expect(service.verifyWebhookSignature(Buffer.from(body), hmac)).toBe(true);
  });

  it("accepts the shared secret presented verbatim", () => {
    provision();
    expect(new LinkMoneyService().verifyWebhookSignature(body, "webhook-secret")).toBe(true);
  });

  it("rejects an empty, wrong-secret, or wrong-body signature", () => {
    provision();
    const service = new LinkMoneyService();

    expect(service.verifyWebhookSignature(body, "")).toBe(false);
    expect(
      service.verifyWebhookSignature(
        body,
        createHmac("sha256", "other-secret").update(body).digest("hex")
      )
    ).toBe(false);
    expect(
      service.verifyWebhookSignature(
        body,
        createHmac("sha256", "webhook-secret").update("{}").digest("hex")
      )
    ).toBe(false);
  });
});

describe("getTransaction", () => {
  it("sends a bearer token fetched with the Link-Payment scope, and caches it", async () => {
    provision();
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/v1/tokens")) {
        return new Response(
          JSON.stringify({ access_token: "tok", expires_in: 3600, token_type: "Bearer" }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({ transactionId: "t1", transactionStatus: "SUCCEEDED" }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = new LinkMoneyService();
    const first = await service.getTransaction("t1");
    await service.getTransaction("t1");

    expect(first.transactionStatus).toBe("SUCCEEDED");
    const tokenCalls = fetchMock.mock.calls.filter(([u]) =>
      (u as string).endsWith("/v1/tokens")
    );
    expect(tokenCalls).toHaveLength(1);
    const scope = new URLSearchParams(
      (tokenCalls[0] as unknown as [string, RequestInit])[1].body as unknown as string
    );
    expect(scope.get("scope")).toBe("Link-Payment");
    expect(scope.get("grant_type")).toBe("client_credentials");
  });

  it("throws rather than reporting a pending-looking status when Link errors", async () => {
    provision();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/v1/tokens")
          ? new Response(JSON.stringify({ access_token: "tok" }), { status: 200 })
          : new Response("upstream down", { status: 500 })
      )
    );

    await expect(new LinkMoneyService().getTransaction("t1")).rejects.toThrow(/500/);
  });
});
