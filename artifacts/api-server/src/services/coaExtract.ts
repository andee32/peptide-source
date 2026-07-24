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
