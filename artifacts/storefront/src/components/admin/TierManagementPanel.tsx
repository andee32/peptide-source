import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AlertTriangle, RefreshCw, Star, Trash2, Plus } from "lucide-react";
import {
  useAdminListPriceTiers,
  useAdminCreatePriceTier,
  useAdminPatchPriceTier,
  useAdminDeletePriceTier,
  type PriceTier,
} from "@app/api-client-react";

/** Basis points -> percent for display. */
function bpsToPercent(bps: number): number {
  return bps / 100;
}

/** Percent -> basis points for the wire, guarding against NaN. */
function percentToBps(percent: number): number {
  if (Number.isNaN(percent)) return 0;
  return Math.round(percent * 100);
}

function DiscountBadge({ discountBps }: { discountBps: number }) {
  if (discountBps <= 0) {
    return (
      <Badge variant="secondary" className="text-[10px] font-mono uppercase tracking-wider">
        List price
      </Badge>
    );
  }
  return (
    <Badge variant="gold" className="text-[10px] font-mono">
      {bpsToPercent(discountBps)}% off
    </Badge>
  );
}

function TierRow({
  tier,
  adminKey,
  onChanged,
}: {
  tier: PriceTier;
  adminKey: string;
  onChanged: () => void;
}) {
  const [name, setName] = useState(tier.name);
  const [percent, setPercent] = useState(String(bpsToPercent(tier.discountBps)));
  const [error, setError] = useState("");

  const patch = useAdminPatchPriceTier({
    request: { headers: { "x-admin-key": adminKey } },
    mutation: {
      onSuccess: () => {
        setError("");
        onChanged();
      },
      onError: (err) => setError(err instanceof Error ? err.message : "Update failed"),
    },
  });

  const del = useAdminDeletePriceTier({
    request: { headers: { "x-admin-key": adminKey } },
    mutation: {
      onSuccess: () => {
        setError("");
        onChanged();
      },
      onError: (err) => setError(err instanceof Error ? err.message : "Delete failed"),
    },
  });

  const parsedPercent = Number.parseFloat(percent);
  const percentValid = !Number.isNaN(parsedPercent) && parsedPercent >= 0 && parsedPercent <= 90;
  const dirty = name.trim() !== tier.name || percentToBps(parsedPercent) !== tier.discountBps;

  const handleSave = () => {
    if (!name.trim() || !percentValid) return;
    patch.mutate({
      id: tier.id,
      data: { name: name.trim(), discountBps: percentToBps(parsedPercent) },
    });
  };

  const handleMakeDefault = () => {
    patch.mutate({ id: tier.id, data: { isDefault: true } });
  };

  const handleDelete = () => {
    if (!confirm(`Delete tier "${tier.name}"?`)) return;
    del.mutate({ id: tier.id });
  };

  const busy = patch.isPending || del.isPending;

  return (
    <Card className="border-border/30">
      <CardContent className="p-5">
        <div className="flex flex-col lg:flex-row lg:items-end gap-4">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-semibold text-sm">{tier.name}</span>
              <DiscountBadge discountBps={tier.discountBps} />
              {tier.isDefault && (
                <Badge variant="verified" className="text-[10px] font-mono uppercase tracking-wider gap-1">
                  <Star className="h-3 w-3" /> Default
                </Badge>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground font-mono space-y-0.5">
              <div>Slug: {tier.slug}</div>
              <div>Tier #{tier.id}</div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end shrink-0">
            <div className="space-y-1">
              <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Name
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="font-mono text-xs h-9 w-40"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Discount %
              </Label>
              <Input
                type="number"
                min="0"
                max="90"
                step="0.1"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                className="font-mono text-xs h-9 w-24"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="font-mono text-xs"
                disabled={busy || !dirty || !name.trim() || !percentValid}
                onClick={handleSave}
              >
                {patch.isPending ? "Saving…" : "Save"}
              </Button>
              {!tier.isDefault && (
                <Button
                  size="sm"
                  variant="outline"
                  className="font-mono text-xs"
                  disabled={busy}
                  onClick={handleMakeDefault}
                >
                  Make default
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="font-mono text-xs border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-40"
                disabled={busy || tier.isDefault}
                title={tier.isDefault ? "The default tier can't be deleted" : undefined}
                onClick={handleDelete}
                aria-label="Delete tier"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
        {error && <p className="text-destructive text-xs font-mono mt-3">{error}</p>}
      </CardContent>
    </Card>
  );
}

function CreateTierForm({
  adminKey,
  onCreated,
}: {
  adminKey: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [percent, setPercent] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState("");

  const create = useAdminCreatePriceTier({
    request: { headers: { "x-admin-key": adminKey } },
    mutation: {
      onSuccess: () => {
        setError("");
        setName("");
        setPercent("");
        setIsDefault(false);
        onCreated();
      },
      onError: (err) => setError(err instanceof Error ? err.message : "Create failed"),
    },
  });

  const parsedPercent = Number.parseFloat(percent);
  const percentValid = !Number.isNaN(parsedPercent) && parsedPercent >= 0 && parsedPercent <= 90;
  const canSubmit = name.trim().length > 0 && percentValid;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    create.mutate({
      data: {
        name: name.trim(),
        discountBps: percentToBps(parsedPercent),
        ...(isDefault ? { isDefault: true } : {}),
      },
    });
  };

  return (
    <Card className="border-border/30 border-dashed">
      <CardContent className="p-5">
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
          <div className="space-y-1">
            <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Name
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Gold Partner"
              className="font-mono text-xs h-9 w-44"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Discount %
            </Label>
            <Input
              type="number"
              min="0"
              max="90"
              step="0.1"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              placeholder="0–90"
              className="font-mono text-xs h-9 w-24"
            />
          </div>
          <div className="flex items-center gap-2 h-9">
            <Checkbox
              id="new-tier-default"
              checked={isDefault}
              onCheckedChange={(checked) => setIsDefault(!!checked)}
            />
            <Label
              htmlFor="new-tier-default"
              className="text-xs font-mono text-muted-foreground cursor-pointer"
            >
              Make default
            </Label>
          </div>
          <Button
            type="submit"
            size="sm"
            className="font-mono text-xs gap-1"
            disabled={create.isPending || !canSubmit}
          >
            <Plus className="h-3.5 w-3.5" />
            {create.isPending ? "Creating…" : "New Tier"}
          </Button>
        </form>
        {error && <p className="text-destructive text-xs font-mono mt-3">{error}</p>}
      </CardContent>
    </Card>
  );
}

export function TierManagementPanel({ adminKey }: { adminKey: string }) {
  const tiersQuery = useAdminListPriceTiers({
    request: { headers: { "x-admin-key": adminKey } },
  });

  const tiers = tiersQuery.data ?? [];
  const refetchAll = () => {
    void tiersQuery.refetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Price Tiers</h1>
          <p className="text-muted-foreground text-sm mt-1 font-mono">
            Wholesale discount off list — assigned to customers in the Customers tab
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

      {tiersQuery.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : tiersQuery.isError ? (
        <div className="text-center py-12">
          <AlertTriangle className="h-6 w-6 text-destructive mx-auto mb-2" />
          <p className="text-destructive text-sm font-mono">
            {tiersQuery.error instanceof Error ? tiersQuery.error.message : "Failed to load price tiers"}
          </p>
          <Button variant="outline" size="sm" className="mt-4 font-mono" onClick={refetchAll}>Retry</Button>
        </div>
      ) : tiers.length === 0 ? (
        <Card className="border-border/30">
          <CardContent className="py-12 text-center text-muted-foreground font-mono text-sm">
            No price tiers yet. Create one below.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tiers.map((tier) => (
            <TierRow key={tier.id} tier={tier} adminKey={adminKey} onChanged={refetchAll} />
          ))}
        </div>
      )}

      <CreateTierForm adminKey={adminKey} onCreated={refetchAll} />
    </div>
  );
}
