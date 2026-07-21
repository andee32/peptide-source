import { useState } from "react";
import { Link } from "wouter";
import {
  Users,
  CheckCircle2,
  XCircle,
  ExternalLink,
  FlaskConical,
  ChevronDown,
  ChevronUp,
  Search,
  PlusCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useListReviewerSubmissions,
  useGetReviewerSubmissionStats,
} from "@atlab/api-client-react";

type SortKey = "submittedAt" | "purityPercent" | "productName";
type SortDir = "asc" | "desc";

function PurityBadge({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return <span className="text-zinc-500 text-xs">—</span>;
  const pass = pct >= 98;
  return (
    <div className="flex items-center gap-1.5">
      {pass ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
      ) : (
        <XCircle className="h-4 w-4 text-red-400 shrink-0" />
      )}
      <span
        className={`font-mono text-sm font-semibold ${pass ? "text-emerald-400" : "text-red-400"}`}
      >
        {pct.toFixed(1)}%
      </span>
      <Badge
        variant="outline"
        className={`text-[10px] uppercase tracking-wider font-mono ${
          pass
            ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
            : "border-red-500/30 text-red-400 bg-red-500/10"
        }`}
      >
        {pass ? "Pass" : "Fail"}
      </Badge>
    </div>
  );
}

function PlatformBadge({ platform }: { platform: string }) {
  const colors: Record<string, string> = {
    reddit: "text-orange-400 border-orange-500/30 bg-orange-500/10",
    discord: "text-indigo-400 border-indigo-500/30 bg-indigo-500/10",
    other: "text-zinc-400 border-zinc-500/30 bg-zinc-500/10",
  };
  return (
    <Badge
      variant="outline"
      className={`text-[10px] uppercase tracking-wider font-mono ${colors[platform] ?? colors.other}`}
    >
      {platform}
    </Badge>
  );
}

function SortButton({
  label,
  sortKey,
  current,
  dir,
  onClick,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onClick: () => void;
}) {
  const active = current === sortKey;
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 text-xs font-mono uppercase tracking-wider transition-colors ${
        active ? "text-primary" : "text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {label}
      {active ? (
        dir === "asc" ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )
      ) : (
        <ChevronDown className="h-3 w-3 opacity-30" />
      )}
    </button>
  );
}

export function ReviewersPage() {
  const { data: submissions, isLoading } = useListReviewerSubmissions();
  const { data: stats } = useGetReviewerSubmissionStats();

  const [search, setSearch] = useState("");
  const [filterProduct, setFilterProduct] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("submittedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const approvedCount = stats?.approvedCount ?? 0;

  const productNames = Array.from(
    new Set((submissions ?? []).map((s) => s.productName))
  ).sort();

  const filtered = (submissions ?? [])
    .filter((s) => {
      const matchSearch =
        search === "" ||
        s.reviewerHandle.toLowerCase().includes(search.toLowerCase()) ||
        s.janoshikTaskId.toLowerCase().includes(search.toLowerCase()) ||
        s.productName.toLowerCase().includes(search.toLowerCase());
      const matchProduct =
        filterProduct === "all" || s.productName === filterProduct;
      return matchSearch && matchProduct;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortKey === "submittedAt") {
        cmp =
          new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
      } else if (sortKey === "purityPercent") {
        cmp = (a.purityPercent ?? -1) - (b.purityPercent ?? -1);
      } else if (sortKey === "productName") {
        cmp = a.productName.localeCompare(b.productName);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="container mx-auto px-4 py-16 max-w-6xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-12">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-xs font-mono uppercase tracking-widest mb-4 border border-primary/20">
              <Users className="h-3.5 w-3.5" />
              Community Ledger
            </div>
            <h1 className="text-4xl font-bold tracking-tight mb-2">
              Independent Verifications
            </h1>
            <p className="text-muted-foreground max-w-xl">
              Third-party researchers independently test our products and submit
              their Janoshik results here. Every entry is admin-verified before
              appearing.
            </p>
          </div>
          <Button
            asChild
            className="font-mono uppercase tracking-widest text-xs shrink-0"
          >
            <Link href="/reviewers/submit">
              <PlusCircle className="h-4 w-4 mr-2" />
              Submit Results
            </Link>
          </Button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-10">
          <div className="bg-card border border-border p-5 rounded-xl text-center">
            <div className="font-mono font-black text-4xl text-primary mb-1">
              {approvedCount}+
            </div>
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
              Verified Results
            </div>
          </div>
          <div className="bg-card border border-border p-5 rounded-xl text-center">
            <div className="font-mono font-black text-4xl text-primary mb-1">
              100%
            </div>
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
              Purity Confirmation
            </div>
          </div>
          <div className="hidden sm:block bg-card border border-border p-5 rounded-xl text-center">
            <div className="font-mono font-black text-4xl text-primary mb-1">
              5
            </div>
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
              3rd Party Labs Used
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by handle, product, or Task ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-card border-border font-mono text-sm"
            />
          </div>
          <Select value={filterProduct} onValueChange={setFilterProduct}>
            <SelectTrigger className="w-full sm:w-48 bg-card border-border font-mono text-sm">
              <SelectValue placeholder="All Products" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Products</SelectItem>
              {productNames.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Sort bar */}
        <div className="hidden sm:flex items-center gap-6 px-4 py-2.5 bg-secondary/30 border border-border rounded-t-lg text-xs">
          <div className="w-36 shrink-0">Reviewer</div>
          <div className="flex-1">
            <SortButton
              label="Product"
              sortKey="productName"
              current={sortKey}
              dir={sortDir}
              onClick={() => toggleSort("productName")}
            />
          </div>
          <div className="w-28 shrink-0">Task ID</div>
          <div className="w-28 shrink-0">
            <SortButton
              label="Purity"
              sortKey="purityPercent"
              current={sortKey}
              dir={sortDir}
              onClick={() => toggleSort("purityPercent")}
            />
          </div>
          <div className="w-28 shrink-0 text-right">
            <SortButton
              label="Date"
              sortKey="submittedAt"
              current={sortKey}
              dir={sortDir}
              onClick={() => toggleSort("submittedAt")}
            />
          </div>
        </div>

        {/* Table body */}
        {isLoading ? (
          <div className="space-y-2">
            {Array(5)
              .fill(0)
              .map((_, i) => (
                <Skeleton key={i} className="h-16 w-full bg-secondary/50" />
              ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="border border-border border-t-0 rounded-b-lg p-16 text-center">
            <FlaskConical className="h-10 w-10 text-muted-foreground/40 mx-auto mb-4" />
            <p className="text-muted-foreground text-sm">
              {submissions?.length === 0
                ? "No community verifications yet — be the first to submit!"
                : "No results match your filter."}
            </p>
          </div>
        ) : (
          <div className="border border-border border-t-0 sm:border-t-0 rounded-b-lg divide-y divide-border overflow-hidden">
            {filtered.map((s) => (
              <div
                key={s.id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-4 py-4 bg-card hover:bg-secondary/20 transition-colors"
              >
                {/* Handle + platform */}
                <div className="w-36 shrink-0 flex flex-col gap-1">
                  <span className="font-mono text-sm text-white font-medium truncate">
                    {s.reviewerHandle}
                  </span>
                  <PlatformBadge platform={s.platform} />
                </div>

                {/* Product */}
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-zinc-200 truncate block">
                    {s.productName}
                  </span>
                </div>

                {/* Task ID */}
                <div className="w-28 shrink-0">
                  <a
                    href={`https://janoshik.com/task/${s.janoshikTaskId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    {s.janoshikTaskId}
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </a>
                </div>

                {/* Purity */}
                <div className="w-28 shrink-0">
                  <PurityBadge pct={s.purityPercent} />
                </div>

                {/* Date */}
                <div className="w-28 shrink-0 text-right">
                  <span className="font-mono text-xs text-zinc-500">
                    {new Date(s.submittedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer note */}
        <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
          <span>
            All entries are independently submitted and admin-verified. Task IDs
            link directly to Janoshik reports.
          </span>
        </div>
      </div>
    </div>
  );
}
