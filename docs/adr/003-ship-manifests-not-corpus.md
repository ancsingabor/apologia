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
