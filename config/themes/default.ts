import type { Theme } from "./types";

/**
 * Neutral baseline theme — calm, modern SaaS slate/indigo.
 * This is the starting point for a brand-new project: clone the template,
 * keep `default` while you build, then either tweak these tokens or copy one
 * of the example presets (`bakery`, `medical`) as a starting palette.
 */
export const defaultTheme: Theme = {
  name: "default",
  label: "Default (neutral SaaS)",
  fonts: {
    heading: "Inter",
    body: "Inter",
  },
  colors: {
    primary: "#4F46E5",
    "primary-hover": "#4338CA",
    "primary-light": "#6366F1",
    "primary-subtle": "#EEF2FF",
    "primary-border": "#C7D2FE",

    secondary: "#0EA5E9",
    "secondary-dark": "#0284C7",
    "secondary-subtle": "#E0F2FE",

    accent: "#F59E0B",
    "accent-hover": "#D97706",
    "accent-subtle": "#FEF3C7",

    "surface-page": "#F8FAFC",
    "surface-card": "#FFFFFF",
    "surface-subtle": "#F1F5F9",
    "surface-admin": "#F1F5F9",

    "text-primary": "#0F172A",
    "text-secondary": "#475569",
    "text-muted": "#94A3B8",
    "text-inverted": "#FFFFFF",

    border: "#E2E8F0",
    "border-subtle": "#EEF2F6",
    "border-focus": "#4F46E5",

    "status-pending": "#F59E0B",
    "status-confirmed": "#4F46E5",
    "status-completed": "#059669",
    "status-cancelled": "#9CA3AF",
    "status-no-show": "#EF4444",
  },
  shadows: {
    card: "0 1px 3px 0 rgb(15 23 42 / 0.06), 0 1px 2px -1px rgb(15 23 42 / 0.04)",
    "card-hover":
      "0 4px 12px 0 rgb(15 23 42 / 0.10), 0 2px 4px -1px rgb(15 23 42 / 0.06)",
    modal: "0 20px 60px -10px rgb(15 23 42 / 0.20)",
  },
};
