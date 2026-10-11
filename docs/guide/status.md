# Status

> **This is the only place the project's status is written down.** Other
> documents link here instead of restating it, because status that is repeated
> in five places drifts in five places. It already had: until 2026-09-11 the
> README still said "Milestone 0, the pipeline is not built".

**Code, corpus and all three local baselines checked: 2026-10-10.** The local
database was restored, its document hashes re-derived, and E5 int8, BGE-M3 int8
and Qwen3 fp32 embedded and scored the complete corpus. Repeated scoring
reproduced rankings and metrics.
Every claim below comes with the command that checks it. If a claim and its command disagree, the claim is wrong. Fix it here,
in the same PR that changed the truth.

## TL;DR

- **The corpus is done.** Three documents are ingested into Postgres: the
  Catechism in Hungarian and English, and the Summa in Latin.
- **Three retrieval baselines are recorded.** All three have complete local
  indexes and reproducible reports. Recall@10 is E5 4/8, BGE-M3 5/8 and Qwen3
  0/8. E5 versus BGE-M3 does not establish a winner; ADR-008 remains deferred.
- **The query path does not exist yet.** Nobody can ask a question today. The
  citation gate that will guard it is built and tested on its own.
- **Next up:** expand the authored gold set and assess serving feasibility
  before deciding ADR-008 (the embedding model). The measured slate spans two
  pretraining families, but architecture, precision, context windows and
  fine-tuning vary together; it does not isolate a pretraining-family effect.
- **Agreed 2026-10-10:** set aside the tested Qwen3-0.6B fp32 configuration for
  now. First expand toward 40–60 reviewed, human-authored questions spanning
  both language groups, then remeasure E5 and BGE-M3. This is not a rejection
  of every Qwen3 model or configuration, and 40–60 is a staged expansion goal,
  not a guaranteed sufficient sample size.
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
| Summa Theologiae, Latin: **23,326** units, **3,453** chunks | `corpus/manifest.lock.yaml` | same file, `unit_count` |
| …over **3,179** articles: **2,951** fit one chunk, **228** split at the chunker's 6,000-character budget, the longest into **9** | the ingested corpus | the query below (needs the local stack) |
| Gold set v0: **10 questions**, all **17** expected-unit references (14 distinct locators across 8 questions) resolve against the database | `eval/questions/` | `npm run eval:lint` (needs the local stack) |
| Citation gate, pure and unit tested, not yet wired to anything | `lib/citation/verify.ts` | `npm test` |
| Fail-closed rate limiter (ADR-009) | `lib/rate-limit.ts` | `npm test` |
| Python harness contract layer: gold-set reader, metrics, corpus-hash port | `harness/apologia_eval/` | `cd harness && uv run pytest` |
| Corpus reader: current chunks, the unit mapping, vector writes, cosine search | `harness/apologia_eval/db.py` | `cd harness && uv run pytest` (pure half only — the SQL is not unit tested, by design) |
| The candidate slate, with each model's prefix convention and pretraining family | `harness/apologia_eval/candidates.py` | `cd harness && uv run pytest` |
| Local ONNX corpus pass: resumable commits, artifact-based embedding identity | `harness/apologia_eval/bakeoff.py` | `npm run eval:bakeoff -- --help` |
| Retrieval scorer: provenance, language/source slices, bootstrap CIs, paired comparison and exploratory total-n estimate | `harness/apologia_eval/score.py` | `npm run eval -- --help` |
| Servability pre-flight: does a candidate export, and does the export still rank like the original | `harness/apologia_eval/preflight.py` | `npm run eval:preflight -- <model-id>` (operator-initiated; needs torch) |
| Admin auth (proxy + `requireAdmin()`), deny-by-default grants, themes, copy | inherited from the template | `npm run test:e2e` |
| CI: a `harness` lane (Python) and a `verify` lane (lint, types, unit, docs structure, integration, build, E2E) | `.github/workflows/ci.yml` | any PR |
| Docs structure check: ADR TL;DRs, ADR index, Python walkthrough, relative links | `lib/docs/check.ts`, `scripts/docs-lint.ts` | `npm run docs:lint` |

Test counts checked 2026-10-10: **350** Vitest cases in 20 files; **124**
pytest cases in both the operator and CI-sized environments.

How many Summa articles survive chunking whole — the lock file records chunks,
not articles, so this is re-derived from the rows (`docker exec
supabase_db_apologia psql -U postgres -d postgres`):

```sql
with per_article as (
  select case when position('.' in u.locator) = 0 then u.locator
              else left(u.locator, length(u.locator)
                                   - position('.' in reverse(u.locator))) end as article,
         count(distinct cu.chunk_id) as chunks
  from units u
  join chunk_units cu on cu.unit_id = u.id
  join documents d on d.id = u.document_id
  join sources s on s.id = d.source_id
  where s.id = 'summa' and d.is_current
  group by 1
)
select count(*) as articles, sum(chunks) as chunks,
       count(*) filter (where chunks = 1) as whole,
       count(*) filter (where chunks > 1) as split,
       max(chunks) as worst
from per_article;
```

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
2. ~~Implement the corpus embedding pass.~~ ✅ `bakeoff.py` uses the same local
   ONNX encoder as the query scorer. Artifact files, tokenizer, pooling,
   prefixes, normalization and context window form its identity. It commits
   batches and resumes without mixing model spaces. **All three full-corpus executions
   passed by 2026-10-10.** Local artifacts only; the licence question still
   blocks hosted corpus transmission. The Qwen3 int8 export is refused; the
   verified fp32 replacement completes the three-candidate comparison.
3. ~~Implement scoring and reports.~~ ✅ `score.py` checks locator coverage and
   index completeness, reports the fixed retrieval metrics, language and
   expected-source slices, token truncation and provenance, and writes JSON plus
   Markdown. Paired recall@10 comparisons name gained/lost questions and give
   an exploratory total-n estimate per slice. **All three baselines and their paired
   comparisons are saved below.** A tie or constant paired sample yields
   no identifiable estimate; bootstrap intervals cannot compensate for the small authored gold set.
4. ~~Run BGE-M3 against E5.~~ ✅ Complete on the same corpus and gold set.
   Both full indexes skip already committed chunks on rerun. E5's
   interruption/resume and incomplete-index refusal checks passed; BGE-M3
   preserved all E5 vector checksums and reproduced its scoring results.
   **Qwen3 fp32 pre-flight passed on 2026-10-09**: cosine agreement
   rounds to 1.00000 and all probe top-3 rankings match. The 2,400 MB artifact
   loaded in 17.9 seconds locally; its larger size remains a serving tradeoff.
   [Dated evidence](../../eval/reports/preflight-qwen3-fp32-2026-10-09.md).
   Full-corpus embedding, two matching scoring runs, index-isolation checks and
   a complete no-write rerun passed on 2026-10-10. Commands are in
   [harness/README.md](../../harness/README.md).
5. **ADR-008**, the embedding model and provider, is then written from the
   numbers — or deferred again, with the required n recorded here. A run that
   does not separate the candidates has succeeded; a point estimate alone must
   not decide it. The generation provider remains a separate ADR still owed.

`npm run eval` now scores one local artifact; `npm run eval:bakeoff` embeds it.
Their deterministic halves pass unit, lint, format and strict typing gates.


## First retrieval baseline — 2026-10-09

[E5 int8: human report](../../eval/reports/baseline-e5-int8-2026-10-09.md) ·
[machine report](../../eval/reports/baseline-e5-int8-2026-10-09.json)

| Slice | Scorable questions | recall@10 | full-recall@10 |
|---|---|---|---|
| All | 8 | 4/8 | 1/8 |
| Same-language | 4 | 2/4 | 0/4 |
| Cross-lingual | 4 | 2/4 | 1/4 |

The overall recall@10 bootstrap interval is **[0.125, 0.875]**. This is a thin
baseline, not an ADR-008 decision. The Summa diagnostic has **0/3** questions
finding a Summa expectation in the top 10; one finds its expected unit at rank
17. E5 truncates **2,748/3,453** Summa passages and **5/5,730** CCC passages.
Both are observed facts, not evidence that truncation caused the misses.

The live run re-derived document hashes, matched the committed manifest's corpus
hash, and resolved all expected gold locators. An interruption after 176 committed
vectors preserved every checksum; restart skipped them. The partial-index scorer
refused to write a report. Two full scoring runs produced identical ranked
locator sets, metrics, intervals and token-truncation counts. Re-running the
complete bake-off wrote no further batches. No hosted corpus transmission and no
generation occurred. The Markdown report records local latency; it is not
production or end-to-end answer latency.

## BGE-M3 paired comparison — 2026-10-09

[BGE-M3 int8: human report](../../eval/reports/baseline-bge-m3-int8-2026-10-09.md) ·
[machine report](../../eval/reports/baseline-bge-m3-int8-2026-10-09.json) ·
[paired comparison](../../eval/reports/baseline-bge-m3-int8-2026-10-09.comparison.json)

| Slice | E5 recall@10 | BGE-M3 recall@10 | E5 full-recall@10 | BGE-M3 full-recall@10 |
|---|---|---|---|---|
| All | 4/8 | 5/8 | 1/8 | 2/8 |
| Same-language | 2/4 | 2/4 | 0/4 | 1/4 |
| Cross-lingual | 2/4 | 3/4 | 1/4 | 1/4 |

BGE-M3 gains **q-0002** and **q-0004**, but loses **q-0008**, at recall@10.
The overall paired difference (BGE-M3 minus E5) is **+0.125**, with a 95%
bootstrap interval of **[-0.25, 0.50]**. Same-language is **0.00 [-0.75, 0.75]**;
cross-lingual is **+0.25 [0.00, 0.75]**. None establishes a winner. In the tied
same-language slice, the report's `first` field follows identity order; it is
not evidence of superiority.

The exploratory paired normal approximation gives **207 total questions** for
the overall observed effect and **32 total cross-lingual questions** (95%
confidence, 80% power). The same-language estimate is unidentifiable because
its observed mean difference is zero. These are planning estimates from tiny,
authored, post-selection samples, not stopping rules or additional-question
counts. **ADR-008 remains deferred** pending a broader gold set and serving assessment.

BGE-M3 finds a Summa expectation at rank 2 for q-0004: the Summa diagnostic
recall@10 is **1/3**, versus E5's **0/3**. BGE-M3 truncates **0/9,183** passages
and no scored queries. The wider context window and changed fine-tuning vary
together, so this run cannot establish which caused the retrieval differences.
Both candidates are XLM-RoBERTa derivatives; the Qwen3 comparison below
adds a second family without isolating its causal contribution.

The corpus and gold hashes match E5 exactly. All **9,183 E5 vector checksums**
remained unchanged. Independent token-length counts match the report, repeated
scoring reproduced rankings, metrics, intervals and comparisons, and a complete
bake-off rerun wrote no additional batches. Several scoring processes wrote valid matching reports but failed during native
shutdown. Explicit garbage collection did not reliably fix the exit. Local
runs with `TOKENIZERS_PARALLELISM=false` were then checked separately; see the
harness runtime note. The native shutdown fault remains an operational
limitation; inference and the embedding identity are unchanged. No hosted corpus transmission or
generation occurred.

## Qwen3 and the completed slate — 2026-10-10

[Qwen3 fp32: human report](../../eval/reports/baseline-qwen3-fp32-2026-10-10.md) ·
[machine report](../../eval/reports/baseline-qwen3-fp32-2026-10-10.json) ·
[three-model comparison](../../eval/reports/baseline-qwen3-fp32-2026-10-10.comparison.json) ·
[explicit Qwen3 pairs](../../eval/reports/baseline-qwen3-fp32-2026-10-10.pairwise.json)

| Configuration | recall@10 | full-recall@10 | Same-language recall@10 | Cross-lingual recall@10 |
|---|---|---|---|---|
| E5 int8 | 4/8 | 1/8 | 2/4 | 2/4 |
| BGE-M3 int8 | 5/8 | 2/8 | 2/4 | 3/4 |
| Qwen3 fp32 | 0/8 | 0/8 | 0/4 | 0/4 |

Qwen3 has zero passage/query truncation. At cutoff 20 it finds an expectation
for q-0005 and q-0010 (recall 2/8; full recall 1/8). Its recall@10 interval
[0, 0] describes a constant observed sample, not guaranteed future failure.
E5 minus Qwen3 is +0.50 [0.125, 0.875] overall; BGE-M3 minus Qwen3 is +0.625
[0.25, 0.875]. The human report records every language slice and gained question.
The three-model summary still selects E5 and BGE-M3 as its top two per slice:
207 total overall questions and 32 total cross-lingual questions are its
exploratory planning estimates; the tied same-language effect is unidentifiable.
**ADR-008 remains deferred.** Qwen3 performs poorly in this configuration, while
the eight authored scored questions do not distinguish E5 from BGE-M3 reliably.
These estimates are not additional-question counts or stopping rules.

Two scoring processes exited cleanly and reproduced all rankings, metrics,
intervals and comparisons. Every E5/BGE vector checksum was preserved. The
6,928 Qwen3 vectors saved before a deliberate memory-related restart also
survived unchanged. A completed embedding rerun skipped all chunks. Targeted
query and expected-passage checks agree with original Qwen3 CPU weights at
cosine 1.000000; stored passage coordinates match recomputation within 8.36e-9.
The instruction was not tuned after observing the scores.

Repeated macOS system sleeps interrupted the long encoding run; temporary
idle-sleep prevention was enabled and released when it finished. Sleep,
swapping and restart make total elapsed time unsuitable as model throughput.
The 2.4 GB fp32 artifact's serving memory and cold-load cost remain separate
from retrieval quality. No generation or hosted corpus transmission occurred.

## Planned 📐

- **The query path.** Validate, rate limit, cache, retrieve, generate, run the
  citation gate, then persist the result as a draft. See guide chapter 06.
- **Migration `0006`:** `topics`, `questions`, `answers`, `answer_citations`,
  `retrieval_traces` — and, while it is open, two corrections to `0005`, which
  is applied and so is corrected forward rather than edited: a
  `comment on table chunk_units` replacing its rationale, which argues from
  cases a plain foreign key would in fact handle (guide chapter 05), and a
  `comment on column units.locator` replacing its example `summa:I.q2.a3`,
  which names an article and so is not a unit locator at all.
- **The review queue** and the public `/hu/kerdes/<slug>` pages (ADR-006,
  ADR-016).
- **Per-request locale** via `app/[lang]/` (ADR-013). The app still renders the
  template's landing page and admin dashboard.
- **A query-time embedding service**, only if an open-weights model wins the
  bake-off (ADR-023).
- **Finish the Supabase API-key rename, before the end of 2026.** Supabase
  replaced the legacy `anon` and `service_role` keys with publishable
  (`sb_publishable_…`) and secret (`sb_secret_…`) keys, which rotate
  independently; **the legacy pair stops working at the end of 2026.** The
  public half is already renamed. `SUPABASE_SERVICE_ROLE_KEY` is not, although
  `scripts/e2e.sh` and CI already fill it from `SECRET_KEY` — so the name is
  behind the value. Renaming it touches `.env.example`, `lib/supabase/`, both
  runner scripts, CI and the Vercel project env.
- **A check that a tierable source carries an authority tier.** ADR-010 says
  every source has one, assigned by hand and never inferred. Nothing enforces
  it in that direction: `0005`'s constraint only forbids a tier on `scientific`
  and `historical` sources, and `sourceSchema.authority_tier` is
  `.nullable().default(null)`, so an encyclical with no tier at all would pass
  the manifest, the database and every assertion — and reach context assembly
  as an unlabelled block. The manifest schema is the place for it, beside the
  resolved `license` ADR-003 already demands. Recorded in
  [ADR-010 § Amendment](../adr/010-authority-tiers.md).
- **An ADR for the generation provider.** Claude is assumed by `.env.example`,
  `CLAUDE.md`, guide 06 and guide 08, but was never compared against anything
  and has no ADR. It used to sit inside ADR-008, which the bake-off cannot
  decide — the harness measures retrieval and no generation model at all. This
  one is owed as a *recorded choice with its reasons*, not as a measurement.

## Blocked, and on whom

| Blocked | On | Blocks |
|---|---|---|
| Gold set expansion to 40–60 questions | External authors with the domain knowledge; requested, no committed date. Not generated by a model, on purpose (`docs/evaluation.md`). | The *quality* of the ADR-008 decision, not the machinery — but **more than this row used to admit**. 8 of 10 questions are retrieval-scorable, and split by slice that is **4 same-language and 4 cross-lingual**. The cross-lingual slice is the one `docs/evaluation.md` calls most likely to be weak, and it has n=4. The bake-off runs regardless; `score.py` reports an exploratory total-n estimate for separating two candidates, the completed top-two comparison estimates 207 total overall and 32 total cross-lingual questions; same-language is unidentifiable. These exploratory estimates do not override the need for independently authored questions or establish a stopping rule. |
| May corpus text be sent to a hosted API? | Reading provider terms against the source licences (ADR-003, § Open question) | Any hosted candidate in the bake-off. Local open-weights models are not blocked — **but generation is not exempt**, and ADR-003 asks the question only about embedding. Every generated answer puts retrieved unit text in a prompt to Anthropic, in production, per request. If the answer is "not permitted", it does not merely narrow the bake-off; it rules out the generation path the whole design assumes |
| The Hungarian CCC's publisher/edition string | Confirmation from the printed edition | Nothing functional; `documents.edition` stays null |

## Go deeper

- [docs/architecture.md](../architecture.md): the full shape, including planned
  parts
- [docs/adr/README.md](../adr/README.md): every decision, with its state
- [eval/README.md](../../eval/README.md): the gold set's composition and
  history
