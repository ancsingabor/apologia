import type { Locale } from "./copy";

/**
 * Per-project brand configuration.
 *
 * Everything user-facing that isn't a reusable component lives here or in
 * `config/copy/`.
 *
 * Note on `locale`: unlike the template this repo grew from, the active
 * language is NOT decided here. Apologia serves Hungarian and English from the
 * same deployment under `/hu/...` and `/en/...`, so the locale is a per-request
 * value resolved from the URL. `defaultLocale` below only decides where a
 * request with no locale segment gets redirected. See ADR-013.
 *
 * Note on `theme`: also unlike the template, there is no theme field. The
 * template let one codebase be re-skinned per client; this is one product with
 * one theme, and `config/theme.ts` holds it directly.
 */
export interface Brand {
  /** Short product name, used in nav and metadata. */
  name: string;
  /** One-line description, used in default <meta description> and hero. */
  tagline: string;
  /** Where a request without a locale segment is sent. */
  defaultLocale: Locale;
  /** Locales this deployment serves, in menu order. */
  locales: readonly Locale[];
  /** Public contact details (optional, surfaced in footer). */
  contact: {
    email?: string;
  };
}

export const brand: Brand = {
  name: "Apologia",
  tagline: "Hittani kérdések, forrásokkal megválaszolva.",
  defaultLocale: "hu",
  locales: ["hu", "en"] as const,
  contact: {
    email: undefined,
  },
};
