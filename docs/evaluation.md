# Evaluation

> Written in Milestone 0: the metric definitions, the gold set format and the
> release rule were fixed here before any retrieval code existed, and that order
> is part of the argument. Thresholds are deliberately absent; see below. Where
> the harness stands today: [guide/status.md](guide/status.md).

> **TL;DR**
> - The **gold set comes before the retriever** and is frozen in git, so the
>   benchmark cannot be fitted to the system it judges.
> - **No target numbers in advance.** Metric definitions, the gold set and the
>   release rule are fixed; the first baseline becomes the number to beat.
> - Retrieval: `recall@k`, `full-recall@k`, `MRR@10`, **split into
>   same-language and cross-lingual slices**. Generation: citation validity and
>   quote fidelity must read 100%, and authority correctness is the domain
>   metric.
> - **Release rule:** a retrieval, chunking, embedding or prompt change attaches
>   an eval diff. More than 2pp off `recall@10`, or any drop in citation validity
>   or quote fidelity, blocks the merge.
> - Every report records corpus hash, models and prompt version, because a
>   number without provenance is not evidence.

## Why this file exists before the retriever does

If the gold set is written after the retriever, it gets written — unconsciously —
to the questions the retriever already handles. Every later claim ("hybrid search
improved recall") then rests on a benchmark that was fitted to the system it is
meant to judge. So the questions come first, and they are frozen in git.

## On the absence of target numbers

A reasonable instinct is to write down success criteria like *"recall@10 ≥ 0.8"*
before starting. That number would be invented. Nobody knows what recall@10 a
Hungarian-query-over-mixed-corpus retriever gets on this corpus, because nobody
has built one. A pre-baseline threshold is either cleared trivially — and teaches
nothing — or missed and quietly lowered.

What genuinely must be fixed in advance is the part that *can* be corrupted by
hindsight:

1. **The metric definitions** — below.
2. **The gold set** — `eval/questions/*.yaml`, written before tuning.
3. **The release rule** — below.

The thresholds come from the first baseline run and are then committed as the
number to beat. That is the difference between a benchmark and a target.

## Gold set

Format, one file per question, in `eval/questions/`:

```yaml
id: q-0007
question: "Mit tanít a Katolikus Egyház az evolúcióról?"
language: hu
category: doctrine          # doctrine | philosophy | history | science | adversarial | out-of-scope
expected_units:             # the units a correct answer must draw on
  - ccc:283
  - ccc:284
  - humani-generis:36
expects_refusal: false
notes: >
  Tests the science/faith boundary. A correct answer distinguishes the Church's
  position on evolution as a biological account from materialist metaphysics.
```

**Size:** 40–60 questions. Big enough to move a percentage point meaningfully,
small enough that one person can author them honestly. v0 is 10.

**Composition matters as much as size.** The set must include, deliberately:

- questions whose answer spans **more than one source**, so `full-recall` has meaning;
- **Hungarian questions whose best source is English**, which is the cross-lingual case;
- **adversarial** questions probing the category errors this domain invites
  ("does quantum mechanics prove God?", "is evolution a materialist doctrine?");
- **out-of-scope** questions that must be refused (pastoral, personal, medical);
- **in-scope questions that look out-of-scope**, to catch over-refusal.

## Metrics

### Retrieval

| Metric | Definition |
|---|---|
| `recall@k` | ≥1 expected unit appears in the top *k*. k ∈ {5, 10, 20} |
| `full-recall@k` | *all* expected units appear in the top *k*. Harsher; the one that matters for multi-source questions |
| `MRR@10` | reciprocal rank of the first expected unit |

All three are reported **split by same-language and cross-lingual**, because the
mixed-corpus decision (ADR-007) means an aggregate number would hide the case
most likely to be weak.

### Generation

| Metric | Definition | Kind |
|---|---|---|
| **`citation validity`** | % of citations that resolve to a real unit **and** were present in the supplied context | deterministic |
| **`quote fidelity`** | % of quoted spans matching their source unit's text exactly | deterministic |
| `groundedness` | % of claim-bearing sentences carrying ≥1 citation | deterministic parse |
| `citation support` | % of cited units whose text actually supports the sentence | judge model + human spot-check |
| **`authority correctness`** | % of answers where a magisterial claim ("the Church teaches…") is backed by a tier-1/2 source | judge model + human spot-check |
| `refusal correctness` | on out-of-scope/adversarial: % correctly refused. **On in-scope: % *not* wrongly refused** | deterministic |

Two of these deserve emphasis:

**`citation validity` is the flagship, and it is not a tuning dial.** It is
deterministic and it should read 100%. Any value below that is a *bug* in the
verification gate, not a quality score to be improved incrementally. It is
tracked as a metric only so that a regression is visible.

**`authority correctness` is the domain-specific one**, and the most interesting
thing in the harness. Groundedness is not orthodoxy: an answer can be perfectly
grounded, perfectly cited, and still misrepresent the Church by presenting a
theologian's opinion as binding teaching. This is the metric that catches it.

**`quote fidelity` enforces ADR-014 mechanically.** Like citation validity it is
exact string comparison and should read 100%. It is what stops the model from
quietly rendering an English passage into Hungarian inside quotation marks — a
fabricated quotation that every other metric would score as well-grounded.

**Over-refusal is measured explicitly.** Eval sets routinely score "did it refuse
the bad question?" and forget "did it wrongly refuse the good one?" — producing a
system that scores well by refusing everything.

### Operational

p50 / p95 end-to-end latency, cost per answer, cache hit rate.

## Release rule

> Any change to retrieval, chunking, embeddings, or the prompt must attach an
> eval report diff to its PR.
>
> A regression of **>2pp in `recall@10`**, or **any** drop in
> `citation validity` or `quote fidelity`, blocks the merge.

This is what converts the harness from a demo into a gate. Without it, the eval
becomes a thing that gets run once, screenshotted, and never looked at again.

## Report format

`npm run eval` writes `eval/reports/<timestamp>.json` plus a human-readable
summary. Each report records the corpus manifest hash, the embedding model, the
generation model, and the prompt version — so a number can always be traced back
to the exact system that produced it. A metric without that provenance is not
reproducible and therefore not evidence.

## Related

The Phase 4 semantic-layer experiment reuses this harness and adds a
pre-registered protocol of its own — see
[ADR-011](adr/011-semantic-layer-preregistration.md). It is written before that
layer is built, for exactly the reason this file is written before the retriever.
