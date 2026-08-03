import { resolveBrand } from "@app/brand";

/**
 * Brand for the browser bundle. Values come from `VITE_BRAND_*` env at build
 * time — never hardcode a company name, contact detail or logo path in a
 * component.
 */
export const brand = resolveBrand(
  import.meta.env as unknown as Record<string, string | undefined>,
);
