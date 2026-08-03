import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Package,
  RefreshCw,
  XCircle,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Info,
  Lock,
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const STORAGE_KEY = "lab_subscription_tokens";

interface StoredToken {
  id: number;
  accessToken: string;
}

function readStoredTokens(): StoredToken[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function getStoredToken(id: number): string | undefined {
  return readStoredTokens().find((t) => t.id === id)?.accessToken;
}

interface Subscription {
  id: number;
  customerName: string;
  status: "active" | "paused" | "cancelled";
  intervalDays: number;
  nextBillingDate: string;
  createdAt: string;
  planId: number;
  planName: string;
  planSlug: string;
  planDescription: string;
  planBundle: Array<{ productId?: number; name: string; qty: number }>;
  planPriceCents: number;
  hasToken?: boolean;
}

function intervalLabel(days: number) {
  if (days === 30) return "Monthly";
  if (days === 60) return "Every 60 Days";
  if (days === 90) return "Quarterly";
  return `Every ${days} Days`;
}

function statusBadge(status: string) {
  if (status === "active")
    return (
      <Badge className="bg-teal-500/15 text-teal-400 border-teal-500/30 font-mono text-[11px]">
        Active
      </Badge>
    );
  if (status === "paused")
    return (
      <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 font-mono text-[11px]">
        Paused
      </Badge>
    );
  return (
    <Badge className="bg-red-500/15 text-red-400 border-red-500/30 font-mono text-[11px]">
      Cancelled
    </Badge>
  );
}

export function CustomerSubscriptionsPage() {
  const searchParams = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  );
  const emailFromQuery = searchParams.get("email") ?? "";
  const mgmtTokenFromQuery = searchParams.get("mgmt_token") ?? "";

  const [email, setEmail] = useState(emailFromQuery);
  const [lookupEmail, setLookupEmail] = useState(emailFromQuery);
  const [mgmtToken, setMgmtToken] = useState(mgmtTokenFromQuery);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(!!(emailFromQuery || mgmtTokenFromQuery));
  const [error, setError] = useState("");
  const [actioningId, setActioningId] = useState<number | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<number | null>(null);
  const [confirmSkip, setConfirmSkip] = useState<number | null>(null);
  const [linkSent, setLinkSent] = useState(false);
  const [linkSending, setLinkSending] = useState(false);
  const { toast } = useToast();

  const fetchSubsByToken = useCallback(async (token: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `${BASE}/api/subscriptions?mgmt_token=${encodeURIComponent(token)}`
      );
      if (!res.ok) {
        const body = (await res.json()) as { message?: string };
        throw new Error(body.message ?? "Access link invalid or expired");
      }
      const data = (await res.json()) as Subscription[];
      const storedTokens = readStoredTokens();
      const enriched = data.map((s) => ({
        ...s,
        hasToken: storedTokens.some((t) => t.id === s.id),
      }));
      setSubs(enriched);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load subscriptions.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSubsByEmail = useCallback(async (e: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `${BASE}/api/subscriptions?email=${encodeURIComponent(e.trim().toLowerCase())}`
      );
      if (!res.ok) throw new Error("lookup failed");
      const data = (await res.json()) as Subscription[];
      const storedTokens = readStoredTokens();
      const enriched = data.map((s) => ({
        ...s,
        hasToken: storedTokens.some((t) => t.id === s.id),
      }));
      setSubs(enriched);
    } catch {
      setError("Failed to load subscriptions. Please check your email address.");
    } finally {
      setLoading(false);
    }
  }, []);

  async function handleRequestMagicLink() {
    if (!email.trim()) return;
    setLinkSending(true);
    try {
      const res = await fetch(`${BASE}/api/subscriptions/request-management-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const body = (await res.json()) as { ok?: boolean; _devUrl?: string };
      if (body._devUrl) {
        console.info("[dev] Management link:", body._devUrl);
      }
      setLinkSent(true);
    } catch {
      toast({
        title: "Could not send link",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setLinkSending(false);
    }
  }

  useEffect(() => {
    if (mgmtToken) {
      fetchSubsByToken(mgmtToken);
    } else if (lookupEmail) {
      fetchSubsByEmail(lookupEmail);
    }
  }, [mgmtToken, lookupEmail, fetchSubsByToken, fetchSubsByEmail]);

  async function handleSkip(id: number) {
    setActioningId(id);
    const storedToken = getStoredToken(id);
    try {
      const body: Record<string, string> = {};
      if (storedToken) {
        body.token = storedToken;
      } else if (mgmtToken) {
        body.mgmt_token = mgmtToken;
      } else {
        throw new Error(
          "To manage this subscription, request a management link from the email field below."
        );
      }
      const res = await fetch(`${BASE}/api/subscriptions/${id}/skip`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = (await res.json()) as { message?: string };
        throw new Error(d.message ?? "Skip failed");
      }
      const updated = (await res.json()) as { nextBillingDate: string };
      setSubs((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, nextBillingDate: updated.nextBillingDate } : s
        )
      );
      toast({
        title: "Shipment skipped",
        description: "Your next shipment has been deferred by one interval.",
      });
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setActioningId(null);
      setConfirmSkip(null);
    }
  }

  async function handleCancel(id: number) {
    setActioningId(id);
    const storedToken = getStoredToken(id);
    try {
      const params = new URLSearchParams();
      if (storedToken) {
        params.set("token", storedToken);
      } else if (mgmtToken) {
        params.set("mgmt_token", mgmtToken);
      } else {
        throw new Error(
          "To manage this subscription, request a management link from the email field below."
        );
      }
      const res = await fetch(
        `${BASE}/api/subscriptions/${id}?${params.toString()}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const d = (await res.json()) as { message?: string };
        throw new Error(d.message ?? "Cancel failed");
      }
      setSubs((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: "cancelled" } : s))
      );
      toast({
        title: "Subscription cancelled",
        description: "No further shipments will be sent.",
      });
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setActioningId(null);
      setConfirmCancel(null);
    }
  }

  const activeSubs = subs.filter((s) => s.status === "active");
  const otherSubs = subs.filter((s) => s.status !== "active");

  return (
    <div className="min-h-screen container mx-auto px-4 py-12 max-w-3xl">
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-3">
          <Package className="h-5 w-5 text-primary" />
          <span className="font-mono text-sm text-primary uppercase tracking-widest">
            Account
          </span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">My Subscriptions</h1>
        <p className="text-muted-foreground text-sm">
          Manage your research kit subscriptions — skip shipments or cancel any time.
        </p>
      </div>

      {!mgmtToken && !lookupEmail ? (
        <Card className="border border-border bg-card/60 rounded-2xl">
          <CardContent className="pt-6 pb-6">
            {linkSent ? (
              <div className="text-center py-4">
                <CheckCircle2 className="h-10 w-10 text-primary mx-auto mb-4" />
                <h3 className="font-semibold text-lg mb-2">Check Your Email</h3>
                <p className="text-muted-foreground text-sm">
                  We sent a secure management link to{" "}
                  <span className="font-mono text-foreground">{email}</span>. The link
                  expires in 15 minutes.
                </p>
                <p className="text-muted-foreground text-xs mt-3">
                  During development, the link is also logged to the browser console.
                </p>
                <Button
                  variant="ghost"
                  className="mt-5 text-sm"
                  onClick={() => setLinkSent(false)}
                >
                  Use a different email
                </Button>
              </div>
            ) : (
              <>
                <p className="text-muted-foreground text-sm mb-1">
                  Enter your email address and we'll send you a secure management link.
                </p>
                <p className="text-muted-foreground text-xs mb-5 flex items-center gap-1">
                  <Info className="h-3 w-3 shrink-0" />
                  Expires in 15 minutes. Check your inbox after requesting.
                </p>
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs font-mono uppercase text-muted-foreground mb-2 block">
                      Email Address
                    </Label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="researcher@lab.com"
                      className="font-mono"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && email) handleRequestMagicLink();
                      }}
                    />
                  </div>
                  <Button
                    className="w-full font-mono uppercase tracking-wide"
                    disabled={!email || linkSending}
                    onClick={handleRequestMagicLink}
                  >
                    {linkSending ? "Sending..." : "Send Management Link"}
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between mb-6">
            <p className="text-sm text-muted-foreground font-mono">
              {mgmtToken
                ? "Verified access via management link"
                : <>Subscriptions for <span className="text-foreground">{lookupEmail}</span></>
              }
            </p>
            {!mgmtToken && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => {
                  setLookupEmail("");
                  setEmail("");
                  setSubs([]);
                }}
              >
                Change Email
              </Button>
            )}
          </div>

          {loading && (
            <div className="space-y-4">
              {[1, 2].map((n) => (
                <Skeleton key={n} className="h-48 rounded-2xl bg-secondary" />
              ))}
            </div>
          )}

          {error && (
            <p className="text-destructive text-sm text-center py-8">{error}</p>
          )}

          {!loading && !error && subs.length === 0 && (
            <div className="text-center py-16 border border-dashed border-border rounded-2xl">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">
                No subscriptions found for this email.
              </p>
              <Link href="/kits">
                <Button variant="outline" className="font-mono uppercase tracking-wide">
                  Browse Research Kits
                </Button>
              </Link>
            </div>
          )}

          {!loading && !error && subs.length > 0 && (
            <div className="space-y-6">
              {activeSubs.length > 0 && (
                <div>
                  <h2 className="text-sm font-mono uppercase tracking-widest text-muted-foreground mb-4">
                    Active Subscriptions
                  </h2>
                  <div className="space-y-4">
                    {activeSubs.map((sub) => (
                      <SubscriptionCard
                        key={sub.id}
                        sub={sub}
                        actioningId={actioningId}
                        canManageViaLink={!!mgmtToken}
                        onSkip={() => setConfirmSkip(sub.id)}
                        onCancel={() => setConfirmCancel(sub.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {otherSubs.length > 0 && (
                <div>
                  <Separator className="mb-6" />
                  <h2 className="text-sm font-mono uppercase tracking-widest text-muted-foreground mb-4">
                    Past Subscriptions
                  </h2>
                  <div className="space-y-4">
                    {otherSubs.map((sub) => (
                      <SubscriptionCard
                        key={sub.id}
                        sub={sub}
                        actioningId={actioningId}
                        canManageViaLink={!!mgmtToken}
                        onSkip={() => setConfirmSkip(sub.id)}
                        onCancel={() => setConfirmCancel(sub.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <AlertDialog
        open={confirmSkip !== null}
        onOpenChange={(open) => !open && setConfirmSkip(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Skip Next Shipment?</AlertDialogTitle>
            <AlertDialogDescription>
              Your next shipment will be deferred by one interval period. You can skip
              again later from your dashboard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Shipment</AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary"
              onClick={() => confirmSkip !== null && handleSkip(confirmSkip)}
            >
              Skip Shipment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmCancel !== null}
        onOpenChange={(open) => !open && setConfirmCancel(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently cancel your subscription. No further shipments will
              be made. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmCancel !== null && handleCancel(confirmCancel)}
            >
              Cancel Subscription
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SubscriptionCard({
  sub,
  actioningId,
  canManageViaLink,
  onSkip,
  onCancel,
}: {
  sub: Subscription;
  actioningId: number | null;
  canManageViaLink: boolean;
  onSkip: () => void;
  onCancel: () => void;
}) {
  const nextDate = new Date(sub.nextBillingDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const price = (sub.planPriceCents / 100).toFixed(2);
  const isActioning = actioningId === sub.id;
  const canManage = !!sub.hasToken || canManageViaLink;

  return (
    <Card className="border border-border bg-card/60 rounded-2xl overflow-hidden">
      <div className="h-1 bg-gradient-to-r from-primary/60 to-primary/20" />
      <CardHeader className="pb-3 pt-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {statusBadge(sub.status)}
              <span className="text-[11px] font-mono text-muted-foreground">#{sub.id}</span>
            </div>
            <h3 className="font-semibold text-base">{sub.planName}</h3>
            <p className="text-muted-foreground text-xs mt-0.5">
              {intervalLabel(sub.intervalDays)} · ${price}/interval
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 pb-5 space-y-4">
        {sub.status === "active" && (
          <div className="flex items-center gap-2 text-sm bg-secondary/40 rounded-lg px-3 py-2">
            <Calendar className="h-4 w-4 text-primary shrink-0" />
            <span className="text-muted-foreground text-xs">Next shipment:</span>
            <span className="font-mono font-semibold text-xs">{nextDate}</span>
          </div>
        )}

        <div className="space-y-1.5">
          {sub.planBundle.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />
              <span>
                {item.qty > 1 && (
                  <span className="text-primary font-semibold mr-1">{item.qty}×</span>
                )}
                {item.name}
              </span>
            </div>
          ))}
        </div>

        {sub.status === "active" && (
          <>
            {canManage ? (
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs font-mono border-border"
                  disabled={isActioning}
                  onClick={onSkip}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  Skip Next
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs font-mono border-destructive/40 text-destructive hover:bg-destructive/10"
                  disabled={isActioning}
                  onClick={onCancel}
                >
                  <XCircle className="h-3.5 w-3.5 mr-1" />
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-secondary/30 rounded-lg px-3 py-2.5 mt-1">
                <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  To skip or cancel from this device, request a management link
                  and we'll email it to you — it verifies you without the browser
                  you originally checked out from.
                </span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
