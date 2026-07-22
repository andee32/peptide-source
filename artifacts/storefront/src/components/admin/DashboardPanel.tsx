import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Users, PackageX, ShieldAlert } from "lucide-react";
import { useAdminGetStats } from "@atlab/api-client-react";

const formatUsd = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    (cents ?? 0) / 100,
  );

const ORDER_STATUS_ORDER = [
  "pending",
  "awaiting_payment",
  "confirmed",
  "expired",
  "failed",
  "refunded",
] as const;

function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Card className="border-border/40">
      <CardContent className="p-5">
        <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="mt-2 text-3xl font-bold text-secondary tabular-nums">{value}</div>
        {sub && <div className="mt-1 text-xs text-muted-foreground font-mono">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function AttentionTile({
  label,
  value,
  icon,
  needsAttention,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  needsAttention: boolean;
}) {
  return (
    <Card
      className={
        needsAttention
          ? "border-brand-gold/60 bg-brand-gold/5"
          : "border-border/40"
      }
    >
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
          <span className={needsAttention ? "text-brand-gold" : "text-muted-foreground"}>
            {icon}
          </span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span
            className={
              needsAttention
                ? "text-3xl font-bold text-brand-gold tabular-nums"
                : "text-3xl font-bold text-secondary tabular-nums"
            }
          >
            {value}
          </span>
          {needsAttention && (
            <Badge className="bg-brand-gold text-structure-900 hover:bg-brand-gold font-mono text-[10px] uppercase">
              Needs review
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardPanel({ adminKey }: { adminKey: string }) {
  const statsQuery = useAdminGetStats({
    request: { headers: { "x-admin-key": adminKey } },
  });

  const stats = statsQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1 font-mono">
            Operational overview across accounts, orders, and catalog
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="font-mono gap-2"
          onClick={() => void statsQuery.refetch()}
          disabled={statsQuery.isFetching}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${statsQuery.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {statsQuery.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : statsQuery.isError ? (
        <div className="text-center py-12">
          <AlertTriangle className="h-6 w-6 text-destructive mx-auto mb-2" />
          <p className="text-destructive text-sm font-mono">
            {statsQuery.error instanceof Error
              ? statsQuery.error.message
              : "Failed to load stats"}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 font-mono"
            onClick={() => void statsQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : !stats ? (
        <Card className="border-border/30">
          <CardContent className="py-12 text-center text-muted-foreground font-mono text-sm">
            No stats available.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Attention row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <AttentionTile
              label="Pending Applications"
              value={stats.pendingAccounts}
              icon={<Users className="h-4 w-4" />}
              needsAttention={stats.pendingAccounts > 0}
            />
            <AttentionTile
              label="Blocked SKUs"
              value={stats.blockedSkus}
              icon={<ShieldAlert className="h-4 w-4" />}
              needsAttention={stats.blockedSkus > 0}
            />
            <AttentionTile
              label="Out of Stock"
              value={stats.outOfStockVariants}
              icon={<PackageX className="h-4 w-4" />}
              needsAttention={stats.outOfStockVariants > 0}
            />
          </div>

          {/* Core KPI grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatTile
              label="Confirmed Revenue"
              value={formatUsd(stats.revenueCentsConfirmed)}
              sub="Sum of confirmed orders"
            />
            <StatTile label="Total Products" value={stats.totalProducts} />
            <StatTile label="Total Accounts" value={stats.totalAccounts} />
          </div>

          {/* Orders by status breakdown */}
          <Card className="border-border/40">
            <CardContent className="p-5">
              <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground mb-4">
                Orders by Status
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                {ORDER_STATUS_ORDER.filter(
                  (s) => stats.ordersByStatus[s] !== undefined,
                )
                  .concat(
                    Object.keys(stats.ordersByStatus).filter(
                      (s) =>
                        !ORDER_STATUS_ORDER.includes(
                          s as (typeof ORDER_STATUS_ORDER)[number],
                        ),
                    ) as (typeof ORDER_STATUS_ORDER)[number][],
                  )
                  .map((status) => (
                    <div key={status}>
                      <div className="text-2xl font-bold text-secondary tabular-nums">
                        {stats.ordersByStatus[status] ?? 0}
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        {status.replace(/_/g, " ")}
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
