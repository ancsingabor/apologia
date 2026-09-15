# Status

> **This is the only place the project's status is written down.** Other
> documents link here instead of restating it, because status that is repeated
> in five places drifts in five places. It already had: until 2026-09-11 the
> README still said "Milestone 0, the pipeline is not built".

**Last verified: 2026-09-14.** Every claim below comes with the command that
checks it. If a claim and its command disagree, the claim is wrong. Fix it here,
in the same PR that changed the truth.

## TL;DR

- **The corpus is done.** Three documents are ingested into Postgres: the
  Catechism in Hungarian and English, and the Summa in Latin.
- **Measurement has started.** The Python harness can read the gold set,
  compute the metrics and reproduce the corpus hash. It cannot yet embed or
  score anything.
- **The query path does not exist yet.** Nobody can ask a question today. The
  citation gate that will guard it is built and tested on its own.
- **Next up:** the embedding bake-off, which decides ADR-008 (the embedding
  model). The slate is three models, deliberately spanning two pretraining
  families — two XLM-RoBERTa derivatives compared alone could not say anything
  about pretraining, only about fine-tuning and context window.
- **Waiting on others:** the gold-set expansion (external authors) and a licence
  question about sending corpus text to hosted providers.

## Where we are on the roadmap

The roadmap is reconstructed from where the ADRs refer to it:

| Phase | Goal | State |
|---|---|---|
| **1** | A working, *measured* baseline: corpus → retrieval → verified, human-published answers | 🚧 **current** |
| ↳ Milestone 0 | Decisions, architecture, gold set v0, written before any code | ✅ done |
| ↳ Milestone 1 | Corpus ingested; harness; ADR-008 decided by measurement; query path | 🚧 corpus ✅, measurement 🚧, query path 📐 |
| **2** | Cost and abuse controls after a threat model (ADR-009) | 📐 |
| **3** | Improvements measured against the baseline: reranking, hybrid search, the adversarial set | 📐 |
| **4** | The pre-registered semantic-layer experiment (ADR-011, ADR-012) | 📐 |

✅ built · 🚧 in progress · 📐 planned

## Built ✅

| What | Evidence | Check it with |
|---|---|---|
| Ingestion CLI: fetch → parse → assert → chunk → cross-lingual → upsert → emit | `scripts/ingest/`, `lib/corpus/` | `npm run ingest -- --source=ccc --language=hu --dry-run` |
| CCC, Hungarian: **2,865** units, 2,865 chunks | `corpus/manifest.lock.yaml` | same file, `unit_count` |
| CCC, English: **2,865** units, 2,865 chunks | 〃 | 〃 |
| Summa Theologiae, Latin: **23,326** units, **3,453** chunks (one chunk per article) | 〃 | 〃 |
| Gold set v0: **10 questions**, all **17** expected-unit references (14 distinct locators across 8 questions) resolve against the database | `eval/questions/` | `npm run eval:lint` (needs the local stack) |
| Citation gate, pure and unit tested, not yet wired to anything | `lib/citation/verify.ts` | `npm test` |
| Fail-closed rate limiter (ADR-009) | `lib/rate-limit.ts` | `npm test` |
| Python harness contract layer: gold-set reader, metrics, corpus-hash port | `harness/apologia_eval/` | `cd harness && uv run pytest` |
| Corpus reader: current chunks, the unit mapping, vector writes, cosine search | `harness/apologia_eval/db.py` | `cd harness && uv run pytest` (pure half only — the SQL is not unit tested, by design) |
| The candidate slate, with each model's prefix convention and pretraining family | `harness/apologia_eval/candidates.py` | `cd harness && uv run pytest` |
| Servability pre-flight: does a candidate export, and does the export still rank like the original | `harness/apologia_eval/preflight.py` | `npm run eval:preflight -- <model-id>` (operator-initiated; needs torch) |
| Admin auth (proxy + `requireAdmin()`), deny-by-default grants, themes, copy | inherited from the template | `npm run test:e2e` |
| CI: a `harness` lane (Python) and a `verify` lane (lint, types, unit, docs structure, integration, build, E2E) | `.github/workflows/ci.yml` | any PR |
| Docs structure check: ADR TL;DRs, ADR index, Python walkthrough, relative links | `lib/docs/check.ts`, `scripts/docs-lint.ts` | `npm run docs:lint` |

Test counts on 2026-09-14: **339** Vitest cases in 20 files, **49** pytest
cases.

## In progress 🚧

The **measurement harness**, in this order, each step blocking the next:

0. ~~Servability pre-flight.~~ ✅ Done, and it moved ahead of the bake-off on
   purpose: ADR-023's outcome table had no row for *"an open-weights model wins
   and cannot be served"*, and establishing that after a full embedding pass per
   candidate is hours too late. `npm run eval:preflight`; baseline committed at
   `eval/reports/preflight.json`.

   **All three candidates export and serve.** Measured 2026-09-15, one candidate
   per run:

   | candidate | family | int8 artifact | cold load | per query | int8 agreement |
   |---|---|---|---|---|---|
   | `intfloat/multilingual-e5-large` | xlm-roberta | 578 MB | 2.6 s | 19 ms | 0.9924 |
   | `BAAI/bge-m3` | xlm-roberta | 586 MB | 5.9 s | 19 ms | 0.9827 |
   | `Qwen/Qwen3-Embedding-0.6B` | qwen3 | 614 MB | 2.9 s | 34 ms | **0.6239** |

   **`Qwen3` cannot be served as int8.** Its unquantized export reproduces the
   original at cosine **1.00000**, so the pooling, the inputs and the prefixes
   are right and the *quantization* is what breaks it — a 0.62 mean cosine is a
   different model, not a rounding error. It needs a different precision (fp16)
   or none, which puts cold-start memory back in play for that candidate alone.
   Without the fp32 control this would have entered the bake-off and produced
   plausible, meaningless numbers.

   ⚠️ The ranking-agreement column is deliberately **absent from that table**.
   On this probe set it carries no information: the ten gold questions are
   unrelated to each other, so each ordering rests on a gap smaller than the
   quantization noise. See guide 10, story 7.
1. ~~`harness/db.py` reads current chunks.~~ ✅ Done. It joins
   `documents.is_current = true`, because superseded documents keep their rows,
   and it re-derives each document's `content_hash` from its stored units — a
   corpus hash is a hash of hashes and would otherwise describe a half-written
   ingest without complaint.
2. `harness/bakeoff.py` embeds every chunk once per candidate model into
   `chunk_embeddings(chunk_id, model)`. **Local open-weights candidates only**
   until the ADR-003 licence question is answered; that answer must not be
   settled by running the bake-off.
3. `harness/score.py` scores against the gold set, with bootstrap confidence
   intervals, because n is small — and reports, per slice, the sample size that
   *would* separate the top two candidates.
4. **ADR-008**, the embedding and generation provider, is then written from
   the numbers — or deferred again, with the required n recorded here. A run
   that does not separate the candidates has succeeded; a point estimate that
   looks decisive at this n would not have.

`npm run eval` is not a script yet.

## Planned 📐

- **The query path.** Validate, rate limit, cache, retrieve, generate, run the
  citation gate, then persist the result as a draft. See guide chapter 06.
- **Migration `0006`:** `topics`, `questions`, `answers`, `answer_citations`,
  `retrieval_traces`.
- **The review queue** and the public `/hu/kerdes/<slug>` pages (ADR-006,
  ADR-016).
- **Per-request locale** via `app/[lang]/` (ADR-013). The app still renders the
  template's landing page and admin dashboard.
- **A query-time embedding service**, only if an open-weights model wins the
  bake-off (ADR-023).

## Blocked, and on whom

| Blocked | On | Blocks |
|---|---|---|
| Gold set expansion to 40–60 questions | External authors with the domain knowledge; requested, no committed date. Not generated by a model, on purpose (`docs/evaluation.md`). | The *quality* of the ADR-008 decision, not the machinery — but **more than this row used to admit**. 8 of 10 questions are retrieval-scorable, and split by slice that is **4 same-language and 4 cross-lingual**. The cross-lingual slice is the one `docs/evaluation.md` calls most likely to be weak, and it has n=4. The bake-off runs regardless; `score.py` reports the n that would actually separate two candidates, and that number belongs in this cell once it exists. |
| May corpus text be sent to a hosted embedding API? | Reading provider terms against the source licences (ADR-003, § Open question) | Any hosted candidate in the bake-off. Local open-weights models are not blocked |
| The Hungarian CCC's publisher/edition string | Confirmation from the printed edition | Nothing functional; `documents.edition` stays null |

## Go deeper

- [docs/architecture.md](../architecture.md): the full shape, including planned
  parts
- [docs/adr/README.md](../adr/README.md): every decision, with its state
- [eval/README.md](../../eval/README.md): the gold set's composition and
  history
