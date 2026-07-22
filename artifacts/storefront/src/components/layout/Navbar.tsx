import { Link } from "wouter";
import { ShoppingCart, Menu, Building2, X, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/cart";
import { useWholesaleSession } from "@/hooks/useWholesaleSession";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useState } from "react";

export function Navbar() {
  const { totalItems, setIsCartOpen } = useCart();
  const { session, clear: clearSession } = useWholesaleSession();
  const { customer } = useCustomerAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: "/shop", label: "Catalog" },
    { href: "/retail", label: "Shop (Retail)" },
    { href: "/verify", label: "COA Verification" },
    { href: "/wholesale", label: "Wholesale / Apply" },
    { href: "/wholesale/account", label: "Wholesale Account" },
    { href: "/contact", label: "Contact" },
  ];

  // Retail (B2C) account entry point — the wholesale chip below is separate.
  const accountLink = customer
    ? { href: "/account", label: customer.name?.trim().split(/\s+/)[0] || "My Account" }
    : { href: "/account/login", label: "Sign in" };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-md">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        
        {/* Mobile Menu */}
        <div className="lg:hidden">
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="mr-2">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] sm:w-[400px]">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <SheetDescription className="sr-only">Navigation menu</SheetDescription>
              <nav className="flex flex-col gap-6 mt-8">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="text-lg font-medium hover:text-primary transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {link.label}
                  </Link>
                ))}
                <Link
                  href={accountLink.href}
                  className="flex items-center gap-2 text-lg font-medium hover:text-primary transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <User className="h-4 w-4" />
                  {accountLink.label}
                </Link>
              </nav>
            </SheetContent>
          </Sheet>
        </div>

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
          <img
            src="/images/wolf-logo-t.png"
            alt="AT Lab Sourcing"
            className="h-9 w-9 object-contain"
          />
          <span className="font-display text-xl md:text-2xl font-extrabold tracking-tight">
            AT LAB SOURCING
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden lg:flex items-center gap-8 text-sm font-medium">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest text-xs"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-4">
          {session && (
            <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 pl-2.5 pr-1 py-1 text-xs font-mono">
              <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-foreground max-w-[160px] truncate">
                Wholesale · {session.businessName || "Account"}
              </span>
              <button
                onClick={clearSession}
                className="ml-0.5 rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-primary/15 transition-colors"
                aria-label="Sign out of wholesale"
                title="Sign out of wholesale"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          <Link
            href={accountLink.href}
            className="hidden sm:flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
            title={customer ? "Your account" : "Sign in to your retail account"}
          >
            <User className="h-3.5 w-3.5 shrink-0" />
            <span className="max-w-[120px] truncate normal-case tracking-normal">
              {accountLink.label}
            </span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="relative hover-elevate"
            onClick={() => setIsCartOpen(true)}
          >
            <ShoppingCart className="h-5 w-5" />
            {totalItems > 0 && (
              <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] font-bold h-4 w-4 rounded-full flex items-center justify-center">
                {totalItems}
              </span>
            )}
            <span className="sr-only">Open cart</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
