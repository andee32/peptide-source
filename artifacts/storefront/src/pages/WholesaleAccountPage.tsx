import { useState } from "react";
import { Link } from "wouter";
import { useGetAccount, getGetAccountQueryKey, type AccountStatus } from "@atlab/api-client-react";
import { useWholesaleSession } from "@/hooks/useWholesaleSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  KeyRound,
  CheckCircle2,
  Clock,
  XCircle,
  PauseCircle,
  AlertTriangle,
  PackageCheck,
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
  const [idInput, setIdInput] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [query, setQuery] = useState<{ id: string; token: string } | null>(null);
  const { session, set: setSession, clear: clearSession } = useWholesaleSession();

  const account = useGetAccount(
    query?.id ?? "",
    { token: query?.token },
    {
      query: {
        enabled: !!query,
        retry: false,
        queryKey: getGetAccountQueryKey(query?.id ?? "", { token: query?.token }),
      },
    },
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!idInput.trim() || !tokenInput.trim()) return;
    setQuery({ id: idInput.trim(), token: tokenInput.trim() });
  };

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
            Enter your account ID and access token to check your application status and assigned pricing tier.
          </p>
        </div>
      </section>

      <div className="container mx-auto px-4 max-w-2xl py-12 space-y-6">
        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                <KeyRound className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="font-display text-xl">Look up account</CardTitle>
                <CardDescription>Credentials were shown when you applied.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="accountId" className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Account ID
                </Label>
                <Input
                  id="accountId"
                  value={idInput}
                  onChange={(e) => setIdInput(e.target.value)}
                  placeholder="acct_…"
                  className="mt-1.5 font-mono"
                  required
                />
              </div>
              <div>
                <Label htmlFor="accessToken" className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Access Token
                </Label>
                <Input
                  id="accessToken"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Your one-time access token"
                  className="mt-1.5 font-mono"
                  required
                />
              </div>
              <Button
                type="submit"
                className="w-full font-mono uppercase tracking-widest h-11"
                disabled={!idInput.trim() || !tokenInput.trim() || account.isFetching}
              >
                {account.isFetching ? "Checking…" : "Check Status"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {account.isError && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              {account.error instanceof Error
                ? account.error.message
                : "Could not find that account. Check your ID and token."}
            </span>
          </div>
        )}

        {account.isSuccess && account.data && (
          <Card className="border-border">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="font-display text-xl">{account.data.businessName}</CardTitle>
                  <CardDescription>{account.data.contactName}</CardDescription>
                </div>
                <StatusBadge status={account.data.status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-2.5">
                <InfoRow label="Account ID" value={<code className="font-mono">{account.data.id}</code>} />
                <InfoRow label="Email" value={account.data.email} />
                {account.data.phone && <InfoRow label="Phone" value={account.data.phone} />}
                {account.data.businessType && (
                  <InfoRow
                    label="Type"
                    value={<span className="capitalize">{account.data.businessType.replace(/_/g, " ")}</span>}
                  />
                )}
                <InfoRow
                  label="Price Tier"
                  value={
                    account.data.priceTier ? (
                      <Badge variant="gold" className="font-mono">{account.data.priceTier.name}</Badge>
                    ) : (
                      <span className="text-muted-foreground">Not yet assigned</span>
                    )
                  }
                />
              </div>

              {account.data.status === "approved" ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 rounded-lg border border-[color-mix(in_srgb,var(--atl-teal)_35%,transparent)] bg-[color-mix(in_srgb,var(--atl-teal)_10%,transparent)] p-4">
                    <PackageCheck className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                    <p className="text-sm text-foreground">
                      You can now place wholesale orders — <strong>5-kit minimum</strong>, and your tier
                      pricing applies automatically at checkout.
                    </p>
                  </div>
                  {session?.accountId === account.data.id ? (
                    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/50 px-4 py-3">
                      <span className="text-sm text-muted-foreground">
                        <CheckCircle2 className="inline h-4 w-4 text-primary mr-1.5 -mt-0.5" />
                        Signed in for wholesale ordering.
                      </span>
                      <Button variant="outline" size="sm" className="font-mono uppercase tracking-wider" onClick={clearSession}>
                        Sign out
                      </Button>
                    </div>
                  ) : (
                    <Button
                      className="w-full font-mono uppercase tracking-widest h-11"
                      onClick={() =>
                        setSession({
                          accountId: account.data!.id,
                          token: query!.token,
                          businessName: account.data!.businessName,
                          priceTierName: account.data!.priceTier?.name ?? null,
                        })
                      }
                    >
                      Use this account for ordering
                    </Button>
                  )}
                </div>
              ) : account.data.status === "pending" ? (
                <div className="flex items-start gap-3 rounded-lg border border-[color-mix(in_srgb,var(--atl-gold)_45%,transparent)] bg-[color-mix(in_srgb,var(--atl-gold)_10%,transparent)] p-4">
                  <Clock className="h-5 w-5 text-[color-mix(in_srgb,var(--atl-gold)_70%,#0e1117)] mt-0.5 shrink-0" />
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
