import { useEffect, useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import {
  CheckCircle,
  Clock,
  XCircle,
  AlertTriangle,
  ExternalLink,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";

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
  totalCents: number;
  paymentMethod: "card" | "crypto_btc" | "crypto_usdc";
  status: "pending" | "awaiting_payment" | "confirmed" | "failed" | "expired";
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

  useEffect(() => {
    if (!id) {
      navigate("/shop");
      return;
    }
    async function load() {
      try {
        const res = await fetch(`/api/orders/${id}`);
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
  }, [id, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-zinc-700 border-t-teal-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-center px-4">
        <XCircle className="w-12 h-12 text-red-400 mb-4" />
        <h1 className="text-xl font-semibold text-white mb-2">
          Order Not Found
        </h1>
        <p className="text-zinc-400 mb-6">{error ?? "Something went wrong."}</p>
        <Button asChild variant="outline">
          <Link href="/shop">Return to Shop</Link>
        </Button>
      </div>
    );
  }

  const { status, payment } = order;
  const isConfirmed = status === "confirmed";
  const isAwaiting = status === "awaiting_payment" || status === "pending";
  const isExpired = status === "expired";
  const isFailed = status === "failed";

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/shop"
          className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Continue shopping
        </Link>

        <div className="text-center mb-8">
          {isConfirmed && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-emerald-950 border border-emerald-700 flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-white">
                  Payment Confirmed
                </h1>
                <p className="text-zinc-400 text-sm mt-1">
                  Your order has been verified on-chain. Thank you for your
                  research investment.
                </p>
              </div>
            </div>
          )}
          {isAwaiting && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-teal-950 border border-teal-700 flex items-center justify-center">
                <Clock className="w-8 h-8 text-teal-400" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-white">
                  Awaiting Payment
                </h1>
                <p className="text-zinc-400 text-sm mt-1">
                  Your order is placed — waiting for on-chain settlement.
                </p>
              </div>
            </div>
          )}
          {isExpired && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-amber-950 border border-amber-700 flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-amber-400" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-white">
                  Invoice Expired
                </h1>
                <p className="text-zinc-400 text-sm mt-1">
                  The payment window closed. Please place a new order.
                </p>
              </div>
            </div>
          )}
          {isFailed && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-red-950 border border-red-700 flex items-center justify-center">
                <XCircle className="w-8 h-8 text-red-400" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-white">
                  Payment Failed
                </h1>
                <p className="text-zinc-400 text-sm mt-1">
                  Contact support with your order ID.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-5">
          {isConfirmed && payment?.txHash && (
            <div className="bg-emerald-950/40 border border-emerald-800/50 rounded-xl p-5">
              <p className="text-xs text-emerald-400/70 uppercase tracking-wider mb-1">
                Transaction Hash
              </p>
              <div className="flex items-center gap-3">
                <code className="flex-1 text-xs font-mono text-emerald-300 break-all">
                  {payment.txHash}
                </code>
                <a
                  href={explorerUrl(payment.txHash, payment.currency)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-emerald-400 hover:text-emerald-300 transition-colors"
                  title="View on explorer"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
              {payment.confirmedAt && (
                <p className="text-xs text-emerald-400/50 mt-2">
                  Confirmed at {new Date(payment.confirmedAt).toLocaleString()}
                </p>
              )}
            </div>
          )}

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
            <div className="p-5">
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">
                Items Ordered
              </p>
              <div className="space-y-3">
                {(order.lineItems as OrderLineItem[]).map((item) => (
                  <div
                    key={item.variantId}
                    className="flex justify-between text-sm"
                  >
                    <div>
                      <span className="text-white font-medium">
                        {item.productName}
                      </span>
                      <br />
                      <span className="text-zinc-500">
                        {item.variantName} × {item.quantity}
                      </span>
                    </div>
                    <span className="font-mono text-zinc-300">
                      {formatCents(item.unitPriceCents * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5 space-y-2">
              <div className="flex justify-between text-sm text-zinc-400">
                <span>Subtotal</span>
                <span className="font-mono">
                  {formatCents(order.subtotalCents)}
                </span>
              </div>
              {order.discountCents > 0 && (
                <div className="flex justify-between text-sm text-emerald-400">
                  <span>Transparency Discount (10%)</span>
                  <span className="font-mono">
                    −{formatCents(order.discountCents)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-base font-semibold text-white pt-2 border-t border-zinc-800">
                <span>Total Paid</span>
                <span className="font-mono text-teal-300">
                  {formatCents(order.totalCents)}
                </span>
              </div>
              {payment && (
                <p className="text-xs text-zinc-500 text-right">
                  {payment.amount} {payment.currency}
                </p>
              )}
            </div>

            <div className="p-5">
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">
                Ship To
              </p>
              <div className="text-sm text-zinc-300 leading-relaxed">
                <p className="text-white font-medium">{order.shippingName}</p>
                <p>{order.shippingAddress1}</p>
                {order.shippingAddress2 && <p>{order.shippingAddress2}</p>}
                <p>
                  {order.shippingCity}, {order.shippingState}{" "}
                  {order.shippingZip}
                </p>
                <p>{order.shippingCountry}</p>
                <p className="text-zinc-500 mt-1">{order.shippingEmail}</p>
              </div>
            </div>
          </div>

          <div className="text-center">
            <p className="text-xs text-zinc-600 font-mono mb-4">
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
