# Testing

Two kinds of correctness, checked two different ways. See
`docs/architecture.md § Two kinds of correctness`.

## Deterministic — unit tests

Parsers, chunkers, locator resolution, citation verification, auth, rate
limiting. A failure here is a **bug**, not a quality regression.

Vitest is added in Milestone 1 alongside the first parser. Citation verification
in particular is pure logic over a fixed input and must be exhaustively tested —
it is the single most important correctness property in the product.

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

`npm run lint`, `npx tsc --noEmit`, `npm run build` — all reproduced in CI on
every PR (`.github/workflows/ci.yml`). The Supabase CLI is pinned there; keep
the pin in lockstep with the validated local version.
