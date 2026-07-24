# COA File Upload + AI Extraction + Public Download

**Date:** 2026-07-24
**Status:** Approved

## Goal

Admins upload the actual COA document (PDF or image) for a batch. AI extracts the
test details to prefill the existing COA form; the admin reviews and saves. The
public verify page renders the saved details and offers the original document as
a download.

## Decisions (made with owner)

- **Input formats:** mixed — PDFs from various labs plus photos/scans (JPEG/PNG/WebP).
- **Review flow:** AI prefills, admin confirms. Nothing AI-extracted goes public
  without human review.
- **File storage:** Postgres (bytea). Low volume, small files; zero new infra.
  Migrate to object storage later only if volume demands it.
- **AI model:** `claude-haiku-4-5` via `@anthropic-ai/sdk` — cheapest with PDF +
  image vision (~½ cent per extraction); accuracy backstopped by the review step.
- **Download placement:** `/verify/:id` page + retail/wholesale product pages
  (next to the COA-Verified badge, via `latestBatchId`).

## 1. Schema (`lib/db/src/schema/batches.ts`)

New table `coa_documents`:

| column | type | notes |
|---|---|---|
| `id` | text PK | |
| `batchId` | text FK → batches.id, cascade delete | |
| `filename` | text | original upload name |
| `mimeType` | text | `application/pdf`, `image/jpeg`, `image/png`, `image/webp` |
| `sizeBytes` | integer | |
| `data` | bytea (Drizzle `customType<{ data: Buffer }>`) | file bytes |
| `createdAt` | timestamp default now | |

Multiple documents per batch allowed (e.g. separate purity and heavy-metals
certificates); typically one.

## 2. Admin API (`artifacts/api-server/src/routes/admin.ts`)

Ad-hoc Zod validation, matching existing admin routes (not in the OpenAPI spec).

- `POST /admin/batches/:id/coa-file` — multipart (multer, memory storage).
  Limits: 10 MB, MIME allowlist above. Flow: validate → store row in
  `coa_documents` → call extraction service → respond
  `{ documentId, extracted: ExtractedCoa | null }`.
  Extraction failure (no `ANTHROPIC_API_KEY`, API error, unparseable doc) is
  **soft**: file still saves, `extracted: null`, admin enters values manually.
  The upload never blocks on AI.
- `DELETE /admin/batches/:id/coa-file/:docId` — remove a bad upload.
- Admin batch listing (`GET /admin/batches`) gains a `documents` array
  (`id, filename, sizeBytes, createdAt` — no bytes).

## 3. AI extraction (`artifacts/api-server/src/services/coaExtract.ts`)

- `@anthropic-ai/sdk`, model `claude-haiku-4-5`.
- Input: one `document` (PDF) or `image` content block + instruction text.
- Structured output via `output_config.format` (json_schema). All fields
  nullable:

```ts
{
  testType: "purity" | "endotoxin" | "sterility" | "heavyMetals" | null,
  purityPercent: number | null,
  endotoxinEuPerMl: number | null,
  sterilityPass: boolean | null,
  heavyMetals: { element, resultPpm, limitPpm, pass }[] | null,
  labName: string | null,
  testedAt: string | null,   // ISO date
  janoshikTaskId: string | null
}
```

- Server-side only; the API key never reaches the client.

## 4. Admin UI (`artifacts/storefront/src/pages/AdminPage.tsx`)

- `AddCoaDialog` gains a file input at the top: "Upload COA (PDF/image)".
  On select → `POST .../coa-file` → extracted values prefill the existing form
  fields → notice: "AI-extracted — verify against the document" → admin
  reviews/edits → Save uses the existing `POST /admin/batches/:id/coa`
  unchanged.
- Batch rows list attached documents with a delete control.

## 5. Public API + UI

- `GET /batches/:id/coa-file` (`artifacts/api-server/src/routes/batches.ts`):
  streams the newest document with `Content-Disposition: attachment`.
  **Fails closed:** 404 unless the batch is `released` AND `isDemo === false`.
  A fabricated demo COA can never be served as a real document.
- OpenAPI (`lib/api-spec/openapi.yaml`): add the download path (binary
  response, like the QR endpoint); `GetBatchResponse` gains
  `hasCoaFile: boolean`. Regenerate api-zod / api-client-react via codegen —
  never hand-edit generated packages.
- `VerifyPage.tsx`: "Download COA" button when `hasCoaFile`.
- Retail/wholesale product pages: download link next to the COA-Verified badge
  (uses existing `latestBatchId`).

## 6. Error handling

- Upload validates MIME + size before touching AI.
- Extraction failure is soft (`extracted: null`).
- Download fails closed on non-released or demo batches.
- BTCPay-style fail-closed principle applies: no placeholder/stub documents.

## 7. Verification

- Gate: `pnpm run typecheck` must pass (repo green-signal gate).
- Manual smoke: upload a real Janoshik PDF via admin → confirm prefill →
  save → confirm details render on `/verify/:id` → download the file and
  byte-compare with the original.
- New env: `ANTHROPIC_API_KEY` documented in `.env.example` (feature degrades
  gracefully without it).

## Out of scope

- Automatic publish without review (rejected by owner).
- Object storage (revisit if volume grows).
- Janoshik API integration (separate pre-fork blocker, unchanged).
