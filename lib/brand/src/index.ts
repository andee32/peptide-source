/**
 * Single source of truth for every customer-visible brand detail (name, legal
 * entity, domain, contact points, logo assets, PWA colours). Nothing else in
 * the tree should hardcode a company name, address, email or logo path.
 *
 * Values come from env so a rebrand is a config change, not a code change.
 * Both plain (`BRAND_NAME`, server) and Vite-exposed (`VITE_BRAND_NAME`,
 * browser) keys are accepted, so one `.env` drives the API and the storefront.
 */
export interface Brand {
  /** Display name used in copy, emails and the wordmark. */
  name: string;
  /** Uppercase wordmark variant rendered in the header/footer. */
  wordmark: string;
  /** Registered entity used for payment beneficiary names and legal copy. */
  legalName: string;
  /** Compact name for PWA icons / tight spaces. */
  shortName: string;
  /** One-line positioning statement. */
  tagline: string;
  /** Bare apex domain, e.g. "example.com". */
  domain: string;
  /** Public storefront origin. */
  siteUrl: string;
  /** Inbound support/contact address. */
  supportEmail: string;
  /** Outbound (transactional) from-address. */
  fromEmail: string;
  /** Contact phone in display form; empty string hides it. */
  supportPhone: string;
  /**
   * Full postal address of the legal entity, newline-separated. Required on the
   * legal pages and in any promotional email (CAN-SPAM); empty string means it
   * has not been provisioned yet and dependent surfaces stay guarded.
   */
  postalAddress: string;
  /** Jurisdiction whose law governs the Terms, e.g. "Delaware". */
  governingLaw: string;
  /** Logo used in the header, footer, admin and RUO gate. */
  logoSrc: string;
  /** Square icon used for favicon / apple-touch-icon / PWA. */
  iconSrc: string;
  /** Social sharing image. */
  ogImageSrc: string;
  /** PWA + <meta name="theme-color"> values. */
  themeColor: string;
  backgroundColor: string;
}

export type BrandEnv = Record<string, string | undefined>;

/**
 * Deliberately generic placeholders: the app ships unbranded and every value
 * is expected to be supplied per deployment.
 */
export const brandDefaults: Brand = {
  name: "Peptide Source",
  wordmark: "PEPTIDE SOURCE",
  legalName: "Peptide Source LLC",
  shortName: "Peptide Source",
  tagline: "Lab-verified research peptide sourcing, built for wholesale.",
  domain: "example.com",
  siteUrl: "https://example.com",
  supportEmail: "info@example.com",
  fromEmail: "noreply@example.com",
  supportPhone: "",
  postalAddress: "",
  governingLaw: "",
  logoSrc: "/brand/logo.svg",
  iconSrc: "/brand/icon.svg",
  ogImageSrc: "/brand/logo.svg",
  themeColor: "#f5f4f0",
  backgroundColor: "#f5f4f0",
};

function read(env: BrandEnv, key: string): string | undefined {
  const value = env[key] ?? env[`VITE_${key}`];
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Builds the brand from an env bag: `process.env` on the server,
 * `import.meta.env` in the storefront. Unset values fall back to a derived
 * value (domain-based URLs/addresses) and then to `brandDefaults`.
 */
export function resolveBrand(env: BrandEnv = {}): Brand {
  const name = read(env, "BRAND_NAME") ?? brandDefaults.name;
  const domain = read(env, "BRAND_DOMAIN") ?? brandDefaults.domain;

  return {
    name,
    wordmark: read(env, "BRAND_WORDMARK") ?? name.toUpperCase(),
    legalName: read(env, "BRAND_LEGAL_NAME") ?? name,
    shortName: read(env, "BRAND_SHORT_NAME") ?? name,
    tagline: read(env, "BRAND_TAGLINE") ?? brandDefaults.tagline,
    domain,
    siteUrl: read(env, "SITE_URL") ?? `https://${domain}`,
    supportEmail: read(env, "BRAND_SUPPORT_EMAIL") ?? `info@${domain}`,
    fromEmail:
      read(env, "SMTP_FROM") ??
      read(env, "BRAND_SUPPORT_EMAIL") ??
      `noreply@${domain}`,
    supportPhone: read(env, "BRAND_SUPPORT_PHONE") ?? brandDefaults.supportPhone,
    postalAddress:
      read(env, "BRAND_POSTAL_ADDRESS") ?? brandDefaults.postalAddress,
    governingLaw: read(env, "BRAND_GOVERNING_LAW") ?? brandDefaults.governingLaw,
    logoSrc: read(env, "BRAND_LOGO_SRC") ?? brandDefaults.logoSrc,
    iconSrc: read(env, "BRAND_ICON_SRC") ?? brandDefaults.iconSrc,
    ogImageSrc: read(env, "BRAND_OG_IMAGE_SRC") ?? brandDefaults.ogImageSrc,
    themeColor: read(env, "BRAND_THEME_COLOR") ?? brandDefaults.themeColor,
    backgroundColor:
      read(env, "BRAND_BACKGROUND_COLOR") ?? brandDefaults.backgroundColor,
  };
}
