# 09 · Quality

## TL;DR

- **Two kinds of correctness.** Deterministic code (parsers, the gate, auth,
  metrics) must be *exactly right*, and a failure is a bug. Probabilistic
  behaviour (ranking, prose, refusal) must be *measurably better*, and a change
  is a number that moved.
- **A test's layer follows from determinism, not from stack position:**
  Vitest or pytest for pure logic, Vitest against real Postgres for SQL
  behaviour, Playwright for user-visible flows, and the eval harness for
  everything probabilistic.
- **Components, route handlers and Server Actions get no unit tests.** If one
  seems to need one, the logic belongs in `lib/`.
- **The recurring enemy is "silent green":** a check that reports clean while
  checking nothing. It has happened here seven times, and the countermeasures
  below exist because of it.
- **Break a check on purpose before trusting it.**

## The line through the middle of the system

| | Deterministic | Probabilistic |
|---|---|---|
| **What** | parsers, chunkers, locator resolution, citation gate, rate limiter, auth, metric functions | retrieval ranking, generated prose, groundedness, refusal |
| **Checked by** | unit and integration tests | eval harness on the gold set |
| **Standard** | exactly right | better than the last baseline |
| **A failure is** | a bug | a regression, or an improvement |

The line runs *through* the model call. The prose that comes back is never
asserted. The schema parsing, timeout, retry and citation gate around it are
ordinary deterministic code and are tested as such. The common RAG mistake is
to write no tests because "it's AI", when most of the system is plain code.

## Test layers

| Layer | Runner | What |
|---|---|---|
| Pure TS | Vitest, `npm test` | parsers, assert, chunk, hash, manifest, gate, limiter, docs checks |
| Pure Python | pytest, `uv run pytest` | metrics (hand-computed), gold-set parsing, hash port |
| Real Postgres | Vitest + local Supabase, `npm run test:integration` | upsert ordering invariants, text probes over stored units, cross-lingual role sets |
| Browser | Playwright, `npm run test:e2e` | admin auth guard |
| Probabilistic | eval harness | retrieval metrics now, generation metrics later |

Case counts are in [status.md](status.md), re-derived from a run. They used to
sit in this table and were stale within three days.

The unit suites are **sub-second and need no services**, which is why they run
on every push and first in CI.

## Silent green: the failure this project keeps meeting

These are real instances. Every one of them was found and fixed:

| Instance | Why it reported clean |
|---|---|
| `\b` in a Hungarian regex | JS `\b` is ASCII-only, so it matched *inside* words and missed standalone ones |
| `.range()` paging with no `ORDER BY` | Postgres doesn't promise an order, so pages overlapped and skipped |
| Comparing two probe dialects over clean data | both sides were empty, so they "agreed", with the bug still present |
| Generalising `paragraph: number` to a tuple | quietly deleted "a sequence starts at 1". **245 tests still passed** |
| A test for a flag | passed with the flag ignored, because its fixture couldn't tell the difference |
| A skip reported as a pass (×2) | `console.warn` + `return` in Vitest counts as **passed**, and CI never has a corpus. CI said `31 passed` |

**The countermeasures**, each now a habit in the code:

- **Non-vacuity assertions.** A check over a set asserts that the set is
  non-empty (`expect(hits.length).toBeGreaterThan(0)`).
- **Skip as a skip.** `ctx.skip()` makes the summary line count skipped tests,
  so a CI run with no corpus says it checked nothing.
- **Record which checks ran.** The lock file says `anchor_agreement: checked`
  or `not applicable — one signal`, so "not checked" never reads like "fine".
- **Mutation by hand.** When the Summa landed, 17 deliberate mutations went
  into the parser, assert step, manifest schema and chunker, and all 17 were
  caught. The two tuple bugs above were found this way, not by reading.
- **Read the summary line, not just the tick.** A green summary is itself a
  claim, and it can be false.

## Where this lives in code

| File | What |
|---|---|
| `lib/**/*.test.ts` | unit tests, beside the code |
| `harness/tests/` | pytest; expected values worked out by hand |
| `integration/` | Postgres-backed specs; `scripts/integration.sh` refuses non-local URLs |
| `e2e/` | Playwright; `scripts/e2e.sh` hard-guards on localhost |
| `vitest.config.mts`, `vitest.integration.config.mts` | why `integration/` is excluded *by directory* |

## Go deeper

- [ADR-015: tests are chosen by determinism](../adr/015-testing-strategy.md) ·
  [TESTING.md](../../TESTING.md)
- [ADR-020: asserting a single-signal source](../adr/020-asserting-a-single-signal-source.md):
  "an assertion that cannot fail for the right reason is worse than an absent
  one"
- [10 · War stories](10-war-stories.md), the long versions

## Check yourself

<details><summary>Why don't React components get unit tests here?</summary>

Their deterministic logic should live in `lib/`, where it's tested without a
DOM. What remains is rendering and flow, which Playwright covers as a user
sees it (ADR-015).
</details>

<details><summary>What is a non-vacuity assertion, and what does it prevent?</summary>

It asserts that a check actually had something to check, such as a non-empty
result set. It prevents a comparison of two empty sets from reporting
"identical".
</details>

<details><summary>Why is `citation validity` tracked as a metric if it must be 100%?</summary>

So that a regression is *visible*. Anything under 100% is a gate bug, not a
quality score to tune.
</details>
