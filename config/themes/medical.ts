import type { Theme } from "./types";

/**
 * Example preset — "Medical Clean": calm healthcare SaaS, trustworthy and warm.
 * Deep petrol teal + sage green + soft coral on a warm off-white. Figtree
 * headings, Plus Jakarta Sans body. (Derived from the Fortitudo project.)
 */
export const medicalTheme: Theme = {
  name: "medical",
  label: "Medical (calm healthcare)",
  fonts: {
    heading: "Figtree",
    body: "Plus Jakarta Sans",
  },
  colors: {
    primary: "#1F4E5F",
    "primary-hover": "#18404F",
    "primary-light": "#245C69",
    "primary-subtle": "#EBF4F6",
    "primary-border": "#B8D4DA",

    secondary: "#A8C3B0",
    "secondary-dark": "#7FA893",
    "secondary-subtle": "#F0F6F2",

    accent: "#E8B4A0",
    "accent-hover": "#DC9D86",
    "accent-subtle": "#FDF3EF",

    "surface-page": "#F7F6F3",
    "surface-card": "#FFFFFF",
    "surface-subtle": "#F2F1EE",
    "surface-admin": "#F4F3F0",

    "text-primary": "#1A2E35",
    "text-secondary": "#4A6270",
    "text-muted": "#7A9099",
    "text-inverted": "#FFFFFF",

    border: "#E2E8E6",
    "border-subtle": "#EEF1F0",
    "border-focus": "#1F4E5F",

    "status-pending": "#F59E0B",
    "status-confirmed": "#1F4E5F",
    "status-completed": "#059669",
    "status-cancelled": "#9CA3AF",
    "status-no-show": "#EF4444",
  },
  shadows: {
    card: "0 1px 3px 0 rgb(31 78 95 / 0.06), 0 1px 2px -1px rgb(31 78 95 / 0.04)",
    "card-hover":
      "0 4px 12px 0 rgb(31 78 95 / 0.10), 0 2px 4px -1px rgb(31 78 95 / 0.06)",
    modal: "0 20px 60px -10px rgb(31 78 95 / 0.20)",
  },
};
