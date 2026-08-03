import { Link } from "wouter";
import {
  useGetAccount,
  useGetCurrentCustomer,
  type AccountStatus,
} from "@app/api-client-react";
import { useCustomerSession, bearerHeaders } from "@/hooks/useCustomerAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  CheckCircle2,
  Clock,
  XCircle,
  PauseCircle,
  AlertTriangle,
  PackageCheck,
  Building2,
} from "lucide-react";

function StatusBadge({ status }: { status: AccountStatus }) {
  switch (status) {
    case "approved":
      return (
        <Badge variant="verified" className="gap-1 font-mono uppercase tracking-wider">
          <CheckCircle2 className="h-3 w-3" /> Approved
        </Badge>
      );
    case "rejected":
      return (
        <Badge className="gap-1 font-mono uppercase tracking-wider border-transparent bg-destructive/15 text-destructive">
          <XCircle className="h-3 w-3" /> Rejected
        </Badge>
      );
    case "suspended":
      return (
        <Badge className="gap-1 font-mono uppercase tracking-wider border-transparent bg-amber-500/15 text-amber-600">
          <PauseCircle className="h-3 w-3" /> Suspended
        </Badge>
      );
    default:
      return (
        <Badge variant="gold" className="gap-1 font-mono uppercase tracking-wider">
          <Clock className="h-3 w-3" /> Pending
        </Badge>
      );
  }
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg bg-muted/50 border border-border px-3 py-2">
      <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm text-right truncate">{value}</span>
    </div>
  );
}

export function WholesaleAccountPage() {
  const customer = useCustomerSession();
  const bearer = { headers: bearerHeaders(customer?.token) };

  // The wholesale profile (any status) rides along on /auth/me once the account
  // is linked to this identity.
  const me = useGetCurrentCustomer({
    query: { enabled: !!customer?.token, queryKey: ["/api/auth/me", customer?.token] },
    request: bearer,
  });
  const wholesale = me.data?.wholesale ?? null;

  // Full detail (contact, tier object, KYB) — the session owns this account, so
  // the now session-gated GET /accounts/{id} serves it to the owner.
  const account = useGetAccount(wholesale?.accountId ?? "", {
    query: {
      enabled: !!wholesale?.accountId,
      retry: false,
      queryKey: ["/api/accounts", wholesale?.accountId ?? "", customer?.token ?? ""],
    },
    request: bearer,
  });

  return (
    <div className="min-h-screen bg-background">
      <section className="section-deep border-b border-border py-14">
        <div className="container mx-auto px-4 max-w-3xl text-center">
          <Badge variant="verified" className="mb-5 px-3 py-1 text-xs font-mono tracking-widest uppercase">
            Account Status
          </Badge>
          <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight mb-4">
            Your wholesale account
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Your application status and assigned pricing tier, tied to your signed-in account.
          </p>
        </div>
      </section>

      <div className="container mx-auto px-4 max-w-2xl py-12 space-y-6">
        {!customer ? (
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="font-display text-xl">Sign in to view your account</CardTitle>
              <CardDescription>
                Wholesale status is tied to your account — sign in to see it.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col sm:flex-row gap-3">
              <Button asChild className="font-mono uppercase tracking-widest">
                <Link href="/account/login">Sign in</Link>
              </Button>
              <Button asChild variant="outline" className="font-mono uppercase tracking-widest">
                <Link href="/account/register">Create an account</Link>
              </Button>
            </CardContent>
          </Card>
        ) : me.isLoading ? (
          <Card className="border-border">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Loading your account…
            </CardContent>
          </Card>
        ) : !wholesale ? (
          <Card className="border-border">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="font-display text-xl">No wholesale application yet</CardTitle>
                  <CardDescription>
                    Apply for a wholesale account to unlock tiered kit pricing.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button asChild className="font-mono uppercase tracking-widest">
                <Link href="/wholesale">Apply for wholesale</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="font-display text-xl">
                    {account.data?.businessName ?? wholesale.businessName}
                  </CardTitle>
                  {account.data?.contactName && (
                    <CardDescription>{account.data.contactName}</CardDescription>
                  )}
                </div>
                <StatusBadge status={wholesale.status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-2.5">
                {account.data?.email && <InfoRow label="Email" value={account.data.email} />}
                {account.data?.phone && <InfoRow label="Phone" value={account.data.phone} />}
                {account.data?.businessType && (
                  <InfoRow
                    label="Type"
                    value={<span className="capitalize">{account.data.businessType.replace(/_/g, " ")}</span>}
                  />
                )}
                <InfoRow
                  label="Price Tier"
                  value={
                    wholesale.priceTierName ? (
                      <Badge variant="gold" className="font-mono">{wholesale.priceTierName}</Badge>
                    ) : (
                      <span className="text-muted-foreground">Not yet assigned</span>
                    )
                  }
                />
              </div>

              {account.isError && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Couldn't load full account details. Your status above is current.</span>
                </div>
              )}

              {wholesale.status === "approved" ? (
                <div className="flex items-start gap-3 rounded-lg border border-[color-mix(in_srgb,var(--brand-teal)_35%,transparent)] bg-[color-mix(in_srgb,var(--brand-teal)_10%,transparent)] p-4">
                  <PackageCheck className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <p className="text-sm text-foreground">
                    You can place wholesale orders — <strong>5-kit minimum</strong>, and your tier
                    pricing applies automatically at checkout while you're signed in.
                  </p>
                </div>
              ) : wholesale.status === "pending" ? (
                <div className="flex items-start gap-3 rounded-lg border border-[color-mix(in_srgb,var(--brand-gold)_45%,transparent)] bg-[color-mix(in_srgb,var(--brand-gold)_10%,transparent)] p-4">
                  <Clock className="h-5 w-5 text-[color-mix(in_srgb,var(--brand-gold)_70%,var(--brand-ink))] mt-0.5 shrink-0" />
                  <p className="text-sm text-muted-foreground">
                    Your application is under review. We'll assign a pricing tier once your business is verified.
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Don't have an account yet?{" "}
          <Link href="/wholesale" className="text-primary hover:underline">
            Apply for wholesale
          </Link>
        </p>
      </div>
    </div>
  );
}
