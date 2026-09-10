# Evaluation harness

Metric definitions, the gold-set format, and the release rule live in
[`docs/evaluation.md`](../docs/evaluation.md). This directory holds the data.

```
eval/
  questions/    the gold set — one YAML file per question, frozen in git
  reports/      npm run eval output (gitignored except committed baselines)
```

```bash
npm run eval:lint   # resolve every expected_units locator against ingested text
```

## Status: Milestone 1

`questions/` holds **v0: 10 questions**, written before any retriever exists so
the benchmark cannot be fitted to the system it judges.

Two things are outstanding, and both are deliberate:

**Expansion to 40–60.** v0 covers the categories and demonstrates the format.
The full set needs breadth, and it needs to be authored by someone with the
domain knowledge to know what a good answer draws on.

**Verification of every `expected_units` value.** ✅ *Mostly resolved.*
`npm run eval:lint` now resolves every locator against ingested units and fails
if one that should resolve does not.

As of the Hungarian CCC ingest: **13 CCC locators resolve; 4 Summa locators are
pending**, because the Summa is parsed and licensed but not yet ingested into a
database. The command distinguishes the two cases deliberately —

| Case | Verdict |
|---|---|
| source ingested, locator does not resolve | **failure** — the gold set is wrong about a text we hold |
| source not ingested | **pending** — reported and counted, never fatal |

— because failing on the second would make the check unrunnable until the whole
corpus exists, and a check nobody can run is a check nobody runs. ⚠️ **Pending
is not a pass.** It is the honest statement that those four have still never
been checked against a database.

### The Summa locators were wrong, and pending is why nobody noticed

They were written as `summa:I.q2.a3` and `summa:I.q3.a4` — **articles**, which
under the implemented scheme (ADR-002, `corpus-thomisticum`) are containers and
not citable units. Units are leaf-level: `.arg1`, `.sc`, `.co`, `.ad1`. Corrected
to the leaves each question actually wants, checked against the parsed source.

The correction improved the questions rather than only their spelling. q-0003
and q-0004 both named the same article; they now name the objection and the
respondeo of that article respectively, so the pair tests whether passage role
survived ingestion. q-0003 also gained `.ad1`, because expecting the objection
alone would have scored a retriever full marks for returning the problem of evil
without Aquinas's answer to it.

This is the failure mode the ⚠️ above exists for: three locators sat in the gold
set for a milestone, reported every run, and were wrong about the addressing
scheme the whole time. Pending is not a pass.

This is recorded rather than glossed because an unverified gold set produces
confident, meaningless numbers, which is worse than no numbers. The specific
failure it guards against: a retriever gets no credit for finding `ccc:283` if
the gold set misnames it, and full credit for missing a paragraph that does not
exist.

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
