# Streamforge Template

## What this is

A reusable starter for small, SEO-friendly public web apps that have a private
admin dashboard behind them — e.g. a bakery pre-order site, a clinic appointment
system, a booking/contact app. It is **not** a finished product; it is the
common skeleton those projects share, plus a theming layer so each project can
be re-skinned and re-languaged from config instead of by editing code.

When you start a real project from this template, you replace this file with a
project-specific brief (purpose, business model, domain model, MVP scope).

## Stack

- Next.js (App Router), TypeScript, Tailwind CSS v4 — Server Components by default
- Supabase: PostgreSQL for all data + Auth for admins only
- Resend for transactional email (behind the `lib/email/` abstraction)
- Zod for input validation
- Deployed to Vercel

## Two user types (the core pattern)

| | Public users | Admin / staff |
|---|---|---|
| Auth | None — anonymous | Supabase Auth magic link + `admin_users` allowlist |
| Route group | `app/(public)/` | `app/(admin)/` |
| Mutations | `app/api/` route handlers | `server/actions/` Server Actions |

## Theming model (what makes this a template)

- `config/brand.ts` — name, tagline, contact, **active theme**, **active locale**
- `config/themes/` — design-token presets (`default`, `bakery`, `medical`); the
  active one is injected as CSS variables in `app/layout.tsx`
- `config/copy/` — all user-facing strings in `en` + `hu`; Zod messages too
- Components never hardcode colors or copy — they use Tailwind token utilities
  (`bg-primary`, `text-text-primary`, …) and the `copy` object.

"Thematizing" = pick/edit a theme preset + copy file. One deploy per project
(build-time). A runtime multi-tenant upgrade path is documented in `README.md`.

## Opt-in modules (bundled, delete if unused)

- Rate-limit + honeypot (`lib/rate-limit.ts`, `0003_rate_limit_log.sql`)
- Email confirmation tokens (`lib/tokens.ts`, `/api/confirm`, `0002_…sql`)
- ICS / Google Calendar helpers (`lib/email/ics.ts`)

## Working conventions

Task descriptions may be written in Hungarian (the developer's convenience) —
always respond in English. Keep the `db → domain` mapping; never leak raw rows
into UI. Enforce admin access in BOTH the proxy and Server Actions.
