import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCurrentCustomer,
  useLoginCustomer,
  useLogoutCustomer,
  useRegisterCustomer,
  type CustomerSession,
  type CustomerUser,
} from "@atlab/api-client-react";

/**
 * B2C retail shopper session. Optional by design — guest checkout still works;
 * signing in only adds order history + reorder, and stamps the order with the
 * customer id (the server reads the bearer token off POST /api/orders).
 *
 * The token is an opaque bearer session (revoked server-side on logout), so it
 * lives in localStorage the same way the wholesale access token does.
 */
const STORAGE_KEY = "customer_session";
const EVENT = "customer-session-change";

export type StoredCustomerSession = CustomerSession;

function read(): StoredCustomerSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredCustomerSession>;
    if (!parsed.token || !parsed.user?.id) return null;
    if (parsed.expiresAt && Date.parse(parsed.expiresAt) <= Date.now()) return null;
    return {
      token: parsed.token,
      expiresAt: parsed.expiresAt ?? "",
      user: parsed.user as CustomerUser,
    };
  } catch {
    return null;
  }
}

// Cached so getSnapshot keeps a stable reference between changes
// (useSyncExternalStore requires referential stability).
let cache: StoredCustomerSession | null = read();

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

function getSnapshot(): StoredCustomerSession | null {
  return cache;
}

function writeSession(next: StoredCustomerSession | null) {
  if (next) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
  cache = next;
  window.dispatchEvent(new Event(EVENT));
}

function statusOf(err: unknown): number | undefined {
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

/** Bearer headers for a token, or `{}` when signed out. */
export function bearerHeaders(token?: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Token-only view of the session — no network. Use where a component just needs
 * to attach the bearer header (e.g. checkout).
 */
export function useCustomerSession(): StoredCustomerSession | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

export function useCustomerAuth() {
  const session = useCustomerSession();
  const token = session?.token ?? null;
  const queryClient = useQueryClient();

  const request = useMemo(() => ({ headers: bearerHeaders(token) }), [token]);

  // Verifies the stored token against the server and keeps the profile fresh.
  const me = useGetCurrentCustomer({
    request,
    query: {
      enabled: !!token,
      retry: false,
      queryKey: ["/api/auth/me", token],
    },
  });

  // A revoked or expired token should not linger in localStorage.
  useEffect(() => {
    if (token && me.isError && statusOf(me.error) === 401) {
      writeSession(null);
    }
  }, [token, me.isError, me.error]);

  const registerMutation = useRegisterCustomer();
  const loginMutation = useLoginCustomer();
  const logoutMutation = useLogoutCustomer({ request });

  const clearAuthQueries = useCallback(() => {
    queryClient.removeQueries({
      predicate: (query) =>
        typeof query.queryKey[0] === "string" &&
        (query.queryKey[0] as string).startsWith("/api/auth"),
    });
  }, [queryClient]);

  const register = useCallback(
    async (input: { email: string; password: string; name?: string }) => {
      const next = await registerMutation.mutateAsync({ data: input });
      clearAuthQueries();
      writeSession(next);
      return next;
    },
    [registerMutation, clearAuthQueries],
  );

  const login = useCallback(
    async (input: { email: string; password: string }) => {
      const next = await loginMutation.mutateAsync({ data: input });
      clearAuthQueries();
      writeSession(next);
      return next;
    },
    [loginMutation, clearAuthQueries],
  );

  const logout = useCallback(async () => {
    try {
      if (token) await logoutMutation.mutateAsync();
    } catch {
      // Server-side revoke is best-effort; the local session goes either way.
    }
    writeSession(null);
    clearAuthQueries();
  }, [token, logoutMutation, clearAuthQueries]);

  return {
    /** The signed-in shopper, or null. Prefers the freshly fetched profile. */
    customer: (me.data ?? session?.user ?? null) as CustomerUser | null,
    token,
    /** Bearer headers to pass as `request` to generated hooks / raw fetch. */
    request,
    isLoading: !!token && me.isLoading,
    login,
    register,
    logout,
    isRegistering: registerMutation.isPending,
    isLoggingIn: loginMutation.isPending,
  };
}
