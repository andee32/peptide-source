import { useGetSettings } from "@atlab/api-client-react";

// Global storefront settings, read from GET /settings. Defaults to showVialImages
// true while loading or on error so images are never hidden by a transient failure.
export function useStoreSettings(): { showVialImages: boolean } {
  const { data } = useGetSettings();
  return { showVialImages: data?.showVialImages ?? true };
}
