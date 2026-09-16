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
>   (`hashing.py`) and the corpus reader (`db.py`). Still to come:
>   `bakeoff.py`, `score.py`.
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
uv sync --all-groups --extra db
uv run pytest            # sub-second, no database and no network
uv run ruff check .
uv run mypy apologia_eval tests
```

`--extra db` is `psycopg`. It is not needed to run the tests — `db.py` imports
the driver lazily so the pure half stays importable without it — but `mypy`
needs it to typecheck the SQL layer instead of skipping it. The `local-models`
extra (torch) is separate and is only needed to actually run the bake-off.

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

Still to come: the embedding bake-off, the scorer, and the report writer.

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
