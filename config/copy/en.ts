import type { Copy } from "./types";
import { brand } from "../brand";

export const en: Copy = {
  nav: {
    home: "Home",
    login: "Admin login",
  },
  landing: {
    heroTitle: brand.name,
    heroSubtitle: brand.tagline,
    primaryCta: "Get started",
    secondaryCta: "Learn more",
    featuresTitle: "What's inside",
    features: [
      {
        title: "Auth, done right",
        body: "Supabase magic-link login with an email allowlist and a middleware + server-side double guard.",
      },
      {
        title: "Theming built in",
        body: "Swap colors, fonts and copy from a single config — re-skin the whole app without touching components.",
      },
      {
        title: "Production patterns",
        body: "Typed db → domain layers, Zod validation, Server Actions, and a Resend email abstraction.",
      },
    ],
  },
  login: {
    title: "Sign in",
    subtitle: "Only allowlisted staff can access the dashboard.",
    emailLabel: "Email address",
    submit: "Send magic link",
    backHome: "Back to home",
    unauthorized: "This email is not authorized to access the admin area.",
    checkEmail: "Check your inbox for a sign-in link.",
  },
  admin: {
    dashboardTitle: "Dashboard",
    welcome: "Welcome back",
    signedInAs: "Signed in as",
    role: "Role",
  },
  validation: {
    required: "This field is required.",
    emailInvalid: "Please enter a valid email address.",
    tooShort: (min) => `Must be at least ${min} characters.`,
    tooLong: (max) => `Must be at most ${max} characters.`,
  },
  footer: {
    rights: "All rights reserved.",
  },
};
