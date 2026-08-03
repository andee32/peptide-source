import { useLocation } from "wouter";
import { useCart } from "@/contexts/cart";
import { Button } from "@/components/ui/button";
import { Minus, Plus, X, ArrowRight, PackageOpen } from "lucide-react";

const WHOLESALE_MOQ_KITS = 5;

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function WholesaleOrderPanel() {
  const [, navigate] = useLocation();
  const { cartItems, updateQuantity, removeFromCart } = useCart();

  // Only kit lines count toward the wholesale order — the cart is shared with
  // the retail flow, so a stray retail vial must not advance the MOQ or total.
  const kitItems = cartItems.filter((i) => i.unitType === "kit");
  const kits = kitItems.reduce((n, i) => n + i.quantity, 0);
  const totalCents = kitItems.reduce((n, i) => n + i.priceCents * i.quantity, 0);
  const moqMet = kits >= WHOLESALE_MOQ_KITS;
  const remaining = Math.max(0, WHOLESALE_MOQ_KITS - kits);
  const pct = Math.min(100, (kits / WHOLESALE_MOQ_KITS) * 100);

  return (
    <div className="sticky top-20 rounded-xl border border-border bg-card">
      <div className="px-5 pt-5 pb-4 border-b border-border">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">// Active Order</p>
        <p className="font-display text-lg font-bold mt-1">
          {kits} {kits === 1 ? "kit" : "kits"} selected
        </p>
      </div>

      {kitItems.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <PackageOpen className="h-7 w-7 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Add kits from the catalog. Wholesale orders have a{" "}
            <strong>{WHOLESALE_MOQ_KITS}-kit minimum</strong>.
          </p>
        </div>
      ) : (
        <>
          <div className="px-5 py-3 space-y-3 max-h-[40vh] overflow-y-auto">
            {kitItems.map((item) => (
              <div key={item.variantId} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    {item.productName} {item.variantName}
                  </div>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {formatCents(item.priceCents)} × {item.quantity}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                    className="h-6 w-6 rounded border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="font-mono text-sm w-6 text-center tabular-nums">{item.quantity}</span>
                  <button
                    onClick={() => updateQuantity(item.variantId, item.quantity + 1)}
                    className="h-6 w-6 rounded border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    aria-label="Increase quantity"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => removeFromCart(item.variantId)}
                    className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                    aria-label="Remove"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* MOQ progress */}
          <div className="px-5 pb-3">
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${moqMet ? "bg-primary" : "bg-[color-mix(in_srgb,var(--brand-gold)_80%,transparent)]"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className={`mt-1.5 text-center font-mono text-[11px] uppercase tracking-wider ${moqMet ? "text-primary" : "text-muted-foreground"}`}>
              {moqMet ? "Minimum met" : `${remaining} more to reach ${WHOLESALE_MOQ_KITS}-kit minimum`}
            </p>
          </div>

          <div className="px-5 py-4 border-t border-border space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Kits</span>
              <span className="font-mono tabular-nums">{kits}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Est. total</span>
              <span className="font-mono text-lg font-bold tabular-nums">{formatCents(totalCents)}</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              List-price estimate — your tier pricing and any adjustments apply at checkout.
            </p>
          </div>

          <div className="px-5 pb-5">
            <Button
              className="w-full font-mono uppercase tracking-widest h-11 gap-2"
              disabled={!moqMet}
              onClick={() => navigate("/checkout")}
            >
              {moqMet ? (
                <>Place Order <ArrowRight className="h-4 w-4" /></>
              ) : (
                `Add ${remaining} more kit${remaining === 1 ? "" : "s"}`
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
