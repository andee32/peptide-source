import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
  AlertTriangle,
  RefreshCw,
  ChevronRight,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import { format } from "date-fns";
import {
  useAdminListOrders,
  useAdminGetOrder,
  useAdminPatchOrder,
  useAdminRefundOrder,
  OrderStatus,
  AdminListOrdersChannel,
  type AdminOrderSummary,
  type OrderStatus as OrderStatusValue,
} from "@atlab/api-client-react";

const STATUS_VALUES = Object.values(OrderStatus) as OrderStatusValue[];
const CHANNEL_VALUES = Object.values(AdminListOrdersChannel);

const TERMINAL_STATUSES: OrderStatusValue[] = [
  OrderStatus.refunded,
  OrderStatus.expired,
  OrderStatus.failed,
];

function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

function OrderStatusBadge({ status }: { status: OrderStatusValue }) {
  const cls: Record<OrderStatusValue, string> = {
    confirmed: "bg-primary/15 text-teal-ink border-primary/30",
    shipped: "bg-[var(--atl-blue-tint)] text-[var(--atl-blue)] border-[var(--atl-blue)]/30",
    awaiting_payment: "bg-warn-tint text-warn border-warn/30",
    pending: "bg-secondary text-secondary-foreground border-border/40",
    refunded: "bg-muted text-muted-foreground border-border/40",
    expired: "bg-muted text-muted-foreground border-border/40",
    failed: "bg-destructive/20 text-destructive border-destructive/30",
  };
  return (
    <Badge className={`${cls[status]} gap-1 font-mono text-xs capitalize`}>
      {statusLabel(status)}
    </Badge>
  );
}

function ChannelBadge({ channel }: { channel: string }) {
  return channel === "wholesale" ? (
    <Badge variant="gold" className="text-[10px] font-mono uppercase tracking-wider">
      Wholesale
    </Badge>
  ) : (
    <Badge variant="outline" className="text-[10px] font-mono uppercase tracking-wider">
      Retail
    </Badge>
  );
}

function OrderDetailDialog({
  orderId,
  adminKey,
  onClose,
  onMutated,
}: {
  orderId: string;
  adminKey: string;
  onClose: () => void;
  onMutated: () => void;
}) {
  const request = { headers: { "x-admin-key": adminKey } };

  const detailQuery = useAdminGetOrder(orderId, { request });
  const order = detailQuery.data;

  const [status, setStatus] = useState<OrderStatusValue | "">("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [carrier, setCarrier] = useState("");
  const [error, setError] = useState("");

  // Seed the form from the loaded order (once, when it first arrives).
  const [seededId, setSeededId] = useState<string | null>(null);
  if (order && seededId !== order.id) {
    setSeededId(order.id);
    setStatus(order.status);
    setTrackingNumber(order.trackingNumber ?? "");
    setCarrier(order.carrier ?? "");
  }

  const patch = useAdminPatchOrder({
    request,
    mutation: {
      onSuccess: () => {
        setError("");
        void detailQuery.refetch();
        onMutated();
      },
      onError: (err) =>
        setError(err instanceof Error ? err.message : "Update failed"),
    },
  });

  const refund = useAdminRefundOrder({
    request,
    mutation: {
      onSuccess: () => {
        setError("");
        void detailQuery.refetch();
        onMutated();
      },
      onError: (err) =>
        setError(err instanceof Error ? err.message : "Refund failed"),
    },
  });

  const isTerminal = order ? TERMINAL_STATUSES.includes(order.status) : false;
  const busy = patch.isPending || refund.isPending;

  const submitPatch = () => {
    if (!order) return;
    setError("");
    patch.mutate({
      id: order.id,
      data: {
        status: status || undefined,
        trackingNumber: trackingNumber.trim() ? trackingNumber.trim() : null,
        carrier: carrier.trim() ? carrier.trim() : null,
      },
    });
  };

  const submitRefund = () => {
    if (!order) return;
    if (
      !confirm(
        `Mark order ${order.id} as refunded? This is the record of record only — the actual crypto refund must be performed off-platform.`,
      )
    )
      return;
    refund.mutate({ id: order.id });
  };

  const attestation = order?.attestations?.[0];

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono">Order Detail</DialogTitle>
          <DialogDescription className="font-mono text-xs break-all">
            {orderId}
          </DialogDescription>
        </DialogHeader>

        {detailQuery.isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : detailQuery.isError || !order ? (
          <div className="text-center py-12">
            <AlertTriangle className="h-6 w-6 text-destructive mx-auto mb-2" />
            <p className="text-destructive text-sm font-mono">
              {detailQuery.error instanceof Error
                ? detailQuery.error.message
                : "Failed to load order"}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4 font-mono"
              onClick={() => void detailQuery.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : (
          <div className="space-y-5 mt-2">
            {/* Summary */}
            <div className="flex flex-wrap items-center gap-2">
              <ChannelBadge channel={order.channel} />
              <OrderStatusBadge status={order.status} />
              <Badge variant="outline" className="text-[10px] font-mono uppercase tracking-wider">
                {order.paymentMethod.replace(/_/g, " ")}
              </Badge>
              <span className="text-muted-foreground text-xs font-mono ml-auto">
                {format(new Date(order.createdAt), "MMM d, yyyy 'at' h:mm a")}
              </span>
            </div>

            {/* Line items */}
            <div>
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Line Items
              </Label>
              <div className="mt-1.5 rounded-lg border border-border/30 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/30 hover:bg-transparent">
                      <TableHead className="font-mono text-xs uppercase tracking-wider">Product</TableHead>
                      <TableHead className="font-mono text-xs uppercase tracking-wider text-right">Qty</TableHead>
                      <TableHead className="font-mono text-xs uppercase tracking-wider text-right">Unit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.lineItems.map((li, i) => (
                      <TableRow key={i} className="border-border/20">
                        <TableCell className="text-sm">
                          <span className="font-medium">{li.productName}</span>
                          <span className="text-muted-foreground"> · {li.variantName}</span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{li.quantity}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatMoney(li.unitPriceCents)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-col items-end gap-0.5 mt-2 text-sm font-mono">
                <div className="text-muted-foreground">
                  Subtotal {formatMoney(order.subtotalCents)}
                </div>
                {order.promoDiscountCents > 0 && (
                  <div className="text-good">
                    Code {order.discountCode ?? ""} −
                    {formatMoney(order.promoDiscountCents)}
                  </div>
                )}
                {order.cryptoDiscountCents > 0 && (
                  <div className="text-good">
                    Crypto discount −{formatMoney(order.cryptoDiscountCents)}
                  </div>
                )}
                {order.discountCents >
                  order.promoDiscountCents + order.cryptoDiscountCents && (
                  <div className="text-muted-foreground">
                    Discount −
                    {formatMoney(
                      order.discountCents -
                        order.promoDiscountCents -
                        order.cryptoDiscountCents,
                    )}
                  </div>
                )}
                <div className="font-semibold">Total {formatMoney(order.totalCents)}</div>
              </div>
            </div>

            {/* Shipping */}
            <div>
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Shipping
              </Label>
              <div className="mt-1.5 text-sm font-mono text-muted-foreground space-y-0.5">
                <div className="text-foreground">{order.shippingName}</div>
                <div>{order.shippingEmail}</div>
                <div>
                  {order.shippingAddress1}
                  {order.shippingAddress2 ? `, ${order.shippingAddress2}` : ""}
                </div>
                <div>
                  {order.shippingCity}, {order.shippingState} {order.shippingZip} · {order.shippingCountry}
                </div>
              </div>
            </div>

            {/* Payment record */}
            <div>
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Payment
              </Label>
              {order.payments && order.payments.length > 0 ? (
                <div className="mt-1.5 space-y-2">
                  {order.payments.map((p) => (
                    <div
                      key={p.id}
                      className="rounded-lg border border-border/30 bg-secondary/20 p-3 text-xs font-mono text-muted-foreground space-y-0.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-foreground font-semibold">
                          {p.amount} {p.currency}
                        </span>
                        <Badge
                          className={
                            p.status === "confirmed"
                              ? "bg-primary/20 text-primary border-primary/30 text-[10px] font-mono capitalize"
                              : p.status === "failed"
                                ? "bg-destructive/20 text-destructive border-destructive/30 text-[10px] font-mono capitalize"
                                : "bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-[10px] font-mono capitalize"
                          }
                        >
                          {p.status}
                        </Badge>
                      </div>
                      <div>{formatMoney(p.amountCents)}</div>
                      {p.btcpayInvoiceId && <div>Invoice: {p.btcpayInvoiceId}</div>}
                      {p.txHash && <div className="break-all">Tx: {p.txHash}</div>}
                      {p.confirmedAt && (
                        <div>Confirmed {format(new Date(p.confirmedAt), "MMM d, yyyy 'at' h:mm a")}</div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-1.5 text-xs font-mono text-muted-foreground">No payment records.</p>
              )}
            </div>

            {/* RUO attestation */}
            <div>
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" /> RUO Attestation
              </Label>
              {attestation ? (
                <div className="mt-1.5 rounded-lg border border-border/30 bg-secondary/20 p-3 text-xs font-mono space-y-1">
                  <div>
                    <span className="text-muted-foreground">Signer: </span>
                    <span className="text-foreground font-semibold">{attestation.signerName}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Affirmed: </span>
                    {attestation.ruoAffirmed ? "yes" : "no"} · v{attestation.attestationVersion}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Timestamp: </span>
                    {format(new Date(attestation.createdAt), "MMM d, yyyy 'at' h:mm:ss a")}
                  </div>
                  <p className="text-muted-foreground italic pt-1">{attestation.attestationText}</p>
                </div>
              ) : (
                <p className="mt-1.5 text-xs font-mono text-muted-foreground">
                  No attestation record on file.
                </p>
              )}
            </div>

            {/* Linked account */}
            {order.account && (
              <div>
                <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Wholesale Account
                </Label>
                <div className="mt-1.5 rounded-lg border border-border/30 bg-secondary/20 p-3 text-xs font-mono text-muted-foreground space-y-0.5">
                  <div className="text-foreground font-semibold">{order.account.businessName}</div>
                  <div>
                    {order.account.contactName} · {order.account.email}
                  </div>
                  {order.account.priceTier && <div>Tier: {order.account.priceTier.name}</div>}
                  <div>Status: {order.account.status}</div>
                </div>
              </div>
            )}

            <Separator />

            {/* Mutations */}
            <div className="space-y-3">
              <div>
                <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Status
                </Label>
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as OrderStatusValue)}
                  disabled={isTerminal}
                >
                  <SelectTrigger className="mt-1.5 font-mono">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_VALUES.map((s) => (
                      <SelectItem key={s} value={s} className="font-mono capitalize">
                        {statusLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isTerminal && (
                  <p className="mt-1 text-[10px] font-mono text-muted-foreground">
                    Status is terminal ({statusLabel(order.status)}) and cannot be changed.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    Tracking #
                  </Label>
                  <Input
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    placeholder="e.g. 1Z999…"
                    className="mt-1.5 font-mono"
                  />
                </div>
                <div>
                  <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    Carrier
                  </Label>
                  <Input
                    value={carrier}
                    onChange={(e) => setCarrier(e.target.value)}
                    placeholder="e.g. UPS"
                    className="mt-1.5 font-mono"
                  />
                </div>
              </div>

              {error && <p className="text-destructive text-sm font-mono">{error}</p>}

              <div className="flex gap-2 pt-1">
                <Button className="flex-1 font-mono" disabled={busy} onClick={submitPatch}>
                  {patch.isPending ? "Saving…" : "Save Changes"}
                </Button>
                <Button
                  variant="outline"
                  className="font-mono gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
                  disabled={busy || order.status === OrderStatus.refunded}
                  onClick={submitRefund}
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  {refund.isPending ? "Refunding…" : "Refund"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function OrdersPanel({ adminKey }: { adminKey: string }) {
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const params: { channel?: AdminOrderSummary["channel"]; status?: OrderStatusValue } = {};
  if (channelFilter !== "all") params.channel = channelFilter as AdminOrderSummary["channel"];
  if (statusFilter !== "all") params.status = statusFilter as OrderStatusValue;

  const ordersQuery = useAdminListOrders(
    Object.keys(params).length > 0 ? params : undefined,
    { request: { headers: { "x-admin-key": adminKey } } },
  );

  const orders = ordersQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Orders</h1>
          <p className="text-muted-foreground text-sm mt-1 font-mono">
            {orders.length} order{orders.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="font-mono gap-2"
          onClick={() => void ordersQuery.refetch()}
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="space-y-1">
          <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Channel
          </Label>
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="font-mono text-xs h-9 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="font-mono">All channels</SelectItem>
              {CHANNEL_VALUES.map((c) => (
                <SelectItem key={c} value={c} className="font-mono capitalize">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Status
          </Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="font-mono text-xs h-9 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="font-mono">All statuses</SelectItem>
              {STATUS_VALUES.map((s) => (
                <SelectItem key={s} value={s} className="font-mono capitalize">
                  {statusLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {ordersQuery.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : ordersQuery.isError ? (
        <div className="text-center py-12">
          <AlertTriangle className="h-6 w-6 text-destructive mx-auto mb-2" />
          <p className="text-destructive text-sm font-mono">
            {ordersQuery.error instanceof Error
              ? ordersQuery.error.message
              : "Failed to load orders"}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 font-mono"
            onClick={() => void ordersQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : orders.length === 0 ? (
        <Card className="border-border/30">
          <CardContent className="py-12 text-center text-muted-foreground font-mono text-sm">
            No orders in this category.
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/30 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border/30 hover:bg-transparent">
                <TableHead className="font-mono text-xs uppercase tracking-wider">Date</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider">Channel</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider">Status</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider">Customer</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-right">Total</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow
                  key={o.id}
                  className="border-border/20 cursor-pointer hover:bg-secondary/30"
                  onClick={() => setSelectedId(o.id)}
                >
                  <TableCell className="font-mono text-sm text-muted-foreground whitespace-nowrap">
                    {format(new Date(o.createdAt), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell><ChannelBadge channel={o.channel} /></TableCell>
                  <TableCell><OrderStatusBadge status={o.status} /></TableCell>
                  <TableCell className="text-sm">
                    <div className="font-medium">{o.shippingName}</div>
                    <div className="text-muted-foreground text-xs font-mono">{o.shippingEmail}</div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold">
                    {formatMoney(o.totalCents)}
                  </TableCell>
                  <TableCell>
                    <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {selectedId && (
        <OrderDetailDialog
          orderId={selectedId}
          adminKey={adminKey}
          onClose={() => setSelectedId(null)}
          onMutated={() => void ordersQuery.refetch()}
        />
      )}
    </div>
  );
}
