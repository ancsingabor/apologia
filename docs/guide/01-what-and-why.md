# 01 · What and why

## TL;DR

- Apologia is a **Q&A research aid** for Catholic apologetics, theology and
  philosophy. It is Hungarian-first, bilingual (hu/en) and open source.
- It answers **from a curated corpus**, never from a model's memory, and every
  claim carries a mechanically checked citation. That is the design; what runs
  today is in [status](status.md).
- It is designed for **the sceptical reader**. Someone testing the system sets a
  higher bar than someone seeking reassurance, and meeting that bar serves both.
- Seven **non-negotiables** constrain every change. They're listed below, one
  line each.
- Several fashionable components are **absent on purpose**: a dedicated vector
  database, queues, streaming, agents, reranking. Each absence is recorded.

## The problem

Ask a general-purpose chatbot what the Church teaches about the death penalty
and you get a fluent answer. It may be based on the 1997 text or the 2018 one.
It may quote the Catechism in words the Catechism never used. It may cite a
paragraph that says something else. Nothing in the output tells you which of
these happened.

This is not hypothetical, and not only a chatbot's problem. The Hungarian
Catechism that was easiest to scrape turned out to be the 1997 text, so the same
locator, `ccc:2267`, would have taught opposite doctrine depending on the
reader's language — with every check passing
([war story 2](10-war-stories.md#2--the-same-paragraph-opposite-doctrine)).

For this domain, that failure is the norm, not a rare edge case. Misattributed
authority is the characteristic error of religious argument. So the product's
value is not fluency. The value is **being able to prove where every claim came
from**.

## The two readers

| Reader | Wants | What serves them |
|---|---|---|
| A Hungarian Catholic looking for an answer | a clear explanation in Hungarian | prose in their language, grounded in the sources |
| A sceptic testing the system | to catch it making things up | every citation resolvable, every quote exact, sources ranked by authority |

The design optimises for the second reader. A system that survives a hostile
reader is also trustworthy for a friendly one. The reverse is not true.

## What it is not

It is not catechesis, not spiritual direction, and not the Magisterium. It
shows its sources. It does not speak for the Church.

## The non-negotiables

From [`.claude/project.md`](../../.claude/project.md). Each one exists because
the obvious alternative fails in a way that *looks like success*.

| # | Rule | The quiet failure it prevents | ADR |
|---|---|---|---|
| 1 | The citable unit is the atom, not fixed-size chunks | citations that can't be checked against anything | [002](../adr/002-citable-unit-model.md) |
| 2 | Citation verification is a deterministic hard gate, before display | a judge model approving a plausible fabrication | [005](../adr/005-verify-then-display.md) |
| 3 | No corpus text in git: manifests and pipeline only | redistributing copyrighted magisterial text | [003](../adr/003-ship-manifests-not-corpus.md) |
| 4 | Translate the explanation, never the quotation | a fabricated quotation passing a green check | [014](../adr/014-translation-and-quotation.md) |
| 5 | Answers are drafts until a human publishes | an unreviewed error at a permanent URL | [006](../adr/006-draft-review-publish.md) |
| 6 | No retrieval, chunking or prompt change without an eval report diff | "it feels better" shipping as an improvement | [evaluation.md](../evaluation.md) |
| 7 | Deny-by-default database privileges | a new table silently readable by the public | [architecture.md § Privileges](../architecture.md#privileges) |

## Deliberately absent

| Not here | Why | ADR |
|---|---|---|
| A dedicated vector database | retrieval always joins similarity with tier, language and provenance, and in one Postgres that is a single query. Tens of thousands of units is orders of magnitude below where a separate store pays off | [001](../adr/001-pgvector-as-vector-store.md) |
| Queues and workers | ingestion is an offline CLI run by an operator, not a web job | [004](../adr/004-offline-ingestion-cli.md) |
| Streaming answers | the gate needs the complete answer before anything is shown | [005](../adr/005-verify-then-display.md) |
| Agents, multi-turn chat | one question in, one verified draft out | [.claude/project.md](../../.claude/project.md) |
| Reranking, hybrid search | an improvement needs a baseline to be measured against, so these wait for Phase 3 | [evaluation.md](../evaluation.md) |
| OWL/RDF ontology | a pre-registered Phase 4 experiment with a kill criterion | [011](../adr/011-semantic-layer-preregistration.md) |

Each absence is a decision that could have gone the other way, which is why each
one has a record.

## Where this lives in code

The chapter is about intent. Where each non-negotiable is (or will be) enforced
— which of these are wired in yet is [status](status.md)'s job, not this page's:

| Rule | Where |
|---|---|
| 1 | `lib/corpus/parsers/*`, `lib/corpus/chunk.ts` |
| 2, 4 | `lib/citation/verify.ts`, the gate the query path will call |
| 3 | `.gitignore` (`.corpus-cache/`), `lib/corpus/manifest.ts` (licence must be resolved) |
| 5 | the answers table and the admin publish step |
| 6 | review, by design not CI ([evaluation.md § Release rule](../evaluation.md#release-rule)) |
| 7 | `supabase/migrations/0004_schema_grants.sql` |

## Go deeper

- [docs/architecture.md § What this is](../architecture.md#what-this-is)
- [.claude/project.md](../../.claude/project.md): the brief, verbatim
- [ADR index](../adr/README.md)

## Check yourself

<details><summary>The TL;DR says every claim carries a checked citation. Where would you check whether that is true today, and why not on this page?</summary>

[status.md](status.md). This page describes the design, which changes rarely;
what is built changes with every PR, and a copy of it here would drift. Status
is written in one place so that there is only one place for it to be wrong.
</details>

<details><summary>Why no streaming, when every chat product streams?</summary>

The citation gate needs the whole answer to decide whether the answer may be
shown at all. Streaming would show text that might then fail verification
(ADR-005).
</details>

<details><summary>Name one non-negotiable and the "quiet failure" it prevents.</summary>

For example, rule 4. If the model translated an English Catechism passage into
Hungarian inside quotation marks, the citation would point at a real paragraph
and look verified, yet those words appear in no authoritative text.
</details>
