import { describe, it, expect } from "vitest";
import {
  resolveDiscounts,
  normalizeCode,
  type DiscountCodeRecord,
} from "./discounts";

const NOW = new Date("2026-07-22T12:00:00Z");

function record(overrides: Partial<DiscountCodeRecord> = {}): DiscountCodeRecord {
  return {
    id: 7,
    code: "LAUNCH10",
    percentBps: 1000,
    active: true,
    expiresAt: null,
    maxUses: null,
    timesUsed: 0,
    ...overrides,
  };
}

describe("normalizeCode", () => {
  it("trims and uppercases", () => {
    expect(normalizeCode("  launch10 ")).toBe("LAUNCH10");
  });
});

describe("resolveDiscounts — wholesale short-circuit", () => {
  it("never discounts wholesale, even crypto", () => {
    const r = resolveDiscounts({
      isWholesale: true,
      isCrypto: true,
      subtotalCents: 100_000,
      cryptoBps: 1000,
      now: NOW,
    });
    expect(r).toMatchObject({
      ok: true,
      discountCents: 0,
      promoDiscountCents: 0,
      cryptoDiscountCents: 0,
      totalCents: 100_000,
      discountSource: null,
    });
  });

  it("hard-rejects a code on a wholesale order", () => {
    const r = resolveDiscounts({
      isWholesale: true,
      isCrypto: false,
      subtotalCents: 100_000,
      cryptoBps: 1000,
      codeInput: "LAUNCH10",
      codeRecord: record(),
      now: NOW,
    });
    expect(r).toMatchObject({ ok: false, code: "CODE_NOT_APPLICABLE" });
  });

  it("whitespace-only code input on wholesale is treated as no code", () => {
    const r = resolveDiscounts({
      isWholesale: true,
      isCrypto: false,
      subtotalCents: 5000,
      cryptoBps: 1000,
      codeInput: "   ",
      now: NOW,
    });
    expect(r).toMatchObject({ ok: true, discountCents: 0 });
  });
});

describe("resolveDiscounts — Slot A validation (hard-fail, never silent)", () => {
  const base = {
    isWholesale: false,
    isCrypto: false,
    subtotalCents: 10_000,
    cryptoBps: 1000,
    codeInput: "LAUNCH10",
    now: NOW,
  };

  it("unknown code → INVALID_DISCOUNT_CODE", () => {
    expect(resolveDiscounts({ ...base, codeRecord: null })).toMatchObject({
      ok: false,
      code: "INVALID_DISCOUNT_CODE",
    });
  });

  it("inactive code → INVALID_DISCOUNT_CODE", () => {
    expect(
      resolveDiscounts({ ...base, codeRecord: record({ active: false }) })
    ).toMatchObject({ ok: false, code: "INVALID_DISCOUNT_CODE" });
  });

  it("expired code → INVALID_DISCOUNT_CODE (boundary: expiresAt === now)", () => {
    expect(
      resolveDiscounts({ ...base, codeRecord: record({ expiresAt: NOW }) })
    ).toMatchObject({ ok: false, code: "INVALID_DISCOUNT_CODE" });
  });

  it("future expiry is valid", () => {
    const r = resolveDiscounts({
      ...base,
      codeRecord: record({ expiresAt: new Date(NOW.getTime() + 1000) }),
    });
    expect(r).toMatchObject({ ok: true, promoDiscountCents: 1000 });
  });

  it("exhausted code → CODE_EXHAUSTED (boundary: timesUsed === maxUses)", () => {
    expect(
      resolveDiscounts({
        ...base,
        codeRecord: record({ maxUses: 5, timesUsed: 5 }),
      })
    ).toMatchObject({ ok: false, code: "CODE_EXHAUSTED" });
  });

  it("last remaining use is valid", () => {
    expect(
      resolveDiscounts({
        ...base,
        codeRecord: record({ maxUses: 5, timesUsed: 4 }),
      })
    ).toMatchObject({ ok: true, promoDiscountCents: 1000 });
  });
});

describe("resolveDiscounts — stacking math", () => {
  it("code only: 10% of $100.00", () => {
    const r = resolveDiscounts({
      isWholesale: false,
      isCrypto: false,
      subtotalCents: 10_000,
      cryptoBps: 1000,
      codeInput: "LAUNCH10",
      codeRecord: record(),
      now: NOW,
    });
    expect(r).toMatchObject({
      ok: true,
      promoDiscountCents: 1000,
      cryptoDiscountCents: 0,
      discountCents: 1000,
      totalCents: 9000,
      discountSource: "code",
      discountCode: "LAUNCH10",
      discountCodeId: 7,
    });
  });

  it("crypto only: 10% of $100.00", () => {
    const r = resolveDiscounts({
      isWholesale: false,
      isCrypto: true,
      subtotalCents: 10_000,
      cryptoBps: 1000,
      now: NOW,
    });
    expect(r).toMatchObject({
      ok: true,
      promoDiscountCents: 0,
      cryptoDiscountCents: 1000,
      discountCents: 1000,
      totalCents: 9000,
      discountSource: null,
    });
  });

  it("sequential, not additive: 10% code then 10% crypto = 19% total", () => {
    const r = resolveDiscounts({
      isWholesale: false,
      isCrypto: true,
      subtotalCents: 10_000,
      cryptoBps: 1000,
      codeInput: "LAUNCH10",
      codeRecord: record(),
      now: NOW,
    });
    expect(r).toMatchObject({
      ok: true,
      promoDiscountCents: 1000,
      cryptoDiscountCents: 900, // 10% of the 9000 running total
      discountCents: 1900,
      totalCents: 8100,
    });
  });

  it("worst-case ceilings (50% + 50%) still leave a non-negative total", () => {
    const r = resolveDiscounts({
      isWholesale: false,
      isCrypto: true,
      subtotalCents: 10_000,
      cryptoBps: 5000,
      codeInput: "MAX",
      codeRecord: record({ code: "MAX", percentBps: 5000 }),
      now: NOW,
    });
    expect(r).toMatchObject({
      ok: true,
      promoDiscountCents: 5000,
      cryptoDiscountCents: 2500,
      discountCents: 7500,
      totalCents: 2500,
    });
  });

  it("provenance always sums to discountCents", () => {
    for (const subtotal of [1, 99, 101, 3333, 999_999]) {
      for (const isCrypto of [true, false]) {
        const r = resolveDiscounts({
          isWholesale: false,
          isCrypto,
          subtotalCents: subtotal,
          cryptoBps: 750,
          codeInput: "X",
          codeRecord: record({ code: "X", percentBps: 1250 }),
          now: NOW,
        });
        if (!r.ok) throw new Error("unexpected rejection");
        expect(r.promoDiscountCents + r.cryptoDiscountCents).toBe(r.discountCents);
        expect(r.totalCents).toBe(subtotal - r.discountCents);
        expect(r.totalCents).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("rounding: bps math rounds to nearest cent", () => {
    // 1250 bps of 99 cents = 12.375 → 12
    const r = resolveDiscounts({
      isWholesale: false,
      isCrypto: false,
      subtotalCents: 99,
      cryptoBps: 0,
      codeInput: "X",
      codeRecord: record({ code: "X", percentBps: 1250 }),
      now: NOW,
    });
    expect(r).toMatchObject({ ok: true, promoDiscountCents: 12, totalCents: 87 });
  });

  it("zero crypto bps disables Slot B", () => {
    const r = resolveDiscounts({
      isWholesale: false,
      isCrypto: true,
      subtotalCents: 10_000,
      cryptoBps: 0,
      now: NOW,
    });
    expect(r).toMatchObject({ ok: true, cryptoDiscountCents: 0, totalCents: 10_000 });
  });

  it("defensive clamp: an out-of-range code bps can never exceed the subtotal", () => {
    const r = resolveDiscounts({
      isWholesale: false,
      isCrypto: false,
      subtotalCents: 500,
      cryptoBps: 0,
      codeInput: "BAD",
      codeRecord: record({ code: "BAD", percentBps: 999_999 }),
      now: NOW,
    });
    expect(r).toMatchObject({ ok: true, promoDiscountCents: 500, totalCents: 0 });
  });
});
