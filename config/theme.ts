import type { Theme } from "./themes/types";
import { defaultTheme } from "./themes/default";

/**
 * The project's theme. Singular, deliberately: the template this grew from
 * shipped a preset registry so one codebase could be re-skinned per client,
 * which is a requirement Apologia does not have. Adding a second theme means
 * reintroducing the registry, not editing this one.
 */
export const activeTheme: Theme = defaultTheme;

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
