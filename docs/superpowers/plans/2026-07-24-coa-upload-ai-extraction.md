# COA File Upload + AI Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins upload the real COA document per batch, have Claude extract the test details to prefill the admin form (admin reviews + saves), render saved details on the public verify page, and offer the original document as a download.

**Architecture:** New `coa_documents` table stores file bytes in Postgres. An admin multipart upload endpoint saves the file and calls a server-side Claude extraction service (soft-fail). Admin UI prefills the existing COA form from the extraction. A public download endpoint streams the newest document, failing closed on demo/non-released batches. The public API surfaces `hasCoaFile` via the OpenAPI spec + codegen.

**Tech Stack:** Express 5, Drizzle (Postgres), `@anthropic-ai/sdk` (`claude-haiku-4-5`), multer, React 19 + Vite, Orval codegen, vitest.

## Global Constraints

- Package manager is **pnpm** only (preinstall rejects npm/yarn).
- `pnpm run typecheck` is the green-signal gate — must pass before any task is done (Stop hook enforces it).
- **Never hand-edit** `lib/api-zod` or `lib/api-client-react` — they are generated. Edit `lib/api-spec/openapi.yaml` then run `pnpm --filter @atlab/api-spec run codegen`.
- Workspaces are `@atlab/*`. Server env loads from root `.env` via `--env-file-if-exists`.
- Admin routes use `x-admin-key` header + `authenticateAdmin` middleware (already applied to the `/admin` router); they are NOT in the OpenAPI spec — use ad-hoc Zod.
- Fail-closed security posture: no stub/placeholder documents; demo or non-released batches never serve a real COA file.
- Client never receives the `ANTHROPIC_API_KEY`; all AI calls are server-side.

---

### Task 1: `coa_documents` schema + migration

**Files:**
- Modify: `lib/db/src/schema/batches.ts` (append after `coaResultsTable`)

**Interfaces:**
- Produces: `coaDocumentsTable`, `insertCoaDocumentSchema`, types `InsertCoaDocument`, `CoaDocument`. Columns: `id: text`, `batchId: text`, `filename: text`, `mimeType: text`, `sizeBytes: integer`, `data: Buffer (bytea)`, `createdAt: timestamp`.

- [ ] **Step 1: Add the bytea custom type and table**

Append to `lib/db/src/schema/batches.ts` (after the `CoaResult` type export at the end):

```ts
import { customType } from "drizzle-orm/pg-core";

// Postgres bytea <-> Node Buffer. COA files are small (a few hundred KB) and
// low-volume, so storing bytes in the DB avoids standing up object storage.
const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return "bytea";
  },
});

export const coaDocumentsTable = pgTable("coa_documents", {
  id: text("id").primaryKey(),
  batchId: text("batch_id")
    .notNull()
    .references(() => batchesTable.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  data: bytea("data").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCoaDocumentSchema = createInsertSchema(coaDocumentsTable).omit({
  createdAt: true,
});
export type InsertCoaDocument = z.infer<typeof insertCoaDocumentSchema>;
export type CoaDocument = typeof coaDocumentsTable.$inferSelect;
```

Note: `customType`, `integer`, `text`, `timestamp`, `pgTable` are already imported at the top of the file — verify `integer` and `timestamp` are in the existing import list (they are, used by `coaResultsTable`); add `customType` to the `drizzle-orm/pg-core` import instead of a second import line if you prefer. Either compiles.

- [ ] **Step 2: Typecheck the db package**

Run: `pnpm --filter @atlab/db run typecheck` (or `pnpm run typecheck` from root)
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add lib/db/src/schema/batches.ts
git commit -m "feat(db): add coa_documents table for uploaded COA files"
```

Note: `pnpm --filter @atlab/db run push` applies the table to a live DB; run only against a scratch DB with `DATABASE_URL` set. Not part of this commit.

---

### Task 2: AI extraction service

**Files:**
- Create: `artifacts/api-server/src/services/coaExtract.ts`
- Modify: `artifacts/api-server/package.json` (add `@anthropic-ai/sdk` dependency)

**Interfaces:**
- Produces: `extractCoaFromFile(bytes: Buffer, mimeType: string): Promise<ExtractedCoa | null>` and the `ExtractedCoa` type:
  ```ts
  type ExtractedCoa = {
    testType: "purity" | "endotoxin" | "sterility" | "heavyMetals" | null;
    purityPercent: number | null;
    endotoxinEuPerMl: number | null;
    sterilityPass: boolean | null;
    heavyMetals: { element: string; resultPpm: number; limitPpm: number; pass: boolean }[] | null;
    labName: string | null;
    testedAt: string | null;
    janoshikTaskId: string | null;
  };
  ```
  Returns `null` when `ANTHROPIC_API_KEY` is unset or any error/parse failure occurs (soft-fail — never throws).

- [ ] **Step 1: Add the SDK dependency**

```bash
pnpm --filter @atlab/api-server add @anthropic-ai/sdk
```

Expected: `@anthropic-ai/sdk` added to `dependencies` in `artifacts/api-server/package.json`.

- [ ] **Step 2: Write the service**

Create `artifacts/api-server/src/services/coaExtract.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";

export type ExtractedCoa = {
  testType: "purity" | "endotoxin" | "sterility" | "heavyMetals" | null;
  purityPercent: number | null;
  endotoxinEuPerMl: number | null;
  sterilityPass: boolean | null;
  heavyMetals:
    | { element: string; resultPpm: number; limitPpm: number; pass: boolean }[]
    | null;
  labName: string | null;
  testedAt: string | null;
  janoshikTaskId: string | null;
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    testType: { type: ["string", "null"], enum: ["purity", "endotoxin", "sterility", "heavyMetals", null] },
    purityPercent: { type: ["number", "null"] },
    endotoxinEuPerMl: { type: ["number", "null"] },
    sterilityPass: { type: ["boolean", "null"] },
    heavyMetals: {
      type: ["array", "null"],
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          element: { type: "string" },
          resultPpm: { type: "number" },
          limitPpm: { type: "number" },
          pass: { type: "boolean" },
        },
        required: ["element", "resultPpm", "limitPpm", "pass"],
      },
    },
    labName: { type: ["string", "null"] },
    testedAt: { type: ["string", "null"] },
    janoshikTaskId: { type: ["string", "null"] },
  },
  required: [
    "testType", "purityPercent", "endotoxinEuPerMl", "sterilityPass",
    "heavyMetals", "labName", "testedAt", "janoshikTaskId",
  ],
} as const;

const INSTRUCTION =
  "This is a peptide/compound Certificate of Analysis. Extract the test data. " +
  "Determine the primary testType: 'purity' (HPLC/MS purity %), 'endotoxin' (EU/mL), " +
  "'sterility' (pass/fail), or 'heavyMetals' (per-element ppm table). Fill only the " +
  "fields present in the document; use null for anything absent. testedAt must be an " +
  "ISO 8601 date (YYYY-MM-DD). Report purityPercent as a number (e.g. 98.7, not '98.7%'). " +
  "janoshikTaskId is any Janoshik order/task/report reference number if shown.";

export async function extractCoaFromFile(
  bytes: Buffer,
  mimeType: string,
): Promise<ExtractedCoa | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  try {
    const client = new Anthropic();
    const b64 = bytes.toString("base64");

    const source =
      mimeType === "application/pdf"
        ? { type: "base64" as const, media_type: "application/pdf" as const, data: b64 }
        : null;

    const content =
      source !== null
        ? [
            { type: "document" as const, source },
            { type: "text" as const, text: INSTRUCTION },
          ]
        : [
            {
              type: "image" as const,
              source: {
                type: "base64" as const,
                media_type: mimeType as "image/jpeg" | "image/png" | "image/webp",
                data: b64,
              },
            },
            { type: "text" as const, text: INSTRUCTION },
          ];

    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 2048,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;
    return JSON.parse(textBlock.text) as ExtractedCoa;
  } catch (err) {
    console.error("coaExtract error:", err);
    return null;
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @atlab/api-server run typecheck`
Expected: PASS. If `output_config` is not a known field on the SDK's create params for the installed version, fall back to a tool-based extraction (define a single `record_coa` tool with the same schema as `input_schema`, `tool_choice: { type: "tool", name: "record_coa" }`, read the `tool_use` block's `.input`). Keep the same `ExtractedCoa` return shape and soft-fail behavior.

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/package.json artifacts/api-server/src/services/coaExtract.ts pnpm-lock.yaml
git commit -m "feat(api): add server-side Claude COA extraction service"
```

---

### Task 3: Admin upload + delete endpoints

**Files:**
- Modify: `artifacts/api-server/package.json` (add `multer` + `@types/multer`)
- Modify: `artifacts/api-server/src/routes/admin.ts`

**Interfaces:**
- Consumes: `coaDocumentsTable` (Task 1), `extractCoaFromFile` + `ExtractedCoa` (Task 2), existing `batchesTable`, `authenticateAdmin` (already mounted on the `/admin` router), `randomUUID`.
- Produces:
  - `POST /admin/batches/:id/coa-file` → `{ documentId: string, filename: string, extracted: ExtractedCoa | null }`
  - `DELETE /admin/batches/:id/coa-file/:docId` → `{ ok: true }`
  - `GET /admin/batches` response items gain `documents: { id, filename, sizeBytes, createdAt }[]`.

- [ ] **Step 1: Add multer**

```bash
pnpm --filter @atlab/api-server add multer
pnpm --filter @atlab/api-server add -D @types/multer
```

- [ ] **Step 2: Add imports and the multer instance to admin.ts**

At the top of `artifacts/api-server/src/routes/admin.ts`, add to imports:

```ts
import multer from "multer";
import { coaDocumentsTable } from "@atlab/db/schema";
import { extractCoaFromFile } from "../services/coaExtract";
```

(Add `coaDocumentsTable` to the existing `@atlab/db/schema` import block rather than a duplicate import.)

After the `const router = Router();` line, add:

```ts
const ALLOWED_COA_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const coaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter(_req, file, cb) {
    cb(null, ALLOWED_COA_MIME.has(file.mimetype));
  },
});
```

- [ ] **Step 3: Add the upload route**

Add near the existing `POST /admin/batches/:id/coa` handler in `admin.ts`:

```ts
router.post("/admin/batches/:id/coa-file", coaUpload.single("file"), async (req, res) => {
  try {
    const { id: batchId } = req.params;

    const batch = await db.query.batchesTable.findFirst({
      where: eq(batchesTable.id, batchId),
    });
    if (!batch) {
      res.status(404).json({ error: "not_found", message: "Batch not found" });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({
        error: "bad_request",
        message: "Missing or unsupported file (allowed: PDF, JPEG, PNG, WebP; max 10 MB)",
      });
      return;
    }

    const documentId = randomUUID();
    await db.insert(coaDocumentsTable).values({
      id: documentId,
      batchId,
      filename: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      data: file.buffer,
    });

    // Soft-fail: extraction never blocks the upload. Null => admin enters manually.
    const extracted = await extractCoaFromFile(file.buffer, file.mimetype);

    res.status(201).json({ documentId, filename: file.originalname, extracted });
  } catch (err) {
    console.error("admin uploadCoaFile error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

router.delete("/admin/batches/:id/coa-file/:docId", async (req, res) => {
  try {
    const { id: batchId, docId } = req.params;
    const deleted = await db
      .delete(coaDocumentsTable)
      .where(and(eq(coaDocumentsTable.id, docId), eq(coaDocumentsTable.batchId, batchId)))
      .returning({ id: coaDocumentsTable.id });
    if (deleted.length === 0) {
      res.status(404).json({ error: "not_found", message: "Document not found" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("admin deleteCoaFile error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});
```

`and` and `eq` are already imported in admin.ts.

- [ ] **Step 4: Surface documents in the admin batch listing**

In the `GET /admin/batches` handler, inside the `Promise.all(batches.map(async (batch) => {...}))` block, after the existing `coaResults` query add:

```ts
      const documents = await db.query.coaDocumentsTable.findMany({
        where: eq(coaDocumentsTable.batchId, batch.id),
        columns: { id: true, filename: true, sizeBytes: true, createdAt: true },
      });
```

and add `documents,` to the returned object literal for each batch.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @atlab/api-server run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/package.json artifacts/api-server/src/routes/admin.ts pnpm-lock.yaml
git commit -m "feat(api): admin COA file upload/delete + AI prefill"
```

---

### Task 4: Public download endpoint + `hasCoaFile` on batch detail

**Files:**
- Modify: `lib/api-spec/openapi.yaml`
- Modify: `artifacts/api-server/src/routes/batches.ts`
- Regenerate: `lib/api-zod`, `lib/api-client-react` (via codegen — do not hand-edit)

**Interfaces:**
- Consumes: `coaDocumentsTable` (Task 1), existing `batchesTable`.
- Produces:
  - `GET /batches/:id/coa-file` → streams newest document (attachment) for released, non-demo batches; 404 otherwise.
  - `BatchDetail.hasCoaFile: boolean` in the generated `GetBatchResponse`.

- [ ] **Step 1: Add `hasCoaFile` to the BatchDetail schema in the OpenAPI spec**

In `lib/api-spec/openapi.yaml`, in the `BatchDetail.allOf[1]` object, add to `properties`:

```yaml
            hasCoaFile:
              type: boolean
              description: True when a downloadable COA document is attached AND the batch is released and non-demo.
```

and add `hasCoaFile` to that object's `required` list (alongside `coaResults`):

```yaml
          required:
            - coaResults
            - hasCoaFile
```

- [ ] **Step 2: Add the download path to the OpenAPI spec**

In `lib/api-spec/openapi.yaml`, after the `/batches/{id}/qr` path block, add:

```yaml
  /batches/{id}/coa-file:
    get:
      operationId: getBatchCoaFile
      tags: [batches]
      summary: Download the batch COA document
      description: Streams the most recent uploaded COA file as an attachment. Only released, non-demo batches serve a file; all others return 404.
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: COA document (PDF or image)
          content:
            application/octet-stream:
              schema:
                type: string
                format: binary
        "404":
          description: No downloadable COA for this batch
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ApiError"
```

- [ ] **Step 3: Regenerate the client + zod packages**

Run: `pnpm --filter @atlab/api-spec run codegen`
Expected: `lib/api-zod` and `lib/api-client-react` updated; `GetBatchResponse` now includes `hasCoaFile`.

- [ ] **Step 4: Set `hasCoaFile` in the getBatch handler**

In `artifacts/api-server/src/routes/batches.ts`, add `coaDocumentsTable` to the `@atlab/db/schema` import. In the `GET /batches/:id` handler, after the `coaResults` query and before building `responseData`, add:

```ts
    const isReleasedReal = batch.status === "released" && batch.isDemo === false;
    const coaDoc = isReleasedReal
      ? await db.query.coaDocumentsTable.findFirst({
          where: eq(coaDocumentsTable.batchId, batch.id),
          orderBy: (d, { desc }) => [desc(d.createdAt)],
          columns: { id: true },
        })
      : undefined;
```

Then add `hasCoaFile: coaDoc !== undefined && coaDoc !== null,` to the `responseData` object literal.

- [ ] **Step 5: Add the download route**

In `artifacts/api-server/src/routes/batches.ts`, add before `export default router;`:

```ts
router.get("/batches/:id/coa-file", async (req, res) => {
  try {
    const { id } = req.params;

    const batch = await db.query.batchesTable.findFirst({
      where: eq(batchesTable.id, id),
    });

    // Fail closed: a fabricated demo COA must never be served as a real document.
    if (!batch || batch.status !== "released" || batch.isDemo !== false) {
      res.status(404).json({ error: "not_found", message: "No COA document available" });
      return;
    }

    const doc = await db.query.coaDocumentsTable.findFirst({
      where: eq(coaDocumentsTable.batchId, id),
      orderBy: (d, { desc }) => [desc(d.createdAt)],
    });
    if (!doc) {
      res.status(404).json({ error: "not_found", message: "No COA document available" });
      return;
    }

    const ext =
      doc.mimeType === "application/pdf" ? "pdf"
      : doc.mimeType === "image/png" ? "png"
      : doc.mimeType === "image/webp" ? "webp"
      : "jpg";

    res.setHeader("Content-Type", doc.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="coa-${id}.${ext}"`);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(doc.data);
  } catch (err) {
    console.error("getBatchCoaFile error:", err);
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});
```

Note: place this route BEFORE the existing `GET /batches/:id` handler, or Express 5 will match `/batches/:id` first only if paths overlap — they do not (`/coa-file` suffix differs), so ordering relative to `/batches/:id` is safe, but keep it alongside `/batches/:id/qr` for consistency.

- [ ] **Step 6: Typecheck the whole monorepo**

Run: `pnpm run typecheck`
Expected: PASS across all workspaces (server, storefront, generated packages).

- [ ] **Step 7: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react artifacts/api-server/src/routes/batches.ts
git commit -m "feat(api): public COA download endpoint + hasCoaFile flag"
```

---

### Task 5: Admin UI — upload + prefill in AddCoaDialog

**Files:**
- Modify: `artifacts/storefront/src/pages/AdminPage.tsx`

**Interfaces:**
- Consumes: `POST /admin/batches/:id/coa-file` (Task 3), `DELETE /admin/batches/:id/coa-file/:docId`, the `documents` array on admin batch listing, existing `adminFetch`, existing `AddCoaDialog` form state.
- Produces: no new exports; wires the upload into the existing dialog and lists documents on batch rows.

- [ ] **Step 1: Add the document type and extend AdminBatch**

Near the `AdminBatch` type (around line 84), add:

```ts
type AdminCoaDocument = {
  id: string;
  filename: string;
  sizeBytes: number;
  createdAt: string;
};
```

and add `documents: AdminCoaDocument[];` to the `AdminBatch` type.

- [ ] **Step 2: Add upload state + handler inside AddCoaDialog**

Inside the `AddCoaDialog` component, after the `const [error, setError] = useState("");` line, add:

```ts
  const [uploading, setUploading] = useState(false);
  const [uploadNotice, setUploadNotice] = useState("");

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setUploading(true);
    setError("");
    setUploadNotice("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      // adminFetch forces application/json; send raw fetch so the browser sets
      // the multipart boundary. Admin key header only.
      const res = await fetch(
        `/api/admin/batches/${encodeURIComponent(batchId)}/coa-file`,
        { method: "POST", headers: { "x-admin-key": adminKey }, body: fd },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        extracted: {
          testType: TestType | null;
          purityPercent: number | null;
          endotoxinEuPerMl: number | null;
          sterilityPass: boolean | null;
          heavyMetals: { element: string; resultPpm: number; limitPpm: number; pass: boolean }[] | null;
          labName: string | null;
          testedAt: string | null;
          janoshikTaskId: string | null;
        } | null;
      };
      onCreated(); // refresh batch list so the new document shows on the row

      const ex = data.extracted;
      if (!ex) {
        setUploadNotice("File saved. AI could not read it — enter values manually.");
        return;
      }
      setForm((f) => ({
        ...f,
        testType: ex.testType ?? f.testType,
        purityPercent: ex.purityPercent != null ? String(ex.purityPercent) : f.purityPercent,
        endotoxinEuPerMl: ex.endotoxinEuPerMl != null ? String(ex.endotoxinEuPerMl) : f.endotoxinEuPerMl,
        sterilityPass: ex.sterilityPass == null ? f.sterilityPass : ex.sterilityPass ? "true" : "false",
        labName: ex.labName ?? f.labName,
        testedAt: ex.testedAt ?? f.testedAt,
        janoshikTaskId: ex.janoshikTaskId ?? f.janoshikTaskId,
      }));
      if (ex.heavyMetals && ex.heavyMetals.length > 0) {
        setHeavyMetalRows(
          ex.heavyMetals.map((h) => ({
            element: h.element,
            resultPpm: String(h.resultPpm),
            limitPpm: String(h.limitPpm),
            pass: h.pass,
          })),
        );
      }
      setUploadNotice("AI-extracted — verify every field against the document before saving.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };
```

- [ ] **Step 3: Add the file input to the dialog form**

Inside the `AddCoaDialog` returned JSX, immediately after the opening `<form onSubmit={handleSubmit}...>` tag (before the first existing field), add:

```tsx
          <div className="mb-4 rounded-lg border border-dashed border-border/60 p-3">
            <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Upload COA (PDF / image) — AI prefills the fields
            </Label>
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={handleFileUpload}
              disabled={uploading}
              className="mt-2 block w-full text-sm font-mono"
            />
            {uploading && (
              <p className="mt-2 text-xs font-mono text-muted-foreground">Reading document…</p>
            )}
            {uploadNotice && (
              <p className="mt-2 text-xs font-mono text-amber-600">{uploadNotice}</p>
            )}
          </div>
```

`Label` is already imported in AdminPage.tsx.

- [ ] **Step 4: List documents on the batch card**

The batch card component (the one that renders the batch's `coaResults` and mounts `<AddCoaDialog ... onCreated={() => { onRefresh(); }} />`, around line 896) has `batch`, `adminKey`, and `onRefresh: () => void` in scope. Inside its `<CardContent>`, near the `batch.coaResults` list / count, add a documents list:

```tsx
                {batch.documents.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1">
                    {batch.documents.map((doc) => (
                      <div key={doc.id} className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                        <span className="truncate max-w-[220px]">{doc.filename}</span>
                        <span>({Math.round(doc.sizeBytes / 1024)} KB)</span>
                        <button
                          type="button"
                          className="text-destructive hover:underline"
                          onClick={async () => {
                            await adminFetch(
                              `/admin/batches/${encodeURIComponent(batch.id)}/coa-file/${doc.id}`,
                              adminKey,
                              { method: "DELETE" },
                            );
                            onRefresh();
                          }}
                        >
                          remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
```

`onRefresh` is the existing reload callback the card already uses for `onCreated`/`onUpdated` — reuse it; do not invent a new fetch.

- [ ] **Step 5: Typecheck the storefront**

Run: `pnpm --filter @atlab/storefront run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add artifacts/storefront/src/pages/AdminPage.tsx
git commit -m "feat(admin): upload COA file, AI-prefill the COA form, list/remove docs"
```

---

### Task 6: Public download buttons (verify page + product pages)

**Files:**
- Modify: `artifacts/storefront/src/pages/VerifyPage.tsx`
- Modify: `artifacts/storefront/src/pages/retail/RetailProductPage.tsx`
- Modify: `artifacts/storefront/src/pages/ProductDetailPage.tsx`

**Interfaces:**
- Consumes: `batch.hasCoaFile` (Task 4, on `useGetBatch`), existing `product.latestBatchId` / `product.latestBatchIsDemo`.
- Produces: user-facing download links to `/api/batches/:id/coa-file`.

- [ ] **Step 1: Add the download button on the verify page**

In `artifacts/storefront/src/pages/VerifyPage.tsx`, inside the action-button row (the `<div className="flex flex-wrap gap-3 mt-6 ...">` block, near the existing "Download QR Code" button), add as the first button:

```tsx
            {batch.hasCoaFile && (
              <Button asChild variant="default" size="sm" className="font-mono gap-2">
                <a href={`/api/batches/${batch.id}/coa-file`}>
                  <Download className="h-4 w-4" />
                  Download COA
                </a>
              </Button>
            )}
```

`Button` and `Download` are already imported.

- [ ] **Step 2: Add the download link on the retail product page**

In `artifacts/storefront/src/pages/retail/RetailProductPage.tsx`, near the COA-Verified badge (`verifiedBatchId` is already computed as `product.latestBatchId && product.latestBatchIsDemo === false ? product.latestBatchId : ...`), add a download link beside the badge `<Link>`:

```tsx
                {verifiedBatchId && (
                  <a
                    href={`/api/batches/${verifiedBatchId}/coa-file`}
                    className="text-xs font-mono underline text-muted-foreground hover:text-foreground"
                  >
                    Download COA
                  </a>
                )}
```

Place it adjacent to the existing `<Link href={`/verify/${verifiedBatchId}`}>` badge (there are two badge spots around lines 131 and 158 — add to whichever renders in the primary product info column; a single link is enough, do not duplicate).

- [ ] **Step 3: Add the download link on the wholesale product detail page**

In `artifacts/storefront/src/pages/ProductDetailPage.tsx`, near the existing COA link block (`product.latestBatchId && (<Link href={`/verify/${product.latestBatchId}`}>...`), add beside it:

```tsx
                  {product.latestBatchId && (
                    <a
                      href={`/api/batches/${product.latestBatchId}/coa-file`}
                      className="text-xs font-mono underline text-muted-foreground hover:text-foreground ml-3"
                    >
                      Download COA
                    </a>
                  )}
```

Note: the download endpoint fails closed server-side, so a link on a demo/unreleased batch simply 404s — the button never leaks a fake document. Rendering the link off `latestBatchId` is acceptable; it only ever resolves to a file for released non-demo batches.

- [ ] **Step 4: Typecheck the storefront**

Run: `pnpm --filter @atlab/storefront run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/storefront/src/pages/VerifyPage.tsx artifacts/storefront/src/pages/retail/RetailProductPage.tsx artifacts/storefront/src/pages/ProductDetailPage.tsx
git commit -m "feat(storefront): Download COA on verify + product pages"
```

---

### Task 7: Document the env var + final gate

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Document ANTHROPIC_API_KEY**

Add to `.env.example` (grouped with other service keys):

```
# Claude API key for AI extraction of uploaded COA documents (admin upload flow).
# Optional: without it, uploads still save and admins enter COA values manually.
ANTHROPIC_API_KEY=
```

- [ ] **Step 2: Full monorepo typecheck (the gate)**

Run: `pnpm run typecheck`
Expected: PASS across all workspaces.

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "docs: document ANTHROPIC_API_KEY for COA extraction"
```

- [ ] **Step 4: Manual smoke test (report results, do not skip)**

Requires a scratch `DATABASE_URL` and `pnpm --filter @atlab/db run push` applied so `coa_documents` exists. With `ANTHROPIC_API_KEY` set:
1. Start API + storefront dev servers.
2. Admin → Batches → open Add COA on a released, non-demo batch → upload a real Janoshik PDF.
3. Confirm fields prefill and the amber "verify" notice shows.
4. Edit if needed → Save → confirm the COA result appears.
5. Visit `/verify/:batchId` → confirm details render and "Download COA" appears.
6. Click Download → confirm the downloaded file byte-matches the uploaded PDF.
7. Repeat upload with `ANTHROPIC_API_KEY` unset → confirm file saves and notice says to enter values manually.
8. On a demo or non-released batch, hit `/api/batches/:id/coa-file` → confirm 404.

Report what passed/failed with actual output. If the DB push or a live key is unavailable in this environment, state that explicitly rather than claiming the smoke test passed.

---

## Notes for the executor

- Security-sensitive files touched: `admin.ts`, `batches.ts`. Per repo policy, run the `security-reviewer` subagent before the final commit of Tasks 3 and 4, and `code-reviewer` on the overall diff.
- Never wire a live BTCPay/SMTP/DB endpoint in a test — use a scratch DB for the smoke test only.
