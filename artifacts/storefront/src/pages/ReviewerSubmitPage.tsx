import { useState } from "react";
import { Link } from "wouter";
import {
  FlaskConical,
  CheckCircle2,
  ArrowLeft,
  ExternalLink,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useListProducts } from "@app/api-client-react";

const JANOSHIK_RE = /^[A-Z]{1,4}[0-9]{4,12}$/i;

type Step = "form" | "success";

function JanoshikGuide() {
  return (
    <div className="bg-secondary/40 border border-border rounded-xl p-5 text-sm space-y-3">
      <div className="flex items-center gap-2 font-semibold text-foreground">
        <Info className="h-4 w-4 text-primary shrink-0" />
        How to get a Janoshik Task ID
      </div>
      <ol className="space-y-2 text-muted-foreground list-none">
        <li className="flex gap-2">
          <span className="font-mono text-primary font-bold w-5 shrink-0">1.</span>
          Purchase a purity test at{" "}
          <a
            href="https://janoshik.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline inline-flex items-center gap-1"
          >
            janoshik.com <ExternalLink className="h-3 w-3" />
          </a>
        </li>
        <li className="flex gap-2">
          <span className="font-mono text-primary font-bold w-5 shrink-0">2.</span>
          Ship your sample to Janoshik's lab address provided during ordering.
        </li>
        <li className="flex gap-2">
          <span className="font-mono text-primary font-bold w-5 shrink-0">3.</span>
          After analysis, Janoshik emails you a Task ID (e.g.{" "}
          <code className="font-mono text-xs bg-primary/10 px-1.5 py-0.5 rounded text-primary">
            J12345678
          </code>
          ).
        </li>
        <li className="flex gap-2">
          <span className="font-mono text-primary font-bold w-5 shrink-0">4.</span>
          Enter that Task ID below. Your submission goes live after admin review
          (typically within 24h).
        </li>
      </ol>
    </div>
  );
}

export function ReviewerSubmitPage() {
  const { data: products } = useListProducts();

  const [step, setStep] = useState<Step>("form");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [handle, setHandle] = useState("");
  const [platform, setPlatform] = useState<string>("reddit");
  const [taskId, setTaskId] = useState("");
  const [productId, setProductId] = useState<string>("");
  const [purityPercent, setPurityPercent] = useState<string>("");
  const [notes, setNotes] = useState("");

  const taskIdValid = taskId === "" || JANOSHIK_RE.test(taskId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!JANOSHIK_RE.test(taskId)) {
      setError(
        "Janoshik Task ID format invalid. It should be letters followed by digits (e.g. J12345678)."
      );
      return;
    }

    const parsedProductId = parseInt(productId, 10);
    if (isNaN(parsedProductId)) {
      setError("Please select a product.");
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        reviewerHandle: handle.trim(),
        platform,
        janoshikTaskId: taskId.trim().toUpperCase(),
        productId: parsedProductId,
      };
      if (purityPercent !== "") {
        body.purityPercent = parseFloat(purityPercent);
      }
      if (notes.trim() !== "") {
        body.notes = notes.trim();
      }

      const res = await fetch("/api/reviewer-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          (data as { message?: string }).message ?? "Submission failed. Please try again."
        );
        return;
      }

      setStep("success");
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "success") {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-background flex flex-col items-center justify-center px-4 text-center">
        <div className="bg-card border border-border rounded-2xl p-10 max-w-md w-full">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 mb-6">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold mb-3">Submission Received</h1>
          <p className="text-muted-foreground mb-2">
            Your result has been submitted and is pending admin review. It will
            appear on the public ledger within 24 hours if approved.
          </p>
          <p className="text-sm text-zinc-500 mb-8">
            Thank you for contributing to the community verification ledger.
          </p>
          <div className="flex flex-col gap-3">
            <Button asChild className="font-mono uppercase tracking-widest text-xs">
              <Link href="/reviewers">View Ledger</Link>
            </Button>
            <Button
              variant="ghost"
              className="font-mono uppercase tracking-widest text-xs text-muted-foreground"
              onClick={() => {
                setStep("form");
                setHandle("");
                setTaskId("");
                setProductId("");
                setPurityPercent("");
                setNotes("");
                setError(null);
              }}
            >
              Submit Another
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <Link
          href="/reviewers"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Ledger
        </Link>

        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-xs font-mono uppercase tracking-widest mb-4 border border-primary/20">
            <FlaskConical className="h-3.5 w-3.5" />
            Submit Results
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            Submit Your Verification
          </h1>
          <p className="text-muted-foreground">
            Independently tested one of our compounds? Add your Janoshik result
            to the public ledger and help the community verify our claims.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="lg:col-span-3 space-y-5 bg-card border border-border rounded-xl p-6"
          >
            <div className="space-y-1.5">
              <Label htmlFor="handle" className="text-sm font-medium">
                Reviewer Handle <span className="text-red-400">*</span>
              </Label>
              <Input
                id="handle"
                placeholder="u/your_reddit_handle"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                required
                minLength={2}
                maxLength={100}
                className="bg-background border-border font-mono text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Platform</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="bg-background border-border font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reddit">Reddit</SelectItem>
                  <SelectItem value="discord">Discord</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="taskId" className="text-sm font-medium">
                Janoshik Task ID <span className="text-red-400">*</span>
              </Label>
              <Input
                id="taskId"
                placeholder="J12345678"
                value={taskId}
                onChange={(e) => setTaskId(e.target.value.toUpperCase())}
                required
                className={`bg-background border-border font-mono text-sm uppercase tracking-widest ${
                  !taskIdValid ? "border-red-500 focus-visible:ring-red-500" : ""
                }`}
              />
              {!taskIdValid && (
                <p className="text-xs text-red-400">
                  Format: letters then digits, e.g. J12345678
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Product Tested <span className="text-red-400">*</span>
              </Label>
              <Select value={productId} onValueChange={setProductId} required>
                <SelectTrigger className="bg-background border-border font-mono text-sm">
                  <SelectValue placeholder="Select a product…" />
                </SelectTrigger>
                <SelectContent>
                  {(products ?? []).map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="purity" className="text-sm font-medium">
                Purity Result (%){" "}
                <span className="text-muted-foreground text-xs">(optional)</span>
              </Label>
              <Input
                id="purity"
                type="number"
                min={0}
                max={100}
                step={0.01}
                placeholder="98.7"
                value={purityPercent}
                onChange={(e) => setPurityPercent(e.target.value)}
                className="bg-background border-border font-mono text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-sm font-medium">
                Notes{" "}
                <span className="text-muted-foreground text-xs">(optional)</span>
              </Label>
              <Textarea
                id="notes"
                placeholder="Any additional observations about the test…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                maxLength={2000}
                className="bg-background border-border text-sm resize-none"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={submitting || !taskIdValid}
              className="w-full font-mono uppercase tracking-widest text-xs h-12"
            >
              {submitting ? "Submitting…" : "Submit for Review"}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Submissions are reviewed within 24 hours before appearing publicly.
            </p>
          </form>

          {/* Guide */}
          <div className="lg:col-span-2">
            <JanoshikGuide />
          </div>
        </div>
      </div>
    </div>
  );
}
