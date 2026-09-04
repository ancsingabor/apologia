# Testing

**A test's layer is chosen by whether its output is deterministic, not by where
the code sits in the stack.** The argument, including the E2E-only alternative
that was considered and rejected, is [ADR-015](docs/adr/015-testing-strategy.md).

| Output | Gate |
|---|---|
| Deterministic, no I/O | Vitest — `npm test` |
| Deterministic, crosses Postgres | Integration test against the local stack |
| A user-visible flow | Playwright — `npm run test:e2e` |
| Probabilistic | The eval harness — never an assertion |

Components, route handlers and Server Actions get **no** unit tests. If one
seems necessary, deterministic logic has ended up in the wrong file.

## Deterministic — Vitest

```bash
npm test                # once
npm run test:watch      # while editing a parser
```

Parsers, chunkers, locator resolution, citation verification, the fail-closed
branch of the rate limiter. A failure here is a **bug**, not a quality
regression. Files are `*.test.ts` beside the code they test; `e2e/` is excluded
from collection so the two runners never fight over a file.

Citation verification is pure logic over a fixed input and must be exhaustively
tested — it is the single most important correctness property in the product,
and the gate run against a canned model response containing a fabricated
locator needs no API key, no network and no database.

Currently covered:

- **`lib/citation/verify.test.ts`** — the gate. Fabricated locators, quotations
  that are not verbatim, translated quotations, byte-level near-misses (a curly
  apostrophe, a trailing space), fragments reassembling a paragraph past the
  per-unit limit, and the ADR-017 revert path. The fixtures are invented text,
  never the real Catechism: a test that depended on the real wording would be a
  test that ships corpus (ADR-003).
- **`lib/rate-limit.test.ts`** — pins ADR-009's inversion: an errored limiter
  **denies**. A reverted fail-closed branch is invisible to every other kind of
  test, because it makes the endpoint work, uncapped.

## Probabilistic — the eval harness

Retrieval ranking, generated prose, groundedness, refusal behaviour. A change is
**a number that moved**, judged against a committed baseline.

`npm run eval` (Milestone 1). Metric definitions, the gold-set format and the
release rule: `docs/evaluation.md`.

## End-to-end — Playwright

```bash
npm run test:e2e        # ephemeral local Supabase stack, real migrations
npm run test:e2e:ui     # interactive
```

`scripts/e2e.sh` starts a local stack, overrides every Supabase env var to the
local values, and hard-guards on a `localhost` URL so it can never touch
production. `e2e/fixtures/seed.ts` → `seedFixtures()` is the extension point for
domain fixtures — extend it as tables are added, clearing children first.

**Port conflicts:** the local stack binds 54321/54322. Another Supabase project
running locally will hold those ports and `supabase start` will roll back. Stop
the other stack (`npx supabase stop` in its directory) first.

Currently covered: the admin auth guard (`e2e/dashboard.spec.ts`) — an
authenticated admin reaches `/dashboard`, an anonymous visitor is redirected to
`/login`.

To add as features land: locale routing and the bare-path redirect (ADR-013),
the review queue, and that an unpublished answer is unreachable by an anonymous
visitor — which is worth asserting at the HTTP level, not only trusting the RLS
policy.

## The broad gate

`npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build` — all reproduced
in CI on every PR (`.github/workflows/ci.yml`), with the unit suite ordered
before the Supabase stack so a deterministic regression fails in seconds rather
than after a stack boot and a build. `npm test` and the typecheck also run on
pre-push (`lefthook.yml`); the E2E suite does not, since it needs a stack and a
build. The Supabase CLI is pinned in CI; keep the pin in lockstep with the
validated local version.
