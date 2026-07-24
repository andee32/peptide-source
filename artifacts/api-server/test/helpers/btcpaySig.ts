import { createHmac } from "node:crypto";

// Mirrors services/btcpay.ts verifyWebhookSignature: HMAC-SHA256 over the exact
// raw bytes, hex-encoded, prefixed with "sha256=".
//
// Signing must happen over the SAME string the request body carries. Tests that
// need a mismatch sign one payload and send another rather than mutating this.
export function signBtcpayBody(rawBody: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}
