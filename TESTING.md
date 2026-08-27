# Testing

The template ships a **Playwright E2E suite** that runs both locally and in CI;
the rest of this file is a manual checklist for things it doesn't cover yet.

## Automated E2E

```bash
npm run test:e2e       # headless, against an ephemeral local Supabase stack
npm run test:e2e:ui    # Playwright interactive UI
```

Requires Docker + the Supabase CLI (`supabase`). `scripts/e2e.sh` runs
`supabase start`, points every Supabase env var at the local stack, seeds
deterministic fixtures, mints a genuine admin session, then runs Playwright.
Nothing touches your production project (it hard-guards on a `localhost` URL),
and no email is sent.

- Suite lives in `e2e/`; the example spec (`e2e/dashboard.spec.ts`) covers the
  admin auth guard. Add your own journeys there.
- Seed domain fixtures in `e2e/fixtures/seed.ts` (`seedFixtures()`) as you add
  tables — clear children-first, insert deterministic rows.
- CI (`.github/workflows/ci.yml`) runs lint → typecheck → build → this suite on
  every PR to `main`. See CLAUDE.md → "Automated verification" for the details
  (incl. why the Supabase CLI is pinned).

## Setup

1. `npm install`
2. `cp .env.local.example .env.local` and fill Supabase + Resend values.
3. Apply `supabase/migrations/*` to your Supabase project.
4. Add your email to `admin_users` (see `supabase/seed.sql`).
5. `npm run dev`

## Build & types

- [ ] `npx tsc --noEmit` passes.
- [ ] `npm run build` succeeds.
- [ ] `npm run lint` is clean.

## Theming (no env needed)

- [ ] In `config/brand.ts`, set `theme: "default"` → reload `/` → neutral palette.
- [ ] Switch to `theme: "bakery"` → warm brown/cream palette + serif headings.
- [ ] Switch to `theme: "medical"` → teal palette + Figtree headings.
- [ ] Switch `locale: "en"` ↔ `"hu"` → landing/login copy changes language;
      `<html lang>` updates.

## Public

- [ ] `/` renders hero, feature cards, and footer using the active theme/copy.
- [ ] `/login` renders the magic-link form.

## Admin auth (needs Supabase + an allowlisted email)

- [ ] Submitting a valid allowlisted email shows the "check your inbox" state.
- [ ] Clicking the magic link lands on `/dashboard` showing your email + role.
- [ ] Visiting `/dashboard` while signed out redirects to `/login`.
- [ ] Signing in with a non-allowlisted email redirects to
      `/login?error=unauthorized` and shows the error.

## Modules (if kept)

- [ ] **Confirmation tokens:** insert a row via `lib/tokens.ts`, visit
      `/api/confirm?token=<raw>` → redirects to `/?confirmed=confirmed`; a second
      visit → `already_confirmed`; an expired/invalid token → `expired`/`invalid`.
- [ ] **Rate limit:** call `checkRateLimit(ip, action)` past the limit → returns
      `false`; the check fails open if the table/query errors.
