import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { useGetSettings, useAdminPatchSettings } from "@atlab/api-client-react";

export function SettingsPanel({ adminKey }: { adminKey: string }) {
  const settingsQuery = useGetSettings();

  const patch = useAdminPatchSettings({
    request: { headers: { "x-admin-key": adminKey } },
    mutation: {
      onSuccess: () => {
        void settingsQuery.refetch();
      },
    },
  });

  const showVialImages = settingsQuery.data?.showVialImages ?? true;

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
