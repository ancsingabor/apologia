import type { Copy } from "./types";
import { brand } from "../brand";

export const hu: Copy = {
  nav: {
    home: "Főoldal",
    login: "Admin belépés",
  },
  landing: {
    heroTitle: brand.name,
    heroSubtitle: brand.tagline,
    primaryCta: "Kezdés",
    secondaryCta: "Tudj meg többet",
    featuresTitle: "Mit tartalmaz",
    features: [
      {
        title: "Beépített hitelesítés",
        body: "Supabase magic-link belépés engedélyezett e-mail listával, middleware és szerveroldali kettős védelemmel.",
      },
      {
        title: "Beépített témázás",
        body: "Színek, betűtípusok és szövegek egyetlen konfigurációból — az egész app újraszínezhető komponensek módosítása nélkül.",
      },
      {
        title: "Éles mintázatok",
        body: "Típusos db → domain rétegek, Zod validáció, Server Action-ök és Resend e-mail absztrakció.",
      },
    ],
  },
  login: {
    title: "Bejelentkezés",
    subtitle: "Csak az engedélyezett munkatársak férhetnek hozzá a felülethez.",
    emailLabel: "E-mail cím",
    submit: "Belépési link küldése",
    backHome: "Vissza a főoldalra",
    unauthorized: "Ez az e-mail cím nem jogosult az admin felület elérésére.",
    checkEmail: "Ellenőrizd a postafiókod a belépési linkért.",
  },
  admin: {
    dashboardTitle: "Vezérlőpult",
    welcome: "Üdv újra",
    signedInAs: "Bejelentkezve mint",
    role: "Szerepkör",
  },
  validation: {
    required: "Ez a mező kötelező.",
    emailInvalid: "Adj meg egy érvényes e-mail címet.",
    tooShort: (min) => `Legalább ${min} karakter szükséges.`,
    tooLong: (max) => `Legfeljebb ${max} karakter lehet.`,
  },
  footer: {
    rights: "Minden jog fenntartva.",
  },
};
