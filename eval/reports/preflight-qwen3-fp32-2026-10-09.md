# Qwen3 fp32 pre-flight — 2026-10-09

Model: `Qwen/Qwen3-Embedding-0.6B`. Precision: fp32. Pooling: lasttoken.
Artifact directory: `.preflight/Qwen_Qwen3-Embedding-0.6B/fp32`.
Artifact SHA256: `852b75b23aa54978cbb8cf67164f2a3a6f40213de3a6d9f902816200358ae6f0`.

The original reference weights were checked on CPU. The earlier attempt
selected MPS automatically and reached roughly 8 GB of process footprint;
it was interrupted, and the completed export reused for the CPU check.
The CPU run exited successfully. The earlier int8 artifact and evidence
remain unchanged. No corpus text was sent to a provider.

| Measurement | Result |
|---|---|
| Artifact bytes | 2,400,256,077 |
| Observed / declared dimensions | 1024 / 1024 |
| Mean reference cosine | 0.999999999987 |
| Minimum reference cosine | 0.999999999973 |
| Probe top-3 ordering agreement | 100% |
| Cold model load | 17.91 seconds |
| Mean warm query embedding | 113.05 ms |
| Process peak RSS | 1730.56 MB |

All ten probes agree closely with the original. They are unrelated authored
questions, not query/passage pairs, so this verifies fidelity on those probes;
it does not establish retrieval quality or fidelity on every possible input.
The unquantized artifact is directly compared with the reference; the null
`fp32_control_cosine` field does not mean a failed control. No quantization
control is needed for this fp32 measurement.

The artifact is much larger than int8. These local load and memory measurements
are not production cold-start guarantees, and peak RSS includes the reference
check. Retrieval must be measured using this exact artifact for both passages
and questions. Full precision is a candidate condition, not a recommendation
to deploy it unchanged.
