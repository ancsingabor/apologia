# Streamforge Template

A themeable **Next.js 16 + React 19 + Supabase + Tailwind v4** starter for
small, SEO-friendly public web apps with a private admin dashboard.

It is the shared skeleton behind projects like a bakery pre-order site or a
clinic appointment system — extracted into a reusable baseline with a **theming
layer** so each new project is configured rather than rewritten.

## Features

- **Auth** — Supabase magic-link admin login with an `admin_users` email
  allowlist, enforced by both the proxy and server-side guards.
- **Theming** — swap colors, fonts, and copy from `config/` without touching
  components. Ships with `default`, `bakery`, and `medical` presets.
- **Bilingual** — `en` + `hu` copy out of the box; switch via `config/brand.ts`.
- **Production patterns** — typed `db → domain` layers, Zod validation, Server
  Actions, a Resend email abstraction, and lefthook pre-commit/pre-push hooks.
- **Automated verification** — Playwright E2E against an ephemeral local Supabase
  stack, plus a GitHub Actions `verify` gate (lint → typecheck → build → E2E) on
  every PR. See "Testing & CI" below.
- **Opt-in modules** — rate-limit + honeypot, confirmation tokens, ICS helpers.
- **Email boundary** — the app sends transactional mail from a `noreply@`; the
  client owns the mailbox that humans reply to. Policy, options and handover
  runbook in `docs/email-boundary.md`.

## Quickstart

```bash
npm install
cp .env.local.example .env.local   # fill in Supabase + Resend
npm run dev                          # http://localhost:3000
```

Apply the database migrations (`supabase/migrations/`) via the Supabase
Dashboard SQL editor or `npx supabase db push`, then add your email to
`admin_users` so you can sign in.

## Testing & CI

```bash
npm run test:e2e     # Playwright E2E (needs Docker + the Supabase CLI)
```

`scripts/e2e.sh` spins up a free, ephemeral local Supabase stack (schema from
your migrations, rows from a small deterministic seed), points the app at it,
mints a genuine admin session, and runs Playwright — never touching production
and never sending email. The same gate runs unattended on every PR to `main`
via `.github/workflows/ci.yml` (lint → typecheck → build → E2E). Extend
`e2e/fixtures/seed.ts` and add specs under `e2e/` as your domain grows. Full
rationale in `CLAUDE.md` → "Automated verification"; manual checklist in
`TESTING.md`.

## Theming

Edit `config/brand.ts`:

```ts
export const brand: Brand = {
  name: "Acme",
  tagline: "...",
  theme: "medical",   // "default" | "bakery" | "medical"
  locale: "hu",       // "en" | "hu"
  contact: { email: "hello@acme.com" },
};
```

- **Presets** live in `config/themes/`. Copy one to start a new palette; each is
  a plain `Theme` object (colors, fonts, shadows) typed by `config/themes/types.ts`.
- The active theme is injected as CSS variables in `app/layout.tsx`; components
  use Tailwind token utilities (`bg-primary`, `text-text-primary`, …), so a theme
  swap re-skins everything.
- **Copy** lives in `config/copy/{en,hu}.ts` (typed by `Copy`). Add keys to
  `types.ts` as your UI grows; Zod messages come from `copy.validation`.

To add a font: declare it in `app/layout.tsx`, register it in the `FONTS` map,
and add its name to `GoogleFontName` in `config/themes/types.ts`.

## Project structure

```
app/            (public)/ + (admin)/ route groups, api/, auth/, login/
components/     shared/ UI kit (+ admin/ public/ for your features)
config/         brand, theme + themes/, copy/ (en, hu)
lib/            auth, supabase clients, email (+ ics), tokens, rate-limit
server/         validators/ (Zod) + actions/ (Server Actions)
types/          db → domain → api layers
supabase/       config.toml, migrations/, seed.sql
```

See `CLAUDE.md` for the full architecture guide and a step-by-step "spin up a
new project" checklist.

## Optional add-ons (not installed)

Kept out of the baseline to stay lean; add per project as needed. Reference
implementations exist in the sibling `gazdapek` project.

- **Twilio SMS** — `npm i twilio`; mirror the `lib/email/` abstraction as
  `lib/sms/`.
- **Web push (VAPID)** — `npm i web-push`; add a `push_subscriptions` table and
  `/api/push/*` routes.
- **Charts** — `npm i recharts` for admin analytics.
- **Vercel cron** — add a `crons` entry to `vercel.json` and a protected
  `/api/cron/*` route guarded by `CRON_SECRET`.

## Upgrade path: runtime multi-tenancy

The template is build-time themed (one deploy per project). To serve many
tenants from one deployment later:

1. Add a `tenants` table and a `tenant_id` FK to every domain table.
2. Scope RLS policies by `tenant_id`.
3. Resolve the tenant from the subdomain/host in `proxy.ts`.
4. Move `activeTheme`/`locale` resolution from `config/` to the resolved tenant
   row (load the `Theme` object from the DB and inject the same CSS variables).

## License

Private — internal template.
