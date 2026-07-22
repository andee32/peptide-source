import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "@atlab/db";
import { ordersTable, orderAttestationsTable } from "@atlab/db/schema";
import { startTestServer, type TestServer } from "./helpers/server";
import { resetDb } from "./helpers/db";
import { makeVariant, orderPayload } from "./helpers/factories";

// Pins two non-negotiables at once:
//   1. Prices are ALWAYS server-derived — the client never sends a price.
//   2. Every order writes its RUO attestation in the same transaction, and an
//      unaffirmed order writes nothing at all.

let server: TestServer;

before(async () => {
  server = await startTestServer();
});
after(async () => {
  await server.close();
});
beforeEach(async () => {
  await resetDb();
});

async function createOrder(body: unknown) {
  return fetch(`${server.url}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("ignores client-supplied prices and derives them from the catalog", async () => {
  const { variant } = await makeVariant({ priceCents: 25_000 });

  // Every price field an attacker might hope is trusted.
  const res = await createOrder(
    orderPayload(variant.id, {
      lineItems: [{ variantId: variant.id, quantity: 2, unitPriceCents: 1 }],
      unitPriceCents: 1,
      subtotalCents: 1,
      discountCents: 999_999,
      totalCents: 1,
    })
  );

  assert.equal(res.status, 201);
  const body = (await res.json()) as {
    id: string;
    subtotalCents: number;
    discountCents: number;
    totalCents: number;
  };

  // 2 x 25000 = 50000, less the 10% retail crypto discount.
  assert.equal(body.subtotalCents, 50_000);
  assert.equal(body.discountCents, 5_000);
  assert.equal(body.totalCents, 45_000);

  const persisted = await db.query.ordersTable.findFirst({
    where: eq(ordersTable.id, body.id),
  });
  assert.equal(persisted?.subtotalCents, 50_000);
  assert.equal(persisted?.totalCents, 45_000);
});

test("writes exactly one RUO attestation bound to the order", async () => {
  const { variant } = await makeVariant();

  const res = await createOrder(orderPayload(variant.id));
  assert.equal(res.status, 201);
  const { id } = (await res.json()) as { id: string };

  const attestations = await db
    .select()
    .from(orderAttestationsTable)
    .where(eq(orderAttestationsTable.orderId, id));

  assert.equal(attestations.length, 1);
  assert.equal(attestations[0].ruoAffirmed, true);
  assert.equal(attestations[0].signerName, "Test Signer");
  assert.ok(
    attestations[0].attestationText.length > 0,
    "attestation text must be persisted, not just a boolean"
  );
});

test("rejects an unaffirmed order and writes nothing", async () => {
  const { variant } = await makeVariant();

  const res = await createOrder(
    orderPayload(variant.id, { ruoAffirmed: false })
  );

  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as { error: string }).error, "ruo_not_affirmed");

  assert.equal((await db.select().from(ordersTable)).length, 0);
  assert.equal((await db.select().from(orderAttestationsTable)).length, 0);
});

test("rejects a compliance-blocked SKU", async () => {
  const { variant } = await makeVariant({ complianceStatus: "blocked" });

  const res = await createOrder(orderPayload(variant.id));

  assert.equal(res.status, 422);
  assert.equal(((await res.json()) as { code: string }).code, "SKU_NOT_AVAILABLE");
  assert.equal((await db.select().from(ordersTable)).length, 0);
});
