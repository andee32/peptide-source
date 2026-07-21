import { db } from "@atlab/db";
import {
  productsTable,
  productVariantsTable,
  batchesTable,
  coaResultsTable,
} from "@atlab/db/schema";
import { sql } from "drizzle-orm";

async function seed() {
  console.log("Seeding database...");

  await db.execute(sql`TRUNCATE TABLE coa_results, batches, product_variants, products RESTART IDENTITY CASCADE`);

  const products = await db
    .insert(productsTable)
    .values([
      {
        name: "Semaglutide",
        slug: "semaglutide",
        category: "metabolic",
        shortDescription:
          "GLP-1 receptor agonist for metabolic research protocols. Tri-verified for purity, endotoxin, and sterility.",
        longDescription:
          "Semaglutide is a glucagon-like peptide-1 (GLP-1) receptor agonist used extensively in metabolic research. Our research-grade Semaglutide undergoes tri-verified testing at Janoshik Analytical plus a secondary independent laboratory. Each batch is tested for HPLC purity, bacterial endotoxin (LAL), sterility, and a full heavy metals panel (ICP-MS). Released only at ≥98% purity with endotoxin <1 EU/mg.",
        featured: true,
        researchUses: [
          "GLP-1 receptor binding studies",
          "Metabolic rate and insulin sensitivity research",
          "Appetite regulation mechanism studies",
          "Longitudinal weight management protocols",
        ],
      },
      {
        name: "BPC-157",
        slug: "bpc-157",
        category: "recovery",
        shortDescription:
          "Body Protection Compound-157 for tissue repair and regeneration research. Sterility verified.",
        longDescription:
          "BPC-157 (Body Protection Compound) is a pentadecapeptide derived from human gastric juice, extensively studied for its cytoprotective and tissue healing properties. Our research-grade BPC-157 is synthesized via Fmoc solid-phase peptide synthesis and verified by RP-HPLC, mass spectrometry, and sterility testing. Heavy metals panel performed by ICP-MS.",
        featured: true,
        researchUses: [
          "Tendon and ligament healing studies",
          "Gastrointestinal mucosal protection research",
          "Angiogenesis and vascularization studies",
          "Neurological protection protocols",
        ],
      },
      {
        name: "Tirzepatide",
        slug: "tirzepatide",
        category: "metabolic",
        shortDescription:
          "Dual GIP/GLP-1 receptor agonist. Next-generation metabolic research peptide with dual-receptor binding.",
        longDescription:
          "Tirzepatide is a novel dual glucose-dependent insulinotropic polypeptide (GIP) and GLP-1 receptor agonist. As the most clinically relevant next-generation incretin mimetic, our research-grade Tirzepatide provides verified purity for advanced metabolic protocol research. Tri-verified: HPLC purity, LAL endotoxin, ICP-MS heavy metals.",
        featured: true,
        researchUses: [
          "Dual incretin receptor agonism studies",
          "Advanced GLP-1/GIP combination research",
          "Metabolic syndrome mechanistic studies",
          "Comparative incretin therapy protocols",
        ],
      },
      {
        name: "Retatrutide",
        slug: "retatrutide",
        category: "metabolic",
        shortDescription:
          "Triple agonist (GLP-1/GIP/Glucagon) for advanced metabolic research. Emerging class peptide.",
        longDescription:
          "Retatrutide is a triple agonist peptide targeting GLP-1, GIP, and glucagon receptors simultaneously. Represents the cutting edge of incretin-based metabolic research. Our research-grade batch undergoes the full Lab Standard tri-verification protocol including sterility testing — an industry rarity for this compound class.",
        featured: false,
        researchUses: [
          "Triple receptor agonism mechanistic studies",
          "Glucagon receptor contribution research",
          "Next-generation metabolic peptide protocols",
          "Comparative efficacy studies vs dual agonists",
        ],
      },
      {
        name: "Epithalon",
        slug: "epithalon",
        category: "longevity",
        shortDescription:
          "Tetrapeptide telomerase activator for longevity and aging research. Batch-verified purity.",
        longDescription:
          "Epithalon (Epitalon) is a synthetic tetrapeptide (Ala-Glu-Asp-Gly) studied for its role in telomere elongation and regulation of the pineal gland's melatonin production. Our research-grade Epithalon is verified by HPLC and mass spectrometry, with full heavy metals and endotoxin testing per batch.",
        featured: false,
        researchUses: [
          "Telomerase activation and telomere length studies",
          "Pineal gland and melatonin regulation research",
          "Cellular senescence and aging mechanism studies",
          "Longevity protocol research",
        ],
      },
    ])
    .returning();

  console.log(`Inserted ${products.length} products`);

  const variants = await db.insert(productVariantsTable).values([
    { productId: products[0].id, name: "2mg", concentration: "2mg/vial", sizeml: 1, priceCents: 3499, sku: "SEM-2MG-001", inStock: true },
    { productId: products[0].id, name: "5mg", concentration: "5mg/vial", sizeml: 1, priceCents: 6999, sku: "SEM-5MG-001", inStock: true },
    { productId: products[0].id, name: "10mg", concentration: "10mg/vial", sizeml: 1, priceCents: 11999, sku: "SEM-10MG-001", inStock: true },
    { productId: products[1].id, name: "5mg", concentration: "5mg/vial", sizeml: 1, priceCents: 3999, sku: "BPC-5MG-001", inStock: true },
    { productId: products[1].id, name: "10mg", concentration: "10mg/vial", sizeml: 1, priceCents: 6999, sku: "BPC-10MG-001", inStock: true },
    { productId: products[2].id, name: "5mg", concentration: "5mg/vial", sizeml: 1, priceCents: 8999, sku: "TIR-5MG-001", inStock: true },
    { productId: products[2].id, name: "10mg", concentration: "10mg/vial", sizeml: 1, priceCents: 15999, sku: "TIR-10MG-001", inStock: true },
    { productId: products[3].id, name: "2mg", concentration: "2mg/vial", sizeml: 1, priceCents: 7999, sku: "RET-2MG-001", inStock: true },
    { productId: products[4].id, name: "10mg", concentration: "10mg/vial", sizeml: 1, priceCents: 4999, sku: "EPI-10MG-001", inStock: true },
    { productId: products[4].id, name: "20mg", concentration: "20mg/vial", sizeml: 1, priceCents: 8499, sku: "EPI-20MG-001", inStock: true },
  ]).returning();

  console.log(`Inserted ${variants.length} variants`);

  const now = new Date();
  const batches = await db.insert(batchesTable).values([
    {
      id: "SEM-2025-001",
      productId: products[0].id,
      status: "released",
      productionDate: new Date("2025-01-15"),
      notes: "Standard production batch. Full tri-verification completed.",
    },
    {
      id: "BPC-2025-001",
      productId: products[1].id,
      status: "released",
      productionDate: new Date("2025-01-20"),
      notes: "Released batch. Passed all testing criteria.",
    },
    {
      id: "TIR-2025-001",
      productId: products[2].id,
      status: "released",
      productionDate: new Date("2025-02-01"),
      notes: "First production batch of Tirzepatide. Exceptional purity result.",
    },
    {
      id: "RET-2025-001",
      productId: products[3].id,
      status: "pending",
      productionDate: new Date("2025-02-10"),
      notes: "Awaiting secondary lab confirmation.",
    },
    {
      id: "EPI-2025-001",
      productId: products[4].id,
      status: "released",
      productionDate: new Date("2025-01-05"),
      notes: "Longevity series batch. Clean heavy metals panel.",
    },
  ]).returning();

  console.log(`Inserted ${batches.length} batches`);

  const coaData = [
    {
      id: "COA-SEM-2025-001-PUR",
      batchId: "SEM-2025-001",
      testType: "purity" as const,
      purityPercent: 99.2,
      labName: "Janoshik Analytical",
      testedAt: new Date("2025-01-18"),
      janoshikTaskId: "JAN-84921",
    },
    {
      id: "COA-SEM-2025-001-END",
      batchId: "SEM-2025-001",
      testType: "endotoxin" as const,
      endotoxinEuPerMl: 0.24,
      labName: "Janoshik Analytical",
      testedAt: new Date("2025-01-18"),
      janoshikTaskId: "JAN-84922",
    },
    {
      id: "COA-SEM-2025-001-STE",
      batchId: "SEM-2025-001",
      testType: "sterility" as const,
      sterilityPass: true,
      labName: "Janoshik Analytical",
      testedAt: new Date("2025-01-18"),
      janoshikTaskId: "JAN-84923",
    },
    {
      id: "COA-SEM-2025-001-HM",
      batchId: "SEM-2025-001",
      testType: "heavyMetals" as const,
      heavyMetals: [
        { element: "Lead (Pb)", resultPpm: 0.02, limitPpm: 0.5, pass: true },
        { element: "Arsenic (As)", resultPpm: 0.01, limitPpm: 0.5, pass: true },
        { element: "Mercury (Hg)", resultPpm: 0.001, limitPpm: 0.1, pass: true },
        { element: "Cadmium (Cd)", resultPpm: 0.003, limitPpm: 0.2, pass: true },
      ],
      labName: "Janoshik Analytical",
      testedAt: new Date("2025-01-18"),
      janoshikTaskId: "JAN-84924",
    },
    {
      id: "COA-BPC-2025-001-PUR",
      batchId: "BPC-2025-001",
      testType: "purity" as const,
      purityPercent: 98.7,
      labName: "Janoshik Analytical",
      testedAt: new Date("2025-01-22"),
      janoshikTaskId: "JAN-85012",
    },
    {
      id: "COA-BPC-2025-001-END",
      batchId: "BPC-2025-001",
      testType: "endotoxin" as const,
      endotoxinEuPerMl: 0.18,
      labName: "Janoshik Analytical",
      testedAt: new Date("2025-01-22"),
      janoshikTaskId: "JAN-85013",
    },
    {
      id: "COA-BPC-2025-001-STE",
      batchId: "BPC-2025-001",
      testType: "sterility" as const,
      sterilityPass: true,
      labName: "Janoshik Analytical",
      testedAt: new Date("2025-01-22"),
      janoshikTaskId: "JAN-85014",
    },
    {
      id: "COA-BPC-2025-001-HM",
      batchId: "BPC-2025-001",
      testType: "heavyMetals" as const,
      heavyMetals: [
        { element: "Lead (Pb)", resultPpm: 0.03, limitPpm: 0.5, pass: true },
        { element: "Arsenic (As)", resultPpm: 0.02, limitPpm: 0.5, pass: true },
        { element: "Mercury (Hg)", resultPpm: 0.002, limitPpm: 0.1, pass: true },
        { element: "Cadmium (Cd)", resultPpm: 0.001, limitPpm: 0.2, pass: true },
      ],
      labName: "Janoshik Analytical",
      testedAt: new Date("2025-01-22"),
      janoshikTaskId: "JAN-85015",
    },
    {
      id: "COA-TIR-2025-001-PUR",
      batchId: "TIR-2025-001",
      testType: "purity" as const,
      purityPercent: 99.5,
      labName: "Janoshik Analytical",
      testedAt: new Date("2025-02-04"),
      janoshikTaskId: "JAN-86231",
    },
    {
      id: "COA-TIR-2025-001-END",
      batchId: "TIR-2025-001",
      testType: "endotoxin" as const,
      endotoxinEuPerMl: 0.31,
      labName: "Janoshik Analytical",
      testedAt: new Date("2025-02-04"),
      janoshikTaskId: "JAN-86232",
    },
    {
      id: "COA-TIR-2025-001-STE",
      batchId: "TIR-2025-001",
      testType: "sterility" as const,
      sterilityPass: true,
      labName: "Janoshik Analytical",
      testedAt: new Date("2025-02-04"),
      janoshikTaskId: "JAN-86233",
    },
    {
      id: "COA-TIR-2025-001-HM",
      batchId: "TIR-2025-001",
      testType: "heavyMetals" as const,
      heavyMetals: [
        { element: "Lead (Pb)", resultPpm: 0.01, limitPpm: 0.5, pass: true },
        { element: "Arsenic (As)", resultPpm: 0.01, limitPpm: 0.5, pass: true },
        { element: "Mercury (Hg)", resultPpm: 0.001, limitPpm: 0.1, pass: true },
        { element: "Cadmium (Cd)", resultPpm: 0.002, limitPpm: 0.2, pass: true },
      ],
      labName: "Janoshik Analytical",
      testedAt: new Date("2025-02-04"),
      janoshikTaskId: "JAN-86234",
    },
    {
      id: "COA-EPI-2025-001-PUR",
      batchId: "EPI-2025-001",
      testType: "purity" as const,
      purityPercent: 98.1,
      labName: "Janoshik Analytical",
      testedAt: new Date("2025-01-08"),
      janoshikTaskId: "JAN-83455",
    },
    {
      id: "COA-EPI-2025-001-END",
      batchId: "EPI-2025-001",
      testType: "endotoxin" as const,
      endotoxinEuPerMl: 0.42,
      labName: "Janoshik Analytical",
      testedAt: new Date("2025-01-08"),
      janoshikTaskId: "JAN-83456",
    },
    {
      id: "COA-EPI-2025-001-HM",
      batchId: "EPI-2025-001",
      testType: "heavyMetals" as const,
      heavyMetals: [
        { element: "Lead (Pb)", resultPpm: 0.04, limitPpm: 0.5, pass: true },
        { element: "Arsenic (As)", resultPpm: 0.03, limitPpm: 0.5, pass: true },
        { element: "Mercury (Hg)", resultPpm: 0.003, limitPpm: 0.1, pass: true },
        { element: "Cadmium (Cd)", resultPpm: 0.002, limitPpm: 0.2, pass: true },
      ],
      labName: "Janoshik Analytical",
      testedAt: new Date("2025-01-08"),
      janoshikTaskId: "JAN-83457",
    },
  ];

  const coas = await db.insert(coaResultsTable).values(coaData).returning();
  console.log(`Inserted ${coas.length} COA results`);
  console.log("Seed complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
