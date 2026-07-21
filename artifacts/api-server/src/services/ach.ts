import { randomBytes } from "crypto";

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

/**
 * Beneficiary bank details for the transfer. PLACEHOLDER values — replace with
 * the real provisioned banking details (ideally via env) before launch.
 */
export function buildBankInstructions(referenceCode: string): BankInstructions {
  return {
    // PLACEHOLDER — replace with counsel/finance-approved banking details before launch.
    beneficiaryName: process.env.ACH_BENEFICIARY_NAME ?? "AT Lab Sourcing LLC",
    bankName: process.env.ACH_BANK_NAME ?? "PLACEHOLDER BANK — NOT YET PROVISIONED",
    routingNumber: process.env.ACH_ROUTING_NUMBER ?? "000000000",
    accountNumber: process.env.ACH_ACCOUNT_NUMBER ?? "0000000000",
    accountType: process.env.ACH_ACCOUNT_TYPE ?? "checking",
    memo: referenceCode,
  };
}
