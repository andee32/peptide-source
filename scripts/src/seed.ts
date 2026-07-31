import { db } from "@atlab/db";
import {
  productsTable,
  productVariantsTable,
  batchesTable,
  coaResultsTable,
  priceTiersTable,
  storeSettingsTable,
  paymentMethodsTable,
} from "@atlab/db/schema";
import { sql } from "drizzle-orm";
import coaLinks from "./coaLinks.json" with { type: "json" };

const coaFor = (sku: string): string | null =>
  (coaLinks as Record<string, string>)[sku] ?? null;

type VariantSeed = { name: string; priceCents: number; sku: string };

type ProductSeed = {
  name: string;
  slug: string;
  category: "metabolic" | "longevity" | "recovery" | "cognitive" | "other";
  sourcingPath: "usa_domestic" | "asia_warehouse";
  shortDescription: string;
  featured?: boolean;
  // Per-SKU compliance gate. Defaults to "cleared" when omitted. Flip a product
  // to "blocked" (unlisted + unsellable) or "restricted" here — a one-line change.
  complianceStatus?: "blocked" | "restricted" | "cleared";
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
      "Tirzepatide (LY3298176) is a 39-amino-acid synthetic peptide with a GIP-derived backbone, Aib substitutions at positions 2 and 13, and a C20 fatty diacid at Lys20, characterized in vitro as an imbalanced dual GIP/GLP-1 receptor agonist that is cAMP-biased at GLP-1R. Supplied as a 10-vial wholesale kit for in-vitro incretin receptor pharmacology. For laboratory research use only.",
    featured: true,
    researchUses: [
      "Competitive radioligand binding at recombinant human GIP and GLP-1 receptors ([125I]-GIP / [125I]-GLP-1, HEK293)",
      "cAMP accumulation and [35S]GTPgammaS binding assays comparing GIPR versus GLP-1R potency",
      "NanoBRET beta-arrestin and GRK2 recruitment and SNAP-tag receptor internalization assays characterizing GLP-1R signaling bias",
    ],
    variants: [
      { name: "10mg", priceCents: 8000, sku: "TR10" },
      { name: "15mg", priceCents: 9000, sku: "TR15" },
      { name: "20mg", priceCents: 10000, sku: "TR20" },
      { name: "30mg", priceCents: 11500, sku: "TR30" },
      { name: "60mg", priceCents: 22000, sku: "TR60" },
    ],
  },
  {
    name: "Retatrutide",
    slug: "retatrutide",
    category: "metabolic",
    sourcingPath: "asia_warehouse",
    shortDescription:
      "Retatrutide (LY3437943), a synthetic acylated peptide agonist of the GLP-1, GIP, and glucagon receptors, supplied as a 10-vial kit for in-vitro receptor-signaling and comparative pharmacology assays. For laboratory research use only.",
    featured: true,
    // All products are research-use-only; not gating per-SKU. complianceStatus
    // stays available as an admin control but defaults to cleared for everything.
    complianceStatus: "cleared",
    researchUses: [
      "In-vitro triple-receptor agonism assays (GLP-1R/GIPR/GCGR cAMP and beta-arrestin signaling)",
      "Comparative in-vitro potency/selectivity profiling versus other GLP-1/GIP/glucagon-receptor agonists",
      "In-vitro structure-activity and receptor-binding characterization of acylated multi-agonist peptides",
    ],
    variants: [
      { name: "5mg", priceCents: 8700, sku: "RT5" },
      { name: "10mg", priceCents: 11500, sku: "RT10" },
      { name: "15mg", priceCents: 14000, sku: "RT15" },
      { name: "20mg", priceCents: 16000, sku: "RT20" },
      { name: "30mg", priceCents: 20000, sku: "RT30" },
      { name: "50mg", priceCents: 30000, sku: "RT50" },
    ],
  },
  {
    name: "Cagrilintide",
    slug: "cagrilintide",
    category: "metabolic",
    sourcingPath: "asia_warehouse",
    shortDescription:
      "Acylated 37-residue amylin analog (AM833) 10-vial kit for in-vitro amylin (AMY1/2/3) and calcitonin receptor pharmacology. For laboratory research use only.",
    researchUses: [
      "Amylin (AMY1/AMY2/AMY3) and calcitonin receptor binding and cAMP accumulation assays",
      "RAMP-dependent receptor pharmacology and agonist-selectivity profiling in CTR/RAMP-transfected cell lines",
      "In-vitro physical-stability and amyloid-fibrillation characterization of amylin-family peptides",
    ],
    variants: [
      { name: "5mg", priceCents: 13000, sku: "CAG5" },
      { name: "10mg", priceCents: 19000, sku: "CGL10" },
    ],
  },

  // ---- Growth hormone (usa_domestic) ----
  {
    name: "Tesamorelin",
    slug: "tesamorelin",
    category: "other",
    sourcingPath: "usa_domestic",
    shortDescription:
      "DPP-4-resistant synthetic human GHRH analog ([trans-3-hexenoyl]hGHRH(1-44) amide, CAS 218949-48-5), supplied as a 10-vial kit for in-vitro GHRH-receptor and peptide-stability research. For laboratory research use only.",
    researchUses: [
      "In-vitro plasma stability and metabolite profiling by LC-HRMS/MS, characterizing DPP-4 resistance conferred by the N-terminal trans-3-hexenoyl group",
      "Analytical reference standard for LC-HRMS/MS method development and immunoaffinity enrichment of GHRH analogues (PMC4830873)",
      "GHRH receptor (GHRHR) competitive binding and Gs/cAMP reporter assays in pituitary-derived cell lines — established for GHRH-class agonists (PMC12137518); tesamorelin-specific in-vitro affinity data not located in the peer-reviewed literature",
    ],
    variants: [
      { name: "5mg", priceCents: 11500, sku: "TSM5" },
      { name: "10mg", priceCents: 19000, sku: "TSM10" },
    ],
  },
  {
    name: "IGF-1 LR3",
    slug: "igf-1-lr3",
    category: "other",
    sourcingPath: "usa_domestic",
    shortDescription:
      "Long Arg³ IGF-1 (Long R3 IGF-1), an 83-residue recombinant IGF-1 analog engineered for low IGF-binding-protein affinity, supplied as a 10-vial kit for in-vitro cell culture and IGF-1R signalling research. For laboratory research use only.",
    researchUses: [
      "Serum-free and reduced-serum mammalian cell culture supplementation (HEK293, CHO) as a more potent in-vitro alternative to insulin or native IGF-1",
      "In-vitro cell proliferation and anti-apoptotic signalling assays",
      "In-vitro IGF-1R pathway studies (IRS-1/PI3K-Akt and MAPK phosphorylation) under low-IGF-binding-protein conditions",
    ],
    variants: [],
  },
  {
    name: "CJC/IPA No DAC",
    slug: "cjc-ipa-no-dac",
    category: "other",
    sourcingPath: "usa_domestic",
    shortDescription:
      "Research blend of CJC-1295 without DAC (modified GRF(1-29), a synthetic GHRH analog) and Ipamorelin (a selective GHS-R1a pentapeptide agonist), supplied as a 10-vial kit for in-vitro GHRH-receptor and ghrelin-receptor signaling research. Component identities and per-component masses are stated on the lot COA. For laboratory research use only.",
    researchUses: [
      "GHRH receptor (GHRHR) Gs/cAMP reporter assays for the CJC-1295 (mod GRF 1-29) component in pituitary-derived cell lines",
      "GHS-R1a (ghrelin receptor) radioligand binding and Ca2+/IP signaling assays for the Ipamorelin component",
      "In-vitro plasma-stability and LC-MS/MS identity and purity characterization of a two-component peptide mixture",
    ],
    variants: [{ name: "10mg", priceCents: 11500, sku: "IP10" }],
  },

  // ---- Healing / BPC (usa_domestic) ----
  {
    name: "BPC-157",
    slug: "bpc-157",
    category: "recovery",
    sourcingPath: "usa_domestic",
    shortDescription:
      "BPC-157, a synthetic pentadecapeptide (GEPPPGKPADDAGLV) corresponding to a partial sequence of the gastric protein BPC, supplied as a 10-vial kit for in-vitro endothelial and fibroblast culture work. For laboratory research use only.",
    featured: true,
    researchUses: [
      "In-vitro endothelial (HUVEC) tube-formation and migration assays",
      "Cultured fibroblast and tendon-explant outgrowth assays",
      "FAK-paxillin and VEGFR2-Akt-eNOS signalling readouts in cell culture",
    ],
    variants: [{ name: "5mg", priceCents: 7000, sku: "BC5" }],
  },
  {
    name: "TB-500",
    slug: "tb-500",
    category: "recovery",
    sourcingPath: "usa_domestic",
    shortDescription:
      "Ac-LKKTETQ-OH, a synthetic acetylated heptapeptide corresponding to residues 17-23 of thymosin beta-4, supplied as a 10-vial kit for in-vitro cell migration and cytoskeletal research. For laboratory research use only.",
    researchUses: [
      "In-vitro endothelial cell (HUVEC) migration and adhesion assays",
      "Ex-vivo vessel-sprouting / angiogenesis explant assays (chick aortic arch)",
      "Structure-activity comparison against full-length thymosin beta-4 and truncated LKKTET analogues, including G-actin binding studies — actin sequestration by the isolated heptapeptide remains an untested hypothesis",
    ],
    variants: [{ name: "10mg", priceCents: 15000, sku: "BT10" }],
  },
  {
    name: "Ara-290",
    slug: "ara-290",
    category: "recovery",
    sourcingPath: "usa_domestic",
    shortDescription:
      "Cibinetide (ARA-290) 10-vial kit — a synthetic 11-amino-acid, non-erythropoietic mimetic of the erythropoietin helix-B surface, for in-vitro innate repair receptor (EPOR/CD131) signaling research. For laboratory research use only.",
    researchUses: [
      "In-vitro EPOR/CD131 (innate repair receptor) selectivity and receptor-dependence assays",
      "In-vitro macrophage and dendritic cell cytokine/chemokine expression assays (CCL2, CCL3, CXCL1; MHC-II, CD86)",
      "Cellular stress and apoptosis assays in cultured mesenchymal-derived or neuronal cells",
    ],
    variants: [{ name: "10mg", priceCents: 8500, sku: "RA10" }],
  },
  {
    name: "KPV",
    slug: "kpv",
    category: "recovery",
    sourcingPath: "usa_domestic",
    shortDescription:
      "Lys-Pro-Val (KPV), the C-terminal tripeptide of alpha-MSH, 10-vial kit for in-vitro anti-inflammatory and NF-kB signaling research. For laboratory research use only.",
    researchUses: [
      "In-vitro NF-kB reporter / signaling inhibition assays in cytokine-stimulated intestinal epithelial cells (e.g. Caco2-BBE, HT29-Cl.19A) - Dalmasso 2008, Gastroenterology",
      "PepT1-mediated peptide-transporter uptake/competition studies ([3H]KPV kinetics)",
      "In-vitro pro-inflammatory cytokine (e.g. IL-8/TNF-driven) secretion assays in epithelial and immune (Jurkat) cell models",
    ],
    variants: [{ name: "10mg", priceCents: 8500, sku: "KPV10" }],
  },

  // ---- Neuropeptides (asia_warehouse) ----
  {
    name: "Selank",
    slug: "selank",
    category: "cognitive",
    sourcingPath: "asia_warehouse",
    shortDescription:
      "Synthetic heptapeptide (Thr-Lys-Pro-Arg-Pro-Gly-Pro), the tuftsin tetrapeptide extended with a C-terminal Pro-Gly-Pro; 10-vial kit for in-vitro peptidase and neuropeptide-stability research. For laboratory research use only.",
    researchUses: [
      "Cell-free enkephalin-degrading peptidase inhibition assays (human serum enzyme activity)",
      "Comparative protease-resistance and peptide stability characterization (vs. tuftsin)",
      "Exploratory gene-expression profiling in neuronal cell lines (e.g. IMR-32)",
    ],
    variants: [{ name: "10mg", priceCents: 8500, sku: "SK10" }],
  },
  {
    name: "Adamax",
    slug: "adamax",
    category: "cognitive",
    sourcingPath: "asia_warehouse",
    shortDescription:
      "Synthetic acetylated analog of the ACTH(4-10)-derived peptide Semax, supplied as a 10-vial kit for in-vitro neuroscience research; exact sequence and mass per lot COA. For laboratory research use only.",
    researchUses: [
      "Comparative in-vitro stability and purity characterization against Semax reference material (LC-MS / HPLC; the analog's exact mass is disputed in public sources and should be established empirically)",
      "Comparative BDNF-expression assays in cultured glia",
      "Radioligand competition against the Semax binding site in rat basal-forebrain membrane preparations to establish whether the modification retains binding",
    ],
    variants: [{ name: "10mg", priceCents: 20000, sku: "ADM10" }],
  },
  {
    name: "Wolverine",
    slug: "wolverine",
    category: "recovery",
    sourcingPath: "asia_warehouse",
    shortDescription:
      "Two-component research blend of BPC-157 (synthetic pentadecapeptide) and TB-500 (thymosin beta-4 17-23 fragment), supplied as a 10-vial kit for in-vitro cell migration and cytoskeletal research. Component identities, per-component masses and salt forms are stated on the lot COA. For laboratory research use only.",
    researchUses: [
      "In-vitro fibroblast outgrowth and transwell migration assays with FAK/paxillin phosphorylation readout",
      "In-vitro G-actin binding and cytoskeletal sequestration assays for the LKKTETQ actin-binding motif (TB-500 component)",
      "In-vitro endothelial tube-formation and VEGFR2 signalling assays",
    ],
    variants: [
      { name: "10mg", priceCents: 12000, sku: "WOL10" },
      { name: "20mg", priceCents: 19000, sku: "WOL20" },
    ],
  },

  // ---- Bioregulators (asia_warehouse) ----
  {
    name: "Epithalon",
    slug: "epithalon",
    category: "longevity",
    sourcingPath: "asia_warehouse",
    shortDescription:
      "Epithalon (Epitalon), the synthetic tetrapeptide Ala-Glu-Asp-Gly (CAS 307297-39-8, MW 390.35), supplied as a 10-vial kit for in-vitro telomerase activity and telomere-length assays in cultured cells. For laboratory research use only.",
    researchUses: [
      "In-vitro telomerase activity and hTERT mRNA expression assays in cultured human cells",
      "Telomere-length quantification (qPCR) in cultured normal and immortalised cell lines",
      "Replicative-lifespan (Hayflick-limit) culture models in telomerase-negative human fibroblasts",
    ],
    variants: [{ name: "10mg", priceCents: 7500, sku: "ET10" }],
  },
  {
    name: "MOTS-c",
    slug: "mots-c",
    category: "longevity",
    sourcingPath: "asia_warehouse",
    shortDescription:
      "MOTS-c, a 16-amino-acid mitochondrial-derived peptide (encoded in the 12S rRNA/MT-RNR1 region), supplied as a 10-vial kit for in-vitro study of AMPK signaling and metabolic-pathway regulation. For laboratory research use only.",
    researchUses: [
      "In-vitro AMPK activation / signaling assays in cultured cells",
      "In-vitro glucose-uptake (GLUT4 translocation) studies in cultured skeletal-muscle cell lines",
      "Cell-based studies of the folate/one-carbon cycle and AICAR-mediated AMPK regulation",
    ],
    variants: [
      { name: "10mg", priceCents: 8300, sku: "MS10" },
      { name: "20mg", priceCents: 14500, sku: "MS20" },
    ],
  },
  {
    name: "SS-31",
    slug: "ss-31",
    category: "longevity",
    sourcingPath: "asia_warehouse",
    shortDescription:
      "Synthetic mitochondria-accumulating tetrapeptide (D-Arg-Dmt-Lys-Phe-NH2) supplied as a 10-vial kit for in-vitro study of anionic phospholipid binding and isolated-mitochondria bioenergetics. For laboratory research use only.",
    researchUses: [
      "In-vitro binding assays against cardiolipin-containing liposomes and anionic model membranes (surface potential, lipid packing)",
      "Bioenergetic assays in isolated mitochondria and permeabilized fibers (respiration, ATP synthesis rate, ADP sensitivity)",
      "Chemical crosslinking / affinity-capture mapping of inner-mitochondrial-membrane protein interactors",
    ],
    variants: [{ name: "10mg", priceCents: 9500, sku: "2S10" }],
  },

  // ---- Copper (usa_domestic) ----
  {
    name: "GHK-Cu",
    slug: "ghk-cu",
    category: "recovery",
    sourcingPath: "usa_domestic",
    shortDescription:
      "Copper(II) complex of the tripeptide glycyl-L-histidyl-L-lysine (GHK-Cu; INCI copper tripeptide-1), CAS 89030-95-5, supplied as a 10-vial kit for in-vitro extracellular matrix and fibroblast culture research. For laboratory research use only.",
    featured: true,
    researchUses: [
      "In-vitro collagen synthesis assays in cultured dermal fibroblasts",
      "MMP and TIMP expression studies in fibroblast culture",
      "Peptide–copper(II) coordination and complex-stability chemistry",
    ],
    variants: [{ name: "50mg", priceCents: 6200, sku: "CU50" }],
  },
  {
    name: "AHK-Cu",
    slug: "ahk-cu",
    category: "recovery",
    sourcingPath: "usa_domestic",
    shortDescription:
      "AHK-Cu (L-alanyl-L-histidyl-L-lysine copper(II) complex) 10-vial kit for in-vitro dermal papilla cell and ex-vivo hair follicle organ-culture research. For laboratory research use only.",
    researchUses: [
      "Dermal papilla cell proliferation and viability assays (MTT)",
      "Ex-vivo human hair follicle organ-culture elongation studies",
      "In-vitro apoptosis-marker studies (Annexin V/PI, Bcl-2/Bax, cleaved caspase-3/PARP)",
    ],
    variants: [{ name: "100mg", priceCents: 7700, sku: "AU100" }],
  },

  // ---- Melanocortin (asia_warehouse) ----
  {
    name: "MT-1",
    slug: "mt-1",
    category: "other",
    sourcingPath: "asia_warehouse",
    shortDescription:
      "Melanotan-1 (afamelanotide; [Nle4,D-Phe7]-alpha-MSH), a synthetic alpha-MSH analog and potent melanocortin receptor agonist, 10-vial kit for in-vitro MC1R binding and melanogenesis research. For laboratory research use only.",
    researchUses: [
      "MC1R receptor binding / competition assays (NDP-MSH is a standard high-affinity reference agonist)",
      "In-vitro melanogenesis and melanocyte pigmentation studies (tyrosinase/melanin induction)",
      "Melanocortin receptor signaling (cAMP) assays across MC1R/MC3R/MC4R/MC5R using NDP-MSH as reference ligand",
    ],
    variants: [{ name: "10mg", priceCents: 7000, sku: "MT1" }],
  },
  {
    name: "Melanotan-2",
    slug: "melanotan-2",
    category: "other",
    sourcingPath: "asia_warehouse",
    shortDescription:
      "Melanotan-2 (MT-II), a synthetic lactam-bridged cyclic heptapeptide analog of alpha-MSH and non-selective melanocortin (MC1R/MC3R/MC4R/MC5R) receptor agonist, supplied as a 10-vial kit for in-vitro receptor and melanogenesis research. For laboratory research use only.",
    researchUses: [
      "In-vitro melanocortin receptor (MC1R/MC3R/MC4R/MC5R) binding and cAMP signaling assays",
      "In-vitro melanogenesis / melanin-content studies in cultured melanocyte or B16 melanoma cell lines",
      "Reference agonist for non-selective melanocortin receptor pharmacology and SAR comparison",
    ],
    variants: [{ name: "10mg", priceCents: 7000, sku: "ML10" }],
  },
  {
    name: "PT-141",
    slug: "pt-141",
    category: "other",
    sourcingPath: "asia_warehouse",
    shortDescription:
      "Bremelanotide (PT-141), a synthetic cyclic heptapeptide non-selective melanocortin receptor agonist, supplied as a 10-vial kit for in-vitro melanocortin (MC1R/MC3R/MC4R) receptor binding and signaling research. For laboratory research use only.",
    researchUses: [
      "MC4R and MC3R receptor binding and functional (cAMP/PKA) activation assays in vitro",
      "In-vitro melanocortin receptor signaling and selectivity/structure-activity profiling",
      "Reference-standard/analytical characterization of the cyclic heptapeptide (HPLC/MS identity and purity)",
    ],
    variants: [{ name: "10mg", priceCents: 7995, sku: "P41" }],
  },
  {
    name: "Kisspeptin-10",
    slug: "kisspeptin-10",
    category: "other",
    sourcingPath: "asia_warehouse",
    shortDescription:
      "Kisspeptin-10 (KP-10) decapeptide, 10-vial kit, for in-vitro study of KISS1R/GPR54 receptor binding and signaling. For laboratory research use only.",
    researchUses: [
      "KISS1R/GPR54 radioligand binding and receptor-affinity assays",
      "In-vitro GPR54 signaling readouts (Gq/11-mediated Ca2+ flux, IP accumulation, ERK1/2 phosphorylation) in receptor-expressing cell lines",
      "In-vitro neuroendocrine signaling studies in GnRH-secreting neuronal cell models (e.g., GT1-7)",
    ],
    variants: [{ name: "10mg", priceCents: 9900, sku: "KS10" }],
  },

  // ---- Vitamins / amino (usa_domestic) ----
  {
    name: "NAD+",
    slug: "nad-plus",
    category: "metabolic",
    sourcingPath: "usa_domestic",
    shortDescription:
      "Nicotinamide adenine dinucleotide (NAD+, oxidized form), a dinucleotide coenzyme, supplied for in-vitro studies of cellular redox metabolism and as a co-substrate in sirtuin and PARP enzyme assays. For laboratory research use only.",
    featured: true,
    researchUses: [
      "In-vitro sirtuin (SIRT1-7) deacylase activity assays as the required co-substrate",
      "PARP enzymatic activity assays",
      "Cellular redox / NAD+:NADH ratio and bioenergetics studies",
      "Cofactor for in-vitro dehydrogenase enzyme assays",
    ],
    variants: [
      { name: "100mg", priceCents: 7995, sku: "NJ100" },
      { name: "500mg", priceCents: 11193, sku: "NJ500" },
    ],
  },
  {
    name: "5-Amino-1MQ",
    slug: "5-amino-1mq",
    category: "metabolic",
    sourcingPath: "usa_domestic",
    shortDescription:
      "5-Amino-1-methylquinolinium (5-Amino-1MQ), a methylquinolinium-class small-molecule inhibitor of nicotinamide N-methyltransferase (NNMT) acting at the enzyme's nicotinamide substrate site, reported biochemical IC50 approximately 1.2 uM. Supplied as a 10-vial kit with per-lot COA stating salt form and salt-corrected mass. For laboratory research use only.",
    researchUses: [
      "In-vitro NNMT biochemical inhibition assays and IC50 determination against recombinant enzyme",
      "Quantitation of intracellular 1-methylnicotinamide, NAD+ and S-adenosylmethionine in cultured 3T3-L1 adipocytes",
      "In-vitro lipogenesis assays in differentiated 3T3-L1 adipocytes",
    ],
    variants: [
      { name: "5mg", priceCents: 6714, sku: "5AM5" },
      { name: "10mg", priceCents: 9000, sku: "5AM10" },
    ],
  },

  // ---- Blends (asia_warehouse) ----
  {
    name: "KLOW Blend",
    slug: "klow-blend",
    category: "recovery",
    sourcingPath: "asia_warehouse",
    shortDescription:
      "Four-component research blend of KPV (alpha-MSH 11-13), GHK-Cu (copper(II) complex of glycyl-L-histidyl-L-lysine; INCI copper tripeptide-1), BPC-157 and TB-500 (thymosin beta-4 17-23 fragment), supplied as a 10-vial kit. Component identities, per-component masses and salt forms are stated on the lot COA. For laboratory research use only.",
    researchUses: [
      "In-vitro combination-peptide co-signaling assays in cultured cells",
      "Comparative in-vitro studies of NF-kB / IL-1beta pathway modulation (KPV component)",
      "In-vitro fibroblast / extracellular-matrix and tissue-repair model studies (GHK-Cu component)",
    ],
    variants: [{ name: "80mg", priceCents: 24000, sku: "KLOW80" }],
  },
  {
    name: "GLOW Blend",
    slug: "glow-blend",
    category: "recovery",
    sourcingPath: "asia_warehouse",
    shortDescription:
      "Three-component research blend of GHK-Cu (copper(II) complex of glycyl-L-histidyl-L-lysine; INCI copper tripeptide-1), BPC-157 and TB-500 (thymosin beta-4 17-23 fragment), supplied as a 10-vial kit. Component identities, per-component masses and salt forms are stated on the lot COA. For laboratory research use only.",
    researchUses: [
      "GHK-Cu component: collagen and glycosaminoglycan synthesis assays in cultured dermal fibroblasts",
      "BPC-157 component: tendon-fibroblast explant outgrowth, transwell migration, and FAK/paxillin phosphorylation assays",
      "TB-500 component: G-actin monomer binding and endothelial cell migration assays using the LKKTET actin-binding motif — note most published in-vitro data is on full-length thymosin beta-4, not the 17–23 fragment",
      "Analytical use: reference material for LC-MS/MS identity and purity confirmation of a multi-component peptide mixture",
    ],
    variants: [{ name: "70mg", priceCents: 21000, sku: "BBG70" }],
  },

  // ---- Additional catalog ----
  {
    name: "AOD-9604",
    slug: "aod-9604",
    category: "metabolic",
    sourcingPath: "asia_warehouse",
    shortDescription:
      "AOD-9604, a synthetic peptide corresponding to residues 176-191 of the C-terminus of human growth hormone (hGH), supplied as a 10-vial kit for in-vitro lipolysis and adipocyte-metabolism research. For laboratory research use only.",
    researchUses: [
      "In-vitro lipolysis assays in cultured 3T3-L1 adipocytes (glycerol release)",
      "In-vitro lipogenesis-inhibition assays in adipocyte cell models",
      "Analytical reference-standard characterization (LC-MS / HPLC identity and purity)",
    ],
    variants: [{ name: "5mg", priceCents: 12000, sku: "AOD5" }],
  },
  {
    name: "DSIP",
    slug: "dsip",
    category: "cognitive",
    sourcingPath: "asia_warehouse",
    shortDescription:
      "Delta sleep-inducing peptide (DSIP), a synthetic nonapeptide (Trp-Ala-Gly-Gly-Asp-Ala-Ser-Gly-Glu), supplied as a 10-vial kit for in-vitro neuropeptide-stability and receptor research. For laboratory research use only.",
    researchUses: [
      "In-vitro peptidase-resistance and plasma-stability characterization (LC-MS/MS)",
      "Exploratory receptor-binding and neuronal cell-culture signaling studies",
      "Analytical reference-standard identity and purity confirmation",
    ],
    variants: [{ name: "10mg", priceCents: 9000, sku: "DSIP10" }],
  },
  {
    name: "Vitamin B12",
    slug: "vitamin-b12",
    category: "metabolic",
    sourcingPath: "usa_domestic",
    shortDescription:
      "Methylcobalamin, the methylated coenzyme form of vitamin B12 (cobalamin), supplied as a 10-vial kit for in-vitro biochemistry and cell-culture research. For laboratory research use only.",
    researchUses: [
      "Cofactor supplementation in methionine synthase and one-carbon-metabolism enzyme assays",
      "Cell-culture media supplementation studies",
      "Analytical identity and purity characterization (UV-Vis / HPLC)",
    ],
    variants: [{ name: "Methylcobalamin", priceCents: 6500, sku: "B12" }],
  },
  {
    name: "Glutathione",
    slug: "glutathione",
    category: "longevity",
    sourcingPath: "usa_domestic",
    shortDescription:
      "Reduced L-glutathione (GSH), the endogenous gamma-glutamyl-cysteinyl-glycine tripeptide antioxidant, supplied as a 10-vial kit for in-vitro redox and oxidative-stress research. For laboratory research use only.",
    researchUses: [
      "In-vitro antioxidant / reactive-oxygen-species scavenging assays in cell culture",
      "Glutathione-dependent enzyme (glutathione peroxidase / S-transferase) activity assays",
      "Intracellular GSH:GSSG redox-ratio quantification",
    ],
    variants: [{ name: "1500mg", priceCents: 10000, sku: "GLUT1500" }],
  },
];

// Explicit single-vial (retail) list. Each row builds one unitType='vial'
// variant on the referenced product. Prices are set here, not derived.
type SingleVialSeed = { slug: string; name: string; priceCents: number; sku: string };
const SINGLE_VIALS: SingleVialSeed[] = [
  { slug: "igf-1-lr3", name: "1mg", priceCents: 5500, sku: "SV_IG1" },
  { slug: "retatrutide", name: "10mg", priceCents: 3500, sku: "SV_RT10" },
  { slug: "retatrutide", name: "50mg", priceCents: 9000, sku: "SV_RT50" },
  { slug: "retatrutide", name: "60mg", priceCents: 12000, sku: "SV_RT60" },
  { slug: "tesamorelin", name: "10mg", priceCents: 4500, sku: "SV_TSM10" },
  { slug: "kpv", name: "10mg", priceCents: 3500, sku: "SV_KPV10" },
  { slug: "mots-c", name: "10mg", priceCents: 3500, sku: "SV_MS10" },
  { slug: "ghk-cu", name: "50mg", priceCents: 3500, sku: "SV_CU50" },
  { slug: "glow-blend", name: "70mg", priceCents: 5500, sku: "SV_GLOW70" },
  { slug: "klow-blend", name: "80mg", priceCents: 5500, sku: "SV_KLOW80" },
  { slug: "5-amino-1mq", name: "50mg", priceCents: 4000, sku: "SV_5AM50" },
  { slug: "bpc-157", name: "10mg", priceCents: 3500, sku: "SV_BC10" },
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
        complianceStatus: p.complianceStatus ?? "cleared",
        researchUses: p.researchUses,
      }))
    )
    .returning();

  const productIdBySlug = new Map(products.map((p) => [p.slug, p.id]));
  console.log(`Inserted ${products.length} products`);

  // --- Variants: each catalog entry's variants become 10-vial wholesale KITs.
  // Single-vial RETAIL variants come from the explicit SINGLE_VIALS list.
  const kitValues = CATALOG.flatMap((p) =>
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
      coaUrl: coaFor(v.sku),
    }))
  );

  const vialValues = SINGLE_VIALS.map((v) => {
    const productId = productIdBySlug.get(v.slug);
    if (!productId) {
      throw new Error(`SINGLE_VIALS references unknown product slug: ${v.slug}`);
    }
    return {
      productId,
      name: v.name,
      concentration: `${v.name}/vial`,
      sizeml: 1,
      priceCents: v.priceCents,
      sku: v.sku,
      unitType: "vial" as const,
      vialsPerUnit: 1,
      inStock: true,
      coaUrl: coaFor(v.sku),
    };
  });

  const variantValues = [...kitValues, ...vialValues];

  const variants = await db
    .insert(productVariantsTable)
    .values(variantValues)
    .returning();
  console.log(`Inserted ${variants.length} variants`);

  // --- Price tiers ---
  const tiers = await db
    .insert(priceTiersTable)
    .values([
      // discountBps = % off list in basis points. Editable in admin; the server
      // derives every wholesale kit price as list × (1 − discountBps/10000).
      { name: "Standard", slug: "standard", isDefault: true, discountBps: 0 },
      { name: "Preferred", slug: "preferred", discountBps: 800 },
      { name: "Distributor", slug: "distributor", discountBps: 1500 },
    ])
    .returning();
  console.log(`Inserted ${tiers.length} price tiers`);

  // Per-SKU price_list_entries are an optional advanced override and are no
  // longer seeded — tier pricing comes from each tier's discountBps.

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
        // All seeded batches are fabricated demo data — never real COAs.
        isDemo: true,
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

  // --- Store settings (single fixed row) ---
  // Upsert so the 'default' row always exists after seed; do not clobber an
  // existing showVialImages preference on re-seed.
  await db
    .insert(storeSettingsTable)
    .values({ id: "default", showVialImages: true })
    .onConflictDoNothing({ target: storeSettingsTable.id });
  console.log("Ensured store settings row (id='default')");

  // --- Payment methods (fixed rail catalog; per-channel on/off) ---
  // Crypto is the primary rail (on both channels). ACH/wire start off until the
  // admin provisions bank details and enables them. Zelle is wholesale-only.
  // Availability is still gated by backend config regardless of these flags.
  await db
    .insert(paymentMethodsTable)
    .values([
      { method: "crypto_btc", enabledRetail: true, enabledWholesale: true, sortOrder: 1 },
      { method: "crypto_usdc", enabledRetail: true, enabledWholesale: true, sortOrder: 2 },
      { method: "ach", enabledRetail: false, enabledWholesale: false, sortOrder: 3 },
      { method: "wire", enabledRetail: false, enabledWholesale: false, sortOrder: 4 },
      { method: "zelle", enabledRetail: false, enabledWholesale: true, sortOrder: 5 },
    ])
    .onConflictDoNothing({ target: paymentMethodsTable.method });
  console.log("Ensured payment method rows");

  console.log("Seed complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
