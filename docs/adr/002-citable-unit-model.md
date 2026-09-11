# ADR-002 — The citable unit is the atom of the corpus

Status: **Accepted** · Milestone 0

> **TL;DR**
> - **Decision:** The corpus atom is the *citable unit* — a passage with a canonical address (`ccc:1730`) — and chunking aligns to unit boundaries, per source.
> - **Because:** A canonical address makes a citation checkable by lookup, stable across re-chunking, and aligned across languages.
> - **Cost:** A real parser per source type, paid up front; the design is bought by a property of this corpus and does not generalise.

## Context

Apologia answers questions from a curated corpus and attributes every claim to a
source. The corpus is heterogeneous: numbered magisterial documents, the Summa's
rigid scholastic structure, Scripture, and modern prose apologetics.

The default RAG design treats the corpus as an undifferentiated text stream, cut
into fixed-size overlapping windows (say 512 tokens, 50-token stride) and
embedded. Chunk boundaries fall wherever the token counter lands.

## Problem

Under that default, a "citation" is a chunk id. A chunk id is an artefact of the
chunker — it means nothing outside this system, it changes whenever the chunking
parameters change, and it cannot be checked against anything. The only available
question is *"does this cited text look like it supports the claim?"*, which
only a language model can answer, approximately.

For this domain that is a poor fit, because the sources already have identifiers
and they are far better than anything we would invent.

## Alternatives considered

1. **Fixed-size chunking, chunk id as citation.** Simplest, uniform, one code
   path. Citations are unverifiable and unstable across re-ingestion.
2. **Fixed-size chunking, plus a best-effort locator guessed at retrieval time.**
   Keeps the simple chunker and recovers a human-readable citation. But the
   locator is inferred, so it can be wrong, and a citation that is *usually*
   right is worse than one that is either right or absent.
3. **Citable units as the atom** — parse each source into the units its own
   tradition already addresses, and align chunks to those boundaries.

## Decision

The atomic unit of the corpus is the **citable unit**: a passage with a stable,
canonical, externally meaningful address.

```
ccc:1730                CCC, paragraph 1730
summa:I.q2.a3           Summa Theologiae, Part I, Question 2, Article 3
fides-et-ratio:43       encyclical, section 43
bible:jn:1:1-14         John 1:1–14
```

Chunks align to unit boundaries wherever the source has them. A source without
inherent structure (a modern essay) is chunked by prose heuristics and its units
carry a synthetic-but-stable locator, explicitly marked as such.

**This implies per-source-type chunking strategies, and that is the point.** The
manifest names a strategy per source. A uniform chunker cannot respect
boundaries that differ per source, and respecting them is the whole benefit.

## Reasoning

Canonical addresses turn a citation from a *plausible string* into a
**verifiable fact**. The system can check mechanically that a cited locator
resolves to a real unit and that the unit was in the context the model was given
(ADR-005). That check is deterministic, cheap, and total.

Two further properties fall out for free:

- **Stability.** Re-tuning the chunker does not invalidate stored citations,
  because citations point at units, not chunks.
- **Cross-lingual alignment.** CCC §1730 is §1730 in Hungarian and in English.
  The same unit exists in both languages under one identifier — an alignment key
  we did not have to build, and the backbone of the cross-lingual evaluation
  (ADR-007).

## Consequences

- The ingestion pipeline needs a real parser per source type, not one splitter.
- `units` is a first-class table; `chunks` references it.
- Citation verification becomes a deterministic gate rather than a judge model.
- The eval harness can express `expected_units` in canonical locators, so the
  gold set is readable by a human and stable across re-indexing.

## Trade-offs

**This is materially more work than fixed-size chunking**, and the cost is paid
per source type, up front, before any answer can be produced. It is the reason
Milestone 1 ingests exactly one source.

**It does not generalise to an arbitrary corpus.** A domain without canonical
addressing gets no benefit and should use the simple chunker. This design is
bought by a property of *this* corpus; it is not a universally superior pattern,
and presenting it as one would be a mistake.

**Synthetic locators are a weak point.** For unstructured sources the address is
ours, not the tradition's, so it carries none of the stability guarantees. Those
units are flagged, and citation display must not imply an authority the locator
does not have.
