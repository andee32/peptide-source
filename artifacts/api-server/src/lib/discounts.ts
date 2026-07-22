// Discount resolution — the single choke point for every discount decision
// (docs/discount-system-design.md). Pure: the caller looks up the code row and
// passes it in; this function only computes. Any future rule change ("codes for
// wholesale", "stack two codes") is made HERE explicitly, never at a call site.
//
// Two-slot model:
//   Slot A — one promotion (promo code today; subscription reserved).
//   Slot B — crypto payment incentive, retail-only, applied sequentially on the
//            post-promotion amount (never additive bps).
// Wholesale gets neither slot; a submitted code on a wholesale order is a hard
// error, never silently ignored (refundless crypto rails make a buyer who
// believes they got a discount but didn't a dispute magnet).

export type DiscountCodeRecord = {
  id: number;
  code: string;
  percentBps: number;
  active: boolean;
  expiresAt: Date | null;
  maxUses: number | null;
  timesUsed: number;
};

export type DiscountRejection = {
  ok: false;
  code: "CODE_NOT_APPLICABLE" | "INVALID_DISCOUNT_CODE" | "CODE_EXHAUSTED";
  message: string;
};

export type DiscountResolution = {
  ok: true;
  promoDiscountCents: number;
  cryptoDiscountCents: number;
  discountCents: number;
  totalCents: number;
  discountSource: "code" | null;
  discountCode: string | null;
  discountCodeId: number | null;
};

export function normalizeCode(input: string): string {
  return input.trim().toUpperCase();
}

export function resolveDiscounts(input: {
  isWholesale: boolean;
  isCrypto: boolean;
  subtotalCents: number;
  cryptoBps: number;
  /** Raw submitted code, if any (pre-normalization is fine). */
  codeInput?: string | null;
  /** DB row for the normalized code, or null when the lookup found nothing. */
  codeRecord?: DiscountCodeRecord | null;
  /** Injectable clock for tests. */
  now?: Date;
}): DiscountResolution | DiscountRejection {
  const { isWholesale, isCrypto, subtotalCents, cryptoBps } = input;
  const codeInput = input.codeInput?.trim() ? normalizeCode(input.codeInput) : null;
  const now = input.now ?? new Date();

  // ── Wholesale short-circuit: no discounts of any kind, ever.
  if (isWholesale) {
    if (codeInput) {
      return {
        ok: false,
        code: "CODE_NOT_APPLICABLE",
        message:
          "Discount codes do not apply to wholesale orders — wholesale pricing comes from your account's price tier.",
      };
    }
    return {
      ok: true,
      promoDiscountCents: 0,
      cryptoDiscountCents: 0,
      discountCents: 0,
      totalCents: subtotalCents,
      discountSource: null,
      discountCode: null,
      discountCodeId: null,
    };
  }

  // ── Slot A: one promotion (promo code). Fully valid or hard-rejected.
  let promoDiscountCents = 0;
  let discountSource: "code" | null = null;
  let discountCode: string | null = null;
  let discountCodeId: number | null = null;

  if (codeInput) {
    const rec = input.codeRecord ?? null;
    if (!rec || !rec.active || (rec.expiresAt !== null && rec.expiresAt <= now)) {
      return {
        ok: false,
        code: "INVALID_DISCOUNT_CODE",
        message: "That discount code is not valid.",
      };
    }
    if (rec.maxUses !== null && rec.timesUsed >= rec.maxUses) {
      return {
        ok: false,
        code: "CODE_EXHAUSTED",
        message: "That discount code has reached its redemption limit.",
      };
    }
    // Defensive clamp: creation validates 1..5000, but a bad row must never
    // produce a negative total.
    const bps = Math.min(Math.max(rec.percentBps, 0), 10000);
    promoDiscountCents = Math.min(
      Math.round((subtotalCents * bps) / 10000),
      subtotalCents
    );
    discountSource = "code";
    discountCode = rec.code;
    discountCodeId = rec.id;
  }

  // ── Slot B: crypto payment incentive, sequential on the running total.
  const running = subtotalCents - promoDiscountCents;
  const clampedCryptoBps = Math.min(Math.max(cryptoBps, 0), 10000);
  const cryptoDiscountCents = isCrypto
    ? Math.min(Math.round((running * clampedCryptoBps) / 10000), running)
    : 0;

  const discountCents = promoDiscountCents + cryptoDiscountCents;
  return {
    ok: true,
    promoDiscountCents,
    cryptoDiscountCents,
    discountCents,
    totalCents: subtotalCents - discountCents,
    discountSource,
    discountCode,
    discountCodeId,
  };
}
