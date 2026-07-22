import { Link } from "wouter";
import { Building2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * Shown in place of the wholesale kit catalog when no approved wholesale
 * session is present. Kit pricing is the wholesale price book — industry norm
 * is account-gated (see docs/discount-system-design.md + Phase 1 tier model).
 */
export function WholesaleGate() {
  return (
    <div className="container mx-auto px-4 py-24 min-h-[60vh] flex flex-col items-center justify-center text-center">
      <div className="h-14 w-14 rounded-xl bg-primary/10 border border-primary/25 text-teal-ink flex items-center justify-center mb-6">
        <Lock className="h-7 w-7" />
      </div>
      <Badge variant="verified" className="mb-4 px-3 py-1 text-xs font-mono tracking-widest uppercase">
        Wholesale Program
      </Badge>
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 max-w-xl">
        The kit catalog is for approved wholesale accounts
      </h1>
      <p className="text-muted-foreground text-lg max-w-xl mb-8 leading-relaxed">
        10-vial kits, tiered per-kit pricing, and a 5-kit minimum — available
        once your account is approved. Buying single vials for your lab?
        The retail store is open to everyone.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Button asChild size="lg" className="font-mono uppercase tracking-widest text-sm px-8">
          <Link href="/wholesale">
            <Building2 className="h-4 w-4 mr-2" /> Apply for Wholesale
          </Link>
        </Button>
        <Button asChild size="lg" variant="navy" className="font-mono uppercase tracking-widest text-sm px-8">
          <Link href="/wholesale/account">Sign in / Check status</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="font-mono uppercase tracking-widest text-sm px-8">
          <Link href="/retail">Shop Retail Vials</Link>
        </Button>
      </div>
    </div>
  );
}
