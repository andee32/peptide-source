import { useSyncExternalStore, useCallback, useMemo } from "react";
import { useGetCurrentCustomer } from "@atlab/api-client-react";
import { useCustomerSession, bearerHeaders } from "./useCustomerAuth";

/**
 * Wholesale "signed-in" state — account-unification dual-auth window.
 *
 * PREFERRED (session mode): derived from the retail login's /auth/me wholesale
 * block. Auth travels as the customer Bearer session; wholesale requests carry
 * channel:"wholesale" and the server resolves the account/tier. No token is
 * held client-side.
 *
 * FALLBACK (legacy mode): the old localStorage access token, for buyers who
 * haven't logged in yet. The backend still honours it during the window.
 *
 * The hook hands pages ready-made `wholesaleHeaders` (for gated GETs) and
 * `wholesaleOrderFields` (for order/quote bodies) so no page hand-rolls the
 * transport — the mode difference lives here only.
 */
export interface WholesaleSession {
  accountId: string;
  businessName: string;
  priceTierName: string | null;
  mode: "session" | "legacy";
  /** legacy mode only — the account access token */
  token?: string;
}

// ── Legacy localStorage token (fallback) ──────────────────────────────────────
const STORAGE_KEY = "wholesale_session";
const EVENT = "wholesale-session-change";

interface LegacyStored {
  accountId: string;
  token: string;
  businessName: string;
  priceTierName: string | null;
}

function readLegacy(): LegacyStored | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<LegacyStored>;
    if (!p.accountId || !p.token) return null;
    return {
      accountId: p.accountId,
      token: p.token,
      businessName: p.businessName ?? "",
      priceTierName: p.priceTierName ?? null,
    };
  } catch {
    return null;
  }
}

let legacyCache: LegacyStored | null = readLegacy();

function subscribe(cb: () => void): () => void {
  const handler = () => {
    legacyCache = readLegacy();
    cb();
  };
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}
function getLegacy(): LegacyStored | null {
  return legacyCache;
}

export function useWholesaleSession() {
  const customer = useCustomerSession();
  const legacy = useSyncExternalStore(subscribe, getLegacy, () => null);

  // /auth/me — only meaningful when signed in; the wholesale block appears once
  // the account is linked to this identity (backfill) and approved.
  const me = useGetCurrentCustomer({
    query: { enabled: !!customer?.token, queryKey: ["/api/auth/me", customer?.token] },
    request: { headers: bearerHeaders(customer?.token) },
  });

  const session: WholesaleSession | null = useMemo(() => {
    const ws = me.data?.wholesale;
    if (ws && ws.status === "approved") {
      return {
        accountId: ws.accountId,
        businessName: ws.businessName,
        priceTierName: ws.priceTierName ?? null,
        mode: "session",
      };
    }
    if (legacy) {
      return {
        accountId: legacy.accountId,
        businessName: legacy.businessName,
        priceTierName: legacy.priceTierName,
        mode: "legacy",
        token: legacy.token,
      };
    }
    return null;
  }, [me.data, legacy]);

  // Headers for a wholesale-authenticated GET (kit catalog).
  const wholesaleHeaders: Record<string, string> = useMemo(() => {
    if (!session) return {};
    return session.mode === "session"
      ? bearerHeaders(customer?.token)
      : { "x-account-token": session.token! };
  }, [session, customer?.token]);

  // Wholesale fields to merge into an order/quote body.
  const wholesaleOrderFields: Record<string, unknown> = useMemo(() => {
    if (!session) return {};
    return session.mode === "session"
      ? { channel: "wholesale" }
      : { accountId: session.accountId, token: session.token };
  }, [session]);

  // Legacy token lookup path (WholesaleAccountPage) — still supported in the
  // window. Writing a legacy session is a no-op once the user is logged in with
  // an approved profile (the session block wins).
  const set = useCallback((next: LegacyStored) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    legacyCache = next;
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const clear = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    legacyCache = null;
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { session, wholesaleHeaders, wholesaleOrderFields, set, clear };
}
