# ADR-003 — The repo ships manifests and a pipeline, not the corpus

Status: **Accepted** · Milestone 0

## Context

The repository is public. The corpus mixes material with very different legal
status:

| Material | Status |
|---|---|
| Summa Theologiae, patristics, Douay-Rheims / KJV, Károli 1908 | public domain |
| CCC, encyclicals, conciliar documents | published by the Holy See, freely readable, **not** licensed for arbitrary redistribution |
| Modern Hungarian Catholic Bibles (Szent István Társulat, Káldi-Neovulgáta) | under live copyright |
| Contemporary apologetics works | under live copyright, case by case |

## Problem

If the corpus text is committed, the repository cannot be published — or can be
published only after excluding exactly the sources that make it useful in
Hungarian. This is the constraint most likely to kill the project outright, and
it is a licensing question, not an engineering one.

## Alternatives considered

1. **Vendor the corpus.** One-step setup, fully reproducible. Legally
   impossible for a public repo covering this material.
2. **Vendor only the public-domain subset.** Publishable, but the useful
   Hungarian sources are precisely the excluded ones, so the demo corpus would
   misrepresent the system.
3. **Ship manifests and a fetch pipeline.** The repo describes each source and
   how to obtain it; `npm run ingest` fetches, hashes, and builds the index
   locally. No third-party text in git.

## Decision

**The repository ships the source manifest and the ingestion pipeline. It never
ships corpus text.**

Each manifest entry carries an explicit, resolved `license` field. There is no
`unknown`: a source whose status has not been established does not enter the
manifest.

## Reasoning

The obvious framing is that a legal constraint forces a worse design. It does
not — the resulting design is better on engineering grounds alone:

- **Reproducibility becomes explicit.** Content hashes in the manifest mean a
  given index can be traced to exact source revisions. A vendored blob makes
  provenance implicit and hence unverifiable.
- **The repository stays small and reviewable.** Corpus text would dwarf the
  code and make diffs useless.
- **Licence status becomes a required field rather than an afterthought.**
  Provenance and authority are core domain concerns here (ADR-010); forcing
  every source through a manifest that demands a resolved licence puts that
  question at the front of the process, where it belongs.

## Consequences

- Setup is two steps, not one: install, then ingest. The ingest is documented and
  scripted.
- CI cannot run the full pipeline against restricted sources. Ingestion tests run
  against a small public-domain fixture corpus committed for that purpose.
- Some readers will not be able to reproduce the full index. They can still read
  the pipeline, the manifest, and the evaluation reports — which is where the
  engineering content is.
- Manifest entries need a stable fetch location, and those rot. The hash
  detects drift rather than silently ingesting changed text.

## Trade-offs

**Reproducing published results is harder for outsiders.** A reader cannot verify
an eval number without assembling the corpus themselves. Mitigated by recording
the corpus manifest hash in every eval report, so at least the *claim* is
precise about what it was measured on.

**Fetch fragility is now our problem.** Sources move and reorganise. Accepted:
the alternative is a legal exposure that cannot be mitigated at all.

**A "just clone and run" experience is lost.** Real, and the cost is highest for
the portfolio goal. Partly recovered by the public-domain fixture corpus, which
gives a runnable end-to-end path with no licensing questions.

## Open question — 2026-09-10: an API embedding pass is not obviously "private"

Status of this question: **open**. It does not change the decision above; it
names a case the decision was not written about, before ADR-008 settles it by
accident.

The licensing posture rests on one sentence, restated in
`.claude/project.md` as non-negotiable #3:

> Embedding is not redistribution — that is what makes restricted magisterial
> sources usable.

That was written about **a private index**: text is fetched, vectorised, and the
vectors live in our own Postgres. Nothing leaves.

The ADR-008 bake-off may break that premise without anyone deciding to. A hosted
embedding provider is a candidate like any other, and measuring one means
transmitting the full text of every current chunk — 5,730 CCC units of
LEV-copyright material — to a third party, per candidate, per pass. Whatever
that is, it is not "nothing leaves."

The question is genuinely open, and both answers are arguable:

- **It is still not redistribution.** The provider is a processor, the
  transmission is transient, and it is no different in kind from any cloud
  service touching the text — including Supabase, which already stores all of
  it. On this reading the existing sentence covers it and only needs widening.
- **It is a distinct act.** ADR-003 accepted a legal exposure it could not
  mitigate and chose the posture that minimises it; sending the corpus to a
  provider whose retention and training terms we do not control is a new
  exposure that the original reasoning never weighed.

**What must not happen is that this gets decided by running the bake-off.** That
is the same failure ADR-008's deferral guards against, one layer down: an
architectural commitment made as a side effect of a measurement.

### It is not a question about one offline pass

The first draft of this note said the question had to be answered "before the
first API candidate runs", as though it governed an ingestion detail. It governs
more than that.

Dense retrieval is only meaningful **inside a single embedding space**. A query
vector and a chunk vector can be compared only if the same model produced both —
same weights, same version, same pooling. `chunk_embeddings` already encodes
this by keying on `(chunk_id, model)`. There is no arrangement in which the
corpus is embedded by one model and the user's question by another; the cosine
would be noise, and it would not error.

So the answer here does not merely permit or forbid an offline pass. **It decides
which models can ever serve a query.** Rule out transmitting the corpus to a
hosted provider and hosted models are excluded from production, not just from
ingestion — because a model that cannot embed the corpus cannot be the model that
embeds the question either.

The reverse asymmetry the query path *does* enjoy is worth stating, since it is
the part that genuinely carries no corpus-licensing weight: embedding a user's
own question sends the user's sentence, not ours. E5- and BGE-family models
distinguish the two with a `query:` / `passage:` **prefix on the same weights** —
an asymmetry of input, never of model.

### Why it is tractable rather than blocking

Local open-weights candidates raise the question not at all, so the experiment
can begin without an answer. And provider terms are a checkable fact —
zero-retention and no-training-on-inputs are offered by several — so the answer
is likely to be "permitted, under these terms, recorded in the manifest" rather
than a prohibition. It needs to be written down either way, because
[ADR-021](021-licence-belongs-to-the-transcription.md) established that this
project resolves licensing per artefact rather than by general impression.

Carried into [ADR-023](023-python-at-the-measurement-boundary.md), which
introduces the bake-off.
