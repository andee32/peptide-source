/**
 * Review status of each legal document, kept in a dependency-free module so the
 * Vite config can import it and refuse to build a deployable bundle. Publishing
 * unreviewed terms is a compliance problem, and a build failure is a much better
 * place to catch it than a live storefront.
 *
 * Deploy pipelines must set ENFORCE_LEGAL_REVIEW=1 so that guard is armed. It is
 * opt-in rather than keyed off NODE_ENV because pnpm sets NODE_ENV=production for
 * every `pnpm run build`, which would block local builds and typecheck runs too.
 *
 * Flip a slug to false only when counsel has approved that document's copy.
 */
export const legalDocumentReviewStatus: Record<string, boolean> = {
  terms: true,
  "ruo-policy": true,
  privacy: true,
  refunds: true,
  shipping: true,
};

export function pendingLegalDocuments(): string[] {
  return Object.entries(legalDocumentReviewStatus)
    .filter(([, pending]) => pending)
    .map(([slug]) => slug);
}

/**
 * Throws when a deploy build would ship unreviewed legal copy; warns loudly
 * otherwise so a draft never goes unnoticed.
 */
export function assertLegalDocumentsApproved(env: {
  ENFORCE_LEGAL_REVIEW?: string;
}): void {
  const pending = pendingLegalDocuments();
  if (pending.length === 0) return;

  const detail =
    `legal documents awaiting counsel approval — ${pending.join(", ")}. ` +
    `Replace the draft copy in src/pages/legal/documents.ts and clear the flag ` +
    `in src/pages/legal/status.ts.`;

  if (env.ENFORCE_LEGAL_REVIEW === "1") {
    throw new Error(`Refusing to build: ${detail}`);
  }
  console.warn(`[legal] WARNING: ${detail}`);
}
