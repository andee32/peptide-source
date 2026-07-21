import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProductCard } from "@/components/product/ProductCard";
import { useListProducts } from "@atlab/api-client-react";
import { ShieldCheck, Beaker, PackageCheck, Truck, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function HomePage() {
  const { data: products, isLoading } = useListProducts({ featured: true });

  return (
    <div className="flex flex-col min-h-screen">
      {/* HERO — deep-navy B2B band */}
      <section className="section-deep relative overflow-hidden pt-24 pb-28 border-b border-border">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/15 via-transparent to-transparent pointer-events-none"></div>

        <div className="container mx-auto px-4 relative z-10 flex flex-col items-center text-center max-w-4xl">
          <Badge variant="verified" className="mb-6 px-3 py-1 text-xs font-mono tracking-widest uppercase">
            Wholesale Research Peptides
          </Badge>

          <h1 className="font-display text-4xl md:text-6xl font-extrabold tracking-tight mb-5">
            Lab-verified sourcing,
            <br />
            <span className="text-primary">built for wholesale.</span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl leading-relaxed">
            USA-manufactured &gt;99% RUO compounds plus vetted Asia-sourced options —
            shipped as 10-vial kits with a 5-kit minimum. Active third-party COAs on 90%
            of inventory, with 2&ndash;3 day domestic delivery.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mb-16 w-full sm:w-auto">
            <Button asChild size="lg" className="font-mono uppercase tracking-widest text-sm h-14 px-8">
              <Link href="/shop">Browse Catalog</Link>
            </Button>
            <Button asChild size="lg" variant="gold" className="font-mono uppercase tracking-widest text-sm h-14 px-8">
              <Link href="/wholesale">Apply for Wholesale</Link>
            </Button>
          </div>

          <div className="flex flex-wrap justify-center items-center gap-6 md:gap-12 text-sm font-medium text-muted-foreground border-t border-border pt-8 w-full">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <span>&gt;99% RUO (USA)</span>
            </div>
            <div className="flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-primary" />
              <span>10-vial kits &middot; 5-kit MOQ</span>
            </div>
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              <span>2&ndash;3 day domestic shipping</span>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURED PRODUCTS */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-end mb-12">
            <div>
              <h2 className="text-3xl font-bold tracking-tight mb-2">Featured Compounds</h2>
              <p className="text-muted-foreground">In stock, COA-backed, and ready to ship by the kit.</p>
            </div>
            <Button asChild variant="ghost" className="hidden sm:flex group font-mono uppercase tracking-wider text-xs">
              <Link href="/shop">
                View Catalog <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {isLoading ? (
              Array(3).fill(0).map((_, i) => (
                <div key={i} className="flex flex-col space-y-3">
                  <Skeleton className="h-[300px] w-full rounded-xl bg-muted" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-[250px] bg-muted" />
                    <Skeleton className="h-4 w-[200px] bg-muted" />
                  </div>
                </div>
              ))
            ) : products?.slice(0, 3).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>

          <div className="mt-8 text-center sm:hidden">
            <Button asChild variant="navy" className="w-full font-mono uppercase tracking-wider text-xs">
              <Link href="/shop">View Full Catalog</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* TRUST PILLARS */}
      <section className="py-24 bg-muted/40 border-y border-border">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl font-bold tracking-tight mb-4">Why partners source with AT Lab</h2>
            <p className="text-muted-foreground text-lg">
              First-party COAs and a direct owner relationship &mdash; no anonymous middlemen,
              no guessing at what&apos;s in the vial.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center md:text-left">
            <div className="flex flex-col items-center md:items-start">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 border border-primary/20 text-primary">
                <ShieldCheck className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold mb-3">COA-Verified Inventory</h3>
              <p className="text-muted-foreground leading-relaxed">
                Active third-party certificates of analysis on 90% of stock, tied to the
                exact lot. Verify any batch before you commit an order.
              </p>
            </div>

            <div className="flex flex-col items-center md:items-start">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 border border-primary/20 text-primary">
                <PackageCheck className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold mb-3">Wholesale Kit Pricing</h3>
              <p className="text-muted-foreground leading-relaxed">
                Standardized 10-vial kits with a 5-kit minimum and tiered per-kit pricing
                that resolves from your assigned wholesale account.
              </p>
            </div>

            <div className="flex flex-col items-center md:items-start">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 border border-primary/20 text-primary">
                <Beaker className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold mb-3">Dual Sourcing, RUO-First</h3>
              <p className="text-muted-foreground leading-relaxed">
                USA-manufactured &gt;99% research-use-only compounds alongside vetted
                Asia-sourced options &mdash; you choose the lane that fits your program.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-background py-12 border-t border-border mt-auto">
        <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="font-display text-xl font-extrabold tracking-tight">
            AT LAB SOURCING
          </div>

          <nav className="flex gap-6 text-sm font-medium">
            <Link href="/shop" className="text-muted-foreground hover:text-foreground">Catalog</Link>
            <Link href="/verify" className="text-muted-foreground hover:text-foreground">COA Verification</Link>
            <Link href="/wholesale" className="text-muted-foreground hover:text-foreground">Wholesale</Link>
            <Link href="/wholesale/account" className="text-muted-foreground hover:text-foreground">Account</Link>
            <a href="mailto:sales@atlabsourcing.org" className="text-muted-foreground hover:text-foreground">Contact</a>
          </nav>

          <div className="text-xs text-muted-foreground max-w-xs text-center md:text-right p-4 rounded-lg bg-muted/60 border border-border">
            <strong>Disclaimer:</strong> All products are for research purposes only. Not for human consumption, therapeutic, or diagnostic use.
          </div>
        </div>
      </footer>
    </div>
  );
}
