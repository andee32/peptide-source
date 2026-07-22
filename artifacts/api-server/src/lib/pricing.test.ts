import { describe, it, expect } from "vitest";

/**
 * Unit-price resolution rules, mirrored from priceOrderRequest in
 * routes/orders.ts. The route itself needs a DB, so these lock the *rules* —
 * the dual-price model is where a mistake silently sells kits at wholesale.
 *
 * Rules:
 *   wholesale → tier override ?? wholesale list price (priceCents)
 *   retail    → kits at retailPriceCents (never the wholesale list price)
 *               vials at priceCents
 *   retail + kit with retailPriceCents == null → rejected upstream (422)
 */
type Variant = {
  unitType: "vial" | "kit";
  priceCents: number;
  retailPriceCents: number | null;
};

function resolveUnitPrice(
  v: Variant,
  isWholesale: boolean,
  tierOverride?: number
): number {
  return isWholesale
    ? tierOverride ?? v.priceCents
    : v.unitType === "kit"
      ? v.retailPriceCents!
      : v.priceCents;
}

function retailBlocked(v: Variant, isWholesale: boolean): boolean {
  return !isWholesale && v.unitType === "kit" && v.retailPriceCents == null;
}

const KIT: Variant = { unitType: "kit", priceCents: 7500, retailPriceCents: 18900 };
const KIT_UNPRICED: Variant = { unitType: "kit", priceCents: 7500, retailPriceCents: null };
const VIAL: Variant = { unitType: "vial", priceCents: 2899, retailPriceCents: null };

describe("retail must never get the wholesale kit price", () => {
  it("retail buys a kit at its retail price", () => {
    expect(resolveUnitPrice(KIT, false)).toBe(18900);
  });

  it("retail kit price is never the wholesale list price", () => {
    expect(resolveUnitPrice(KIT, false)).not.toBe(KIT.priceCents);
  });

  it("a kit with no retail price is blocked for retail", () => {
    expect(retailBlocked(KIT_UNPRICED, false)).toBe(true);
  });

  it("clearing a retail price re-blocks a previously sellable kit", () => {
    expect(retailBlocked(KIT, false)).toBe(false);
    expect(retailBlocked({ ...KIT, retailPriceCents: null }, false)).toBe(true);
  });

  it("vials are unaffected — they sell at priceCents", () => {
    expect(resolveUnitPrice(VIAL, false)).toBe(2899);
    expect(retailBlocked(VIAL, false)).toBe(false);
  });
});

describe("wholesale must never get the retail kit price", () => {
  it("wholesale buys a kit at the list price when no tier applies", () => {
    expect(resolveUnitPrice(KIT, true)).toBe(7500);
  });

  it("wholesale tier pricing wins over list", () => {
    expect(resolveUnitPrice(KIT, true, 6000)).toBe(6000);
  });

  it("wholesale is never charged the retail price", () => {
    expect(resolveUnitPrice(KIT, true)).not.toBe(KIT.retailPriceCents);
    expect(resolveUnitPrice(KIT, true, 6000)).not.toBe(KIT.retailPriceCents);
  });

  it("wholesale is never blocked by a missing retail price", () => {
    expect(retailBlocked(KIT_UNPRICED, true)).toBe(false);
    expect(resolveUnitPrice(KIT_UNPRICED, true)).toBe(7500);
  });
});

describe("pricing discipline", () => {
  it("retail sits above wholesale for the demo kit", () => {
    expect(KIT.retailPriceCents!).toBeGreaterThan(KIT.priceCents);
  });
});
