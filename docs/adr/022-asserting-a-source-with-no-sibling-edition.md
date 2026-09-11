# ADR-022 — Asserting a source with no sibling edition

Status: **Accepted** · Milestone 1
Continues [ADR-020](020-asserting-a-single-signal-source.md); the Summa's entry
into [ADR-002](002-citable-unit-model.md)'s unit model.

> **TL;DR**
> - **Decision:** The Summa, which has no second edition to compare against, is checked against Aquinas's own stated article counts plus per-page and article-shape invariants.
> - **Because:** The prooemium's "quaeruntur quatuor" reaches us by an independent path — the closest a single-language source has to a sibling edition.
> - **Cost:** It checks structure, not text: the Summa is checked differently from the Catechism, not as well.

## Context

ADR-020 ended with the Catechism checked two ways that had nothing to do with
each other: the assertions in `assert.ts`, and **locator-set equality between the
Hungarian and English editions**. It was blunt about which mattered more. The
assertions compare two signals *written by the same typesetter*, which is why
§211 defeated them — an anchor and a printed number that agreed and were both
wrong. The cross-lingual comparison compares two editions, two publishers, two
parsers written months apart, and it is where the real evidence came from.

The Summa is ingested in **Latin only**. `compareLocators` cannot run.

## Problem

At first glance this source needs no help. corpusthomisticum.org states every
unit's address **four times** — the `TITLE` attribute, the text of `SPAN.ref`,
the enclosing `DIV.D`/`DIV.E` headings, and the `A NAME` anchor paired with a
bracketed reference id — and ships a fifth enumeration per page in a JavaScript
`<OPTION>` dropdown. Across all 23,326 units those signals disagree **zero
times**, and the reference ids increase strictly from the first page to the last.

**That is worth much less than it looks, and ADR-020 already said why.** Four
fields emitted by one generator out of one database are one witness. Perfect
agreement is evidence that the *rendering* is sound. It cannot answer the
question §211 exists to pose: does a unit carry the address it belongs to?

So the temptation here is the mirror image of ADR-020's. There the danger was
declaring 2,865 absences; here it is totalling five agreeing signals and calling
the source well checked.

## Alternatives considered

1. **Treat the four-way agreement as sufficient.** It is more corroboration than
   either Catechism document has.
2. **Ingest the 1920 Dominican English translation** to recover the
   cross-lingual gate.
3. **Accept fewer checks**, and record that the Summa is less checked than the
   Catechism.
4. **Find a signal in this source that the transcriber did not write.**

## Decision

**Four**, with one and three's honest parts kept.

Each question's prooemium **states how many articles follow** — *"Et circa hoc
quaeruntur quatuor"* — in Aquinas's prose, in the thirteenth century. The parser
reads that numeral and compares it against the articles it parsed. This reaches
us by a different path from every other signal on the page, and it is the closest
thing a single-language source has to a second edition.

It is supported by two per-page checks and two article-shape invariants:

| Check | What it can catch |
|---|---|
| stated article count vs parsed | a question whose structure is not what its author announced |
| `<OPTION>` enumeration vs body | units lost in extraction — the `__P85` failure |
| `TITLE` vs `SPAN.ref` vs headings | one field of a record disagreeing with another |
| reply index ≤ objections + sed contras | an objection lost in extraction |
| exactly one respondeo per article | a boundary the parser stopped finding |

The numbers, over all 87 pages: **510 question prooemia, 501 stating a countable
numeral, 500 agreeing.** The single disagreement is II-II q. 48, which announces
*quaeruntur quatuor* and which this edition renders as **one** article. Aquinas
and his editors disagree about where the article boundaries fall; both are
faithfully transcribed. It is declared, not repaired — patching either side would
invent a structure neither states.

## Reasoning

**Option 1 is the seductive one and it is ADR-020's error inverted.** ADR-020
rejected synthesising a second signal because the result "could not, even in
principle, catch the fault the assertion exists for". Counting `TITLE` and
`SPAN.ref` as two witnesses has that exact defect: they are one row of one table
rendered twice.

**Option 2 is right and is not this change.** A second language would be
strictly better than anything below. It is also a second parser, a second
licence question, and a translation known to merge and split objections — so the
first thing the gate would report is a disagreement about the corpus rather than
about either text. Worth doing; not worth blocking the Latin on.

**Option 3 is honest and stops too early**, for the same reason ADR-020 gave.
"Less checked" is a description, not a plan, and the prooemium signal was
available and cheap.

**The prooemium check was calibrated against the text, not guessed.** Two
decisions in it are each worth a measurable number on the real corpus, and both
were wrong in the first draft:

- **The numeral must be adjacent to `quaeruntur`.** A pattern allowing words in
  between reads I q. 74 — *"Deinde quaeritur de omnibus **septem** diebus in
  communi. Et quaeruntur **tria**"* — as announcing seven articles. It has three.
  The loose form finds not one question the strict form misses: 501 either way.
  It was pure risk for no reading.
- **Compound numerals are the source's own spelling.** II-II q. 83 says
  *"quaeruntur decem et septem"* and has seventeen articles. Without them the
  question looks like a defect and is not.

**The article-shape invariant is the plan's, corrected by the inventory.** The
plan proposed that every reply answer an objection — `{ad N} ⊆ {arg N}`. It fires
**45 times**, and every one of those articles is correct: a reply may answer the
*sed contra*, and 24 articles have two or three of those. The implemented bound
is objections **plus** sed contras, which nothing in 23,326 units exceeds.

**What is deliberately not asserted** is that replies equal objections. That
fails on 120 of 2,669 articles, because Aquinas regularly answers several
objections in one reply — *"Ad primum et secundum dicendum…"* — and a gap in
reply numbering is the same fact seen sideways. Asserting it would need ~140
errata entries, which is ADR-020's wildcard spelled at length, and each would be
a declaration that a thirteenth-century author wrote his book wrong. Those
counts belong in the emitted manifest, not in `corpus/errata/`.

## Consequences

- **The corpus is 23,326 units: 512 questions (I 1–119, I-II 1–114, II-II 1–189,
  III 1–90, no gaps) and 2,669 articles.** Both totals match the figures in the
  scholarly literature, which is the only corroboration here from outside the
  source — the Summa's counterpart of `expected_units` being a number a human
  read off a printed edition.
- `corpus/errata/summa-la.yaml` declares **20** defects across five kinds:
  2 `respondeo-absent`, 1 `article-count-mismatch`, 11 `article-count-unstated`,
  2 `enumeration-mismatch`, 4 `enumeration-absent`. 0.09% of units.
- The `<OPTION>` check found two real defects in the source's own apparatus, and
  **the body is correct in both**: `sth2098`'s dropdown enumerates I-II q. 95–105
  where the body holds q. 98–105 (q. 95–97 are on `sth2095`), and `sth4001`'s
  omits `III q. 1 pr.`
- `ParseResult` gains **`denseSequence`**, the tree-shaped counterpart of
  `anchorSignal` and subject to the same rule: it is a statement about a source
  made by its parser in code, and declaring `false` is a debt. It gives up the
  *complete* half of `assert.ts` check 2 — a tree has no successor, so gaps
  cannot be enumerated without inventing one — and this ADR is the payment.
- `ParsedUnit.paragraph` became `sequence: number[]`, compared lexicographically,
  plus `label` and `anchorExpected`. The Catechism's `[1730]` is the same check
  it always was.

### What the inventory falsified

ADR-019's pattern held for a third source: **every stage corrected a claim the
stage before it could not test.** Four this time, all mine rather than the
source's.

- **The reply invariant was wrong** (above): 45 false positives.
- **The role vocabulary is seven label shapes, not five.** `ad arg.` (68) and
  `s. c. N` (54) both exist; a parser built for the textbook four drops them.
- **Six questions have no article level at all** — `II-II q. 48 arg. 1`, with no
  `a.` Normalising those to `a. 1` would invent an address the source does not
  state, which ADR-002 forbids in as many words.
- **Ten Secunda Secundae pages write `IIª-IIae,` with a comma**, 2,686 units.
  This source's `__P85`: a subset produced differently, invisible until two
  spellings of one address are compared and the comparison is what notices.

### Two silent-green failures, found by breaking things on purpose

Both were green tests that could not fail for the reason they claimed, and
neither was found by reading the code.

- **Generalising the sequence removed a check nothing was testing.** The old
  `previous = 0` asserted that a dense sequence begins at 1, so a document whose
  first page silently failed to parse reported §1 and §2 absent. The tuple
  version started from an empty sentinel and reported nothing. **245 existing
  tests passed.** Restored, and now pinned.
- **The first test for tree-shaped gap detection was vacuous.** It passed with
  `denseSequence` ignored entirely, because the successor function reads only a
  tuple's first element and both fixture units sat inside one question. It needs
  a **part boundary** — `[1,119,…]` then `[2,1,…]`, where treating the tuple as
  dense emits a phantom `summa:2`.

Every check named in this ADR now has a fixture that makes it fail. Seventeen
mutations were applied to the parser and the assertion step; all seventeen were
caught.

## Trade-offs

**The prooemium check is about STRUCTURE, not text.** It can tell you a question
has the wrong number of articles. It cannot tell you that an article's Latin is
wrong, or that a passage carries an address belonging to another — the §211 fault
itself. The cross-lingual diff could see text; this cannot. The Summa is checked
*differently* from the Catechism, with one axis genuinely independent and one
axis absent, and that is not the same as being checked as well.

**Eleven questions are skipped rather than checked.** Nine use a prooemium
formula with no numeral, two carry no prooemium. They are declared so the skipped
set is bounded and visible, but they are eleven questions whose structure rests
on the transcriber's word alone.

**512 and 2,669 are a human reading a book.** They are the strongest external
corroboration here and they are exactly as strong as `expected_units` has ever
been — which ADR-020 already recorded as the weak point that locator-set
equality did not fix either.

**One language means the ADR-002 claim goes undischarged for this source.**
ADR-020 converted "a locator is a cross-lingual identity" from prose into a test,
for the Catechism. The Summa contributes nothing to that claim and cannot until a
translation is ingested.
