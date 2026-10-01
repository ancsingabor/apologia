# Architecture Decision Records

Each record states a decision that **could have gone the other way**. If there
was no real alternative, it is a note, not a decision — and it does not belong
here.

Format: a three-line **TL;DR** (decision · because · cost) · context · problem ·
alternatives considered · decision · reasoning · consequences · trade-offs. The
TL;DR is for a reader who needs the gist; the *reasoning* and *trade-offs*
sections carry the value, and the decision itself is usually the least
interesting line.

**This is layer 2, and it is not the way in.** The eleven short chapters of
[the guide](../guide/README.md) are what a person reads; these files are the
complete argument behind them, written to be *referred to* rather than read
through. Where a chapter and an ADR disagree, the ADR is right and the chapter
is the bug. Nothing here is ever shortened to match a summary
([CLAUDE.md](../../CLAUDE.md)).

**These records are amended, never rewritten.** A decision that turned out to
rest on something false keeps its original text and gains an `## Amendment`
saying what was falsified and how it was found — because the way an error
surfaced is usually worth more than the corrected fact. The `Status:` line of
each file carries that story, and the **Status** column below repeats it, so
nothing has to be opened to find out whether it has moved.

**Thirteen of the twenty carry such a marker**, and they divide three ways.
Seven have a dated `## Amendment` or `## Open question` of their own (002, 003,
010, 013, 015, 019, 023). Three had a claim superseded by a *later* ADR rather
than by an amendment (004 and 005 by 023 and 018; 014 by 017), so the
supersession is named at both ends. The rest are 011, which carries a dated
note inside a trade-off, and 017 and 020, which record a correction made
elsewhere.

The seven that stand exactly as accepted are 001, 006, 009, 016, 018, 021 and
022 — largely the ones whose subject has not been built. Read that as a pattern
rather than a compliment: **in this repository a decision gets corrected when
code meets it**, so an unamended ADR is usually an untested one.

Re-derive the number rather than trusting this sentence; a count in a summary
is where drift shows up first:

~~~bash
grep -lE '^Status:.*· \*\*' docs/adr/0*.md | wc -l
~~~

| # | Decision | Status |
|---|---|---|
| [001](001-pgvector-as-vector-store.md) | Postgres + pgvector as the vector store | Accepted, unamended |
| [002](002-citable-unit-model.md) | The citable unit is the atom of the corpus | Accepted · **amended** — its own Summa example was not a unit |
| [003](003-ship-manifests-not-corpus.md) | The repo ships manifests and a pipeline, not the corpus | Accepted · **carries an open question, twice widened** — the only one that can invalidate a design |
| [004](004-offline-ingestion-cli.md) | Ingestion is an offline CLI | Accepted · one consequence **corrected by 023** |
| [005](005-verify-then-display.md) | Verify citations before display; no streaming in v1 | Accepted · its third gate check **replaced by 018** |
| [006](006-draft-review-publish.md) | Answers are drafts until a human publishes them | Accepted, unamended |
| 007 | Cross-lingual retrieval strategy | Deferred — constrained by [014](014-translation-and-quotation.md), decided by measurement |
| 008 | Embedding model and provider | Deferred — Milestone 1, decided by the bake-off |
| [009](009-fail-closed-rate-limiting.md) | Cost and abuse containment; the limiter fails closed | Accepted · limiter built, **budget and kill switch are Phase 2** |
| [010](010-authority-tiers.md) | Authority tiers as first-class metadata | Accepted · **amended 2026-09-30** — the tier is not required where it matters |
| [011](011-semantic-layer-preregistration.md) | Pre-registration of the semantic-layer experiment | Accepted · **note added** — one threshold is already visibly mis-sized |
| 012 | Graph in Postgres + offline reasoner vs. triple store | Deferred — Phase 4 |
| [013](013-per-request-locale.md) | Locale resolved per request from the URL | Accepted · **amended 2026-09-30 — not implemented**; the header claimed it was |
| [014](014-translation-and-quotation.md) | Translate the explanation, never the quotation | Accepted · display posture **superseded by 017**; the rule itself stands |
| [015](015-testing-strategy.md) | Tests are chosen by determinism, not by stack layer | Accepted · **amended** — the integration runner is now decided (Vitest) |
| [016](016-editorial-spine.md) | The topic spine is editorial, thin, and independent of the corpus | Accepted · **nothing built yet** — `topics` waits on `0006` |
| [017](017-quotation-as-verified-invariant.md) | Quotation is a verified invariant, not a policy note | Accepted · **supersedes part of 014**; limits are in code and tested |
| [018](018-segmented-answers.md) | The model marks its own claims; the gate does not detect them | Accepted · **resolves 005's third check**; the generator is unbuilt |
| [019](019-ccc-editions.md) | The CCC editions: revision alignment over file convenience | Accepted · **amended twice, then corrected** — three of its claims were falsified downstream |
| [020](020-asserting-a-single-signal-source.md) | Asserting a source that carries one signal | Accepted · **corrected** — `role` had been read off typography |
| [021](021-licence-belongs-to-the-transcription.md) | A licence describes a transcription, not only a work | Accepted, unamended |
| [022](022-asserting-a-source-with-no-sibling-edition.md) | Asserting a source with no sibling edition | Accepted · records four of its **own** claims being falsified |
| [023](023-python-at-the-measurement-boundary.md) | Python at the measurement boundary; TypeScript everywhere else | Accepted · **a fourth outcome added**, one figure restated |

**007 and 008 are deliberately deferred.** Picking an embedding model from
model cards, before the gold set can measure it on Hungarian queries over a
mixed-language corpus, would be choosing on marketing copy. They get written
when there is a number behind them. [023](023-python-at-the-measurement-boundary.md)
builds the harness that produces it.

**008 covers embeddings only.** It used to be titled "provider boundary
(embeddings + generation)", which promised a decision the bake-off cannot
deliver: the harness embeds chunks and scores retrieval, and measures no
generation model at any point. Meanwhile Claude is already assumed by
`.env.example`, `CLAUDE.md`, guide 06 and guide 08. So the generation provider
is *chosen, not measured*, and it has no ADR — which `docs/guide/status.md`
lists as owed. Leaving it inside 008 meant a deferral nothing was going to
lift.
