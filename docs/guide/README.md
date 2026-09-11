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
such as *Catechism §1730* or *Summa I q.2 a.3*. Code checks each citation before
anyone sees it: the passage must exist, the model must actually have been given
it, and any quotation must match the source exactly. A human then publishes the
answer. It is a research aid that shows its work.

**In 2 minutes.**
Most RAG systems cut their sources into arbitrary text windows. Their citations
are therefore chunk IDs, which mean nothing outside the system, and the best
they can do is ask another model whether a citation *looks* right. Catholic
sources already have stable addresses that are centuries old: paragraph numbers
and question/article numbers. Apologia makes those addresses the atom of the
corpus. We call it the **citable unit**. This single choice turns "is this
citation real?" from a judgement call into a lookup, and the rest of the design
follows from it:

- Chunking follows each source's own structure.
- The citation check is a deterministic gate, not a score.
- The same paragraph can be matched across Hungarian and English.

The system has two halves.

- **Offline ingestion CLI.** It fetches each source and parses it into citable
  units. It asserts that nothing is missing or misnumbered, then writes the
  result to Postgres with pgvector. That half is built: three documents, about
  29,000 units.
- **Query path.** It retrieves units, has Claude draft an answer, runs the
  citation gate, and queues the draft for human review. That half is designed
  but not built. It waits on one open decision: which embedding model to use.
  That decision is being made by measurement against a gold set of questions
  written before any retriever existed, not by reading model cards.

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
| 03 | [System map](03-system-map.md) | The boxes, the arrows, and which file is which box | 4 |
| 04 | [Ingestion](04-ingestion.md) ✅ | How a web page becomes verified citable units | 4 |
| 05 | [Data model](05-data-model.md) | The tables, and the four choices worth defending | 3 |
| 06 | [Query path](06-query-path.md) 📐 | One question end to end, and the citation gate | 4 |
| 07 | [Measurement](07-measurement.md) 🚧 | What "better" is allowed to mean; the bake-off | 4 |
| 08 | [Infrastructure](08-infrastructure.md) | Where things run, where secrets live, which gates a change passes | 3 |
| 09 | [Quality](09-quality.md) | Two kinds of correctness; test layers; "silent green" | 3 |
| 10 | [War stories](10-war-stories.md) | Five bugs that never crashed, and what each one changed | 4 |
| 11 | [Questions a reviewer asks](11-questions-a-reviewer-asks.md) | Practice answers, known weaknesses, what I'd do differently | 5 |

Chapters 01–03 plus status take about 15 minutes. After that you can explain
the system at the level of "what does what". Chapters 04–07 take the same
explanation down to how each part works.

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
- `ccc:1730`-style strings are locators: `source:address`.
- "ADR-NNN" means [`docs/adr/NNN-*.md`](../adr/README.md). Each ADR opens with a
  three-line TL;DR.
