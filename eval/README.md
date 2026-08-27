# Evaluation harness

Metric definitions, the gold-set format, and the release rule live in
[`docs/evaluation.md`](../docs/evaluation.md). This directory holds the data.

```
eval/
  questions/    the gold set — one YAML file per question, frozen in git
  reports/      npm run eval output (gitignored except committed baselines)
```

## Status: Milestone 0

`questions/` holds **v0: 10 questions**, written before any retriever exists so
the benchmark cannot be fitted to the system it judges.

Two things are outstanding, and both are deliberate:

**Expansion to 40–60.** v0 covers the categories and demonstrates the format.
The full set needs breadth, and it needs to be authored by someone with the
domain knowledge to know what a good answer draws on.

**Verification of every `expected_units` value.** ⚠️ The locators in v0 are
stated from knowledge of the sources, **not** checked against ingested text —
the corpus is not ingested yet. Milestone 1 adds a `npm run eval:lint` step that
fails if any `expected_units` locator does not resolve to a real unit. Until
that passes, treat the expected units as drafts.

This is recorded rather than glossed because an unverified gold set produces
confident, meaningless numbers, which is worse than no numbers.

## Composition of v0

| Category | Count | Purpose |
|---|---|---|
| `doctrine` | 3 | core retrieval; one multi-source |
| `philosophy` | 2 | argument structure; the Summa's objection/response shape |
| `science` | 1 | the faith/science boundary |
| `adversarial` | 2 | category errors this domain invites |
| `out-of-scope` | 1 | must refuse |
| `in-scope-looks-out` | 1 | must **not** refuse — over-refusal check |

Cross-lingual coverage: Hungarian questions whose best sources are English are
marked `cross_lingual: true` and are reported as a separate slice.
