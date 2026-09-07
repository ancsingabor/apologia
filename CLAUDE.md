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

## The ingestion CLI

`npm run ingest -- --source=ccc --language=hu` (ADR-004). Never imported by
`next build`, never runs in a request.

The split is the convention to keep: **pure stages in `lib/corpus/`, I/O in
`scripts/ingest/`.** Manifest and errata parsing, discovery, chunking, hashing
and the assertions are pure functions over data and are unit tested; the
network, the filesystem and Postgres are in the CLI shell and are not.

Two things that look like mistakes and are not:

- `scripts/ingest/client.ts` builds its Supabase client with `createClient`
  directly rather than using `lib/supabase/server.ts`, which imports
  `next/headers` at module scope and cannot load under `tsx`.
- The CLI has **no** localhost hard-guard, unlike `e2e/fixtures/seed.ts`.
  Ingesting into production is legitimate; it just requires `--remote`.

`embed` is deliberately not implemented — it is a separate pass per candidate
model, because ADR-008 is decided by measurement.

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
