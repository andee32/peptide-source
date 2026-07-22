import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ShieldCheck, FlaskConical } from "lucide-react";

/**
 * AgeGate — retail entry gate for the public B2C storefront.
 *
 * Wrap the /retail/* routes with this component:
 *   <AgeGate><RetailRoutes /></AgeGate>
 *
 * The visitor must confirm they are 21+ and acknowledge that all products are
 * for in-vitro research use only (not for human or veterinary use) before the
 * children render. Acceptance is persisted to localStorage under
 * "retail_ruo_ack" so the gate is shown only once per browser.
 *
 * This is an entry acknowledgment only. The server still requires a signed RUO
 * attestation on every order (see CheckoutPage) — this gate does not replace it.
 */

const STORAGE_KEY = "retail_ruo_ack";

function readAck(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function AgeGate({ children }: { children: React.ReactNode }) {
  // Initialise from storage so an already-acknowledged visitor never sees a flash.
  const [acknowledged, setAcknowledged] = useState<boolean>(() => readAck());
  const [isAge, setIsAge] = useState(false);
  const [isRuo, setIsRuo] = useState(false);

  const canEnter = isAge && isRuo;

  // Lock body scroll while the gate overlay is visible.
  useEffect(() => {
    if (acknowledged) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [acknowledged]);

  const handleEnter = () => {
    if (!canEnter) return;
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // Non-persistent (e.g. private mode) — still allow entry for this session.
    }
    setAcknowledged(true);
  };

  if (acknowledged) return <>{children}</>;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="agegate-title"
      className="section-deep fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4"
    >
      <div className="w-full max-w-lg rounded-lg border border-border bg-card text-card-foreground shadow-2xl">
        <div className="flex flex-col items-center gap-5 p-8 text-center">
          <img
            src="/images/wolf-logo-t.png"
            alt="AT Lab Sourcing"
            className="h-14 w-14 opacity-90"
          />

          <div className="space-y-2">
            <p className="font-mono text-xs uppercase tracking-widest text-[var(--atl-gold)]">
              Research Use Only
            </p>
            <h2
              id="agegate-title"
              className="font-display text-2xl font-extrabold tracking-tight"
            >
              Before you enter
            </h2>
            <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
              This retail store sells research-grade materials for laboratory use
              only. Please confirm the following to continue.
            </p>
          </div>

          <div className="w-full space-y-3 text-left">
            <label className="hover-elevate flex cursor-pointer items-start gap-3 rounded-md border border-border p-4">
              <Checkbox
                checked={isAge}
                onCheckedChange={(v) => setIsAge(v === true)}
                className="mt-0.5 border-[var(--atl-gold)] data-[state=checked]:bg-[var(--atl-gold)] data-[state=checked]:text-[var(--atl-navy-900)]"
                aria-label="I am 21 years of age or older"
              />
              <span className="flex items-start gap-2 text-sm leading-relaxed">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--atl-gold)]" />
                <span>
                  I am <strong>21 years of age or older</strong>.
                </span>
              </span>
            </label>

            <label className="hover-elevate flex cursor-pointer items-start gap-3 rounded-md border border-border p-4">
              <Checkbox
                checked={isRuo}
                onCheckedChange={(v) => setIsRuo(v === true)}
                className="mt-0.5 border-[var(--atl-gold)] data-[state=checked]:bg-[var(--atl-gold)] data-[state=checked]:text-[var(--atl-navy-900)]"
                aria-label="I acknowledge products are for in-vitro research use only"
              />
              <span className="flex items-start gap-2 text-sm leading-relaxed">
                <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-[var(--atl-gold)]" />
                <span>
                  I understand these products are for <strong>in-vitro research
                  use only</strong> — not for human or veterinary use,
                  diagnostic, or therapeutic purposes.
                </span>
              </span>
            </label>
          </div>

          <div className="w-full space-y-3">
            <Button
              onClick={handleEnter}
              disabled={!canEnter}
              size="lg"
              className="w-full"
            >
              Enter store
            </Button>
            <a
              href="https://www.google.com"
              className="block text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              I do not agree — leave
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
