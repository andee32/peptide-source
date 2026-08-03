import type { Brand } from "@app/brand";

/**
 * Brand for the browser bundle, inlined at build time by
 * `vite-plugin-brand.ts` from the unprefixed `BRAND_*` env — never hardcode a
 * company name, contact detail or logo path in a component.
 */
declare const __BRAND__: Brand;

export const brand: Brand = __BRAND__;
