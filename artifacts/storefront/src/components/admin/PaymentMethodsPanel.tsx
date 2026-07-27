import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AlertTriangle, RefreshCw } from "lucide-react";
import {
  useAdminListPaymentMethods,
  useAdminPatchPaymentMethod,
  type PaymentMethodState,
} from "@atlab/api-client-react";

function ConfigBadge({ method }: { method: PaymentMethodState }) {
  if (method.configured) {
    return (
      <Badge variant="verified" className="text-[10px] font-mono uppercase tracking-wider">
        {method.configLabel} ✓
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-[10px] font-mono uppercase tracking-wider">
      {method.configLabel} not provisioned
    </Badge>
  );
}

function PaymentMethodRow({
  method,
  adminKey,
  onChanged,
}: {
  method: PaymentMethodState;
  adminKey: string;
  onChanged: () => void;
}) {
  const [error, setError] = useState("");

  const patch = useAdminPatchPaymentMethod({
    request: { headers: { "x-admin-key": adminKey } },
    mutation: {
      onSuccess: () => {
        setError("");
        onChanged();
      },
      onError: (err) => setError(err instanceof Error ? err.message : "Update failed"),
    },
  });

  const handleRetailToggle = (checked: boolean) => {
    if (!method.retailAllowed) return;
    patch.mutate({ method: method.method, data: { enabledRetail: checked } });
  };

  const handleWholesaleToggle = (checked: boolean) => {
    patch.mutate({ method: method.method, data: { enabledWholesale: checked } });
  };

  return (
    <Card className="border-border/30">
      <CardContent className="p-5">
        <div className="flex flex-col lg:flex-row lg:items-start gap-4">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-semibold text-sm">{method.label}</span>
              <ConfigBadge method={method} />
            </div>
            {!method.configured && (
              <p className="text-[10px] text-muted-foreground font-mono">
                Enable is allowed, but it won't be live until configured.
              </p>
            )}
            <p className="text-[10px] text-muted-foreground font-mono">
              Live: retail {method.availableRetail ? "yes" : "no"} · wholesale {method.availableWholesale ? "yes" : "no"}
            </p>
          </div>

          <div className="flex gap-6 shrink-0">
            <div className="space-y-1">
              <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Retail
              </Label>
              <div className="flex items-center gap-2 h-9">
                <Switch
                  checked={method.enabledRetail}
                  disabled={patch.isPending || !method.retailAllowed}
                  onCheckedChange={handleRetailToggle}
                  aria-label={`Toggle ${method.label} for retail`}
                />
                {!method.retailAllowed && (
                  <span className="text-[10px] text-muted-foreground font-mono">wholesale-only</span>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Wholesale
              </Label>
              <div className="flex items-center h-9">
                <Switch
                  checked={method.enabledWholesale}
                  disabled={patch.isPending}
                  onCheckedChange={handleWholesaleToggle}
                  aria-label={`Toggle ${method.label} for wholesale`}
                />
              </div>
            </div>
          </div>
        </div>
        {error && <p className="text-destructive text-xs font-mono mt-3">{error}</p>}
      </CardContent>
    </Card>
  );
}

export function PaymentMethodsPanel({ adminKey }: { adminKey: string }) {
  const methodsQuery = useAdminListPaymentMethods({
    request: { headers: { "x-admin-key": adminKey } },
  });

  const methods = methodsQuery.data ?? [];
  const refetchAll = () => {
    void methodsQuery.refetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Payment Methods</h1>
          <p className="text-muted-foreground text-sm mt-1 font-mono">
            Turn each rail on or off for retail and/or wholesale. A method is only live when
            enabled AND its backend config is provisioned.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="font-mono gap-2"
          onClick={refetchAll}
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {methodsQuery.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : methodsQuery.isError ? (
        <div className="text-center py-12">
          <AlertTriangle className="h-6 w-6 text-destructive mx-auto mb-2" />
          <p className="text-destructive text-sm font-mono">
            {methodsQuery.error instanceof Error ? methodsQuery.error.message : "Failed to load payment methods"}
          </p>
          <Button variant="outline" size="sm" className="mt-4 font-mono" onClick={refetchAll}>Retry</Button>
        </div>
      ) : methods.length === 0 ? (
        <Card className="border-border/30">
          <CardContent className="py-12 text-center text-muted-foreground font-mono text-sm">
            No payment methods found.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {methods.map((method) => (
            <PaymentMethodRow
              key={method.method}
              method={method}
              adminKey={adminKey}
              onChanged={refetchAll}
            />
          ))}
        </div>
      )}
    </div>
  );
}
