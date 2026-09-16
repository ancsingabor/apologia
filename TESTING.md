# Testing

How to run the suites, and where a new test belongs. *Why* the layers are
drawn this way is [ADR-015](docs/adr/015-testing-strategy.md); the summary for
readers is [guide 09 — Quality](docs/guide/09-quality.md). What is covered
today, with counts, is [status.md](docs/guide/status.md). This file does not
repeat any of the three.

> **TL;DR**
> - **A test's layer follows from whether its output is deterministic**, not
>   from where the code sits in the stack.
> - Four runners: `npm test` (TS, pure) · `uv run pytest` (Python, pure) ·
>   `npm run test:integration` (real Postgres) · `npm run test:e2e` (browser).
> - **Components, route handlers and Server Actions get no unit tests.** If one
>   seems necessary, deterministic logic has ended up in the wrong file.
> - Probabilistic behaviour is **measured, never asserted**.
> - **A skip must report as a skip**, and a check over a set must assert the
>   set is non-empty. Both rules were bought with real bugs — guide 09
>   § Silent green.

## Which layer does a new test go in?

| Its output | Runner | Command |
|---|---|---|
| Deterministic, no I/O, TypeScript | Vitest | `npm test` |
| Deterministic, no I/O, Python | pytest | `cd harness && uv run pytest` |
| Deterministic, crosses Postgres | Vitest + local stack | `npm run test:integration` |
| A user-visible flow | Playwright + local stack | `npm run test:e2e` |
| Probabilistic | the eval harness | never an assertion |

The two pure layers are **sub-second and need no services**. They run on
pre-push and first in CI, so a parser or metric regression fails in seconds
rather than after a stack boot and a build.

## Pure TypeScript — Vitest

```bash
npm test                # once
npm run test:watch      # while editing a parser
```

Parsers, chunkers, locator resolution, citation verification, the fail-closed
branch of the rate limiter. **A failure here is a bug**, not a quality
regression. Files are `*.test.ts` beside the code they test; `e2e/` and
`integration/` are excluded from collection so the runners never fight over a
file.

Two tests whose *existence* is an argument (this is not an inventory — the
files are):

- **`lib/citation/verify.test.ts`** — the gate is the single most important
  correctness property in the product, it is pure logic over fixed input, and
  it needs no key, no network and no database. So it is tested exhaustively:
  fabricated locators, non-verbatim and translated quotations, byte-level
  near-misses, and the ADR-017 revert path. Its fixtures are **invented text,
  never the real Catechism** — a test that depended on the real wording would
  be a test that ships corpus (ADR-003).
- **`lib/rate-limit.test.ts`** — pins ADR-009's inversion: an errored limiter
  **denies**. A reverted fail-closed branch is invisible to every other kind of
  test, because it makes the endpoint *work*, uncapped.

## Pure Python — pytest

```bash
cd harness
uv sync --all-groups --extra db
uv run pytest           # no database, no network
```

Same layer, other language: the gold-set reader, the retrieval metrics, and the
byte-exact port of the TypeScript corpus hash. Python is confined to `harness/`
by [ADR-023](docs/adr/023-python-at-the-measurement-boundary.md) — it is
permitted where the deliverable is a measurement, and nothing there runs in a
request.

The metrics are checked against **hand-computed** expectations, not against
another implementation of the same formula. `db.py` imports its driver lazily,
so the pure half stays importable without `psycopg`; `--extra db` exists so
`mypy --strict` really typechecks the SQL layer instead of skipping it as an
unresolved import. Setup detail lives in [`harness/README.md`](harness/README.md).

## Crossing Postgres — Vitest against the local stack

```bash
npm run test:integration
```

ADR-015 left this row's runner deliberately open, to be settled when the first
such test was written. The ingest upsert wrote it, and the answer is **Vitest,
not Playwright**: nothing asserted here is user-visible, so a browser and a Next
build would be pure cost (ADR-015 § Amendment).

What belongs here is behaviour Postgres owns and a mock would have to imitate —
so imitating it would prove nothing. The upsert invariants are the worked
example: exactly one current document per language, enforced by a **partial
unique index**; an unchanged corpus writing nothing; a superseded document
keeping its units so stored citations still resolve; a crashed run leaving a
signature the next run sweeps.

Two mechanical rules:

- Specs live in `integration/` and are excluded from `npm test` **by directory,
  not by filename**. `*.itest.ts` would have escaped `**/*.test.ts` by a single
  character — the kind of exclusion that silently stops working when someone
  renames a file.
- The specs **hard-guard on `localhost` themselves**, not only in the shell
  wrapper, because they truncate tables.

A spec that needs an ingested corpus must **`ctx.skip()`** when there is none —
CI never has one. A `console.warn` and a `return` counts as *passed*, which is
how this project shipped two silent greens.

## User-visible flows — Playwright

```bash
npm run test:e2e        # ephemeral local stack, real migrations
npm run test:e2e:ui     # interactive
```

`scripts/e2e.sh` and `scripts/integration.sh` are the same shape: start the
local stack, apply pending migrations, override every Supabase env var to the
local values, refuse a non-local URL. `e2e/fixtures/seed.ts` → `seedFixtures()`
is the extension point for domain fixtures — extend it as tables are added,
clearing children first.

This layer is the thinnest on purpose, and will stay thin: it is for what only
a browser can establish. The auth guard qualifies — that an anonymous visitor
is *redirected* is an HTTP-level fact no unit test reaches. When answers become
publishable, that an unpublished one is unreachable anonymously belongs here
too, asserted at the HTTP level rather than trusted to the RLS policy alone.

## Running the local stack

The stack binds **54321/54322**. Another Supabase project running locally holds
those ports and `supabase start` rolls back. Stop the other one first —
`supabase stop --project-id <name>` works from any directory and takes a
backup, so its data survives. This affects `npm run test:integration`,
`npm run test:e2e` and `npm run ingest` equally.

## Probabilistic — measured, not asserted

Retrieval ranking, generated prose, groundedness, refusal behaviour. A change
is **a number that moved**, judged against a committed baseline — never a
pass/fail assertion. Metric definitions, the gold-set format and the release
rule are in [`docs/evaluation.md`](docs/evaluation.md).

Two commands live near this layer and are **not** part of it:

- **`npm run eval:lint`** asserts that every `expected_units` locator resolves
  to a real ingested unit. Ordinary deterministic checking — and it is what
  keeps the probabilistic layer honest, because a gold set nobody verified
  produces confident, meaningless numbers.
- **`npm run eval:preflight`** asks whether a candidate model can be *served*:
  does it export, and does the export still rank like the original. That is a
  deterministic property of an artifact, not a judgement about retrieval
  quality. Operator-initiated, and out of CI, because it needs torch.

## Gates

Which of these run on commit, on push, and in which CI lane — with the budget
each has — is one table in
[guide 08 § The gates between a change and `main`](docs/guide/08-infrastructure.md#the-gates-between-a-change-and-main).
It is not repeated here.
