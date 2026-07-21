import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  FlaskConical,
  Package,
  RefreshCw,
  CheckCircle2,
  ChevronRight,
  Clock,
  Beaker,
} from "lucide-react";

interface BundleItem {
  productId?: number;
  name: string;
  qty: number;
}

interface Plan {
  id: number;
  name: string;
  slug: string;
  description: string;
  intervalDays: number;
  productBundle: BundleItem[];
  pricePerIntervalCents: number;
  featured: number;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function intervalLabel(days: number) {
  if (days === 30) return "Monthly";
  if (days === 60) return "Every 60 Days";
  if (days === 90) return "Quarterly";
  return `Every ${days} Days`;
}

function intervalBadgeColor(days: number) {
  if (days === 30) return "bg-teal-500/15 text-teal-400 border-teal-500/30";
  if (days === 60) return "bg-blue-500/15 text-blue-400 border-blue-500/30";
  return "bg-violet-500/15 text-violet-400 border-violet-500/30";
}

export function ResearchKitsPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${BASE}/api/subscription-plans`)
      .then((r) => r.json())
      .then((data: Plan[]) => {
        setPlans(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load research kits.");
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-12 md:py-20">
        {/* Hero */}
        <div className="max-w-3xl mx-auto text-center mb-16">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Package className="h-6 w-6 text-primary" />
            <span className="font-mono text-sm text-primary uppercase tracking-widest">
              Research Kits
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Subscribe & Save on Complete Research Protocols
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed">
            Pre-bundled research kits ship on your schedule — 30, 60, or 90 day intervals.
            Every kit includes everything you need: verified peptide, bacteriostatic water,
            syringes, and swabs. Skip or cancel any time.
          </p>
        </div>

        {/* Value Props */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16 max-w-4xl mx-auto">
          {[
            {
              icon: RefreshCw,
              title: "Auto-Replenishment",
              desc: "Never run short mid-protocol. Kits ship automatically on your research schedule.",
            },
            {
              icon: CheckCircle2,
              title: "All-In-One Bundle",
              desc: "Tri-verified peptide plus all ancillaries: water, syringes, and swabs included.",
            },
            {
              icon: Clock,
              title: "Flexible Intervals",
              desc: "Choose 30, 60, or 90 day cadence. Skip or cancel any time from your dashboard.",
            },
          ].map((v) => (
            <div
              key={v.title}
              className="flex flex-col items-center text-center p-6 rounded-xl border border-border bg-card/40"
            >
              <v.icon className="h-8 w-8 text-primary mb-3" />
              <h3 className="font-semibold mb-2">{v.title}</h3>
              <p className="text-muted-foreground text-sm">{v.desc}</p>
            </div>
          ))}
        </div>

        <Separator className="mb-16" />

        {/* Kit Cards */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-96 rounded-2xl bg-secondary" />
            ))}
          </div>
        )}

        {error && (
          <p className="text-center text-destructive">{error}</p>
        )}

        {!loading && !error && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {plans.map((plan) => (
              <KitCard key={plan.id} plan={plan} />
            ))}
          </div>
        )}

        <Separator className="my-16" />

        {/* FAQ / How it works */}
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold mb-8 text-center">How Subscriptions Work</h2>
          <div className="space-y-6">
            {[
              {
                q: "When am I billed?",
                a: "Your first kit ships and is billed at the time you subscribe. Subsequent kits are billed automatically at your chosen interval (30/60/90 days).",
              },
              {
                q: "Can I skip a shipment?",
                a: "Yes. From your subscription dashboard, click Skip Next to defer your next shipment by one interval period.",
              },
              {
                q: "How do I cancel?",
                a: "Cancel any time from your dashboard at /account/subscriptions. No penalties, no lock-in.",
              },
              {
                q: "Are kit peptides tri-verified?",
                a: "Yes. Every peptide included in a research kit undergoes the full Lab Standard tri-verification — HPLC purity, endotoxin (LAL), and sterility. COAs are batch-linked in the lab portal.",
              },
            ].map((faq) => (
              <div key={faq.q} className="border border-border rounded-lg p-5">
                <h3 className="font-semibold mb-2 text-sm">{faq.q}</h3>
                <p className="text-muted-foreground text-sm">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function KitCard({ plan }: { plan: Plan }) {
  const price = (plan.pricePerIntervalCents / 100).toFixed(2);
  const [, navigate] = useLocation();

  function handleSubscribeNow() {
    navigate(`/kits/subscribe?plan=${encodeURIComponent(plan.slug)}`);
  }

  return (
    <Card className="flex flex-col rounded-2xl border border-border bg-card/60 hover:border-primary/40 transition-all duration-200 hover:shadow-lg hover:shadow-primary/5 overflow-hidden">
      <div className="h-2 bg-gradient-to-r from-primary/80 to-primary/30" />
      <CardHeader className="pb-4 pt-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Beaker className="h-5 w-5 text-primary" />
            </div>
            {plan.featured > 0 && (
              <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] font-mono uppercase">
                Popular
              </Badge>
            )}
          </div>
          <span
            className={`text-[11px] font-mono font-semibold px-2.5 py-1 rounded-full border ${intervalBadgeColor(plan.intervalDays)}`}
          >
            {intervalLabel(plan.intervalDays)}
          </span>
        </div>
        <h3 className="text-lg font-bold leading-tight">{plan.name}</h3>
        <p className="text-muted-foreground text-sm leading-relaxed line-clamp-3 mt-1">
          {plan.description}
        </p>
      </CardHeader>

      <CardContent className="flex flex-col flex-1 gap-5">
        {/* Bundle Contents */}
        <div className="bg-secondary/40 rounded-lg p-4">
          <p className="text-[11px] font-mono uppercase text-muted-foreground mb-3 tracking-widest">
            Kit Includes
          </p>
          <ul className="space-y-2">
            {(plan.productBundle as BundleItem[]).map((item, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                <span>
                  {item.qty > 1 && (
                    <span className="text-primary font-semibold mr-1">
                      {item.qty}×
                    </span>
                  )}
                  {item.name}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Pricing */}
        <div className="mt-auto">
          <div className="flex items-end justify-between mb-4">
            <div>
              <span className="text-3xl font-bold font-mono">${price}</span>
              <span className="text-muted-foreground text-sm ml-1">
                / {intervalLabel(plan.intervalDays).toLowerCase()}
              </span>
            </div>
          </div>

          <Button
            className="w-full gap-2 font-mono uppercase tracking-wide"
            onClick={handleSubscribeNow}
          >
            Subscribe Now
            <ChevronRight className="h-4 w-4" />
          </Button>
          <p className="text-center text-muted-foreground text-xs mt-2">
            Skip or cancel any time
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
