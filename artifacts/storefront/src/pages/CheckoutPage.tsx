import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useCart } from "@/contexts/cart";
import { useWholesaleSession } from "@/hooks/useWholesaleSession";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { bearerHeaders, useCustomerSession } from "@/hooks/useCustomerAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ShoppingBag,
  ArrowLeft,
  Bitcoin,
  Landmark,
  Copy,
  Check,
  Clock,
  AlertTriangle,
  Tag,
  ChevronRight,
  Building2,
} from "lucide-react";

const WHOLESALE_MOQ_KITS = 5;

type PaymentMethod = "crypto_btc" | "crypto_usdc" | "ach";

// RUO attestation snapshot shown to the buyer. The server persists its own
// authoritative copy per order (see api-server routes/orders.ts).
const RUO_ATTESTATION_LABEL =
  "I affirm that all products in this order are purchased strictly for laboratory research use only (RUO) — not for human or veterinary use — and that I am authorized to make this purchase.";

interface ShippingForm {
  name: string;
  email: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

interface CryptoInvoice {
  paymentRecordId: string;
  currency: "BTC" | "USDC";
  amount: string;
  amountCents: number;
  paymentAddress: string | null;
  paymentUrl: string | null;
  expiresAt: string;
  qrPaymentUri: string;
}

interface AchInstructions {
  paymentRecordId: string;
  orderId: string;
  referenceCode: string;
  amountCents: number;
  amount: string;
  currency: string;
  status: string;
  expiresAt: string;
  instructions: {
    beneficiaryName: string;
    bankName: string;
    routingNumber: string;
    accountNumber: string;
    accountType: string;
    memo: string;
  };
}

type CheckoutStep =
  | "form"
  | "awaiting_payment"
  | "awaiting_ach"
  | "confirmed"
  | "expired"
  | "failed";

// Crypto discount rate comes from admin settings (GET /settings, basis points);
// the server recomputes it authoritatively at order creation.
const POLL_INTERVAL_MS = 6000;

// ACH / wire is off by default — crypto is the primary, working rail. Only expose
// it once real bank details are provisioned (backend gates the same way). Buyers
// must never see placeholder bank details.
const ACH_ENABLED = import.meta.env.VITE_ACH_ENABLED === "true";

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatBpsPct(bps: number): string {
  const pct = bps / 100;
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(1);
}

function CopyableAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-2 bg-muted border border-border rounded-lg p-3">
      <code className="flex-1 text-xs font-mono text-teal-ink break-all leading-relaxed">
        {address}
      </code>
      <button
        onClick={handleCopy}
        className="shrink-0 p-1.5 rounded hover:bg-border transition-colors"
        title="Copy address"
      >
        {copied ? (
          <Check className="w-4 h-4 text-good" />
        ) : (
          <Copy className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
    </div>
  );
}

function CountdownTimer({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const expiry = new Date(expiresAt).getTime();
    function tick() {
      setRemaining(Math.max(0, expiry - Date.now()));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  const isUrgent = remaining < 5 * 60 * 1000;

  return (
    <div
      className={`flex items-center gap-2 text-sm font-mono ${
        isUrgent ? "text-warn" : "text-muted-foreground"
      }`}
    >
      <Clock className="w-4 h-4" />
      <span>
        {mins.toString().padStart(2, "0")}:{secs.toString().padStart(2, "0")}{" "}
        remaining
      </span>
    </div>
  );
}

function OrderSummaryPanel({
  subtotalCents,
  promoDiscountCents,
  cryptoDiscountCents,
  appliedCode,
  discountBps,
  paymentMethod,
}: {
  subtotalCents: number;
  promoDiscountCents: number;
  cryptoDiscountCents: number;
  appliedCode: string | null;
  discountBps: number;
  paymentMethod: PaymentMethod;
}) {
  const { cartItems } = useCart();
  const { session } = useWholesaleSession();
  const discountCents = promoDiscountCents + cryptoDiscountCents;
  const totalCents = subtotalCents - discountCents;
  const isCrypto = paymentMethod === "crypto_btc" || paymentMethod === "crypto_usdc";

  return (
    <div className="bg-card border border-border rounded-xl p-6 shadow-sm sticky top-6">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-4">
        Order Summary
      </h2>

      <div className="space-y-3 mb-5">
        {cartItems.map((item) => (
          <div key={item.variantId} className="flex justify-between text-sm">
            <div className="text-foreground leading-snug">
              <span className="text-foreground font-medium">{item.productName}</span>
              <br />
              <span className="text-muted-foreground">
                {item.variantName} × {item.quantity}
              </span>
            </div>
            <span className="text-foreground font-mono ml-4 shrink-0">
              {formatCents(item.priceCents * item.quantity)}
            </span>
          </div>
        ))}
      </div>

      <div className="border-t border-border pt-4 space-y-2">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Subtotal</span>
          <span className="font-mono">{formatCents(subtotalCents)}</span>
        </div>

        {promoDiscountCents > 0 && (
          <div className="flex justify-between text-sm text-good">
            <span className="flex items-center gap-1">
              <Tag className="w-3.5 h-3.5" />
              Code {appliedCode ?? ""}
            </span>
            <span className="font-mono">−{formatCents(promoDiscountCents)}</span>
          </div>
        )}
        {isCrypto && cryptoDiscountCents > 0 && (
          <div className="flex justify-between text-sm text-good">
            <span className="flex items-center gap-1">
              <Tag className="w-3.5 h-3.5" />
              Crypto payment discount ({formatBpsPct(discountBps)}%)
            </span>
            <span className="font-mono">−{formatCents(cryptoDiscountCents)}</span>
          </div>
        )}

        <div className="flex justify-between text-base font-semibold text-foreground pt-1 border-t border-border">
          <span>Total</span>
          <span className="font-mono text-teal-ink">
            {formatCents(totalCents)}
          </span>
        </div>
      </div>

      {session && (
        <div className="mt-4 bg-accent border border-accent-foreground/20 rounded-lg p-3 text-xs text-accent-foreground leading-relaxed">
          Prices shown are catalog list prices. Your{" "}
          {session.priceTierName ?? "wholesale"} tier pricing is applied by the
          server — the final amount due reflects your tier.
        </div>
      )}

      {isCrypto && discountCents > 0 && (
        <div className="mt-4 bg-accent border border-accent-foreground/20 rounded-lg p-3 text-xs text-accent-foreground leading-relaxed">
          A {formatBpsPct(discountBps)}% discount is applied automatically to
          retail orders paid with crypto.
        </div>
      )}
    </div>
  );
}

export function CheckoutPage() {
  const { cartItems, totalCents, clearCart } = useCart();
  const { session } = useWholesaleSession();
  // Retail shopper session (optional): the bearer token below is what makes the
  // server stamp customerUserId on the order. Guest checkout sends no header.
  const customerSession = useCustomerSession();
  const [, navigate] = useLocation();

  // All catalog variants are kits, so total kits = total quantity.
  const totalKits = cartItems.reduce((acc, item) => acc + item.quantity, 0);
  const isWholesale = !!session;
  const moqMet = !isWholesale || totalKits >= WHOLESALE_MOQ_KITS;

  const { cryptoDiscountBps } = useStoreSettings();
  // Percent label for method cards/badges; empty string hides the "% off" copy.
  const discountPctLabel =
    !isWholesale && cryptoDiscountBps > 0 ? formatBpsPct(cryptoDiscountBps) : "";


  const [step, setStep] = useState<CheckoutStep>("form");
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("crypto_btc");
  const [shipping, setShipping] = useState<ShippingForm>({
    name: "",
    email: "",
    address1: "",
    address2: "",
    city: "",
    state: "",
    zip: "",
    country: "US",
  });
  const [errors, setErrors] = useState<Partial<ShippingForm>>({});
  const [submitting, setSubmitting] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<CryptoInvoice | null>(null);
  const [ach, setAch] = useState<AchInstructions | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // RUO attestation — must be affirmed and signed to place an order.
  const [signerName, setSignerName] = useState("");
  const [ruoAffirmed, setRuoAffirmed] = useState(false);
  const [attestErrors, setAttestErrors] = useState<{ signerName?: string; ruo?: string }>({});

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Server-priced preview — POST /orders/quote runs the exact pipeline order
  // creation runs (same variant prices, same discount resolver), so what the
  // buyer sees is what the invoice will charge, even if their cart holds stale
  // localStorage price snapshots. Quoted for every retail cart, code or not.
  const [codeInput, setCodeInput] = useState("");
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [quote, setQuote] = useState<{
    subtotalCents: number;
    promoDiscountCents: number;
    cryptoDiscountCents: number;
    discountCents: number;
    totalCents: number;
    discountCode: string | null;
  } | null>(null);
  const [quoting, setQuoting] = useState(false);

  // A wholesale session gets no discounts of any kind — drop any retail code
  // state the moment one activates so a stale quote can't be shown (or a code
  // silently stripped at submit).
  useEffect(() => {
    if (isWholesale) {
      setAppliedCode(null);
      setQuote(null);
      setCodeError(null);
      setCodeInput("");
    }
  }, [isWholesale]);

  useEffect(() => {
    if (isWholesale || cartItems.length === 0) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setQuoting(true);
      try {
        const res = await fetch("/api/orders/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lineItems: cartItems.map((i) => ({
              variantId: i.variantId,
              quantity: i.quantity,
            })),
            paymentMethod,
            ...(appliedCode ? { discountCode: appliedCode } : {}),
          }),
        });
        if (cancelled) return;
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as {
            message?: string;
            code?: string;
          };
          if (
            res.status === 422 &&
            (err.code === "INVALID_DISCOUNT_CODE" ||
              err.code === "CODE_EXHAUSTED" ||
              err.code === "CODE_NOT_APPLICABLE")
          ) {
            // The code itself was rejected — drop it, say why.
            setQuote(null);
            setAppliedCode(null);
            setCodeError(err.message ?? "That code could not be applied.");
          } else if (res.status === 422 && err.code) {
            // An order rule blocks this cart outright (e.g. kit variants in a
            // retail cart) — say so now rather than at submit.
            setQuote(null);
            setSubmitError(err.message ?? "This cart cannot be ordered as-is.");
          }
          // Anything else (rate limit, stock change, server error) is
          // transient: keep the code and the last good quote; the next cart or
          // method change re-quotes.
          return;
        }
        setQuote((await res.json()) as typeof quote);
        setCodeError(null);
        setSubmitError(null);
      } catch {
        // Network failure — keep existing state; totals fall back to the
        // client-side preview until the next successful quote.
      } finally {
        if (!cancelled) setQuoting(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [appliedCode, cartItems, paymentMethod, isWholesale]);

  // Every per-order endpoint (read, crypto invoice, ACH instructions) now
  // requires the credential the order was placed under — the order id alone is
  // only sufficient for a true guest order.
  const orderAuthHeaders = useMemo(
    (): Record<string, string> => ({
      ...bearerHeaders(isWholesale ? null : customerSession?.token),
      ...(session ? { "x-account-token": session.token } : {}),
    }),
    [isWholesale, customerSession?.token, session],
  );

  const isCrypto = paymentMethod === "crypto_btc" || paymentMethod === "crypto_usdc";
  // When a server quote exists it is used verbatim — subtotal included — so a
  // stale localStorage price snapshot can never understate the amount the
  // invoice will charge. The client-side math below is only the fallback while
  // no quote has landed (wholesale, or a transient quote failure).
  const cartSubtotalCents = totalCents;
  const subtotalCents = quote?.subtotalCents ?? cartSubtotalCents;
  const promoDiscountCents = quote?.promoDiscountCents ?? 0;
  const cryptoDiscountCents = quote
    ? quote.cryptoDiscountCents
    : isCrypto && !isWholesale
      ? Math.round((subtotalCents * cryptoDiscountBps) / 10000)
      : 0;
  const discountCents = quote
    ? quote.discountCents
    : promoDiscountCents + cryptoDiscountCents;
  const finalCents = quote ? quote.totalCents : subtotalCents - discountCents;

  function validate(): boolean {
    const errs: Partial<ShippingForm> = {};
    if (!shipping.name.trim()) errs.name = "Required";
    if (!shipping.email.trim() || !/^[^@]+@[^@]+\.[^@]+$/.test(shipping.email))
      errs.email = "Valid email required";
    if (!shipping.address1.trim()) errs.address1 = "Required";
    if (!shipping.city.trim()) errs.city = "Required";
    if (!shipping.state.trim()) errs.state = "Required";
    if (!shipping.zip.trim()) errs.zip = "Required";
    setErrors(errs);

    const aErrs: { signerName?: string; ruo?: string } = {};
    if (!signerName.trim()) aErrs.signerName = "Required";
    if (!ruoAffirmed) aErrs.ruo = "You must affirm the RUO attestation to continue";
    setAttestErrors(aErrs);

    return Object.keys(errs).length === 0 && Object.keys(aErrs).length === 0;
  }

  const pollOrder = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/orders/${id}`, {
          headers: orderAuthHeaders,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { status: string };
        if (data.status === "confirmed") {
          setStep("confirmed");
          clearCart();
          if (pollRef.current) clearInterval(pollRef.current);
          setTimeout(() => navigate(`/orders/${id}`), 1500);
        } else if (data.status === "expired") {
          setStep("expired");
          if (pollRef.current) clearInterval(pollRef.current);
        } else if (data.status === "failed") {
          setStep("failed");
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // silently retry
      }
    },
    [clearCart, navigate, orderAuthHeaders]
  );

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    if (isWholesale && !moqMet) {
      setSubmitError(
        `Wholesale orders require a ${WHOLESALE_MOQ_KITS}-kit minimum. Your cart has ${totalKits}.`
      );
      return;
    }
    setSubmitting(true);
    setSubmitError(null);

    try {
      const lineItems = cartItems.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
      }));

      const createRes = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(isWholesale ? {} : bearerHeaders(customerSession?.token)),
        },
        body: JSON.stringify({
          // Wholesale session: backend switches to wholesale channel, applies
          // the account's tier pricing, and enforces the 5-kit MOQ.
          ...(session
            ? { accountId: session.accountId, token: session.token }
            : {}),
          lineItems,
          paymentMethod,
          ...(appliedCode && !isWholesale ? { discountCode: appliedCode } : {}),
          ruoAffirmed,
          signerName: signerName.trim(),
          shippingName: shipping.name,
          shippingEmail: shipping.email,
          shippingAddress1: shipping.address1,
          shippingAddress2: shipping.address2 || undefined,
          shippingCity: shipping.city,
          shippingState: shipping.state,
          shippingZip: shipping.zip,
          shippingCountry: shipping.country,
        }),
      });

      if (!createRes.ok) {
        const err = (await createRes.json().catch(() => ({}))) as {
          message?: string;
          code?: string;
        };
        if (
          createRes.status === 422 &&
          (err.code === "INVALID_DISCOUNT_CODE" ||
            err.code === "CODE_EXHAUSTED" ||
            err.code === "CODE_NOT_APPLICABLE")
        ) {
          // Never silently retry without the code — surface it and let the
          // buyer decide.
          setAppliedCode(null);
          setQuote(null);
          const msg = err.message ?? "The discount code could not be applied.";
          setCodeError(msg);
          throw new Error(msg);
        }
        if (createRes.status === 422 && err.code === "MOQ_NOT_MET") {
          throw new Error(
            err.message ??
              `Wholesale orders require a ${WHOLESALE_MOQ_KITS}-kit minimum.`
          );
        }
        if (createRes.status === 403) {
          throw new Error(
            err.message ??
              "This wholesale account is not approved for ordering. Check your account status."
          );
        }
        throw new Error(err.message ?? "Failed to create order");
      }
      const order = (await createRes.json()) as { id: string };
      setOrderId(order.id);

      const subscribeItems = cartItems.filter(
        (item) => item.subscribeInterval && item.subscribePlanId
      );
      if (subscribeItems.length > 0) {
        const createdTokens: Array<{ id: number; accessToken: string }> = [];
        const failures: string[] = [];

        await Promise.all(
          subscribeItems.map(async (item) => {
            const subRes = await fetch(
              `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/subscriptions`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  customerEmail: shipping.email,
                  customerName: shipping.name,
                  planId: item.subscribePlanId,
                  intervalDays: item.subscribeInterval,
                  shippingAddress: {
                    name: shipping.name,
                    address1: shipping.address1,
                    address2: shipping.address2 || undefined,
                    city: shipping.city,
                    state: shipping.state,
                    zip: shipping.zip,
                    country: shipping.country,
                  },
                  notes: `${item.productName} ${item.variantName} — order ${order.id}`,
                }),
              }
            );
            if (!subRes.ok) {
              const errBody = await subRes.json().catch(() => ({})) as { message?: string };
              failures.push(
                `${item.productName}: ${errBody.message ?? "subscription creation failed"}`
              );
              return;
            }
            const sub = await subRes.json() as { id: number; accessToken: string };
            createdTokens.push({ id: sub.id, accessToken: sub.accessToken });
          })
        );

        if (failures.length > 0) {
          throw new Error(
            `Order placed but subscription setup failed: ${failures.join("; ")}. Please contact support.`
          );
        }

        if (createdTokens.length > 0) {
          try {
            const stored = JSON.parse(localStorage.getItem("lab_subscription_tokens") ?? "[]") as Array<{ id: number; accessToken: string }>;
            const merged = [
              ...stored.filter((s) => !createdTokens.some((n) => n.id === s.id)),
              ...createdTokens,
            ];
            localStorage.setItem("lab_subscription_tokens", JSON.stringify(merged));
          } catch {
          }
        }
      }

      if (isCrypto) {
        const invoiceRes = await fetch(
          `/api/orders/${order.id}/crypto-invoice`,
          { method: "POST", headers: orderAuthHeaders }
        );
        if (!invoiceRes.ok) {
          const err = (await invoiceRes.json()) as { message?: string };
          throw new Error(err.message ?? "Failed to create invoice");
        }
        const inv = (await invoiceRes.json()) as CryptoInvoice;
        setInvoice(inv);
        setStep("awaiting_payment");

        pollRef.current = setInterval(
          () => pollOrder(order.id),
          POLL_INTERVAL_MS
        );
      } else {
        // ACH / wire rail: fetch bank instructions + reference code and show them.
        const achRes = await fetch(
          `/api/orders/${order.id}/ach-instructions`,
          { method: "POST", headers: orderAuthHeaders }
        );
        if (!achRes.ok) {
          const err = (await achRes.json()) as { message?: string };
          throw new Error(err.message ?? "Failed to create ACH instructions");
        }
        const achData = (await achRes.json()) as AchInstructions;
        setAch(achData);
        setStep("awaiting_ach");
      }
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "An error occurred"
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleField(field: keyof ShippingForm) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setShipping((prev) => ({ ...prev, [field]: e.target.value }));
      if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
    };
  }

  function resetToForm() {
    setStep("form");
    setInvoice(null);
    setAch(null);
    setOrderId(null);
    setSubmitError(null);
  }

  if (cartItems.length === 0 && step === "form") {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
        <ShoppingBag className="w-16 h-16 text-muted-foreground mb-4" />
        <h1 className="text-2xl font-semibold text-foreground mb-2">
          Your cart is empty
        </h1>
        <p className="text-muted-foreground mb-6">
          Add some research-grade peptides before checking out.
        </p>
        <Button asChild>
          <Link href="/retail">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Browse Products
          </Link>
        </Button>
      </div>
    );
  }

  if (step === "awaiting_payment" && invoice && orderId) {
    return (
      <div className="px-4 py-12">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-full px-4 py-1.5 text-sm text-teal-ink mb-4">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              Awaiting On-Chain Payment
            </div>
            <h1 className="text-2xl font-semibold text-foreground mb-1">
              Send {invoice.currency} to complete your order
            </h1>
            <p className="text-muted-foreground text-sm">
              Send exactly the amount shown. This address is unique to your
              order.
            </p>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 space-y-6 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  Amount Due
                </p>
                <p className="text-3xl font-mono font-bold text-foreground">
                  {invoice.amount}{" "}
                  <span className="text-teal-ink">{invoice.currency}</span>
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  ≈ {formatCents(invoice.amountCents)} USD
                </p>
              </div>
              <CountdownTimer expiresAt={invoice.expiresAt} />
            </div>

            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                Payment Address
              </p>
              {invoice.paymentAddress ? (
                <CopyableAddress address={invoice.paymentAddress} />
              ) : (
                <p className="text-muted-foreground text-sm">Address unavailable</p>
              )}
            </div>

            <div className="flex justify-center">
              <div className="bg-white p-3 rounded-xl shadow-sm border border-border">
                <img
                  src={`/api/orders/${orderId}/payment-qr`}
                  alt="Scan to pay"
                  width={200}
                  height={200}
                  className="block"
                />
              </div>
            </div>

            <div className="bg-muted border border-border rounded-lg p-4 flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse mt-1.5 shrink-0" />
              <p className="text-sm text-muted-foreground leading-relaxed">
                <span className="text-foreground font-medium">
                  Auto-detecting payment every 6 seconds.
                </span>{" "}
                You will be redirected automatically when your transaction
                confirms on-chain. Do not close this tab.
              </p>
            </div>

            {invoice.paymentUrl ? (
              <a
                href={invoice.paymentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 text-sm text-teal-ink hover:underline underline-offset-4 transition-colors"
              >
                Open in BTCPayServer <ChevronRight className="w-4 h-4" />
              </a>
            ) : null}
          </div>

          <p className="text-center text-xs text-muted-foreground mt-4">
            Order ID: <span className="font-mono">{orderId}</span>
          </p>
        </div>
      </div>
    );
  }

  if (step === "awaiting_ach" && ach && orderId) {
    return (
      <div className="px-4 py-12">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-full px-4 py-1.5 text-sm text-teal-ink mb-4">
              <Landmark className="w-4 h-4" />
              Awaiting Bank Transfer
            </div>
            <h1 className="text-2xl font-semibold text-foreground mb-1">
              Send your ACH / wire transfer to complete this order
            </h1>
            <p className="text-muted-foreground text-sm">
              Include the reference code below in the transfer memo so we can match
              your payment. Your order confirms once funds are received.
            </p>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 space-y-6 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  Amount Due
                </p>
                <p className="text-3xl font-mono font-bold text-foreground">
                  {formatCents(ach.amountCents)}{" "}
                  <span className="text-teal-ink">{ach.currency}</span>
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                Reference Code (include in memo)
              </p>
              <CopyableAddress address={ach.referenceCode} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              {[
                ["Beneficiary", ach.instructions.beneficiaryName],
                ["Bank", ach.instructions.bankName],
                ["Routing Number", ach.instructions.routingNumber],
                ["Account Number", ach.instructions.accountNumber],
                ["Account Type", ach.instructions.accountType],
              ].map(([label, value]) => (
                <div key={label} className="bg-muted border border-border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                    {label}
                  </p>
                  <p className="text-foreground font-mono break-all">{value}</p>
                </div>
              ))}
            </div>

            <div className="bg-muted border border-border rounded-lg p-4 text-sm text-muted-foreground leading-relaxed">
              After you send the transfer, our team confirms receipt and your order
              status updates to confirmed. You can safely close this tab.
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-4">
            Order ID: <span className="font-mono">{orderId}</span>
          </p>
        </div>
      </div>
    );
  }

  if (step === "confirmed") {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
        <div className="w-16 h-16 rounded-full bg-good-tint border border-good/40 flex items-center justify-center mb-4">
          <Check className="w-8 h-8 text-good" />
        </div>
        <h1 className="text-2xl font-semibold text-foreground mb-2">
          Payment Confirmed
        </h1>
        <p className="text-muted-foreground">Redirecting to your order…</p>
      </div>
    );
  }

  if (step === "expired") {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
        <AlertTriangle className="w-12 h-12 text-warn mb-4" />
        <h1 className="text-2xl font-semibold text-foreground mb-2">
          Invoice Expired
        </h1>
        <p className="text-muted-foreground mb-2 max-w-sm">
          The 30-minute payment window closed before the transaction was
          broadcast. Your cart is still intact.
        </p>
        <p className="text-muted-foreground text-sm mb-6 max-w-sm">
          Please try again with a new crypto invoice, or choose ACH / wire at
          checkout.
        </p>
        <Button onClick={resetToForm}>Start New Order</Button>
      </div>
    );
  }

  if (step === "failed") {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
        <AlertTriangle className="w-12 h-12 text-crit mb-4" />
        <h1 className="text-2xl font-semibold text-foreground mb-2">
          Payment Failed
        </h1>
        <p className="text-muted-foreground mb-2 max-w-sm">
          The invoice was marked invalid by the payment processor. Your cart is
          still intact.
        </p>
        {orderId && (
          <p className="text-xs font-mono text-muted-foreground mb-2">
            Order: {orderId}
          </p>
        )}
        <p className="text-muted-foreground text-sm mb-6 max-w-sm">
          Please try again with a fresh crypto invoice, or contact support if
          funds were already sent.
        </p>
        <Button onClick={resetToForm}>Start New Order</Button>
      </div>
    );
  }

  return (
    <div className="px-4 py-12">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <Link
            href={isWholesale ? "/shop" : "/retail"}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to shop
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <form onSubmit={handleSubmit} className="space-y-6">
              {isWholesale && (
                <div className="bg-accent border border-accent-foreground/20 rounded-xl p-5">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 text-accent-foreground">
                      <Building2 className="w-4 h-4" />
                      <span className="text-sm font-semibold">
                        Wholesale · {session!.businessName || "Account"}
                      </span>
                    </div>
                    <span
                      className={`text-xs font-mono ${
                        moqMet ? "text-good" : "text-warn"
                      }`}
                    >
                      {totalKits} / {WHOLESALE_MOQ_KITS} kits
                    </span>
                  </div>
                  <p className="text-xs text-accent-foreground/80 leading-relaxed">
                    Your{" "}
                    {session!.priceTierName ? (
                      <span className="font-medium text-accent-foreground">
                        {session!.priceTierName}
                      </span>
                    ) : (
                      "assigned"
                    )}{" "}
                    tier pricing applies — final per-kit prices are resolved by the
                    server at order creation and reflected in the amount due.
                  </p>
                  {!moqMet && (
                    <p className="mt-2 text-xs text-warn">
                      Add {WHOLESALE_MOQ_KITS - totalKits} more kit
                      {WHOLESALE_MOQ_KITS - totalKits === 1 ? "" : "s"} to reach the{" "}
                      {WHOLESALE_MOQ_KITS}-kit minimum before ordering.
                    </p>
                  )}
                </div>
              )}
              <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                <h2 className="text-base font-semibold text-foreground mb-5">
                  Shipping Information
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <Label
                      htmlFor="name"
                      className="text-muted-foreground text-sm mb-1.5 block"
                    >
                      Full Name
                    </Label>
                    <Input
                      id="name"
                      value={shipping.name}
                      onChange={handleField("name")}
                      placeholder="Dr. Jane Smith"
                    />
                    {errors.name && (
                      <p className="text-crit text-xs mt-1">{errors.name}</p>
                    )}
                  </div>

                  <div className="sm:col-span-2">
                    <Label
                      htmlFor="email"
                      className="text-muted-foreground text-sm mb-1.5 block"
                    >
                      Email Address
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={shipping.email}
                      onChange={handleField("email")}
                      placeholder="researcher@institution.edu"
                    />
                    {errors.email && (
                      <p className="text-crit text-xs mt-1">
                        {errors.email}
                      </p>
                    )}
                  </div>

                  <div className="sm:col-span-2">
                    <Label
                      htmlFor="address1"
                      className="text-muted-foreground text-sm mb-1.5 block"
                    >
                      Street Address
                    </Label>
                    <Input
                      id="address1"
                      value={shipping.address1}
                      onChange={handleField("address1")}
                      placeholder="123 Research Blvd"
                    />
                    {errors.address1 && (
                      <p className="text-crit text-xs mt-1">
                        {errors.address1}
                      </p>
                    )}
                  </div>

                  <div className="sm:col-span-2">
                    <Label
                      htmlFor="address2"
                      className="text-muted-foreground text-sm mb-1.5 block"
                    >
                      Apt / Suite{" "}
                      <span className="text-muted-foreground">(optional)</span>
                    </Label>
                    <Input
                      id="address2"
                      value={shipping.address2}
                      onChange={handleField("address2")}
                      placeholder="Suite 400"
                    />
                  </div>

                  <div>
                    <Label
                      htmlFor="city"
                      className="text-muted-foreground text-sm mb-1.5 block"
                    >
                      City
                    </Label>
                    <Input
                      id="city"
                      value={shipping.city}
                      onChange={handleField("city")}
                      placeholder="San Francisco"
                    />
                    {errors.city && (
                      <p className="text-crit text-xs mt-1">{errors.city}</p>
                    )}
                  </div>

                  <div>
                    <Label
                      htmlFor="state"
                      className="text-muted-foreground text-sm mb-1.5 block"
                    >
                      State / Province
                    </Label>
                    <Input
                      id="state"
                      value={shipping.state}
                      onChange={handleField("state")}
                      placeholder="CA"
                    />
                    {errors.state && (
                      <p className="text-crit text-xs mt-1">
                        {errors.state}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label
                      htmlFor="zip"
                      className="text-muted-foreground text-sm mb-1.5 block"
                    >
                      ZIP / Postal Code
                    </Label>
                    <Input
                      id="zip"
                      value={shipping.zip}
                      onChange={handleField("zip")}
                      placeholder="94102"
                    />
                    {errors.zip && (
                      <p className="text-crit text-xs mt-1">{errors.zip}</p>
                    )}
                  </div>

                  <div>
                    <Label
                      htmlFor="country"
                      className="text-muted-foreground text-sm mb-1.5 block"
                    >
                      Country
                    </Label>
                    <Input
                      id="country"
                      value={shipping.country}
                      onChange={handleField("country")}
                      placeholder="US"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                <h2 className="text-base font-semibold text-foreground mb-1">
                  Payment Method
                </h2>
                {cryptoDiscountBps > 0 && !isWholesale && (
                  <p className="text-xs text-muted-foreground mb-5">
                    Crypto payments receive a {formatBpsPct(cryptoDiscountBps)}%
                    discount — applied automatically.
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(
                    [
                      {
                        value: "crypto_btc" as PaymentMethod,
                        label: "Bitcoin",
                        sub: discountPctLabel ? `BTC · ${discountPctLabel}% off` : "BTC",
                        icon: <Bitcoin className="w-5 h-5" />,
                        available: true,
                      },
                      {
                        value: "crypto_usdc" as PaymentMethod,
                        label: "USD Coin",
                        sub: discountPctLabel ? `USDC · ${discountPctLabel}% off` : "USDC",
                        icon: (
                          <span className="w-5 h-5 text-xs font-bold flex items-center justify-center rounded-full bg-blue-600 text-white">
                            $
                          </span>
                        ),
                        available: true,
                      },
                      {
                        value: "ach" as PaymentMethod,
                        label: "ACH / Wire",
                        sub: ACH_ENABLED ? "Bank transfer" : "Unavailable",
                        icon: <Landmark className="w-5 h-5" />,
                        available: ACH_ENABLED,
                      },
                    ] as const
                  ).map((method) => {
                    const selected = paymentMethod === method.value;
                    return (
                      <button
                        key={method.value}
                        type="button"
                        disabled={!method.available}
                        onClick={() =>
                          method.available && setPaymentMethod(method.value)
                        }
                        className={`relative flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all ${
                          !method.available
                            ? "opacity-40 cursor-not-allowed border-border bg-muted"
                            : selected
                            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                            : "border-border bg-card hover:border-primary/50"
                        }`}
                      >
                        <div
                          className={`${
                            selected ? "text-teal-ink" : "text-muted-foreground"
                          }`}
                        >
                          {method.icon}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {method.label}
                          </p>
                          <p
                            className={`text-xs ${
                              method.value === "crypto_btc" ||
                              method.value === "crypto_usdc"
                                ? "text-good"
                                : "text-muted-foreground"
                            }`}
                          >
                            {method.sub}
                          </p>
                        </div>
                        {selected && (
                          <div className="absolute top-3 right-3 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 text-primary-foreground" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {!isWholesale && (
                  <div className="mt-5 pt-5 border-t border-border">
                    <Label
                      htmlFor="discount-code"
                      className="text-muted-foreground text-sm mb-1.5 block"
                    >
                      Discount code <span className="text-muted-foreground/70">(optional)</span>
                    </Label>
                    {appliedCode && quote ? (
                      <div className="flex items-center gap-2">
                        <Badge className="bg-good-tint text-good border-good/30 font-mono">
                          {quote.discountCode}
                        </Badge>
                        <span className="text-xs text-good">
                          −{formatCents(quote.promoDiscountCents)} applied
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-xs text-muted-foreground"
                          onClick={() => {
                            setAppliedCode(null);
                            setQuote(null);
                            setCodeInput("");
                            setCodeError(null);
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Input
                          id="discount-code"
                          value={codeInput}
                          onChange={(e) => {
                            setCodeInput(e.target.value);
                            if (codeError) setCodeError(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              if (codeInput.trim()) setAppliedCode(codeInput.trim().toUpperCase());
                            }
                          }}
                          placeholder="e.g. LAUNCH10"
                          maxLength={64}
                          className="max-w-xs font-mono uppercase"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!codeInput.trim() || quoting}
                          onClick={() => setAppliedCode(codeInput.trim().toUpperCase())}
                        >
                          {quoting ? "Checking\u2026" : "Apply"}
                        </Button>
                      </div>
                    )}
                    {codeError && (
                      <p className="text-crit text-xs mt-1.5">{codeError}</p>
                    )}
                  </div>
                )}
              </div>

              <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                <h2 className="text-base font-semibold text-foreground mb-5">
                  Research Use Only (RUO) Attestation
                </h2>

                <div className="mb-4">
                  <Label
                    htmlFor="signerName"
                    className="text-muted-foreground text-sm mb-1.5 block"
                  >
                    Signer Name
                  </Label>
                  <Input
                    id="signerName"
                    value={signerName}
                    onChange={(e) => {
                      setSignerName(e.target.value);
                      if (attestErrors.signerName)
                        setAttestErrors((prev) => ({ ...prev, signerName: undefined }));
                    }}
                    placeholder="Dr. Jane Smith"
                  />
                  {attestErrors.signerName && (
                    <p className="text-crit text-xs mt-1">{attestErrors.signerName}</p>
                  )}
                </div>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ruoAffirmed}
                    onChange={(e) => {
                      setRuoAffirmed(e.target.checked);
                      if (attestErrors.ruo)
                        setAttestErrors((prev) => ({ ...prev, ruo: undefined }));
                    }}
                    className="mt-1 h-4 w-4 shrink-0 accent-primary"
                  />
                  <span className="text-sm text-foreground leading-relaxed">
                    {RUO_ATTESTATION_LABEL}
                  </span>
                </label>
                {attestErrors.ruo && (
                  <p className="text-crit text-xs mt-2">{attestErrors.ruo}</p>
                )}
              </div>

              {submitError && (
                <div className="flex items-start gap-3 bg-crit-tint border border-crit/40 rounded-xl p-4 text-sm text-crit">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  {submitError}
                </div>
              )}

              <Button
                type="submit"
                disabled={submitting || !ruoAffirmed || !signerName.trim() || !moqMet}
                className="w-full font-semibold py-3 h-auto rounded-xl"
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    Creating Order…
                  </span>
                ) : isWholesale ? (
                  <span className="flex items-center gap-2 justify-center">
                    <Building2 className="w-4 h-4" />
                    {moqMet
                      ? "Place Wholesale Order · Tier Pricing"
                      : `Add ${WHOLESALE_MOQ_KITS - totalKits} More Kit${
                          WHOLESALE_MOQ_KITS - totalKits === 1 ? "" : "s"
                        }`}
                  </span>
                ) : (
                  <span className="flex items-center gap-2 justify-center">
                    {isCrypto ? (
                      <Bitcoin className="w-4 h-4" />
                    ) : (
                      <Landmark className="w-4 h-4" />
                    )}
                    Place Order · {formatCents(finalCents)}
                    {isCrypto && discountCents > 0 && (
                      <Badge className="bg-good text-white text-[10px] px-1.5 py-0">
                        −{formatBpsPct(cryptoDiscountBps)}%
                      </Badge>
                    )}
                  </span>
                )}
              </Button>
            </form>
          </div>

          <div className="lg:col-span-1">
            <OrderSummaryPanel
              subtotalCents={subtotalCents}
              promoDiscountCents={promoDiscountCents}
              cryptoDiscountCents={cryptoDiscountCents}
              appliedCode={quote?.discountCode ?? null}
              discountBps={isWholesale ? 0 : cryptoDiscountBps}
              paymentMethod={paymentMethod}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
