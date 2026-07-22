import type { Request } from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";

// Credential endpoints are the only places where an anonymous caller can make
// the server do 100k PBKDF2 iterations. Without a limiter that is both a
// credential-stuffing oracle and a cheap way to saturate the threadpool, so
// every password-verifying route is bucketed here.
//
// Keyed on IP *and* submitted email: per-IP alone lets a botnet spray one
// account, per-email alone lets one IP enumerate the whole user table.

const WINDOW_MS = 15 * 60 * 1000;

function submittedEmail(req: Request): string {
  const raw = (req.body as { email?: unknown } | undefined)?.email;
  return typeof raw === "string" ? raw.trim().toLowerCase().slice(0, 320) : "";
}

// ipKeyGenerator normalises IPv6 to a /56 prefix — without it a single host
// with a v6 allocation gets an effectively unlimited number of keys.
function ipAndEmailKey(req: Request): string {
  return `${ipKeyGenerator(req.ip ?? "unknown")}|${submittedEmail(req)}`;
}

const TOO_MANY = {
  error: "too_many_requests",
  message: "Too many attempts. Please wait and try again.",
};

/** Sign-in attempts (customer + admin). Deliberately tight. */
export const loginRateLimit = rateLimit({
  windowMs: WINDOW_MS,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: ipAndEmailKey,
  message: TOO_MANY,
});

/** Account creation. Also blunts mass-registration for order harvesting. */
export const registerRateLimit = rateLimit({
  windowMs: WINDOW_MS,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: ipAndEmailKey,
  message: TOO_MANY,
});

/** Public order-quote endpoint. Bounded per IP so code enumeration stays
 * expensive; generous enough for normal checkout interaction (code entry,
 * payment-method switches re-quote). */
export const quoteRateLimit = rateLimit({
  windowMs: WINDOW_MS,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? "unknown"),
  message: TOO_MANY,
});

/** Order creation. Tighter than quote — every accepted body writes an order +
 * attestation row with no payment required, and the same 422 rejections would
 * otherwise make it an unthrottled code-enumeration oracle. */
export const createOrderRateLimit = rateLimit({
  windowMs: WINDOW_MS,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? "unknown"),
  message: TOO_MANY,
});
