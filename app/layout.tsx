import type { Metadata } from "next";
import {
  Inter,
  Figtree,
  Plus_Jakarta_Sans,
  Playfair_Display,
  Lato,
} from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { brand } from "@/config/brand";
import { htmlLang } from "@/config/copy";
import { activeTheme, themeCssVars } from "@/config/theme";
import type { GoogleFontName } from "@/config/themes/types";

/* -----------------------------------------------------------------------------
 * Fonts
 * next/font requires *static* imports, so every font a preset can use is loaded
 * here. Only the active theme's heading + body families are actually attached
 * to <html>, so unused families aren't shipped. To add a font: declare it here,
 * add it to `FONTS`, and extend `GoogleFontName` in config/themes/types.ts.
 * -------------------------------------------------------------------------- */
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });
const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"], weight: ["300", "400", "500", "600", "700", "800"] });
const plusJakarta = Plus_Jakarta_Sans({ variable: "--font-plus-jakarta", subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const lato = Lato({ variable: "--font-lato", subsets: ["latin"], weight: ["300", "400", "700"] });

const FONTS: Record<GoogleFontName, { variable: string; className: string }> = {
  Inter: { variable: "--font-inter", className: inter.variable },
  Figtree: { variable: "--font-figtree", className: figtree.variable },
  "Plus Jakarta Sans": { variable: "--font-plus-jakarta", className: plusJakarta.variable },
  "Playfair Display": { variable: "--font-playfair", className: playfair.variable },
  Lato: { variable: "--font-lato", className: lato.variable },
};

const headingFont = FONTS[activeTheme.fonts.heading];
const bodyFont = FONTS[activeTheme.fonts.body];

// Alias the generic --font-heading / --font-body to the active families, plus
// inject the active theme's color + shadow tokens.
const themeStyles = `${themeCssVars()}\n:root {\n  --font-heading: var(${headingFont.variable});\n  --font-body: var(${bodyFont.variable});\n}`;

export const metadata: Metadata = {
  title: {
    default: brand.name,
    template: `%s | ${brand.name}`,
  },
  description: brand.tagline,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Attach only the active heading/body font variable classes (dedup if equal).
  const fontClasses = Array.from(
    new Set([headingFont.className, bodyFont.className])
  ).join(" ");

  return (
    <html lang={htmlLang} className={`${fontClasses} h-full antialiased`}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeStyles }} />
      </head>
      <body className="min-h-full flex flex-col bg-surface-page text-text-primary font-body">
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
