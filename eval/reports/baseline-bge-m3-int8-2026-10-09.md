# Retrieval evaluation

Model: `BAAI/bge-m3@onnx:c701ad440e3ba38ae7b34fbf34a1ecdd8b0cf6154a297824316ded600d3dc9e5`
Corpus: `42a33a159bfef11abeeec05ecdbdf942ebdbf89c0bde79148f6a5fe826f09597`
Gold set: `32b4d4565e2426dcb816c58281f174ce845a630211b1ed05b06fa863a6c802c6`

95% percentile bootstrap; questions are resampled, not chunks.
The authored set is small. Constant samples hide unobserved variation.
Generation, cost per answer and end-to-end latency are not measured.

Excluded: q-0007, q-0009

| Slice | Metric | n | Mean | 95% interval | Status |
|---|---|---|---|---|---|
| all | recall@5 | 8 | 0.625 | 0.25, 0.875 | percentile-bootstrap |
| all | recall@10 | 8 | 0.625 | 0.25, 0.875 | percentile-bootstrap |
| all | recall@20 | 8 | 0.625 | 0.25, 0.875 | percentile-bootstrap |
| all | full-recall@5 | 8 | 0.25 | 0.0, 0.5 | percentile-bootstrap |
| all | full-recall@10 | 8 | 0.25 | 0.0, 0.5 | percentile-bootstrap |
| all | full-recall@20 | 8 | 0.375 | 0.125, 0.75 | percentile-bootstrap |
| all | MRR@10 | 8 | 0.5 | 0.1875, 0.8125 | percentile-bootstrap |
| same-language | recall@5 | 4 | 0.5 | 0.0, 1.0 | percentile-bootstrap |
| same-language | recall@10 | 4 | 0.5 | 0.0, 1.0 | percentile-bootstrap |
| same-language | recall@20 | 4 | 0.5 | 0.0, 1.0 | percentile-bootstrap |
| same-language | full-recall@5 | 4 | 0.25 | 0.0, 0.75 | percentile-bootstrap |
| same-language | full-recall@10 | 4 | 0.25 | 0.0, 0.75 | percentile-bootstrap |
| same-language | full-recall@20 | 4 | 0.25 | 0.0, 0.75 | percentile-bootstrap |
| same-language | MRR@10 | 4 | 0.375 | 0.0, 0.75 | percentile-bootstrap |
| cross-lingual | recall@5 | 4 | 0.75 | 0.25, 1.0 | percentile-bootstrap |
| cross-lingual | recall@10 | 4 | 0.75 | 0.25, 1.0 | percentile-bootstrap |
| cross-lingual | recall@20 | 4 | 0.75 | 0.25, 1.0 | percentile-bootstrap |
| cross-lingual | full-recall@5 | 4 | 0.25 | 0.0, 0.75 | percentile-bootstrap |
| cross-lingual | full-recall@10 | 4 | 0.25 | 0.0, 0.75 | percentile-bootstrap |
| cross-lingual | full-recall@20 | 4 | 0.5 | 0.0, 1.0 | percentile-bootstrap |
| cross-lingual | MRR@10 | 4 | 0.625 | 0.25, 1.0 | percentile-bootstrap |
| source:ccc | recall@5 | 6 | 0.6666666666666666 | 0.3333333333333333, 1.0 | percentile-bootstrap |
| source:ccc | recall@10 | 6 | 0.6666666666666666 | 0.3333333333333333, 1.0 | percentile-bootstrap |
| source:ccc | recall@20 | 6 | 0.6666666666666666 | 0.3333333333333333, 1.0 | percentile-bootstrap |
| source:ccc | full-recall@5 | 6 | 0.3333333333333333 | 0.0, 0.6666666666666666 | percentile-bootstrap |
| source:ccc | full-recall@10 | 6 | 0.3333333333333333 | 0.0, 0.6666666666666666 | percentile-bootstrap |
| source:ccc | full-recall@20 | 6 | 0.5 | 0.16666666666666666, 0.8333333333333334 | percentile-bootstrap |
| source:ccc | MRR@10 | 6 | 0.5833333333333334 | 0.25, 0.9166666666666666 | percentile-bootstrap |
| source:summa | recall@5 | 3 | 0.3333333333333333 | 0.0, 1.0 | percentile-bootstrap |
| source:summa | recall@10 | 3 | 0.3333333333333333 | 0.0, 1.0 | percentile-bootstrap |
| source:summa | recall@20 | 3 | 0.3333333333333333 | 0.0, 1.0 | percentile-bootstrap |
| source:summa | full-recall@5 | 3 | 0.3333333333333333 | 0.0, 1.0 | percentile-bootstrap |
| source:summa | full-recall@10 | 3 | 0.3333333333333333 | 0.0, 1.0 | percentile-bootstrap |
| source:summa | full-recall@20 | 3 | 0.3333333333333333 | 0.0, 1.0 | percentile-bootstrap |
| source:summa | MRR@10 | 3 | 0.16666666666666666 | 0.0, 0.5 | percentile-bootstrap |

## Per-question retrieval

| Question | Slice | recall@10 | full-recall@10 | MRR@10 | Query truncated |
|---|---|---|---|---|---|
| q-0001 | cross-lingual | 0.0 | 0.0 | 0.0000 | False |
| q-0002 | same-language | 1.0 | 1.0 | 0.5000 | False |
| q-0003 | cross-lingual | 1.0 | 0.0 | 1.0000 | False |
| q-0004 | cross-lingual | 1.0 | 1.0 | 0.5000 | False |
| q-0005 | same-language | 0.0 | 0.0 | 0.0000 | False |
| q-0006 | cross-lingual | 1.0 | 0.0 | 1.0000 | False |
| q-0008 | same-language | 0.0 | 0.0 | 0.0000 | False |
| q-0010 | same-language | 1.0 | 0.0 | 1.0000 | False |

## Retrieval latency after model load

- p50: 48.11 ms
- p95: 161.42 ms

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
    "BAAI/bge-m3@onnx:c701ad440e3ba38ae7b34fbf34a1ecdd8b0cf6154a297824316ded600d3dc9e5",
    "intfloat/multilingual-e5-large@onnx:c0372a01e8336707c4addb08207555769638c54ce7ad7285c1aedca8982703e7"
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

## Reading this measurement

BGE-M3 and E5 use the same corpus, gold questions and exact cosine search.
All 9,183 chunks were embedded locally using the recorded int8 ONNX artifact
and CLS pooling. This is dense retrieval; sparse and multi-vector BGE-M3
retrieval are not measured.

| Slice | E5 recall@10 | BGE-M3 recall@10 | E5 full-recall@10 | BGE-M3 full-recall@10 |
|---|---|---|---|---|
| All | 4/8 | 5/8 | 1/8 | 2/8 |
| Same-language | 2/4 | 2/4 | 0/4 | 1/4 |
| Cross-lingual | 2/4 | 3/4 | 1/4 | 1/4 |

BGE-M3 gains q-0002 and q-0004, but loses q-0008. Its paired recall@10
difference is +0.125, with a 95% interval of [-0.25, 0.50]. The interval
includes zero, so this does not establish a winner. The same-language tie
hides a gained question and a lost question. The comparison JSON orders tied
models by identity; `first` is not a statistical verdict.

The exploratory planning estimates are 207 total questions overall and 32
cross-lingual questions. The same-language estimate is unidentifiable. These
estimates use a paired normal approximation with 95% confidence and 80% power
on a tiny authored sample, after selecting models by observed recall. They
are neither additional-question counts nor stopping rules.

BGE-M3 truncates no passages or scored queries. Its Summa diagnostic is 1/3
at recall@10, versus E5's 0/3. Context window and fine-tuning vary together;
this comparison cannot isolate a cause. Both models share the XLM-RoBERTa
family. Qwen3 and a broader gold set remain necessary for ADR-008.

## Live verification

- Corpus and gold hashes match the E5 baseline exactly.
- All 9,183 E5 vector checksums remained unchanged.
- Independent tokenizer counts match the report: CCC 0/5,730 truncated,
  Summa 0/3,453 truncated.
- Repeated scoring reproduced ranked locator sets, metrics, confidence
  intervals, exclusions, truncation counts and paired comparisons. Latencies
  are wall-clock observations and differ across runs.
- A complete BGE-M3 bake-off rerun wrote no additional batches.
- Some early scorings wrote complete reports but failed during native
  interpreter shutdown. See the harness runtime note for the observed
  verification and limitation; report creation alone does not prove exit success.
- No hosted corpus transmission or generation occurred.

Latency measures query embedding and SQL retrieval after model load on this
local machine. It does not include generation or end-to-end serving latency.
