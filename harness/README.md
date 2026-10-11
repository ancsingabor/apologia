# The measurement harness

Python lives here and nowhere else in the repository, on the rule
[ADR-023](../docs/adr/023-python-at-the-measurement-boundary.md) states:

> Python is permitted where the deliverable is **a measurement or the model that
> produced it**. Everything the request path touches, and everything already
> covered by the TypeScript unit suite, stays TypeScript.

Nothing here runs in a request, and nothing here was ported from working
TypeScript. `lib/corpus/` and `scripts/ingest/` stay where they are.

> **TL;DR**
> - The Python half of the repo exists only to **measure**. Its first job is
>   the embedding bake-off that decides ADR-008.
> - Built: the gold-set reader (`gold.py`), the retrieval metrics
>   (`metrics.py`), a **byte-exact port** of the TypeScript corpus hash
>   (`hashing.py`) and the corpus reader (`db.py`). The offline passes are
>   `bakeoff.py` (local ONNX artifacts) and `score.py` (reports and comparison).
> - `uv` owns the interpreter (3.12). The gates are `pytest`, `ruff` and
>   `mypy --strict`, in their own CI lane.
> - A retrieval result is a ranked list of **sets** of units, because one Summa
>   chunk covers a whole article.

**New to Python, coming from TypeScript?** Start at
[docs/guide/python/](../docs/guide/python/README.md): a learning path, a
TS ↔ Python vocabulary with a location for every idiom used here, and a
walkthrough of each module.

## Running it

```bash
brew install uv          # once
cd harness
uv sync --all-groups --extra db --extra stats
uv run pytest            # service-free: no database and no network
uv run ruff check .
uv run mypy apologia_eval tests
```

`--extra db` is `psycopg`. It is not needed to run the tests — `db.py` imports
the driver lazily so the pure half stays importable without it — but `mypy`
needs it to typecheck the SQL layer instead of skipping it. The `local-models`
extra is separate: it supplies the reference weights tooling for pre-flight.
The corpus pass and scorer load local ONNX exports through the `export` extra.

The database-touching work reads `DB_URL`, which is the name
`supabase status -o env` already prints:

```bash
supabase start
eval "$(supabase status -o env | grep -E '^[A-Z0-9_]+=')"
```

`uv` manages its own interpreter, which matters on a machine where `python3`
resolves to an old Anaconda build. `.python-version` pins 3.12 to match
Vercel's default runtime.

## What is here

| module | |
|---|---|
| `hashing.py` | `corpusHash` / `documentContentHash`, **ported** from `lib/corpus/hash.ts` |
| `gold.py` | reads the frozen gold set from `eval/questions/*.yaml` |
| `metrics.py` | `recall@k`, `full-recall@k`, MRR, as `docs/evaluation.md` defines them |
| `db.py` | reads the current corpus, writes candidate vectors, searches by cosine |
| `candidates.py` | the slate: which models compete, and the prefix each one needs |
| `preflight.py` | whether a candidate can be *served* — measured before it competes |
| `bakeoff.py` | artifact identity, resumable local ONNX corpus pass |
| `score.py` | retrieval reports, bootstrap intervals and paired comparison |

## The servability pre-flight

```bash
npm run eval:preflight -- intfloat/multilingual-e5-large
```

One candidate per invocation, because the memory figure is a whole-process
high-water mark. It exports the model to a quantized ONNX artifact — the thing
that would actually serve queries — and reports the artifact size, the load and
query time, and whether the export still **ranks** the probe texts the way the
original does.

It answers a question ADR-023's outcome table did not ask: a model that wins the
bake-off and cannot be served has not produced a cheap option with a caveat, it
has produced no query path at all. Running this first means that is discovered
in an hour rather than after a full embedding pass per candidate.

⚠️ It needs the `local-models` and `export` extras, which include torch. Both
stay out of CI.

⚠️ **Budget ~10 GB of free disk per candidate while it runs.** The download, a
temporary fp32 ONNX export and the quantized artifact all coexist briefly; the
fp32 intermediate is deleted as soon as the int8 one exists. Running out of
space does **not** produce a finding — it raises, because a full disk says
nothing about whether a model can be served (guide 10, story 8). Between
candidates, `~/.cache/huggingface/hub/models--*` for anything already measured
is safe to delete: the artifact and the report are what matter.

## Two things that look like duplication and are not

**`hashing.py` is a port, and must stay one.** `lib/corpus/hash.ts` is
authoritative. This copy exists because `docs/evaluation.md` requires every eval
report to record the corpus hash, and the harness that writes those reports is
Python. `tests/test_hashing.py` pins the agreement against values produced by
the TypeScript implementation — never by this one. Its `corpus_hash` case is the
value in `corpus/manifest.lock.yaml`, so the test is anchored to the real
pipeline rather than to a toy.

If the two implementations drift, every report's provenance becomes a number
that cannot be tied back to a corpus, which is the exact failure recording it
was meant to prevent.

**`metrics.py` gets unit tests for the same reason `lib/corpus/` does.**
[ADR-015](../docs/adr/015-testing-strategy.md) chooses the test layer by whether
the output is deterministic, not by where the code sits — and that axis does not
change at a language boundary. Every expected value in `tests/test_metrics.py`
is worked out by hand; a metric that agrees with itself proves nothing, and
these numbers become a permanent ADR.

## A modelling decision worth knowing

A ranked retrieval result is a sequence of **sets** of unit locators — position
*i* holds the units the *i*-th retrieved chunk covers — not a flat list.

Retrieval returns chunks; the gold set expects units; `chunk_units` is n:m by
design (ADR-002). For the Catechism the distinction is invisible, since
`numbered-paragraph@1` puts one unit in one chunk. For the Summa it is the whole
story: `scholastic-article@1` puts an entire article into one chunk, so one
result covers seven or more units. Flattening would inflate every score —
`full-recall@k` would be satisfied by a single chunk at rank 1 counted as seven
independent hits.

## Embed, then score

The bake-off runs **one candidate per invocation**, with a dedicated local ONNX
export directory. Both commands load that same artifact; neither downloads model
weights nor calls a hosted embedding API. The `export` extra supplies the ONNX
runtime tooling; `local-models` is needed to create/check exports, not to score.
The first dependency sync may download packages.

```bash
# Start the local stack and export DB_URL as described above.
# E5's measured pooling is mean; BGE-M3's is cls.
npm run eval:bakeoff -- intfloat/multilingual-e5-large \
  --artifact .preflight/intfloat_multilingual-e5-large/int8 --pooling mean
npm run eval -- intfloat/multilingual-e5-large \
  --artifact .preflight/intfloat_multilingual-e5-large/int8 --pooling mean

npm run eval:bakeoff -- BAAI/bge-m3 \
  --artifact .preflight/BAAI_bge-m3/int8 --pooling cls
npm run eval -- BAAI/bge-m3 \
  --artifact .preflight/BAAI_bge-m3/int8 --pooling cls \
  --compare eval/reports/baseline-e5-int8-2026-10-09.json
```

The example comparison uses the recorded E5 baseline. For a changed corpus or
gold set, replace it with the JSON report from the matching earlier run.
Repeat `--compare` to include more candidates. Reports are timestamped JSON and
Markdown in `eval/reports/`; a comparison also writes `.comparison.json`.
`--output` chooses another directory. Reports stay ignored until an operator
chooses a measured baseline to commit. No source text appears in them: retrieved
results are locator sets. The first example requires the corpus to have been
ingested; booting an empty Supabase stack does not populate it.

**Resume safely.** `--batch-size` bounds how many passage vectors are held before
a commit; ONNX inference is serial inside that group. Re-run after interruption
and already committed chunks are skipped. The database's `model` key includes
an identity derived from the artifact files, tokenizer, pooling, prefixes,
normalization, context limit and encoder version. Changing an export creates a
new space rather than overwriting old vectors. Keep export directories immutable
and dedicated to model files: adding a report there changes the identity too.
The encoder version must change whenever inference/preprocessing changes.

**Admission still matters.** Pooling must match the measured candidate
convention. Qwen3's existing quantized export is refused because its pre-flight
failed the fidelity control. It needs a separately verified non-int8 export
with `--pooling lasttoken`. A content hash identifies an export; it does not
certify quality or prove the original model revision. Read its pre-flight before
using any replacement artifact. Comparing E5 with BGE alone compares one
pretraining family, which the comparison summary calls out.

**Read the report honestly.** Recall and full recall at 5, 10 and 20, plus
MRR@10, are averaged over questions, split by language relationship and by
expected source. Source slices overlap for multi-source questions; they are not
parts to average. Passage truncation counts are token-based, include the prefix
and special tokens, and are recorded per source. Query truncation is recorded
per question. Scoring refuses unresolved expected locators and incomplete
candidate embeddings, and reads one repeatable database snapshot.

The confidence intervals use SciPy's percentile bootstrap, with a recorded seed
and resample count. Empty slices and singletons have no interval; constant
samples explicitly warn that resampling cannot reveal unseen variation. The
comparison pairs the same questions, names gains and losses in recall@10, and
reports an **exploratory total sample-size estimate** for the top two in each
slice. It uses the observed paired variance, 95% two-sided confidence and 80%
power. A tie or constant difference makes the estimate unidentifiable (`null`),
not zero. Selecting the top two on this same small authored set makes this a
planning aid, never a declaration of a winner or a stopping rule.

Latency covers query embedding plus SQL search, after model load, excluding
truncation diagnostics. Its p50/p95 are **not** end-to-end answer latency.
Generation model, prompt version, answer cost and cache rate are explicitly null:
this pass runs no generation. SciPy type stubs are locked in the dev group so the
statistical calls are checked in the same strict lane as the report code.


### Reading runtime warnings during a local run

The untruncated tokenizer pass is a **diagnostic**: it counts inputs that exceed
the candidate's window. Transformers may warn that token indices exceed the
model limit there. Actual ONNX inference separately sets `truncation=True` and
the declared maximum length; a diagnostic warning is not an inference failure.

The installed Transformers 4.57.6 also emits a Mistral-regex warning for the
local E5 and BGE-M3 XLM-RoBERTa tokenizers, and the Qwen3 fp32 tokenizer,
saved by that version. Its local version-detection
branch was inspected during the live run on 2026-10-09: it reaches the warning
for this non-Mistral model without applying a regex patch. Do not apply a
Mistral-specific tokenizer change to this export in response to that warning.
The nonstandard `model_quantized.onnx` filename produces another loader warning;
the runtime selects the sole ONNX graph. Neither warning changes the artifact's
content identity. An actual exception still stops the pass rather than being
recorded as a low retrieval score.


### First measured baseline

The [E5 int8 report](../eval/reports/baseline-e5-int8-2026-10-09.md) and its
[JSON contract](../eval/reports/baseline-e5-int8-2026-10-09.json) record the first
complete live pass on 2026-10-09. It was repeated with identical rankings and
metrics. Current interpretation and the next candidate run live in
[project status](../docs/guide/status.md). Compare against it only when corpus
and gold hashes match; a new corpus needs a new E5 report too.

The [BGE-M3 int8 report](../eval/reports/baseline-bge-m3-int8-2026-10-09.md),
[JSON contract](../eval/reports/baseline-bge-m3-int8-2026-10-09.json), and
[paired comparison](../eval/reports/baseline-bge-m3-int8-2026-10-09.comparison.json)
record the next dated measurement on exactly the same corpus and gold set.

### Measuring a higher-precision replacement

The default pre-flight remains int8. To measure an unquantized artifact:

```sh
TOKENIZERS_PARALLELISM=false npm run eval:preflight -- \
  Qwen/Qwen3-Embedding-0.6B --precision fp32
```

This retains `.preflight/Qwen_Qwen3-Embedding-0.6B/fp32` as the actual artifact
and writes `eval/reports/preflight-fp32.json`. Disposable int8 controls use
`fp32-control`, keeping the retained fp32 candidate safe. It preserves the int8 report and
artifact, including their failed fidelity evidence. The report's `precision`
field distinguishes the measurements. In fp32 mode, agreement is measured
directly against the original weights; there is no additional quantization
control. A complete local export is reused, but agreement and latency are
remeasured. Export success alone does not certify retrieval quality.

Use that same directory with `eval:bakeoff` and `eval`, with
`--pooling lasttoken`. Compare the resulting report against both recorded
baselines with two `--compare` arguments. The larger artifact and its measured
memory/load cost must be considered separately from retrieval quality. The
reference weights are checked on CPU, avoiding automatic accelerator selection
and its extra memory pressure. Process peak memory includes the reference
check and is not a measurement of a deployed ONNX worker alone.

### Native shutdown on the local macOS runtime

Several BGE-M3 scoring runs wrote complete, matching reports, then failed while
exiting (a native `recursive_mutex` error or a segmentation fault). Explicit
`gc.collect()` did not reliably fix it, so that attempted change was removed.
Local runs with tokenizer parallelism disabled were checked separately:

```sh
TOKENIZERS_PARALLELISM=false npm run eval -- BAAI/bge-m3 \
  --artifact .preflight/BAAI_bge-m3/int8 --pooling cls \
  --compare eval/reports/baseline-e5-int8-2026-10-09.json
```

The setting changes tokenizer scheduling, not tokenization, vectors or report
metrics. The exact native library responsible has not been isolated, and the
shutdown fault remains an operational limitation rather than a confirmed fix.
A report file alone is insufficient evidence of a successful process: check the
exit status as well as report consistency.

### Qwen3 fp32 evidence and long local runs

The [Qwen3 fp32 report](../eval/reports/baseline-qwen3-fp32-2026-10-10.md),
[JSON contract](../eval/reports/baseline-qwen3-fp32-2026-10-10.json),
[three-model comparison](../eval/reports/baseline-qwen3-fp32-2026-10-10.comparison.json)
and [explicit pairs](../eval/reports/baseline-qwen3-fp32-2026-10-10.pairwise.json)
record the dated measurement. Export fidelity and retrieval quality differ:
the faithful fp32 export scores 0/8 at recall@10 for this fixed configuration.

On macOS, system sleep pauses local computation. Display sleep alone need not.
To keep an operator-initiated run awake without changing persistent settings:

```sh
TOKENIZERS_PARALLELISM=false caffeinate -i npm run eval:bakeoff -- \
  Qwen/Qwen3-Embedding-0.6B \
  --artifact .preflight/Qwen_Qwen3-Embedding-0.6B/fp32 --pooling lasttoken
```

For an already-running process, `caffeinate -i -w <PID>` holds an idle-sleep
assertion until that process exits. Keep the lid open; manual/lid sleep can
still interrupt it. The display may turn off. Durable committed batches survive
process interruption; restarting the identical artifact resumes them. Temporary
sleep prevention releases automatically. Sleep and swapping confound elapsed
run duration, so do not report it as isolated model throughput.
