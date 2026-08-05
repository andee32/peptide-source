import { eq } from "drizzle-orm";
import { db } from "@app/db";
import { paymentMethodsTable } from "@app/db/schema";
import { btcpayService } from "../services/btcpay";
import { isAchProvisioned, isZelleProvisioned } from "../services/ach";
import { isLinkMoneyProvisioned } from "../services/linkMoney";

export type PaymentMethodId =
  | "crypto_btc"
  | "crypto_usdc"
  | "ach"
  | "wire"
  | "zelle"
  | "pay_by_bank";
export type OrderChannel = "retail" | "wholesale";

/** A single required config key and whether it is set — NEVER its value. */
export interface ConfigItem {
  label: string;
  envVar: string;
  set: boolean;
}

const isSet = (v: string | undefined): boolean => !!(v && v.trim());
const item = (label: string, envVar: string): ConfigItem => ({
  label,
  envVar,
  set: isSet(process.env[envVar]),
});

// Readiness breakdown per config group — labels + set/missing only, no values.
const BTCPAY_ITEMS = (): ConfigItem[] => [
  item("Server URL", "BTCPAYSERVER_URL"),
  item("API key", "BTCPAYSERVER_API_KEY"),
  item("Store ID", "BTCPAYSERVER_STORE_ID"),
  item("Webhook secret", "BTCPAYSERVER_WEBHOOK_SECRET"),
];
const BANK_ITEMS = (): ConfigItem[] => [
  item("Bank name", "ACH_BANK_NAME"),
  item("Routing number", "ACH_ROUTING_NUMBER"),
  item("Account number", "ACH_ACCOUNT_NUMBER"),
];
const ZELLE_ITEMS = (): ConfigItem[] => [
  item("Recipient handle", "ZELLE_RECIPIENT"),
  item("Recipient name", "ZELLE_RECIPIENT_NAME"),
];
const LINKMONEY_ITEMS = (): ConfigItem[] => [
  item("Client ID", "LINKMONEY_CLIENT_ID"),
  item("Client secret", "LINKMONEY_CLIENT_SECRET"),
  item("Webhook secret", "LINKMONEY_WEBHOOK_SECRET"),
  item("Redirect URL", "LINKMONEY_REDIRECT_URL"),
];

interface CatalogEntry {
  method: PaymentMethodId;
  label: string;
  /** Which backend config gates this rail (shown as readiness, no secrets). */
  configLabel: string;
  configured: () => boolean;
  /** Required config keys and whether each is set (never the values). */
  configItems: () => ConfigItem[];
  /** Zelle is wholesale-only by invariant — its retail toggle can never be on. */
  retailAllowed: boolean;
}

// The FIXED set of allowed rails. New processors (Stripe/PayPal/etc.) are never
// added here — that is the payment-rails invariant.
export const PAYMENT_METHOD_CATALOG: CatalogEntry[] = [
  { method: "crypto_btc", label: "Bitcoin (BTC)", configLabel: "BTCPay", configured: () => btcpayService.configured, configItems: BTCPAY_ITEMS, retailAllowed: true },
  { method: "crypto_usdc", label: "USDC", configLabel: "BTCPay", configured: () => btcpayService.configured, configItems: BTCPAY_ITEMS, retailAllowed: true },
  { method: "ach", label: "ACH transfer", configLabel: "Bank details", configured: isAchProvisioned, configItems: BANK_ITEMS, retailAllowed: true },
  { method: "wire", label: "Wire transfer", configLabel: "Bank details", configured: isAchProvisioned, configItems: BANK_ITEMS, retailAllowed: true },
  { method: "zelle", label: "Zelle", configLabel: "Zelle recipient", configured: isZelleProvisioned, configItems: ZELLE_ITEMS, retailAllowed: false },
  { method: "pay_by_bank", label: "Pay by Bank", configLabel: "Link Money", configured: isLinkMoneyProvisioned, configItems: LINKMONEY_ITEMS, retailAllowed: true },
];

const CATALOG_BY_METHOD = new Map(PAYMENT_METHOD_CATALOG.map((c) => [c.method, c]));

export interface PaymentMethodState {
  method: PaymentMethodId;
  label: string;
  configLabel: string;
  configured: boolean;
  configItems: ConfigItem[];
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
      configItems: c.configItems(),
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
