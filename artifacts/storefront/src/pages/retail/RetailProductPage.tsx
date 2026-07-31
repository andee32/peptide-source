import { useParams, Link } from "wouter";
import { useState, useEffect } from "react";
import { useGetRetailProduct } from "@atlab/api-client-react";
import { useCart } from "@/contexts/cart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FlaskConical,
  CheckCircle2,
  ShieldCheck,
  Minus,
  Plus,
  Activity,
} from "lucide-react";
import { useStoreSettings } from "@/hooks/useStoreSettings";

export function RetailProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const { addToCart } = useCart();
  const { showVialImages } = useStoreSettings();

  const { data: product, isLoading, isError } = useGetRetailProduct(slug ?? "", {
    query: { enabled: !!slug, queryKey: [`/api/retail/products/${slug}`] },
  });

  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (product && product.variants.length > 0 && selectedVariantId === null) {
      const firstInStock =
        product.variants.find((v) => v.inStock) ?? product.variants[0];
      setSelectedVariantId(firstInStock.id);
    }
  }, [product, selectedVariantId]);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12 md:py-24 flex flex-col lg:flex-row gap-12 animate-pulse">
        <div className="flex-1">
          <Skeleton className="aspect-square w-full rounded-2xl bg-secondary" />
        </div>
        <div className="flex-1 space-y-6 pt-8">
          <Skeleton className="h-8 w-24 bg-secondary" />
          <Skeleton className="h-16 w-3/4 bg-secondary" />
          <Skeleton className="h-6 w-full bg-secondary" />
          <Skeleton className="h-40 w-full mt-8 bg-secondary" />
        </div>
      </div>
    );
  }

  if (isError || !product) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Product not found</h2>
          <Button asChild>
            <Link href="/retail">Back to Retail</Link>
          </Button>
        </div>
      </div>
    );
  }

  const selectedVariant = product.variants.find((v) => v.id === selectedVariantId);
  // The badge means "a real, released batch has a COA you can look up" — not
  // just an admin compliance flag. Demo/seed batches don't count.
  const verifiedBatchId =
    product.latestBatchId && product.latestBatchIsDemo === false
      ? product.latestBatchId
      : null;

  const handleAddToCart = () => {
    if (!selectedVariant) return;
    addToCart({
      productId: product.id,
      variantId: selectedVariant.id,
      productName: product.name,
      variantName: selectedVariant.name,
      priceCents: selectedVariant.priceCents,
      quantity,
    });
  };

  return (
    <div className="container mx-auto px-4 py-8 md:py-16">
      {/* Breadcrumb */}
      <div className="flex gap-2 text-sm text-muted-foreground font-mono mb-8">
        <Link href="/" className="hover:text-primary transition-colors">
          Home
        </Link>
        <span>/</span>
        <Link href="/retail" className="hover:text-primary transition-colors">
          Retail
        </Link>
        <span>/</span>
        <span className="text-foreground">{product.name}</span>
      </div>

      <div className={`grid grid-cols-1 gap-12 lg:gap-16 mb-16 ${showVialImages ? "lg:grid-cols-2" : ""}`}>
        {/* Left: Image (hidden when store images are turned off) */}
        {showVialImages && (
          <div className="relative aspect-square rounded-2xl overflow-hidden bg-secondary/30 flex items-center justify-center p-12 border border-border">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent" />
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.name}
                className="object-contain w-full h-full relative z-10"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-background/50 rounded-full max-w-[400px] max-h-[400px] border-8 border-muted relative z-10 shadow-2xl">
                <FlaskConical className="h-32 w-32 text-muted-foreground opacity-20" />
                <span className="absolute font-mono text-8xl font-black text-muted-foreground opacity-10 uppercase">
                  {product.name.substring(0, 2)}
                </span>
              </div>
            )}

            <div className="absolute top-6 left-6 flex flex-col gap-3 z-20">
              <Badge className="w-fit bg-primary/15 text-teal-ink border-primary/30 font-mono text-sm px-4 py-1">
                {product.category}
              </Badge>
              {verifiedBatchId && (
                <Link href={`/verify/${verifiedBatchId}`} className="w-fit">
                  <Badge
                    variant="outline"
                    className="w-fit bg-background/80 backdrop-blur-sm border-[#c8a84b]/40 text-[#c8a84b] text-sm px-4 py-1 flex items-center gap-2 cursor-pointer hover:bg-[#c8a84b]/10 transition-colors"
                    title="View this batch's certificate of analysis"
                  >
                    <ShieldCheck className="h-4 w-4" /> COA-Verified
                    {product.latestBatchPurity != null && (
                      <span className="font-mono">
                        {product.latestBatchPurity}%
                      </span>
                    )}
                  </Badge>
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Right: Details */}
        <div className="flex flex-col">
          {!showVialImages && (
            <div className="flex flex-wrap gap-3 mb-4">
              <Badge className="w-fit bg-primary/15 text-teal-ink border-primary/30 font-mono text-sm px-4 py-1">
                {product.category}
              </Badge>
              {verifiedBatchId && (
                <Link href={`/verify/${verifiedBatchId}`} className="w-fit">
                  <Badge
                    variant="outline"
                    className="w-fit border-[#c8a84b]/40 text-[#c8a84b] text-sm px-4 py-1 flex items-center gap-2 cursor-pointer hover:bg-[#c8a84b]/10 transition-colors"
                    title="View this batch's certificate of analysis"
                  >
                    <ShieldCheck className="h-4 w-4" /> COA-Verified
                    {product.latestBatchPurity != null && (
                      <span className="font-mono">
                        {product.latestBatchPurity}%
                      </span>
                    )}
                  </Badge>
                </Link>
              )}
            </div>
          )}
          <div className="mb-3">
            <Badge
              variant="outline"
              className="font-mono text-xs uppercase tracking-widest text-muted-foreground"
            >
              {product.variants.some((v) => v.unitType === "kit")
                ? "Vials & Kits · Retail"
                : "Single Vial · Retail"}
            </Badge>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            {product.name}
          </h1>
          <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
            {product.shortDescription}
          </p>

          <Separator className="my-8" />

          {/* Variant selection */}
          <div className="mb-8">
            <h3 className="font-mono text-sm uppercase tracking-widest text-muted-foreground mb-4">
              {product.variants.some((v) => v.unitType === "kit")
                ? "Select Size"
                : "Select Vial"}
            </h3>
            <RadioGroup
              value={selectedVariantId?.toString() ?? ""}
              onValueChange={(val) => setSelectedVariantId(Number(val))}
              className="grid grid-cols-1 sm:grid-cols-2 gap-4"
            >
              {product.variants.map((variant) => (
                <Label
                  key={variant.id}
                  htmlFor={`retail-variant-${variant.id}`}
                  className={`flex flex-col border rounded-xl p-4 cursor-pointer transition-all hover-elevate
                    ${
                      selectedVariantId === variant.id
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : "border-border bg-card hover:border-primary/50"
                    }
                    ${!variant.inStock ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <RadioGroupItem
                    value={variant.id.toString()}
                    id={`retail-variant-${variant.id}`}
                    className="sr-only"
                    disabled={!variant.inStock}
                  />
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-bold text-lg">{variant.name}</span>
                    <span className="font-mono text-teal-ink font-bold">
                      ${(variant.priceCents / 100).toFixed(2)}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground font-mono">
                    {variant.concentration} ·{" "}
                    {variant.unitType === "kit"
                      ? `${variant.vialsPerUnit}-vial kit`
                      : "1 vial"}
                  </div>
                  {variant.coaUrl && (
                    <a
                      href={variant.coaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 text-[11px] font-mono text-primary hover:underline w-fit"
                    >
                      View COA →
                    </a>
                  )}
                  {!variant.inStock && (
                    <Badge variant="destructive" className="mt-3 w-fit text-[10px]">
                      Out of Stock
                    </Badge>
                  )}
                </Label>
              ))}
            </RadioGroup>
          </div>

          <div className="mt-auto pt-4">
            {/* Quantity + price */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm uppercase tracking-widest text-muted-foreground">
                  Qty
                </span>
                <div className="flex items-center border border-border rounded-lg">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 rounded-r-none"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                    aria-label="Decrease quantity"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-12 text-center font-mono font-bold">
                    {quantity}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 rounded-l-none"
                    onClick={() => setQuantity((q) => q + 1)}
                    aria-label="Increase quantity"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <span className="text-3xl font-mono font-bold">
                $
                {selectedVariant
                  ? ((selectedVariant.priceCents * quantity) / 100).toFixed(2)
                  : (product.startingPriceCents / 100).toFixed(2)}
              </span>
            </div>

            <Button
              size="lg"
              className="w-full h-14 text-lg font-mono uppercase tracking-widest mb-4"
              onClick={handleAddToCart}
              disabled={!selectedVariant || !selectedVariant.inStock}
            >
              Add to Cart
            </Button>

            {/* RUO language */}
            <div className="rounded-xl border border-border bg-secondary/20 p-4 flex items-start gap-3">
              <Activity className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                For laboratory research use only (RUO). Not for human or animal
                consumption, diagnostic, or therapeutic use. You must be 21+ and
                affirm research use at checkout.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* About */}
      <div className="mt-8 border-t border-border pt-12">
        <Tabs defaultValue="about" className="w-full">
          <TabsList className="w-full flex justify-start bg-transparent border-b border-border rounded-none h-auto p-0 space-x-8">
            <TabsTrigger
              value="about"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 py-4 font-mono uppercase tracking-widest text-sm"
            >
              About Compound
            </TabsTrigger>
          </TabsList>
          <div className="py-8">
            <TabsContent value="about" className="mt-0 outline-none">
              <div className="max-w-3xl">
                <p className="text-lg leading-relaxed whitespace-pre-wrap text-muted-foreground">
                  {product.longDescription}
                </p>
                {product.researchUses && product.researchUses.length > 0 && (
                  <>
                    <h3 className="text-xl font-bold mt-8 mb-4">
                      Known Research Applications
                    </h3>
                    <ul className="space-y-2">
                      {product.researchUses.map((use, idx) => (
                        <li key={idx} className="flex items-start gap-3">
                          <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                          <span className="text-muted-foreground">{use}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
