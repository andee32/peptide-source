import { pbkdf2, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

// PBKDF2-SHA256, 100000 iterations, 32-byte derived key, serialized as
// "salt:hash" (both hex). This is the exact scheme ADMIN_PASSWORD_HASH already
// uses, so env-provisioned credentials verify unchanged against the DB rows.
//
// Async by necessity: a 100k-iteration derivation is ~50-100ms of CPU. Done
// synchronously it blocks the whole event loop, so a burst of login attempts
// would stall unrelated work — including the BTCPay webhook. The promisified
// form runs on the libuv threadpool instead.
const ITERATIONS = 100000;
const KEYLEN = 32;
const DIGEST = "sha256";

const pbkdf2Async = promisify(pbkdf2);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (
    await pbkdf2Async(password, salt, ITERATIONS, KEYLEN, DIGEST)
  ).toString("hex");
  return `${salt}:${hash}`;
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = (
    await pbkdf2Async(password, salt, ITERATIONS, KEYLEN, DIGEST)
  ).toString("hex");
  try {
    return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
  } catch {
    return false;
  }
}

// A well-formed hash of a value nobody can supply. Verifying against this on the
// "user not found" path keeps login latency constant, so response time no longer
// discloses whether an email is registered.
export const DUMMY_PASSWORD_HASH =
  "00000000000000000000000000000000:" +
  "0000000000000000000000000000000000000000000000000000000000000000";

/** Burn the same CPU as a real verify, then fail. Never returns true. */
export async function verifyDummyPassword(password: string): Promise<void> {
  await verifyPassword(password, DUMMY_PASSWORD_HASH);
}
