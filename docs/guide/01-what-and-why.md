# 01 · What and why

## TL;DR

- Apologia is a **Q&A research aid** for Catholic apologetics, theology and
  philosophy. It is Hungarian-first, bilingual (hu/en) and open source.
- It answers **from a curated corpus**, never from a model's memory, and every
  claim carries a mechanically checked citation.
- It is designed for **the sceptical reader**. Someone testing the system sets a
  higher bar than someone seeking reassurance, and meeting that bar serves both.
- Seven **non-negotiables** constrain every change. They're listed below, one
  line each.
- Several fashionable components are **absent on purpose**: vector DB, queue,
  streaming, agents, reranking. Each absence has an ADR.

## The problem

Ask a general-purpose chatbot what the Church teaches about the death penalty
and you get a fluent answer. It may be based on the 1997 text or the 2018 one.
It may quote the Catechism in words the Catechism never used. It may cite a
paragraph that says something else. Nothing in the output tells you which of
these happened.

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

This chapter describes intent, so there is no code to point at yet. The
non-negotiables are enforced in these places:

| Rule | Enforced in |
|---|---|
| 1 | `lib/corpus/parsers/*`, `lib/corpus/chunk.ts` |
| 2, 4 | `lib/citation/verify.ts` |
| 3 | `.gitignore` (`.corpus-cache/`), `lib/corpus/manifest.ts` (licence must be resolved) |
| 7 | `supabase/migrations/0004_schema_grants.sql` |

## Go deeper

- [docs/architecture.md § What this is](../architecture.md#what-this-is)
- [.claude/project.md](../../.claude/project.md): the brief, verbatim
- [ADR index](../adr/README.md)

## Check yourself

<details><summary>Why design for the sceptic rather than the believer?</summary>

Rigour that survives a hostile reader also serves a friendly one. The reverse
doesn't hold: an answer that merely reassures fails the first time someone
checks a citation.
</details>

<details><summary>Why no streaming, when every chat product streams?</summary>

The citation gate needs the whole answer to decide whether the answer may be
shown at all. Streaming would show text that might then fail verification
(ADR-005).
</details>

<details><summary>Name one non-negotiable and the "quiet failure" it prevents.</summary>

For example, rule 4. A machine-translated quotation would be attributed to a
real locator while the gate certified the untranslated original. The result is
a fabricated quote with a green check.
</details>
