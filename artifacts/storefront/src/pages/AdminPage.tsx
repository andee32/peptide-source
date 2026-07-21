import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ShieldCheck,
  LogOut,
  Plus,
  FlaskConical,
  Trash2,
  ChevronRight,
  CheckCircle2,
  Clock,
  AlertTriangle,
  QrCode,
  RefreshCw,
  ArrowLeft,
  Download,
  Pencil,
  Package,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Star,
} from "lucide-react";
import { format } from "date-fns";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

type BatchStatus = "pending" | "released" | "quarantined";
type TestType = "purity" | "endotoxin" | "sterility" | "heavyMetals";
type ReviewerStatus = "pending" | "approved" | "rejected";
type AdminTab = "batches" | "reviewers" | "subscriptions" | "products";

type ReviewerSubmission = {
  id: number;
  reviewerHandle: string;
  platform: string;
  janoshikTaskId: string;
  productId: number;
  productName: string;
  purityPercent: number | null;
  notes: string | null;
  status: ReviewerStatus;
  submittedAt: string;
  reviewedAt: string | null;
};

type AdminCoaResult = {
  id: string;
  testType: TestType;
  purityPercent: number | null;
  endotoxinEuPerMl: number | null;
  sterilityPass: boolean | null;
  heavyMetals: Array<{ element: string; resultPpm: number; limitPpm: number; pass: boolean }> | null;
  labName: string;
  testedAt: string;
  janoshikTaskId: string | null;
};

type AdminBatch = {
  id: string;
  productId: number;
  productName: string;
  productionDate: string;
  status: BatchStatus;
  notes: string | null;
  coaResults: AdminCoaResult[];
};

type CategoryValue = "metabolic" | "longevity" | "recovery" | "cognitive" | "other";

type AdminVariant = {
  id: number;
  productId: number;
  name: string;
  concentration: string;
  sizeml: number;
  priceCents: number;
  sku: string;
  inStock: boolean;
};

type AdminProduct = {
  id: number;
  name: string;
  slug: string;
  category: CategoryValue;
  shortDescription: string;
  longDescription: string;
  featured: boolean;
  published: boolean;
  imageUrl: string | null;
  researchUses: string[];
  variants: AdminVariant[];
};

function adminFetch<T = unknown>(
  path: string,
  adminKey: string,
  options?: RequestInit,
): Promise<T> {
  return fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-admin-key": adminKey,
      ...(options?.headers ?? {}),
    },
  }).then(async (res) => {
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message ?? `HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
  });
}

function StatusBadge({ status }: { status: BatchStatus }) {
  if (status === "released")
    return (
      <Badge className="bg-primary/20 text-primary border-primary/30 gap-1 font-mono text-xs">
        <CheckCircle2 className="h-3 w-3" /> Released
      </Badge>
    );
  if (status === "quarantined")
    return (
      <Badge className="bg-destructive/20 text-destructive border-destructive/30 gap-1 font-mono text-xs">
        <AlertTriangle className="h-3 w-3" /> Quarantined
      </Badge>
    );
  return (
    <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 gap-1 font-mono text-xs">
      <Clock className="h-3 w-3" /> Pending
    </Badge>
  );
}

function LoginForm({ onLogin }: { onLogin: (key: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? "Invalid credentials");
      }
      const { token } = await res.json() as { token: string };
      sessionStorage.setItem("admin_key", token);
      onLogin(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center border border-primary/20">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="font-bold text-sm">The Lab Standard</div>
            <div className="text-muted-foreground text-xs font-mono">Admin Portal</div>
          </div>
        </div>

        <Card className="border-border/50">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="admin-email" className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Email
                </Label>
                <Input
                  id="admin-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className="mt-1.5"
                  autoFocus
                  autoComplete="email"
                />
              </div>
              <div>
                <Label htmlFor="admin-password" className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Password
                </Label>
                <Input
                  id="admin-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1.5"
                  autoComplete="current-password"
                />
              </div>
              {error && (
                <p className="text-destructive text-sm">{error}</p>
              )}
              <Button type="submit" className="w-full font-mono" disabled={loading || !email || !password}>
                {loading ? "Authenticating…" : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CreateBatchDialog({
  open,
  onClose,
  products,
  adminKey,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  products: AdminProduct[];
  adminKey: string;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    id: "",
    productId: "",
    productionDate: new Date().toISOString().split("T")[0],
    status: "pending" as BatchStatus,
    notes: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await adminFetch("/admin/batches", adminKey, {
        method: "POST",
        body: JSON.stringify({
          ...form,
          productId: parseInt(form.productId),
        }),
      });
      onCreated();
      onClose();
      setForm({ id: "", productId: "", productionDate: new Date().toISOString().split("T")[0], status: "pending", notes: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create batch");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono">Create New Batch</DialogTitle>
          <DialogDescription>Add a new production batch to the system.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Batch ID</Label>
            <Input
              value={form.id}
              onChange={(e) => setForm(f => ({ ...f, id: e.target.value }))}
              placeholder="e.g. SEM-2025-006"
              className="mt-1.5 font-mono"
              required
            />
          </div>
          <div>
            <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Product</Label>
            <Select value={form.productId} onValueChange={(v) => setForm(f => ({ ...f, productId: v }))}>
              <SelectTrigger className="mt-1.5 font-mono">
                <SelectValue placeholder="Select product" />
              </SelectTrigger>
              <SelectContent>
                {products.map(p => (
                  <SelectItem key={p.id} value={String(p.id)} className="font-mono">{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Production Date</Label>
            <Input
              type="date"
              value={form.productionDate}
              onChange={(e) => setForm(f => ({ ...f, productionDate: e.target.value }))}
              className="mt-1.5 font-mono"
              required
            />
          </div>
          <div>
            <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v as BatchStatus }))}>
              <SelectTrigger className="mt-1.5 font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending" className="font-mono">Pending</SelectItem>
                <SelectItem value="released" className="font-mono">Released</SelectItem>
                <SelectItem value="quarantined" className="font-mono">Quarantined</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Notes (optional)</Label>
            <Input
              value={form.notes}
              onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Internal notes…"
              className="mt-1.5 font-mono"
            />
          </div>
          {error && <p className="text-destructive text-sm font-mono">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1 font-mono" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex-1 font-mono" disabled={loading || !form.id || !form.productId}>
              {loading ? "Creating…" : "Create Batch"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type HeavyMetalRow = { element: string; resultPpm: string; limitPpm: string; pass: boolean };

const DEFAULT_HEAVY_METAL_ROW: HeavyMetalRow = { element: "", resultPpm: "", limitPpm: "", pass: true };

function AddCoaDialog({
  open,
  onClose,
  batchId,
  adminKey,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  batchId: string;
  adminKey: string;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    id: "",
    testType: "purity" as TestType,
    purityPercent: "",
    endotoxinEuPerMl: "",
    sterilityPass: "" as "" | "true" | "false",
    labName: "Janoshik Analytical",
    testedAt: new Date().toISOString().split("T")[0],
    janoshikTaskId: "",
  });
  const [heavyMetalRows, setHeavyMetalRows] = useState<HeavyMetalRow[]>([{ ...DEFAULT_HEAVY_METAL_ROW }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const resetForm = () => {
    setForm({
      id: "", testType: "purity", purityPercent: "", endotoxinEuPerMl: "",
      sterilityPass: "", labName: "Janoshik Analytical",
      testedAt: new Date().toISOString().split("T")[0], janoshikTaskId: "",
    });
    setHeavyMetalRows([{ ...DEFAULT_HEAVY_METAL_ROW }]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        id: form.id,
        testType: form.testType,
        labName: form.labName,
        testedAt: form.testedAt,
        janoshikTaskId: form.janoshikTaskId || null,
        purityPercent: null,
        endotoxinEuPerMl: null,
        sterilityPass: null,
        heavyMetals: null,
      };

      if (form.testType === "purity" && form.purityPercent) {
        body.purityPercent = parseFloat(form.purityPercent);
      }
      if (form.testType === "endotoxin" && form.endotoxinEuPerMl) {
        body.endotoxinEuPerMl = parseFloat(form.endotoxinEuPerMl);
      }
      if (form.testType === "sterility" && form.sterilityPass !== "") {
        body.sterilityPass = form.sterilityPass === "true";
      }
      if (form.testType === "heavyMetals") {
        const validRows = heavyMetalRows.filter(r => r.element.trim() && r.resultPpm && r.limitPpm);
        if (validRows.length === 0) {
          setError("Add at least one heavy metal element.");
          setLoading(false);
          return;
        }
        body.heavyMetals = validRows.map(r => ({
          element: r.element.trim(),
          resultPpm: parseFloat(r.resultPpm),
          limitPpm: parseFloat(r.limitPpm),
          pass: r.pass,
        }));
      }

      await adminFetch(`/admin/batches/${encodeURIComponent(batchId)}/coa`, adminKey, {
        method: "POST",
        body: JSON.stringify(body),
      });
      onCreated();
      onClose();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add COA result");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono">Add COA Result</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            Batch: {batchId}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">COA ID</Label>
            <Input
              value={form.id}
              onChange={(e) => setForm(f => ({ ...f, id: e.target.value }))}
              placeholder="e.g. COA-SEM-2025-001-PUR"
              className="mt-1.5 font-mono"
              required
            />
          </div>
          <div>
            <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Test Type</Label>
            <Select value={form.testType} onValueChange={(v) => setForm(f => ({ ...f, testType: v as TestType }))}>
              <SelectTrigger className="mt-1.5 font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="purity" className="font-mono">Purity (HPLC)</SelectItem>
                <SelectItem value="endotoxin" className="font-mono">Endotoxin (LAL)</SelectItem>
                <SelectItem value="sterility" className="font-mono">Sterility (USP &lt;71&gt;)</SelectItem>
                <SelectItem value="heavyMetals" className="font-mono">Heavy Metals</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.testType === "purity" && (
            <div>
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Purity %</Label>
              <Input
                type="number"
                min="0" max="100" step="0.01"
                value={form.purityPercent}
                onChange={(e) => setForm(f => ({ ...f, purityPercent: e.target.value }))}
                placeholder="e.g. 99.1"
                className="mt-1.5 font-mono"
              />
            </div>
          )}
          {form.testType === "endotoxin" && (
            <div>
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Endotoxin EU/mL</Label>
              <Input
                type="number"
                min="0" step="0.01"
                value={form.endotoxinEuPerMl}
                onChange={(e) => setForm(f => ({ ...f, endotoxinEuPerMl: e.target.value }))}
                placeholder="e.g. 0.2"
                className="mt-1.5 font-mono"
              />
            </div>
          )}
          {form.testType === "sterility" && (
            <div>
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Sterility Result</Label>
              <Select value={form.sterilityPass} onValueChange={(v) => setForm(f => ({ ...f, sterilityPass: v as "" | "true" | "false" }))}>
                <SelectTrigger className="mt-1.5 font-mono">
                  <SelectValue placeholder="Select result" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true" className="font-mono text-primary">Pass</SelectItem>
                  <SelectItem value="false" className="font-mono text-destructive">Fail</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {form.testType === "heavyMetals" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Elements</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="font-mono gap-1 h-7 text-xs"
                  onClick={() => setHeavyMetalRows(rows => [...rows, { ...DEFAULT_HEAVY_METAL_ROW }])}
                >
                  <Plus className="h-3 w-3" /> Add Element
                </Button>
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_80px_80px_48px_32px] gap-1.5 text-xs text-muted-foreground font-mono px-1">
                  <span>Element</span>
                  <span>Result (ppm)</span>
                  <span>Limit (ppm)</span>
                  <span>Pass</span>
                  <span />
                </div>
                {heavyMetalRows.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_80px_80px_48px_32px] gap-1.5 items-center">
                    <Input
                      value={row.element}
                      onChange={(e) => setHeavyMetalRows(rows => rows.map((r, i) => i === idx ? { ...r, element: e.target.value } : r))}
                      placeholder="e.g. Lead"
                      className="h-8 font-mono text-xs"
                    />
                    <Input
                      type="number" min="0" step="0.001"
                      value={row.resultPpm}
                      onChange={(e) => setHeavyMetalRows(rows => rows.map((r, i) => i === idx ? { ...r, resultPpm: e.target.value } : r))}
                      placeholder="0.01"
                      className="h-8 font-mono text-xs"
                    />
                    <Input
                      type="number" min="0" step="0.001"
                      value={row.limitPpm}
                      onChange={(e) => setHeavyMetalRows(rows => rows.map((r, i) => i === idx ? { ...r, limitPpm: e.target.value } : r))}
                      placeholder="0.1"
                      className="h-8 font-mono text-xs"
                    />
                    <div className="flex items-center justify-center">
                      <Checkbox
                        checked={row.pass}
                        onCheckedChange={(checked) => setHeavyMetalRows(rows => rows.map((r, i) => i === idx ? { ...r, pass: !!checked } : r))}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      disabled={heavyMetalRows.length === 1}
                      onClick={() => setHeavyMetalRows(rows => rows.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Separator />

          <div>
            <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Lab Name</Label>
            <Input
              value={form.labName}
              onChange={(e) => setForm(f => ({ ...f, labName: e.target.value }))}
              className="mt-1.5 font-mono"
            />
          </div>
          <div>
            <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Test Date</Label>
            <Input
              type="date"
              value={form.testedAt}
              onChange={(e) => setForm(f => ({ ...f, testedAt: e.target.value }))}
              className="mt-1.5 font-mono"
              required
            />
          </div>
          <div>
            <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Janoshik Task ID (optional)</Label>
            <Input
              value={form.janoshikTaskId}
              onChange={(e) => setForm(f => ({ ...f, janoshikTaskId: e.target.value }))}
              placeholder="e.g. JAN-90001"
              className="mt-1.5 font-mono"
            />
          </div>

          {error && <p className="text-destructive text-sm font-mono">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1 font-mono" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex-1 font-mono" disabled={loading || !form.id}>
              {loading ? "Adding…" : "Add COA Result"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UpdateStatusDialog({
  open,
  onClose,
  batch,
  adminKey,
  onUpdated,
}: {
  open: boolean;
  onClose: () => void;
  batch: AdminBatch;
  adminKey: string;
  onUpdated: () => void;
}) {
  const [status, setStatus] = useState<BatchStatus>(batch.status);
  const [notes, setNotes] = useState(batch.notes ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await adminFetch(`/admin/batches/${encodeURIComponent(batch.id)}`, adminKey, {
        method: "PUT",
        body: JSON.stringify({ status, notes: notes || undefined }),
      });
      onUpdated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update batch");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono">Update Batch</DialogTitle>
          <DialogDescription className="font-mono text-xs">{batch.id}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as BatchStatus)}>
              <SelectTrigger className="mt-1.5 font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending" className="font-mono">Pending</SelectItem>
                <SelectItem value="released" className="font-mono">Released</SelectItem>
                <SelectItem value="quarantined" className="font-mono">Quarantined</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Notes</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes…"
              className="mt-1.5 font-mono"
            />
          </div>
          {error && <p className="text-destructive text-sm font-mono">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1 font-mono" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex-1 font-mono" disabled={loading}>
              {loading ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const TEST_TYPE_LABELS: Record<TestType, string> = {
  purity: "Purity (HPLC)",
  endotoxin: "Endotoxin (LAL)",
  sterility: "Sterility",
  heavyMetals: "Heavy Metals",
};

function BatchDetailPanel({
  batch,
  adminKey,
  onBack,
  onRefresh,
}: {
  batch: AdminBatch;
  adminKey: string;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const [showAddCoa, setShowAddCoa] = useState(false);
  const [showUpdateStatus, setShowUpdateStatus] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDeleteCoa = async (coaId: string) => {
    if (!confirm(`Delete COA result "${coaId}"?`)) return;
    setDeletingId(coaId);
    try {
      await adminFetch(`/admin/coa/${encodeURIComponent(coaId)}`, adminKey, { method: "DELETE" });
      onRefresh();
    } catch {
      alert("Failed to delete COA result.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="font-mono gap-2">
          <ArrowLeft className="h-4 w-4" /> All Batches
        </Button>
      </div>

      <Card className="border-border/50">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="font-mono text-xl">{batch.id}</CardTitle>
              <p className="text-muted-foreground text-sm mt-1">{batch.productName}</p>
            </div>
            <StatusBadge status={batch.status} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-secondary/30 rounded-lg p-3 border border-border/20">
              <div className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-1">Production Date</div>
              <div className="font-mono font-semibold">{format(new Date(batch.productionDate), "MMM d, yyyy")}</div>
            </div>
            <div className="bg-secondary/30 rounded-lg p-3 border border-border/20">
              <div className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-1">COA Results</div>
              <div className="font-mono font-semibold">{batch.coaResults.length}</div>
            </div>
          </div>

          {batch.notes && (
            <div className="p-3 bg-secondary/20 rounded-lg border border-border/20 text-sm font-mono text-muted-foreground">
              {batch.notes}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="font-mono gap-2"
              onClick={() => setShowUpdateStatus(true)}
            >
              Update Status / Notes
            </Button>
            <Button asChild variant="outline" size="sm" className="font-mono gap-2">
              <a href={`/api/batches/${batch.id}/qr`} download={`${batch.id}-qr.png`}>
                <Download className="h-3.5 w-3.5" /> QR Code
              </a>
            </Button>
            <Button asChild variant="ghost" size="sm" className="font-mono gap-2">
              <a href={`/verify/${batch.id}`} target="_blank" rel="noopener noreferrer">
                <QrCode className="h-3.5 w-3.5" /> Public View
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="font-mono text-base flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-primary" />
              COA Results
            </CardTitle>
            <Button
              size="sm"
              className="font-mono gap-2"
              onClick={() => setShowAddCoa(true)}
            >
              <Plus className="h-4 w-4" /> Add COA
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {batch.coaResults.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm font-mono">
              No COA results yet. Click "Add COA" to add laboratory data.
            </div>
          ) : (
            <div className="space-y-3">
              {batch.coaResults.map((coa) => (
                <div
                  key={coa.id}
                  className="flex items-start justify-between p-3 rounded-lg border border-border/30 bg-secondary/20"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-semibold">
                        {TEST_TYPE_LABELS[coa.testType]}
                      </span>
                      {coa.testType === "sterility" && coa.sterilityPass !== null && (
                        <Badge className={coa.sterilityPass
                          ? "bg-primary/20 text-primary border-primary/30 text-xs font-mono"
                          : "bg-destructive/20 text-destructive border-destructive/30 text-xs font-mono"
                        }>
                          {coa.sterilityPass ? "PASS" : "FAIL"}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono space-y-0.5">
                      <div>ID: {coa.id}</div>
                      {coa.purityPercent !== null && <div>Purity: {coa.purityPercent}%</div>}
                      {coa.endotoxinEuPerMl !== null && <div>Endotoxin: {coa.endotoxinEuPerMl} EU/mL</div>}
                      <div>Lab: {coa.labName} · {format(new Date(coa.testedAt), "MMM d, yyyy")}</div>
                      {coa.janoshikTaskId && <div>Task: {coa.janoshikTaskId}</div>}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 ml-2 shrink-0"
                    disabled={deletingId === coa.id}
                    onClick={() => handleDeleteCoa(coa.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AddCoaDialog
        open={showAddCoa}
        onClose={() => setShowAddCoa(false)}
        batchId={batch.id}
        adminKey={adminKey}
        onCreated={() => { onRefresh(); }}
      />
      <UpdateStatusDialog
        open={showUpdateStatus}
        onClose={() => setShowUpdateStatus(false)}
        batch={batch}
        adminKey={adminKey}
        onUpdated={() => { onRefresh(); }}
      />
    </div>
  );
}

function ReviewerStatusBadge({ status }: { status: ReviewerStatus }) {
  if (status === "approved")
    return (
      <Badge className="bg-primary/20 text-primary border-primary/30 gap-1 font-mono text-xs">
        <CheckCircle2 className="h-3 w-3" /> Approved
      </Badge>
    );
  if (status === "rejected")
    return (
      <Badge className="bg-destructive/20 text-destructive border-destructive/30 gap-1 font-mono text-xs">
        <AlertTriangle className="h-3 w-3" /> Rejected
      </Badge>
    );
  return (
    <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 gap-1 font-mono text-xs">
      <Clock className="h-3 w-3" /> Pending
    </Badge>
  );
}

function ReviewerSubmissionsPanel({ adminKey }: { adminKey: string }) {
  const [submissions, setSubmissions] = useState<ReviewerSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actioningId, setActioningId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<ReviewerStatus | "all">("pending");
  const [adminNotesMap, setAdminNotesMap] = useState<Record<number, string>>({});

  const loadSubmissions = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await adminFetch<ReviewerSubmission[]>("/reviewer-submissions", adminKey);
      setSubmissions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load submissions");
    } finally {
      setLoading(false);
    }
  }, [adminKey]);

  useEffect(() => { void loadSubmissions(); }, []);

  async function handleAction(id: number, status: "approved" | "rejected") {
    setActioningId(id);
    const adminNotes = adminNotesMap[id] ?? "";
    try {
      await adminFetch(`/reviewer-submissions/${id}`, adminKey, {
        method: "PATCH",
        body: JSON.stringify({ status, adminNotes: adminNotes || undefined }),
      });
      setSubmissions((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, status, reviewedAt: new Date().toISOString() } : s
        )
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActioningId(null);
    }
  }

  const filtered =
    statusFilter === "all"
      ? submissions
      : submissions.filter((s) => s.status === statusFilter);

  const pendingCount = submissions.filter((s) => s.status === "pending").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reviewer Submissions</h1>
          <p className="text-muted-foreground text-sm mt-1 font-mono">
            {pendingCount} pending review
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="font-mono gap-2"
          onClick={() => void loadSubmissions()}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <div className="flex gap-2">
        {(["all", "pending", "approved", "rejected"] as const).map((s) => (
          <Button
            key={s}
            variant={statusFilter === s ? "default" : "outline"}
            size="sm"
            className="font-mono capitalize"
            onClick={() => setStatusFilter(s)}
          >
            {s === "all" ? "All" : s}
            {s === "pending" && pendingCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center h-4 w-4 rounded-full bg-yellow-400 text-black text-[10px] font-bold">
                {pendingCount}
              </span>
            )}
          </Button>
        ))}
      </div>

      {loading && submissions.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <AlertTriangle className="h-6 w-6 text-destructive mx-auto mb-2" />
          <p className="text-destructive text-sm font-mono">{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-border/30">
          <CardContent className="py-12 text-center text-muted-foreground font-mono text-sm">
            No submissions in this category.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => (
            <Card key={s.id} className="border-border/30">
              <CardContent className="p-5">
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-sm">
                        {s.reviewerHandle}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-[10px] font-mono uppercase tracking-wider"
                      >
                        {s.platform}
                      </Badge>
                      <ReviewerStatusBadge status={s.status} />
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">{s.productName}</span>
                      {s.purityPercent != null && (
                        <span className="ml-2 font-mono text-primary">
                          {s.purityPercent.toFixed(1)}% purity
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">Task ID:</span>
                      <a
                        href={`https://janoshik.com/task/${s.janoshikTaskId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-primary hover:underline"
                      >
                        {s.janoshikTaskId}
                      </a>
                    </div>
                    {s.notes && (
                      <p className="text-xs text-muted-foreground italic line-clamp-2">
                        "{s.notes}"
                      </p>
                    )}
                    <div className="text-[10px] text-muted-foreground font-mono">
                      Submitted {format(new Date(s.submittedAt), "MMM d, yyyy 'at' h:mm a")}
                      {s.reviewedAt && ` · Reviewed ${format(new Date(s.reviewedAt), "MMM d, yyyy")}`}
                    </div>
                  </div>

                  {s.status === "pending" && (
                    <div className="flex flex-col gap-3 shrink-0 sm:w-56">
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                          Admin Notes (optional)
                        </label>
                        <textarea
                          rows={2}
                          placeholder="Reason for approval/rejection…"
                          className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          value={adminNotesMap[s.id] ?? ""}
                          onChange={(e) =>
                            setAdminNotesMap((prev) => ({
                              ...prev,
                              [s.id]: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1 font-mono text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
                          disabled={actioningId === s.id}
                          onClick={() => void handleAction(s.id, "approved")}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 font-mono text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
                          disabled={actioningId === s.id}
                          onClick={() => void handleAction(s.id, "rejected")}
                        >
                          <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Dashboard({ adminKey, onLogout, initialTab = "batches" }: { adminKey: string; onLogout: () => void; initialTab?: AdminTab }) {
  const [batches, setBatches] = useState<AdminBatch[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedBatch, setSelectedBatch] = useState<AdminBatch | null>(null);
  const [showCreateBatch, setShowCreateBatch] = useState(false);
  const [statusFilter, setStatusFilter] = useState<BatchStatus | "all">("all");
  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [batchList, productList] = await Promise.all([
        adminFetch<AdminBatch[]>("/admin/batches", adminKey),
        adminFetch<AdminProduct[]>("/admin/products", adminKey),
      ]);
      if (isMounted.current) {
        setBatches(batchList);
        setProducts(productList);
        if (selectedBatch) {
          const updated = batchList.find(b => b.id === selectedBatch.id);
          if (updated) setSelectedBatch(updated);
        }
      }
    } catch (err) {
      if (isMounted.current) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      }
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [adminKey, selectedBatch]);

  useEffect(() => {
    void loadData();
  }, []);

  const filteredBatches = statusFilter === "all"
    ? batches
    : batches.filter(b => b.status === statusFilter);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-card/50 sticky top-0 z-10 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <span className="font-bold text-sm">Lab Standard</span>
            <span className="text-muted-foreground/60 text-sm font-mono">/</span>
            <span className="text-muted-foreground text-sm font-mono">Admin</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={loadData} className="font-mono gap-2">
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
            <Button variant="ghost" size="sm" onClick={onLogout} className="font-mono gap-2 text-muted-foreground">
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Tab bar */}
      <div className="border-b border-border/50 bg-card/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex gap-0">
          {([
            { key: "batches", label: "Batch Management" },
            { key: "reviewers", label: "Reviewer Submissions" },
            { key: "subscriptions", label: "Subscriptions" },
            { key: "products", label: "Products" },
          ] as { key: AdminTab; label: string }[]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setSelectedBatch(null); }}
              className={`px-5 py-3 text-sm font-mono font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {activeTab === "products" ? (
          <ProductsPanel adminKey={adminKey} />
        ) : activeTab === "reviewers" ? (
          <ReviewerSubmissionsPanel adminKey={adminKey} />
        ) : activeTab === "subscriptions" ? (
          <AdminSubscriptionsPanel adminKey={adminKey} />
        ) : loading && batches.length === 0 ? (
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground font-mono text-sm">Loading…</p>
            </div>
          </div>
        ) : error ? (
          <div className="text-center py-24">
            <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-3" />
            <p className="text-destructive font-mono text-sm">{error}</p>
            <Button variant="outline" size="sm" className="mt-4 font-mono" onClick={() => void loadData()}>
              Retry
            </Button>
          </div>
        ) : selectedBatch ? (
          <BatchDetailPanel
            batch={selectedBatch}
            adminKey={adminKey}
            onBack={() => setSelectedBatch(null)}
            onRefresh={() => void loadData()}
          />
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">Batch Management</h1>
                <p className="text-muted-foreground text-sm mt-1 font-mono">
                  {batches.length} batch{batches.length !== 1 ? "es" : ""} total
                </p>
              </div>
              <Button className="font-mono gap-2" onClick={() => setShowCreateBatch(true)}>
                <Plus className="h-4 w-4" />
                New Batch
              </Button>
            </div>

            <div className="flex gap-2">
              {(["all", "pending", "released", "quarantined"] as const).map((s) => (
                <Button
                  key={s}
                  variant={statusFilter === s ? "default" : "outline"}
                  size="sm"
                  className="font-mono capitalize"
                  onClick={() => setStatusFilter(s)}
                >
                  {s === "all" ? "All" : s}
                </Button>
              ))}
            </div>

            {filteredBatches.length === 0 ? (
              <Card className="border-border/30">
                <CardContent className="py-12 text-center text-muted-foreground font-mono text-sm">
                  No batches found.
                </CardContent>
              </Card>
            ) : (
              <Card className="border-border/30 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/30 hover:bg-transparent">
                      <TableHead className="font-mono text-xs uppercase tracking-wider">Batch ID</TableHead>
                      <TableHead className="font-mono text-xs uppercase tracking-wider">Product</TableHead>
                      <TableHead className="font-mono text-xs uppercase tracking-wider">Status</TableHead>
                      <TableHead className="font-mono text-xs uppercase tracking-wider">Production</TableHead>
                      <TableHead className="font-mono text-xs uppercase tracking-wider text-right">COAs</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBatches.map((batch) => (
                      <TableRow
                        key={batch.id}
                        className="border-border/20 cursor-pointer hover:bg-secondary/30"
                        onClick={() => setSelectedBatch(batch)}
                      >
                        <TableCell className="font-mono font-semibold text-sm">{batch.id}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{batch.productName}</TableCell>
                        <TableCell><StatusBadge status={batch.status} /></TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">
                          {format(new Date(batch.productionDate), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{batch.coaResults.length}</TableCell>
                        <TableCell>
                          <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </div>
        )}

        <CreateBatchDialog
          open={showCreateBatch}
          onClose={() => setShowCreateBatch(false)}
          products={products}
          adminKey={adminKey}
          onCreated={() => void loadData()}
        />
      </main>
    </div>
  );
}

interface AdminSubscription {
  id: number;
  customerEmail: string;
  customerName: string;
  status: "active" | "paused" | "cancelled";
  intervalDays: number;
  nextBillingDate: string;
  createdAt: string;
  planName: string;
  planSlug: string;
  planPriceCents: number;
}

interface AdminSubsData {
  total: number;
  active: number;
  paused: number;
  cancelled: number;
  renewingIn7Days: number;
  renewingIn30Days: number;
  subscriptions: AdminSubscription[];
}

function AdminSubscriptionsPanel({ adminKey }: { adminKey: string }) {
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
  const [data, setData] = useState<AdminSubsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actioningId, setActioningId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused" | "cancelled">("active");
  const [renewFilter, setRenewFilter] = useState<"all" | "7" | "30">("all");

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${BASE}/api/admin/subscriptions`, {
        headers: { "x-admin-key": adminKey },
      });
      if (!res.ok) throw new Error("Failed to load subscriptions");
      const d: AdminSubsData = await res.json();
      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading subscriptions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  const patchStatus = async (id: number, status: "active" | "paused" | "cancelled") => {
    setActioningId(id);
    try {
      const res = await fetch(`${BASE}/api/admin/subscriptions/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Update failed");
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error");
    } finally {
      setActioningId(null);
    }
  };

  const filteredSubs = (data?.subscriptions ?? []).filter((s) => {
    const statusOk = statusFilter === "all" || s.status === statusFilter;
    if (!statusOk) return false;
    if (renewFilter === "7") {
      return new Date(s.nextBillingDate) <= new Date(Date.now() + 7 * 86400000);
    }
    if (renewFilter === "30") {
      return new Date(s.nextBillingDate) <= new Date(Date.now() + 30 * 86400000);
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="text-center py-24">
        <p className="text-destructive font-mono text-sm mb-3">{error}</p>
        <Button variant="outline" size="sm" onClick={() => void loadData()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total", value: data?.total ?? 0, color: "text-foreground" },
          { label: "Active", value: data?.active ?? 0, color: "text-teal-400" },
          { label: "Renewing (7d)", value: data?.renewingIn7Days ?? 0, color: "text-amber-400" },
          { label: "Renewing (30d)", value: data?.renewingIn30Days ?? 0, color: "text-blue-400" },
        ].map((stat) => (
          <Card key={stat.label} className="border border-border bg-card/60 rounded-xl">
            <CardContent className="p-4">
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">{stat.label}</p>
              <p className={`text-3xl font-bold font-mono ${stat.color}`}>{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest mr-1">Status:</span>
        {(["all", "active", "paused", "cancelled"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-mono border transition-colors ${
              statusFilter === f
                ? "bg-primary/20 border-primary/40 text-primary"
                : "border-border text-muted-foreground hover:border-primary/30"
            }`}
          >
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            {f === "active" && data ? ` (${data.active})` : ""}
            {f === "paused" && data ? ` (${data.paused})` : ""}
            {f === "cancelled" && data ? ` (${data.cancelled})` : ""}
          </button>
        ))}
        <div className="ml-4 flex gap-2 items-center">
          <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest mr-1">Renewing:</span>
          {(["all", "7", "30"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setRenewFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-mono border transition-colors ${
                renewFilter === f
                  ? "bg-primary/20 border-primary/40 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/30"
              }`}
            >
              {f === "all" ? "Any" : `≤${f}d`}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" className="ml-auto font-mono text-xs gap-1" onClick={() => void loadData()}>
          <RefreshCw className="h-3 w-3" /> Refresh
        </Button>
      </div>

      {/* Table */}
      {filteredSubs.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-xl">
          <p className="text-muted-foreground text-sm font-mono">No subscriptions match the current filters.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSubs.map((sub) => {
            const nextDate = new Date(sub.nextBillingDate).toLocaleDateString("en-US", {
              year: "numeric", month: "short", day: "numeric",
            });
            const price = (sub.planPriceCents / 100).toFixed(2);
            const intervalLabel =
              sub.intervalDays === 30
                ? "Monthly"
                : sub.intervalDays === 60
                  ? "Every 60d"
                  : "Quarterly";

            return (
              <Card key={sub.id} className="border border-border bg-card/60 rounded-xl">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{sub.customerEmail}</span>
                        {sub.customerName && (
                          <span className="text-muted-foreground text-xs">({sub.customerName})</span>
                        )}
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full border ${
                            sub.status === "active"
                              ? "bg-teal-500/15 text-teal-400 border-teal-500/30"
                              : sub.status === "paused"
                                ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                                : "bg-red-500/15 text-red-400 border-red-500/30"
                          }`}
                        >
                          {sub.status}
                        </span>
                      </div>
                      <p className="text-muted-foreground text-xs font-mono">
                        {sub.planName} · {intervalLabel} · ${price}/interval
                      </p>
                      <p className="text-muted-foreground text-xs font-mono">
                        Next: {nextDate} · #{sub.id}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {sub.status !== "active" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs font-mono border-teal-500/40 text-teal-400 hover:bg-teal-500/10"
                          disabled={actioningId === sub.id}
                          onClick={() => void patchStatus(sub.id, "active")}
                        >
                          Reactivate
                        </Button>
                      )}
                      {sub.status === "active" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs font-mono border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                          disabled={actioningId === sub.id}
                          onClick={() => void patchStatus(sub.id, "paused")}
                        >
                          Pause
                        </Button>
                      )}
                      {sub.status !== "cancelled" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs font-mono border-destructive/40 text-destructive hover:bg-destructive/10"
                          disabled={actioningId === sub.id}
                          onClick={() => void patchStatus(sub.id, "cancelled")}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

const CATEGORIES: { value: CategoryValue; label: string }[] = [
  { value: "metabolic", label: "Metabolic" },
  { value: "longevity", label: "Longevity" },
  { value: "recovery", label: "Recovery" },
  { value: "cognitive", label: "Cognitive" },
  { value: "other", label: "Other" },
];

function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function ProductDialog({
  open,
  onClose,
  adminKey,
  product,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  adminKey: string;
  product?: AdminProduct;
  onSaved: () => void;
}) {
  const isEdit = !!product;
  const [name, setName] = useState(product?.name ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [category, setCategory] = useState<CategoryValue>(product?.category ?? "other");
  const [shortDesc, setShortDesc] = useState(product?.shortDescription ?? "");
  const [longDesc, setLongDesc] = useState(product?.longDescription ?? "");
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? "");
  const [researchUses, setResearchUses] = useState((product?.researchUses ?? []).join(", "));
  const [featured, setFeatured] = useState(product?.featured ?? false);
  const [published, setPublished] = useState(product?.published ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setName(product?.name ?? "");
      setSlug(product?.slug ?? "");
      setCategory(product?.category ?? "other");
      setShortDesc(product?.shortDescription ?? "");
      setLongDesc(product?.longDescription ?? "");
      setImageUrl(product?.imageUrl ?? "");
      setResearchUses((product?.researchUses ?? []).join(", "));
      setFeatured(product?.featured ?? false);
      setPublished(product?.published ?? true);
      setError("");
    }
  }, [open, product]);

  const handleNameChange = (val: string) => {
    setName(val);
    if (!isEdit) setSlug(slugify(val));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    const uses = researchUses.split(",").map(s => s.trim()).filter(Boolean);
    const body = {
      name, slug, category, shortDescription: shortDesc, longDescription: longDesc,
      imageUrl: imageUrl || null, researchUses: uses, featured, published,
    };
    try {
      await adminFetch(
        isEdit ? `/admin/products/${product!.id}` : "/admin/products",
        adminKey,
        { method: isEdit ? "PUT" : "POST", body: JSON.stringify(body) },
      );
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save product");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono">{isEdit ? "Edit Product" : "New Product"}</DialogTitle>
          <DialogDescription>
            {isEdit ? `Editing ${product!.name}` : "Add a new research compound to the catalog."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Name *</Label>
              <Input value={name} onChange={e => handleNameChange(e.target.value)} placeholder="e.g. Semaglutide" className="mt-1" required />
            </div>
            <div className="col-span-2">
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Slug *</Label>
              <Input value={slug} onChange={e => setSlug(e.target.value)} placeholder="semaglutide" className="mt-1 font-mono text-sm" required pattern="[a-z0-9-]+" />
              <p className="text-xs text-muted-foreground mt-1">Lowercase letters, numbers, hyphens only</p>
            </div>
            <div className="col-span-2">
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Category *</Label>
              <Select value={category} onValueChange={v => setCategory(v as CategoryValue)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Short Description *</Label>
              <Input value={shortDesc} onChange={e => setShortDesc(e.target.value)} placeholder="One-line description for product cards" className="mt-1" required maxLength={500} />
            </div>
            <div className="col-span-2">
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Long Description</Label>
              <Textarea value={longDesc} onChange={e => setLongDesc(e.target.value)} placeholder="Detailed research background…" className="mt-1 min-h-[100px]" />
            </div>
            <div className="col-span-2">
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Image URL</Label>
              <Input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://…" className="mt-1" type="url" />
            </div>
            <div className="col-span-2">
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Research Uses</Label>
              <Input value={researchUses} onChange={e => setResearchUses(e.target.value)} placeholder="Weight management, Metabolic research" className="mt-1" />
              <p className="text-xs text-muted-foreground mt-1">Comma-separated list</p>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="featured" checked={featured} onCheckedChange={v => setFeatured(!!v)} />
              <Label htmlFor="featured" className="text-sm cursor-pointer">Featured</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="published" checked={published} onCheckedChange={v => setPublished(!!v)} />
              <Label htmlFor="published" className="text-sm cursor-pointer">Published</Label>
            </div>
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Product"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function VariantDialog({
  open,
  onClose,
  adminKey,
  productId,
  variant,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  adminKey: string;
  productId: number;
  variant?: AdminVariant;
  onSaved: () => void;
}) {
  const isEdit = !!variant;
  const [name, setName] = useState(variant?.name ?? "");
  const [concentration, setConcentration] = useState(variant?.concentration ?? "");
  const [sizeml, setSizeml] = useState(variant?.sizeml?.toString() ?? "");
  const [priceDollars, setPriceDollars] = useState(variant ? (variant.priceCents / 100).toFixed(2) : "");
  const [sku, setSku] = useState(variant?.sku ?? "");
  const [inStock, setInStock] = useState(variant?.inStock ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setName(variant?.name ?? "");
      setConcentration(variant?.concentration ?? "");
      setSizeml(variant?.sizeml?.toString() ?? "");
      setPriceDollars(variant ? (variant.priceCents / 100).toFixed(2) : "");
      setSku(variant?.sku ?? "");
      setInStock(variant?.inStock ?? true);
      setError("");
    }
  }, [open, variant]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    const body = {
      name, concentration,
      sizeml: parseFloat(sizeml),
      priceCents: Math.round(parseFloat(priceDollars) * 100),
      sku, inStock,
    };
    try {
      await adminFetch(
        isEdit ? `/admin/variants/${variant!.id}` : `/admin/products/${productId}/variants`,
        adminKey,
        { method: isEdit ? "PUT" : "POST", body: JSON.stringify(body) },
      );
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save variant");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono">{isEdit ? "Edit Variant" : "New Variant"}</DialogTitle>
          <DialogDescription>
            {isEdit ? `Editing ${variant!.name}` : "Add a size/concentration option for this product."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div>
            <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Variant Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. 5mg vial" className="mt-1" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Concentration *</Label>
              <Input value={concentration} onChange={e => setConcentration(e.target.value)} placeholder="5mg/vial" className="mt-1" required />
            </div>
            <div>
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Size (ml) *</Label>
              <Input value={sizeml} onChange={e => setSizeml(e.target.value)} placeholder="2" className="mt-1" type="number" step="0.1" min="0" required />
            </div>
            <div>
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Price (USD) *</Label>
              <Input value={priceDollars} onChange={e => setPriceDollars(e.target.value)} placeholder="49.99" className="mt-1" type="number" step="0.01" min="0" required />
            </div>
            <div>
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">SKU *</Label>
              <Input value={sku} onChange={e => setSku(e.target.value)} placeholder="SEM-5MG-2ML" className="mt-1 font-mono text-sm" required />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="inStock" checked={inStock} onCheckedChange={v => setInStock(!!v)} />
            <Label htmlFor="inStock" className="text-sm cursor-pointer">In Stock</Label>
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Variant"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProductsPanel({ adminKey }: { adminKey: string }) {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<AdminProduct | undefined>();
  const [showVariantDialog, setShowVariantDialog] = useState(false);
  const [editingVariant, setEditingVariant] = useState<AdminVariant | undefined>();
  const [variantProductId, setVariantProductId] = useState<number>(0);
  const [deletingProductId, setDeletingProductId] = useState<number | null>(null);
  const [deletingVariantId, setDeletingVariantId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await adminFetch<AdminProduct[]>("/admin/products", adminKey);
      setProducts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [adminKey]);

  useEffect(() => { void load(); }, [load]);

  const handleDeleteProduct = async (id: number) => {
    setDeletingProductId(id);
    try {
      await adminFetch(`/admin/products/${id}`, adminKey, { method: "DELETE" });
      setProducts(prev => prev.filter(p => p.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete product");
    } finally {
      setDeletingProductId(null);
    }
  };

  const handleDeleteVariant = async (variantId: number) => {
    setDeletingVariantId(variantId);
    try {
      await adminFetch(`/admin/variants/${variantId}`, adminKey, { method: "DELETE" });
      setProducts(prev => prev.map(p => ({
        ...p,
        variants: p.variants.filter(v => v.id !== variantId),
      })));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete variant");
    } finally {
      setDeletingVariantId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground font-mono text-sm">Loading products…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-24">
        <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-3" />
        <p className="text-destructive font-mono text-sm">{error}</p>
        <Button variant="outline" size="sm" onClick={load} className="mt-4">Retry</Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Products
            <span className="text-muted-foreground font-normal text-sm">({products.length})</span>
          </h2>
          <p className="text-muted-foreground text-sm mt-0.5">Manage your research compound catalog and variants.</p>
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => { setEditingProduct(undefined); setShowProductDialog(true); }}
        >
          <Plus className="h-3.5 w-3.5" /> Add Product
        </Button>
      </div>

      {products.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-border/50 rounded-lg">
          <Package className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No products yet.</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-4 gap-1.5"
            onClick={() => { setEditingProduct(undefined); setShowProductDialog(true); }}
          >
            <Plus className="h-3.5 w-3.5" /> Add your first product
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {products.map(product => {
            const isExpanded = expandedId === product.id;
            const variants = product.variants ?? [];
            return (
              <Card key={product.id} className="border-border/50 overflow-hidden">
                <div className="p-4 flex items-center gap-3">
                  <button
                    className="flex-1 flex items-center gap-3 text-left min-w-0"
                    onClick={() => setExpandedId(isExpanded ? null : product.id)}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{product.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">/{product.slug}</span>
                        <Badge className="text-xs capitalize border-0 bg-primary/10 text-primary">{product.category}</Badge>
                        {product.featured && (
                          <Badge className="text-xs bg-yellow-500/10 text-yellow-400 border-yellow-500/30 gap-1">
                            <Star className="h-2.5 w-2.5" /> Featured
                          </Badge>
                        )}
                        {product.published ? (
                          <Badge className="text-xs bg-green-500/10 text-green-400 border-green-500/30 gap-1">
                            <Eye className="h-2.5 w-2.5" /> Published
                          </Badge>
                        ) : (
                          <Badge className="text-xs bg-muted/50 text-muted-foreground gap-1">
                            <EyeOff className="h-2.5 w-2.5" /> Hidden
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{product.shortDescription}</p>
                    </div>
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-muted-foreground font-mono mr-1">
                      {variants.length} variant{variants.length !== 1 ? "s" : ""}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      title="Edit product"
                      onClick={() => { setEditingProduct(product); setShowProductDialog(true); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      title="Delete product"
                      disabled={deletingProductId === product.id}
                      onClick={() => {
                        if (confirm(`Delete "${product.name}"? This cannot be undone.`)) {
                          void handleDeleteProduct(product.id);
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-muted-foreground"
                      onClick={() => setExpandedId(isExpanded ? null : product.id)}
                    >
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-border/50 bg-card/50 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-muted-foreground font-mono uppercase tracking-wider">Variants</h4>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 text-xs"
                        onClick={() => {
                          setVariantProductId(product.id);
                          setEditingVariant(undefined);
                          setShowVariantDialog(true);
                        }}
                      >
                        <Plus className="h-3 w-3" /> Add Variant
                      </Button>
                    </div>
                    {variants.length === 0 ? (
                      <p className="text-muted-foreground text-sm text-center py-4">No variants yet. Add one to make this product purchasable.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow className="border-border/30 hover:bg-transparent">
                            <TableHead className="font-mono text-xs uppercase tracking-wider">Name</TableHead>
                            <TableHead className="font-mono text-xs uppercase tracking-wider">Concentration</TableHead>
                            <TableHead className="font-mono text-xs uppercase tracking-wider">Size</TableHead>
                            <TableHead className="font-mono text-xs uppercase tracking-wider">Price</TableHead>
                            <TableHead className="font-mono text-xs uppercase tracking-wider">SKU</TableHead>
                            <TableHead className="font-mono text-xs uppercase tracking-wider">Stock</TableHead>
                            <TableHead />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {variants.map(variant => (
                            <TableRow key={variant.id} className="border-border/20">
                              <TableCell className="text-sm font-medium">{variant.name}</TableCell>
                              <TableCell className="text-sm text-muted-foreground font-mono">{variant.concentration}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{variant.sizeml} ml</TableCell>
                              <TableCell className="text-sm font-mono">${(variant.priceCents / 100).toFixed(2)}</TableCell>
                              <TableCell className="text-xs font-mono text-muted-foreground">{variant.sku}</TableCell>
                              <TableCell>
                                {variant.inStock ? (
                                  <Badge className="text-xs bg-green-500/10 text-green-400 border-green-500/30">In Stock</Badge>
                                ) : (
                                  <Badge className="text-xs bg-destructive/10 text-destructive border-destructive/30">Out of Stock</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0"
                                    onClick={() => {
                                      setVariantProductId(product.id);
                                      setEditingVariant(variant);
                                      setShowVariantDialog(true);
                                    }}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                    disabled={deletingVariantId === variant.id}
                                    onClick={() => {
                                      if (confirm(`Delete variant "${variant.name}"?`)) {
                                        void handleDeleteVariant(variant.id);
                                      }
                                    }}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <ProductDialog
        open={showProductDialog}
        onClose={() => setShowProductDialog(false)}
        adminKey={adminKey}
        product={editingProduct}
        onSaved={load}
      />
      <VariantDialog
        open={showVariantDialog}
        onClose={() => setShowVariantDialog(false)}
        adminKey={adminKey}
        productId={variantProductId}
        variant={editingVariant}
        onSaved={load}
      />
    </div>
  );
}

export function AdminPage() {
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem("admin_key") ?? "");
  const [authed, setAuthed] = useState(() => !!sessionStorage.getItem("admin_key"));

  const initialTab: AdminTab =
    typeof window !== "undefined" &&
    window.location.pathname.includes("reviewer-submissions")
      ? "reviewers"
      : typeof window !== "undefined" &&
          window.location.pathname.includes("subscriptions")
        ? "subscriptions"
        : "batches";

  const handleLogin = (key: string) => {
    setAdminKey(key);
    setAuthed(true);
  };

  const handleLogout = () => {
    sessionStorage.removeItem("admin_key");
    setAdminKey("");
    setAuthed(false);
  };

  if (!authed) {
    return <LoginForm onLogin={handleLogin} />;
  }

  return <Dashboard adminKey={adminKey} onLogout={handleLogout} initialTab={initialTab} />;
}
