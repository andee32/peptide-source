import { describe, expect, it } from "vitest";
import {
  evaluateShippingDestination,
  normalizeState,
  resolveShippingPolicy,
} from "./shippingPolicy";

describe("resolveShippingPolicy", () => {
  it("defaults to US-only with no state restrictions", () => {
    expect(resolveShippingPolicy({})).toEqual({
      allowedCountries: ["US"],
      blockedCountries: [],
      allowedStates: [],
      blockedStates: [],
    });
  });

  it("parses lists tolerantly and normalises entries", () => {
    expect(
      resolveShippingPolicy({
        SHIP_ALLOWED_COUNTRIES: "us, ca ,",
        SHIP_BLOCKED_STATES: "Texas, ca",
      })
    ).toMatchObject({
      allowedCountries: ["US", "CA"],
      blockedStates: ["TX", "CA"],
    });
  });
});

describe("normalizeState", () => {
  it("maps full names and abbreviations to one form", () => {
    expect(normalizeState("Texas")).toBe("TX");
    expect(normalizeState("new york")).toBe("NY");
    expect(normalizeState(" tx ")).toBe("TX");
  });
});

describe("evaluateShippingDestination", () => {
  it("allows a US destination under the default policy", () => {
    const decision = evaluateShippingDestination(
      { state: "TX", country: "US" },
      resolveShippingPolicy({})
    );
    expect(decision.allowed).toBe(true);
  });

  it("rejects a country that is not on the allow list", () => {
    const decision = evaluateShippingDestination(
      { state: "ON", country: "CA" },
      resolveShippingPolicy({})
    );
    expect(decision).toMatchObject({ allowed: false, scope: "country" });
  });

  it("accepts USA and United States as US", () => {
    for (const country of ["USA", "united states", "us"]) {
      expect(
        evaluateShippingDestination(
          { state: "TX", country },
          resolveShippingPolicy({})
        ).allowed
      ).toBe(true);
    }
  });

  it("blocks a state regardless of how the buyer spells it", () => {
    const policy = resolveShippingPolicy({ SHIP_BLOCKED_STATES: "CA" });
    for (const state of ["CA", "california", " California "]) {
      expect(
        evaluateShippingDestination({ state, country: "US" }, policy)
      ).toMatchObject({ allowed: false, scope: "state" });
    }
  });

  it("treats a non-empty state allow list as exhaustive", () => {
    const policy = resolveShippingPolicy({ SHIP_ALLOWED_STATES: "TX, FL" });
    expect(
      evaluateShippingDestination({ state: "FL", country: "US" }, policy).allowed
    ).toBe(true);
    expect(
      evaluateShippingDestination({ state: "NY", country: "US" }, policy)
    ).toMatchObject({ allowed: false, scope: "state" });
  });

  it("lets a block override an allow list", () => {
    const policy = resolveShippingPolicy({
      SHIP_ALLOWED_STATES: "TX, FL",
      SHIP_BLOCKED_STATES: "FL",
    });
    expect(
      evaluateShippingDestination({ state: "FL", country: "US" }, policy)
    ).toMatchObject({ allowed: false, scope: "state" });
  });

  it("lets a blocked country override the allow list", () => {
    const policy = resolveShippingPolicy({
      SHIP_ALLOWED_COUNTRIES: "US, CA",
      SHIP_BLOCKED_COUNTRIES: "CA",
    });
    expect(
      evaluateShippingDestination({ state: "ON", country: "CA" }, policy)
    ).toMatchObject({ allowed: false, scope: "country" });
  });

  it("does not apply US state rules to other countries", () => {
    const policy = resolveShippingPolicy({
      SHIP_ALLOWED_COUNTRIES: "US, CA",
      SHIP_BLOCKED_STATES: "ON",
    });
    expect(
      evaluateShippingDestination({ state: "ON", country: "CA" }, policy).allowed
    ).toBe(true);
  });
});
