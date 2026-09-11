# ADR-001 — Postgres + pgvector as the vector store

Status: **Accepted** · Milestone 0

> **TL;DR**
> - **Decision:** pgvector inside the existing Supabase Postgres — no dedicated vector database.
> - **Because:** Retrieval always joins similarity with tier, language and provenance, which in one Postgres is one query; the corpus is orders of magnitude below where a separate store pays off.
> - **Cost:** A scale ceiling in the low millions of vectors, little index tuning, and an index that shares resources with the app database.

## Context

The retrieval path needs approximate nearest-neighbour search over embedded
chunks. The project already runs Supabase (managed Postgres) for auth, the admin
allowlist, and every domain table. A dedicated vector database is the reflexive
choice in most RAG writeups.

## Problem

Does this system need a purpose-built vector store, or is pgvector sufficient?

## Alternatives considered

1. **A dedicated vector DB** (Pinecone, Qdrant, Weaviate). Better ANN
   implementations, richer index tuning, designed for scale. Costs a second
   datastore to operate, a second consistency boundary, and a second thing to
   provision before anyone can run the repo.
2. **pgvector in the existing Postgres.** One datastore. Weaker at very large
   scale.
3. **In-process / on-disk index** (FAISS, sqlite-vec). No infrastructure at all,
   but no shared state between a laptop and a deployment.

## Decision

**pgvector in the existing Supabase Postgres.**

## Reasoning

Sizing first. The Phase 1 corpus is single-digit thousands of citable units and
plausibly tens of thousands at full scope. This is three or four orders of
magnitude below where a dedicated vector database earns its operational cost.
Choosing one here would be optimising for a scale that this corpus — a fixed set
of historical documents — cannot reach.

The decisive argument is not scale, though: it is **joins**. Retrieval in this
system is never pure similarity. It filters and ranks by authority tier
(ADR-010), language, and source, and every returned chunk must be resolved to
its citable unit and provenance before it reaches the prompt. In pgvector that
is one query. Across two stores it is a similarity query, then a fan-out fetch,
then application-side reassembly — plus a synchronisation problem between the
index and the metadata that is the classic source of "the citation points at a
document that no longer exists".

There is also an open-source constraint. Someone cloning this repo should reach a
working system with Supabase and an API key. Every additional service is a
barrier between a reader and a running system, and the repo's purpose is to be
understood.

## Consequences

- One datastore, one backup story, one set of credentials.
- Metadata filtering and provenance resolution happen in the same query as the
  similarity search.
- The local E2E stack gets the vector index for free — no extra service in CI.
- An HNSW index and its parameters become a schema concern, tuned in migrations.

## Trade-offs

**We accept a scale ceiling.** pgvector degrades well into the low millions of
vectors; beyond that a dedicated store wins. If the corpus ever approaches that,
this decision is revisited — and the citable-unit model (ADR-002) makes the
migration tractable, because citations reference units, not vector ids.

**We accept less index tuning.** No control over quantisation strategies or exotic
index types. Index rebuilds after a large re-ingest are a maintenance operation
that has to be planned rather than a background service concern.

**We accept coupling.** The vector index shares its resource budget with the
application database. A heavy re-index competes with serving traffic. At this
corpus size that is a non-issue; it would not be at 100× the volume.
