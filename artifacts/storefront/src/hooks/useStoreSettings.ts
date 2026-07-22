import { useGetSettings } from "@atlab/api-client-react";

// Global storefront settings, read from GET /settings. Defaults to showVialImages
// true while loading or on error so images are never hidden by a transient failure.
// cryptoDiscountBps mirrors the server default (1000 = 10%) for checkout preview;
// the server remains authoritative at order creation.
export function useStoreSettings(): {
  showVialImages: boolean;
  cryptoDiscountBps: number;
} {
  const { data } = useGetSettings();
  return {
    showVialImages: data?.showVialImages ?? true,
    cryptoDiscountBps: data?.cryptoDiscountBps ?? 1000,
  };
}
