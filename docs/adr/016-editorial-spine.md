# ADR-016 — The topic spine is editorial, thin, and independent of the corpus

Status: **Accepted** · Milestone 1

> **TL;DR**
> - **Decision:** The topic spine is a small hand-written table (~20 topics) that aggregates published answers; the corpus is not topic-tagged and no book's structure is reproduced.
> - **Because:** Authoring a content site is a year of domain work, not engineering — while no spine at all leaves an empty search box.
> - **Cost:** Topic pages start empty by design, and a hand-made taxonomy will be wrong at the edges.

## Context

Milestone 0 designed a question-answering engine: ask → retrieve → verify →
review → publish to `/hu/kerdes/<slug>`. That is a search box with a permanent
URL per answer, and it has no shape a reader can browse. Nothing tells someone
arriving cold what the site covers, and nothing sequences the material.

The obvious fix is a table of contents, and there is a good one to borrow from —
Kreeft & Tacelli's *Handbook of Catholic Apologetics* runs from the nature of
apologetics through the arguments for God, the problem of evil, the Resurrection,
the last things. It is a solved curriculum.

## Problem

Introducing a browsable spine pulls the product toward being a **content site**,
and that is a different project with a different cost structure. "Seventeen
chapters of Catholic apologetics" is a year of authoring by a domain expert. It
is not engineering, it would consume the milestone, and at the end of it the
retriever — the thing this repository exists to build — would still not exist.

The opposite failure is just as real: no spine at all, and the site is an empty
search box that answers questions nobody knows to ask.

There is also a rights question. The *Handbook* is in copyright (Ignatius Press,
1994; Kreeft is living), and a table of contents attracts thin compilation
copyright in its selection and arrangement even though individual chapter titles
are short factual phrases.

## Alternatives considered

1. **No spine.** Answers only, reachable by search and by their permanent URLs.
   Cheapest, and coherent with Milestone 0 as designed. But it makes the site
   unbrowsable and gives a first-time reader nothing.
2. **Authored chapters.** A real essay per topic, written by hand, with answers
   as supporting material underneath. The best reading experience and the
   highest editorial quality — and it makes the milestone a writing project.
3. **A thin spine: stub plus aggregation.** A topic is a slug, a title, and two
   paragraphs of our own framing. Everything below it is published answers.

## Decision

**Three.** A topic page is a stub plus an aggregation, and it is **empty at
launch by design** — it fills as answers are reviewed and published.

Concretely:

- `topics` is a small, hand-written table (order 20 rows, not 2,000).
- A topic holds a slug, a part, a title per language, and a short blurb per
  language. That blurb is human-authored and is the *only* prose on the page
  that is not a published answer.
- The page renders SSR: no LLM in the request, no retrieval, no vector search.
- The join to everything else is **`answers.topic_id`, and nothing else.**

**The corpus is not topicked.** There is deliberately no `unit_topics` table and
no topic column on `units`. Retrieval already does that work, semantically and
without hand labelling.

**Kreeft is a curriculum, not a corpus.** The *Handbook* is used privately, to
decide which questions to ask and in what order. It is not ingested, not cited,
and its table of contents is a seed for our own topic tree rather than a
structure to reproduce.

## Reasoning

**The spine's job is findability, not content.** Its value is that a reader can
see the shape of the subject and that an answer has somewhere to live. That
value is delivered by two paragraphs and a list. Authored chapters would deliver
more, at a cost the project cannot pay right now, and they can be written later
into the same slot without a schema change.

**Not topicking the corpus is the load-bearing half of this decision.** Tagging
CCC paragraphs by topic means hand-labelling 2,865 paragraphs against a taxonomy
that will change, and it duplicates what a retriever does. Worse, it would make
the taxonomy load-bearing for *correctness* rather than only for navigation: a
mislabelled paragraph would become a retrieval failure instead of a cosmetic
one. Topic stays editorial, and its failure mode stays cosmetic.

**Kreeft resolves cleanly because the arguments are not his.** The Twenty
Arguments are overwhelmingly classical — the Five Ways, Anselm, contingency,
Kalām — and each traces to primary literature with a canonical address we can
cite and are permitted to use. Citing the *Handbook* would have been the real
problem: it has no locator scheme the verification gate can check, so it would
be a source the system is structurally unable to verify. The architecture
rejects it before the licence does.

**The seed corpus of questions comes from us.** At launch there are no readers,
so the first hundred questions are authored deliberately against the spine, run
through the pipeline in a batch, reviewed, and published. Reader-submitted
questions are a second stream that arrives later. This is what makes an empty
spine fill up rather than sit empty.

## Consequences

- `topics` lands in `0006` with the query path, not in `0005_corpus`. It has no
  foreign key into the corpus, so the two migrations are genuinely independent.
- `answers` gains a nullable `topic_id`. Nullable because a reader-submitted
  question need not fit the curriculum, and forcing one would corrupt the
  taxonomy to fit traffic.
- The human's ongoing work is **reviewing**, not writing (ADR-006). The gate
  proves a citation resolves and a quotation is exact; it cannot judge whether
  an answer is *good*. That judgement is the reviewer's and does not automate.
- The site launches with content rather than an empty search box.

## Trade-offs

**A thin topic page is a worse reading experience than an authored chapter**, and
will look sparse until enough answers exist under it. Accepted deliberately: an
honest stub that fills is better than a chapter-shaped placeholder, and the slot
for real prose is already there when someone has time to write it.

**A hand-made taxonomy will be wrong at the edges.** Some questions will sit
badly under any of twenty headings. Mitigated by `topic_id` being nullable and
by the taxonomy carrying no retrieval weight — a mis-filed answer is found by
search regardless.

**Twenty topics is a guess.** It is Kreeft's seventeen chapters plus room, and
it is not derived from data because there is no data yet. Revisiting it is a
content edit, not a migration.
