# ADR-023 — Python at the measurement boundary

Status: **Accepted** · Milestone 1
Enables [ADR-008](README.md) (deferred: the embedding provider boundary) and
amends one consequence of [ADR-004](004-offline-ingestion-cli.md).

> **TL;DR**
> - **Decision:** Python is permitted only where the deliverable is a measurement or the model that produced it; everything else, and everything already working, stays TypeScript.
> - **Because:** Provenance of model exports and honest statistics (bootstrap intervals) — not capability, since TypeScript can run the candidate models.
> - **Cost:** A second toolchain, and a corpus-hash contract that must match byte-for-byte across two languages.

## Context

This repository is one language. The immediate prompt for reconsidering that is
not technical — it is a course requirement to work outside JavaScript — and
recording that honestly matters, because a decision made for an external reason
and then dressed in engineering rationale is the thing this directory exists to
prevent. The requirement is why the question was *asked*. It is not, on its own,
an answer.

What makes the question live is that the project has a measurement it cannot
currently take. **ADR-007 and ADR-008 are deferred and explicitly "decided by
measurement"**, and the architecture is arranged so they cannot be settled by
accident: `chunk_embeddings` is keyed `(chunk_id, model)`, its `embedding`
column is deliberately undimensioned and unindexed, and `scripts/ingest/main.ts`
omits an `embed` stage on purpose so that embedding is a separate pass run once
per candidate. Nothing in the repository embeds anything yet.

The measurement ADR-008 needs is a bake-off of candidate embedding models over
Hungarian queries against a mixed hu/en/la corpus, scored on the frozen gold set
in `eval/questions/`. The candidates that matter most in that setting are the
open multilingual models, whose native ecosystem is `sentence-transformers` and
PyTorch.

## Problem

Does a second language earn a place in this repository, and if so, where exactly
does the boundary fall?

The failure mode is not "Python is a bad choice". It is a repository that
acquires two toolchains, two CI lanes and two dependency surfaces in exchange
for a rewrite that demonstrates familiarity with a language while making the
system harder to run — which is, almost word for word, the reason ADR-004
rejected a queue.

## Alternatives considered

1. **Stay in TypeScript; run the candidates with `transformers.js`.**
   Community ONNX exports of the headline candidates exist
   (`Xenova/multilingual-e5-large`, `onnx-community/bge-m3-ONNX`), so this is
   genuinely possible, not a straw man.
2. **Port the ingestion pipeline to Python.** Maximum new-language surface:
   parsers, chunkers, the assertion machinery, `pytest`. ADR-004 specifies *an
   offline CLI*, not a TypeScript one, so nothing forbids it.
3. **Run the bake-off outside the repository** — a notebook, numbers copied into
   ADR-008 by hand. Zero permanent cost.
4. **Python only where the *measurement* is produced**, TypeScript everywhere
   else.

## Decision

**Four.** Python is introduced for the embedding bake-off and the evaluation
harness that scores it, plus the query-time embedding service those two produce.
Nothing that currently works in TypeScript is ported.

The boundary is stated as a rule rather than a file list, so it survives
contact with the next temptation:

> Python is permitted where the deliverable is **a measurement or the model that
> produced it**. Everything the request path touches, and everything already
> covered by the TypeScript unit suite, stays TypeScript.

## Reasoning

**The obvious argument is wrong, and it is worth writing down why.** The first
version of this decision claimed TypeScript could not run the candidate models
**locally** — in-process inference over open weights, as distinct from calling a
hosted embedding API, which is a `fetch` in any language and was never in
question. Checking that claim falsified it: `transformers.js` drives ONNX Runtime
in Node, and ONNX exports of both `multilingual-e5-large` and `bge-m3` are
published today. Local inference from TypeScript works. Any ADR resting on "it is
impossible" would have been resting on something untrue.

What TypeScript genuinely cannot do is **produce** such an export. That is
`optimum-cli`, and it is Python. But the gap is narrower than it sounds, because
for the two headline candidates somebody has already done it — so the honest
position is that TypeScript is blocked only on models nobody has exported yet.

**The argument that survives is about provenance, not capability.** Those ONNX
files are third-party conversions, frequently quantized, and versioned by
whoever uploaded them. `docs/evaluation.md` requires every report to record the
embedding model that produced it, precisely so a number can be traced back to
the system that produced it. A report saying `multilingual-e5-large` when what
ran was somebody's int8 export of it is not traceable — and the gap would be
invisible, because the number would look entirely reasonable. This repository
has a standing position on that shape of problem, from ADR-020:

> An assertion that cannot fail for the right reason is worse than an absent
> one, because the report says "checked".

A measurement whose subject is not exactly what the report names is the same
defect wearing different clothes.

**Producing a trustworthy export is itself Python.** The conversion tool is
`optimum-cli export onnx`. So "stay in TypeScript" does not remove Python from
the project; it removes Python from the *repository* while keeping it in the
process, undocumented and unversioned, which is worse than either honest option.

**The second half is statistics, and there the gap is real.** The gold set is
ten questions. A `recall@10` reported off n=10 without an interval is exactly
the "confident, meaningless numbers" `eval/README.md` already warns against, and
it would be the basis of a permanent ADR. Bootstrap confidence intervals are one
`scipy.stats.bootstrap` call; the equivalent in TypeScript is hand-rolled and
unreviewed. Comparison figures, per-slice aggregation and the same-language /
cross-lingual split are `pandas` one-liners.

**Alternative 1 rejected** on provenance, above — not on capability.

**Alternative 2 rejected** because `lib/corpus/` is 234 unit-test cases over
~1,550 lines of pure functions, and that suite is not decoration: it is what
caught the §146/147/148 misnumbering (ADR-019) and the unordered-paging false
positive in `siblings.ts`. A port trades a tested implementation for an untested
one and buys a language exercise. ADR-004's own reasoning applies unchanged —
"harder to run and understand" is the cost, and there is no corresponding
benefit, because the ingestion pipeline is not where the missing measurement is.

**Alternative 3 rejected** by the release rule. `docs/evaluation.md` makes an
eval report diff a merge gate on any retrieval, chunking, embedding or prompt
change. A harness that lives in a notebook on one person's machine cannot gate
anything, cannot be re-run against a later corpus hash, and produces exactly the
artefact the rule exists to prevent: a number that was screenshotted once.

**On the query-time service.** ADR-004's consequences state that the embedding
API key is "needed only by an operator running the CLI, never by the deployed
application." That is an error, and this ADR corrects it: the query path in
`docs/architecture.md` retrieves by pgvector cosine over the *user's question*,
which must therefore be embedded at request time. The deployed application needs
embedding capability, and the security win ADR-004 claimed is smaller than
written — the service-role key remains operator-only, the embedding key does not.

Given that the app must embed queries anyway, the service doing it should be the
same implementation the bake-off measured. Reimplementing query embedding in
TypeScript would mean the thing measured and the thing shipped are two code
paths, and the release rule would be gating on a number that does not describe
production.

**And there is no escape hatch, because retrieval is confined to one embedding
space.** A query vector and a chunk vector are comparable only if the same model
produced both — same weights, same version, same pooling. `chunk_embeddings` is
keyed `(chunk_id, model)` for exactly this reason: the model is part of a
vector's identity. So "embed the corpus with an open model offline, call a hosted
API at request time" is not an available design. The cosine would be noise, and
nothing would raise an error.

The only asymmetry that exists is a **prefix on the same weights** — E5 and BGE
expect `query:` versus `passage:` — which the bake-off must apply correctly,
since omitting it degrades recall silently. It is not a second model.

The consequence for this ADR is direct: if an open-weights model wins, production
*must* run those weights at request time, and that is the Python service. The
query side is cheap — one forward pass over a single short question, against
9,183 chunks offline — which is what makes an ONNX export in a function viable.

## Consequences

- A second toolchain: `uv`, `ruff`, `mypy`, `pytest`, pinned to Python 3.12 to
  match the Vercel runtime default.
- A second CI lane, gating only the deterministic half — metric functions,
  gold-set parsing, corpus-hash reproduction. The bake-off and the eval run are
  operator-initiated and stay out of CI, by ADR-004's reasoning applied to the
  same shape of job.
- **A serialisation contract appears.** `eval/questions/*.yaml` and the eval
  report schema are now read by two languages, and `corpusHash`
  (`lib/corpus/hash.ts`) must be reproduced byte-for-byte in Python. That
  reproduction is pinned by a test; without it the provenance field this whole
  ADR argues for would silently drift.
- The deployed function acquires a bundle-size constraint TypeScript did not
  have. Torch and `sentence-transformers` exceed the standard 500 MB Python
  bundle limit, so the deployed service ships an ONNX export or a thin
  authenticated proxy — never the harness's dependency set.
- `ADR-004`'s consequence about the embedding key is superseded by the paragraph
  above.
- **A licensing question is now on the critical path, and it is not ours to
  settle by running code.** [ADR-003](003-ship-manifests-not-corpus.md) § *Open
  question — 2026-09-10* records that "embedding is not redistribution" was
  written about a private index, not about transmitting the corpus to a hosted
  provider. Local open-weights candidates raise it not at all, so the bake-off
  starts with those; it must be answered before the first API candidate runs.
- **The corpus itself constrains the slate.** Measured 2026-09-10: ~80% of Summa
  chunks exceed 2,048 characters, against ~0% of CCC chunks, because
  `scholastic-article@1` chunks a whole article. A 512-token model therefore
  truncates most of the Summa and none of the Catechism, so ranking it against
  an 8k-token model would largely measure window size. Max sequence length and a
  per-candidate truncation count are recorded in the report as provenance, and
  the report slices by source. This is ADR-020's rule applied to a comparison
  rather than an assertion, and it is language-independent — the same trap
  exists in TypeScript.

## Trade-offs

**The contributor barrier doubles.** A reader who could previously run
everything with `npm install` now needs `uv` as well. Mitigated by keeping one
entry point — `npm run eval` shells out — but the mitigation is cosmetic and
should not be described as more than that.

**The measurement boundary is a judgement, not a lookup.** "Where the deliverable
is a measurement" will be arguable at the edges; `scripts/eval-lint.ts` is
already a case, since it reads the same gold set and the same `units` table from
TypeScript. It stays where it is. If the duplication becomes real rather than
theoretical, that is a later decision with evidence behind it.

**Three outcomes are possible, and only two were originally written down.**
Recorded in advance, before the result is known, so the outcome can be read
against the prediction rather than the prediction quietly rewritten:

| | outcome | effect on this ADR |
|---|---|---|
| 1 | An open-weights model wins | The service runs it. Fully justified. |
| 2 | A hosted API wins, and the [ADR-003](003-ship-manifests-not-corpus.md) question permits it | The service collapses to a thin proxy TypeScript could have written; half this ADR's justification for the query-time service evaporates. |
| 3 | A hosted API wins, but the licence question forbids it | The best *usable* model is local, the service is justified — **for the wrong reason**. |
| 4 | An open-weights model wins **and cannot be served** | Added 2026-09-15. There is no service, so there is no query path with that model at all — see below. |

**Outcome 3 is the one to guard against, precisely because it flatters this
ADR.** If the corpus cannot be sent to a provider, the slate collapses to local
by *constraint*, and a reader would see "local won" where in truth a licence
decided and the measurement never got to. It requires only that a hosted model
be good and the licence question resolve conservatively — both plausible.

Should it happen, ADR-008 must say so in terms: *"X scored highest; Y is chosen
because X is not licensable for this corpus."* Recording it as a measurement
result would be the same class of error as counting `pending` as a pass — a
number presented as evidence for something it never tested.

The offline half is unaffected in all three cases: running the open candidates is
what would have *produced* the finding.

### Outcome 4, added 2026-09-15: the row this table did not have

The table above was written claiming three outcomes, having originally had two.
It had three because outcome 1 was stated as a single happy case — *"an
open-weights model wins → the service runs it"* — and that hides an assumption:
**that the winner can be served at all.**

It can fail. Retrieval is confined to one embedding space (above), so the model
that embedded the corpus must also embed the user's question. A candidate that
scores highest offline and has no serving route has therefore not produced a
cheap option with a caveat; it has produced **no query path**. And the cost of
discovering that late is asymmetric: the offline pass is hours of compute per
candidate, and it is spent before anyone finds out.

So servability is established **before** a candidate competes, not after, and it
is measured rather than assumed — `harness/apologia_eval/preflight.py`. Two
facts decide it:

1. **Does the model export, and how large is the artifact?** What ships is an
   exported artifact, never the harness environment.
2. **Does the export agree with the original?** This is this ADR's own
   provenance argument, turned on our own export rather than a stranger's. It
   rejected third-party ONNX files because "a report saying
   `multilingual-e5-large` when what ran was somebody's int8 export is not
   traceable" — and scoring the corpus with PyTorch weights while serving
   queries from a quantized export is the *same* defect, committed deliberately.
   If int8 is what ships, int8 is what must be measured.

`Serving` in `candidates.py` makes the outcome representable: `bundled-onnx`,
`proxied`, `hosted-api`, or `none`. `assert_servable` refuses `none`, so a model
that cannot answer a query cannot win a retrieval bake-off.

**One asymmetry worth stating, because it is easy to miss.** A *proxied* route —
open weights running on a host we call — does **not** raise
[ADR-003](003-ship-manifests-not-corpus.md) § *Open question*. That question is
about transmitting the **corpus**; the corpus is embedded offline and never
leaves. What a proxied query transmits is the user's own sentence, which ADR-003
already sets apart: "embedding a user's own question sends the user's sentence,
not ours." So outcome 4 has an escape hatch that outcome 3 does not, and the two
must not be collapsed into "it's a hosted call either way."

### A restated figure: the bundle-size limit

§ *Consequences* above says torch and `sentence-transformers` "exceed the
standard 500 MB Python bundle limit". **That figure is out of date** — the
platform's limit is now substantially larger (current guidance says 5 GB on
Fluid Compute). Recorded rather than silently edited, because the ADR's
reasoning was partly *built* on the tighter number.

What survives unchanged: the deployed function still must not pull the harness's
dependency set, and what ships is still an exported artifact. What changes is
that no candidate on the current slate is excluded on size alone — the binding
constraint is function **memory** on a cold start, which is why the pre-flight
measures load time and artifact size rather than asserting a limit.

**Ten questions is a thin basis for a permanent decision.** Confidence intervals
make the thinness visible rather than fixing it. Expanding the gold set toward
the 40–60 that `docs/evaluation.md` specifies matters more to ADR-008's quality
than the language its harness is written in.
