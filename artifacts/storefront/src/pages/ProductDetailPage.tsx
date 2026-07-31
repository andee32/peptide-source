import { useParams, Link } from "wouter";
import { useGetProduct, useListProducts } from "@atlab/api-client-react";
import { useCart } from "@/contexts/cart";
import { useAnalytics } from "@/contexts/analytics";
import { CoaVisualization } from "@/components/coa/CoaVisualization";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Beaker, CheckCircle2, FlaskConical, ExternalLink, Activity, RefreshCw, AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { useWholesaleSession } from "@/hooks/useWholesaleSession";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";

// Wholesale kit detail — approved-accounts-only, same gate as the catalog.
export function ProductDetailPage() {
  const { session } = useWholesaleSession();
  if (!session) return <WholesaleGate />;
  return <WholesaleProductDetail accountId={session.accountId} />;
}

function WholesaleProductDetail({ accountId }: { accountId: string }) {
  const { slug } = useParams<{ slug: string }>();
  const { trackEvent } = useAnalytics();
  const { addToCart } = useCart();
  const { showVialImages } = useStoreSettings();
  const { wholesaleHeaders } = useWholesaleSession();

  // First fetch list to find the ID by slug
  const { data: products } = useListProducts(undefined, {
    query: { queryKey: ["/api/products", accountId] },
    request: { headers: wholesaleHeaders },
  });
  const productSummary = products?.find(p => p.slug === slug);
  const productId = productSummary?.id;

  // Then fetch the full detail
  const { data: product, isLoading } = useGetProduct(productId ?? 0, {
    query: { enabled: !!productId, queryKey: ['/api/products', productId, accountId] },
    request: { headers: wholesaleHeaders },
  });

  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [subscribeMode, setSubscribeMode] = useState(false);
  const [subscribeInterval, setSubscribeInterval] = useState<"30" | "60" | "90">("30");
  const [productPlans, setProductPlans] = useState<Array<{
    id: number;
    intervalDays: number;
    name: string;
    pricePerIntervalCents: number;
  }>>([]);

  useEffect(() => {
    if (!productId) return;
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    fetch(`${base}/api/subscription-plans`)
      .then((r) => r.json() as Promise<Array<{
        id: number;
        intervalDays: number;
        name: string;
        pricePerIntervalCents: number;
        productBundle: Array<{ productId?: number; name: string; qty: number }>;
      }>>)
      .then((plans) => {
        const matching = plans.filter((p) =>
          p.productBundle.some((b) => b.productId === productId)
        );
        setProductPlans(matching);
        if (matching.length > 0) {
          const firstInterval = matching[0].intervalDays;
          setSubscribeInterval(String(firstInterval) as "30" | "60" | "90");
        }
      })
      .catch(() => {});
  }, [productId]);

  useEffect(() => {
    if (product && product.variants.length > 0 && !selectedVariantId) {
      // Auto-select first in-stock variant
      const firstInStock = product.variants.find(v => v.inStock) || product.variants[0];
      setSelectedVariantId(firstInStock.id);
    }
  }, [product, selectedVariantId]);

  useEffect(() => {
    if (product) {
      trackEvent("Product Viewed", { productId: product.id, productName: product.name });
    }
  }, [product, trackEvent]);

  if (isLoading || (!product && !!productId)) {
    return (
      <div className="container mx-auto px-4 py-12 md:py-24 animate-pulse flex flex-col lg:flex-row gap-12">
        <div className="flex-1 space-y-4"><Skeleton className="aspect-square w-full rounded-2xl bg-secondary" /></div>
        <div className="flex-1 space-y-6 pt-8">
          <Skeleton className="h-10 w-24 bg-secondary" />
          <Skeleton className="h-16 w-3/4 bg-secondary" />
          <Skeleton className="h-6 w-full bg-secondary" />
          <Skeleton className="h-6 w-5/6 bg-secondary" />
          <Skeleton className="h-40 w-full mt-8 bg-secondary" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Product not found</h2>
          <Button asChild><Link href="/shop">Back to Shop</Link></Button>
        </div>
      </div>
    );
  }

  const selectedVariant = product.variants.find(v => v.id === selectedVariantId);

  const handleAddToCart = () => {
    if (product && selectedVariant) {
      trackEvent("Add to Cart", { 
        productId: product.id, 
        variantId: selectedVariant.id,
        priceCents: selectedVariant.priceCents,
        subscribeMode,
        subscribeInterval: subscribeMode ? subscribeInterval : undefined,
      });
      
      const intervalNum = Number(subscribeInterval);
      const matchedPlan = subscribeMode
        ? productPlans.find((p) => p.intervalDays === intervalNum) ?? productPlans[0]
        : undefined;

      addToCart({
        productId: product.id,
        variantId: selectedVariant.id,
        productName: product.name,
        variantName: selectedVariant.name,
        priceCents: selectedVariant.priceCents,
        quantity: 1,
        subscribeInterval: subscribeMode ? intervalNum : undefined,
        subscribePlanId: subscribeMode ? matchedPlan?.id : undefined,
      });
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 md:py-16">
      <div className="flex gap-2 text-sm text-muted-foreground font-mono mb-8">
        <Link href="/" className="hover:text-primary transition-colors">Home</Link>
        <span>/</span>
        <Link href="/shop" className="hover:text-primary transition-colors">Shop</Link>
        <span>/</span>
        <span className="text-foreground">{product.name}</span>
      </div>

      <div className={`grid grid-cols-1 gap-12 lg:gap-16 mb-24 ${showVialImages ? "lg:grid-cols-2" : "max-w-2xl"}`}>
        {/* Left Col: Image (hidden when store images are turned off) */}
        {showVialImages && (
          <div className="relative aspect-square rounded-2xl overflow-hidden bg-secondary/30 flex items-center justify-center p-12 border border-border">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent"></div>

            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.name}
                className="object-contain w-full h-full relative z-10 mix-blend-screen opacity-90"
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
              {product.latestBatchPurity != null &&
                (product.latestBatchIsDemo === false ? (
                  <Badge variant="outline" className="w-fit bg-background/80 backdrop-blur-sm border-border text-sm px-4 py-1 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" /> {product.latestBatchPurity}% Purity Confirmed
                  </Badge>
                ) : (
                  <Badge variant="outline" className="w-fit bg-background/80 backdrop-blur-sm border-border text-sm px-4 py-1 flex items-center gap-2 text-muted-foreground">
                    <AlertTriangle className="h-4 w-4" /> COA: sample data
                  </Badge>
                ))}
            </div>
          </div>
        )}

        {/* Right Col: Details */}
        <div className="flex flex-col">
          {!showVialImages && (
            <div className="flex flex-wrap gap-3 mb-4">
              <Badge className="w-fit bg-primary/15 text-teal-ink border-primary/30 font-mono text-sm px-4 py-1">
                {product.category}
              </Badge>
              {product.latestBatchPurity != null &&
                (product.latestBatchIsDemo === false ? (
                  <Badge variant="outline" className="w-fit border-border text-sm px-4 py-1 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" /> {product.latestBatchPurity}% Purity Confirmed
                  </Badge>
                ) : (
                  <Badge variant="outline" className="w-fit border-border text-sm px-4 py-1 flex items-center gap-2 text-muted-foreground">
                    <AlertTriangle className="h-4 w-4" /> COA: sample data
                  </Badge>
                ))}
            </div>
          )}
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">{product.name}</h1>
          <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
            {product.shortDescription}
          </p>

          <Separator className="my-8" />

          {/* Variants */}
          <div className="mb-8">
            <h3 className="font-mono text-sm uppercase tracking-widest text-muted-foreground mb-4">Select Concentration</h3>
            <RadioGroup 
              value={selectedVariantId?.toString() ?? ""}
              onValueChange={(val) => setSelectedVariantId(Number(val))}
              className="grid grid-cols-1 sm:grid-cols-2 gap-4"
            >
              {product.variants.map((variant) => (
                <Label 
                  key={variant.id}
                  htmlFor={`variant-${variant.id}`}
                  className={`
                    flex flex-col border rounded-xl p-4 cursor-pointer transition-all hover-elevate
                    ${selectedVariantId === variant.id ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border bg-card hover:border-primary/50'}
                    ${!variant.inStock ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  <RadioGroupItem 
                    value={variant.id.toString()} 
                    id={`variant-${variant.id}`} 
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
                    {variant.concentration} / {variant.sizeml}mL
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
                    <Badge variant="destructive" className="mt-3 w-fit text-[10px]">Out of Stock</Badge>
                  )}
                </Label>
              ))}
            </RadioGroup>
          </div>

          <div className="mt-auto pt-8">
            {/* Subscribe & Save Toggle — only shown for products with kit plans */}
            {productPlans.length > 0 && (
              <div className="rounded-xl border border-border bg-secondary/20 p-4 mb-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-sm">Subscribe & Save</span>
                  </div>
                  <Switch
                    checked={subscribeMode}
                    onCheckedChange={setSubscribeMode}
                    id="subscribe-toggle"
                  />
                </div>
                {subscribeMode ? (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Auto-replenish on your research schedule. Skip or cancel any time.
                    </p>
                    <div className="flex items-center gap-3">
                      <Label className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                        Kit plan
                      </Label>
                      <Select
                        value={subscribeInterval}
                        onValueChange={(v) =>
                          setSubscribeInterval(v as "30" | "60" | "90")
                        }
                      >
                        <SelectTrigger className="h-8 text-xs font-mono flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {productPlans.map((p) => (
                            <SelectItem key={p.id} value={String(p.intervalDays)}>
                              {p.name} ({p.intervalDays} days)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Manage shipments at{" "}
                      <Link href="/account/subscriptions" className="text-primary hover:underline">
                        /account/subscriptions
                      </Link>
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Switch to subscription for automatic replenishment at your chosen interval.
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center gap-4 mb-4">
              {subscribeMode && productPlans.length > 0 ? (
                <>
                  {(() => {
                    const intervalNum = Number(subscribeInterval);
                    const plan =
                      productPlans.find((p) => p.intervalDays === intervalNum) ??
                      productPlans[0];
                    const planPrice = plan
                      ? (plan.pricePerIntervalCents / 100).toFixed(2)
                      : null;
                    return planPrice ? (
                      <span className="text-3xl font-mono font-bold">${planPrice}</span>
                    ) : (
                      <span className="text-3xl font-mono font-bold">
                        ${selectedVariant
                          ? (selectedVariant.priceCents / 100).toFixed(2)
                          : (product.startingPriceCents / 100).toFixed(2)}
                      </span>
                    );
                  })()}
                  <Badge className="bg-primary/15 text-teal-ink border-primary/30 text-xs font-mono">
                    / {subscribeInterval} days
                  </Badge>
                </>
              ) : (
                <span className="text-3xl font-mono font-bold">
                  ${selectedVariant
                    ? (selectedVariant.priceCents / 100).toFixed(2)
                    : (product.startingPriceCents / 100).toFixed(2)}
                </span>
              )}
            </div>
            
            <Button 
              size="lg" 
              className="w-full h-14 text-lg font-mono uppercase tracking-widest mb-4" 
              onClick={handleAddToCart}
              disabled={!selectedVariant || !selectedVariant.inStock}
            >
              {subscribeMode ? (
                <><RefreshCw className="h-5 w-5 mr-2" /> Subscribe & Add to Cart</>
              ) : (
                "Add to Cart"
              )}
            </Button>
            
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Activity className="h-4 w-4" /> Not for human consumption. Research only.
            </div>
          </div>
        </div>
      </div>

      {/* TABS / SECTIONS */}
      <div className="mt-16 border-t border-border pt-16">
        <Tabs defaultValue="lab-results" className="w-full">
          <TabsList className="w-full flex justify-start bg-transparent border-b border-border rounded-none h-auto p-0 space-x-8">
            <TabsTrigger 
              value="lab-results" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 py-4 font-mono uppercase tracking-widest text-sm"
            >
              Lab Results
            </TabsTrigger>
            <TabsTrigger 
              value="about" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 py-4 font-mono uppercase tracking-widest text-sm"
            >
              About Compound
            </TabsTrigger>
          </TabsList>
          
          <div className="py-8">
            <TabsContent value="lab-results" className="mt-0 outline-none">
              <div className="max-w-4xl">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-bold">Batch Testing Verification</h3>
                  {product.latestBatchId && (
                    <Button variant="outline" size="sm" asChild className="font-mono text-xs">
                      <Link href={`/verify/${product.latestBatchId}`}>
                        View Verification Portal <ExternalLink className="ml-2 h-3 w-3" />
                      </Link>
                    </Button>
                  )}
                </div>
                
                {product.latestBatch ? (
                  <CoaVisualization batch={product.latestBatch} productName={product.name} />
                ) : (
                  <div className="p-12 text-center border border-border border-dashed rounded-xl bg-secondary/10">
                    <Beaker className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                    <h4 className="text-lg font-bold mb-2">Lab Results Pending</h4>
                    <p className="text-muted-foreground">Testing data for the current batch is being processed by Janoshik Analytical.</p>
                  </div>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="about" className="mt-0 outline-none">
              <div className="max-w-3xl prose prose-p:text-muted-foreground prose-headings:text-foreground">
                <p className="text-lg leading-relaxed whitespace-pre-wrap">
                  {product.longDescription}
                </p>
                
                {product.researchUses && product.researchUses.length > 0 && (
                  <>
                    <h3 className="text-xl font-bold mt-8 mb-4">Known Research Applications</h3>
                    <ul className="space-y-2">
                      {product.researchUses.map((use, idx) => (
                        <li key={idx} className="flex items-start gap-3">
                          <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                          <span>{use}</span>
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