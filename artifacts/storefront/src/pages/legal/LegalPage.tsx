import { Link, useRoute } from "wouter";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { brand } from "@/lib/brand";
import NotFound from "@/pages/not-found";
import {
  findLegalDocument,
  isPendingReview,
  legalNav,
  type LegalDocument,
} from "./documents";

function DraftNotice() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-warn/40 bg-warn-tint p-4">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
      <p className="text-sm leading-relaxed">
        <span className="font-semibold">Draft — pending legal review.</span>{" "}
        This document has not yet been approved by counsel and is published here
        for review only. It is not the final agreement.
      </p>
    </div>
  );
}

export function LegalDocumentView({ doc }: { doc: LegalDocument }) {
  return (
    <div className="min-h-screen bg-background">
      <section className="section-deep border-b border-border py-14">
        <div className="container mx-auto max-w-3xl px-4">
          <Badge
            variant="verified"
            className="mb-5 px-3 py-1 font-mono text-xs uppercase tracking-widest"
          >
            Legal
          </Badge>
          <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">
            {doc.title}
          </h1>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            {doc.summary}
          </p>
          <p className="mt-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            {brand.legalName} · Last updated: {doc.lastUpdated}
          </p>
        </div>
      </section>

      <div className="container mx-auto max-w-3xl space-y-8 px-4 py-12">
        {isPendingReview(doc.slug) && <DraftNotice />}

        {doc.sections.map((section) => (
          <section key={section.heading} className="space-y-3">
            <h2 className="font-display text-xl font-semibold">
              {section.heading}
            </h2>
            {section.body.map((paragraph) => (
              <p
                key={paragraph}
                className="whitespace-pre-line leading-relaxed text-muted-foreground"
              >
                {paragraph}
              </p>
            ))}
            {section.bullets && (
              <ul className="list-disc space-y-2 pl-5 leading-relaxed text-muted-foreground">
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <nav className="border-t border-border pt-8">
          <h2 className="font-display text-xs font-semibold uppercase tracking-widest">
            Other policies
          </h2>
          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {legalNav
              .filter((item) => item.href !== `/legal/${doc.slug}`)
              .map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-primary transition-colors hover:underline"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}

export function LegalPage() {
  const [, params] = useRoute("/legal/:slug");
  const doc = params?.slug ? findLegalDocument(params.slug) : undefined;
  if (!doc) return <NotFound />;
  return <LegalDocumentView doc={doc} />;
}
