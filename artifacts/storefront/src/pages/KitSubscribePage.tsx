import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Package, ArrowLeft, Beaker } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const STORAGE_KEY = "lab_subscription_tokens";

interface Plan {
  id: number;
  name: string;
  slug: string;
  description: string;
  intervalDays: number;
  productBundle: Array<{ productId?: number; name: string; qty: number }>;
  pricePerIntervalCents: number;
}

interface ShippingForm {
  name: string;
  email: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

const BLANK: ShippingForm = {
  name: "", email: "", address1: "", address2: "",
  city: "", state: "", zip: "", country: "US",
};

function intervalLabel(days: number) {
  if (days === 30) return "Monthly";
  if (days === 60) return "Every 60 Days";
  if (days === 90) return "Quarterly";
  return `Every ${days} Days`;
}

export function KitSubscribePage() {
  const [location] = useLocation();
  const planSlug = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  ).get("plan") ?? "";

  const [plan, setPlan] = useState<Plan | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [form, setForm] = useState<ShippingForm>(BLANK);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [subId, setSubId] = useState<number | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!planSlug) {
      setLoadingPlan(false);
      return;
    }
    fetch(`${BASE}/api/subscription-plans/${planSlug}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setPlan(data))
      .catch(() => {})
      .finally(() => setLoadingPlan(false));
  }, [planSlug]);

  function setField(key: keyof ShippingForm, val: string) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  const isValid =
    form.name.trim() &&
    form.email.trim().includes("@") &&
    form.address1.trim() &&
    form.city.trim() &&
    form.state.trim() &&
    form.zip.trim();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!plan || !isValid) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${BASE}/api/subscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerEmail: form.email.trim().toLowerCase(),
          customerName: form.name.trim(),
          planId: plan.id,
          intervalDays: plan.intervalDays,
          shippingAddress: {
            name: form.name.trim(),
            address1: form.address1.trim(),
            address2: form.address2.trim() || undefined,
            city: form.city.trim(),
            state: form.state.trim(),
            zip: form.zip.trim(),
            country: form.country,
          },
          notes: `Kit subscription: ${plan.name}`,
        }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { message?: string };
        throw new Error(err.message ?? "Subscription creation failed");
      }

      const sub = (await res.json()) as { id: number; accessToken: string };
      setSubId(sub.id);

      try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as Array<{
          id: number;
          accessToken: string;
        }>;
        const merged = [
          ...stored.filter((s) => s.id !== sub.id),
          { id: sub.id, accessToken: sub.accessToken },
        ];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      } catch {
      }

      setDone(true);
    } catch (err: unknown) {
      toast({
        title: "Subscription failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingPlan) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <Skeleton className="h-64 rounded-2xl bg-secondary" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-2xl text-center">
        <p className="text-muted-foreground mb-4">Subscription plan not found.</p>
        <Link href="/kits">
          <Button variant="outline">Back to Research Kits</Button>
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <Card className="border border-border bg-card/60 rounded-2xl overflow-hidden">
          <div className="h-2 bg-gradient-to-r from-primary/80 to-primary/30" />
          <CardContent className="pt-10 pb-10 text-center">
            <div className="flex justify-center mb-5">
              <div className="p-4 rounded-full bg-primary/10">
                <CheckCircle2 className="h-10 w-10 text-primary" />
              </div>
            </div>
            <h2 className="text-2xl font-bold mb-2">Subscription Confirmed!</h2>
            <p className="text-muted-foreground mb-2">
              Your <span className="font-semibold text-foreground">{plan.name}</span> subscription
              ({intervalLabel(plan.intervalDays)}) is now active.
            </p>
            <p className="text-muted-foreground text-sm mb-8">
              A confirmation email has been sent to{" "}
              <span className="font-mono text-foreground">{form.email}</span>.
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Link href={`/account/subscriptions?email=${encodeURIComponent(form.email)}`}>
                <Button className="font-mono uppercase tracking-wide">
                  <Package className="h-4 w-4 mr-2" />
                  Manage Subscriptions
                </Button>
              </Link>
              <Link href="/shop">
                <Button variant="outline" className="font-mono uppercase tracking-wide">
                  Continue Shopping
                </Button>
              </Link>
            </div>
            {subId && (
              <p className="text-xs font-mono text-muted-foreground mt-6">
                Subscription #{subId}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const price = (plan.pricePerIntervalCents / 100).toFixed(2);

  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <div className="mb-8">
        <Link href="/kits">
          <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground mb-4">
            <ArrowLeft className="h-4 w-4" /> Back to Kits
          </Button>
        </Link>
        <div className="flex items-center gap-2 mb-2">
          <Beaker className="h-5 w-5 text-primary" />
          <span className="font-mono text-sm text-primary uppercase tracking-widest">
            Subscribe
          </span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{plan.name}</h1>
        <p className="text-muted-foreground text-sm mt-1">{plan.description}</p>
      </div>

      <div className="grid md:grid-cols-[1fr_320px] gap-8">
        <form onSubmit={handleSubmit} className="space-y-5">
          <Card className="border border-border bg-card/60 rounded-2xl">
            <CardHeader className="pb-0 pt-5">
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Shipping Information
              </p>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs font-mono uppercase text-muted-foreground mb-1.5 block">
                    Full Name
                  </Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setField("name", e.target.value)}
                    placeholder="Dr. Jane Smith"
                    required
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs font-mono uppercase text-muted-foreground mb-1.5 block">
                    Email Address
                  </Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setField("email", e.target.value)}
                    placeholder="researcher@lab.com"
                    required
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs font-mono uppercase text-muted-foreground mb-1.5 block">
                    Address Line 1
                  </Label>
                  <Input
                    value={form.address1}
                    onChange={(e) => setField("address1", e.target.value)}
                    placeholder="123 Research Blvd"
                    required
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs font-mono uppercase text-muted-foreground mb-1.5 block">
                    Address Line 2 (Optional)
                  </Label>
                  <Input
                    value={form.address2}
                    onChange={(e) => setField("address2", e.target.value)}
                    placeholder="Apt, Suite, Lab #"
                  />
                </div>
                <div>
                  <Label className="text-xs font-mono uppercase text-muted-foreground mb-1.5 block">
                    City
                  </Label>
                  <Input
                    value={form.city}
                    onChange={(e) => setField("city", e.target.value)}
                    placeholder="Boston"
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs font-mono uppercase text-muted-foreground mb-1.5 block">
                    State
                  </Label>
                  <Input
                    value={form.state}
                    onChange={(e) => setField("state", e.target.value)}
                    placeholder="MA"
                    maxLength={2}
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs font-mono uppercase text-muted-foreground mb-1.5 block">
                    ZIP Code
                  </Label>
                  <Input
                    value={form.zip}
                    onChange={(e) => setField("zip", e.target.value)}
                    placeholder="02101"
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs font-mono uppercase text-muted-foreground mb-1.5 block">
                    Country
                  </Label>
                  <Input
                    value={form.country}
                    onChange={(e) => setField("country", e.target.value)}
                    placeholder="US"
                    maxLength={2}
                    required
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Button
            type="submit"
            className="w-full font-mono uppercase tracking-wide h-12 text-base"
            disabled={!isValid || submitting}
          >
            {submitting ? "Processing..." : `Activate Subscription — $${price}/${intervalLabel(plan.intervalDays).toLowerCase()}`}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Skip or cancel any time from your account dashboard.
          </p>
        </form>

        <div className="space-y-4">
          <Card className="border border-border bg-card/60 rounded-2xl overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-primary/60 to-primary/20" />
            <CardContent className="pt-5 pb-5">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
                Kit Includes
              </p>
              <ul className="space-y-2">
                {plan.productBundle.map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>
                      {item.qty > 1 && (
                        <span className="text-primary font-semibold mr-1">{item.qty}×</span>
                      )}
                      {item.name}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-5 pt-4 border-t border-border">
                <div className="flex items-end justify-between">
                  <span className="text-muted-foreground text-sm">Per shipment</span>
                  <div className="text-right">
                    <span className="font-mono font-bold text-xl">${price}</span>
                    <span className="text-muted-foreground text-xs ml-1">
                      / {intervalLabel(plan.intervalDays).toLowerCase()}
                    </span>
                  </div>
                </div>
                <Badge className="mt-3 bg-teal-500/10 text-teal-400 border-teal-500/20 text-[10px] font-mono w-full justify-center py-1">
                  All batches Tri-Verified — HPLC · LAL · Sterility
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
