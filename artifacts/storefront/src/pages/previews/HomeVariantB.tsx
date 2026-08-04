import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useListRetailProducts } from "@app/api-client-react";
import { brand } from "@/lib/brand";
import { legalNav } from "@/pages/legal/documents";
import { ArrowRight, Search, Building2, Repeat, Beaker } from "lucide-react";

/**
 * Homepage direction B — "the counter, not the billboard".
 *
 * Utility-first, the way a scientific distributor's front page behaves: lot
 * lookup and the catalog are the first interactive things on the page, the
 * pitch is a single line, and the two channels are a choice rather than a
 * competing pair of hero CTAs. Preview-only.
 */
export function HomeVariantB() {
  const [, navigate] = useLocation();
  const [lot, setLot] = useState("");
  const { data: retailProducts, isLoading } = useListRetailProducts();

  const categories = Array.from(
    new Set((retailProducts ?? []).map((p) => p.category)),
  );
  const featured = (retailProducts ?? []).filter((p) => p.imageUrl).slice(0, 4);

  return (
    <div className="flex flex-col">
      {/* COUNTER — one line of positioning, then the two things people came to do */}
      <section className="bg-background border-b border-border">
        <div className="container mx-auto px-4 py-14 md:py-20 max-w-4xl">
          <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight mb-4">
            Research peptides, supplied with the lot paperwork.
          </h1>
          <p className="text-lg text-muted-foreground mb-10 max-w-2xl">
            Single vials at retail, 10-vial kits at wholesale. Every lot has a
            certificate of analysis you can read before and after you order.
            In-vitro research use only.
          </p>

          <form
            className="flex flex-col sm:flex-row gap-3 mb-4"
            onSubmit={(e) => {
              e.preventDefault();
              const q = lot.trim();
              navigate(q ? `/verify/${encodeURIComponent(q)}` : "/verify");
            }}
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={lot}
                onChange={(e) => setLot(e.target.value)}
                placeholder="Enter a lot number to pull its COA"
                aria-label="Lot number"
                className="pl-9 h-12"
              />
            </div>
            <Button
              type="submit"
              size="lg"
              className="font-mono uppercase tracking-widest text-xs h-12 px-7"
            >
              Look it up
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">
            The lot number is printed on the vial. No account needed to verify.
          </p>
        </div>
      </section>

      {/* CATEGORY RAIL */}
      <section className="bg-muted/30 border-b border-border">
        <div className="container mx-auto px-4 py-10">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-4">
            Browse by category
          </p>
          <div className="flex flex-wrap gap-2">
            {isLoading
              ? Array(4)
                  .fill(0)
                  .map((_, i) => (
                    <Skeleton key={i} className="h-9 w-28 bg-muted" />
                  ))
              : categories.map((c) => (
                  <Button
                    key={c}
                    asChild
                    variant="outline"
                    className="font-mono text-xs uppercase tracking-wider"
                  >
                    <Link href="/retail">{c}</Link>
                  </Button>
                ))}
            <Button
              asChild
              variant="ghost"
              className="font-mono text-xs uppercase tracking-wider group"
            >
              <Link href="/retail">
                Everything
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* PRODUCT STRIP — image-led, minimal copy */}
      <section className="py-16 bg-background border-b border-border">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {isLoading
              ? Array(4)
                  .fill(0)
                  .map((_, i) => (
                    <Skeleton
                      key={i}
                      className="h-56 w-full rounded-lg bg-muted"
                    />
                  ))
              : featured.map((p) => (
                  <Link
                    key={p.id}
                    href={`/retail/${p.slug}`}
                    className="group rounded-lg border border-border bg-card overflow-hidden hover:border-primary/40 transition-colors"
                  >
                    <div className="bg-muted/30 aspect-square flex items-center justify-center overflow-hidden">
                      {p.imageUrl ? (
                        <img
                          src={p.imageUrl}
                          alt={p.name}
                          className="h-full w-full object-contain group-hover:scale-[1.03] transition-transform duration-300"
                        />
                      ) : (
                        <Beaker className="h-10 w-10 text-muted-foreground" />
                      )}
                    </div>
                    <div className="p-4 flex items-baseline justify-between gap-2">
                      <span className="font-semibold truncate">{p.name}</span>
                      <span className="font-mono text-sm whitespace-nowrap">
                        ${(p.startingPriceCents / 100).toFixed(2)}
                      </span>
                    </div>
                  </Link>
                ))}
          </div>
        </div>
      </section>

      {/* CHANNELS — a choice, side by side, no competing hero CTAs */}
      <section className="py-16 bg-muted/30 border-b border-border">
        <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: Beaker,
              title: "Retail",
              body: "Single vials, open to anyone, no minimum. Best for evaluating a compound.",
              href: "/retail",
              cta: "Shop vials",
            },
            {
              icon: Building2,
              title: "Wholesale",
              body: "10-vial kits, 5-kit minimum, tier pricing on an approved account. Applications reviewed by a person.",
              href: "/wholesale",
              cta: "Apply",
            },
            {
              icon: Repeat,
              title: "Standing orders",
              body: "Put a kit on a repeating schedule so a program doesn't stall on a reorder. Skip or cancel any time.",
              href: "/kits",
              cta: "See schedules",
            },
          ].map(({ icon: Icon, title, body, href, cta }) => (
            <div
              key={title}
              className="flex flex-col rounded-lg border border-border bg-card p-6"
            >
              <Icon className="h-6 w-6 text-teal-ink mb-4" />
              <h3 className="font-bold mb-2">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-5 flex-1">
                {body}
              </p>
              <Button
                asChild
                variant="ghost"
                className="self-start px-0 font-mono uppercase tracking-wider text-xs group"
              >
                <Link href={href}>
                  {cta}
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
            </div>
          ))}
        </div>
      </section>

      {/* FINE PRINT BAR */}
      <section className="py-12 bg-background">
        <div className="container mx-auto px-4 flex flex-col md:flex-row md:items-start gap-8 justify-between">
          <p className="text-sm text-muted-foreground max-w-xl leading-relaxed">
            Supplied strictly for laboratory and in-vitro research &mdash; not a
            drug, not a supplement, not for human or veterinary use. 21+, with
            research use affirmed at checkout. Lot, COA, shipping and invoice
            questions:{" "}
            <a
              href={`mailto:${brand.supportEmail}`}
              className="text-primary hover:underline"
            >
              {brand.supportEmail}
            </a>
            . We don&apos;t discuss dosing or protocols.
          </p>
          <ul className="grid grid-cols-2 gap-x-8 gap-y-2">
            {legalNav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
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
