import { useState } from "react";
import { Link } from "wouter";
import {
  useApplyForAccount,
  ApplyAccountRequestBusinessType,
  type AccountCreated,
} from "@app/api-client-react";
import { useCustomerSession, bearerHeaders } from "@/hooks/useCustomerAuth";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Building2,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";

type BusinessType = keyof typeof ApplyAccountRequestBusinessType;

const BUSINESS_TYPES: { value: BusinessType; label: string }[] = [
  { value: "research_lab", label: "Research Lab" },
  { value: "clinic", label: "Clinic" },
  { value: "reseller", label: "Reseller" },
  { value: "distributor", label: "Distributor" },
  { value: "other", label: "Other" },
];

function SuccessCard({ account }: { account: AccountCreated }) {
  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[color-mix(in_srgb,var(--brand-teal)_12%,transparent)] flex items-center justify-center border border-[color-mix(in_srgb,var(--brand-teal)_35%,transparent)]">
            <CheckCircle2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="font-display text-xl">Application received</CardTitle>
            <CardDescription>
              Our team will review your business and assign wholesale pricing.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Your application is linked to your account. Once approved, wholesale
          pricing and the kit catalog unlock automatically whenever you're signed
          in — there's no token to save.
        </p>
        <div className="grid grid-cols-1 gap-3 text-sm">
          <div className="flex items-center justify-between rounded-lg bg-muted/50 border border-border px-3 py-2">
            <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Status</span>
            <Badge variant="gold" className="font-mono uppercase tracking-wider">{account.status}</Badge>
          </div>
        </div>

        <Button asChild className="w-full font-mono uppercase tracking-widest gap-2">
          <Link href="/wholesale/account">
            Check application status <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function WholesaleApplyPage() {
  const [form, setForm] = useState({
    businessName: "",
    contactName: "",
    email: "",
    phone: "",
    businessType: "" as BusinessType | "",
    taxId: "",
    resaleCertUrl: "",
  });

  const customer = useCustomerSession();
  const apply = useApplyForAccount({
    request: { headers: bearerHeaders(customer?.token) },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.businessType) return;
    apply.mutate({
      data: {
        businessName: form.businessName.trim(),
        contactName: form.contactName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        businessType: form.businessType,
        taxId: form.taxId.trim() || null,
        resaleCertUrl: form.resaleCertUrl.trim() || null,
      },
    });
  };

  const canSubmit =
    form.businessName.trim() &&
    form.contactName.trim() &&
    form.email.trim() &&
    form.phone.trim() &&
    form.businessType &&
    !apply.isPending;

  return (
    <div className="min-h-screen bg-background">
      {/* Header band — navy structure */}
      <section className="section-deep border-b border-border py-14">
        <div className="container mx-auto px-4 max-w-3xl text-center">
          <Badge variant="verified" className="mb-5 px-3 py-1 text-xs font-mono tracking-widest uppercase">
            Wholesale Program
          </Badge>
          <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight mb-4">
            Apply for a wholesale account
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Labs, clinics, resellers, and distributors get tiered pricing on 10-vial kits
            with a 5-kit minimum. Tell us about your business and we'll review your application.
          </p>
        </div>
      </section>

      <div className="container mx-auto px-4 max-w-2xl py-12">
        {!customer ? (
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="font-display text-xl">Sign in to apply</CardTitle>
              <CardDescription>
                Wholesale applications are tied to your account, so approval
                unlocks pricing automatically when you're signed in.
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
        ) : apply.isSuccess && apply.data ? (
          <SuccessCard account={apply.data} />
        ) : (
          <Card className="border-border">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="font-display text-xl">Business details</CardTitle>
                  <CardDescription>All fields marked required unless noted.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <Label htmlFor="businessName" className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    Business Name
                  </Label>
                  <Input
                    id="businessName"
                    value={form.businessName}
                    onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))}
                    placeholder="Acme Research Labs"
                    className="mt-1.5"
                    maxLength={200}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="contactName" className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                      Contact Name
                    </Label>
                    <Input
                      id="contactName"
                      value={form.contactName}
                      onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
                      placeholder="Jane Doe"
                      className="mt-1.5"
                      maxLength={200}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="businessType" className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                      Business Type
                    </Label>
                    <Select
                      value={form.businessType}
                      onValueChange={(v) => setForm((f) => ({ ...f, businessType: v as BusinessType }))}
                    >
                      <SelectTrigger id="businessType" className="mt-1.5">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {BUSINESS_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="email" className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="orders@acmelabs.com"
                      className="mt-1.5"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone" className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                      Phone
                    </Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                      placeholder="+1 555 123 4567"
                      className="mt-1.5"
                      maxLength={50}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="taxId" className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                      Tax ID <span className="normal-case tracking-normal">(optional)</span>
                    </Label>
                    <Input
                      id="taxId"
                      value={form.taxId}
                      onChange={(e) => setForm((f) => ({ ...f, taxId: e.target.value }))}
                      placeholder="EIN / VAT"
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="resaleCertUrl" className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                      Resale Cert URL <span className="normal-case tracking-normal">(optional)</span>
                    </Label>
                    <Input
                      id="resaleCertUrl"
                      type="url"
                      value={form.resaleCertUrl}
                      onChange={(e) => setForm((f) => ({ ...f, resaleCertUrl: e.target.value }))}
                      placeholder="https://…"
                      className="mt-1.5"
                    />
                  </div>
                </div>

                {apply.isError && (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                      {apply.error instanceof Error ? apply.error.message : "Something went wrong. Please try again."}
                    </span>
                  </div>
                )}

                <Button type="submit" className="w-full font-mono uppercase tracking-widest h-12" disabled={!canSubmit}>
                  {apply.isPending ? "Submitting…" : "Submit Application"}
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  Already applied?{" "}
                  <Link href="/wholesale/account" className="text-primary hover:underline">
                    Check your account status
                  </Link>
                </p>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
