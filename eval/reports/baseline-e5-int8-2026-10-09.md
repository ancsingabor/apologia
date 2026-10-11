# Retrieval evaluation

Model: `intfloat/multilingual-e5-large@onnx:c0372a01e8336707c4addb08207555769638c54ce7ad7285c1aedca8982703e7`
Corpus: `42a33a159bfef11abeeec05ecdbdf942ebdbf89c0bde79148f6a5fe826f09597`
Gold set: `32b4d4565e2426dcb816c58281f174ce845a630211b1ed05b06fa863a6c802c6`

95% percentile bootstrap; questions are resampled, not chunks.
The authored set is small. Constant samples hide unobserved variation.
Generation, cost per answer and end-to-end latency are not measured.

Excluded: q-0007, q-0009

| Slice | Metric | n | Mean | 95% interval | Status |
|---|---|---|---|---|---|
| all | recall@5 | 8 | 0.375 | 0.0, 0.75 | percentile-bootstrap |
| all | recall@10 | 8 | 0.5 | 0.125, 0.875 | percentile-bootstrap |
| all | recall@20 | 8 | 0.625 | 0.25, 0.875 | percentile-bootstrap |
| all | full-recall@5 | 8 | 0.0 | 0.0, 0.0 | constant: bootstrap cannot reveal unobserved variation |
| all | full-recall@10 | 8 | 0.125 | 0.0, 0.375 | percentile-bootstrap |
| all | full-recall@20 | 8 | 0.375 | 0.125, 0.75 | percentile-bootstrap |
| all | MRR@10 | 8 | 0.33035714285714285 | 0.0625, 0.625 | percentile-bootstrap |
| same-language | recall@5 | 4 | 0.25 | 0.0, 0.75 | percentile-bootstrap |
| same-language | recall@10 | 4 | 0.5 | 0.0, 1.0 | percentile-bootstrap |
| same-language | recall@20 | 4 | 0.75 | 0.25, 1.0 | percentile-bootstrap |
| same-language | full-recall@5 | 4 | 0.0 | 0.0, 0.0 | constant: bootstrap cannot reveal unobserved variation |
| same-language | full-recall@10 | 4 | 0.0 | 0.0, 0.0 | constant: bootstrap cannot reveal unobserved variation |
| same-language | full-recall@20 | 4 | 0.5 | 0.0, 1.0 | percentile-bootstrap |
| same-language | MRR@10 | 4 | 0.1607142857142857 | 0.0, 0.375 | percentile-bootstrap |
| cross-lingual | recall@5 | 4 | 0.5 | 0.0, 1.0 | percentile-bootstrap |
| cross-lingual | recall@10 | 4 | 0.5 | 0.0, 1.0 | percentile-bootstrap |
| cross-lingual | recall@20 | 4 | 0.5 | 0.0, 1.0 | percentile-bootstrap |
| cross-lingual | full-recall@5 | 4 | 0.0 | 0.0, 0.0 | constant: bootstrap cannot reveal unobserved variation |
| cross-lingual | full-recall@10 | 4 | 0.25 | 0.0, 0.75 | percentile-bootstrap |
| cross-lingual | full-recall@20 | 4 | 0.25 | 0.0, 0.75 | percentile-bootstrap |
| cross-lingual | MRR@10 | 4 | 0.5 | 0.0, 1.0 | percentile-bootstrap |
| source:ccc | recall@5 | 6 | 0.5 | 0.16666666666666666, 0.8333333333333334 | percentile-bootstrap |
| source:ccc | recall@10 | 6 | 0.6666666666666666 | 0.3333333333333333, 1.0 | percentile-bootstrap |
| source:ccc | recall@20 | 6 | 0.6666666666666666 | 0.3333333333333333, 1.0 | percentile-bootstrap |
| source:ccc | full-recall@5 | 6 | 0.16666666666666666 | 0.0, 0.5 | percentile-bootstrap |
| source:ccc | full-recall@10 | 6 | 0.3333333333333333 | 0.0, 0.6666666666666666 | percentile-bootstrap |
| source:ccc | full-recall@20 | 6 | 0.5 | 0.16666666666666666, 0.8333333333333334 | percentile-bootstrap |
| source:ccc | MRR@10 | 6 | 0.44047619047619047 | 0.10714285714285714, 0.7738095238095238 | percentile-bootstrap |
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
| q-0003 | cross-lingual | 1.0 | 0.0 | 1.0000 | False |
| q-0004 | cross-lingual | 0.0 | 0.0 | 0.0000 | False |
| q-0005 | same-language | 0.0 | 0.0 | 0.0000 | False |
| q-0006 | cross-lingual | 1.0 | 1.0 | 1.0000 | False |
| q-0008 | same-language | 1.0 | 0.0 | 0.1429 | False |
| q-0010 | same-language | 1.0 | 0.0 | 0.5000 | False |

## Retrieval latency after model load

- p50: 48.62 ms
- p95: 148.71 ms

## Passage truncation

| Source | Chunks | Truncated |
|---|---|---|
| ccc | 5730 | 5 |
| summa | 3453 | 2748 |

## Live verification — 2026-10-09

All current chunks were embedded. The corpus hash matches the committed
manifest and all expected gold locators resolve. An interruption after 176
committed vectors preserved every checksum; restart skipped those rows.
Scoring a partial index refused to produce a report. A second complete
scoring run reproduced every ranked locator set, metric, interval and
truncation count; latencies varied. Independent token counts agreed with
the report. No generation ran and no corpus text was sent to a provider.

This is one candidate's baseline. It does not choose ADR-008, attribute
Summa misses to truncation, or overcome the small authored gold set.
