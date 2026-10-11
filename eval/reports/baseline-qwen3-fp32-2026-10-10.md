# Qwen3 fp32 and the three-model comparison — 2026-10-10

All three configurations embedded the same 9,183 local chunks and answered the
same eight retrieval-scorable gold questions. Questions q-0007 and q-0009 have
no expected retrieval units and are excluded. No answer generation occurred.

| Configuration | recall@10 | full-recall@10 | Same-language recall@10 | Cross-lingual recall@10 |
|---|---|---|---|---|
| E5-large int8 | 4/8 | 1/8 | 2/4 | 2/4 |
| BGE-M3 int8 | 5/8 | 2/8 | 2/4 | 3/4 |
| Qwen3-0.6B fp32 | 0/8 | 0/8 | 0/4 | 0/4 |

Qwen3 finds expected references for q-0005 and q-0010 only when the cutoff is
expanded to 20. Overall recall@20 is 2/8; full-recall@20 is 1/8. Its source
recall@10 is 0/6 for CCC and 0/3 for Summa. These source slices overlap and
keep retrieval against the mixed corpus. No passages or scored queries were
truncated. Zero truncation does not guarantee useful retrieval.

The constant Qwen3 recall@10 sample yields a bootstrap interval [0, 0]. That
cannot reveal variation absent from these eight authored questions and is not
a claim that Qwen3 will always fail. Its verified fp32 export still retrieves
poorly with this fixed instruction and corpus; export fidelity and retrieval
quality are separate measurements.

## Paired differences

Each row names its subtraction direction, at recall@10. The first six rows
compare **the named baseline minus Qwen3**; the last three compare BGE-M3
minus E5. No Qwen3 gain appears at this cutoff.

| Pair / slice | Difference | 95% bootstrap interval | Exploratory total n |
|---|---|---|---|
| E5 minus Qwen3 / all | +0.50 | [0.125, 0.875] | 9 |
| E5 minus Qwen3 / same-language | +0.50 | [0.00, 1.00] | 11 |
| E5 minus Qwen3 / cross-lingual | +0.50 | [0.00, 1.00] | 11 |
| BGE-M3 minus Qwen3 / all | +0.625 | [0.25, 0.875] | 6 |
| BGE-M3 minus Qwen3 / same-language | +0.50 | [0.00, 1.00] | 11 |
| BGE-M3 minus Qwen3 / cross-lingual | +0.75 | [0.25, 1.00] | 4 |
| BGE-M3 minus E5 / all | +0.125 | [-0.25, 0.50] | 207 |
| BGE-M3 minus E5 / same-language | 0.00 | [-0.75, 0.75] | Unidentifiable |
| BGE-M3 minus E5 / cross-lingual | +0.25 | [0.00, 0.75] | 32 |

E5 gains q-0003, q-0006, q-0008 and q-0010. BGE-M3 gains q-0002,
q-0003, q-0004, q-0006 and q-0010. The estimates use a paired normal
approximation at 95% confidence and 80% power. They are total-question planning
estimates from tiny post-selection samples, not additional-question counts,
stopping rules or guarantees.

The three-model comparison JSON selects the top two configurations **per slice**:
E5 and BGE-M3. BGE-M3 minus E5 is +0.125 [-0.25, 0.50] overall, 0.00
[-0.75, 0.75] same-language, and +0.25 [0.00, 0.75] cross-lingual.
The corresponding total-n estimates are 207, unidentifiable, and 32.
It does not establish a winner between them. The slate spans two pretraining
families, but precision, context windows, architecture and fine-tuning also vary;
this comparison cannot isolate a causal pretraining-family effect.

## Runtime and verification

- Both complete scoring processes exited successfully. Ranked locator sets,
  metrics, intervals, token counts and comparison JSON reproduced exactly;
  timestamps and latency observations naturally differed.
- Corpus and gold hashes match both earlier baselines. Every stored E5 and
  BGE-M3 vector checksum remained unchanged.
- The Qwen3 encoder was deliberately restarted after 6,928 committed chunks
  while substantial swapped memory had accumulated. All 6,928 saved vector
  checksums survived unchanged; a complete rerun skipped all 9,183 chunks and
  wrote no additional batches.
- Independent tokenizer lengths agree with zero reported passage truncation.
- A targeted check of q-0001 and q-0004, plus two expected-reference CCC
  chunks, compared the ONNX encoder with original CPU weights. All four cosine
  agreements round to 1.000000. Stored versus recomputed passage vectors differ
  by at most 8.36e-9 per coordinate, consistent with database float storage.
  This spot check supports fidelity for those inputs; it is not a full-corpus
  comparison against original weights.
- The fixed query instruction, last-token pooling and unprefixed documents were
  retained. The query format and pooling were checked against the
  [official model card](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B).
  No instruction was tuned after seeing the scores.
- The fp32 artifact is 2,400,256,077 bytes. Its earlier local pre-flight measured
  17.9 s cold load and 113 ms warm probe embedding. The reference check's process
  peak is not a deployed-worker memory measurement. See the
  [pre-flight evidence](preflight-qwen3-fp32-2026-10-09.md).
- macOS power logs confirmed repeated system sleep interruptions. Temporary
  `caffeinate -i -w <PID>` prevented idle sleep for the remaining encoder run
  and released automatically when it exited. Wall-clock encoding duration is
  confounded by sleep, swapping and restart; it is not a throughput benchmark.
- Corpus text stayed local. Reports store locators, never source text. Generation,
  citation-gate execution, production serving and answer latency were not tested.

---

# Retrieval evaluation

Model: `Qwen/Qwen3-Embedding-0.6B@onnx:8c4f59b70600c4a61b8e2c793f51601f4dbb866072ce70cc4be862454ba84475`
Corpus: `42a33a159bfef11abeeec05ecdbdf942ebdbf89c0bde79148f6a5fe826f09597`
Gold set: `32b4d4565e2426dcb816c58281f174ce845a630211b1ed05b06fa863a6c802c6`

95% percentile bootstrap; questions are resampled, not chunks.
The authored set is small. Constant samples hide unobserved variation.
Generation, cost per answer and end-to-end latency are not measured.

Excluded: q-0007, q-0009

| Slice | Metric | n | Mean | 95% interval | Status |
|---|---|---|---|---|---|
| all | recall@5 | 8 | 0.0 | 0.0, 0.0 | constant: bootstrap cannot reveal unobserved variation |
| all | recall@10 | 8 | 0.0 | 0.0, 0.0 | constant: bootstrap cannot reveal unobserved variation |
| all | recall@20 | 8 | 0.25 | 0.0, 0.625 | percentile-bootstrap |
| all | full-recall@5 | 8 | 0.0 | 0.0, 0.0 | constant: bootstrap cannot reveal unobserved variation |
| all | full-recall@10 | 8 | 0.0 | 0.0, 0.0 | constant: bootstrap cannot reveal unobserved variation |
| all | full-recall@20 | 8 | 0.125 | 0.0, 0.375 | percentile-bootstrap |
| all | MRR@10 | 8 | 0.0 | 0.0, 0.0 | constant: bootstrap cannot reveal unobserved variation |
| same-language | recall@5 | 4 | 0.0 | 0.0, 0.0 | constant: bootstrap cannot reveal unobserved variation |
| same-language | recall@10 | 4 | 0.0 | 0.0, 0.0 | constant: bootstrap cannot reveal unobserved variation |
| same-language | recall@20 | 4 | 0.5 | 0.0, 1.0 | percentile-bootstrap |
| same-language | full-recall@5 | 4 | 0.0 | 0.0, 0.0 | constant: bootstrap cannot reveal unobserved variation |
| same-language | full-recall@10 | 4 | 0.0 | 0.0, 0.0 | constant: bootstrap cannot reveal unobserved variation |
| same-language | full-recall@20 | 4 | 0.25 | 0.0, 0.75 | percentile-bootstrap |
| same-language | MRR@10 | 4 | 0.0 | 0.0, 0.0 | constant: bootstrap cannot reveal unobserved variation |
| cross-lingual | recall@5 | 4 | 0.0 | 0.0, 0.0 | constant: bootstrap cannot reveal unobserved variation |
| cross-lingual | recall@10 | 4 | 0.0 | 0.0, 0.0 | constant: bootstrap cannot reveal unobserved variation |
| cross-lingual | recall@20 | 4 | 0.0 | 0.0, 0.0 | constant: bootstrap cannot reveal unobserved variation |
| cross-lingual | full-recall@5 | 4 | 0.0 | 0.0, 0.0 | constant: bootstrap cannot reveal unobserved variation |
| cross-lingual | full-recall@10 | 4 | 0.0 | 0.0, 0.0 | constant: bootstrap cannot reveal unobserved variation |
| cross-lingual | full-recall@20 | 4 | 0.0 | 0.0, 0.0 | constant: bootstrap cannot reveal unobserved variation |
| cross-lingual | MRR@10 | 4 | 0.0 | 0.0, 0.0 | constant: bootstrap cannot reveal unobserved variation |
| source:ccc | recall@5 | 6 | 0.0 | 0.0, 0.0 | constant: bootstrap cannot reveal unobserved variation |
| source:ccc | recall@10 | 6 | 0.0 | 0.0, 0.0 | constant: bootstrap cannot reveal unobserved variation |
| source:ccc | recall@20 | 6 | 0.16666666666666666 | 0.0, 0.5 | percentile-bootstrap |
| source:ccc | full-recall@5 | 6 | 0.0 | 0.0, 0.0 | constant: bootstrap cannot reveal unobserved variation |
| source:ccc | full-recall@10 | 6 | 0.0 | 0.0, 0.0 | constant: bootstrap cannot reveal unobserved variation |
| source:ccc | full-recall@20 | 6 | 0.0 | 0.0, 0.0 | constant: bootstrap cannot reveal unobserved variation |
| source:ccc | MRR@10 | 6 | 0.0 | 0.0, 0.0 | constant: bootstrap cannot reveal unobserved variation |
| source:summa | recall@5 | 3 | 0.0 | 0.0, 0.0 | constant: bootstrap cannot reveal unobserved variation |
| source:summa | recall@10 | 3 | 0.0 | 0.0, 0.0 | constant: bootstrap cannot reveal unobserved variation |
| source:summa | recall@20 | 3 | 0.3333333333333333 | 0.0, 1.0 | percentile-bootstrap |
| source:summa | full-recall@5 | 3 | 0.0 | 0.0, 0.0 | constant: bootstrap cannot reveal unobserved variation |
| source:summa | full-recall@10 | 3 | 0.0 | 0.0, 0.0 | constant: bootstrap cannot reveal unobserved variation |
| source:summa | full-recall@20 | 3 | 0.3333333333333333 | 0.0, 1.0 | percentile-bootstrap |
| source:summa | MRR@10 | 3 | 0.0 | 0.0, 0.0 | constant: bootstrap cannot reveal unobserved variation |

## Per-question retrieval

| Question | Slice | recall@10 | full-recall@10 | MRR@10 | Query truncated |
|---|---|---|---|---|---|
| q-0001 | cross-lingual | 0.0 | 0.0 | 0.0000 | False |
| q-0002 | same-language | 0.0 | 0.0 | 0.0000 | False |
| q-0003 | cross-lingual | 0.0 | 0.0 | 0.0000 | False |
| q-0004 | cross-lingual | 0.0 | 0.0 | 0.0000 | False |
| q-0005 | same-language | 0.0 | 0.0 | 0.0000 | False |
| q-0006 | cross-lingual | 0.0 | 0.0 | 0.0000 | False |
| q-0008 | same-language | 0.0 | 0.0 | 0.0000 | False |
| q-0010 | same-language | 0.0 | 0.0 | 0.0000 | False |

## Retrieval latency after model load

- p50: 159.98 ms
- p95: 3177.16 ms

## Passage truncation

| Source | Chunks | Truncated |
|---|---|---|
| ccc | 5730 | 0 |
| summa | 3453 | 0 |

## Exploratory top-two comparison

Ranked by recall@10 per slice; ties use identity order.
Sample size is a paired normal approximation (95%, 80% power).
It is total n, not additional n; null means unidentifiable.
Selection is exploratory and does not establish a winner.

```json
{
  "schema_version": 1,
  "corpus_hash": "42a33a159bfef11abeeec05ecdbdf942ebdbf89c0bde79148f6a5fe826f09597",
  "gold_hash": "32b4d4565e2426dcb816c58281f174ce845a630211b1ed05b06fa863a6c802c6",
  "embedding_identities": [
    "Qwen/Qwen3-Embedding-0.6B@onnx:8c4f59b70600c4a61b8e2c793f51601f4dbb866072ce70cc4be862454ba84475",
    "intfloat/multilingual-e5-large@onnx:c0372a01e8336707c4addb08207555769638c54ce7ad7285c1aedca8982703e7",
    "BAAI/bge-m3@onnx:c701ad440e3ba38ae7b34fbf34a1ecdd8b0cf6154a297824316ded600d3dc9e5"
  ],
  "seed": 0,
  "resamples": 9999,
  "selection_metric": "recall@10",
  "confidence_level": 0.95,
  "planning_power": 0.8,
  "sample_size_method": "exploratory paired normal approximation",
  "slices": {
    "all": {
      "first": "BAAI/bge-m3@onnx:c701ad440e3ba38ae7b34fbf34a1ecdd8b0cf6154a297824316ded600d3dc9e5",
      "second": "intfloat/multilingual-e5-large@onnx:c0372a01e8336707c4addb08207555769638c54ce7ad7285c1aedca8982703e7",
      "paired_recall@10": {
        "n": 8,
        "mean": 0.125,
        "low": -0.25,
        "high": 0.5,
        "status": "percentile-bootstrap"
      },
      "estimated_total_n": 207,
      "first_loses": [
        "q-0008"
      ],
      "first_gains": [
        "q-0002",
        "q-0004"
      ]
    },
    "same-language": {
      "first": "BAAI/bge-m3@onnx:c701ad440e3ba38ae7b34fbf34a1ecdd8b0cf6154a297824316ded600d3dc9e5",
      "second": "intfloat/multilingual-e5-large@onnx:c0372a01e8336707c4addb08207555769638c54ce7ad7285c1aedca8982703e7",
      "paired_recall@10": {
        "n": 4,
        "mean": 0.0,
        "low": -0.75,
        "high": 0.75,
        "status": "percentile-bootstrap"
      },
      "estimated_total_n": null,
      "first_loses": [
        "q-0008"
      ],
      "first_gains": [
        "q-0002"
      ]
    },
    "cross-lingual": {
      "first": "BAAI/bge-m3@onnx:c701ad440e3ba38ae7b34fbf34a1ecdd8b0cf6154a297824316ded600d3dc9e5",
      "second": "intfloat/multilingual-e5-large@onnx:c0372a01e8336707c4addb08207555769638c54ce7ad7285c1aedca8982703e7",
      "paired_recall@10": {
        "n": 4,
        "mean": 0.25,
        "low": 0.0,
        "high": 0.75,
        "status": "percentile-bootstrap"
      },
      "estimated_total_n": 32,
      "first_loses": [],
      "first_gains": [
        "q-0004"
      ]
    }
  }
}
```
