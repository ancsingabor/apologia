# Apologia — project brief

Source-grounded Catholic apologetics Q&A, Hungarian-first, bilingual (hu/en),
open source. Scaffolded from a private Next.js 16 + Supabase starter template.

## Read these before proposing anything

- `docs/architecture.md` — the shape, and the citable-unit idea everything follows from
- `docs/adr/` — every decision, with its rejected alternatives
- `docs/evaluation.md` — metric definitions and the release rule
- `docs/corpus.md` — per-source chunking, authority tiers, licensing constraints

## Non-negotiables

1. **The citable unit is the atom.** Chunks align to canonical locators
   (`ccc:1730`, `summa:I.q2.a3`). Never propose fixed-window chunking as a
   simplification — it destroys the property the product is built on (ADR-002).
2. **Citation verification is a hard gate**, deterministic, before display.
   Not a score, not a judge model, not after streaming (ADR-005).
3. **No corpus text in git.** Manifests and pipeline only (ADR-003).
4. **Answers are drafts until a human publishes** (ADR-006).
5. **No retrieval/chunking/prompt change without an eval report diff.**
   The release rule in `docs/evaluation.md` is a merge gate.
6. **Deny-by-default privileges.** Every new table needs an explicit grant or it
   is unreachable. That friction is deliberate.

## Deliberately absent, with reasons

Dedicated vector DB (ADR-001), queue/workers (ADR-004), streaming (ADR-005),
multi-turn chat, agents, reranking and hybrid search (Phase 3 — a baseline must
exist first), OWL/RDF (Phase 4, pre-registered in ADR-011).

Do not add these back as "improvements" without arguing against the ADR.

## Two kinds of correctness

Deterministic code (parsers, chunkers, locator resolution, citation
verification, auth, rate limiting) gets **unit tests**; a failure is a bug.
Probabilistic behaviour (ranking, prose, groundedness, refusal) gets the **eval
harness**; a change is a number that moved. Do not test the first kind with an
LLM, and do not assert the second kind without a measurement.

## Where things are

- Current milestone and next steps: `docs/architecture.md` header + `docs/adr/README.md`
- Gold set: `eval/questions/` — expected units are UNVERIFIED until Milestone 1's
  `eval:lint` resolves them against ingested text
- Source manifest: `corpus/sources.yaml` — no entry without a resolved licence
