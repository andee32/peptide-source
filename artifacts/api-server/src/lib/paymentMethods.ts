import { eq } from "drizzle-orm";
import { db } from "@atlab/db";
import { paymentMethodsTable } from "@atlab/db/schema";
import { btcpayService } from "../services/btcpay";
import { isAchProvisioned, isZelleProvisioned } from "../services/ach";

export type PaymentMethodId = "crypto_btc" | "crypto_usdc" | "ach" | "wire" | "zelle";
export type OrderChannel = "retail" | "wholesale";

interface CatalogEntry {
  method: PaymentMethodId;
  label: string;
  /** Which backend config gates this rail (shown as readiness, no secrets). */
  configLabel: string;
  configured: () => boolean;
  /** Zelle is wholesale-only by invariant — its retail toggle can never be on. */
  retailAllowed: boolean;
}

// The FIXED set of allowed rails. New processors (Stripe/PayPal/etc.) are never
// added here — that is the payment-rails invariant.
export const PAYMENT_METHOD_CATALOG: CatalogEntry[] = [
  { method: "crypto_btc", label: "Bitcoin (BTC)", configLabel: "BTCPay", configured: () => btcpayService.configured, retailAllowed: true },
  { method: "crypto_usdc", label: "USDC", configLabel: "BTCPay", configured: () => btcpayService.configured, retailAllowed: true },
  { method: "ach", label: "ACH transfer", configLabel: "Bank details", configured: isAchProvisioned, retailAllowed: true },
  { method: "wire", label: "Wire transfer", configLabel: "Bank details", configured: isAchProvisioned, retailAllowed: true },
  { method: "zelle", label: "Zelle", configLabel: "Zelle recipient", configured: isZelleProvisioned, retailAllowed: false },
];

const CATALOG_BY_METHOD = new Map(PAYMENT_METHOD_CATALOG.map((c) => [c.method, c]));

export interface PaymentMethodState {
  method: PaymentMethodId;
  label: string;
  configLabel: string;
  configured: boolean;
  retailAllowed: boolean;
  enabledRetail: boolean;
  enabledWholesale: boolean;
  /** Live for a channel = enabled for it AND configured (AND retail-allowed). */
  availableRetail: boolean;
  availableWholesale: boolean;
}

/** Full admin view: every rail with its per-channel toggle + readiness. */
export async function getPaymentMethodStates(): Promise<PaymentMethodState[]> {
  const rows = await db.select().from(paymentMethodsTable);
  const byMethod = new Map(rows.map((r) => [r.method, r]));
  return PAYMENT_METHOD_CATALOG.map((c) => {
    const row = byMethod.get(c.method);
    const configured = c.configured();
    const enabledRetail = c.retailAllowed && (row?.enabledRetail ?? false);
    const enabledWholesale = row?.enabledWholesale ?? false;
    return {
      method: c.method,
      label: c.label,
      configLabel: c.configLabel,
      configured,
      retailAllowed: c.retailAllowed,
      enabledRetail,
      enabledWholesale,
      availableRetail: enabledRetail && configured,
      availableWholesale: enabledWholesale && configured,
    };
  });
}

/**
 * Server-side gate for order creation: is this method enabled for this channel?
 * Absent row = allowed (test/unseeded DBs keep working; the config fail-closed
 * guards in services/* still protect an unconfigured rail). An explicit
 * admin-disabled row rejects. Zelle on retail is always denied.
 */
export async function isPaymentMethodEnabled(
  method: PaymentMethodId,
  channel: OrderChannel,
): Promise<boolean> {
  const catalog = CATALOG_BY_METHOD.get(method);
  if (!catalog) return false;
  if (channel === "retail" && !catalog.retailAllowed) return false; // e.g. zelle
  const row = await db.query.paymentMethodsTable.findFirst({
    where: eq(paymentMethodsTable.method, method),
  });
  if (!row) return true; // no explicit setting → allowed (config guards still apply)
  return channel === "retail" ? row.enabledRetail : row.enabledWholesale;
}
