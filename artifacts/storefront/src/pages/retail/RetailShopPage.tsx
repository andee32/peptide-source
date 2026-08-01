import { Link } from "wouter";
import { useListRetailProducts } from "@atlab/api-client-react";
import type { RetailProduct, RetailVariant } from "@atlab/api-client-react";
import { useCart } from "@/contexts/cart";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Beaker, FlaskConical, ShoppingCart, ArrowRight, FileText } from "lucide-react";
import { useMemo, useState } from "react";
import { useStoreSettings } from "@/hooks/useStoreSettings";

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function RetailProductCard({ product }: { product: RetailProduct }) {
  const { addToCart } = useCart();
  const { showVialImages } = useStoreSettings();
  const variants = product.variants;
  const [selectedId, setSelectedId] = useState<number>(variants[0]?.id ?? 0);

  const selected: RetailVariant | undefined =
    variants.find((v) => v.id === selectedId) ?? variants[0];

  const handleAdd = () => {
    if (!selected || !selected.inStock) return;
    addToCart({
      productId: product.id,
      variantId: selected.id,
      productName: product.name,
      variantName: selected.name,
      priceCents: selected.priceCents,
      quantity: 1,
    });
  };

  return (
    <Card className="group overflow-hidden flex flex-col h-full transition-all duration-300 hover:border-primary/40">
      {showVialImages && (
        <Link
          href={`/retail/${product.slug}`}
          className="relative aspect-square overflow-hidden bg-muted/50 flex items-center justify-center p-8"
        >
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              className="object-contain w-full h-full opacity-95 group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-card rounded-full max-w-[200px] max-h-[200px] border border-border">
              <Beaker className="h-20 w-20 text-muted-foreground opacity-30" />
              <span className="absolute font-mono text-6xl font-black text-muted-foreground opacity-10 uppercase">
                {product.name.substring(0, 2)}
              </span>
            </div>
          )}

          <div className="absolute top-4 left-4 flex flex-col gap-2">
            <Badge variant="secondary" className="w-fit font-mono">
              {product.category}
            </Badge>
            <Badge variant="verified" className="w-fit text-xs font-mono">
              {variants.some((v) => v.unitType === "kit")
                ? "Vials & kits"
                : "Single vial"}
            </Badge>
          </div>
        </Link>
      )}

      <CardContent className="p-6 flex-1 flex flex-col">
        {!showVialImages && (
          <div className="flex flex-wrap gap-2 mb-3">
            <Badge variant="secondary" className="w-fit font-mono">
              {product.category}
            </Badge>
            <Badge variant="verified" className="w-fit text-xs font-mono">
              {variants.some((v) => v.unitType === "kit")
                ? "Vials & kits"
                : "Single vial"}
            </Badge>
          </div>
        )}
        <div className="mb-2 flex items-baseline justify-between gap-4">
          <Link
            href={`/retail/${product.slug}`}
            className="font-sans text-xl font-bold tracking-tight line-clamp-1 hover:text-teal-ink transition-colors"
          >
            {product.name}
          </Link>
          <span className="font-mono text-sm text-teal-ink whitespace-nowrap font-semibold">
            {money(selected?.priceCents ?? product.startingPriceCents)}{" "}
            <span className="text-muted-foreground">
              / {selected?.unitType === "kit" ? "kit" : "vial"}
            </span>
          </span>
        </div>

        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
          {product.shortDescription}
        </p>

        <div className="flex items-center gap-4 mb-4">
          <Link
            href={`/retail/${product.slug}`}
            className="text-xs font-mono uppercase tracking-wider text-teal-ink hover:underline underline-offset-4 w-fit inline-flex items-center gap-1"
          >
            View details <ArrowRight className="h-3 w-3" />
          </Link>
          {selected?.coaUrl && (
            <a
              href={selected.coaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono uppercase tracking-wider text-primary hover:underline underline-offset-4 w-fit inline-flex items-center gap-1"
            >
              View COA <FileText className="h-3 w-3" />
            </a>
          )}
        </div>

        {variants.length > 1 && (
          <div className="mt-auto pt-2">
            <Select
              value={String(selectedId)}
              onValueChange={(v) => setSelectedId(Number(v))}
            >
              <SelectTrigger className="w-full font-mono text-xs">
                <SelectValue placeholder="Select concentration" />
              </SelectTrigger>
              <SelectContent>
                {variants.map((v) => (
                  <SelectItem key={v.id} value={String(v.id)} className="font-mono text-xs">
                    {v.name}
                    {v.unitType === "kit" ? ` (${v.vialsPerUnit}-vial kit)` : ""} —{" "}
                    {money(v.priceCents)}
                    {!v.inStock ? " (out of stock)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </CardContent>

      <CardFooter className="p-6 pt-0 mt-auto">
        <Button
          className="w-full group/btn font-mono uppercase tracking-wider text-xs"
          onClick={handleAdd}
          disabled={!selected?.inStock}
        >
          {selected?.inStock ? (
            <span className="flex items-center gap-2">
              <ShoppingCart className="h-3.5 w-3.5" /> Add to cart
            </span>
          ) : (
            "Out of stock"
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}

export function RetailShopPage() {
  const { data: products, isLoading } = useListRetailProducts();
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  const categories = useMemo(() => {
    if (!products) return ["All"];
    const cats = new Set(products.map((p) => p.category));
    return ["All", ...Array.from(cats)];
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    if (selectedCategory === "All") return products;
    return products.filter((p) => p.category === selectedCategory);
  }, [products, selectedCategory]);

  return (
    <div className="container mx-auto px-4 py-12 md:py-24 min-h-[calc(100vh-4rem)] flex flex-col">
      <div className="mb-8 text-center max-w-3xl mx-auto">
        <Badge variant="verified" className="mb-4 font-mono uppercase tracking-wider text-xs">
          Retail store
        </Badge>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
          Research Vials &amp; Kits
        </h1>
        <p className="text-lg text-muted-foreground">
          Buy individual research vials — and selected 10-vial kits — at retail
          pricing. No account, no minimum order. Every batch ships with an active
          third-party COA. For in-vitro and laboratory research only.
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          Buying in volume?{" "}
          <Link
            href="/wholesale"
            className="text-primary font-medium underline underline-offset-4 hover:text-primary/80"
          >
            Apply for a wholesale account
          </Link>{" "}
          for 10-vial kits and tiered pricing.
        </p>
      </div>

      <Alert className="mb-10 max-w-3xl mx-auto border-accent/40 bg-accent/5">
        <FlaskConical className="h-4 w-4" />
        <AlertTitle className="font-mono uppercase tracking-wider text-xs">
          Research use only
        </AlertTitle>
        <AlertDescription>
          All products are sold strictly for laboratory and in-vitro research
          purposes. Not for human or veterinary use, consumption, or diagnostic
          application. You must be 21+ and will affirm research use at checkout.
        </AlertDescription>
      </Alert>

      <div className="flex justify-center mb-12">
        <Tabs
          defaultValue="All"
          value={selectedCategory}
          onValueChange={setSelectedCategory}
          className="w-full overflow-x-auto pb-2 flex justify-center"
        >
          <TabsList className="bg-muted border border-border">
            {categories.map((cat) => (
              <TabsTrigger
                key={cat}
                value={cat}
                className="font-mono text-xs uppercase tracking-wider data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                {cat}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array(8)
            .fill(0)
            .map((_, i) => (
              <div key={i} className="flex flex-col space-y-3">
                <Skeleton className="h-[300px] w-full rounded-xl bg-secondary" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-[250px] bg-secondary" />
                  <Skeleton className="h-4 w-[200px] bg-secondary" />
                </div>
              </div>
            ))}
        </div>
      ) : filteredProducts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredProducts.map((product) => (
            <RetailProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="text-center py-24 bg-secondary/20 rounded-xl border border-border border-dashed">
          <p className="text-xl text-muted-foreground font-mono">
            No vials found in this category.
          </p>
        </div>
      )}

      <div className="mt-16 text-center">
        <Button asChild variant="outline" className="font-mono uppercase tracking-wider text-xs">
          <Link href="/wholesale">
            <span className="flex items-center gap-2">
              Buying wholesale? Apply here{" "}
              <ArrowRight className="h-3 w-3" />
            </span>
          </Link>
        </Button>
      </div>
    </div>
  );
}
