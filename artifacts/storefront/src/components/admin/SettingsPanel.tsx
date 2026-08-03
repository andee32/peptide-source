import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertTriangle, Check } from "lucide-react";
import { useAdminGetSettings, useAdminPatchSettings } from "@app/api-client-react";

export function SettingsPanel({ adminKey }: { adminKey: string }) {
  const settingsQuery = useAdminGetSettings({
    request: { headers: { "x-admin-key": adminKey } },
  });

  const patch = useAdminPatchSettings({
    request: { headers: { "x-admin-key": adminKey } },
    mutation: {
      onSuccess: () => {
        void settingsQuery.refetch();
      },
    },
  });

  const showVialImages = settingsQuery.data?.showVialImages ?? true;
  const cryptoDiscountBps = settingsQuery.data?.cryptoDiscountBps ?? 1000;
  const fulfillmentEmail = settingsQuery.data?.fulfillmentEmail ?? "";

  // Local draft for the shipper email so typing doesn't PATCH per keystroke.
  const [shipperEmail, setShipperEmail] = useState("");
  useEffect(() => {
    setShipperEmail(fulfillmentEmail ?? "");
  }, [fulfillmentEmail]);
  const shipperDirty = shipperEmail.trim() !== (fulfillmentEmail ?? "").trim();
  const shipperValid =
    shipperEmail.trim() === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(shipperEmail.trim());
  const saveShipper = () => {
    if (!shipperDirty || !shipperValid) return;
    patch.mutate({ data: { fulfillmentEmail: shipperEmail.trim() } });
  };

  // Local percent draft so typing doesn't fire a PATCH per keystroke.
  const [discountPct, setDiscountPct] = useState(String(cryptoDiscountBps / 100));
  useEffect(() => {
    setDiscountPct(String(cryptoDiscountBps / 100));
  }, [cryptoDiscountBps]);

  const parsedPct = Number(discountPct);
  const pctValid =
    discountPct.trim() !== "" &&
    Number.isFinite(parsedPct) &&
    parsedPct >= 0 &&
    parsedPct <= 50;
  const pctDirty = pctValid && Math.round(parsedPct * 100) !== cryptoDiscountBps;

  const saveDiscount = () => {
    if (!pctDirty) return;
    patch.mutate({ data: { cryptoDiscountBps: Math.round(parsedPct * 100) } });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground text-sm mt-1 font-mono">
            Global storefront controls
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="font-mono gap-2"
          onClick={() => void settingsQuery.refetch()}
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {settingsQuery.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : settingsQuery.isError ? (
        <div className="text-center py-12">
          <AlertTriangle className="h-6 w-6 text-destructive mx-auto mb-2" />
          <p className="text-destructive text-sm font-mono">
            Failed to load settings
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 font-mono"
            onClick={() => void settingsQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : (
        <Card className="border-border/30">
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label
                  htmlFor="show-vial-images"
                  className="text-sm font-medium"
                >
                  Show product images in store
                </Label>
                <p className="text-[11px] text-muted-foreground font-mono leading-relaxed max-w-md">
                  When off, product vial / placeholder images are hidden across
                  the storefront and cards reflow to a compact text layout.
                </p>
              </div>
              <Switch
                id="show-vial-images"
                checked={showVialImages}
                disabled={patch.isPending}
                onCheckedChange={(checked) =>
                  patch.mutate({ data: { showVialImages: checked } })
                }
              />
            </div>
            <div className="mt-6 pt-5 border-t border-border/50 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="crypto-discount-pct" className="text-sm font-medium">
                  Crypto payment discount (%)
                </Label>
                <p className="text-[11px] text-muted-foreground font-mono leading-relaxed max-w-md">
                  Percent off retail orders paid with BTC / USDC. Applied
                  server-side at order creation; never applied to wholesale.
                  Set to 0 to disable.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  id="crypto-discount-pct"
                  type="number"
                  min={0}
                  max={50}
                  step={0.5}
                  value={discountPct}
                  onChange={(e) => setDiscountPct(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveDiscount()}
                  className="h-8 w-24 font-mono text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 font-mono text-xs"
                  disabled={!pctDirty || patch.isPending}
                  onClick={saveDiscount}
                  aria-label="Save crypto discount"
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            {!pctValid && (
              <p className="text-destructive text-xs font-mono mt-2">
                Enter a percentage between 0 and 50.
              </p>
            )}

            <div className="mt-6 pt-5 border-t border-border/50 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="fulfillment-email" className="text-sm font-medium">
                  Shipper / fulfillment email
                </Label>
                <p className="text-[11px] text-muted-foreground font-mono leading-relaxed max-w-md">
                  Emailed the order details (what to ship + where) when an order is
                  confirmed. Leave blank for no shipper notification.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  id="fulfillment-email"
                  type="email"
                  placeholder="shipper@example.com"
                  value={shipperEmail}
                  onChange={(e) => setShipperEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveShipper()}
                  className="h-8 w-56 font-mono text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 font-mono text-xs"
                  disabled={!shipperDirty || !shipperValid || patch.isPending}
                  onClick={saveShipper}
                  aria-label="Save shipper email"
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            {!shipperValid && (
              <p className="text-destructive text-xs font-mono mt-2">
                Enter a valid email, or leave blank to disable.
              </p>
            )}
            {patch.isError && (
              <p className="text-destructive text-xs font-mono mt-3">
                {patch.error instanceof Error
                  ? patch.error.message
                  : "Update failed"}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
