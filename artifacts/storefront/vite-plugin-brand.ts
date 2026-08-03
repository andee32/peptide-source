import type { Plugin } from "vite";
// Relative import (not the workspace specifier) so Vite bundles the source into
// the config instead of trying to `import` a .ts file at runtime.
import { resolveBrand, type Brand } from "../../lib/brand/src/index";

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
 * Renders the brand into the shell that React never owns: the `index.html`
 * head (title, icons, social tags) and the PWA manifest. Keeps those in sync
 * with the same `BRAND_*` env the app and the API read.
 */
export function brandPlugin(env: Record<string, string | undefined>): Plugin {
  const brand = resolveBrand(env);

  return {
    name: "brand",
    transformIndexHtml(html) {
      return html
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
