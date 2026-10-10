# Reading a retrieval report

> **TL;DR**
> - We measure whether search finds the evidence needed for a question, before generating an answer.
> - Expected references are written by humans before the run. The model sees the question, not that list.
> - A retrieved chunk contains citable units; scores check those units at fixed rank cutoffs.
> - Bootstrap reuses recorded scores. It samples questions with replacement, never reruns the model.
> - A citation can be mechanically valid and still fail to support a claim. Human review remains necessary.

## What did we compare?

An embedding model turns a text into a numerical vector representing its
meaning. We embed each corpus chunk, then embed a question with the same model
and artifact. Cosine similarity ranks the chunks for that question. The top
chunks would supply context for a later answer generator; this evaluation does
not generate answers.

INT8 and FP32 describe numerical precision. Quantization stores and computes
parts of a model at lower precision, reducing its size but potentially changing
its output. The dated reports compare three configurations, not precision alone:
E5-large INT8, BGE-M3 INT8, and Qwen3-0.6B FP32. Model architecture, fine-tuning
and context windows also differ. Their results cannot identify which difference
caused a gain or loss.

## What makes a reference expected?

The **gold set** is our handwritten reference for evaluation. For each question,
we choose source units that retrieval should find and record their locators in
`eval/questions/`. Those choices require domain judgment and review. They are
not an exhaustive list of every passage that could help answer the question.

For example, [q-0006](../../eval/questions/q-0006.yaml) asks:

> Az ősrobbanás bizonyítja-e, hogy a világot teremtették?

Its expected units are `ccc:284` and `ccc:338`. The first distinguishes the
physical explanation of origins from the question of their meaning; the second
supplies the Church's teaching about creation. The note asks for a careful
answer that does not turn cosmology into a theological proof.

We **do not send these expected locators to the embedding model**. It receives
the question alone. After retrieval, our scorer compares the returned units
with the separately recorded expectations. The gold set is the correctness
reference; a model's **baseline** is its measured result against that reference.

## Units, chunks and the table columns

A **unit** is a citable source passage with a canonical address, such as
`ccc:284` or `summa:I.q2.a3.co`. A **chunk** is text prepared for retrieval.
The CCC uses one paragraph per chunk; Summa chunks group role-bearing units
from an article, with long articles split. We retrieve chunks and inspect their
unit mappings. The rank cutoff counts chunks, not individual units.

In this project's convention:

| Metric | Question it answers |
|---|---|
| `recall@10` | Does at least one expected unit occur in the first ten chunks? |
| `full-recall@10` | Do all expected units occur across those ten chunks? |
| `MRR@10` | How early is the first chunk containing an expected unit? |

Each question contributes 0 or 1 to the first two metrics. Their reported means
are proportions of scored questions. Our `recall@k` is a binary hit measure;
it does not calculate the fraction of expected units recovered per question.

In the [dated E5 report](../../eval/reports/baseline-e5-int8-2026-10-09.md),
q-0006 retrieves `ccc:338` at rank 1 and `ccc:284` at rank 9. It scores 1 on
both recall@10 and full-recall@10. Its reciprocal rank is 1 because the first
hit is first; a first hit at rank 4 would contribute 1/4.

The E5 row `4/8 | 1/8 | 2/4 | 2/4` means a hit for four questions overall,
all expectations found for one question, and two hits in each language group.
The two groups partition the eight questions: their successes add up to four.
Their rates happen to equal the overall rate here; they need not. Language
groups follow the gold set's `cross_lingual` label, not a new classification
inferred from the retrieved texts. Source diagnostics overlap when a question
expects units from several sources, so those cannot be added in the same way.

## Paired differences and bootstrap

Pairing compares **the same question** across two models. At recall@10, a
question contributes +1 if only the first model succeeds, −1 if only the second
succeeds, and 0 if both succeed or both fail. Averaging these values gives the
difference in success rates. The direction matters: BGE-M3 minus E5 is the
negative of E5 minus BGE-M3.

Bootstrap explores sensitivity to the questions in the sample. Suppose four
recorded paired differences are `[1, 1, 0, 0]`, averaging 0.50. Draw four entries
**with replacement**: an entry can occur several times or be omitted. A sample
`[1, 1, 1, 0]` averages 0.75; `[1, 0, 0, 0]` averages 0.25. Order does not matter.
The original question set and each question's recorded scores stay fixed.

The harness repeats this sampling 9,999 times with a recorded random seed.
The 95% percentile interval keeps the middle 95% of the resulting means.
**No model inference is rerun.** Repeating inference checks reproducibility;
bootstrap resamples recorded results to explore uncertainty. In a comparison,
both models' scores for each selected question stay together.

An interval spanning zero does not clearly separate the models on this
evidence. A constant sample can yield `[0, 0]`; it cannot reveal outcomes absent
from the original set. Neither interval guarantees future performance: these
questions are few and deliberately authored, not a random population sample.

The **exploratory total n** estimates the total number of questions that might
separate the observed effect under a normal approximation. It is not an
additional-question count, minimum guarantee or stopping rule. A zero observed
effect or variance gives no identifiable estimate. Selecting the top two from
the same data adds another reason to treat the estimate as planning advice.

## Where human judgment remains

Finding expected units establishes a retrieval hit, not a correct answer.
The later citation gate checks that references exist, came from supplied context
and that quotations match stored text. It cannot determine whether an argument
interprets those passages correctly. A human reviews source support and the
answer's reasoning before publication, and also reviews the gold expectations.

## Where this lives in code

- [metrics.py](../../harness/apologia_eval/metrics.py): unit hits and rank cutoffs.
- [score.py](../../harness/apologia_eval/score.py): reports, resampling and paired differences.
- [verify.ts](../../lib/citation/verify.ts): the separate mechanical citation gate.

## Go deeper

- [Measurement chapter](07-measurement.md): the system and its measurement contract.
- [Python walkthrough](python/walkthrough.md#scorepy-a-report-that-says-what-its-numbers-can-support): implementation and exercises.
- [Three-model report](../../eval/reports/baseline-qwen3-fp32-2026-10-10.md): all pairwise results and limitations.
- [Status](status.md): the current decision, next step and blockers.

## Check yourself

1. Does a model receive our expected-unit list? What is a baseline?
2. Are questions asked again during bootstrap? Can a draw omit a question?
3. Does full recall prove that a generated answer correctly uses its citations?

<details>
<summary>Answers</summary>

1. No. The expected list is used afterward by the scorer. A baseline is a
   model's measured result against that handwritten reference.
2. No inference runs again. Sampling with replacement reuses recorded scores;
   it can repeat or omit a question while keeping the sample size fixed.
3. No. Full recall finds all expected evidence. Mechanical citation checks and
   human review of the generated argument are separate steps.

</details>
