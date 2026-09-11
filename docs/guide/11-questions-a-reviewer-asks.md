# 11 · Questions a reviewer asks

## TL;DR

- These are the questions a senior technical reviewer is likely to ask. Each has
  a short answer and a link to where the full argument lives.
- Practise answering **before** opening the collapsed answer. The first five
  are the ones that come up first.
- **Known weaknesses are listed on purpose.** A design explained without its
  costs is not credible.
- Everything here is a summary. If an answer and its linked ADR disagree, the
  ADR is right.

## The first five

<details><summary><b>1. Introduce the project.</b></summary>

Use the 30-second pitch in [the guide's README](README.md#the-pitch). Then add
the one idea, the citable unit ([02](02-the-citable-unit.md)), and the one
enforcement point, the deterministic citation gate
([06](06-query-path.md)).
</details>

<details><summary><b>2. How do you stop it hallucinating?</b></summary>

It isn't prevented. It is *caught*, deterministically, before display. A
citation must name a unit that was in the model's context, and a quotation
must match its unit byte for byte. Otherwise the citation is dropped or the
answer fails. After that, a human publishes (ADR-005, ADR-006, ADR-017).
</details>

<details><summary><b>3. How do you know retrieval is any good?</b></summary>

A gold set was written before any retriever existed, and the metrics were fixed
in advance. Each report carries provenance (corpus hash, model) and confidence
intervals. There is also a merge rule: a retrieval or prompt change must attach
an eval diff, and a regression blocks it ([07](07-measurement.md)).
</details>

<details><summary><b>4. Why not a vector database, LangChain, or an agent framework?</b></summary>

Retrieval always joins similarity with tier, language and provenance. In one
Postgres that is a single query, and the corpus is orders of magnitude below
where a separate store pays off (ADR-001). The pipeline is one function per
stage with a `main()`, and a framework would hide the stages that need to be
visible and tested ([01](01-what-and-why.md#deliberately-absent)).
</details>

<details><summary><b>5. Why two languages, TypeScript and Python?</b></summary>

The rule is: Python only where the deliverable is a measurement, or the model
that produced it. The reasons are provenance (exporting a model is Python
tooling) and statistics (bootstrap CIs), not capability. Nothing working was
ported, and the one shared contract, the corpus hash, is pinned by a test
across languages (ADR-023).
</details>

## Architecture

<details><summary>Why is ingestion a CLI and not a service?</summary>

No user waits on it. A human starts it about a dozen times a year. A route
brings timeouts and an attack surface, and a queue brings a second runtime, and
neither buys anything (ADR-004, [03](03-system-map.md)).
</details>

<details><summary>How is the upsert atomic without transactions?</summary>

Through ordering. The new document is built invisibly (`is_current=false`),
then the old one is demoted and the new one promoted. A crash leaves a
signature the next run sweeps, and a partial unique index forbids two current
documents ([04](04-ingestion.md#upsert-without-transactions)).
</details>

<details><summary>What is your security model?</summary>

- Privileges are deny-by-default and granted per table.
- Corpus tables have no public grants at all.
- The public can read only `published` answers, enforced by grant and by RLS.
- Admin is double-guarded: the proxy, plus `requireAdmin()` in every action.
- The service-role key never reaches the deployment.
- The rate limiter fails closed.

See [05](05-data-model.md) and [08](08-infrastructure.md).
</details>

<details><summary>How does this scale?</summary>

It doesn't need to scale much. The corpus is a fixed set of historical texts,
and published answers are static pages. The real limit is the reviewer's
throughput, which is intentional (ADR-006). The first technical limit would be
an exact vector scan. Adding an index is a migration once ADR-008 fixes the
dimension.
</details>

## Engineering process

<details><summary>How do you test something built on an LLM?</summary>

Split it by determinism. Parsers, the gate, hashing and metrics are exact and
unit tested. Ranking and prose are measured, never asserted. The line runs
through the model call itself ([09](09-quality.md)).
</details>

<details><summary>What was the hardest bug?</summary>

Pick one from [10 · War stories](10-war-stories.md). The misnumbered paragraphs
(story 1) are the best example: a citation that is provably exact and points at
the wrong text.
</details>

<details><summary>How much of this was AI-assisted, and how do you own it?</summary>

A great deal of the code was written with an AI assistant, and every commit
says so. Ownership rests on three things. Every decision is recorded with its
rejected alternatives. Every deterministic part is tested and was broken on
purpose to prove the tests can fail. And this guide exists so the design can be
explained without reading the code.
</details>

## Known weaknesses, stated plainly

| Weakness | Mitigation, or why it is accepted |
|---|---|
| The gold set is 10 questions | CIs make the thinness visible; expansion to 40–60 is requested from domain authors |
| Nothing runs end to end yet; the query path is unbuilt | Its gate and limiter are built and tested; the rest waits on ADR-008 |
| Revision alignment is argued from one paragraph (§2267), not proved | `revision` is recorded, so it becomes checkable once a diff exists (ADR-019) |
| A claim mislabelled as a `connective` passes the gate | It becomes a measurable generator behaviour, not a hidden hole (ADR-018) |
| May corpus text be sent to a hosted embedding API? Unresolved | The bake-off starts with local models, which don't raise the question (ADR-003) |
| The Python hash port matches TS sort order only for lowercase-ASCII keys | Documented in `hashing.py` and pinned by a test |
| A null document licence can mean "inherited" or "nobody looked" | Recorded in ADR-021; a larger corpus would need an explicit `inherited` |
| Two toolchains double the contributor barrier | Accepted in ADR-023; one `npm run eval` entry point is planned |

## What I would do differently

- **Inventory a source by parsing it from day one.** The first ADR-019
  inventory counted anchors and misdiagnosed the most serious defect.
- **Don't write example locators before reading the text.** ADR-002 used
  `summa:I.q2.a3`, which turned out to be an article, not a unit, and three gold
  questions carried that mistake for a milestone.
- **Give status one home from the start.** It drifted in five places before
  [status.md](status.md) existed.
- **Challenge "only the operator needs this key" earlier.** ADR-004 said that
  about the embedding key, and ADR-023 had to correct it.

## Go deeper

- [ADR index](../adr/README.md): every decision with its alternatives
- [status.md](status.md): what exists right now
