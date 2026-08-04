/**
 * Magic-byte detection for the catalog image formats we accept.
 *
 * The multipart MIME type is supplied by the client — a browser labels any
 * `.png` as `image/png` regardless of content — so it cannot gate what lands
 * in a public, cacheable image endpoint. Sniffing the leading bytes is the
 * only check that reflects the actual payload.
 */
export type SniffedImageMime =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/avif";

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/** AVIF and its relatives declare their variant in the ISO-BMFF `ftyp` brand. */
const AVIF_BRANDS = new Set(["avif", "avis"]);

export function sniffImageMime(buffer: Buffer): SniffedImageMime | null {
  if (buffer.length < 12) return null;

  if (buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return "image/png";

  // JPEG: SOI marker, optionally followed by any APPn/other marker.
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // RIFF container whose form type is WEBP.
  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  if (
    buffer.toString("ascii", 4, 8) === "ftyp" &&
    AVIF_BRANDS.has(buffer.toString("ascii", 8, 12))
  ) {
    return "image/avif";
  }

  return null;
}
