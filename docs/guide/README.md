# The Apologia guide

**Start here.** This guide is the human-sized way into the repository. It aims
at senior and lead-engineer depth. It is not written for beginners, but it is
not a long read either. Each chapter takes about three minutes, has a diagram
where one helps, and ends by pointing you to the detailed document that argues
the case.

## The pitch

**In 30 seconds.**
Apologia answers questions about Catholic theology and philosophy in Hungarian
and English. It answers only from a curated set of real sources, never from a
language model's memory. Every claim carries a citation to a canonical passage,
such as *Catechism* §1730. Code checks each citation before anyone sees it: the
passage must exist, the model must actually have been given it, and any
quotation must match the source exactly. A human then publishes the answer. It
is a research aid that shows its work.

**In 2 minutes.**
Most RAG systems cut their sources into arbitrary text windows. Their citations
are therefore chunk IDs, which mean nothing outside the system, and the best
they can do is ask another model whether a citation *looks* right. Catholic
sources already have stable addresses that are centuries old: paragraph numbers
and question/article numbers. Apologia makes those addresses the **atom of
citation** — the **citable unit** — which turns "is this citation real?" from
a judgement call into a lookup.

We still chunk, though, and a chunk is not a unit. **Keeping the two apart is
the idea to hold on to:**

- **A unit is what we cite.** `ccc:1730` is one. So is a single *role* inside a
  Summa article — an objection, or the body that answers it — but never the
  article as a whole.
- **A chunk is what we embed.** It is a whole number of adjacent units from one
  container, never a window cut mid-sentence. Retrieval finds chunks; the
  answer cites the units inside them.

*Summa* I q.2 a.3 shows why the line is drawn there rather than at the article.
It asks whether God exists, so its objections argue that he does not. Embedded
whole, the model sees the full argument; cited whole, *"videtur quod Deus non
sit"* resolves to a real address, quotes byte-exactly, passes every check, and
attributes atheism to Aquinas. So the chunk is the article and the unit is the
role. The separation pays a second time: re-tuning the chunker cannot
invalidate a stored citation, which makes chunking a variable the eval harness
can move instead of a decision that has to be right first time.

The rest of the design follows:

- Chunking follows each source's own structure, not a character count.
- The citation check is a deterministic gate, not a score.
- The same paragraph can be matched across Hungarian and English.

The system has two halves.

- **Offline ingestion CLI.** It fetches each source, parses it into citable
  units, asserts that nothing is missing or misnumbered, groups the units into
  chunks, and writes all of it to Postgres. That half is **built** — which
  documents, and how many units and chunks each, is in
  [status.md](status.md). **Nothing is embedded yet:** the pgvector column
  exists and the embedding pass is deliberately unwritten, for the reason the
  next bullet gives.
- **Query path.** It embeds the question, retrieves the nearest chunks, has
  Claude draft an answer from the units inside them, runs the citation gate,
  and queues the draft for human review. That half is designed but not built.
  It waits on one open decision — **which embedding model to use**, which is
  also what the ingestion half is waiting on, because a query and the corpus
  can only be compared if the same model embedded both. That decision is being
  made by measurement against a gold set of questions written before any
  retriever existed, not by reading model cards.

Two rules shape the product.

- **Translate the explanation, never the quotation.** A machine-translated
  quotation would be a sentence no source ever wrote.
- **Nothing is published unreviewed.**

## Reading order

| # | Chapter | Answers | Min |
|---|---|---|---|
| — | [status.md](status.md) | What exists today, what's next, what's blocked | 3 |
| 01 | [What and why](01-what-and-why.md) | What problem, for whom, and what it deliberately is not | 3 |
| 02 | [The citable unit](02-the-citable-unit.md) | The one idea everything follows from | 3 |
| 03 | [System map](03-system-map.md) | The boxes and the arrows: who talks to what, and what runs where | 4 |
| — | [Code map](code-map.md) | Which folder is which box, and what to read first inside it | 3 |
| 04 | [Ingestion](04-ingestion.md) ✅ | How a web page becomes verified citable units | 4 |
| 05 | [Data model](05-data-model.md) | The tables, and the four choices worth defending | 3 |
| 06 | [Query path](06-query-path.md) 📐 | One question end to end, and the citation gate | 4 |
| 07 | [Measurement](07-measurement.md) 🚧 | What "better" is allowed to mean; the bake-off | 4 |
| 08 | [Infrastructure](08-infrastructure.md) | Where things run, where secrets live, which gates a change passes | 3 |
| 09 | [Quality](09-quality.md) | Two kinds of correctness; test layers; "silent green" | 3 |
| 10 | [War stories](10-war-stories.md) | Eight bugs that never crashed, and what each one changed | 4 |
| 11 | [Questions a reviewer asks](11-questions-a-reviewer-asks.md) | Practice answers, known weaknesses, what I'd do differently | 5 |

Chapters 01–03 plus status take about 15 minutes. After that you can explain
the system at the level of "what does what". Chapters 04–07 take the same
explanation down to how each part works.

**A separate track, [python/](python/README.md)**, is for a TypeScript
developer reading the harness. It has a learning path with a progress
checklist, a TS ↔ Python [vocabulary](python/vocabulary.md), and a
[walkthrough](python/walkthrough.md) of each module with an exercise that
breaks something on purpose.

## How the documentation is layered

| Layer | For | Where | Style |
|---|---|---|---|
| **1. This guide** | a person who needs the shape fast | `docs/guide/` | short, diagrams, links down |
| **2. Reasoning** | a reviewer who wants the argument | [`docs/architecture.md`](../architecture.md), [`docs/adr/`](../adr/README.md), [`docs/corpus.md`](../corpus.md), [`docs/evaluation.md`](../evaluation.md) | complete, with every rejected alternative |
| **3. Code-local context** | whoever edits the file, including AI assistants | the header comment of each module | exhaustive, next to the code it governs |

The guide **summarises and links; it never replaces**. If the guide and a layer-2
or layer-3 document disagree, the lower layer is right and the guide is the bug.
The two exceptions are status, which lives only in [status.md](status.md), and
the diagrams.

## Conventions

- ✅ built · 🚧 in progress · 📐 planned, in text.
- In diagrams, **solid** boxes and arrows are built and **dashed** ones are
  planned.
- `ccc:1730`-style strings are locators: `source:address`. **A locator always
  names a unit** — the thing a citation may point at — never a chunk.
- "ADR-NNN" means [`docs/adr/NNN-*.md`](../adr/README.md). Each ADR opens with a
  three-line TL;DR.
