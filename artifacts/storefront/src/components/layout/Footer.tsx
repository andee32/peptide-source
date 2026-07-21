import { Link } from "wouter";
import { Phone, Mail } from "lucide-react";

const linkColumns = [
  {
    heading: "Shop",
    links: [
      { href: "/shop", label: "Catalog" },
      { href: "/verify", label: "COA Verification" },
    ],
  },
  {
    heading: "Wholesale",
    links: [
      { href: "/wholesale", label: "Apply" },
      { href: "/wholesale/account", label: "Account" },
    ],
  },
  {
    heading: "Company",
    links: [{ href: "/contact", label: "Contact" }],
  },
];

export function Footer() {
  return (
    <footer className="section-deep border-t border-border">
      <div className="container mx-auto px-4 py-14">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          {/* Wordmark + positioning */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-sm">
                <img
                  src="/images/wolf-logo-t.png"
                  alt="AT Lab Sourcing"
                  className="h-7 w-7 object-contain"
                />
              </span>
              <span className="font-display text-xl font-extrabold tracking-tight">
                AT LAB SOURCING
              </span>
            </div>
            <p className="mt-3 text-sm text-muted-foreground max-w-xs leading-relaxed">
              Lab-verified research peptide sourcing, built for wholesale.
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
          <a
            href="tel:14236035487"
            className="flex items-center gap-2 hover:text-primary transition-colors"
          >
            <Phone className="h-4 w-4" />
            423-603-5487
          </a>
          <a
            href="mailto:info@atlabsourcing.com"
            className="flex items-center gap-2 hover:text-primary transition-colors"
          >
            <Mail className="h-4 w-4" />
            info@atlabsourcing.com
          </a>
        </div>

        {/* RUO disclaimer + copyright */}
        <div className="mt-10 pt-8 border-t border-border flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
            All products are for in-vitro laboratory research use only &mdash; not
            for human or veterinary use.
          </p>
          <p className="text-xs text-muted-foreground whitespace-nowrap">
            &copy; 2026 AT Lab Sourcing
          </p>
        </div>
      </div>
    </footer>
  );
}
