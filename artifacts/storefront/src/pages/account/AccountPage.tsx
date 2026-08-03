import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  useListCustomerOrders,
  useListRetailProducts,
  useReorderFromOrder,
  getListCustomerOrdersQueryKey,
  getListRetailProductsQueryKey,
  type CustomerOrderSummary,
  type OrderStatus,
} from "@app/api-client-react";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { useCart } from "@/contexts/cart";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  LogOut,
  PackageSearch,
  RotateCcw,
  Truck,
  User,
  XCircle,
} from "lucide-react";

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

function StatusBadge({ status }: { status: OrderStatus }) {
  switch (status) {
    case "confirmed":
      return (
        <Badge variant="verified" className="gap-1 font-mono uppercase tracking-wider">
          <CheckCircle2 className="h-3 w-3" /> Confirmed
        </Badge>
      );
    case "failed":
    case "expired":
      return (
        <Badge className="gap-1 font-mono uppercase tracking-wider border-transparent bg-destructive/15 text-destructive">
          <XCircle className="h-3 w-3" /> {status}
        </Badge>
      );
    case "refunded":
      return (
        <Badge className="gap-1 font-mono uppercase tracking-wider border-transparent bg-amber-500/15 text-amber-600">
          <RotateCcw className="h-3 w-3" /> Refunded
        </Badge>
      );
    default:
      return (
        <Badge variant="gold" className="gap-1 font-mono uppercase tracking-wider">
          <Clock className="h-3 w-3" /> {status.replace(/_/g, " ")}
        </Badge>
      );
  }
}

function OrderCard({
  order,
  onReorder,
  reordering,
}: {
  order: CustomerOrderSummary;
  onReorder: (order: CustomerOrderSummary) => void;
  reordering: boolean;
}) {
  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="font-mono text-sm break-all">
              {order.id}
            </CardTitle>
            <CardDescription>{formatDate(order.createdAt)}</CardDescription>
          </div>
          <StatusBadge status={order.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="divide-y divide-border rounded-lg border border-border bg-muted/40">
          {order.lineItems.map((li, i) => (
            <li
              key={`${li.variantId}-${i}`}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate">
                {li.productName}
                <span className="text-muted-foreground"> · {li.variantName}</span>
              </span>
              <span className="font-mono text-xs text-muted-foreground shrink-0">
                ×{li.quantity} · {money(li.unitPriceCents * li.quantity)}
              </span>
            </li>
          ))}
        </ul>

        {order.trackingNumber && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Truck className="h-4 w-4 text-primary shrink-0" />
            <span className="font-mono text-xs">
              {order.carrier ? `${order.carrier} · ` : ""}
              {order.trackingNumber}
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="font-mono text-sm">
            <span className="text-muted-foreground text-xs uppercase tracking-wider mr-2">
              Total
            </span>
            {money(order.totalCents)}
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="font-mono uppercase tracking-widest text-xs">
              <Link href={`/orders/${order.id}`}>Details</Link>
            </Button>
            <Button
              size="sm"
              className="font-mono uppercase tracking-widest text-xs"
              onClick={() => onReorder(order)}
              disabled={reordering}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              {reordering ? "Adding…" : "Reorder"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function AccountPage() {
  const [, setLocation] = useLocation();
  const { customer, token, request, isLoading, logout } = useCustomerAuth();
  const { addToCart, setIsCartOpen } = useCart();
  const { toast } = useToast();
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  const orders = useListCustomerOrders({
    request,
    query: {
      enabled: !!token,
      retry: false,
      queryKey: [...getListCustomerOrdersQueryKey(), token],
    },
  });

  // Reorder payloads carry a product slug but no product id; the cart needs the
  // id, so resolve it from the retail catalog.
  const catalog = useListRetailProducts(undefined, {
    query: {
      enabled: !!token,
      queryKey: getListRetailProductsQueryKey(),
    },
  });

  const productIdBySlug = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of catalog.data ?? []) map.set(p.slug, p.id);
    return map;
  }, [catalog.data]);

  const reorder = useReorderFromOrder({ request });

  const handleReorder = async (order: CustomerOrderSummary) => {
    setReorderingId(order.id);
    try {
      const payload = await reorder.mutateAsync({ orderId: order.id });
      let added = 0;
      let skipped = payload.unavailable.length;

      for (const li of payload.lineItems) {
        const productId = productIdBySlug.get(li.productSlug);
        if (productId === undefined) {
          skipped += 1;
          continue;
        }
        addToCart({
          productId,
          variantId: li.variantId,
          productName: li.productName,
          variantName: li.variantName,
          priceCents: li.unitPriceCents,
          quantity: li.quantity,
        });
        added += 1;
      }

      if (added === 0) {
        toast({
          title: "Nothing to reorder",
          description: "Every item from that order is out of stock or retired.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: `${added} item${added === 1 ? "" : "s"} added to cart`,
        description:
          skipped > 0
            ? `${skipped} item${skipped === 1 ? " is" : "s are"} unavailable and was skipped. Prices reflect the current catalog.`
            : "Prices reflect the current catalog.",
      });
      setIsCartOpen(true);
    } catch (err) {
      toast({
        title: "Reorder failed",
        description:
          err instanceof Error ? err.message : "Could not rebuild that order.",
        variant: "destructive",
      });
    } finally {
      setReorderingId(null);
    }
  };

  const handleLogout = async () => {
    await logout();
    setLocation("/account/login");
  };

  if (!token) {
    return (
      <div className="container mx-auto px-4 max-w-lg py-20 text-center space-y-6">
        <div className="w-12 h-12 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
          <User className="h-6 w-6 text-primary" />
        </div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">
          Sign in to view your account
        </h1>
        <p className="text-muted-foreground">
          Your order history and one-click reorder live here.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button asChild className="font-mono uppercase tracking-widest">
            <Link href="/account/login">Sign In</Link>
          </Button>
          <Button asChild variant="outline" className="font-mono uppercase tracking-widest">
            <Link href="/account/register">Create Account</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <section className="section-deep border-b border-border py-12">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-12 h-12 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <User className="h-6 w-6 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="font-display text-2xl md:text-3xl font-extrabold tracking-tight truncate">
                  {customer?.name || "Your account"}
                </h1>
                <p className="font-mono text-xs text-muted-foreground truncate">
                  {customer?.email ?? (isLoading ? "Loading…" : "")}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={handleLogout}
              className="font-mono uppercase tracking-widest text-xs"
            >
              <LogOut className="h-3.5 w-3.5 mr-1.5" /> Sign Out
            </Button>
          </div>
          {customer?.createdAt && (
            <p className="mt-4 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              Member since {formatDate(customer.createdAt)}
            </p>
          )}
        </div>
      </section>

      <div className="container mx-auto px-4 max-w-3xl py-12 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-xl font-bold tracking-tight">
            Order history
          </h2>
          <Button asChild variant="ghost" size="sm" className="font-mono uppercase tracking-widest text-xs">
            <Link href="/retail">Shop retail</Link>
          </Button>
        </div>

        {orders.isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        )}

        {orders.isError && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              {orders.error instanceof Error
                ? orders.error.message
                : "Could not load your orders."}
            </span>
          </div>
        )}

        {orders.isSuccess && orders.data.length === 0 && (
          <Card className="border-border border-dashed">
            <CardContent className="py-12 text-center space-y-4">
              <PackageSearch className="h-8 w-8 text-muted-foreground mx-auto opacity-50" />
              <p className="text-muted-foreground">
                No orders yet. Orders placed with{" "}
                <span className="font-mono">{customer?.email}</span> show up here
                automatically.
              </p>
              <Button asChild className="font-mono uppercase tracking-widest">
                <Link href="/retail">Browse catalog</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {orders.isSuccess &&
          orders.data.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onReorder={handleReorder}
              reordering={reorderingId === order.id}
            />
          ))}
      </div>
    </div>
  );
}
