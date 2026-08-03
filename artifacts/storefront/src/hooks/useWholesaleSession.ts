import { useMemo } from "react";
import { useGetCurrentCustomer } from "@app/api-client-react";
import { useCustomerSession, bearerHeaders } from "./useCustomerAuth";

/**
 * Wholesale "signed-in" state — post-cutover, session-only.
 *
 * There is one identity: the retail login. Wholesale access is derived entirely
 * from that login's /auth/me `wholesale` block, which appears once the account
 * is linked to this identity and approved. Auth travels as the customer Bearer
 * session; wholesale requests carry channel:"wholesale" and the server resolves
 * the account and price tier. No access token is ever held client-side.
 *
 * The hook hands pages ready-made `wholesaleHeaders` (for gated GETs) and
 * `wholesaleOrderFields` (for order/quote bodies) so no page hand-rolls the
 * transport.
 */
export interface WholesaleSession {
  accountId: string;
  businessName: string;
  priceTierName: string | null;
}

export function useWholesaleSession() {
  const customer = useCustomerSession();

  // /auth/me — only meaningful when signed in; the wholesale block appears once
  // the account is linked to this identity and approved.
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
      };
    }
    return null;
  }, [me.data]);

  // Headers for a wholesale-authenticated GET (kit catalog).
  const wholesaleHeaders: Record<string, string> = useMemo(
    () => (session ? bearerHeaders(customer?.token) : {}),
    [session, customer?.token],
  );

  // Wholesale fields to merge into an order/quote body.
  const wholesaleOrderFields: Record<string, unknown> = useMemo(
    () => (session ? { channel: "wholesale" } : {}),
    [session],
  );

  return { session, wholesaleHeaders, wholesaleOrderFields };
}
