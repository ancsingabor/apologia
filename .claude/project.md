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
   Full text is ingested for retrieval; display is locator + link + our prose.
   Embedding is not redistribution — that is what makes restricted magisterial
   sources usable.
4. **Translate the explanation, never the quotation** (ADR-014). Answer prose is
   generated in the reader's language. Source passages are shown only in a
   language with an authoritative text — never machine-translated. A quoted span
   must match its unit's text exactly; this is checked, not requested.
5. **Answers are drafts until a human publishes** (ADR-006).
6. **No retrieval/chunking/prompt change without an eval report diff.**
   The release rule in `docs/evaluation.md` is a merge gate.
7. **Deny-by-default privileges.** Every new table needs an explicit grant or it
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

The test layer follows from that axis, never from stack position (ADR-015):
Vitest for pure deterministic code, an integration test when it crosses a real
Postgres, Playwright for user-visible flows. Components, route handlers and
Server Actions get **no** unit tests — if one seems necessary, deterministic
logic is sitting in the wrong file and belongs in `lib/`.

## Where things are

- Current milestone, next steps and blockers: `docs/guide/status.md` — the only
  place status is written; update it in the same PR that changes the truth
- Human-readable overview and diagrams: `docs/guide/` (summarises and links down
  to the ADRs; never the only home of a rationale)
- Gold set: `eval/questions/` — every `expected_units` locator is verified by
  `npm run eval:lint` against ingested text; a new question is unverified until
  it passes
- Source manifest: `corpus/sources.yaml` — no entry without a resolved licence
