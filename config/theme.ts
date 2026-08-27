import { brand } from "./brand";
import type { Theme, ThemeName } from "./themes/types";
import { defaultTheme } from "./themes/default";
import { bakeryTheme } from "./themes/bakery";
import { medicalTheme } from "./themes/medical";

const THEMES: Record<ThemeName, Theme> = {
  default: defaultTheme,
  bakery: bakeryTheme,
  medical: medicalTheme,
};

/** The theme selected in `config/brand.ts`. */
export const activeTheme: Theme = THEMES[brand.theme] ?? defaultTheme;

/**
 * Render the active theme's tokens as a `:root { ... }` CSS string.
 *
 * Injected once in `app/layout.tsx` so colors/shadows are config-driven while
 * `app/globals.css` keeps only the static Tailwind `@theme` mapping. Components
 * never reference hex values — they use the `--color-*` variables emitted here.
 */
export function themeCssVars(theme: Theme = activeTheme): string {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(theme.colors)) {
    lines.push(`--color-${key}: ${value};`);
  }
  for (const [key, value] of Object.entries(theme.shadows)) {
    lines.push(`--shadow-${key}: ${value};`);
  }

  return `:root {\n  ${lines.join("\n  ")}\n}`;
}
