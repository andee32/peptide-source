import { useState, useEffect, useRef } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck,
  Search,
  QrCode,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Download,
  Package,
  Calendar,
  FlaskConical,
  ExternalLink,
} from "lucide-react";
import { Link } from "wouter";
import { useGetBatch } from "@atlab/api-client-react";
import { CoaVisualization } from "@/components/coa/CoaVisualization";
import { useAnalytics } from "@/contexts/analytics";
import { format } from "date-fns";

function BatchStatusBadge({ status, isDemo }: { status: string; isDemo?: boolean }) {
  if (isDemo) {
    return (
      <Badge className="bg-yellow-500/15 text-yellow-500 border-yellow-500/40 gap-2 px-4 py-1.5 text-sm font-mono">
        <AlertTriangle className="h-4 w-4" />
        DEMO — NOT A REAL COA
      </Badge>
    );
  }
  if (status === "released") {
    return (
      <Badge className="bg-primary/20 text-primary border-primary/30 gap-2 px-4 py-1.5 text-sm font-mono">
        <CheckCircle2 className="h-4 w-4" />
        RELEASED — VERIFIED
      </Badge>
    );
  }
  if (status === "quarantined") {
    return (
      <Badge className="bg-destructive/20 text-destructive border-destructive/30 gap-2 px-4 py-1.5 text-sm font-mono">
        <AlertTriangle className="h-4 w-4" />
        QUARANTINED
      </Badge>
    );
  }
  return (
    <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 gap-2 px-4 py-1.5 text-sm font-mono">
      <Clock className="h-4 w-4" />
      PENDING ANALYSIS
    </Badge>
  );
}

function BatchDetailView({ batchId, source }: { batchId: string; source: string }) {
  const { data: batch, isLoading, isError, error } = useGetBatch(batchId);
  const { trackEvent } = useAnalytics();
  const trackedBatchRef = useRef<string | null>(null);

  useEffect(() => {
    if (batch && trackedBatchRef.current !== batch.id) {
      trackedBatchRef.current = batch.id;
      trackEvent("Verification Scan", {
        batchId: batch.id,
        productId: batch.productId,
        status: batch.status,
        purityPercent: batch.purityPercent,
        source,
      });
    }
  }, [batch, source, trackEvent]);

  if (isLoading) {
    return (
      <Card className="mt-8 border-primary/30 bg-card overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-primary via-primary/60 to-primary/20 w-full animate-pulse" />
        <CardContent className="p-12 text-center">
          <div className="relative mx-auto w-16 h-16 mb-6">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 rounded-full border-2 border-t-primary animate-spin" />
            <FlaskConical className="absolute inset-0 m-auto h-7 w-7 text-primary/60" />
          </div>
          <h2 className="text-2xl font-mono font-bold mb-2">Batch #{batchId}</h2>
          <p className="text-muted-foreground">
            Querying Janoshik Analytical secure database…
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    const is404 =
      error && typeof error === "object" && "status" in error && (error as { status: number }).status === 404;

    return (
      <Card className="mt-8 border-destructive/30 bg-card overflow-hidden">
        <div className="h-1 bg-destructive w-full" />
        <CardContent className="p-12 text-center">
          <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-6 border border-destructive/20">
            <AlertTriangle className="h-7 w-7 text-destructive" />
          </div>
          <h2 className="text-2xl font-mono font-bold mb-2">Batch Not Found</h2>
          <p className="text-muted-foreground mb-2">
            {is404
              ? `No batch record exists for ID "${batchId}".`
              : "An error occurred retrieving this batch. Please try again."}
          </p>
          <p className="text-sm text-muted-foreground/60 font-mono mb-8">
            Double-check the batch ID printed on your product label.
          </p>
          <Button asChild variant="outline" className="font-mono">
            <Link href="/verify">Try Another Batch</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!batch) return null;

  return (
    <div className="mt-8 space-y-6">
      {batch.isDemo && (
        <div className="rounded-lg border-2 border-yellow-500/50 bg-yellow-500/10 p-4 text-left flex items-start gap-3">
          <AlertTriangle className="h-6 w-6 text-yellow-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-mono font-bold text-yellow-500 uppercase tracking-wide text-sm mb-1">
              Sample / demonstration data
            </p>
            <p className="text-sm text-muted-foreground">
              This is not a verified certificate of analysis. The values below are
              placeholder demo data. Real third-party COAs replace this before launch.
            </p>
          </div>
        </div>
      )}
      <Card className="border-primary/30 bg-card overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-primary to-primary/40 w-full" />
        <CardContent className="p-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Package className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground font-mono">{batch.productName}</span>
              </div>
              <h2 className="text-3xl font-mono font-bold tracking-tight">
                {batch.id}
              </h2>
            </div>
            <BatchStatusBadge status={batch.status} isDemo={batch.isDemo} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div className="bg-secondary/40 rounded-lg p-3 border border-border/30">
              <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                <Calendar className="h-3.5 w-3.5" />
                <span className="text-xs uppercase tracking-wider">Production Date</span>
              </div>
              <span className="font-mono font-semibold">
                {format(new Date(batch.productionDate), "MMM d, yyyy")}
              </span>
            </div>

            <div className="bg-secondary/40 rounded-lg p-3 border border-border/30">
              <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                <FlaskConical className="h-3.5 w-3.5" />
                <span className="text-xs uppercase tracking-wider">Tests Performed</span>
              </div>
              <span className="font-mono font-semibold">{batch.coaResults.length}</span>
            </div>

            <div className="bg-secondary/40 rounded-lg p-3 border border-border/30">
              <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span className="text-xs uppercase tracking-wider">Lab Partner</span>
              </div>
              <span className="font-mono font-semibold text-xs">Janoshik Analytical</span>
            </div>
          </div>

          {batch.notes && (
            <div className="mt-4 p-3 bg-secondary/30 rounded-lg border border-border/30 text-sm text-muted-foreground font-mono">
              {batch.notes}
            </div>
          )}

          <div className="flex flex-wrap gap-3 mt-6 pt-6 border-t border-border/30">
            {batch.hasCoaFile && (
              <Button asChild variant="default" size="sm" className="font-mono gap-2">
                <a href={`/api/batches/${batch.id}/coa-file`}>
                  <Download className="h-4 w-4" />
                  Download COA
                </a>
              </Button>
            )}

            <Button asChild variant="outline" size="sm" className="font-mono gap-2">
              <a href={`/api/batches/${batch.id}/qr`} download={`batch-${batch.id}-qr.png`}>
                <Download className="h-4 w-4" />
                Download QR Code
              </a>
            </Button>

            {batch.coaResults.some(c => c.janoshikTaskId) && (
              <Button asChild variant="ghost" size="sm" className="font-mono gap-2">
                <a
                  href={`https://janoshik.com/results/${batch.coaResults.find(c => c.janoshikTaskId)?.janoshikTaskId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-4 w-4" />
                  View on Janoshik
                </a>
              </Button>
            )}

            <Button asChild variant="ghost" size="sm" className="font-mono gap-2">
              <Link href={`/shop/${batch.productId}`}>
                <Package className="h-4 w-4" />
                Product Page
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {batch.coaResults.length > 0 ? (
        <CoaVisualization batch={batch} productName={batch.productName} />
      ) : (
        <Card className="border-border/30 bg-card/50">
          <CardContent className="p-8 text-center text-muted-foreground">
            <FlaskConical className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p className="font-mono text-sm">
              Laboratory analysis is in progress. COA reports will appear here once testing is complete.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="text-center pt-2">
        <Button asChild variant="link" className="font-mono text-muted-foreground gap-2">
          <Link href="/verify">
            <Search className="h-4 w-4" />
            Verify Another Batch
          </Link>
        </Button>
      </div>
    </div>
  );
}

function SearchForm() {
  const [searchValue, setSearchValue] = useState("");
  const [, navigate] = useLocation();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchValue.trim();
    if (trimmed) {
      navigate(`/verify/${encodeURIComponent(trimmed)}`);
    }
  };

  return (
    <>
      <p className="text-lg text-muted-foreground mb-12">
        Enter your batch ID to access full purity, endotoxin, and sterility
        reports verified by third-party laboratories.
      </p>

      <Card className="p-2 bg-card/80 backdrop-blur border-border/50 shadow-2xl mb-8">
        <form className="flex gap-2" onSubmit={handleSubmit}>
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Enter Batch ID (e.g. SEM-2025-001)"
              className="h-14 pl-12 text-lg font-mono bg-transparent border-none focus-visible:ring-0"
              autoFocus
            />
          </div>
          <Button
            type="submit"
            size="lg"
            disabled={!searchValue.trim()}
            className="h-14 px-8 font-mono tracking-widest"
          >
            LOOKUP BATCH
          </Button>
        </form>
      </Card>

      <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
        <div className="relative flex items-center justify-center w-8 h-8">
          <QrCode className="h-5 w-5 relative z-10" />
          <span className="absolute inset-0 rounded-md border border-primary/40 animate-ping opacity-60" />
          <span className="absolute inset-0 rounded-md border border-primary/20 animate-ping opacity-30 delay-150" style={{ animationDelay: "0.3s" }} />
        </div>
        <span>Scan the QR code on your product packaging to verify your specific batch.</span>
      </div>

      <div className="mt-16 grid grid-cols-3 gap-4 text-center text-sm max-w-lg mx-auto">
        {[
          { icon: FlaskConical, label: "Purity Analysis", sub: "HPLC / MS grade" },
          { icon: ShieldCheck, label: "Endotoxin Testing", sub: "LAL method" },
          { icon: CheckCircle2, label: "Sterility Verification", sub: "USP <71>" },
        ].map(({ icon: Icon, label, sub }) => (
          <div key={label} className="p-4 bg-card/50 rounded-xl border border-border/30">
            <Icon className="h-5 w-5 text-primary mx-auto mb-2" />
            <div className="font-semibold text-xs">{label}</div>
            <div className="text-muted-foreground text-xs font-mono mt-0.5">{sub}</div>
          </div>
        ))}
      </div>
    </>
  );
}

export function VerifyPage() {
  const { id } = useParams<{ id?: string }>();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const source = params.get("source") ?? "manual";

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center p-4 py-24 bg-background">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary/5 via-background to-background pointer-events-none" />

      <div className="max-w-2xl w-full relative z-10 text-center">
        <div className="mx-auto w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-8 border border-primary/20">
          <ShieldCheck className="h-10 w-10 text-primary" />
        </div>

        <h1 className="text-4xl font-bold tracking-tight mb-4">
          Batch Verification Portal
        </h1>

        {id ? (
          <BatchDetailView batchId={id} source={source} />
        ) : (
          <SearchForm />
        )}
      </div>
    </div>
  );
}
