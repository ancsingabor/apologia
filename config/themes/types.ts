/**
 * Theme contract shared by every preset in `config/themes/`.
 *
 * A theme is pure data: design tokens (colors, fonts, radii, shadows) that the
 * app turns into CSS custom properties at build time. Swapping the active theme
 * (see `config/brand.ts`) re-skins the whole app without touching components,
 * because every component styles itself with Tailwind utilities that map to
 * these tokens (e.g. `bg-primary`, `text-text-primary`, `border-border`).
 */

/** Google Font family names (must be importable by `next/font/google`). */
export interface ThemeFonts {
  /** Headings — mapped to the `--font-heading` CSS variable / `font-heading`. */
  heading: GoogleFontName;
  /** Body copy — mapped to `--font-body` / `font-body` (also the sans default). */
  body: GoogleFontName;
}

/**
 * Fonts the template can load out of the box. `next/font` requires *static*
 * imports, so the loadable set is fixed in `app/layout.tsx`. Add a font there
 * (and to this union) if a preset needs one that isn't listed.
 */
export type GoogleFontName =
  | "Inter"
  | "Figtree"
  | "Plus Jakarta Sans"
  | "Playfair Display"
  | "Lato";

/**
 * Every color token the design system exposes. Keys here become
 * `--color-<key>` CSS variables and `<utility>-<key>` Tailwind classes.
 * Keep this list in sync with the `@theme inline` block in `app/globals.css`.
 */
export interface ThemeColors {
  primary: string;
  "primary-hover": string;
  "primary-light": string;
  "primary-subtle": string;
  "primary-border": string;

  secondary: string;
  "secondary-dark": string;
  "secondary-subtle": string;

  accent: string;
  "accent-hover": string;
  "accent-subtle": string;

  "surface-page": string;
  "surface-card": string;
  "surface-subtle": string;
  "surface-admin": string;

  "text-primary": string;
  "text-secondary": string;
  "text-muted": string;
  "text-inverted": string;

  border: string;
  "border-subtle": string;
  "border-focus": string;

  "status-pending": string;
  "status-confirmed": string;
  "status-completed": string;
  "status-cancelled": string;
  "status-no-show": string;
}

export interface ThemeShadows {
  card: string;
  "card-hover": string;
  modal: string;
}

export interface Theme {
  /** Stable identifier, also used as the active-theme key. */
  name: string;
  /** Human label for docs / theme pickers. */
  label: string;
  fonts: ThemeFonts;
  colors: ThemeColors;
  shadows: ThemeShadows;
}

export type ThemeName = "default" | "bakery" | "medical";
