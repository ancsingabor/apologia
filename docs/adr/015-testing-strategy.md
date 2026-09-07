# ADR-015 — Tests are chosen by determinism, not by stack layer

Status: **Accepted** · Milestone 1

## Context

`docs/architecture.md` and `TESTING.md` already split the system in two —
deterministic code gets unit tests, probabilistic behaviour gets the eval
harness — and both files named Vitest as the runner for the first half. Neither
file had been backed by an installed runner: at the end of Milestone 0 the
project had Playwright, ESLint and `tsc`, and no unit test gate at all.

The question was therefore live rather than settled, and was reopened
deliberately: **is a unit-test layer worth having here at all, or is E2E enough?**

## Problem

The argument for dropping unit tests entirely is stronger than it used to be.
Writing an E2E spec is now cheap, GitHub runs a containerised Supabase stack out
of the box, and E2E tests assert what a user actually experiences instead of
what an internal function returns. A test suite that only exercises private
seams is a maintenance tax that resists every refactor.

Against that: the code this repo exists to get right is not user-facing surface.
The citation verifier, the CCC paragraph parser, the Summa's article chunker and
locator resolution are pure functions whose correctness lives in their edge
cases — a paragraph split one character early, a quoted span differing from its
unit by one non-breaking space, an objection chunk mislabelled as teaching.

## Alternatives considered

1. **E2E only.** One layer, no seam-coupling, tests what ships. But an E2E run
   answers *the answer came out wrong*, not *which of the three gate checks
   failed*, and enumerating forty malformed-input cases through a browser and a
   database is not a thing anyone does twice. The feedback loop — a stack boot
   plus a build plus a browser — is also the wrong shape for the moment it is
   most needed, which is while editing a chunker.
2. **Unit tests everywhere, by layer.** The default, and the reason unit-test
   suites acquire a bad name: it produces assertions about React components and
   mocked route handlers that break on every refactor and catch nothing.
3. **Choose the layer by the nature of the output.** Below.

## Decision

**The axis is whether the output is deterministic, not where the code sits in
the stack.**

| Output | Gate | Runner |
|---|---|---|
| Deterministic, no I/O — chunkers, locator parsing, the citation gate, the honeypot, the fail-closed branch of the limiter | Unit tests. A failure is a **bug**. | Vitest (`npm test`) |
| Deterministic, but crosses a real Postgres — unit upsert, locator resolution, pgvector top-*k* over a fixture corpus | Integration tests against the ephemeral local stack. | Vitest or Playwright, decided when the first one is written |
| A user-visible flow — locale routing, the admin guard, the review queue, an unpublished answer being unreachable | E2E. | Playwright (`npm run test:e2e`) |
| Probabilistic — ranking, prose, groundedness, refusal | **Never asserted.** A change is a number that moved. | The eval harness (`npm run eval`), `docs/evaluation.md` |

The model call is the instructive case, because it straddles the line. Its prose
gets no assertion, ever. Everything wrapped around it is ordinary deterministic
code and is tested as such: structured-output schema parsing, the timeout and
bounded retry, and — the highest-value test in the repository — **the
verification gate run against a canned model response containing a fabricated
locator.** That test needs no API key, no network and no database, and it asserts
the one property whose failure would be invisible to a reader.

## Reasoning

The E2E-only case was made on cost, and cost is the wrong axis. The expensive
thing about a test is not writing it; it is the length of the loop between
making a change and learning it broke something, and the precision of what you
learn. For a parser, both of those favour a runner that starts in 200ms and
points at a line.

Where the E2E-only argument *is* right is everything above `lib/`. Route
handlers, Server Actions and components get no unit tests here — they are tested
through the browser or not at all. That is a real reduction against the default,
and it is the half of the original proposal that survives.

## Consequences

- Vitest is installed and `npm test` is a CI step, ordered **before** the
  Playwright stack so a deterministic regression fails in seconds.
- `npm test` is also a pre-push hook. The E2E suite is not — it needs a Supabase
  stack and a build.
- The first test committed under this ADR is `lib/rate-limit.test.ts`, which
  pins ADR-009's inversion: an errored limiter denies. That property is silent
  in every other kind of test, because a reverted fail-closed branch makes the
  endpoint *work*, uncapped.
- `@types/node` moved `^20 → ^22` to match the Node version CI actually runs.
- No unit tests for components, route handlers, or Server Actions. If one seems
  necessary, that is evidence deterministic logic is sitting in the wrong file
  and should be extracted to `lib/`.

## Trade-offs

**Two runners is more configuration than one**, and there is now a boundary that
has to be judged rather than looked up. The table above is the judgement, and
the fallback rule is: if the assertion needs a browser to be meaningful, it is
an E2E test.

**The integration row is deliberately unresolved.** Whether unit-upsert and
pgvector tests run under Vitest against the local stack, or as Playwright
fixtures reusing `scripts/e2e.sh`, is a decision with real arguments on both
sides and no data yet. It gets made when the first such test is written, not
now, and it is small enough to revisit.

**Coverage percentage is not a target and will not be reported.** The property
tested — a fabricated citation cannot reach a reader — matters; the fraction of
lines executed while testing it does not.

## Amendment — 2026-09-07: the integration row is decided

Status of this amendment: **Accepted**. The trade-off above said the integration
runner "gets made when the first such test is written, not now". The ingestion
CLI wrote that test — `integration/corpus-upsert.test.ts`, over the unit upsert
this ADR named as the example — so the decision is due, and it is recorded here
rather than in a new ADR because this file pre-registered the question.

**Vitest, against the ephemeral local stack**, under a second config
(`vitest.integration.config.mts`) and a second script
(`npm run test:integration` → `scripts/integration.sh`, which mirrors
`scripts/e2e.sh`'s stack wiring and localhost guard).

### Reasoning

**The fallback rule in the trade-off above already decides it.** *"If the
assertion needs a browser to be meaningful, it is an E2E test."* Nothing being
asserted here is user-visible: the properties are that exactly one document per
language is current, that a re-ingest of unchanged content writes nothing, and
that a crashed run leaves a sweepable signature. Playwright would contribute a
browser and a Next build to a test about six SQL statements.

**Two configs is the honest cost, and it buys the property `npm test` exists
for.** The unit suite must stay sub-second and service-free — CI orders it
before the stack boot precisely so a parser regression fails in seconds. Merging
integration tests into `npm test` would make every unit run depend on Docker;
keeping them in the same runner under a different config keeps one mental model
and one assertion vocabulary while preserving that ordering.

**`integration/` is a directory, not a filename convention.** `*.itest.ts` would
have worked by a hair — `**/*.test.ts` does not match it — and that is exactly
the problem: a glob that excludes by one character is a glob that silently
re-includes when someone renames a file. `e2e/` is already excluded by
directory, so this follows a convention the repo has rather than inventing one.

### Consequences

- CI runs `npm run test:integration` after the Supabase stack it already starts
  for Playwright, so the stack boot is shared rather than paid twice.
- The pgvector top-*k* tests ADR-008 will need have a home already, with the
  stack wiring and the localhost guard written.
- The guard differs from the ingest CLI's on purpose. This suite truncates
  tables and refuses any non-local target outright, the way `e2e/fixtures/seed.ts`
  does; the CLI may legitimately target the cloud project and therefore only
  requires that a remote target be *chosen* (`--remote`), never forbidden.
