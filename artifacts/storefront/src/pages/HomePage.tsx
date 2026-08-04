import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProductCard } from "@/components/product/ProductCard";
import { useListRetailProducts } from "@app/api-client-react";
import {
  ShieldCheck,
  Beaker,
  PackageCheck,
  Truck,
  ArrowRight,
  Mail,
  FileSearch,
  Repeat,
} from "lucide-react";
import { legalNav } from "@/pages/legal/documents";
import { Skeleton } from "@/components/ui/skeleton";
import { brand } from "@/lib/brand";

export function HomePage() {
  // Featured strip reads the public retail catalog — the wholesale kit catalog
  // (and its pricing) is approved-accounts-only.
  const { data: retailProducts, isLoading } = useListRetailProducts();
  const products = retailProducts?.filter((p) => p.featured);

  return (
    <div className="flex flex-col min-h-screen">
      {/* HERO — deep-navy B2B band */}
      <section className="section-deep relative overflow-hidden pt-24 pb-28 border-b border-border">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/15 via-transparent to-transparent pointer-events-none"></div>

        <div className="container mx-auto px-4 relative z-10 flex flex-col items-center text-center max-w-4xl">
          <Badge variant="verified" className="mb-6 px-3 py-1 text-xs font-mono tracking-widest uppercase">
            Wholesale Research Peptides
          </Badge>

          <h1 className="font-display text-4xl md:text-6xl font-extrabold tracking-tight mb-5">
            Lab-verified sourcing,
            <br />
            <span className="text-primary">built for wholesale.</span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl leading-relaxed">
            Research-use-only compounds supplied as 10-vial kits with a 5-kit minimum,
            or as single vials at retail. Every lot ships with its certificate of
            analysis, linked by lot number so you can read it before you commit an order.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mb-16 w-full sm:w-auto">
            <Button asChild size="lg" className="font-mono uppercase tracking-widest text-sm h-14 px-8">
              <Link href="/wholesale">Apply for Wholesale</Link>
            </Button>
            <Button asChild size="lg" variant="gold" className="font-mono uppercase tracking-widest text-sm h-14 px-8">
              <Link href="/retail">Shop Retail Vials</Link>
            </Button>
          </div>

          <div className="flex flex-wrap justify-center items-center gap-6 md:gap-12 text-sm font-medium text-muted-foreground border-t border-border pt-8 w-full">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <span>Research use only</span>
            </div>
            <div className="flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-primary" />
              <span>10-vial kits &middot; 5-kit MOQ</span>
            </div>
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              <span>Per-lot COA on every order</span>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURED PRODUCTS */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-end mb-12">
            <div>
              <h2 className="text-3xl font-bold tracking-tight mb-2">Featured Compounds</h2>
              <p className="text-muted-foreground">In stock, COA-backed single vials — no account needed.</p>
            </div>
            <Button asChild variant="ghost" className="hidden sm:flex group font-mono uppercase tracking-wider text-xs">
              <Link href="/retail">
                View All Vials <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {isLoading ? (
              Array(3).fill(0).map((_, i) => (
                <div key={i} className="flex flex-col space-y-3">
                  <Skeleton className="h-[300px] w-full rounded-xl bg-muted" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-[250px] bg-muted" />
                    <Skeleton className="h-4 w-[200px] bg-muted" />
                  </div>
                </div>
              ))
            ) : products?.slice(0, 3).map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                href={`/retail/${product.slug}`}
                unitLabel="vial"
              />
            ))}
          </div>

          <div className="mt-8 text-center sm:hidden">
            <Button asChild variant="navy" className="w-full font-mono uppercase tracking-wider text-xs">
              <Link href="/retail">Shop All Vials</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* TRUST PILLARS */}
      <section className="py-24 bg-muted/40 border-y border-border">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl font-bold tracking-tight mb-4">Why partners source with {brand.name}</h2>
            <p className="text-muted-foreground text-lg">
              First-party COAs and a direct owner relationship &mdash; no anonymous middlemen,
              no guessing at what&apos;s in the vial.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center md:text-left">
            <div className="flex flex-col items-center md:items-start bg-card border border-border rounded-lg p-8 shadow-sm">
              <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center mb-6 border border-primary/25 text-teal-ink">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <h3 className="text-xl font-bold mb-3">COA-Verified Inventory</h3>
              <p className="text-muted-foreground leading-relaxed">
                Each lot's certificate of analysis is published against that lot number,
                stating the tests the lab actually ran. Look it up before you order.
              </p>
            </div>

            <div className="flex flex-col items-center md:items-start bg-card border border-border rounded-lg p-8 shadow-sm">
              <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center mb-6 border border-primary/25 text-teal-ink">
                <PackageCheck className="h-7 w-7" />
              </div>
              <h3 className="text-xl font-bold mb-3">Wholesale Kit Pricing</h3>
              <p className="text-muted-foreground leading-relaxed">
                Standardized 10-vial kits with a 5-kit minimum and tiered per-kit pricing
                that resolves from your assigned wholesale account.
              </p>
            </div>

            <div className="flex flex-col items-center md:items-start bg-card border border-border rounded-lg p-8 shadow-sm">
              <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center mb-6 border border-primary/25 text-teal-ink">
                <Beaker className="h-7 w-7" />
              </div>
              <h3 className="text-xl font-bold mb-3">Dual Sourcing, RUO-First</h3>
              <p className="text-muted-foreground leading-relaxed">
                Research-use-only compounds from more than one manufacturing lane, with
                each product&apos;s sourcing path stated on its page &mdash; you choose
                the lane that fits your program.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* HOW VERIFICATION WORKS — the buyer's own audit path, in order */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mb-14">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-3">
              Verification
            </p>
            <h2 className="text-3xl font-bold tracking-tight mb-4">
              You don&apos;t have to take our word for it
            </h2>
            <p className="text-muted-foreground text-lg">
              Every vial belongs to a lot, and every lot has a document. Here is the
              whole path, before and after you order.
            </p>
          </div>

          <ol className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: FileSearch,
                step: "01",
                title: "Read the COA first",
                body: "Product pages link the certificate of analysis for the lot on the shelf. Open it before you spend anything.",
              },
              {
                icon: ShieldCheck,
                step: "02",
                title: "Check the lot on arrival",
                body: "Look up the lot number printed on what you received and confirm it resolves to the same document.",
              },
              {
                icon: Beaker,
                step: "03",
                title: "Test it yourself",
                body: "Nothing stops you sending a vial to your own lab. If your result disagrees with ours, tell us — that is a problem we want.",
              },
            ].map(({ icon: Icon, step, title, body }) => (
              <li
                key={step}
                className="bg-card border border-border rounded-lg p-8 shadow-sm"
              >
                <div className="flex items-center gap-3 mb-5">
                  <Icon className="h-6 w-6 text-teal-ink" />
                  <span className="font-mono text-xs tracking-widest text-muted-foreground">
                    {step}
                  </span>
                </div>
                <h3 className="text-lg font-bold mb-3">{title}</h3>
                <p className="text-muted-foreground leading-relaxed">{body}</p>
              </li>
            ))}
          </ol>

          <div className="mt-10">
            <Button
              asChild
              variant="navy"
              className="font-mono uppercase tracking-widest text-xs"
            >
              <Link href="/verify">Look up a lot number</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* CHANNELS — retail vs wholesale vs recurring kits */}
      <section className="py-24 bg-muted/40 border-y border-border">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold tracking-tight mb-4">
            Three ways to buy
          </h2>
          <p className="text-muted-foreground text-lg mb-14 max-w-2xl">
            Retail is open to anyone. Wholesale pricing and the kit catalog require an
            approved account.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: Beaker,
                title: "Single vials",
                body: "Retail pricing, no account, no minimum. Best for evaluating a compound before committing to volume.",
                href: "/retail",
                cta: "Shop retail",
              },
              {
                icon: PackageCheck,
                title: "Wholesale kits",
                body: "10-vial kits, 5-kit minimum, tiered pricing that resolves from your approved account. Applications are reviewed by a person.",
                href: "/wholesale",
                cta: "Apply for wholesale",
              },
              {
                icon: Repeat,
                title: "Recurring kits",
                body: "Put a kit on a repeating schedule so a program doesn't stall waiting on a reorder. Skip or cancel from your dashboard.",
                href: "/kits",
                cta: "See kit schedules",
              },
            ].map(({ icon: Icon, title, body, href, cta }) => (
              <div
                key={title}
                className="flex flex-col bg-card border border-border rounded-lg p-8 shadow-sm"
              >
                <Icon className="h-7 w-7 text-teal-ink mb-6" />
                <h3 className="text-xl font-bold mb-3">{title}</h3>
                <p className="text-muted-foreground leading-relaxed mb-6 flex-1">
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
        </div>
      </section>

      {/* CONTACT + POLICIES — "a real person, and the rules in writing" */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4 grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div>
            <h2 className="text-3xl font-bold tracking-tight mb-4">
              Questions before you order
            </h2>
            <p className="text-muted-foreground text-lg mb-8">
              Email reaches the people who run this, and we aim to answer within one
              business day. We&apos;ll talk about lots, COAs, sourcing paths, shipping
              and invoices &mdash; we will not discuss dosing, protocols or any use in
              humans or animals.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                asChild
                className="font-mono uppercase tracking-widest text-xs"
              >
                <Link href="/contact">Contact us</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="font-mono uppercase tracking-widest text-xs"
              >
                <a href={`mailto:${brand.supportEmail}`}>
                  <Mail className="mr-2 h-4 w-4" />
                  {brand.supportEmail}
                </a>
              </Button>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-5">
              <Truck className="h-6 w-6 text-teal-ink" />
              <h3 className="text-lg font-bold">The rules, in writing</h3>
            </div>
            <p className="text-muted-foreground leading-relaxed mb-6">
              Shipping destinations, returns, and what research use only means here are
              published rather than described. Read them before you order &mdash; they
              are the terms you agree to at checkout.
            </p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
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
        </div>
      </section>

      {/* RUO DISCLOSURE — stated on the homepage, not only in the footer */}
      <section className="section-deep py-16 border-t border-border">
        <div className="container mx-auto px-4 max-w-3xl text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-4">
            Research use only
          </p>
          <p className="text-lg leading-relaxed">
            Everything sold here is supplied strictly for laboratory and in-vitro
            research. It is not a drug, not a supplement, and not for human or
            veterinary use, consumption, or diagnostic application. Buyers must be 21 or
            older and affirm research use at checkout.
          </p>
        </div>
      </section>
    </div>
  );
}
