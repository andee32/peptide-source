import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Phone, MessageSquare, Mail, Clock } from "lucide-react";
import { brand } from "@/lib/brand";

const PHONE = brand.supportPhone;
const PHONE_HREF = PHONE.replace(/[^0-9+]/g, "");
const EMAIL = brand.supportEmail;

export function ContactPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header band — navy structure */}
      <section className="section-deep border-b border-border py-14">
        <div className="container mx-auto px-4 max-w-3xl text-center">
          <Badge variant="verified" className="mb-5 px-3 py-1 text-xs font-mono tracking-widest uppercase">
            Get in touch
          </Badge>
          <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight mb-4">
            Contact {brand.name}
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Questions about a batch, an order, or wholesale pricing? Reach us by phone,
            text, or email during business hours and we'll get back to you.
          </p>
        </div>
      </section>

      <div className="container mx-auto px-4 max-w-2xl py-12 space-y-4">
        {PHONE && (
          <>
            <Card className="border-border">
              <CardContent className="p-6 flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
                  <Phone className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-semibold mb-1">Call us</h2>
                  <a href={`tel:${PHONE_HREF}`} className="font-mono text-primary hover:underline">
                    {PHONE}
                  </a>
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-2">
                    <Clock className="h-3.5 w-3.5" />
                    Mon–Fri, 9:00 AM – 5:00 PM CT
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardContent className="p-6 flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
                  <MessageSquare className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-semibold mb-1">Text us</h2>
                  <a href={`sms:${PHONE_HREF}`} className="font-mono text-primary hover:underline">
                    {PHONE}
                  </a>
                  <p className="text-sm text-muted-foreground mt-2">
                    Same number — text for a quick reply during business hours.
                  </p>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        <Card className="border-border">
          <CardContent className="p-6 flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
              <Mail className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold mb-1">Email us</h2>
              <a href={`mailto:${EMAIL}`} className="font-mono text-primary hover:underline">
                {EMAIL}
              </a>
              <p className="text-sm text-muted-foreground mt-2">
                Best for order details, COA requests, and documentation.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="rounded-lg border border-border bg-secondary/40 p-5 text-sm text-muted-foreground leading-relaxed">
          Wholesale buyer? Labs, research organisations, resellers, and distributors can apply for tiered
          pricing on our{" "}
          <Link href="/wholesale" className="text-primary font-medium hover:underline">
            wholesale program
          </Link>
          .
        </div>
      </div>
    </div>
  );
}
