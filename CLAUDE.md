# CLAUDE.md

Guidance for Claude Code working in this repository.

@AGENTS.md

The project brief, non-negotiables, and the list of things deliberately absent
(with the ADR that argues for each) are in **`.claude/project.md`**. Read it
first, then `docs/architecture.md`.

## Stack

Next.js 16.2 (App Router; middleware is renamed `proxy.ts`), React 19,
TypeScript strict, Tailwind v4 (CSS-first, no config file), Supabase
(Postgres + Auth + pgvector), Zod v4, Playwright. Icons: `lucide-react`.

## Conventions inherited from the template — keep these

**Supabase clients** (`lib/supabase/server.ts`):

| Function | Cookies | RLS | Use for |
|---|---|---|---|
| `createSupabaseAnonClient()` | No | Yes (anon) | public Server Components, public routes |
| `createSupabaseServerClient()` | Yes | Yes (session) | proxy, admin Server Components/Actions |
| `createSupabaseServiceClient()` | No | **Bypassed** | trusted server-only work; never reaches a browser |

**Admin auth is double-guarded.** `proxy.ts` checks session + `admin_users`
allowlist on every admin route; every Server Action *also* calls
`requireAdmin()` / `requireAdminRole()` from `lib/auth.ts`. The proxy alone is
not trusted. Add new admin routes to `ADMIN_ROUTES` in `proxy.ts`.

**Privileges are deny-by-default.** `anon` and `authenticated` are revoked,
including for future tables, and granted back per table in
`supabase/migrations/0004_schema_grants.sql`. A policy without a grant fails
with `permission denied for table …`, which looks like an API-key problem and is
not. **Adding a table means adding its grant.**

**Design tokens only.** `bg-primary`, `text-text-primary`, `border-border`,
`bg-surface-card`. Never raw `gray-*`, never hex in components or
`app/globals.css`. Themes live in `config/themes/`.

**All user-facing strings live in `config/copy/{en,hu}.ts`**, typed by `Copy`.
Zod messages come from `copy.validation`. Prefer `getCopy(locale)` — the
module-level `copy` constant is retired as `app/[lang]/` routing lands (ADR-013).

## Type layers

```
types/db.ts      raw DB rows (exact Postgres columns)
types/domain.ts  enriched app types
types/api.ts     request/response shapes
```

Map `db → domain` at the data-access layer; UI works with domain types.

## Environment

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL
ANTHROPIC_API_KEY          # generation
EMBEDDING_API_KEY          # provider TBD — ADR-008, decided by measurement
```

Never commit real values. `.env.example` is the documented list.
