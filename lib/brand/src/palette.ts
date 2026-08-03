/**
 * The visual half of the brand: colours and type families. Same contract as
 * `resolveBrand` — every value comes from env so re-skinning the storefront for
 * another company is a config change, not a CSS edit.
 *
 * Env keys are named after the *role* a colour plays; the CSS variables they
 * feed keep their historical colour names (`--brand-navy` and friends) so the
 * Tailwind utility names stay stable.
 */
import type { BrandEnv } from "./index";

export interface BrandPalette {
  /** Structural colour: headings, nav, footer ground (`--brand-navy`). */
  structure: string;
  /** Darker structural shade for borders/hover on structure surfaces. */
  structureDark: string;
  /** Deep ground used by the `.section-deep` hero band. */
  structureDeep: string;
  /** Secondary/link colour. */
  secondary: string;
  /** Soft fill for selected states and accent surfaces. */
  secondaryTint: string;
  /** Primary action colour: CTAs, focus rings. */
  primary: string;
  /** Hover/active shade of `primary`; also used for text on light. */
  primaryDark: string;
  /** Premium / trust accent: COA-verified badges. */
  accent: string;
  /** Soft fill companion to `accent`. */
  accentTint: string;

  /** App ground. */
  background: string;
  /** Cards and panels. */
  surface: string;
  /** Subtly raised surface: table headers, muted fills. */
  surfaceRaised: string;
  /** Primary text. */
  ink: string;
  /** Secondary text. */
  inkMuted: string;
  /** Hairlines. */
  border: string;

  success: string;
  successTint: string;
  warning: string;
  warningTint: string;
  danger: string;
  dangerTint: string;

  /** Font stack for headings. */
  fontDisplay: string;
  /** Font stack for body copy. */
  fontBody: string;
  /** Font stack for numeric/lab data. */
  fontMono: string;
  /** Stylesheet that loads the above families; empty string loads nothing. */
  fontCssUrl: string;
}

export const paletteDefaults: BrandPalette = {
  structure: "#1a4d6e",
  structureDark: "#123a54",
  structureDeep: "#0a1628",
  secondary: "#2e7da8",
  secondaryTint: "#d6eaf5",
  primary: "#00b4c4",
  primaryDark: "#0797a6",
  accent: "#c8a84b",
  accentTint: "#f3ecd3",

  background: "#f5f4f0",
  surface: "#ffffff",
  surfaceRaised: "#ecefec",
  ink: "#0e1117",
  inkMuted: "#6b7280",
  border: "#d1d9e0",

  success: "#167a52",
  successTint: "#d6ece1",
  warning: "#b5750a",
  warningTint: "#f4e8cf",
  danger: "#c0392b",
  dangerTint: "#f6dcd8",

  fontDisplay: '"Inter", ui-sans-serif, system-ui, sans-serif',
  fontBody: '"Lato", ui-sans-serif, system-ui, -apple-system, sans-serif',
  fontMono: '"DM Mono", ui-monospace, "SF Mono", Menlo, monospace',
  fontCssUrl:
    "https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700;800;900&family=Lato:wght@300;400;700;900&family=DM+Mono:wght@400;500&display=swap",
};

/** Env key per palette entry, e.g. `BRAND_COLOR_PRIMARY=#00b4c4`. */
const envKeys: Record<keyof BrandPalette, string> = {
  structure: "BRAND_COLOR_STRUCTURE",
  structureDark: "BRAND_COLOR_STRUCTURE_DARK",
  structureDeep: "BRAND_COLOR_STRUCTURE_DEEP",
  secondary: "BRAND_COLOR_SECONDARY",
  secondaryTint: "BRAND_COLOR_SECONDARY_TINT",
  primary: "BRAND_COLOR_PRIMARY",
  primaryDark: "BRAND_COLOR_PRIMARY_DARK",
  accent: "BRAND_COLOR_ACCENT",
  accentTint: "BRAND_COLOR_ACCENT_TINT",
  background: "BRAND_COLOR_BACKGROUND",
  surface: "BRAND_COLOR_SURFACE",
  surfaceRaised: "BRAND_COLOR_SURFACE_RAISED",
  ink: "BRAND_COLOR_INK",
  inkMuted: "BRAND_COLOR_INK_MUTED",
  border: "BRAND_COLOR_BORDER",
  success: "BRAND_COLOR_SUCCESS",
  successTint: "BRAND_COLOR_SUCCESS_TINT",
  warning: "BRAND_COLOR_WARNING",
  warningTint: "BRAND_COLOR_WARNING_TINT",
  danger: "BRAND_COLOR_DANGER",
  dangerTint: "BRAND_COLOR_DANGER_TINT",
  fontDisplay: "BRAND_FONT_DISPLAY",
  fontBody: "BRAND_FONT_BODY",
  fontMono: "BRAND_FONT_MONO",
  fontCssUrl: "BRAND_FONT_CSS_URL",
};

/** CSS custom property fed by each palette entry. */
const cssVars: Record<keyof BrandPalette, string | null> = {
  structure: "--brand-navy",
  structureDark: "--brand-navy-700",
  structureDeep: "--brand-navy-900",
  secondary: "--brand-blue",
  secondaryTint: "--brand-blue-tint",
  primary: "--brand-teal",
  primaryDark: "--brand-teal-600",
  accent: "--brand-gold",
  accentTint: "--brand-gold-tint",
  background: "--brand-bg",
  surface: "--brand-surface",
  surfaceRaised: "--brand-surface-2",
  ink: "--brand-ink",
  inkMuted: "--brand-ink-muted",
  border: "--brand-border",
  success: "--brand-good",
  successTint: "--brand-good-tint",
  warning: "--brand-warn",
  warningTint: "--brand-warn-tint",
  danger: "--brand-crit",
  dangerTint: "--brand-crit-tint",
  fontDisplay: "--brand-font-display",
  fontBody: "--brand-font-body",
  fontMono: "--brand-font-mono",
  fontCssUrl: null,
};

const paletteKeys = Object.keys(paletteDefaults) as (keyof BrandPalette)[];

export function resolveBrandPalette(env: BrandEnv = {}): BrandPalette {
  const resolved = {} as BrandPalette;

  for (const key of paletteKeys) {
    const raw = env[envKeys[key]] ?? env[`VITE_${envKeys[key]}`];
    const trimmed = raw?.trim();
    resolved[key] = trimmed ? trimmed : paletteDefaults[key];
  }

  return resolved;
}

/**
 * Renders the palette as a `:root` block. Emitted as a stylesheet that loads
 * after `index.css`, so it overrides the fallbacks declared there.
 */
export function paletteCss(palette: BrandPalette): string {
  const declarations = paletteKeys
    .map((key) => {
      const cssVar = cssVars[key];
      return cssVar ? `  ${cssVar}: ${palette[key]};` : null;
    })
    .filter((line): line is string => line !== null)
    .join("\n");

  return `/* Generated from BRAND_COLOR_* / BRAND_FONT_* env. Do not edit. */\n:root {\n${declarations}\n}\n`;
}
