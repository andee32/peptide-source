import { useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle, AlertCircle, Clock } from "lucide-react";
import { JanoshikBadge } from "./JanoshikBadge";
import { useAnalytics } from "@/contexts/analytics";
import type { BatchDetail } from "@atlab/api-client-react";

interface CoaVisualizationProps {
  batch: BatchDetail;
  productName?: string;
}

function PendingCard({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 text-center py-6">
      <div className="w-16 h-16 border-2 border-dashed border-muted-foreground/20 rounded-full flex items-center justify-center">
        <Clock className="h-7 w-7 text-muted-foreground/30" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-mono uppercase tracking-widest">PENDING</p>
        <p className="text-xs text-muted-foreground/60 mt-0.5">{label} not yet submitted</p>
      </div>
    </div>
  );
}

export function CoaVisualization({ batch, productName }: CoaVisualizationProps) {
  const { trackEvent } = useAnalytics();
  const sectionRef = useRef<HTMLDivElement>(null);
  const trackedRef = useRef(false);

  const purityResult = batch.coaResults.find(r => r.testType === "purity");
  const endotoxinResult = batch.coaResults.find(r => r.testType === "endotoxin");
  const sterilityResult = batch.coaResults.find(r => r.testType === "sterility");
  const heavyMetalsResult = batch.coaResults.find(r => r.testType === "heavyMetals");

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && !trackedRef.current) {
          trackedRef.current = true;
          trackEvent("Lab Result Viewed", {
            batchId: batch.id,
            productName: productName ?? "Unknown",
            purityPercent: purityResult?.purityPercent ?? null,
            labName: purityResult?.labName ?? null,
          });
        }
      },
      { threshold: 0.4 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [batch.id, productName, trackEvent]);

  const radius = 60;
  const circumference = 2 * Math.PI * radius;

  const renderPurity = () => {
    if (!purityResult || purityResult.purityPercent == null) {
      return <PendingCard label="Purity analysis" />;
    }

    const purity = purityResult.purityPercent;
    const offset = circumference - (purity / 100) * circumference;

    let purityColor = "text-red-500";
    let strokeColor = "stroke-red-500";
    if (purity >= 98) {
      purityColor = "text-primary";
      strokeColor = "stroke-primary";
    } else if (purity >= 95) {
      purityColor = "text-yellow-500";
      strokeColor = "stroke-yellow-500";
    }

    return (
      <>
        <div className="relative w-40 h-40 flex items-center justify-center mb-4">
          <svg className="w-full h-full transform -rotate-90 absolute inset-0">
            <circle cx="80" cy="80" r={radius} className="stroke-muted fill-none" strokeWidth="8" />
            <circle
              cx="80"
              cy="80"
              r={radius}
              className={`${strokeColor} fill-none transition-all duration-1000 ease-out`}
              strokeWidth="8"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute flex flex-col items-center justify-center">
            <span className={`text-4xl font-mono font-bold ${purityColor}`}>{purity}%</span>
            <span className="text-xs text-muted-foreground uppercase tracking-widest mt-1">Pure</span>
          </div>
        </div>
        {purity >= 98 ? (
          <Badge className="mb-2 bg-primary/20 text-primary border-primary/30 gap-1 font-mono text-xs">
            <CheckCircle2 className="h-3 w-3" /> PASS — {purity}% Pure
          </Badge>
        ) : (
          <Badge className="mb-2 bg-destructive/20 text-destructive border-destructive/30 gap-1 font-mono text-xs">
            <AlertCircle className="h-3 w-3" /> FAIL — Below 98% threshold
          </Badge>
        )}
        <div className="space-y-1 mt-1">
          <p className="text-xs text-muted-foreground">
            Lab: {purityResult.labName} · Tested: {new Date(purityResult.testedAt).toLocaleDateString()}
          </p>
          <JanoshikBadge taskId={purityResult.janoshikTaskId} variant="inline" />
        </div>
      </>
    );
  };

  const renderEndotoxin = () => {
    if (!endotoxinResult || endotoxinResult.endotoxinEuPerMl == null) {
      return <PendingCard label="Endotoxin test" />;
    }

    const endotoxin = endotoxinResult.endotoxinEuPerMl;
    const isPass = endotoxin < 1.0;

    return (
      <>
        <div className="flex items-end justify-between mb-2">
          <span className="font-mono text-2xl font-bold">
            {endotoxin.toFixed(3)} <span className="text-sm text-muted-foreground font-sans">EU/mL</span>
          </span>
          <span className="text-xs text-muted-foreground">Limit: &lt;1.0 EU/mL</span>
        </div>
        <Progress value={Math.min((endotoxin / 1.0) * 100, 100)} className="h-2 mb-2" />
        {isPass ? (
          <Badge className="mb-2 bg-primary/20 text-primary border-primary/30 gap-1 font-mono text-xs">
            <CheckCircle2 className="h-3 w-3" /> PASS — Below limit
          </Badge>
        ) : (
          <Badge className="mb-2 bg-destructive/20 text-destructive border-destructive/30 gap-1 font-mono text-xs">
            <AlertCircle className="h-3 w-3" /> FAIL — Exceeds limit
          </Badge>
        )}
        <div className="mt-2 space-y-1">
          <p className="text-xs text-muted-foreground">
            Lab: {endotoxinResult.labName} · Tested: {new Date(endotoxinResult.testedAt).toLocaleDateString()}
          </p>
          <JanoshikBadge taskId={endotoxinResult.janoshikTaskId} variant="inline" />
        </div>
      </>
    );
  };

  const renderSterility = () => {
    if (!sterilityResult || sterilityResult.sterilityPass == null) {
      return <PendingCard label="Sterility test" />;
    }

    const isSterile = sterilityResult.sterilityPass === true;

    return (
      <>
        <div className={`flex items-center gap-3 p-4 rounded-lg border ${isSterile ? 'bg-primary/5 border-primary/20 text-primary' : 'bg-destructive/5 border-destructive/20 text-destructive'}`}>
          {isSterile ? <CheckCircle2 className="h-8 w-8" /> : <XCircle className="h-8 w-8" />}
          <div>
            <div className="font-mono text-xl font-bold">{isSterile ? 'STERILE ✓ PASS' : 'FAILED'}</div>
            <div className="text-xs opacity-70">
              Lab: {sterilityResult.labName} · Tested: {new Date(sterilityResult.testedAt).toLocaleDateString()}
            </div>
          </div>
        </div>
        <JanoshikBadge taskId={sterilityResult.janoshikTaskId} variant="inline" className="mt-2" />
      </>
    );
  };

  return (
    <div ref={sectionRef}>
    <Card className="border-primary/20 bg-card overflow-hidden">
      <CardHeader className="border-b border-border/50 bg-secondary/20 pb-4">
        <CardTitle className="font-mono text-lg flex items-center justify-between">
          <span>LAB RESULTS — BATCH #{batch.id}</span>
          <Badge variant="outline" className={batch.status === 'released' ? 'text-primary border-primary/50' : 'text-yellow-500 border-yellow-500/50'}>
            {batch.status.toUpperCase()}
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="p-0">
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border/50">

          {/* PURITY GAUGE */}
          <div className="p-6 flex flex-col items-center justify-center text-center">
            <h3 className="text-sm font-semibold tracking-widest text-muted-foreground uppercase mb-6">HPLC Analysis (Purity)</h3>
            {renderPurity()}
          </div>

          <div className="flex flex-col divide-y divide-border/50">
            {/* ENDOTOXIN */}
            <div className="p-6">
              <h3 className="text-sm font-semibold tracking-widest text-muted-foreground uppercase mb-4">Bacterial Endotoxin Test (LAL)</h3>
              {renderEndotoxin()}
            </div>

            {/* STERILITY */}
            <div className="p-6">
              <h3 className="text-sm font-semibold tracking-widest text-muted-foreground uppercase mb-4">Sterility (USP &lt;71&gt;)</h3>
              {renderSterility()}
            </div>
          </div>
        </div>

        {/* HEAVY METALS */}
        {heavyMetalsResult?.heavyMetals && Array.isArray(heavyMetalsResult.heavyMetals) && heavyMetalsResult.heavyMetals.length > 0 && (
          <div className="border-t border-border/50 p-6 bg-muted/20">
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-sm font-semibold tracking-widest text-muted-foreground uppercase">Heavy Metals Analysis</h3>
              <p className="text-xs text-muted-foreground font-mono">
                {heavyMetalsResult.labName} · {new Date(heavyMetalsResult.testedAt).toLocaleDateString()}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left font-medium text-muted-foreground pb-2">Element</th>
                    <th className="text-right font-medium text-muted-foreground pb-2">Result (ppm)</th>
                    <th className="text-right font-medium text-muted-foreground pb-2">Limit (ppm)</th>
                    <th className="text-right font-medium text-muted-foreground pb-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20 font-mono">
                  {(heavyMetalsResult.heavyMetals as Array<{ element: string; resultPpm: number; limitPpm: number; pass: boolean }>).map((hm, idx) => (
                    <tr key={idx}>
                      <td className="py-3 text-foreground font-sans">{hm.element}</td>
                      <td className="py-3 text-right">{hm.resultPpm}</td>
                      <td className="py-3 text-right text-muted-foreground">{hm.limitPpm}</td>
                      <td className="py-3 text-right">
                        {hm.pass ? (
                          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 ml-auto block w-fit">PASS</Badge>
                        ) : (
                          <Badge variant="destructive" className="ml-auto block w-fit">FAIL</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {heavyMetalsResult.janoshikTaskId && (
              <JanoshikBadge taskId={heavyMetalsResult.janoshikTaskId} variant="inline" className="mt-3" />
            )}
          </div>
        )}

        {/* FOOTER VERIFICATION */}
        <div className="border-t border-border/50 p-4 bg-secondary/50">
          <JanoshikBadge variant="footer" />
        </div>
      </CardContent>
    </Card>
    </div>
  );
}
