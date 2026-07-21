import { useListProducts } from "@atlab/api-client-react";
import { ProductCard } from "@/components/product/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useMemo } from "react";

export function ProductsPage() {
  const { data: products, isLoading } = useListProducts();
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

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
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">Research Compounds</h1>
        <p className="text-lg text-muted-foreground">
          Wholesale 10-vial kits for research use only. Every batch ships with an active
          third-party COA, sourced across the USA and Asia. For in-vitro and laboratory
          research only — not for human or veterinary use.
        </p>
      </div>

      <div className="flex justify-center mb-12">
        <Tabs defaultValue="All" value={selectedCategory} onValueChange={setSelectedCategory} className="w-full overflow-x-auto pb-2 flex justify-center">
          <TabsList className="bg-secondary/50 border border-border">
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