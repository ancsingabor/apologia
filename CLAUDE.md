# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this repo is

**Streamforge** is a reusable starter template for small, SEO-friendly public
web apps backed by a private admin dashboard (think: bakery pre-orders, clinic
appointments, booking/contact sites). It is the shared skeleton of those
projects plus a **theming layer** so each new project is configured, not
rewritten. It is intentionally a bare scaffold — there is no business domain to
delete, only an example validator and the two opt-in modules.

## Spin up a new project from this template

1. **Create the repo** from this template (GitHub "Use this template", or clone
   and re-init git) and rename it.
2. **`config/brand.ts`** — set `name`, `tagline`, `theme`, `locale`, `contact`.
3. **Theme** — keep `default`, copy a preset (`bakery`/`medical`) as a starting
   palette, or edit tokens in `config/themes/<name>.ts`.
4. **Copy** — edit `config/copy/{en,hu}.ts`; add keys to `config/copy/types.ts`
   as your UI grows.
5. **Env** — copy `.env.local.example` → `.env.local`, fill Supabase + Resend.
6. **Database** — apply `supabase/migrations/*` (Dashboard SQL editor or
   `npx supabase db push`), add yourself to `admin_users`.
7. **Decide the mailbox end state** — before launch, with the client. The app
   sends from a `noreply@`; human email belongs to a mailbox **the client owns
   and administers**, and we never take permanent admin of it. Four sanctioned
   options and a launch checklist in `docs/email-boundary.md`; a Hungarian
   client-facing one-pager in `docs/email-boundary.hu.md`.
8. **Build your domain** — add tables (migrations), `types/db.ts` + `types/domain.ts`,
   Zod validators (`server/validators/`), Server Actions (`server/actions/`),
   and pages under `app/(public)/` and `app/(admin)/`. Update `ADMIN_ROUTES` in
   `proxy.ts`. **Grant each new table** in `supabase/migrations/0004_schema_grants.sql`
   — see "Database privileges" below. Replace `.claude/project.md` with a project brief.
9. **Remove unused modules** — delete the tokens / rate-limit / ICS files and
   their migrations if you don't need them.

## Commands

- `npm run dev` — dev server
- `npm run build` — production build
- `npm run lint` — ESLint
- `npx tsc --noEmit` — type-check (also runs on `git push` via lefthook + a Claude hook)
- `npm run test:e2e` — Playwright E2E against an ephemeral local Supabase stack
- `npm run test:e2e:ui` — the same, in Playwright's interactive UI

An E2E suite runs both locally and unattended in CI (see "Automated verification"
below). `TESTING.md` also keeps a manual checklist for things not yet covered.

## Automated verification (E2E + CI)

The goal: on every PR the app is verified **without a human running steps**, so
a green check is objective proof it still works. Two layers:

- **Broad gate** — lint + `tsc --noEmit` + `npm run build` catch problems anywhere.
- **Behavioral E2E** — Playwright drives real journeys against a **free, ephemeral
  local Supabase stack** (schema from `supabase/migrations/`, rows from a small
  deterministic seed — never a copy of production data). No app code is mocked;
  only env vars point at the local stack. The one seam is the email provider
  (keep sends behind `lib/email/` so a capture/no-op provider can stand in).

How it's wired (all test-only — none of this is imported by the app or `next build`):

- `scripts/e2e.sh` — starts `supabase start`, captures the local demo keys, and
  **overrides every Supabase env var to the local values** before running
  Playwright. Hard-guards on a `localhost` URL so it can never touch production.
- `playwright.config.ts` — chromium project; `webServer` runs `npm run dev`;
  `storageState` starts specs logged in as the test admin.
- `e2e/fixtures/seed.ts` — the local-only guard, a service-role client, the
  `TEST_ADMIN` constant, and `seedFixtures()`. **Extend `seedFixtures()` as you
  add domain tables** (clear children-first, insert deterministic rows).
- `e2e/auth.ts` — mints a **genuine** admin session (creates a local password
  user + allowlist row, signs in via `@supabase/ssr`, writes cookies to
  `storageState`). No emailed magic-link round-trip; no auth check is weakened.
- `e2e/dashboard.spec.ts` — example covering the admin auth guard (authed admin
  reaches `/dashboard`; anonymous is redirected to `/login`). Model your specs
  on it.
- `.github/workflows/ci.yml` — a single `verify` job on PRs to `main` + pushes
  to `main` that reproduces the whole gate in the cloud. **The Supabase CLI is
  pinned** (`version: 2.90.0`) — `latest` provisions the local stack's keys/roles
  differently and breaks the service-role seed; keep the pin in lockstep with
  your validated local CLI version.

To enforce it, add a branch ruleset requiring the `verify` check (needs GitHub
Pro or a public repo). Keep merges human-approved first; only enable auto-merge
once the gate has caught real regressions.

## Two user types (the core pattern)

| | Public users | Admin / staff |
|---|---|---|
| Auth | None — anonymous | Supabase Auth magic link + `admin_users` allowlist |
| Route group | `app/(public)/` | `app/(admin)/` |
| Mutations | `app/api/` route handlers | `server/actions/` Server Actions |

## Admin auth flow

1. Magic link / OTP via Supabase Auth (`components/admin/LoginForm.tsx`).
2. `proxy.ts` (Next.js 16's renamed middleware) verifies the session **and**
   `admin_users` allowlist on every admin route, forwarding the role as the
   `x-admin-role` header.
3. Every Server Action also calls `requireAdmin()` / `requireAdminRole()` from
   `lib/auth.ts` — the proxy alone is not trusted (double guard).

## Theming & copy model

- **`config/brand.ts`** — the per-project switchboard (name, tagline, active
  `theme`, active `locale`, contact).
- **`config/themes/`** — design-token presets implementing `Theme`
  (`config/themes/types.ts`). `config/theme.ts` resolves the active one and
  emits a `:root { --color-* }` string that `app/layout.tsx` injects. Fonts are
  statically loaded in `layout.tsx` and selected by the active theme.
- **`app/globals.css`** — only the static Tailwind `@theme` mapping (utility →
  variable) and base styles. **No hex values here or in components.**
- **`config/copy/`** — every user-facing string, per locale (`en`, `hu`), typed
  by `Copy`. Read via the `copy` object. Zod messages come from `copy.validation`.

Result: changing `theme` re-skins the app; changing `locale` re-languages it —
no component edits.

## Supabase client variants (`lib/supabase/server.ts`)

| Function | Cookies | RLS | Use for |
|---|---|---|---|
| `createSupabaseAnonClient()` | No | Yes (anon) | Public Server Components, public API routes |
| `createSupabaseServerClient()` | Yes | Yes (session) | Proxy, admin Server Components/Actions |
| `createSupabaseServiceClient()` | No | **Bypassed** | Trusted server-only mutations |

## Database privileges — deny by default

Two layers, and you need both. A **grant** says "this role may touch this table
at all"; an **RLS policy** says "…and only these rows". A policy without a grant
fails with `permission denied for table …` — an error that looks like an API-key
problem and is not.

`supabase/migrations/0004_schema_grants.sql` states the model explicitly:

- `anon` and `authenticated` are revoked by default, including for future
  tables, and granted back **per table, only what the app actually calls**.
- `service_role` keeps full access — it is used only by
  `createSupabaseServiceClient()`, never reaches a browser, and bypasses RLS by
  design.

⚠️ **When you add a table, grant it in `0004_schema_grants.sql`** (or a later
migration), or it stays unreachable to everything except the service client.
That friction is deliberate: it makes exposing a table to the public API role a
decision someone made on purpose.

Never rely on Supabase's inherited defaults. Older projects pre-granted
everything to all three roles; current stack images do not, so a schema that
leans on that silently breaks when replayed in CI, on a preview branch, or on a
rebuilt project.

## Type layers

```
types/db.ts      — raw DB rows (exact Postgres columns)
types/domain.ts  — enriched app types (relationships, computed fields)
types/api.ts     — API request/response shapes
```

Map `db → domain` at the data-access layer; UI works with domain types.

## Opt-in modules (delete if unused)

- **Rate-limit + honeypot** — `lib/rate-limit.ts`, `supabase/migrations/0003_rate_limit_log.sql`.
- **Confirmation tokens** — `lib/tokens.ts`, `app/api/confirm/route.ts`,
  `supabase/migrations/0002_confirmation_tokens.sql`, `lib/email/templates/confirmation.tsx`.
- **ICS / Google Calendar** — `lib/email/ics.ts`.

Heavier add-ons (Twilio SMS, web push, recharts charts, Vercel cron) are **not**
installed — see `README.md` for how to add them.

## Email boundary

**The app sends; it never receives.** `RESEND_FROM_EMAIL` is a `noreply@` on the
project's domain, and Resend lives on the `send.<domain>` subdomain so the root
MX stays free for the client's own mail provider.

**The mailbox is always the client's** — owned, paid for and administered by
them. We never hold its password, never keep admin past a handover, never read
it, and never build inbound email into the app. `brand.replyToEmail` points at
it; `lib/email/resend.ts` omits the `Reply-To` header entirely when it is unset,
so a reply bounces instead of vanishing.

Full policy, the four sanctioned end states, DNS invariants, the handover
runbook and a launch checklist: `docs/email-boundary.md`. Client-facing
Hungarian one-pager: `docs/email-boundary.hu.md`.

## Design system rules

- Use token utilities only: `bg-primary`, `text-text-primary`, `border-border`,
  `bg-surface-card`, status colors. Never raw `gray-*` for brand, never hex.
- Radius: `rounded-xl` cards, `rounded-lg` buttons/inputs, `rounded-full` badges.
- Shared components in `components/shared/` — don't reinvent them.
- Tailwind v4 — `@import "tailwindcss"` syntax.

## Icons

Use **Lucide React** (`lucide-react`), already installed.

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY   # Supabase's current name for the anon/publishable key
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL
RESEND_API_KEY
RESEND_FROM_EMAIL
```
