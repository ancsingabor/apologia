# Architecture Decision Records

Each record states a decision that **could have gone the other way**. If there
was no real alternative, it is a note, not a decision — and it does not belong
here.

Format: context · problem · alternatives considered · decision · reasoning ·
consequences · trade-offs. The *reasoning* and *trade-offs* sections carry the
value; the decision itself is usually the least interesting line.

| # | Decision | Status |
|---|---|---|
| [001](001-pgvector-as-vector-store.md) | Postgres + pgvector as the vector store | Accepted |
| [002](002-citable-unit-model.md) | The citable unit is the atom of the corpus | Accepted |
| [003](003-ship-manifests-not-corpus.md) | The repo ships manifests and a pipeline, not the corpus | Accepted |
| [004](004-offline-ingestion-cli.md) | Ingestion is an offline CLI | Accepted |
| [005](005-verify-then-display.md) | Verify citations before display; no streaming in v1 | Accepted |
| [006](006-draft-review-publish.md) | Answers are drafts until a human publishes them | Accepted |
| 007 | Cross-lingual retrieval strategy | Deferred — constrained by [014](014-translation-and-quotation.md), decided by measurement |
| 008 | Provider boundary (embeddings + generation) | Deferred — Milestone 1 |
| [009](009-fail-closed-rate-limiting.md) | Cost and abuse containment; the limiter fails closed | Accepted |
| [010](010-authority-tiers.md) | Authority tiers as first-class metadata | Accepted |
| [011](011-semantic-layer-preregistration.md) | Pre-registration of the semantic-layer experiment | Accepted |
| 012 | Graph in Postgres + offline reasoner vs. triple store | Deferred — Phase 4 |
| [013](013-per-request-locale.md) | Locale resolved per request from the URL | Accepted |
| [014](014-translation-and-quotation.md) | Translate the explanation, never the quotation | Accepted |
| [015](015-testing-strategy.md) | Tests are chosen by determinism, not by stack layer | Accepted |

**007 and 008 are deliberately deferred.** Picking an embedding model from
model cards, before the gold set can measure it on Hungarian queries over a
mixed-language corpus, would be choosing on marketing copy. They get written
when there is a number behind them.
