import { useSyncExternalStore, useCallback } from "react";

/**
 * Lightweight "signed-in" state for an approved wholesale account.
 * Persisted in localStorage so the buyer stays in wholesale mode across
 * page loads. The token is the account access token shown at apply time —
 * it is sent to POST /api/orders so the backend applies tier pricing + MOQ.
 */
export interface WholesaleSession {
  accountId: string;
  token: string;
  businessName: string;
  priceTierName: string | null;
}

const STORAGE_KEY = "wholesale_session";
const EVENT = "wholesale-session-change";

function read(): WholesaleSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WholesaleSession>;
    if (!parsed.accountId || !parsed.token) return null;
    return {
      accountId: parsed.accountId,
      token: parsed.token,
      businessName: parsed.businessName ?? "",
      priceTierName: parsed.priceTierName ?? null,
    };
  } catch {
    return null;
  }
}

// Cache the parsed value so getSnapshot returns a stable reference between
// changes (useSyncExternalStore requires referential stability).
let cache: WholesaleSession | null = read();

function subscribe(callback: () => void): () => void {
  const handler = () => {
    cache = read();
    callback();
  };
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

function getSnapshot(): WholesaleSession | null {
  return cache;
}

export function useWholesaleSession() {
  const session = useSyncExternalStore(subscribe, getSnapshot, () => null);

  const set = useCallback((next: WholesaleSession) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    cache = next;
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const clear = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    cache = null;
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { session, set, clear };
}
