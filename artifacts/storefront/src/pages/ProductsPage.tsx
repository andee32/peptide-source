import { useListProducts } from "@atlab/api-client-react";
import { ProductCard } from "@/components/product/ProductCard";
import { WholesaleListView } from "@/components/wholesale/WholesaleListView";
import { WholesaleOrderPanel } from "@/components/wholesale/WholesaleOrderPanel";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { useWholesaleSession } from "@/hooks/useWholesaleSession";
import { useState, useMemo } from "react";
import { LayoutGrid, List } from "lucide-react";

type CatalogView = "card" | "list";
const VIEW_KEY = "wholesale_catalog_view";

// Wholesale kit catalog — approved-accounts-only. The server enforces the gate
// (GET /products is 401 without valid wholesale auth); this component gates
// the UI and forwards the wholesale auth headers.
export function ProductsPage() {
  const { session, wholesaleHeaders } = useWholesaleSession();
  if (!session) return <WholesaleGate />;
  return <WholesaleCatalog accountId={session.accountId} wholesaleHeaders={wholesaleHeaders} />;
}

function WholesaleCatalog({ accountId, wholesaleHeaders }: { accountId: string; wholesaleHeaders: Record<string, string> }) {
  const { data: products, isLoading } = useListProducts(undefined, {
    // Key includes the accountId so sign-out/account-switch can't serve a stale
    // cached catalog.
    query: { queryKey: ["/api/products", accountId] },
    request: { headers: wholesaleHeaders },
  });
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [view, setView] = useState<CatalogView>(
    () => (localStorage.getItem(VIEW_KEY) as CatalogView) ?? "card",
  );
  const setViewPersisted = (v: CatalogView) => {
    setView(v);
    localStorage.setItem(VIEW_KEY, v);
  };

  const categories = useMemo(() => {
    if (!products) return ["All"];
    const cats = new Set(products.map(p => p.category));
    return ["All", ...Array.from(cats)];
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    if (selectedCategory === "All") return products;
    return products.filter(p => p.category === selectedCategory);
  }, [products, selectedCategory]);

  return (
    <div className="container mx-auto px-4 py-12 md:py-24 min-h-[calc(100vh-4rem)] flex flex-col">
      <div className="mb-12 text-center max-w-3xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">Wholesale Kit Catalog</h1>
        <p className="text-lg text-muted-foreground">
          10-vial kits, 5-kit minimum — list prices shown; your account&apos;s tier
          pricing is applied at checkout. Every batch ships with an active
          third-party COA, sourced across the USA and Asia. For in-vitro and
          laboratory research only — not for human or veterinary use.
        </p>
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-4 mb-10">
        <div className="flex-1 min-w-0 overflow-x-auto">
          <Tabs defaultValue="All" value={selectedCategory} onValueChange={setSelectedCategory} className="pb-2">
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
        <div className="flex items-center gap-1 rounded-lg border border-border p-1 shrink-0 self-start md:self-auto">
          <Button
            variant={view === "card" ? "secondary" : "ghost"}
            size="sm"
            className="font-mono text-xs uppercase tracking-wider gap-1.5"
            onClick={() => setViewPersisted("card")}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Cards
          </Button>
          <Button
            variant={view === "list" ? "secondary" : "ghost"}
            size="sm"
            className="font-mono text-xs uppercase tracking-wider gap-1.5"
            onClick={() => setViewPersisted("list")}
          >
            <List className="h-3.5 w-3.5" /> List
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array(8).fill(0).map((_, i) => (
            <div key={i} className="flex flex-col space-y-3">
              <Skeleton className="h-[300px] w-full rounded-xl bg-secondary" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-[250px] bg-secondary" />
                <Skeleton className="h-4 w-[200px] bg-secondary" />
              </div>
            </div>
          ))}
        </div>
      ) : view === "list" ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-8 items-start">
          <div>
            {filteredProducts.length > 0 ? (
              <WholesaleListView products={filteredProducts} />
            ) : (
              <div className="text-center py-24 bg-secondary/20 rounded-xl border border-border border-dashed">
                <p className="text-xl text-muted-foreground font-mono">No products found in this category.</p>
              </div>
            )}
          </div>
          <WholesaleOrderPanel />
        </div>
      ) : filteredProducts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="text-center py-24 bg-secondary/20 rounded-xl border border-border border-dashed">
          <p className="text-xl text-muted-foreground font-mono">No products found in this category.</p>
        </div>
      )}
    </div>
  );
}
