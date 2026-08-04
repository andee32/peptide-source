import type { Plugin } from "vite";
// Relative import (not the workspace specifier) so Vite bundles the source into
// the config instead of trying to `import` a .ts file at runtime.
import { resolveBrand, type Brand } from "../../lib/brand/src/index";
import {
  paletteCss,
  resolveBrandPalette,
  type BrandPalette,
} from "../../lib/brand/src/palette";

const PALETTE_ID = "virtual:brand-palette.css";
const RESOLVED_PALETTE_ID = `\0${PALETTE_ID}`;

function fontLink(url: string): string {
  if (!url) return "";
  return `<link href="${url}" rel="stylesheet">`;
}

function manifest(brand: Brand): string {
  return JSON.stringify(
    {
      name: brand.name,
      short_name: brand.shortName,
      description: brand.tagline,
      start_url: "/",
      display: "standalone",
      background_color: brand.backgroundColor,
      theme_color: brand.themeColor,
      icons: [{ src: brand.iconSrc, sizes: "any", type: "image/svg+xml" }],
    },
    null,
    2,
  );
}

/**
 * Resolves the brand once at config time and hands it to every consumer: the
 * app bundle (via the `__BRAND__` define — the browser has no access to the
 * unprefixed env), the `index.html` head, and the PWA manifest.
 */
export function brandPlugin(env: Record<string, string | undefined>): Plugin {
  const brand = resolveBrand(env);
  const palette: BrandPalette = resolveBrandPalette(env);

  return {
    name: "brand",
    config() {
      return { define: { __BRAND__: JSON.stringify(brand) } };
    },
    resolveId(id) {
      return id === PALETTE_ID ? RESOLVED_PALETTE_ID : null;
    },
    load(id) {
      return id === RESOLVED_PALETTE_ID ? paletteCss(palette) : null;
    },
    transformIndexHtml(html) {
      return html
        .replace(/%BRAND_FONT_CSS%/g, fontLink(palette.fontCssUrl))
        .replace(/%BRAND_NAME%/g, brand.name)
        .replace(/%BRAND_TAGLINE%/g, brand.tagline)
        .replace(/%BRAND_ICON%/g, brand.iconSrc)
        .replace(/%BRAND_OG_IMAGE%/g, brand.ogImageSrc)
        .replace(/%BRAND_THEME_COLOR%/g, brand.themeColor);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] !== "/manifest.json") return next();
        res.setHeader("Content-Type", "application/manifest+json");
        res.end(manifest(brand));
      });
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "manifest.json",
        source: manifest(brand),
      });
    },
  };
}
