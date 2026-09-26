# Code map

Which folder is which box in [chapter 03](03-system-map.md), and what to read
first once you open one.

## TL;DR

- **Every module opens with a header comment whose first sentence states its
  job.** Read that sentence before the code; several of them carry reasoning
  that exists nowhere else.
- The split that makes the pipeline testable: **pure stages in `lib/corpus/`,
  all I/O in `scripts/ingest/`.**
- `lib/` is logic with no framework around it, `app/` is the framework.
  Deterministic logic that ends up in `app/` is in the wrong file
  ([ADR-015](../adr/015-testing-strategy.md)).
- **There is no "state" column here.** Whether something is built, half-built
  or wired to nothing lives in [status.md](status.md) — a copy would drift.
- Two directories are **deliberately empty**, and that is worth knowing before
  you go looking in them.

## The ingestion pipeline

| Folder | What it is |
|---|---|
| `lib/corpus/` | The pure stages: manifest and errata parsing, discovery, chunking, hashing, the assertions, cross-lingual comparison. Functions over data, no network, no database — which is why they carry the unit tests. |
| `lib/corpus/parsers/` | One parser per source (`katolikus-hu`, `vatican-intratext`, `corpus-thomisticum`), each turning that site's HTML into units with locators and roles. |
| `scripts/ingest/` | The I/O shell: network, filesystem, Postgres, CLI flags, logging. Builds its own Supabase client with `createClient`, because `lib/supabase/server.ts` imports `next/headers` and cannot load under `tsx`. |
| `corpus/` | The repo's contract with the pipeline: `sources.yaml`, `errata/*.yaml`, and the generated `manifest.lock.yaml` (hashes and counts, never text). |

## The query path and its gate

| Folder | What it is |
|---|---|
| `lib/citation/verify.ts` | The citation gate: every cited locator must resolve to a unit that was in the supplied context, and every quoted span must be byte-identical. Pure logic over fixed input, so it is exhaustively unit tested. Its fixtures are invented text, never the real Catechism ([ADR-003](../adr/003-ship-manifests-not-corpus.md)). |
| `lib/citation/limits.ts` | The proportionality half of [ADR-017](../adr/017-quotation-as-verified-invariant.md). Its header says the quiet part out loud: **these numbers are a legal judgement, not an engineering one.** |
| `lib/rate-limit.ts`, `lib/constants.ts` | The fail-closed limiter and its thresholds. Tighter than a contact form's, because every accepted question costs an embedding call plus a generation call ([ADR-009](../adr/009-fail-closed-rate-limiting.md)). |

## Measurement

| Folder | What it is |
|---|---|
| `harness/apologia_eval/` | The Python side: gold-set reader, metric functions, the corpus-hash port, the candidate slate, the servability pre-flight, and the corpus reader. Python is permitted here and nowhere else ([ADR-023](../adr/023-python-at-the-measurement-boundary.md)). |
| `eval/questions/` | The gold set, frozen in git *before* the retriever existed, so the benchmark cannot be fitted to what it judges. |
| `eval/reports/` | Eval output. `preflight.json` is the first one. |
| `scripts/eval-lint.ts` | Checks that every locator the gold set names actually resolves in the database — the thing that catches a gold question quietly pointing at nothing. |

## The web application

| Folder | What it is |
|---|---|
| `app/`, `components/` | The Next.js App Router pages and React components — currently the template's landing page, login and admin dashboard. |
| `config/` | Everything user-facing that is not a component: `copy/{en,hu}.ts` (all strings, typed by `Copy`), `theme.ts` + `themes/`, `brand.ts`. |
| `proxy.ts`, `lib/auth.ts` | The two independent admin guards. `proxy.ts` checks session and allowlist on every admin route; every Server Action *also* calls `requireAdmin()`. The proxy alone is not trusted. |
| `lib/supabase/` | `server.ts` holds the three server clients (anon, session, service-role) and imports `next/headers` at module scope; `client.ts` holds the browser one. Which to use when is the table in [CLAUDE.md](../../CLAUDE.md). |
| `server/actions/`, `server/validators/` | **Both empty.** Not an oversight — no Server Action has been written yet. The `requireAdmin()` rule above governs the first one. |
| `types/` | `db.ts` (exact Postgres rows) → `domain.ts` (enriched app types) → `api.ts` (wire shapes). Map `db → domain` at the data-access layer; UI works with domain types. |

## Schema, checks and tests

| Folder | What it is |
|---|---|
| `supabase/migrations/` | Schema, grants and RLS. Privileges are deny-by-default: a policy without a grant fails with `permission denied for table …`, which looks like an API-key problem and is not. |
| `integration/` | Tests that cross a real Postgres, run by `scripts/integration.sh` against an ephemeral local stack. |
| `e2e/` | Playwright browser tests, run by `scripts/e2e.sh`. `e2e/fixtures/seed.ts` has a localhost hard-guard; the ingestion CLI deliberately does not, because ingesting into production is legitimate and just needs `--remote`. |
| `lib/docs/check.ts`, `scripts/docs-lint.ts` | The docs structure check behind `npm run docs:lint`: ADR TL;DRs, the ADR index, walkthrough sections, relative links and heading anchors. It checks **presence, not truth**. |

## Go deeper

- [chapter 03: system map](03-system-map.md), the boxes these folders fill
- [chapter 09: quality](09-quality.md) and [TESTING.md](../../TESTING.md), for
  which of the four runners a given folder belongs to
- [CLAUDE.md](../../CLAUDE.md), for the conventions a new file must follow

## Check yourself

<details><summary>Why is there no "built / planned" column in these tables?</summary>

Because it would be status, and status is written in exactly one file
([status.md](status.md)) so that it drifts in exactly one file. A folder's
*job* is stable; whether it is finished is not. This page answers "what is
this?", never "is it done?".
</details>

<details><summary>A new deterministic function needs writing. Where does it go, and why not next to what calls it?</summary>

In `lib/`, not in `app/` or a route handler. The test layer follows
determinism rather than stack position (ADR-015), and components, route
handlers and Server Actions get no unit tests at all — so a pure function
parked in one of them is a function nothing will ever execute in a test. That
is also where both of this project's review-found bugs were living.
</details>

<details><summary>Where is the boundary between TypeScript and Python, as a rule rather than a folder list?</summary>

Python is allowed where the deliverable is a measurement, or the model that
produced it. Everything the request path touches, and everything already
covered by the TypeScript unit suite, stays TypeScript (ADR-023).
</details>

<details><summary>`scripts/ingest/` builds its own Supabase client instead of importing `lib/supabase/server.ts`. Bug or not?</summary>

Not a bug. `lib/supabase/server.ts` imports `next/headers` at module scope, so
any `tsx` process — the ingest CLI, `e2e/fixtures/seed.ts` — cannot load it at
all and must call `createClient` directly.
</details>
