import { describe, expect, it } from "vitest";
import {
  paletteCss,
  paletteDefaults,
  resolveBrandPalette,
} from "@app/brand/palette";

describe("resolveBrandPalette", () => {
  it("falls back to the defaults when nothing is set", () => {
    expect(resolveBrandPalette({})).toEqual(paletteDefaults);
  });

  it("accepts bare hex, which is how dotenv delivers an unquoted value", () => {
    // `BRAND_COLOR_PRIMARY=#ff0066` in a .env is read as a comment, so the
    // unprefixed form has to work too.
    expect(resolveBrandPalette({ BRAND_COLOR_PRIMARY: "ff0066" }).primary).toBe(
      "#ff0066",
    );
    expect(resolveBrandPalette({ BRAND_COLOR_PRIMARY: "#ff0066" }).primary).toBe(
      "#ff0066",
    );
  });

  it("leaves non-hex colour values (e.g. named/oklch) untouched", () => {
    expect(
      resolveBrandPalette({ BRAND_COLOR_PRIMARY: "oklch(70% 0.2 200)" }).primary,
    ).toBe("oklch(70% 0.2 200)");
  });

  it("treats an empty font stylesheet URL as an opt-out, not as unset", () => {
    expect(resolveBrandPalette({ BRAND_FONT_CSS_URL: "" }).fontCssUrl).toBe("");
    expect(resolveBrandPalette({}).fontCssUrl).toBe(paletteDefaults.fontCssUrl);
  });

  it("reads VITE_-prefixed keys as well", () => {
    expect(
      resolveBrandPalette({ VITE_BRAND_COLOR_ACCENT: "16a34a" }).accent,
    ).toBe("#16a34a");
  });

  it("renders only the CSS-backed entries", () => {
    const css = paletteCss(resolveBrandPalette({ BRAND_COLOR_PRIMARY: "ff0066" }));
    expect(css).toContain("--brand-teal: #ff0066;");
    expect(css).not.toContain("fontCssUrl");
  });
});
