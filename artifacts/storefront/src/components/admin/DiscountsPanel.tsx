import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw, AlertTriangle, Plus, Tag, Pencil } from "lucide-react";
import { format } from "date-fns";
import {
  useAdminListDiscountCodes,
  useAdminCreateDiscountCode,
  useAdminPatchDiscountCode,
  type DiscountCodeAdmin,
} from "@app/api-client-react";

function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function formatPct(bps: number): string {
  const pct = bps / 100;
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`;
}

function CreateCodeForm({
  adminKey,
  onCreated,
}: {
  adminKey: string;
  onCreated: () => void;
}) {
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState("10");
  const [maxUses, setMaxUses] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const create = useAdminCreateDiscountCode({
    request: { headers: { "x-admin-key": adminKey } },
    mutation: {
      onSuccess: () => {
        setCode("");
        setPercent("10");
        setMaxUses("");
        setExpiresAt("");
        setNote("");
        setError("");
        onCreated();
      },
      onError: (err) =>
        setError(err instanceof Error ? err.message : "Create failed"),
    },
  });

  const pct = Number(percent);
  const pctValid = Number.isFinite(pct) && pct > 0 && pct <= 50;
  const codeValid = /^[A-Za-z0-9-]{2,64}$/.test(code.trim());
  const maxUsesNum = maxUses.trim() === "" ? null : Number(maxUses);
  const maxUsesValid =
    maxUsesNum === null || (Number.isInteger(maxUsesNum) && maxUsesNum >= 1);
  const canSubmit = codeValid && pctValid && maxUsesValid && !create.isPending;

  const submit = () => {
    if (!canSubmit) return;
    create.mutate({
      data: {
        code: code.trim().toUpperCase(),
        percentBps: Math.round(pct * 100),
        maxUses: maxUsesNum,
        // End of the chosen day, local time — a bare date parses as UTC
        // midnight, which would expire the code before the day even starts.
        expiresAt: expiresAt
          ? new Date(`${expiresAt}T23:59:59.999`).toISOString()
          : null,
        note: note.trim() ? note.trim() : null,
      },
    });
  };

  return (
    <Card className="border-border/30">
      <CardContent className="p-5">
        <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Plus className="h-4 w-4 text-teal-ink" /> New code
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <Label htmlFor="dc-code" className="text-muted-foreground text-xs mb-1 block">
              Code
            </Label>
            <Input
              id="dc-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="LAUNCH10"
              maxLength={64}
              className="h-8 font-mono text-xs uppercase"
            />
          </div>
          <div>
            <Label htmlFor="dc-pct" className="text-muted-foreground text-xs mb-1 block">
              Percent off
            </Label>
            <Input
              id="dc-pct"
              type="number"
              min={0.5}
              max={50}
              step={0.5}
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              className="h-8 font-mono text-xs"
            />
          </div>
          <div>
            <Label htmlFor="dc-max" className="text-muted-foreground text-xs mb-1 block">
              Max uses <span className="opacity-60">(blank = ∞)</span>
            </Label>
            <Input
              id="dc-max"
              type="number"
              min={1}
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              className="h-8 font-mono text-xs"
            />
          </div>
          <div>
            <Label htmlFor="dc-exp" className="text-muted-foreground text-xs mb-1 block">
              Expires <span className="opacity-60">(optional)</span>
            </Label>
            <Input
              id="dc-exp"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="h-8 font-mono text-xs"
            />
          </div>
          <div>
            <Label htmlFor="dc-note" className="text-muted-foreground text-xs mb-1 block">
              Note <span className="opacity-60">(attribution)</span>
            </Label>
            <Input
              id="dc-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="affiliate — @DrSmith"
              maxLength={500}
              className="h-8 text-xs"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button
            size="sm"
            className="font-mono text-xs"
            disabled={!canSubmit}
            onClick={submit}
          >
            {create.isPending ? "Creating…" : "Create code"}
          </Button>
          {error && <p className="text-destructive text-xs font-mono">{error}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function CodeRow({
  dc,
  adminKey,
  onMutated,
}: {
  dc: DiscountCodeAdmin;
  adminKey: string;
  onMutated: () => void;
}) {
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [editMaxUses, setEditMaxUses] = useState("");
  const [editExpiry, setEditExpiry] = useState("");
  const patch = useAdminPatchDiscountCode({
    request: { headers: { "x-admin-key": adminKey } },
    mutation: {
      onSuccess: () => {
        setError("");
        setEditing(false);
        onMutated();
      },
      onError: (err) =>
        setError(err instanceof Error ? err.message : "Update failed"),
    },
  });

  const expired = dc.expiresAt !== null && new Date(dc.expiresAt) <= new Date();
  const exhausted = dc.maxUses !== null && dc.timesUsed >= dc.maxUses;

  const startEdit = () => {
    setEditMaxUses(dc.maxUses === null ? "" : String(dc.maxUses));
    setEditExpiry(
      dc.expiresAt ? format(new Date(dc.expiresAt), "yyyy-MM-dd") : ""
    );
    setEditing(true);
  };

  const saveEdit = () => {
    const maxUsesNum = editMaxUses.trim() === "" ? null : Number(editMaxUses);
    if (maxUsesNum !== null && (!Number.isInteger(maxUsesNum) || maxUsesNum < 1)) {
      setError("Max uses must be a positive whole number");
      return;
    }
    patch.mutate({
      id: dc.id,
      data: {
        maxUses: maxUsesNum,
        expiresAt: editExpiry
          ? new Date(`${editExpiry}T23:59:59.999`).toISOString()
          : null,
      },
    });
  };

  return (
    <TableRow className="border-border/30">
      <TableCell className="font-mono text-xs font-semibold">{dc.code}</TableCell>
      <TableCell className="font-mono text-xs">{formatPct(dc.percentBps)}</TableCell>
      <TableCell className="font-mono text-xs">
        {editing ? (
          <Input
            type="number"
            min={1}
            value={editMaxUses}
            onChange={(e) => setEditMaxUses(e.target.value)}
            placeholder="∞"
            aria-label="Max uses"
            className="h-7 w-20 font-mono text-xs inline-block"
          />
        ) : (
          <>
            {dc.timesUsed}
            {dc.maxUses !== null ? ` / ${dc.maxUses}` : ""}
            {exhausted && (
              <Badge className="ml-2 bg-warn-tint text-warn border-warn/30 text-[10px]">
                Exhausted
              </Badge>
            )}
          </>
        )}
      </TableCell>
      <TableCell className="font-mono text-[11px] text-muted-foreground whitespace-nowrap">
        {editing ? (
          <Input
            type="date"
            value={editExpiry}
            onChange={(e) => setEditExpiry(e.target.value)}
            aria-label="Expiry date"
            className="h-7 w-32 font-mono text-xs"
          />
        ) : dc.expiresAt ? (
          <span className={expired ? "text-warn" : undefined}>
            {format(new Date(dc.expiresAt), "MMM d, yyyy")}
          </span>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="font-mono text-xs">{dc.confirmedOrders}</TableCell>
      <TableCell className="font-mono text-xs">
        {formatMoney(dc.confirmedRevenueCents)}
      </TableCell>
      <TableCell className="text-[11px] text-muted-foreground max-w-[180px] truncate">
        {dc.note ?? ""}
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-2">
          {editing ? (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-7 font-mono text-xs"
                disabled={patch.isPending}
                onClick={saveEdit}
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 font-mono text-xs text-muted-foreground"
                disabled={patch.isPending}
                onClick={() => {
                  setEditing(false);
                  setError("");
                }}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-muted-foreground"
                aria-label="Edit cap and expiry"
                title="Edit cap and expiry"
                onClick={startEdit}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Switch
                checked={dc.active}
                disabled={patch.isPending}
                aria-label={dc.active ? "Deactivate code" : "Activate code"}
                onCheckedChange={(checked) =>
                  patch.mutate({ id: dc.id, data: { active: checked } })
                }
              />
              <span
                className={`text-[10px] font-mono uppercase tracking-wider ${
                  dc.active ? "text-teal-ink" : "text-muted-foreground"
                }`}
              >
                {dc.active ? "Active" : "Off"}
              </span>
            </>
          )}
        </div>
        {error && (
          <p className="text-destructive text-[10px] font-mono mt-1">{error}</p>
        )}
      </TableCell>
    </TableRow>
  );
}

export function DiscountsPanel({ adminKey }: { adminKey: string }) {
  const listQuery = useAdminListDiscountCodes({
    request: { headers: { "x-admin-key": adminKey } },
  });
  const codes = listQuery.data ?? [];
  const refetch = () => void listQuery.refetch();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Discounts</h1>
          <p className="text-muted-foreground text-sm mt-1 font-mono">
            Retail promo codes — stack sequentially with the crypto payment
            discount. Codes are deactivated, never deleted.
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

      <CreateCodeForm adminKey={adminKey} onCreated={refetch} />

      {listQuery.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : listQuery.isError ? (
        <div className="text-center py-12">
          <AlertTriangle className="h-6 w-6 text-destructive mx-auto mb-2" />
          <p className="text-destructive text-sm font-mono">
            Failed to load discount codes
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
      ) : codes.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-xl">
          <Tag className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-50" />
          <p className="text-muted-foreground text-sm font-mono">
            No discount codes yet. Create one above.
          </p>
        </div>
      ) : (
        <Card className="border-border/30 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/30 hover:bg-transparent">
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Code</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Off</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Used</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Expires</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Confirmed</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Revenue</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Note</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {codes.map((dc) => (
                  <CodeRow
                    key={dc.id}
                    dc={dc}
                    adminKey={adminKey}
                    onMutated={refetch}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
