import type { Theme } from "./types";

/**
 * Example preset — "Warm Artisan": cozy bakery / artisanal small-business tone.
 * Toasted browns + terracotta + wheat on cream. Playfair Display headings,
 * Lato body. (Derived from the GazdaPék project.)
 */
export const bakeryTheme: Theme = {
  name: "bakery",
  label: "Bakery (warm artisan)",
  fonts: {
    heading: "Playfair Display",
    body: "Lato",
  },
  colors: {
    primary: "#6B3A2A",
    "primary-hover": "#552D20",
    "primary-light": "#834A38",
    "primary-subtle": "#FAF0E0",
    "primary-border": "#E2CDB8",

    secondary: "#C4846A",
    "secondary-dark": "#A86A52",
    "secondary-subtle": "#FBEFE8",

    accent: "#E8C4A8",
    "accent-hover": "#D9AE8C",
    "accent-subtle": "#FBF3EA",

    "surface-page": "#FDF6ED",
    "surface-card": "#FFFFFF",
    "surface-subtle": "#FAF0E0",
    "surface-admin": "#F7EFE2",

    "text-primary": "#2C1A0E",
    "text-secondary": "#6B3A2A",
    "text-muted": "#8B6B55",
    "text-inverted": "#FFFFFF",

    border: "#E2CDB8",
    "border-subtle": "#EFE2D2",
    "border-focus": "#6B3A2A",

    "status-pending": "#D9883B",
    "status-confirmed": "#6B3A2A",
    "status-completed": "#4F7A3A",
    "status-cancelled": "#A89A8C",
    "status-no-show": "#C0492B",
  },
  shadows: {
    card: "0 1px 3px 0 rgb(44 26 14 / 0.06), 0 1px 2px -1px rgb(44 26 14 / 0.04)",
    "card-hover":
      "0 4px 12px 0 rgb(44 26 14 / 0.10), 0 2px 4px -1px rgb(44 26 14 / 0.06)",
    modal: "0 20px 60px -10px rgb(44 26 14 / 0.20)",
  },
};
