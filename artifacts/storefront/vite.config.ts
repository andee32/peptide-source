import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { brandPlugin } from "./vite-plugin-brand";
import { assertLegalDocumentsApproved } from "./src/pages/legal/status";

// Dev/build defaults: standalone storefront serves at root on 5173. Override
// PORT / BASE_PATH via env for sub-path or alternate-port deployments.
const port = Number(process.env.PORT ?? "5173");

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env.PORT}"`);
}

const basePath = process.env.BASE_PATH ?? "/";

const apiTarget = process.env.API_PROXY_TARGET ?? "http://localhost:8080";

// Brand env lives in the repo-root `.env` (the same file the API loads) and is
// read unprefixed, so a rebrand needs one set of BRAND_* keys rather than a
// VITE_-prefixed duplicate of each.
const rootDir = path.resolve(import.meta.dirname, "..", "..");

export default defineConfig(async ({ mode }) => {
  // Unreviewed policy drafts must never be published as a live store's terms —
  // a deploy build (ENFORCE_LEGAL_REVIEW=1) fails outright rather than letting
  // them reach customers; other builds only warn.
  assertLegalDocumentsApproved(process.env);

  return {
    base: basePath,
    plugins: [
      react(),
      tailwindcss(),
      brandPlugin({ ...loadEnv(mode, rootDir, ""), ...process.env }),
      runtimeErrorOverlay(),
      ...(process.env.NODE_ENV !== "production" &&
      process.env.REPL_ID !== undefined
        ? [
            await import("@replit/vite-plugin-cartographer").then((m) =>
              m.cartographer({
                root: path.resolve(import.meta.dirname, ".."),
              }),
            ),
            await import("@replit/vite-plugin-dev-banner").then((m) =>
              m.devBanner(),
            ),
          ]
        : []),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
        "@assets": path.resolve(
          import.meta.dirname,
          "..",
          "..",
          "attached_assets",
        ),
      },
      dedupe: ["react", "react-dom"],
    },
    root: path.resolve(import.meta.dirname),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
    },
    server: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
        },
      },
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
    },
    preview: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
    },
  };
});
