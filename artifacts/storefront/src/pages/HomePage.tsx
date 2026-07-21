import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProductCard } from "@/components/product/ProductCard";
import { useListProducts, useGetReviewerSubmissionStats } from "@atlab/api-client-react";
import { ShieldCheck, Beaker, Users, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function HomePage() {
  const { data: products, isLoading } = useListProducts({ featured: true });
  const { data: reviewerStats } = useGetReviewerSubmissionStats();
  const verificationCount = reviewerStats?.approvedCount ?? 47;

  return (
    <div className="flex flex-col min-h-screen">
      {/* HERO SECTION */}
      <section className="relative overflow-hidden bg-background pt-24 pb-32 border-b border-border">
        {/* Abstract background gradient */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-background to-background pointer-events-none"></div>
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 pointer-events-none mix-blend-overlay"></div>
        
        <div className="container mx-auto px-4 relative z-10 flex flex-col items-center text-center max-w-4xl">
          <Badge className="mb-6 px-3 py-1 text-xs border-primary/20 bg-primary/10 text-primary font-mono tracking-widest uppercase">
            Tri-Verified Peptides
          </Badge>
          
          <h1 className="text-5xl md:text-7xl font-sans font-bold tracking-tighter mb-4 text-foreground">
            Research-Grade Purity.
            <br />
            <span className="text-primary bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">Independently Verified.</span>
          </h1>
          
          <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl leading-relaxed">
            Every batch tri-tested for purity, endotoxin, and sterility. Publicly verified by the community. Advancing your research with uncompromising standards.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 mb-16 w-full sm:w-auto">
            <Button asChild size="lg" className="font-mono uppercase tracking-widest text-sm h-14 px-8">
              <Link href="/shop">Browse Products</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="font-mono uppercase tracking-widest text-sm h-14 px-8 bg-background/50 backdrop-blur-sm border-border hover:bg-secondary/50">
              <Link href="/verify">Verify a Batch</Link>
            </Button>
          </div>
          
          <div className="flex flex-wrap justify-center items-center gap-6 md:gap-12 text-sm font-medium text-muted-foreground border-t border-border/50 pt-8 w-full">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <span>≥98% Purity Standard</span>
            </div>
            <div className="flex items-center gap-2">
              <Beaker className="h-5 w-5 text-primary" />
              <span>Janoshik Verified</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <span>Heavy Metal Free</span>
            </div>
          </div>
        </div>
      </section>

      {/* STATS BAR */}
      <section className="bg-primary/5 border-y border-primary/10 py-6 overflow-hidden relative">
        <div className="container mx-auto px-4 flex flex-wrap justify-between items-center gap-4 text-center divide-x divide-primary/20 font-mono text-sm">
          <div className="flex-1 px-4"><span className="text-primary font-bold text-xl block mb-1">≥98%</span> Avg Purity</div>
          <div className="flex-1 px-4"><span className="text-primary font-bold text-xl block mb-1">&lt;1.0 EU/mL</span> Avg Endotoxin</div>
          <div className="flex-1 px-4"><span className="text-primary font-bold text-xl block mb-1">100%</span> SKUs Verified</div>
          <div className="flex-1 px-4"><span className="text-primary font-bold text-xl block mb-1">{verificationCount}+</span> Community Reviews</div>
        </div>
      </section>

      {/* FEATURED PRODUCTS */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-end mb-12">
            <div>
              <h2 className="text-3xl font-bold tracking-tight mb-2">Featured Research Compounds</h2>
              <p className="text-muted-foreground">Our most sought-after peptides, in stock and ready to ship.</p>
            </div>
            <Button asChild variant="ghost" className="hidden sm:flex group font-mono uppercase tracking-wider text-xs">
              <Link href="/shop">
                View All <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {isLoading ? (
              Array(3).fill(0).map((_, i) => (
                <div key={i} className="flex flex-col space-y-3">
                  <Skeleton className="h-[300px] w-full rounded-xl bg-secondary" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-[250px] bg-secondary" />
                    <Skeleton className="h-4 w-[200px] bg-secondary" />
                  </div>
                </div>
              ))
            ) : products?.slice(0, 3).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
          
          <div className="mt-8 text-center sm:hidden">
            <Button asChild variant="outline" className="w-full font-mono uppercase tracking-wider text-xs">
              <Link href="/shop">View All Products</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* TRUST PILLARS */}
      <section className="py-24 bg-secondary/30 border-y border-border">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl font-bold tracking-tight mb-4">The Lab Standard Difference</h2>
            <p className="text-muted-foreground text-lg">We bring clinical-grade transparency to the research peptide market. No guessing, no hidden results.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center md:text-left">
            <div className="flex flex-col items-center md:items-start">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 border border-primary/20 text-primary">
                <Beaker className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold mb-3">Tri-Verified Testing</h3>
              <p className="text-muted-foreground leading-relaxed">
                We don't just test for purity. Every compound undergoes rigorous HPLC purity analysis, LAL endotoxin testing, and sterility verification before release.
              </p>
            </div>
            
            <div className="flex flex-col items-center md:items-start">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 border border-primary/20 text-primary">
                <ShieldCheck className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold mb-3">Batch-Specific COAs</h3>
              <p className="text-muted-foreground leading-relaxed">
                Every vial has a QR code linked to its exact batch results. View the actual laboratory reports for the specific product in your hands.
              </p>
            </div>

            <div className="flex flex-col items-center md:items-start">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 border border-primary/20 text-primary">
                <Users className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold mb-3">Community Verified</h3>
              <p className="text-muted-foreground leading-relaxed">
                Trust, but verify. Over 50 independent researchers regularly test our products blindly and publicly post their third-party results.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-background py-12 border-t border-border mt-auto">
        <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="font-mono text-xl font-bold tracking-tighter">
            THE LAB STANDARD
          </div>
          
          <nav className="flex gap-6 text-sm font-medium">
            <Link href="/" className="text-muted-foreground hover:text-foreground">Home</Link>
            <Link href="/shop" className="text-muted-foreground hover:text-foreground">Shop</Link>
            <Link href="/verify" className="text-muted-foreground hover:text-foreground">Verify</Link>
            <Link href="/reviewers" className="text-muted-foreground hover:text-foreground">Reviews</Link>
          </nav>
          
          <div className="text-xs text-muted-foreground max-w-xs text-center md:text-right p-4 rounded-lg bg-secondary/50 border border-border/50">
            <strong>Disclaimer:</strong> All products are for research purposes only. Not for human consumption, therapeutic, or diagnostic use.
          </div>
        </div>
      </footer>
    </div>
  );
}