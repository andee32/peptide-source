import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useListRetailProducts } from "@app/api-client-react";
import { brand } from "@/lib/brand";
import { legalNav } from "@/pages/legal/documents";
import {
  ArrowRight,
  FileText,
  PackageCheck,
  ShieldCheck,
  Beaker,
} from "lucide-react";

/**
 * Homepage direction A — "the document is the pitch".
 *
 * Evidence-forward: the hero shows the actual product and an actual COA record
 * side by side instead of asserting trust in prose, and the catalog strip is
 * reduced to the four facts a buyer skims (compound, mg, price, COA state).
 * Preview-only; promoted over HomePage if chosen.
 */
export function HomeVariantA() {
  const { data: retailProducts, isLoading } = useListRetailProducts();
  const products = (retailProducts ?? []).slice(0, 6);
  const heroProduct = retailProducts?.find((p) => p.imageUrl);

  return (
    <div className="flex flex-col">
      {/* HERO — product left, evidence right */}
      <section className="border-b border-border bg-background">
        <div className="container mx-auto px-4 py-16 md:py-24 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <Badge
              variant="secondary"
              className="mb-6 font-mono text-xs uppercase tracking-widest"
            >
              Research use only
            </Badge>
            <h1 className="font-display text-4xl md:text-5xl font-extrabold tracking-tight mb-6">
              Every vial we ship
              <br />
              <span className="text-primary">has paperwork.</span>
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed mb-8 max-w-xl">
              {brand.name} supplies research peptides as single vials at retail
              and as 10-vial kits at wholesale. Each lot carries its own
              certificate of analysis, published against the lot number printed
              on what arrives &mdash; so you can check our claim instead of
              trusting it.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                asChild
                size="lg"
                className="font-mono uppercase tracking-widest text-xs h-13 px-7"
              >
                <Link href="/retail">Browse the catalog</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="font-mono uppercase tracking-widest text-xs h-13 px-7"
              >
                <Link href="/verify">Look up a lot number</Link>
              </Button>
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              Buying volume?{" "}
              <Link
                href="/wholesale"
                className="text-primary hover:underline"
              >
                Apply for a wholesale account
              </Link>{" "}
              &mdash; 10-vial kits, 5-kit minimum, tiered pricing.
            </p>
          </div>

          {/* Product + its record, as one object */}
          <div className="relative">
            <div className="rounded-xl border border-border bg-muted/30 overflow-hidden">
              {heroProduct?.imageUrl ? (
                <img
                  src={heroProduct.imageUrl}
                  alt={heroProduct.name}
                  className="w-full aspect-4/3 object-contain"
                />
              ) : (
                <div className="w-full aspect-4/3 flex items-center justify-center text-muted-foreground">
                  <Beaker className="h-16 w-16" />
                </div>
              )}
            </div>

            <div className="mt-4 rounded-xl border border-border bg-card shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="h-4 w-4 text-teal-ink" />
                <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  Lot record
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {[
                  ["Compound", heroProduct?.name ?? "\u2014"],
                  ["Format", "Single vial / 10-vial kit"],
                  ["COA", "Published per lot"],
                  ["Intended use", "In-vitro research only"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="mt-0.5">{value}</dd>
                  </div>
                ))}
              </dl>
              <Button
                asChild
                variant="ghost"
                className="mt-4 px-0 font-mono uppercase tracking-wider text-xs group"
              >
                <Link href="/verify">
                  Verify a lot
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* CATALOG STRIP — four facts per row, skimmable */}
      <section className="py-20 bg-muted/30 border-b border-border">
        <div className="container mx-auto px-4">
          <div className="flex items-end justify-between mb-8">
            <h2 className="text-2xl font-bold tracking-tight">In stock now</h2>
            <Button
              asChild
              variant="ghost"
              className="font-mono uppercase tracking-wider text-xs group"
            >
              <Link href="/retail">
                All compounds
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-3 border-b border-border font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              <span className="col-span-5">Compound</span>
              <span className="col-span-3">Category</span>
              <span className="col-span-2">COA</span>
              <span className="col-span-2 text-right">From</span>
            </div>
            {isLoading
              ? Array(4)
                  .fill(0)
                  .map((_, i) => (
                    <div key={i} className="px-5 py-4 border-b border-border">
                      <Skeleton className="h-5 w-64 bg-muted" />
                    </div>
                  ))
              : products.map((p) => (
                  <Link
                    key={p.id}
                    href={`/retail/${p.slug}`}
                    className="grid grid-cols-2 md:grid-cols-12 gap-2 md:gap-4 px-5 py-4 border-b border-border last:border-0 items-center hover:bg-muted/40 transition-colors"
                  >
                    <span className="col-span-2 md:col-span-5 font-semibold">
                      {p.name}
                    </span>
                    <span className="md:col-span-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                      {p.category}
                    </span>
                    <span className="md:col-span-2 font-mono text-xs text-muted-foreground">
                      per lot
                    </span>
                    <span className="md:col-span-2 text-right font-mono text-sm">
                      ${(p.startingPriceCents / 100).toFixed(2)}
                    </span>
                  </Link>
                ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl font-bold tracking-tight mb-10">
            What you can check, and when
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: FileText,
                title: "Before you pay",
                body: "The lot's COA is linked from its product page. Read it first; if it isn't there, don't order.",
              },
              {
                icon: ShieldCheck,
                title: "When it arrives",
                body: "Look up the lot number on the vial and confirm it resolves to the same document you read.",
              },
              {
                icon: PackageCheck,
                title: "Whenever you like",
                body: "Send a vial to your own lab. If your numbers disagree with ours, tell us \u2014 that's a result we want to hear.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="border-l-2 border-primary/40 pl-5 py-1"
              >
                <Icon className="h-5 w-5 text-teal-ink mb-3" />
                <h3 className="font-bold mb-2">{title}</h3>
                <p className="text-muted-foreground leading-relaxed text-sm">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* POLICIES + RUO */}
      <section className="section-deep py-16 border-t border-border">
        <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-2 gap-10">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-4">
              Research use only
            </p>
            <p className="leading-relaxed">
              Everything sold here is supplied strictly for laboratory and
              in-vitro research. Not a drug, not a supplement, not for human or
              veterinary use. Buyers must be 21 or older and affirm research use
              at checkout. Questions about lots, COAs, shipping or invoices go to{" "}
              <a
                href={`mailto:${brand.supportEmail}`}
                className="text-primary hover:underline"
              >
                {brand.supportEmail}
              </a>
              ; we don&apos;t discuss dosing or protocols.
            </p>
          </div>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-2 self-center">
            {legalNav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-sm hover:text-primary transition-colors"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
