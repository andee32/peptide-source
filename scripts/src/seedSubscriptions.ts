import { db } from "@app/db";
import {
  subscriptionPlansTable,
  subscriptionsTable,
  subscriptionEventsTable,
} from "@app/db/schema";
import { sql } from "drizzle-orm";

// Plan bundles contain research materials only. Reconstitution and injection
// consumables (bacteriostatic water, syringes, swabs) must never be bundled with
// a peptide: FDA treats their presence alongside a product as evidence of human
// intended use, which defeats the RUO posture the whole platform depends on.
async function seedSubscriptions() {
  console.log("Seeding subscription plans...");

  await db.execute(
    sql`TRUNCATE TABLE subscription_events, subscriptions, subscription_plans RESTART IDENTITY CASCADE`
  );

  const plans = await db
    .insert(subscriptionPlansTable)
    .values([
      {
        name: "Incretin Receptor Assay Kit",
        slug: "incretin-receptor-assay-kit",
        description:
          "Recurring supply for in-vitro incretin receptor work. Includes one 5mg Semaglutide vial per interval. For laboratory research use only \u2014 not for human or veterinary use.",
        intervalDays: 30,
        productBundle: [{ productId: 1, name: "Semaglutide 5mg", qty: 1 }],
        pricePerIntervalCents: 8499,
        featured: 1,
      },
      {
        name: "Longevity Starter Kit",
        slug: "longevity-starter-kit",
        description:
          "Recurring supply of Epithalon 20mg and BPC-157 5mg for in-vitro telomere and cell-migration assays. For laboratory research use only \u2014 not for human or veterinary use.",
        intervalDays: 60,
        productBundle: [
          { productId: 5, name: "Epithalon 20mg", qty: 1 },
          { productId: 2, name: "BPC-157 5mg", qty: 1 },
        ],
        pricePerIntervalCents: 14499,
        featured: 1,
      },
      {
        name: "Dual Agonist Assay Kit",
        slug: "dual-agonist-assay-kit",
        description:
          "Recurring supply of Tirzepatide 5mg for comparative in-vitro dual-receptor binding assays. For laboratory research use only \u2014 not for human or veterinary use.",
        intervalDays: 90,
        productBundle: [{ productId: 3, name: "Tirzepatide 5mg", qty: 1 }],
        pricePerIntervalCents: 10999,
        featured: 0,
      },
    ])
    .returning();

  console.log(`Inserted ${plans.length} subscription plans`);

  const futureDate30 = new Date();
  futureDate30.setDate(futureDate30.getDate() + 30);
  const futureDate60 = new Date();
  futureDate60.setDate(futureDate60.getDate() + 60);

  const subs = await db
    .insert(subscriptionsTable)
    .values([
      {
        customerEmail: "researcher@example.com",
        customerName: "Dr. A. Researcher",
        planId: plans[0].id,
        status: "active",
        intervalDays: 30,
        nextBillingDate: futureDate30,
        shippingAddress: {
          name: "Dr. A. Researcher",
          address1: "123 Lab Way",
          city: "Boston",
          state: "MA",
          zip: "02101",
          country: "US",
        },
      },
      {
        customerEmail: "longevity@example.com",
        customerName: "J. Smith",
        planId: plans[1].id,
        status: "active",
        intervalDays: 60,
        nextBillingDate: futureDate60,
        shippingAddress: {
          name: "J. Smith",
          address1: "456 Science Blvd",
          city: "San Francisco",
          state: "CA",
          zip: "94102",
          country: "US",
        },
      },
    ])
    .returning();

  console.log(`Inserted ${subs.length} demo subscriptions`);

  await db.insert(subscriptionEventsTable).values([
    {
      subscriptionId: subs[0].id,
      eventType: "created",
      metadata: { planName: plans[0].name },
    },
    {
      subscriptionId: subs[1].id,
      eventType: "created",
      metadata: { planName: plans[1].name },
    },
  ]);

  console.log("Subscription seed complete!");
  process.exit(0);
}

seedSubscriptions().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
