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
- **The recurring enemy is a check that reports a result it did not earn** —
  usually a false green, once a false red. Nine instances so far, and the
  countermeasures below exist because of them.
- **Break a check on purpose before trusting it.**

## The line through the middle of the system

| | Deterministic | Probabilistic |
|---|---|---|
| **What** | parsers, chunkers, locator resolution, citation gate, rate limiter, auth, metric functions | retrieval ranking, generated prose, groundedness, refusal |
| **Checked by** | unit, integration **and E2E** tests | eval harness on the gold set |
| **Standard** | exactly right | better than the last baseline |
| **A failure is** | a bug | a regression, or an improvement |

**Playwright is on the deterministic side too.** `auth` sits in the left column
and has no unit test at all: that an anonymous visitor is *redirected* is an
HTTP-level fact only a browser establishes, and it is exactly right or it is a
bug. The split is between **asserting** and **measuring** (ADR-015).

The line runs *through* the model call. The prose that comes back is never
asserted. The schema parsing, timeout, retry and citation gate around it are
ordinary deterministic code and are tested as such. The common RAG mistake is
to write no tests because "it's AI", when most of the system is plain code.

## Test layers

| Layer | Runner | What |
|---|---|---|
| Pure TS | Vitest, `npm test` | parsers, assert, chunk, hash, manifest, gate, limiter, docs checks — and CLI arg parsing and manifest emission, under `scripts/ingest/` |
| Pure Python | pytest, `uv run pytest` | metrics (hand-computed), gold-set parsing, hash port, the candidate slate, and the pure halves of `db.py` and the pre-flight |
| Real Postgres | Vitest + local Supabase, `npm run test:integration` | upsert ordering invariants, text probes over stored units, cross-lingual role sets |
| Browser | Playwright, `npm run test:e2e` | admin auth guard |
| Probabilistic | eval harness | **nothing yet** — the metric *functions* are unit tested, but no retrieval has been scored, because `bakeoff.py` and `score.py` are not written ([status.md](status.md)) |

Case counts are in [status.md](status.md), re-derived from a run. They used to
sit in this table and were stale within three days.

The first row's odd entries earn their place: the `scripts/ingest/` tests exist
because `--dryrun` wrote to the database, and the fix was to *extract* the
parsing rather than patch it where it sat (guide 10, story 4).

The unit suites are **sub-second and need no services** (measured: ~0.5 s and
~0.1 s), which is why they run on every push and first in CI.

**Two commands sit beside the probabilistic layer and are not part of it.**
`eval:lint` asserts that every gold-set locator resolves to a real ingested
unit; `eval:preflight` asks whether a candidate model can be *served* at all.
Both are deterministic facts about artifacts, not judgements about answer
quality ([TESTING.md](../../TESTING.md)).

## Silent green: the failure this project keeps meeting

These are real instances. Every one of them was found and fixed:

| Instance | Why it read as a result |
|---|---|
| `\b` in a Hungarian regex | JS `\b` is ASCII-only, so it matched *inside* words and missed standalone ones |
| `.range()` paging with no `ORDER BY` | Postgres doesn't promise an order, so pages overlapped and skipped |
| Comparing two probe dialects over clean data | both sides were empty, so they "agreed", with the bug still present |
| Generalising `paragraph: number` to a tuple | quietly deleted "a sequence starts at 1". **245 tests still passed** |
| A test for a flag | passed with the flag ignored, because its fixture couldn't tell the difference |
| A skip reported as a pass (×2) | `console.warn` + `return` in Vitest counts as **passed**, and CI never has a corpus. CI said `31 passed` |
| A ranking metric with no resolution | the pre-flight's "60% top-3 agreement" rested on adjacent gaps four times *smaller* than the quantization noise it was comparing. Nothing was broken; the number could never have meant what it was read as meaning (guide 10, story 7) |

**Once it arrived inverted**, and that is the case to keep in mind, because no
non-vacuity assertion would have caught it. `except Exception` around a model
export turned a full disk into `serving: none` — a verdict about the **model**
manufactured from a fact about the **disk**, and self-confirming, since the
candidate then leaves the slate (guide 10, story 8). A false red is the same
fault: the check reported what it had not established.

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
- **A metric reports its own resolution.** The pre-flight prints the margin the
  ranking rests on beside the agreement figure, and when every probe is
  noise-dominated it says the check has no discriminative power — not "partly".
- **A measurement never catches `Exception`.** `MemoryError` and `OSError`
  raise; only a library's own failure is a result. "It failed" and "we could
  not run it" are different facts.
- **Read the summary line, not just the tick.** A green summary is itself a
  claim, and it can be false.

## Where this lives in code

| File | What |
|---|---|
| `lib/**/*.test.ts`, `scripts/ingest/*.test.ts` | unit tests, beside the code — including two in the CLI shell, for logic that was extracted precisely so it could be run |
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

<details><summary>A check reports "cannot be served". What must you establish before believing it?</summary>

That the failure was about the thing being measured. `serving: none` came out
of a full disk once — a true statement about the run, filed as a verdict about
the model. Ask what else could have produced this output, and whether the check
could have produced it while the subject was fine.
</details>

<details><summary>Why is `citation validity` tracked as a metric if it must be 100%?</summary>

So that a regression is *visible*. Anything under 100% is a gate bug, not a
quality score to tune.
</details>
