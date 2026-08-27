# Apologia

Source-grounded answers to questions of Catholic apologetics, theology and
philosophy — in Hungarian and English.

Every claim is traced to a specific, canonically addressable passage
(CCC §1730, *Summa* I q.2 a.3, Jn 1:1–14), and every citation is **checked
mechanically** before anyone sees it. Answers are drafted by the system and
**published by a human**.

It is a research aid that shows its work. It is not catechesis, not spiritual
direction, and not the Magisterium.

> **Status: Milestone 0.** The architecture is decided and documented; the
> pipeline is not built. This README does not describe features that do not
> exist — see [`docs/architecture.md`](docs/architecture.md) for what is planned
> and what is real.

## Why this repository might be worth reading

It is an attempt to show how a **production-oriented** AI application is
designed, rather than how quickly one can be assembled. The interesting parts
are the decisions, and they are written down:

- **[docs/adr/](docs/adr/)** — every meaningful decision, including the ones
  that went *against* the more impressive-looking option, and the trade-offs
  each one accepted.
- **[docs/architecture.md](docs/architecture.md)** — the shape, and the one idea
  the rest follows from.
- **[docs/evaluation.md](docs/evaluation.md)** — what "better retrieval" is
  allowed to mean here, written before the retriever, with a release rule.
- **[docs/corpus.md](docs/corpus.md)** — why one chunking strategy for the whole
  corpus would be wrong, and the Hungarian Bible licensing problem that
  constrains the product.
- **[ADR-011](docs/adr/011-semantic-layer-preregistration.md)** — a
  pre-registered experiment, with hypotheses, a kill criterion, and a prediction
  recorded before the result is known.

A few things it deliberately does **not** do: no dedicated vector database, no
queue, no streaming, no agent framework. Each of those is a decision with an ADR
behind it, not an oversight.

## Architecture in one diagram

```
                          ┌─ ingestion (offline CLI) ─────────────┐
  corpus/sources.yaml ───▶│ fetch → parse → citable units →       │
  (manifest, not text)    │ chunk per strategy → embed → upsert   │
                          └───────────────┬───────────────────────┘
                                          ▼
                                   Postgres + pgvector
                                          ▲
                          ┌───────────────┴───────────────────────┐
  question ──────────────▶│ validate → rate limit → retrieve →    │
                          │ compose context → generate →          │
                          │ ▸ VERIFY CITATIONS ◂ → draft          │
                          └───────────────┬───────────────────────┘
                                          ▼
                              human review → published
                                          ▼
                            /hu/kerdes/<slug>   (permanent, cited)
```

## Getting started

```bash
npm install
cp .env.example .env.local     # fill in Supabase + provider keys
npx supabase db push           # or paste supabase/migrations/* into the SQL editor
npm run dev
```

Add yourself to `admin_users` to reach `/dashboard`.

**The corpus is not in this repository**, by design — see
[ADR-003](docs/adr/003-ship-manifests-not-corpus.md). `corpus/sources.yaml`
describes each source and how to obtain it; the ingestion CLI (Milestone 1)
fetches and indexes it locally.

## Commands

| | |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | production build |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | type-check (also runs on `git push`) |
| `npm run test:e2e` | Playwright against an ephemeral local Supabase stack |
| `npm run ingest` | *(Milestone 1)* build the index from `corpus/sources.yaml` |
| `npm run eval` | *(Milestone 1)* score the gold set, write a report |

## Secrets

No credentials are committed. `.env.example` documents every variable by name.
Note that the ingestion keys — the Supabase service role key and the embedding
provider key — are needed only by an operator running the CLI, never by the
deployed app. That is a side effect of
[ADR-004](docs/adr/004-offline-ingestion-cli.md), and a welcome one.

## Provenance

Scaffolded from a private Next.js + Supabase starter template, which supplied
the admin auth (proxy guard + `requireAdmin()` double guard), the Supabase
client factories, the deny-by-default privilege model, the theming and copy
layers, and the Playwright + local-Supabase CI harness.

What was changed and why is in
[docs/architecture.md § Inherited from the template](docs/architecture.md#inherited-from-the-template).
The most interesting change is `lib/rate-limit.ts`, which was inverted from
fail-open to fail-closed — the template protects contact forms, where losing an
enquiry is the expensive outcome; here the expensive outcome is an unbounded
bill. Same code, opposite correct answer. See
[ADR-009](docs/adr/009-fail-closed-rate-limiting.md).

## Licence

MIT for the code. The corpus is not covered — each source carries its own terms,
recorded in `corpus/sources.yaml`.
