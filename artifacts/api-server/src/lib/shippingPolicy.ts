/**
 * Shipping destination policy.
 *
 * Where we may ship is a legal question that varies by state and country and
 * changes as counsel advises, so it is configuration rather than code:
 *
 *   SHIP_ALLOWED_COUNTRIES   comma-separated ISO-3166 alpha-2; default "US"
 *   SHIP_BLOCKED_COUNTRIES   comma-separated; takes precedence over the allow list
 *   SHIP_ALLOWED_STATES      comma-separated US states (abbreviation or full name);
 *                            empty means "every state not explicitly blocked"
 *   SHIP_BLOCKED_STATES      comma-separated; takes precedence over the allow list
 *
 * State rules only apply to US destinations. Blocks always win over allows, so
 * adding a state to `SHIP_BLOCKED_STATES` is a safe, immediate stop.
 */

const US_STATE_ABBREVIATIONS: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  "district of columbia": "DC",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "puerto rico": "PR",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
};

export type ShippingEnv = Record<string, string | undefined>;

export type ShippingPolicy = {
  allowedCountries: string[];
  blockedCountries: string[];
  allowedStates: string[];
  blockedStates: string[];
};

export type ShippingDecision =
  | { allowed: true }
  | { allowed: false; scope: "country" | "state"; message: string };

function parseList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** Accepts "TX", "tx", "Texas" — all normalise to "TX". Unknown values are upper-cased as-is. */
export function normalizeState(value: string): string {
  const trimmed = value.trim();
  const mapped = US_STATE_ABBREVIATIONS[trimmed.toLowerCase()];
  return mapped ?? trimmed.toUpperCase();
}

function normalizeCountry(value: string): string {
  const trimmed = value.trim().toUpperCase();
  // Tolerate the common long forms rather than rejecting an otherwise-valid order.
  if (trimmed === "USA" || trimmed === "UNITED STATES") return "US";
  return trimmed;
}

export function resolveShippingPolicy(env: ShippingEnv = {}): ShippingPolicy {
  const allowedCountries = parseList(env.SHIP_ALLOWED_COUNTRIES).map(
    normalizeCountry
  );

  return {
    allowedCountries: allowedCountries.length > 0 ? allowedCountries : ["US"],
    blockedCountries: parseList(env.SHIP_BLOCKED_COUNTRIES).map(
      normalizeCountry
    ),
    allowedStates: parseList(env.SHIP_ALLOWED_STATES).map(normalizeState),
    blockedStates: parseList(env.SHIP_BLOCKED_STATES).map(normalizeState),
  };
}

export function evaluateShippingDestination(
  destination: { state: string; country: string },
  policy: ShippingPolicy
): ShippingDecision {
  const country = normalizeCountry(destination.country);

  if (policy.blockedCountries.includes(country)) {
    return {
      allowed: false,
      scope: "country",
      message: `We are not able to ship to ${country}.`,
    };
  }
  if (!policy.allowedCountries.includes(country)) {
    return {
      allowed: false,
      scope: "country",
      message: `We are not able to ship to ${country}.`,
    };
  }

  // State rules are US-specific; other countries are governed by the country lists.
  if (country !== "US") return { allowed: true };

  const state = normalizeState(destination.state);

  if (policy.blockedStates.includes(state)) {
    return {
      allowed: false,
      scope: "state",
      message: `We are not able to ship to ${state}.`,
    };
  }
  if (policy.allowedStates.length > 0 && !policy.allowedStates.includes(state)) {
    return {
      allowed: false,
      scope: "state",
      message: `We are not able to ship to ${state}.`,
    };
  }

  return { allowed: true };
}
