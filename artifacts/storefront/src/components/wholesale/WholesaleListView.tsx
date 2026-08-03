import { useMemo, useState } from "react";
import type { Product, ProductVariant } from "@app/api-client-react";
import { useCart } from "@/contexts/cart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Check } from "lucide-react";

// Distribution-vendor style dense catalog: one row per kit SKU, grouped by
// category. Adds go straight to the order sidebar (no drawer pop).
function VariantRow({ product, variant }: { product: Product; variant: ProductVariant }) {
  const { addToCart } = useCart();
  const [qty, setQty] = useState(1);
  const [justAdded, setJustAdded] = useState(false);

  const add = () => {
    if (qty < 1) return;
    addToCart(
      {
        productId: product.id,
        variantId: variant.id,
        variantName: variant.name,
        productName: product.name,
        priceCents: variant.priceCents,
        quantity: qty,
        unitType: "kit",
      },
      { openDrawer: false },
    );
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 900);
  };

  return (
    <div className="grid grid-cols-[3.5rem_1fr_auto_auto_auto] items-center gap-3 py-3 border-b border-border/50 last:border-b-0">
      <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{variant.sku}</span>
      <div className="min-w-0">
        <div className="font-semibold text-sm truncate">{product.name}</div>
        <div className="font-mono text-[11px] text-muted-foreground">
          {variant.concentration} · {variant.vialsPerUnit} vial/kit
        </div>
        {variant.coaUrl && (
          <a
            href={variant.coaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[11px] text-primary hover:underline"
          >
            View COA →
          </a>
        )}
      </div>
      <span className="font-mono text-sm font-semibold text-primary tabular-nums whitespace-nowrap">
        ${(variant.priceCents / 100).toFixed(2)}
      </span>
      <Input
        type="number"
        min={1}
        max={999}
        value={qty}
        onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
        aria-label={`Quantity for ${variant.sku}`}
        className="h-8 w-16 font-mono text-sm text-center"
        disabled={!variant.inStock}
      />
      <Button
        size="sm"
        variant={justAdded ? "default" : "secondary"}
        className="h-8 font-mono text-xs uppercase tracking-wider gap-1 w-[4.5rem]"
        onClick={add}
        disabled={!variant.inStock}
      >
        {!variant.inStock ? (
          "Out"
        ) : justAdded ? (
          <><Check className="h-3.5 w-3.5" /> Added</>
        ) : (
          <><Plus className="h-3.5 w-3.5" /> Add</>
        )}
      </Button>
    </div>
  );
}

export function WholesaleListView({ products }: { products: Product[] }) {
  // Group products by category, preserving first-seen order.
  const grouped = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of products) {
      const list = map.get(p.category) ?? [];
      list.push(p);
      map.set(p.category, list);
    }
    return Array.from(map.entries());
  }, [products]);

  return (
    <div className="space-y-10">
      {grouped.map(([category, items]) => (
        <section key={category}>
          <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-primary mb-2 pb-2 border-b border-border">
            {category}
          </h2>
          <div>
            {items.flatMap((product) =>
              (product.variants ?? []).map((variant) => (
                <VariantRow key={variant.id} product={product} variant={variant} />
              )),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
