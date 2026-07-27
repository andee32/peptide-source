import { useEffect, useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import {
  CheckCircle,
  Clock,
  XCircle,
  AlertTriangle,
  ExternalLink,
  ArrowLeft,
  Truck,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import {
  bearerHeaders,
  useCustomerAuth,
  useCustomerSession,
} from "@/hooks/useCustomerAuth";
import { useWholesaleSession } from "@/hooks/useWholesaleSession";

const MIN_PASSWORD_LENGTH = 8;

interface OrderLineItem {
  variantId: number;
  productName: string;
  variantName: string;
  quantity: number;
  unitPriceCents: number;
}

interface PaymentRecord {
  id: string;
  currency: string;
  amount: string;
  amountCents: number;
  paymentAddress: string | null;
  txHash: string | null;
  confirmedAt: string | null;
  expiresAt: string;
  status: "pending" | "confirmed" | "expired" | "failed";
}

interface OrderDetail {
  id: string;
  subtotalCents: number;
  discountCents: number;
  discountSource: "code" | "subscription" | null;
  discountCode: string | null;
  promoDiscountCents: number;
  cryptoDiscountCents: number;
  totalCents: number;
  paymentMethod: "crypto_btc" | "crypto_usdc" | "ach" | "wire";
  channel: "retail" | "wholesale";
  status: "pending" | "awaiting_payment" | "confirmed" | "shipped" | "failed" | "expired" | "refunded";
  lineItems: OrderLineItem[];
  shippingName: string;
  shippingEmail: string;
  shippingAddress1: string;
  shippingAddress2?: string | null;
  shippingCity: string;
  shippingState: string;
  shippingZip: string;
  shippingCountry: string;
  payment: PaymentRecord | null;
  createdAt: string;
  trackingNumber?: string | null;
  carrier?: string | null;
  shippedAt?: string | null;
  customerUserId?: string | null;
}

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function explorerUrl(txHash: string, currency: string) {
  if (currency === "BTC") return `https://mempool.space/tx/${txHash}`;
  return `https://etherscan.io/tx/${txHash}`;
}

export function OrderConfirmationPage() {
  const { id } = useParams<{ id?: string }>();
  const [, navigate] = useLocation();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // GET /orders/:id is only an open capability URL for true guest orders. An
  // order stamped with a customer or a wholesale account requires the matching
  // credential, so present whichever session this browser holds.
  const customerSession = useCustomerSession();
  const { wholesaleHeaders } = useWholesaleSession();
  const customerToken = customerSession?.token ?? null;
  const { register } = useCustomerAuth();

  // Optional post-purchase upsell: let a guest order be claimed by a fresh
  // account. Non-blocking — the confirmation itself renders fine either way.
  const [claimPassword, setClaimPassword] = useState("");
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [claimRegisterError, setClaimRegisterError] = useState<string | null>(null);
  const [claimResult, setClaimResult] = useState<"idle" | "linked" | "link-failed">("idle");

  useEffect(() => {
    if (!id) {
      navigate("/retail");
      return;
    }
    async function load() {
      try {
        const res = await fetch(`/api/orders/${id}`, {
          headers: {
            ...bearerHeaders(customerToken),
            ...wholesaleHeaders,
          },
        });
        if (!res.ok) {
          setError("Order not found");
          return;
        }
        setOrder((await res.json()) as OrderDetail);
      } catch {
        setError("Failed to load order");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, navigate, customerToken, wholesaleHeaders]);

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
        <XCircle className="w-12 h-12 text-crit mb-4" />
        <h1 className="text-xl font-semibold text-foreground mb-2">
          Order Not Found
        </h1>
        <p className="text-muted-foreground mb-6">{error ?? "Something went wrong."}</p>
        <Button asChild variant="outline">
          <Link href="/retail">Return to Shop</Link>
        </Button>
      </div>
    );
  }

  const { status, payment } = order;
  const shopHref = order.channel === "wholesale" ? "/shop" : "/retail";
  const showAccountCard = !order.customerUserId && !customerSession;

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!order || claimPassword.length < MIN_PASSWORD_LENGTH || claimSubmitting) return;
    setClaimSubmitting(true);
    setClaimRegisterError(null);
    try {
      const session = await register({
        email: order.shippingEmail,
        password: claimPassword,
      });
      try {
        const res = await fetch(`/api/orders/${order.id}/claim`, {
          method: "POST",
          headers: bearerHeaders(session.token),
        });
        setClaimResult(res.ok ? "linked" : "link-failed");
      } catch {
        setClaimResult("link-failed");
      }
    } catch {
      setClaimRegisterError(
        "An account with this email already exists — sign in to link this order.",
      );
    } finally {
      setClaimSubmitting(false);
    }
  }
  const isConfirmed = status === "confirmed";
  const isShipped = status === "shipped";
  const isAwaiting = status === "awaiting_payment" || status === "pending";
  const isExpired = status === "expired";
  const isFailed = status === "failed";

  return (
    <div className="px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <Link
          href={shopHref}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Continue shopping
        </Link>

        <div className="text-center mb-8">
          {(isConfirmed || isShipped) && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-good-tint border border-good/40 flex items-center justify-center">
                {isShipped ? (
                  <Truck className="w-8 h-8 text-good" />
                ) : (
                  <CheckCircle className="w-8 h-8 text-good" />
                )}
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-foreground">
                  {isShipped ? "Order Shipped" : "Payment Confirmed"}
                </h1>
                <p className="text-muted-foreground text-sm mt-1">
                  {isShipped
                    ? "Your order is on its way."
                    : "Your order has been verified on-chain. Thank you for your research investment."}
                </p>
              </div>
            </div>
          )}
          {isAwaiting && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
                <Clock className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-foreground">
                  Awaiting Payment
                </h1>
                <p className="text-muted-foreground text-sm mt-1">
                  Your order is placed — waiting for on-chain settlement.
                </p>
              </div>
            </div>
          )}
          {isExpired && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-warn-tint border border-warn/40 flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-warn" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-foreground">
                  Invoice Expired
                </h1>
                <p className="text-muted-foreground text-sm mt-1">
                  The payment window closed. Please place a new order.
                </p>
              </div>
            </div>
          )}
          {isFailed && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-crit-tint border border-crit/40 flex items-center justify-center">
                <XCircle className="w-8 h-8 text-crit" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-foreground">
                  Payment Failed
                </h1>
                <p className="text-muted-foreground text-sm mt-1">
                  Contact support with your order ID.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-5">
          {isShipped && (
            <div className="bg-good-tint border border-good/40 rounded-xl p-5">
              <p className="text-xs text-good/80 uppercase tracking-wider mb-1">
                Tracking
              </p>
              {order.trackingNumber ? (
                <p className="text-sm text-good">
                  Shipped via {order.carrier ?? "carrier"} — Tracking:{" "}
                  <span className="font-mono">{order.trackingNumber}</span>
                </p>
              ) : (
                <p className="text-sm text-good">
                  Tracking details will follow.
                </p>
              )}
              {order.shippedAt && (
                <p className="text-xs text-good/70 mt-2">
                  Shipped on {new Date(order.shippedAt).toLocaleDateString()}
                </p>
              )}
            </div>
          )}

          {isConfirmed && payment?.txHash && (
            <div className="bg-good-tint border border-good/40 rounded-xl p-5">
              <p className="text-xs text-good/80 uppercase tracking-wider mb-1">
                Transaction Hash
              </p>
              <div className="flex items-center gap-3">
                <code className="flex-1 text-xs font-mono text-good break-all">
                  {payment.txHash}
                </code>
                <a
                  href={explorerUrl(payment.txHash, payment.currency)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-good hover:text-good/80 transition-colors"
                  title="View on explorer"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
              {payment.confirmedAt && (
                <p className="text-xs text-good/70 mt-2">
                  Confirmed at {new Date(payment.confirmedAt).toLocaleString()}
                </p>
              )}
            </div>
          )}

          <div className="bg-card border border-border rounded-xl divide-y divide-border shadow-sm">
            <div className="p-5">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
                Items Ordered
              </p>
              <div className="space-y-3">
                {(order.lineItems as OrderLineItem[]).map((item) => (
                  <div
                    key={item.variantId}
                    className="flex justify-between text-sm"
                  >
                    <div>
                      <span className="text-foreground font-medium">
                        {item.productName}
                      </span>
                      <br />
                      <span className="text-muted-foreground">
                        {item.variantName} × {item.quantity}
                      </span>
                    </div>
                    <span className="font-mono text-foreground">
                      {formatCents(item.unitPriceCents * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5 space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Subtotal</span>
                <span className="font-mono">
                  {formatCents(order.subtotalCents)}
                </span>
              </div>
              {order.promoDiscountCents > 0 && (
                <div className="flex justify-between text-sm text-good">
                  <span>
                    Discount code
                    {order.discountCode ? ` ${order.discountCode}` : ""}
                  </span>
                  <span className="font-mono">
                    −{formatCents(order.promoDiscountCents)}
                  </span>
                </div>
              )}
              {order.cryptoDiscountCents > 0 && (
                <div className="flex justify-between text-sm text-good">
                  <span>Crypto payment discount</span>
                  <span className="font-mono">
                    −{formatCents(order.cryptoDiscountCents)}
                  </span>
                </div>
              )}
              {order.discountCents >
                order.promoDiscountCents + order.cryptoDiscountCents && (
                <div className="flex justify-between text-sm text-good">
                  <span>Discount</span>
                  <span className="font-mono">
                    −{formatCents(
                      order.discountCents -
                        order.promoDiscountCents -
                        order.cryptoDiscountCents
                    )}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-base font-semibold text-foreground pt-2 border-t border-border">
                <span>Total Paid</span>
                <span className="font-mono text-teal-ink">
                  {formatCents(order.totalCents)}
                </span>
              </div>
              {payment && (
                <p className="text-xs text-muted-foreground text-right">
                  {payment.amount} {payment.currency}
                </p>
              )}
            </div>

            <div className="p-5">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
                Ship To
              </p>
              <div className="text-sm text-foreground leading-relaxed">
                <p className="text-foreground font-medium">{order.shippingName}</p>
                <p>{order.shippingAddress1}</p>
                {order.shippingAddress2 && <p>{order.shippingAddress2}</p>}
                <p>
                  {order.shippingCity}, {order.shippingState}{" "}
                  {order.shippingZip}
                </p>
                <p>{order.shippingCountry}</p>
                <p className="text-muted-foreground mt-1">{order.shippingEmail}</p>
              </div>
            </div>
          </div>

          {showAccountCard && (
            <div className="bg-card border border-border rounded-xl p-5">
              {claimResult === "linked" ? (
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-good shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Account created — this order is now saved to your account.
                    </p>
                    <Link
                      href="/account"
                      className="text-sm text-primary hover:underline mt-1 inline-block"
                    >
                      View your account
                    </Link>
                  </div>
                </div>
              ) : claimResult === "link-failed" ? (
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-warn shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">
                    Couldn't link the order — you can find it from your account.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleCreateAccount} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-primary" />
                    <p className="text-sm font-medium text-foreground">
                      Create an account to track this order
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Save your shipping details and see this order — and future
                    ones — in one place.
                  </p>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                      Email
                    </p>
                    <Input
                      type="email"
                      value={order.shippingEmail}
                      readOnly
                      disabled
                      className="font-mono bg-muted/40"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                      Password
                    </p>
                    <PasswordInput
                      value={claimPassword}
                      onChange={(e) => setClaimPassword(e.target.value)}
                      autoComplete="new-password"
                      placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                      minLength={MIN_PASSWORD_LENGTH}
                    />
                  </div>
                  {claimRegisterError && (
                    <p className="text-xs text-crit">
                      {claimRegisterError}{" "}
                      <Link href="/account/login" className="underline">
                        Sign in
                      </Link>
                    </p>
                  )}
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={
                      claimPassword.length < MIN_PASSWORD_LENGTH || claimSubmitting
                    }
                  >
                    {claimSubmitting ? "Creating…" : "Create account"}
                  </Button>
                </form>
              )}
            </div>
          )}

          <div className="text-center">
            <p className="text-xs text-muted-foreground font-mono mb-4">
              Order ID: {order.id}
            </p>
            {(isExpired || isFailed) && (
              <Button asChild>
                <Link href="/checkout">Place New Order</Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
