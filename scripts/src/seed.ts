import { db } from "@atlab/db";
import {
  productsTable,
  productVariantsTable,
  batchesTable,
  coaResultsTable,
  priceTiersTable,
  priceListEntriesTable,
} from "@atlab/db/schema";
import { sql } from "drizzle-orm";

type VariantSeed = { name: string; priceCents: number; sku: string };
type ProductSeed = {
  name: string;
  slug: string;
  category: "metabolic" | "longevity" | "recovery" | "cognitive" | "other";
  sourcingPath: "usa_domestic" | "asia_warehouse";
  shortDescription: string;
  featured?: boolean;
  researchUses: string[];
  variants: VariantSeed[];
};

// Every product is sold as a 10-vial KIT. priceCents = wholesale base price per kit.
const CATALOG: ProductSeed[] = [
  // ---- GLP-1 / metabolic (asia_warehouse) ----
  {
    name: "Tirzepatide",
    slug: "tirzepatide",
    category: "metabolic",
    sourcingPath: "asia_warehouse",
    shortDescription:
      "Dual GIP/GLP-1 receptor agonist supplied as a 10-vial wholesale kit for in-vitro incretin receptor research. For laboratory research use only.",
    featured: true,
    researchUses: [
      "Dual incretin (GIP/GLP-1) receptor binding assays",
      "In-vitro metabolic signaling studies",
    ],
    variants: [
      { name: "10mg", priceCents: 7500, sku: "TR10" },
      { name: "15mg", priceCents: 9000, sku: "TR15" },
      { name: "20mg", priceCents: 10000, sku: "TR20" },
      { name: "30mg", priceCents: 11500, sku: "TR30" },
    ],
  },
  {
    name: "Retatrutide",
    slug: "retatrutide",
    category: "metabolic",
    sourcingPath: "asia_warehouse",
    shortDescription:
      "Triple agonist (GLP-1/GIP/glucagon) 10-vial kit for in-vitro receptor characterization. For laboratory research use only.",
    featured: true,
    researchUses: [
      "Triple receptor agonism mechanistic assays",
      "Comparative in-vitro incretin studies",
    ],
    variants: [
      { name: "10mg", priceCents: 11500, sku: "RT10" },
      { name: "20mg", priceCents: 16000, sku: "RT20" },
      { name: "30mg", priceCents: 19000, sku: "RT30" },
    ],
  },
  {
    name: "Cagrilintide",
    slug: "cagrilintide",
    category: "metabolic",
    sourcingPath: "asia_warehouse",
    shortDescription:
      "Long-acting amylin analog 10-vial kit for in-vitro amylin receptor research. For laboratory research use only.",
    researchUses: [
      "Amylin receptor binding assays",
      "In-vitro peptide stability characterization",
    ],
    variants: [{ name: "10mg", priceCents: 19000, sku: "CG10" }],
  },

  // ---- Growth hormone (usa_domestic) ----
  {
    name: "Tesamorelin",
    slug: "tesamorelin",
    category: "other",
    sourcingPath: "usa_domestic",
    shortDescription:
      "GHRH analog 10-vial kit for in-vitro growth hormone axis research. For laboratory research use only.",
    researchUses: [
      "GHRH receptor binding assays",
      "In-vitro somatotroph signaling studies",
    ],
    variants: [
      { name: "5mg", priceCents: 11500, sku: "TS5" },
      { name: "10mg", priceCents: 19000, sku: "TS10" },
    ],
  },
  {
    name: "IGF-1 LR3",
    slug: "igf-1-lr3",
    category: "other",
    sourcingPath: "usa_domestic",
    shortDescription:
      "Long-arginine IGF-1 analog 10-vial kit for in-vitro growth factor research. For laboratory research use only.",
    researchUses: [
      "IGF-1 receptor binding assays",
      "In-vitro cell proliferation studies",
    ],
    variants: [{ name: "1mg", priceCents: 19500, sku: "IGF1" }],
  },
  {
    name: "Ipamorelin",
    slug: "ipamorelin",
    category: "other",
    sourcingPath: "usa_domestic",
    shortDescription:
      "Selective growth hormone secretagogue 10-vial kit for in-vitro receptor research. For laboratory research use only.",
    researchUses: [
      "Ghrelin/GHS-R receptor binding assays",
      "In-vitro secretagogue selectivity studies",
    ],
    variants: [{ name: "10mg", priceCents: 8500, sku: "IP10" }],
  },

  // ---- Healing / BPC (usa_domestic) ----
  {
    name: "BPC-157",
    slug: "bpc-157",
    category: "recovery",
    sourcingPath: "usa_domestic",
    shortDescription:
      "Body Protection Compound pentadecapeptide 10-vial kit for in-vitro tissue and angiogenesis research. For laboratory research use only.",
    featured: true,
    researchUses: [
      "In-vitro fibroblast and angiogenesis assays",
      "Cytoprotection mechanism studies",
    ],
    variants: [
      { name: "5mg", priceCents: 6000, sku: "BC5" },
      { name: "10mg", priceCents: 8500, sku: "BC10" },
    ],
  },
  {
    name: "TB-500",
    slug: "tb-500",
    category: "recovery",
    sourcingPath: "usa_domestic",
    shortDescription:
      "Thymosin beta-4 fragment 10-vial kit for in-vitro cell migration research. For laboratory research use only.",
    researchUses: [
      "In-vitro actin regulation assays",
      "Cell migration and wound-model studies",
    ],
    variants: [{ name: "10mg", priceCents: 15000, sku: "TB10" }],
  },
  {
    name: "Ara-290",
    slug: "ara-290",
    category: "recovery",
    sourcingPath: "usa_domestic",
    shortDescription:
      "Erythropoietin-derived peptide 10-vial kit for in-vitro tissue-protective receptor research. For laboratory research use only.",
    researchUses: [
      "Innate repair receptor binding assays",
      "In-vitro anti-inflammatory signaling studies",
    ],
    variants: [{ name: "10mg", priceCents: 7100, sku: "AR10" }],
  },
  {
    name: "KPV",
    slug: "kpv",
    category: "recovery",
    sourcingPath: "usa_domestic",
    shortDescription:
      "Alpha-MSH C-terminal tripeptide 10-vial kit for in-vitro anti-inflammatory research. For laboratory research use only.",
    researchUses: [
      "In-vitro NF-kB pathway assays",
      "Epithelial inflammation model studies",
    ],
    variants: [{ name: "10mg", priceCents: 7300, sku: "KPV10" }],
  },

  // ---- Neuropeptides (asia_warehouse) ----
  {
    name: "Selank",
    slug: "selank",
    category: "cognitive",
    sourcingPath: "asia_warehouse",
    shortDescription:
      "Tuftsin-derived heptapeptide 10-vial kit for in-vitro neuromodulation research. For laboratory research use only.",
    researchUses: [
      "In-vitro GABAergic signaling assays",
      "Neuropeptide stability characterization",
    ],
    variants: [{ name: "10mg", priceCents: 7700, sku: "SL10" }],
  },
  {
    name: "Adamax",
    slug: "adamax",
    category: "cognitive",
    sourcingPath: "asia_warehouse",
    shortDescription:
      "Semax-related neuropeptide 10-vial kit for in-vitro neurotrophic research. For laboratory research use only.",
    researchUses: [
      "In-vitro BDNF expression assays",
      "Neuronal culture signaling studies",
    ],
    variants: [{ name: "10mg", priceCents: 20000, sku: "AD10" }],
  },
  {
    name: "Wolverine",
    slug: "wolverine",
    category: "cognitive",
    sourcingPath: "asia_warehouse",
    shortDescription:
      "Neuropeptide research blend 10-vial kit for in-vitro neuromodulation studies. For laboratory research use only.",
    researchUses: [
      "In-vitro neuropeptide co-signaling assays",
      "Comparative stability characterization",
    ],
    variants: [{ name: "10mg", priceCents: 10500, sku: "WV10" }],
  },

  // ---- Bioregulators (asia_warehouse) ----
  {
    name: "Thymalin",
    slug: "thymalin",
    category: "longevity",
    sourcingPath: "asia_warehouse",
    shortDescription:
      "Thymic peptide bioregulator 10-vial kit for in-vitro immunomodulation research. For laboratory research use only.",
    researchUses: [
      "In-vitro thymocyte differentiation assays",
      "Peptide bioregulator characterization",
    ],
    variants: [{ name: "10mg", priceCents: 8100, sku: "TM10" }],
  },
  {
    name: "Epithalon",
    slug: "epithalon",
    category: "longevity",
    sourcingPath: "asia_warehouse",
    shortDescription:
      "Ala-Glu-Asp-Gly tetrapeptide 10-vial kit for in-vitro telomere and senescence research. For laboratory research use only.",
    researchUses: [
      "In-vitro telomerase activation assays",
      "Cellular senescence model studies",
    ],
    variants: [{ name: "10mg", priceCents: 6500, sku: "EP10" }],
  },
  {
    name: "MOTS-c",
    slug: "mots-c",
    category: "longevity",
    sourcingPath: "asia_warehouse",
    shortDescription:
      "Mitochondrial-derived peptide 10-vial kit for in-vitro metabolic regulation research. For laboratory research use only.",
    researchUses: [
      "In-vitro AMPK signaling assays",
      "Mitochondrial function studies",
    ],
    variants: [
      { name: "10mg", priceCents: 7500, sku: "MC10" },
      { name: "40mg", priceCents: 19000, sku: "MC40" },
    ],
  },
  {
    name: "SS-31",
    slug: "ss-31",
    category: "longevity",
    sourcingPath: "asia_warehouse",
    shortDescription:
      "Mitochondria-targeting tetrapeptide (elamipretide) 10-vial kit for in-vitro cardiolipin research. For laboratory research use only.",
    researchUses: [
      "In-vitro cardiolipin binding assays",
      "Mitochondrial bioenergetics studies",
    ],
    variants: [{ name: "10mg", priceCents: 9500, sku: "SS10" }],
  },

  // ---- Copper (usa_domestic) ----
  {
    name: "GHK-Cu",
    slug: "ghk-cu",
    category: "recovery",
    sourcingPath: "usa_domestic",
    shortDescription:
      "Copper tripeptide-1 10-vial kit for in-vitro tissue remodeling and matrix research. For laboratory research use only.",
    featured: true,
    researchUses: [
      "In-vitro collagen synthesis assays",
      "Extracellular matrix remodeling studies",
    ],
    variants: [{ name: "50mg", priceCents: 5116, sku: "CU50" }],
  },
  {
    name: "AHK-Cu",
    slug: "ahk-cu",
    category: "recovery",
    sourcingPath: "usa_domestic",
    shortDescription:
      "Copper tripeptide AHK 10-vial kit for in-vitro angiogenesis and follicle research. For laboratory research use only.",
    researchUses: [
      "In-vitro angiogenesis assays",
      "Dermal fibroblast culture studies",
    ],
    variants: [{ name: "100mg", priceCents: 7700, sku: "AHK100" }],
  },

  // ---- Melanocortin (asia_warehouse) ----
  {
    name: "MT-1",
    slug: "mt-1",
    category: "other",
    sourcingPath: "asia_warehouse",
    shortDescription:
      "Melanotan-1 (afamelanotide analog) 10-vial kit for in-vitro melanocortin receptor research. For laboratory research use only.",
    researchUses: [
      "MC1R receptor binding assays",
      "In-vitro melanogenesis studies",
    ],
    variants: [{ name: "10mg", priceCents: 6000, sku: "MT1-10" }],
  },
  {
    name: "Melanotan-2",
    slug: "melanotan-2",
    category: "other",
    sourcingPath: "asia_warehouse",
    shortDescription:
      "Melanotan-2 cyclic heptapeptide 10-vial kit for in-vitro melanocortin research. For laboratory research use only.",
    researchUses: [
      "Non-selective melanocortin receptor assays",
      "In-vitro pigmentation model studies",
    ],
    variants: [{ name: "10mg", priceCents: 6000, sku: "MT2-10" }],
  },
  {
    name: "PT-141",
    slug: "pt-141",
    category: "other",
    sourcingPath: "asia_warehouse",
    shortDescription:
      "Bremelanotide melanocortin agonist 10-vial kit for in-vitro MC4R research. For laboratory research use only.",
    researchUses: [
      "MC4R receptor binding assays",
      "In-vitro melanocortin signaling studies",
    ],
    variants: [{ name: "10mg", priceCents: 7995, sku: "PT10" }],
  },
  {
    name: "Kisspeptin-10",
    slug: "kisspeptin-10",
    category: "other",
    sourcingPath: "asia_warehouse",
    shortDescription:
      "Kisspeptin decapeptide 10-vial kit for in-vitro GPR54 signaling research. For laboratory research use only.",
    researchUses: [
      "KISS1R/GPR54 receptor binding assays",
      "In-vitro neuroendocrine signaling studies",
    ],
    variants: [{ name: "10mg", priceCents: 9900, sku: "KP10" }],
  },

  // ---- Vitamins / amino (usa_domestic) ----
  {
    name: "NAD+",
    slug: "nad-plus",
    category: "metabolic",
    sourcingPath: "usa_domestic",
    shortDescription:
      "Nicotinamide adenine dinucleotide 10-vial kit for in-vitro cellular energetics research. For laboratory research use only.",
    featured: true,
    researchUses: [
      "In-vitro sirtuin activity assays",
      "Cellular redox and energetics studies",
    ],
    variants: [
      { name: "100mg", priceCents: 7995, sku: "NAD100" },
      { name: "500mg", priceCents: 11193, sku: "NAD500" },
    ],
  },
  {
    name: "5-Amino-1MQ",
    slug: "5-amino-1mq",
    category: "metabolic",
    sourcingPath: "usa_domestic",
    shortDescription:
      "NNMT inhibitor small molecule 10-vial kit for in-vitro metabolic enzyme research. For laboratory research use only.",
    researchUses: [
      "In-vitro NNMT enzyme inhibition assays",
      "Adipocyte metabolism model studies",
    ],
    variants: [
      { name: "5mg", priceCents: 6714, sku: "5A5" },
      { name: "50mg", priceCents: 14391, sku: "5A50" },
    ],
  },

  // ---- Blends (asia_warehouse) ----
  {
    name: "KLOW Blend",
    slug: "klow-blend",
    category: "recovery",
    sourcingPath: "asia_warehouse",
    shortDescription:
      "Multi-peptide research blend (KPV/GHK-Cu/BPC/TB) 10-vial kit for in-vitro co-signaling studies. For laboratory research use only.",
    researchUses: [
      "In-vitro combination peptide assays",
      "Comparative tissue-model studies",
    ],
    variants: [{ name: "80mg", priceCents: 22500, sku: "KLOW80" }],
  },
  {
    name: "GLOW Blend",
    slug: "glow-blend",
    category: "recovery",
    sourcingPath: "asia_warehouse",
    shortDescription:
      "Multi-peptide research blend (GHK-Cu/BPC/TB) 10-vial kit for in-vitro dermal-model studies. For laboratory research use only.",
    researchUses: [
      "In-vitro combination peptide assays",
      "Dermal fibroblast culture studies",
    ],
    variants: [{ name: "70mg", priceCents: 19500, sku: "GLOW70" }],
  },
];

async function seed() {
  console.log("Seeding AT Lab Sourcing wholesale KIT catalog...");

  await db.execute(
    sql`TRUNCATE TABLE price_list_entries, price_tiers, coa_results, batches, product_variants, products RESTART IDENTITY CASCADE`
  );

  // --- Products ---
  const products = await db
    .insert(productsTable)
    .values(
      CATALOG.map((p) => ({
        name: p.name,
        slug: p.slug,
        category: p.category,
        sourcingPath: p.sourcingPath,
        shortDescription: p.shortDescription,
        featured: p.featured ?? false,
        researchUses: p.researchUses,
      }))
    )
    .returning();

  const productIdBySlug = new Map(products.map((p) => [p.slug, p.id]));
  console.log(`Inserted ${products.length} products`);

  // --- Variants (every one is a 10-vial kit) ---
  const variantValues = CATALOG.flatMap((p) =>
    p.variants.map((v) => ({
      productId: productIdBySlug.get(p.slug)!,
      name: v.name,
      concentration: `${v.name}/vial`,
      sizeml: 1,
      priceCents: v.priceCents,
      sku: v.sku,
      unitType: "kit" as const,
      vialsPerUnit: 10,
      inStock: true,
    }))
  );

  const variants = await db
    .insert(productVariantsTable)
    .values(variantValues)
    .returning();
  console.log(`Inserted ${variants.length} variants`);

  // --- Price tiers ---
  const tiers = await db
    .insert(priceTiersTable)
    .values([
      { name: "Standard", slug: "standard", isDefault: true },
      { name: "Preferred", slug: "preferred" },
      { name: "Distributor", slug: "distributor" },
    ])
    .returning();
  const tierBySlug = new Map(tiers.map((t) => [t.slug, t.id]));
  console.log(`Inserted ${tiers.length} price tiers`);

  // --- Price list entries (contract) ---
  // Standard: NONE (falls back to base variant price).
  // Preferred: round(base * 0.92) for every kit variant.
  // Distributor: round(base * 0.85) for every kit variant.
  const entryValues = variants.flatMap((v) => [
    {
      priceTierId: tierBySlug.get("preferred")!,
      variantId: v.id,
      priceCents: Math.round(v.priceCents * 0.92),
    },
    {
      priceTierId: tierBySlug.get("distributor")!,
      variantId: v.id,
      priceCents: Math.round(v.priceCents * 0.85),
    },
  ]);

  const entries = await db
    .insert(priceListEntriesTable)
    .values(entryValues)
    .returning();
  console.log(`Inserted ${entries.length} price list entries`);

  // --- Batches + COA results for representative products (COA /verify flow) ---
  type BatchSeed = {
    id: string;
    slug: string;
    status: "pending" | "released";
    productionDate: string;
    notes: string;
    purityPercent: number;
    endotoxinEuPerMl: number;
    janoshikBase: string;
    testedAt: string;
    heavyMetals?: boolean;
  };

  const batchSeeds: BatchSeed[] = [
    {
      id: "TIR-2026-001",
      slug: "tirzepatide",
      status: "released",
      productionDate: "2026-01-15",
      notes: "Released kit batch. Full tri-verification completed.",
      purityPercent: 99.4,
      endotoxinEuPerMl: 0.21,
      janoshikBase: "JAN-90101",
      testedAt: "2026-01-18",
      heavyMetals: true,
    },
    {
      id: "RET-2026-001",
      slug: "retatrutide",
      status: "released",
      productionDate: "2026-01-22",
      notes: "Released kit batch. Exceptional purity result.",
      purityPercent: 99.1,
      endotoxinEuPerMl: 0.28,
      janoshikBase: "JAN-90210",
      testedAt: "2026-01-25",
    },
    {
      id: "BPC-2026-001",
      slug: "bpc-157",
      status: "released",
      productionDate: "2026-01-10",
      notes: "Released kit batch. Passed all testing criteria.",
      purityPercent: 98.9,
      endotoxinEuPerMl: 0.17,
      janoshikBase: "JAN-90055",
      testedAt: "2026-01-12",
      heavyMetals: true,
    },
    {
      id: "GHK-2026-001",
      slug: "ghk-cu",
      status: "released",
      productionDate: "2026-01-05",
      notes: "Released copper-series kit batch. Clean heavy metals panel.",
      purityPercent: 98.4,
      endotoxinEuPerMl: 0.33,
      janoshikBase: "JAN-89980",
      testedAt: "2026-01-08",
    },
    {
      id: "EPI-2026-001",
      slug: "epithalon",
      status: "released",
      productionDate: "2026-01-03",
      notes: "Released longevity-series kit batch.",
      purityPercent: 98.6,
      endotoxinEuPerMl: 0.39,
      janoshikBase: "JAN-89901",
      testedAt: "2026-01-06",
    },
    {
      id: "MOTS-2026-001",
      slug: "mots-c",
      status: "pending",
      productionDate: "2026-02-01",
      notes: "Awaiting secondary lab confirmation.",
      purityPercent: 98.2,
      endotoxinEuPerMl: 0.44,
      janoshikBase: "JAN-90340",
      testedAt: "2026-02-03",
    },
  ];

  const batches = await db
    .insert(batchesTable)
    .values(
      batchSeeds.map((b) => ({
        id: b.id,
        productId: productIdBySlug.get(b.slug)!,
        status: b.status,
        productionDate: new Date(b.productionDate),
        notes: b.notes,
      }))
    )
    .returning();
  console.log(`Inserted ${batches.length} batches`);

  const coaValues = batchSeeds.flatMap((b) => {
    const rows: (typeof coaResultsTable.$inferInsert)[] = [
      {
        id: `COA-${b.id}-PUR`,
        batchId: b.id,
        testType: "purity" as const,
        purityPercent: b.purityPercent,
        labName: "Janoshik Analytical",
        testedAt: new Date(b.testedAt),
        janoshikTaskId: `${b.janoshikBase}-P`,
      },
      {
        id: `COA-${b.id}-END`,
        batchId: b.id,
        testType: "endotoxin" as const,
        endotoxinEuPerMl: b.endotoxinEuPerMl,
        labName: "Janoshik Analytical",
        testedAt: new Date(b.testedAt),
        janoshikTaskId: `${b.janoshikBase}-E`,
      },
      {
        id: `COA-${b.id}-STE`,
        batchId: b.id,
        testType: "sterility" as const,
        sterilityPass: true,
        labName: "Janoshik Analytical",
        testedAt: new Date(b.testedAt),
        janoshikTaskId: `${b.janoshikBase}-S`,
      },
    ];
    if (b.heavyMetals) {
      rows.push({
        id: `COA-${b.id}-HM`,
        batchId: b.id,
        testType: "heavyMetals" as const,
        heavyMetals: [
          { element: "Lead (Pb)", resultPpm: 0.02, limitPpm: 0.5, pass: true },
          { element: "Arsenic (As)", resultPpm: 0.01, limitPpm: 0.5, pass: true },
          { element: "Mercury (Hg)", resultPpm: 0.001, limitPpm: 0.1, pass: true },
          { element: "Cadmium (Cd)", resultPpm: 0.003, limitPpm: 0.2, pass: true },
        ],
        labName: "Janoshik Analytical",
        testedAt: new Date(b.testedAt),
        janoshikTaskId: `${b.janoshikBase}-H`,
      });
    }
    return rows;
  });

  const coas = await db.insert(coaResultsTable).values(coaValues).returning();
  console.log(`Inserted ${coas.length} COA results`);
  console.log("Seed complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
