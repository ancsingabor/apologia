/**
 * Copy contract shared by every locale file in `config/copy/`.
 *
 * All user-facing strings live here (never hardcoded in components), so a
 * app resolves the language per request from the URL. Zod validators pull
 * their user-facing messages from `copy.validation` for the same reason.
 *
 * Keep every locale file (`en.ts`, `hu.ts`) implementing this exact shape —
 * TypeScript will flag any missing key.
 */
export interface Copy {
  nav: {
    home: string;
    login: string;
  };
  landing: {
    heroTitle: string;
    heroSubtitle: string;
    primaryCta: string;
    secondaryCta: string;
    featuresTitle: string;
    features: { title: string; body: string }[];
  };
  login: {
    title: string;
    subtitle: string;
    emailLabel: string;
    submit: string;
    backHome: string;
    unauthorized: string;
    checkEmail: string;
  };
  admin: {
    dashboardTitle: string;
    welcome: string;
    signedInAs: string;
    role: string;
  };
  validation: {
    required: string;
    emailInvalid: string;
    tooShort: (min: number) => string;
    tooLong: (max: number) => string;
  };
  footer: {
    rights: string;
  };
}
