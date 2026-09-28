# 07 · Measurement 🚧

## TL;DR

- **"Better" must mean a number that moved on a frozen gold set.** Any change
  to retrieval, chunking, embeddings or the prompt must attach an eval report
  diff. Every question that stops passing is named and justified in review;
  CI does not run the eval.
- **The gold set came first**: 10 hand-written questions (v0), frozen in git
  *before* any retriever existed, so the benchmark can't be fitted to the system
  it judges.
- **The embedding model (ADR-008) will be chosen by a bake-off, not by model
  cards.** Every candidate embeds the same chunks. Each is scored on the same
  questions, and the report includes confidence intervals, because n is small.
- **The pre-flight is not the bake-off.** `eval:preflight` asks only *can this
  model be served* — does it export, and does the export still rank like the
  original. It has run; the bake-off, which is what scores retrieval and
  decides ADR-008, has not. Passing the pre-flight is how a candidate gets
  admitted, never how one wins.
- **Retrieval uses one embedding space.** The query and the corpus must be
  embedded by *the same* model, so whatever wins must also run at request time.
- **The harness is Python.** The deliverable is a measurement, and Python has
  honest tooling for it: model exports and bootstrap statistics (ADR-023).

## The measurement loop

```mermaid
flowchart LR
  gold["eval/questions/*.yaml<br/>frozen gold set"] --> score
  db[("current chunks<br/>is_current = true")] --> bake

  subgraph harness["harness/ (Python)"]
    pre["preflight.py ✅<br/>can this candidate<br/>be served at all?"]
    bake["bakeoff.py 📐<br/>embed every chunk<br/>once per candidate"]
    score["score.py 📐<br/>recall@k · full-recall@k · MRR<br/>+ bootstrap CIs"]
    lib["gold.py ✅ · metrics.py ✅ · db.py ✅<br/>hashing.py ✅ · candidates.py ✅"]
  end

  pre -->|admits a candidate| bake

  bake -.->|"(chunk, model) rows"| emb[("chunk_embeddings")]
  emb -.-> score
  lib --- score
  score -.-> report["eval report<br/>+ provenance"]
  report -.-> adr["ADR-008<br/>written from the numbers"]

  classDef planned stroke-dasharray: 5 5
  class bake,score,report,adr planned
```

## What is measured

**Retrieval** (the bake-off needs only this part):

| Metric | Meaning |
|---|---|
| `recall@k` (k = 5, 10, 20) | at least one expected unit is in the top k |
| `full-recall@k` | *all* expected units are in the top k. This is the one that matters for multi-source questions |
| `MRR@10` | 1 / rank of the first hit |

Every metric is **split into same-language and cross-lingual slices**. A
Hungarian question whose best sources are English is the case most likely to be
weak, and an aggregate would hide it.

**Generation** (once the query path exists): *citation validity* and *quote
fidelity* must read 100%, because anything less is a gate bug, not a quality
score. *Authority correctness* is the domain metric: an answer can be perfectly
cited and still present a theologian's opinion as Church teaching. *Refusal
correctness* is measured in both directions, so a system can't score well by
refusing everything.

## One subtle modelling decision

Retrieval returns **chunks**, while the gold set expects **units**, and a Summa
chunk covers a whole article of about 7 units. So a ranked result is a list of
*sets* of units. Flattening it would let one Summa chunk at rank 1 count as
seven hits and would inflate every score (`harness/apologia_eval/metrics.py`).

## Provenance, or it isn't evidence

Every report records the **corpus hash**, the embedding model, the generation
model and the prompt version. For the bake-off it also records **max sequence
length and a truncation count** per candidate. Measured on 2026-09-10
([ADR-023](../adr/023-python-at-the-measurement-boundary.md)): about 80% of
Summa chunks exceed 2,048 characters against about 0% of Catechism chunks, so
a 512-token model
truncates most of the Summa, and comparing it with an 8k-token model would
mostly measure window size.

The corpus hash is computed in TypeScript at ingestion and **reproduced
byte-for-byte in Python** (`hashing.py`), and a test pins the two together.

## The honest outcome table (from ADR-023, written before the result)

**What is open here is only which row the numbers select.** Every branch is
already decided, and so is the machinery each one needs: ADR-023 is accepted,
the query-embedding service's shape is settled, and Vercel's Python runtime is
a checked fact. Writing the interpretations down *before* the result is the
point — it is what stops "local won" being reported when a licence, not a
score, made the choice.

| If… | Then |
|---|---|
| an open-weights model wins **and can be served** | the Python query-embedding service runs it |
| a hosted API wins and its licence permits sending the corpus | a thin API call; Python was only needed offline |
| a hosted API wins but the licence forbids it | a local model is used, and ADR-008 must say *"X scored highest; Y is chosen because X is not licensable"*, not that local won on merit |
| ~~an open-weights model wins but **cannot be served**~~ | **prevented, not awaited.** Added 2026-09-15 as the row the table did not have — and then designed out, because a candidate with no serving route is admitted to nothing. `Serving.NONE` in `candidates.py` exists to record such a model rather than silently drop it |

That last row is why servability is measured **before** a candidate competes,
not after. Retrieval lives in one embedding space, so the model that embedded
the corpus must also embed the question; a winner with no serving route is not a
cheap option with a caveat, it is unusable — and the offline pass costs hours per
candidate before anyone finds out.

`npm run eval:preflight` establishes it: does the model export, how large is the
artifact, and **does the export still rank the way the original does**. That
second question is ADR-023's own provenance argument turned on our own export —
if a quantized artifact is what serves queries, the quantized artifact is what
has to be measured.

## Where this lives in code

| File | What |
|---|---|
| `eval/questions/q-*.yaml` | the gold set |
| `eval/reports/` | where a run's output lands; `preflight.json` is the first |
| `scripts/eval-lint.ts` | every expected locator exists in the DB |
| `harness/apologia_eval/gold.py` | reads and validates the gold set (pydantic) |
| `harness/apologia_eval/metrics.py` | the three retrieval metrics, hand-verified tests |
| `harness/apologia_eval/hashing.py` | corpus-hash port, pinned to TS output |
| `harness/apologia_eval/db.py` | reads current chunks, writes vectors, cosine search |
| `harness/apologia_eval/candidates.py` | the slate: each model's id, pretraining family, prefix convention and `Serving` |
| `harness/apologia_eval/preflight.py` | `npm run eval:preflight` — export, size, and rank agreement |
| `bakeoff.py`, `score.py` | not written yet |

How far each has got is [status.md](status.md); the diagram above marks what
does not exist.

## Go deeper

- [docs/evaluation.md](../evaluation.md): full metric definitions and the
  release rule
- [ADR-023: Python at the measurement boundary](../adr/023-python-at-the-measurement-boundary.md)
- [eval/README.md](../../eval/README.md) · [harness/README.md](../../harness/README.md)
- [Python learning path](python/README.md), if the harness code is new to you

## Check yourself

<details><summary>Why can't the corpus be embedded with an open model offline and queries with a hosted API?</summary>

Vectors are only comparable within one model's space. The cosine between them
would be noise, and nothing would raise an error.
</details>

<details><summary>Why no target numbers like "recall@10 ≥ 0.8" in advance?</summary>

Nobody knows what this corpus supports, so such a number would be invented. It
would either be cleared trivially or quietly lowered. What gets fixed in advance
is the part hindsight can corrupt: metric definitions, the gold set and the
release rule. The first baseline then becomes the number to beat.
</details>

<details><summary>Why confidence intervals?</summary>

Only 8 of the 10 v0 questions are scorable for retrieval (two test refusal), so
one question moves `recall@k` by 12.5 points. A point estimate would look
precise and mean little. The interval makes that thinness visible.
</details>
