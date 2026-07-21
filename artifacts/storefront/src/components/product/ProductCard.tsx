import { Link } from "wouter";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Product } from "@atlab/api-client-react";
import { ArrowRight, Beaker } from "lucide-react";

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  return (
    <Card className="group overflow-hidden flex flex-col h-full hover-elevate transition-all duration-300 hover:border-primary/40">
      <Link href={`/shop/${product.slug}`} className="relative aspect-square overflow-hidden bg-muted/50 flex items-center justify-center p-8">
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
          {product.latestBatchPurity && (
            <Badge variant="verified" className="w-fit text-xs font-mono">
              COA {product.latestBatchPurity}%
            </Badge>
          )}
        </div>
      </Link>

      <CardContent className="p-6 flex-1 flex flex-col">
        <div className="mb-2 flex items-baseline justify-between gap-4">
          <Link
            href={`/shop/${product.slug}`}
            className="font-sans text-xl font-bold tracking-tight hover:text-primary transition-colors line-clamp-1"
          >
            {product.name}
          </Link>
          <span className="font-mono text-sm text-muted-foreground whitespace-nowrap">
            ${(product.startingPriceCents / 100).toFixed(2)} / kit
          </span>
        </div>

        <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
          {product.shortDescription}
        </p>
      </CardContent>

      <CardFooter className="p-6 pt-0 mt-auto">
        <Button asChild className="w-full group/btn relative overflow-hidden" variant="secondary">
          <Link href={`/shop/${product.slug}`}>
            <span className="relative z-10 flex items-center gap-2 font-mono uppercase tracking-wider text-xs">
              View Details <ArrowRight className="h-3 w-3 group-hover/btn:translate-x-1 transition-transform" />
            </span>
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
