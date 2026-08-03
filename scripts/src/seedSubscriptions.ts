import { db } from "@app/db";
import {
  subscriptionPlansTable,
  subscriptionsTable,
  subscriptionEventsTable,
} from "@app/db/schema";
import { sql } from "drizzle-orm";

async function seedSubscriptions() {
  console.log("Seeding subscription plans...");

  await db.execute(
    sql`TRUNCATE TABLE subscription_events, subscriptions, subscription_plans RESTART IDENTITY CASCADE`
  );

  const plans = await db
    .insert(subscriptionPlansTable)
    .values([
      {
        name: "GLP-1 Metabolic Kit",
        slug: "glp1-metabolic-kit",
        description:
          "The complete GLP-1 research protocol bundle. Includes one 5mg Semaglutide vial, bacteriostatic water (30mL), 10x insulin syringes (1cc/27g), and 10x alcohol swabs. Designed for 30-90 day research protocols targeting metabolic function and GLP-1 receptor binding studies.",
        intervalDays: 30,
        productBundle: [
          { productId: 1, name: "Semaglutide 5mg", qty: 1 },
          { name: "Bacteriostatic Water 30mL", qty: 1 },
          { name: "Insulin Syringes 1cc/27g x10", qty: 1 },
          { name: "Alcohol Swabs x10", qty: 1 },
        ],
        pricePerIntervalCents: 8499,
        featured: 1,
      },
      {
        name: "Longevity Starter Kit",
        slug: "longevity-starter-kit",
        description:
          "The foundational longevity research bundle. Includes Epithalon 20mg plus BPC-157 5mg for combined telomere and tissue regeneration research. Includes bacteriostatic water (30mL), syringes, and swabs. Ideal for researchers studying longevity pathways and cellular repair mechanisms.",
        intervalDays: 60,
        productBundle: [
          { productId: 5, name: "Epithalon 20mg", qty: 1 },
          { productId: 2, name: "BPC-157 5mg", qty: 1 },
          { name: "Bacteriostatic Water 30mL", qty: 2 },
          { name: "Insulin Syringes 1cc/27g x10", qty: 2 },
          { name: "Alcohol Swabs x10", qty: 2 },
        ],
        pricePerIntervalCents: 14499,
        featured: 1,
      },
      {
        name: "Next-Gen Metabolic Kit",
        slug: "next-gen-metabolic-kit",
        description:
          "For researchers working with next-generation dual or triple agonist peptides. Includes Tirzepatide 5mg, bacteriostatic water (30mL), 10x syringes, and swabs. Optimal for comparative metabolic research protocols and dual-receptor binding studies.",
        intervalDays: 90,
        productBundle: [
          { productId: 3, name: "Tirzepatide 5mg", qty: 1 },
          { name: "Bacteriostatic Water 30mL", qty: 1 },
          { name: "Insulin Syringes 1cc/27g x10", qty: 1 },
          { name: "Alcohol Swabs x10", qty: 1 },
        ],
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
