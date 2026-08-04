import { Link } from "wouter";
import { Phone, Mail } from "lucide-react";
import { brand } from "@/lib/brand";
import { legalNav } from "@/pages/legal/documents";

const linkColumns = [
  {
    heading: "Shop",
    links: [
      { href: "/retail", label: "Retail Store" },
      { href: "/verify", label: "COA Verification" },
    ],
  },
  {
    heading: "Wholesale",
    links: [
      { href: "/wholesale", label: "Apply" },
      { href: "/wholesale/account", label: "Account" },
      { href: "/shop", label: "Kit Catalog" },
    ],
  },
  {
    heading: "Company",
    links: [{ href: "/contact", label: "Contact" }],
  },
  {
    heading: "Legal",
    links: legalNav,
  },
];

export function Footer() {
  return (
    <footer className="section-deep border-t border-border">
      <div className="container mx-auto px-4 py-14">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          {/* Wordmark + positioning */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-sm">
                <img
                  src={brand.logoSrc}
                  alt={brand.name}
                  className="h-7 w-7 object-contain"
                />
              </span>
              <span className="font-display text-xl font-extrabold tracking-tight">
                {brand.wordmark}
              </span>
            </div>
            <p className="mt-3 text-sm text-muted-foreground max-w-xs leading-relaxed">
              {brand.tagline}
            </p>
          </div>

          {/* Link columns */}
          {linkColumns.map((column) => (
            <div key={column.heading}>
              <h3 className="font-display text-xs font-semibold uppercase tracking-widest text-foreground/90">
                {column.heading}
              </h3>
              <ul className="mt-4 space-y-3 text-sm">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-muted-foreground hover:text-primary transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Contact line */}
        <div className="mt-12 flex flex-col sm:flex-row gap-4 sm:gap-8 text-sm text-muted-foreground">
          {brand.supportPhone && (
            <a
              href={`tel:${brand.supportPhone.replace(/[^0-9+]/g, "")}`}
              className="flex items-center gap-2 hover:text-primary transition-colors"
            >
              <Phone className="h-4 w-4" />
              {brand.supportPhone}
            </a>
          )}
          <a
            href={`mailto:${brand.supportEmail}`}
            className="flex items-center gap-2 hover:text-primary transition-colors"
          >
            <Mail className="h-4 w-4" />
            {brand.supportEmail}
          </a>
        </div>

        {/* RUO disclaimer + copyright */}
        <div className="mt-10 pt-8 border-t border-border flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="max-w-2xl space-y-2 text-xs text-muted-foreground leading-relaxed">
            <p>
              All products are for in-vitro laboratory research use only &mdash;
              not for human or veterinary use.
            </p>
            {brand.postalAddress && (
              <p className="whitespace-pre-line">{brand.postalAddress}</p>
            )}
          </div>
          <p className="text-xs text-muted-foreground whitespace-nowrap">
            &copy; {new Date().getFullYear()} {brand.name}
          </p>
        </div>
      </div>
    </footer>
  );
}
