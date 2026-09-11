# ADR-020 — Asserting a source that carries one signal

Status: **Accepted** · Milestone 1
Constrains [ADR-019](019-ccc-editions.md) (the assert step) and discharges the
cross-lingual identity claim in [ADR-002](002-citable-unit-model.md).

> **TL;DR**
> - **Decision:** The anchor-agreement assertion runs only where a parser reports two signals; a one-signal source (vatican.va) owes compensating checks instead.
> - **Because:** Waiving the check, declaring 2,865 allowances or faking a second signal would each produce a green report that checked nothing.
> - **Cost:** Documents are now asserted differently, so the lock file must record which checks ran.

## Context

ADR-019 chose `vatican.va/archive/ENG0015/` as the English Catechism and left
its completeness unestablished, with an instruction: *the same three assertions
must run over it before it is trusted.* Those assertions are

1. the printed paragraph number and its anchor agree,
2. the sequence is complete and strictly increasing,
3. the final count matches `expected_units`.

The English document has now been inventoried by parsing all 374 pages. It is
**§1–§2865, contiguous, strictly increasing, nothing misnumbered** — a cleaner
text than the Hungarian one, which needed four relabels and four anchor
allowances.

## Problem

**Assertion 1 cannot run.** Every `<a name=…>` in vatican.va's body is a
footnote. The paragraph number is stated once, in the printed text, and there is
nothing to check it against.

This is not a small gap. Assertion 1 is the check that caught §74, §2096, §2213
and §2621 in Hungarian, and the whole design of `katolikus-hu.ts` — printed
number authoritative, anchor as cross-check — is built on having two signals to
compare. Removing it leaves the English document with assertions 2 and 3, and
**assertion 2 is weaker here than it looks**: with no anchor, a paragraph whose
printed number is wrong produces a gap or a regression only if the *sequence*
notices, and a source that silently renumbered a whole region consistently would
pass.

## Alternatives considered

1. **Declare the absence.** Leave `assert.ts` untouched and put 2,865
   `anchor-absent` entries in `corpus/errata/ccc-en.yaml`.
2. **Synthesise a second signal.** The footnote anchors carry base-36 ids that
   increase monotonically across the document (`-28T`, `-28U`, `-28V`). Derive a
   paragraph-adjacent signal from them so assertion 1 has an operand.
3. **Accept two assertions instead of three**, and record that the English
   document is less checked than the Hungarian one.
4. **Skip assertion 1, and pay for it with two checks the Hungarian document
   does not have.**

## Decision

**Four.** `ParseResult` gains an `anchorSignal` flag, reported by the parser as
a fact about its source; `assert.ts` runs assertion 1 only when it is true. A
parser that reports `false` **owes a compensating check**, and
`vatican-intratext` pays twice:

- **per page** — the footnote apparatus must balance. Every reference in the
  body has a definition in the apparatus and vice versa; a page where it does
  not emits `footnote-unbalanced`.
- **per document** — an integration test asserts that the English and Hungarian
  current documents have **equal locator sets**.

## Reasoning

**Option 1 is a wildcard spelled at length.** The errata file's second-order job
is to keep known faults from being used as an argument for loosening the
assertions; 2,865 allowances make it useless at that job, and no reader would
ever notice a 2,866th line appearing.

**Option 2 is the tempting one, and it checks the wrong thing.** The footnote
ids are an independent signal, but they are a signal about the *apparatus*, not
about paragraph numbers. Comparing them to a paragraph number requires inventing
a relationship the source does not state. It would have produced a green
assertion 1 that could not, even in principle, catch the fault assertion 1
exists for — §211's shape, a paragraph carrying a number belonging to another.
An assertion that cannot fail for the right reason is worse than an absent one,
because the report says "checked".

**Option 3 is honest and stops too early.** "Less checked" is true and is not a
plan. The two compensating checks were both available and neither is expensive.

**The per-page check is aimed at the failure this project actually had.** ADR-019
§ Amendment 2 records the footnote apparatus leaking into §1065 and §1666 in
Hungarian while the count was right, the sequence was right, both signals agreed
at every paragraph, and the errata were fully declared. It was found by a query
over the stored text, after the ingest reported success. The body/apparatus cut
is the boundary with the worst record in this codebase, and the English source
gives it three shapes to get wrong — an apparatus rule, a page with no
apparatus at all, and one page in a different HTML dialect. Balancing the
footnotes turns "did the cut move?" into something that fails loudly.

**The per-document check is stronger than the assertion it replaces.** Assertion
1 compares two signals *written by the same typesetter* — which is why §211
defeated it, both being wrong together. Locator-set equality compares two
editions, from two publishers, in two languages, parsed by two different
parsers written months apart. Agreement there is evidence against error that is
genuinely independent, which is the property ADR-019 said agreement between
signals is only a proxy for.

It also converts ADR-002's central claim from an assertion into a test. That
claim — a locator is a cross-lingual identity — has been prose since Milestone 0
and true of one ingested document. `ccc:2267` now resolves in both languages,
and something fails if it ever stops doing so.

## Consequences

- `ParseResult.anchorSignal` is a statement about a **source**, made by its
  parser, in code, under review. It is not a runtime flag and there is nothing
  in the manifest or the errata that can set it. Flipping it to `false` for the
  Hungarian parser to quiet a failure would be visible as exactly what it is.
- `corpus/errata/ccc-en.yaml` declares **two** defects, both `marker-inline`:
  §2077 and §2436 begin inside another paragraph's element and were located
  only because the sequence expected them there. Seven further bare numbers in
  the document match the same shape and are rejected by that rule.
- The English corpus is **2,865 units, the same 2,865 locators as Hungarian**.
- `lib/corpus/discover.ts` became `lib/corpus/discover/` with a registry, for
  the same reason `parsers/` has one. `scripts/ingest/fetch.ts` had been calling
  the Hungarian discoverer by name for every document — invisible while only
  Hungarian could be ingested, and wrong the moment English could.

### What the inventory falsified

ADR-019's pattern held again: **every stage corrected a claim the stage before
it could not test.** Two this time, both about `vatican.va`.

- **It is not one HTML dialect.** `__P85.HTM` was re-saved through a WYSIWYG
  editor — uppercase tags, quoted attributes, `<HR noShade SIZE=1>` where the
  other 373 pages have `<hr size=1 noshade>`. A boundary pattern written against
  the common form finds no body there and **loses §2337–§2359: 23 paragraphs, no
  error.** The count assertion would have reported an off-by-23 pointing at
  nothing in particular. Every boundary in the parser is now matched by
  attribute *presence*, never by order or case — the same fix, in different
  markup, as the Hungarian `name="J1"` attribute-order bug.
- **`&ldquo;` is in the text and the normaliser did not decode it.** Sixteen
  occurrences beside 7,381 `&quot;`. Left alone, `&ldquo;` sits literally in
  permanent stored text and every faithful quotation of those fourteen units
  fails the ADR-017 gate. It is decoded to U+201C and **not** folded onto `"`:
  decoding an entity is not normalising typography.

### The third method step is now a step

ADR-019 § Amendment 2 defined the method as *inventory by parsing; assert over
the parse; then probe the stored text*, and said the probes "are now part of
`integration/`, so the check runs rather than being remembered."

**They were not.** Ingesting English found that out in the only way available:
by running them by hand again. A step that exists as a sentence in an ADR is a
step the next source gets only if somebody re-reads the ADR — and the assertions
it sits beside are automated, so the asymmetry is invisible until the one time
it matters.

`lib/corpus/probes.ts` and `integration/corpus-text-probes.test.ts` close it.
The probes are source-INDEPENDENT — they test the property "a unit's text is
only its text", so a new source inherits them — and what is per-source is which
hits are legitimate, which is declared in `text_probes:` of the errata file
beside the structural defects. Page furniture is the one per-document pattern
(`Jegyzetek`, `IntraText`), matched on word boundaries after a hand-run flagged
§1159 for containing "Previously".

Six hits are declared across the two documents, all of them content: §112–§114
open with the enumerated criteria for interpreting Scripture, and §1059 cites
the Second Council of Lyons as "[1274]".

### What ingesting a second language made visible

The locator sets were identical. The `role` metadata was not: 538 units were
`summary` in English and 610 in Hungarian, agreeing on 488.

Neither parser was wrong about any text. Both inferred the role from
whole-paragraph italics, and the two editions italicise differently. **The role
was being read off typography, in a project whose whole argument is that
structure and typography are different things.**

**Corrected 2026-09-08.** The role now comes from the section label —
*Összefoglalás*, IN BRIEF — which opens each block and runs until the next
heading (`lib/corpus/in-brief.ts`). The irony worth recording: both parsers were
already finding those labels and blanking them as headings, one line before
consulting the italics. The right signal was being detected and discarded.

Fixing it found two defects that nothing else could see, one per language:

- **§267's stored text ended with `3.§ A Mindenható`** — a section heading,
  appended to the paragraph. katolikus.hu typesets that one heading in mixed
  case where every sibling is in capitals (`2.§ AZ ATYA`, `4. § A TEREMTŐ`), so
  neither the bold nor the all-caps rule recognised it. One unit out of 2,865,
  reading as prose, passing every assertion and every text probe. **It shipped.**
  It surfaced because the In Brief block that heading failed to close ran on
  into §268–§271, and the role comparison flagged four units. A centred
  paragraph is now a heading in that source — 195 of them, every one a title or
  a nav link, not one a citable paragraph.
- **katolikus.hu sets one Összefoglalás label outside any `<p>`**, so
  `P_BLOCK` never saw it and §2504–§2513 lost their role. The `Jegyzetek`
  problem in another guise, and the reason that one is worth remembering: a
  label in this source is not reliably an element.

What remains is a real asymmetry, declared rather than papered over: vatican.va
omits the IN BRIEF label entirely on two pages, so §984–§987 and §1971–§1974 are
summaries in Hungarian and ordinary paragraphs in English. Both pages contain
the string "IN BRIEF" zero times and do not italicise those paragraphs either.
The eight are declared in `corpus/errata/ccc-en.yaml` under `summary_omitted`,
and an integration test asserts the divergence is **exactly** that set — 552
Hungarian summaries against 544 English ones, differing in eight places, all
named.

A heuristic could have closed that gap by guessing that a run of italic
paragraphs is probably a summary. That guess is what produced the 122-unit
disagreement this section exists to record.

### `role` belongs in the content hash

`documentContentHash` covered locator and text. Correcting the detection changed
552 Hungarian roles and 544 English ones while leaving the text byte-identical,
so the upsert would have compared hashes, found them equal, reported
"unchanged", and written nothing — the correction computed on every run and
persisted on none.

That is the argument `hash.ts` already makes for including the locator, applied
to a different field: a hash that says "unchanged" about a corpus whose rows
differ is not doing its job. The hash now covers what a unit row holds. It is
still not a hash of the fetched HTML, so ADR-019's point stands.

### Ordered paging, or a quietly short answer

The cross-lingual gate failed on the re-ingest with `2860 locators shared, 5
only in en`, naming five paragraphs nothing was wrong with. The cause was
`.range()` with no `ORDER BY`: Postgres promises nothing about row order, so
re-inserting a document changed the physical order and the pages began to
overlap and skip.

Worth recording because of where else that pattern had been copied — the text
probes read the corpus the same way. Unordered, they would have probed an
arbitrary subset of the units and reported it clean. **An unordered page is not
a flaky test; it is a wrong answer that happens to be right most days.**

## Trade-offs

**Two documents are now asserted differently, and the report must say so.**
Assertion 1 is skipped rather than passed vacuously, so "we did not check this"
and "we checked and it was fine" do not arrive looking the same. A reader
comparing the two `corpus/manifest.lock.yaml` entries should be able to tell
which checks ran.

**Locator-set equality is a two-document check, so it protects nothing about the
first source ingested.** It says the English text agrees with the Hungarian; it
cannot say either agrees with the book. For that there is still only
`expected_units`, which is a number a human read off a printed edition.

**The compensating checks are not the check they replace.** Neither of them
would catch a paragraph in this edition carrying a number that belongs to
another — unless the Hungarian edition numbers it correctly, which is how §146
was found in the other direction. That asymmetry is real, and the honest summary
is that the English document is checked *differently*, with one axis that is
weaker and one that is stronger, rather than checked *as well*.
