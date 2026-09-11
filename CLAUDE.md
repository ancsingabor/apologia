# CLAUDE.md

Guidance for Claude Code working in this repository.

@AGENTS.md

The project brief, non-negotiables, and the list of things deliberately absent
(with the ADR that argues for each) are in **`.claude/project.md`**. Read it
first, then `docs/architecture.md`. Current state: **`docs/guide/status.md`**.

## Human layer — keeping `docs/guide/` current is part of done

The docs have three layers (`docs/guide/README.md` § How the documentation is
layered). ADRs, long docs and module headers are the complete record and stay
as they are — **never shorten them, and never move reasoning out of them into
the guide.** The guide summarises and links down; where the two disagree, the
lower layer is right and the guide is the bug.

In the **same PR** as the change that causes it:

| When a change… | …also update |
|---|---|
| alters what exists, what is next, or what is blocked | `docs/guide/status.md` — the only place status is written. Never restate status elsewhere; link to it. Re-derive every number from its source (lock file, test run), never from memory. |
| adds, removes or renames a box or an arrow | the Mermaid diagram in the guide chapter that draws it (solid = built, dashed = planned). Render it before committing. |
| adds an ADR | a `> **TL;DR**` block (Decision · Because · Cost) after its Status paragraph, a row in `docs/adr/README.md`, and a link from the guide chapter it affects |
| adds a module to `harness/apologia_eval/` | a `## \`name.py\`` section in `docs/guide/python/walkthrough.md` (with a break-it exercise whose outcome you ran), vocabulary rows in `docs/guide/python/vocabulary.md` for new idioms, and its level in `docs/guide/python/README.md` |
| fixes a bug that failed silently | an entry in `docs/guide/10-war-stories.md` (symptom · why invisible · how found · what changed · commit) |
| changes a gate (CI step, hook, release rule) | `docs/guide/08-infrastructure.md` § gates and `TESTING.md` |

`npm run docs:lint` (CI and pre-push) enforces the TL;DR, ADR-index,
walkthrough and link parts. It checks **presence, not truth** — whether
`status.md` is accurate is on the author of the change.

Guide pages follow one shape: TL;DR (≤ 5 bullets) · ≤ ~150 lines · ≤ 2
diagrams · "Where this lives in code" · "Go deeper" · "Check yourself" with
answers in `<details>`.

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
