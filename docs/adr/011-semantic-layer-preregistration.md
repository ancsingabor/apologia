# ADR-011 — Pre-registration of the semantic-layer experiment

Status: **Accepted** · written Milestone 0, executed Phase 4

> **TL;DR**
> - **Decision:** The Phase 4 semantic layer (OWL/RDF) is pre-registered — three hypotheses, fixed metrics and thresholds, and a kill criterion — before any of it is built.
> - **Because:** A result judged against criteria chosen afterwards proves nothing, and expensive complexity tends to survive because it was expensive.
> - **Cost:** Thresholds set without data may be mis-sized, and exploration outside the three hypotheses is reported as exploratory only.

## Context

Phase 4 introduces a small RDF/OWL ontology over the domain — `Doctrine`,
`Argument`, `Objection`, `ScientificTheory`, `PhilosophicalPosition`,
`ChurchDocument` and relations between them — to test whether explicit,
symbolic knowledge improves on knowledge represented statistically as
embeddings.

This ADR is written **now, before any ontology code exists**, and that timing is
the entire point.

## Problem

The failure mode of this experiment is not building the ontology badly. It is
building it, demonstrating it on a handful of hand-picked questions, finding it
"clearly helpful", and shipping a graph diagram that was never actually tested.
Semantic layers are seductive: they look like architecture, they demo well, and
their benefit is easy to assert and hard to falsify.

The defence against that is to fix the hypothesis, the metric, and the decision
rule before the result is known — because afterwards, any outcome can be
rationalised into a success.

## Alternatives considered

1. **Build it, then evaluate.** The natural order, and the one that produces
   unfalsifiable results, because the evaluation gets designed around what was
   built.
2. **Skip the ontology.** Defensible on complexity grounds. Forgoes the most
   interesting question in the project.
3. **Pre-register, then build.** Fix hypotheses, metrics, decision rule and kill
   criterion in advance; run a clean ablation; publish the outcome either way.

## Decision

**Pre-register.** The claim is split into three hypotheses, because they are
measured differently and there is no reason to expect them to succeed or fail
together.

### H1 — Retrieval

*Graph traversal surfaces relevant units that vector similarity misses.*

Measured as the delta in `recall@10` and `full-recall@10` on the frozen gold set,
RAG-only versus RAG + graph expansion. Same generator, same prompt, same
questions; the retrieval step is the only variable.

**Success:** ≥5pp improvement in `full-recall@10`, without a `recall@10`
regression.

### H2 — Knowledge integrity

*The ontology prevents category errors that RAG alone commits.*

Measured on a purpose-built adversarial set (~20 questions) that invites
conflation of kinds — "does quantum mechanics prove God?", "is evolution a
materialist doctrine?", "is the Big Bang a creation account?". Each is scored for
the specific conflation, blind, by a rubric written before the runs.

**Success:** ≥30% relative reduction in category-error rate.

### H3 — Explainability

*The graph makes source selection auditable in a way embeddings cannot.*

Qualitative and honestly so: can a reader be shown *why* a source was selected,
in terms other than "cosine similarity was high"? No numeric threshold; a written
assessment against examples, with the reasoning published.

### Protocol

- The gold set and the adversarial set are **frozen before the ontology is
  built** and not inspected while building it.
- Exactly one variable changes between arms.
- Both arms run on the same corpus manifest hash, embedding model, generation
  model and prompt version.
- The result is published in `docs/` **whatever it shows**.

### Kill criterion

If H1 and H2 both fail, the semantic layer is **removed from the query path**,
not quietly retained because it was expensive to build. It may remain as a
documented experiment; it does not remain as unjustified complexity in the
serving path.

## Prediction, recorded in advance

**H1 fails. H2 succeeds. H3 partially succeeds.**

The reasoning: embeddings are already good at similarity, which is what graph
expansion mostly reproduces — so there is little headroom for H1. But embeddings
have no way to represent *"these are different kinds of claims."* That is a type
distinction, not a distance, and no amount of training makes a vector space
encode a categorical boundary that its training data blurs. It is precisely what
an ontology is for. H2 is where a symbolic layer should win, if it wins anywhere.

Recording the prediction is what makes the outcome informative. If H1 also
succeeds, the prediction was wrong in an interesting way. If H2 fails, that is a
genuine and publishable negative result about symbolic knowledge in RAG. Either
way the experiment says something, which is not true of an unregistered one.

## Consequences

- The adversarial set must be authored in Phase 3, before Phase 4 begins.
- The eval harness must support A/B arms on a fixed question set.
- The ontology stays deliberately small — tens of concepts. Scope is not the
  variable under test, and a large ontology would confound the comparison.
- A negative result is a deliverable, not a failure. It gets written up with the
  same care as a positive one.

## Trade-offs

**Pre-registered thresholds may prove badly calibrated.** 5pp and 30% are
judgements made without data. If they turn out to be wrong-sized, that is
recorded in the write-up rather than silently adjusted afterwards — an adjusted
threshold is no threshold.

*Note, 2026-09-21 (added, not revised):* one mis-sizing is already visible
without data. On a gold set of 40–60 questions, one question is worth 1.7–2.5pp
of `full-recall@10`, so ≥5pp means "two or three more questions pass" — and the
full-recall slice counts only multi-source questions, which makes each one worth
more. The threshold stands as registered. The write-up must also report the
per-question pass/fail changes behind it, which is how `docs/evaluation.md`'s
release rule is now written, so that a reader can see how few questions moved.

**It constrains exploration.** Real cost: the interesting finding may not be one
of the three hypotheses. Handled by reporting incidental findings separately and
labelling them as exploratory rather than folding them into the registered result.

**Publishing a negative result is uncomfortable** in a repository that doubles as
a portfolio. It is also the most credible thing the repository can contain.
