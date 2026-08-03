import { randomBytes } from "crypto";
import { resolveBrand } from "@app/brand";

// ACH / wire is the non-crypto rail. We NEVER touch card processors (Stripe /
// PayPal / Square) — they prohibit this vertical. Payment is reconciled manually
// by an admin against the reference code the customer includes in the transfer.

export const ACH_EXPIRY_DAYS = 7;

export interface BankInstructions {
  beneficiaryName: string;
  bankName: string;
  routingNumber: string;
  accountNumber: string;
  accountType: string;
  memo: string;
}

/**
 * Unique, human-legible reference code the customer must include in the wire/ACH
 * memo so the incoming transfer can be reconciled to their order.
 */
export function generateAchReferenceCode(): string {
  return `ATL-${randomBytes(4).toString("hex").toUpperCase()}`;
}

/**
 * True only when the real beneficiary banking details have been provisioned via
 * env — bank name, routing number, and account number all set to non-placeholder
 * values. Until then the ACH rail must fail closed rather than hand a buyer fake
 * bank details.
 */
export function isAchProvisioned(): boolean {
  const bankName = process.env.ACH_BANK_NAME;
  const routingNumber = process.env.ACH_ROUTING_NUMBER;
  const accountNumber = process.env.ACH_ACCOUNT_NUMBER;

  const isReal = (v: string | undefined): boolean =>
    typeof v === "string" &&
    v.trim().length > 0 &&
    !/placeholder/i.test(v) &&
    !/^0+$/.test(v.trim());

  return isReal(bankName) && isReal(routingNumber) && isReal(accountNumber);
}

export interface ZelleInstructions {
  recipient: string;
  recipientName: string;
  memo: string;
}

// Catches values that are obviously unset. Deliberately narrow: this cannot
// verify a handle is CORRECT, only that it is shaped like one and was not left
// as a stub. A broader pattern (matching "example", say) would reject legitimate
// handles and fail the merchant closed for no reason.
const SENTINEL = /^(placeholder|changeme|change-me|todo|tbd|0+)$/i;

// Zelle identifies a recipient by email or US phone. Anything else is a
// misconfiguration, and a Zelle transfer is irreversible with no dispute
// mechanism — a wrong handle means the buyer's funds are simply gone. So the
// shape is validated, not merely checked for non-emptiness.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?1?\d{10}$/;

function isRealZelleHandle(v: string | undefined): boolean {
  if (typeof v !== "string") return false;
  const t = v.trim();
  if (t.length === 0 || SENTINEL.test(t)) return false;
  const digits = t.replace(/[\s()\-.]/g, "");
  return EMAIL_RE.test(t) || PHONE_RE.test(digits);
}

/**
 * True only when BOTH the Zelle handle and the registered recipient name have
 * been provisioned via env.
 *
 * The name is part of the gate, not a defaulted extra: the buyer's bank app
 * shows the name actually registered to the handle, and displaying an unverified
 * one beside a real handle is placeholder payment detail presented as
 * authoritative — which the payments rule forbids.
 */
export function isZelleProvisioned(): boolean {
  const name = process.env.ZELLE_RECIPIENT_NAME;
  return (
    isRealZelleHandle(process.env.ZELLE_RECIPIENT) &&
    typeof name === "string" &&
    name.trim().length > 0 &&
    !SENTINEL.test(name)
  );
}

/**
 * Zelle payment destination. WHOLESALE ONLY — the recipient handle is a phone
 * number or email attached to the operating bank account, so it is never exposed
 * on the public storefront.
 *
 * Throws rather than falling back, so fail-closed does not depend on every
 * caller remembering to check isZelleProvisioned() first (the btcpay.ts pattern).
 */
export function buildZelleInstructions(referenceCode: string): ZelleInstructions {
  if (!isZelleProvisioned()) {
    throw new Error(
      "Refusing to build Zelle instructions: ZELLE_RECIPIENT / ZELLE_RECIPIENT_NAME are not provisioned"
    );
  }
  return {
    recipient: process.env.ZELLE_RECIPIENT!.trim(),
    recipientName: process.env.ZELLE_RECIPIENT_NAME!.trim(),
    memo: referenceCode,
  };
}

/**
 * Beneficiary bank details for the transfer. PLACEHOLDER values — replace with
 * the real provisioned banking details (ideally via env) before launch.
 */
export function buildBankInstructions(referenceCode: string): BankInstructions {
  return {
    // PLACEHOLDER — replace with counsel/finance-approved banking details before launch.
    beneficiaryName:
      process.env.ACH_BENEFICIARY_NAME ?? resolveBrand(process.env).legalName,
    bankName: process.env.ACH_BANK_NAME ?? "PLACEHOLDER BANK — NOT YET PROVISIONED",
    routingNumber: process.env.ACH_ROUTING_NUMBER ?? "000000000",
    accountNumber: process.env.ACH_ACCOUNT_NUMBER ?? "0000000000",
    accountType: process.env.ACH_ACCOUNT_TYPE ?? "checking",
    memo: referenceCode,
  };
}
