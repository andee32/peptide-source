import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ShieldCheck, FlaskConical, Building2, FileText, type LucideIcon } from "lucide-react";
import { brand } from "@/lib/brand";

/**
 * RuoGate — a single research-use-only entry gate shared by both channels.
 *
 * Wrap a channel's routes:
 *   <RuoGate channel="retail"><RetailRoutes /></RuoGate>
 *   <RuoGate channel="wholesale"><WholesaleCatalog /></RuoGate>
 *
 * Same look and mechanism for both; the ONLY per-channel difference is the
 * eligibility line — retail is age-based (consumer), wholesale is
 * qualification-based (licensed business / qualified researcher). Everything
 * else (not-for-consumption, agree-to-terms) is identical.
 *
 * This is an entry acknowledgment only, persisted per browser. The server still
 * requires a signed RUO attestation on every order (CheckoutPage) — this gate
 * does not replace that record of record.
 *
 * COPY NOTE: the visible wording below is a reasonable default. Final gate copy
 * is a compliance decision — have counsel approve it (as with the server-side
 * ATTESTATION_TEXT) before launch. The referenced policies must stay linked:
 * asking a visitor to agree to a document they cannot open is not an agreement.
 */

type GateItem = {
  key: string;
  icon: LucideIcon;
  content: React.ReactNode;
  aria: string;
};

type GateConfig = {
  storageKey: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  items: GateItem[];
  enterLabel: string;
};

// Shared checkboxes — identical across channels.
const NOT_FOR_CONSUMPTION: GateItem = {
  key: "consumption",
  icon: FlaskConical,
  aria: "I understand these products are not for human or animal consumption",
  content: (
    <span>
      I understand these products are <strong>not for human or animal
      consumption</strong> and are research use only.
    </span>
  ),
};

/**
 * Opens a policy in a new tab. Each row is a <label>, so the click must not
 * bubble or it would toggle the checkbox the visitor is reading about.
 */
function PolicyLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="font-semibold underline underline-offset-2 hover:text-primary"
    >
      {children}
    </a>
  );
}

const AGREE_TERMS: GateItem = {
  key: "terms",
  icon: FileText,
  aria: "I agree to the Terms of Use and the Research Use Only Policy",
  content: (
    <span>
      I agree to the <PolicyLink href="/legal/terms">Terms of Use</PolicyLink>{" "}
      and the{" "}
      <PolicyLink href="/legal/ruo-policy">Research Use Only Policy</PolicyLink>.
    </span>
  ),
};

const CONFIGS: Record<"retail" | "wholesale", GateConfig> = {
  retail: {
    storageKey: "retail_ruo_ack", // unchanged — keeps already-acknowledged visitors from re-gating
    eyebrow: "Research Use Only",
    title: "Before you enter",
    subtitle:
      "This retail store sells research-grade materials for laboratory use only. Please confirm the following to continue.",
    items: [
      {
        key: "eligibility",
        icon: ShieldCheck,
        aria: "I am 21 years of age or older",
        content: (
          <span>
            I am <strong>21 years of age or older</strong> and purchasing for
            lawful research use.
          </span>
        ),
      },
      NOT_FOR_CONSUMPTION,
      AGREE_TERMS,
    ],
    enterLabel: "Enter store",
  },
  wholesale: {
    storageKey: "wholesale_ruo_ack",
    eyebrow: "Research Use Only",
    title: "Wholesale portal access",
    subtitle:
      "All products on this platform are sold exclusively for in-vitro laboratory research purposes. Please confirm the following to continue.",
    items: [
      {
        key: "eligibility",
        icon: Building2,
        aria: "I am a qualified researcher or licensed business purchasing for lawful laboratory use only",
        content: (
          <span>
            I am a <strong>qualified researcher or licensed business</strong>{" "}
            purchasing for lawful laboratory use only.
          </span>
        ),
      },
      NOT_FOR_CONSUMPTION,
      AGREE_TERMS,
    ],
    enterLabel: "Confirm & enter portal",
  },
};

function readAck(key: string): boolean {
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

export function RuoGate({
  channel,
  children,
}: {
  channel: "retail" | "wholesale";
  children: React.ReactNode;
}) {
  const config = CONFIGS[channel];
  // Initialise from storage so an already-acknowledged visitor never sees a flash.
  const [acknowledged, setAcknowledged] = useState<boolean>(() => readAck(config.storageKey));
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const canEnter = config.items.every((i) => checked[i.key]);

  // Lock body scroll while the gate overlay is visible.
  useEffect(() => {
    if (acknowledged) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [acknowledged]);

  // Re-read when the channel (and thus storage key) changes.
  useEffect(() => {
    setAcknowledged(readAck(config.storageKey));
    setChecked({});
  }, [config.storageKey]);

  const handleEnter = () => {
    if (!canEnter) return;
    try {
      localStorage.setItem(config.storageKey, "true");
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
      aria-labelledby="ruogate-title"
      className="section-deep fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4"
    >
      <div className="w-full max-w-lg rounded-lg border border-border bg-card text-card-foreground shadow-2xl">
        <div className="flex flex-col items-center gap-5 p-8 text-center">
          <img
            src={brand.logoSrc}
            alt={brand.name}
            className="h-14 w-14 opacity-90"
          />

          <div className="space-y-2">
            <p className="font-mono text-xs uppercase tracking-widest text-[var(--brand-gold)]">
              {config.eyebrow}
            </p>
            <h2
              id="ruogate-title"
              className="font-display text-2xl font-extrabold tracking-tight"
            >
              {config.title}
            </h2>
            <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
              {config.subtitle}
            </p>
          </div>

          <div className="w-full space-y-3 text-left">
            {config.items.map((item) => {
              const Icon = item.icon;
              return (
                <label
                  key={item.key}
                  className="hover-elevate flex cursor-pointer items-start gap-3 rounded-md border border-border p-4"
                >
                  <Checkbox
                    checked={!!checked[item.key]}
                    onCheckedChange={(v) =>
                      setChecked((prev) => ({ ...prev, [item.key]: v === true }))
                    }
                    className="mt-0.5 border-[var(--brand-gold)] data-[state=checked]:bg-[var(--brand-gold)] data-[state=checked]:text-[var(--brand-navy-900)]"
                    aria-label={item.aria}
                  />
                  <span className="flex items-start gap-2 text-sm leading-relaxed">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-gold)]" />
                    {item.content}
                  </span>
                </label>
              );
            })}
          </div>

          <div className="w-full space-y-3">
            <Button onClick={handleEnter} disabled={!canEnter} size="lg" className="w-full">
              {config.enterLabel}
            </Button>
            <a
              href="https://www.google.com"
              className="block text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              Not eligible? Exit site
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
