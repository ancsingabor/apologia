import { brand } from "../brand";
import type { Copy } from "./types";
import { en } from "./en";
import { hu } from "./hu";

export type Locale = "en" | "hu";

const LOCALES: Record<Locale, Copy> = { en, hu };

/**
 * Copy for the default locale.
 *
 * ⚠️ Milestone 1 replaces this module-level constant with a per-request lookup
 * once `app/[lang]/` routing lands (ADR-013). Prefer `getCopy(locale)` in new
 * code; this export exists so the inherited pages keep working meanwhile.
 */
export const copy: Copy = LOCALES[brand.defaultLocale] ?? en;

/** Explicit accessor (handy in tests or when forcing a locale). */
export function getCopy(locale: Locale = brand.defaultLocale): Copy {
  return LOCALES[locale] ?? en;
}

/** BCP-47-ish tag for the <html lang> attribute. Becomes per-request in M1. */
export const htmlLang: string = brand.defaultLocale;

export type { Copy } from "./types";
