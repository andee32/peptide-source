import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Package,
  RefreshCw,
  AlertTriangle,
  Star,
  EyeOff,
  Check,
} from "lucide-react";
import {
  useAdminGetCatalog,
  useAdminPatchProduct,
  useAdminPatchVariant,
  ComplianceStatus,
  type CatalogProduct,
  type CatalogVariant,
} from "@atlab/api-client-react";

const COMPLIANCE_OPTIONS: ComplianceStatus[] = [
  ComplianceStatus.cleared,
  ComplianceStatus.restricted,
  ComplianceStatus.blocked,
];

function complianceBadgeVariant(
  status: ComplianceStatus,
): "verified" | "gold" | "destructive" {
  if (status === ComplianceStatus.blocked) return "destructive";
  if (status === ComplianceStatus.restricted) return "gold";
  return "verified";
}

function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function VariantRow({
  variant,
  adminKey,
  onChanged,
}: {
  variant: CatalogVariant;
  adminKey: string;
  onChanged: () => void;
}) {
  const [price, setPrice] = useState(dollars(variant.priceCents));
  const [error, setError] = useState("");

  const patch = useAdminPatchVariant({
    request: { headers: { "x-admin-key": adminKey } },
    mutation: {
      onSuccess: () => {
        setError("");
        onChanged();
      },
      onError: (err) =>
        setError(err instanceof Error ? err.message : "Update failed"),
    },
  });

  const priceCents = Math.round(parseFloat(price) * 100);
  const priceDirty =
    Number.isFinite(priceCents) &&
    priceCents >= 1 &&
    priceCents !== variant.priceCents;

  const savePrice = () => {
    if (!priceDirty) return;
    patch.mutate({ id: variant.id, data: { priceCents } });
  };

  const toggleStock = (inStock: boolean) => {
    patch.mutate({ id: variant.id, data: { inStock } });
  };

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{variant.sku}</TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className="text-[10px] font-mono uppercase tracking-wider"
        >
          {variant.unitType}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground text-xs">$</span>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && savePrice()}
            className="h-8 w-28 font-mono text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 font-mono text-xs"
            disabled={!priceDirty || patch.isPending}
            onClick={savePrice}
            aria-label="Save price"
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
        </div>
        {error && (
          <p className="text-destructive text-[10px] font-mono mt-1">{error}</p>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Switch
            checked={variant.inStock}
            disabled={patch.isPending}
            onCheckedChange={toggleStock}
          />
          <span
            className={`text-[10px] font-mono uppercase tracking-wider ${
              variant.inStock ? "text-teal-ink" : "text-muted-foreground"
            }`}
          >
            {variant.inStock ? "In stock" : "Out"}
          </span>
        </div>
      </TableCell>
    </TableRow>
  );
}

function ProductRow({
  product,
  adminKey,
  onChanged,
}: {
  product: CatalogProduct;
  adminKey: string;
  onChanged: () => void;
}) {
  const [error, setError] = useState("");

  const patch = useAdminPatchProduct({
    request: { headers: { "x-admin-key": adminKey } },
    mutation: {
      onSuccess: () => {
        setError("");
        onChanged();
      },
      onError: (err) =>
        setError(err instanceof Error ? err.message : "Update failed"),
    },
  });

  const setCompliance = (value: string) => {
    patch.mutate({
      id: product.id,
      data: { complianceStatus: value as ComplianceStatus },
    });
  };

  const toggleFeatured = (featured: boolean) => {
    patch.mutate({ id: product.id, data: { featured } });
  };

  const isBlocked = product.complianceStatus === ComplianceStatus.blocked;

  return (
    <Card className="border-border/30">
      <CardContent className="p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start gap-4">
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{product.name}</span>
              <Badge
                variant={complianceBadgeVariant(product.complianceStatus)}
                className="text-[10px] font-mono uppercase tracking-wider"
              >
                {product.complianceStatus}
              </Badge>
              {product.featured && (
                <Badge variant="gold" className="text-[10px] font-mono gap-1">
                  <Star className="h-3 w-3" /> Featured
                </Badge>
              )}
              {product.sourcingPath && (
                <Badge
                  variant="outline"
                  className="text-[10px] font-mono uppercase tracking-wider"
                >
                  {product.sourcingPath.replace(/_/g, " ")}
                </Badge>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground font-mono">
              {product.category} · {product.slug} · ID {product.id}
            </div>
          </div>

          <div className="flex flex-col gap-3 shrink-0 lg:w-72">
            <div className="space-y-1">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Compliance Status
              </label>
              <Select
                value={product.complianceStatus}
                onValueChange={setCompliance}
                disabled={patch.isPending}
              >
                <SelectTrigger className="font-mono text-xs h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPLIANCE_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s} className="font-mono capitalize">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Featured
              </label>
              <Switch
                checked={product.featured}
                disabled={patch.isPending}
                onCheckedChange={toggleFeatured}
              />
            </div>
          </div>
        </div>

        {isBlocked && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
            <EyeOff className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
            <p className="text-destructive text-[11px] font-mono leading-relaxed">
              Blocked hides this product from the storefront — it becomes
              unlisted and unsellable. Dormant control; nothing is blocked by
              default.
            </p>
          </div>
        )}

        {error && (
          <p className="text-destructive text-xs font-mono">{error}</p>
        )}

        {product.variants.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-mono text-[10px] uppercase tracking-wider">
                    SKU
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-wider">
                    Unit
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-wider">
                    Price
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-wider">
                    Stock
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {product.variants.map((v) => (
                  <VariantRow
                    key={v.id}
                    variant={v}
                    adminKey={adminKey}
                    onChanged={onChanged}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-muted-foreground text-xs font-mono">
            No variants.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function CatalogPanel({ adminKey }: { adminKey: string }) {
  const catalogQuery = useAdminGetCatalog({
    request: { headers: { "x-admin-key": adminKey } },
  });

  const products = catalogQuery.data ?? [];

  const refetch = () => {
    void catalogQuery.refetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Catalog</h1>
          <p className="text-muted-foreground text-sm mt-1 font-mono">
            Merchandising, compliance, pricing &amp; stock — all products incl.
            blocked
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="font-mono gap-2"
          onClick={refetch}
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {catalogQuery.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : catalogQuery.isError ? (
        <div className="text-center py-12">
          <AlertTriangle className="h-6 w-6 text-destructive mx-auto mb-2" />
          <p className="text-destructive text-sm font-mono">
            {catalogQuery.error instanceof Error
              ? catalogQuery.error.message
              : "Failed to load catalog"}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 font-mono"
            onClick={refetch}
          >
            Retry
          </Button>
        </div>
      ) : products.length === 0 ? (
        <Card className="border-border/30">
          <CardContent className="py-12 text-center text-muted-foreground font-mono text-sm">
            <Package className="h-6 w-6 mx-auto mb-2 opacity-50" />
            No products in the catalog.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {products.map((p) => (
            <ProductRow
              key={p.id}
              product={p}
              adminKey={adminKey}
              onChanged={refetch}
            />
          ))}
        </div>
      )}
    </div>
  );
}
