# ADR-019 — The CCC editions: revision alignment over file convenience

Status: **Accepted** · Milestone 1 · **amended twice on 2026-09-07 — see the two § Amendment sections at the foot**
· the English side is settled in [ADR-020](020-asserting-a-single-signal-source.md)
Constrains [ADR-004](004-offline-ingestion-cli.md) (the fetch step) and depends on
the cross-lingual alignment claim in [ADR-002](002-citable-unit-model.md).

## Context

`corpus/sources.yaml` has named `ccc` as the Milestone 1 source since Milestone 0,
with `languages: [hu, en]` and `chunking: numbered-paragraph`. It named no fetch
location, and the pipeline's first step is `fetch — content-addressed,
hash-verified`. Nothing could be built until this was settled.

Two Hungarian editions of the Catechism are online, both under the Hungarian
bishops' conference:

- **`archiv.katolikus.hu/kek/`** — 39 HTML files named by starting paragraph
  (`kek00050.html`), plus a whole-corpus `k.zip`.
- **`katolikus.hu/dokumentumtar/kek-<print-page-range>`** — 31 pages, reachable
  from a table of contents at `katolikus.hu/cikk/a-katolikus-egyhaz-katekizmusa`.

For English the practical option is **`vatican.va/archive/ENG0015/`** (IntraText).
The USCCB edition is served through a FlippingBook JavaScript viewer with no
addressable text, so it is not a fetch target at all.

## Problem

On every axis an ingestion pipeline usually cares about, the **archive wins**:

| | archive | modern |
|---|---|---|
| File naming | by starting paragraph — self-describing | by *printed page range*, meaningless to the locator scheme |
| Fetch shape | one `k.zip` — a single hashable artifact | 31 pages discovered from a ToC |
| Markup | flat, stable since ~1999 | template-generated, can be re-themed under us |

Choosing on those grounds is choosing the archive. That is the wrong answer, and
the reason has nothing to do with file layout.

## The finding

The two Hungarian texts are the same translation but **different revisions of the
Catechism**. §2267 is the diagnostic:

| Source | §2267 |
|---|---|
| `archiv.katolikus.hu` | *"…nem zárja ki a halálbüntetéshez folyamodást…"* |
| `katolikus.hu` (modern) | *"…a halálbüntetés megengedhetetlen…"* |

The archive carries the 1997 *editio typica*. The modern site carries the text as
amended by the *Rescriptum ex Audientia SS.mi* of 2 August 2018. **`vatican.va`
English is also 2018-amended** — verified directly against §2267.

## Alternatives considered

1. **`archiv.katolikus.hu` + `vatican.va`.** Best file ergonomics; puts a 1997
   Hungarian text and a 2018 English text under one locator space.
2. **`archiv.katolikus.hu` for both, patching §2267 by hand.** Restores
   agreement at the one paragraph we happened to look at, and asserts nothing
   about the ones we did not.
3. **Modern `katolikus.hu` + `vatican.va`.** Worse file ergonomics; both sides on
   the same revision.

## Decision

**Three.** Hungarian from `katolikus.hu/dokumentumtar/kek-*`, English from
`vatican.va/archive/ENG0015/`, recorded per language in `corpus/sources.yaml`
under `documents:`.

**Revision agreement across languages is a precondition of ingesting a source in
more than one language, not a quality metric.** It is checked before a fetch is
accepted, and a `revision` field is required on every document entry.

## Reasoning

**Option 1 would have made ADR-002's central claim silently false.** That claim is
that a locator is a *cross-lingual identity*: `ccc:2267` is the same citable unit
in Hungarian and in English, and that identity is the alignment key ADR-007's
cross-lingual evaluation is built on. Under option 1 the numbering aligns
perfectly and the *content* contradicts — the Hungarian unit says the death
penalty is not excluded, the English unit says it is inadmissible.

Nothing in the system would catch it. The locator resolves in both languages. The
quotation is byte-exact against whichever unit was retrieved (ADR-017). The
citation gate passes (ADR-005). Groundedness is perfect — the answer *is*
grounded, in a superseded text. **The failure mode is an answer that is correct,
cited, verified, and teaches the opposite doctrine depending on the reader's
language.** For a Hungarian-first apologetics site, on the death penalty, this is
close to the worst available outcome, and it would have arrived through the one
part of the design we had been treating as free.

**"Free alignment key" was doing too much work.** Milestone 0 recorded shared
paragraph numbering as something the project got for nothing. What is actually
free is the *numbering*. Unit identity additionally requires that both documents
descend from the same revision, and that is a property of the fetch, not of the
tradition. This ADR is where that distinction gets paid for.

**Option 2 is the tempting one and is worse than option 1.** Patching the
paragraph we found generalises from a sample of one to a claim about 2,865, and
converts a detectable divergence into an undetectable one. There is no list of
what the 2018 *Rescriptum* and the 1997 *editio typica* touched that we could
diff against; the honest move is to take a text that is already current.

**The encoding difference points the same way, for a smaller reason.** The archive
is ISO-8859-2, served with no charset, and uses ASCII typography — `--` for the
en-dash, `"…"` where Hungarian sets `„…”`. Under the byte-exact quotation
comparison of ADR-017, that would require a normaliser that *guesses* at intended
typography. The modern text is UTF-8 with correct Hungarian punctuation, so
normalisation stays a matter of whitespace and Unicode form rather than
reconstruction.

## Consequences

### The HU parser has a known defect set, and it is the fixture list

All 31 pages were fetched and inventoried. Paragraph ranges are contiguous and
non-overlapping and cover §1–§2865; 2,859 anchors are well-formed. Six are not:

| Locator | Defect | Recoverable from |
|---|---|---|
| §74 | anchor is `name="74"` — missing the `K` prefix | printed number |
| §146 | ~~paragraph absent entirely~~ — **see § Amendment; this was wrong** | a declared relabel |
| §211 | anchor duplicates `K0210`; the printed number is also wrong (`210.`) | ordinal monotonicity |
| §2096 | no anchor; printed number carries no trailing period | printed number |
| §2213 | no anchor; printed number present | printed number |
| §2621 | anchor typo `K26201` | printed number |

**Every defect is in the anchor; none is in the printed number.** So the parser
treats the printed `56.` as authoritative and `name="K0056"` as a cross-check —
the inverse of the obvious design, and load-bearing:

1. Parse both signals per paragraph and **assert they agree**.
2. **Assert the sequence is strictly increasing.** This is what catches §211,
   where both signals are individually plausible and both wrong.
3. **Assert the final count**, against `expected_units` minus declared errata.

Every fault becomes a *declared* entry in `corpus/errata/ccc-hu.yaml` rather than
a silent hole, and any new one fails the ingest. An errata file listing locators
and defect kinds ships under ADR-003 without difficulty — it contains no corpus
text.

### Elsewhere

- `documents.revision` is added to the manifest contract. The DB already models
  this correctly: `documents` is per (source, language) with `content_hash` and
  `is_current`, so a future revision inserts a row rather than mutating one, and
  citations keep resolving against the text they were verified against.
- The HU page list is **discovered from the ToC at fetch time**, not pinned. The
  integrity check that matters is `expected_units` + errata, which is invariant
  under the site re-slugging its pages; a pinned list of print-page ranges would
  break on a re-typeset while proving nothing about the text.
- The English side is **not yet inventoried.** Its revision is verified; its
  completeness and defect set are not, and the same three assertions must run
  over it before it is trusted. It is **ISO-8859-1**, not UTF-8 — see § Amendment.
  **Superseded 2026-09-08:** it has been inventoried by parsing — §1–§2865,
  contiguous, no misnumbering. Only two of the three assertions can run over it,
  because it states each paragraph number once; [ADR-020](020-asserting-a-single-signal-source.md)
  is what pays for the third.
- `documents.edition` is **still unresolved** and is left null rather than
  guessed. Szent István Társulat is the LEV licensee for Hungary, but the modern
  pages credit no publisher and the archive credits its translators only inside
  HTML comments. Naming an edition we have not confirmed is the same error as
  inferring an `authority_tier`.

## Trade-offs

**We took the more fragile fetch target on purpose.** 31 template-generated pages
behind a ToC will break more often than a static ZIP that has not moved since
1999. Accepted: a fetch that breaks loudly is recoverable, and a text that
disagrees with its own translation is not.

**Revision alignment is asserted from one paragraph, not proved.** §2267 is a
diagnostic, not a proof that every 2018 amendment reached both texts. It is the
strongest cheap evidence available — there is no published machine-readable diff
of the *editio typica* against the *Rescriptum* — and it is why `revision` is a
recorded field rather than an assumption: when a real diff becomes possible, this
becomes checkable instead of argued.

**Choosing the current revision means inheriting future ones.** When the CCC is
next amended, the two sources will not update on the same day, and for some
window `ccc:N` will diverge across languages again. The `revision` field is what
makes that a detectable condition; nothing here makes it impossible.

**A live text is a moving hash.** `content_hash` will change on re-typesetting
that alters no words. That is noise the archive would not have produced, and it
is the cost of the choice.


## Amendment — 2026-09-07 (first): what writing the parser found

Writing the parser falsified two things this ADR asserted, and one of them
mattered. Both are corrected here rather than edited away, because the way the
error was found is the argument for the process that found it.

### §146 is not missing. It is misnumbered, and so are §147 and §148.

The defect table above was built by analysing anchors, before a parser existed.
It concluded that §146 was absent and the corpus was 2,864 of 2,865 paragraphs.

Actually parsing the pages shows the paragraph is **present and mislabelled**.
The source prints §146, §147 and §148 as *147*, *148* and *149*, and the
duplicate 149 — which the anchor analysis had recorded as a separate curiosity —
is what puts the sequence back in step. Checked against `vatican.va`, which is
authoritative for the numbering:

| Authoritative | Printed here | Subject |
|---|---|---|
| §145 | 145 ✓ | Hebrews' eulogy of the faith of Israel's ancestors |
| §146 | **147** ✗ | Abraham and the definition of faith in Hebrews 11:1 |
| §147 | **148** ✗ | the Old Testament's witnesses to this faith |
| §148 | **149** ✗ | the Virgin Mary embodies the obedience of faith |
| §149 | 149 ✓ | Mary's faith never wavered |

**Ingested as printed, `ccc:147` would have returned §146's text.** The locator
resolves. The quotation verifies byte-exactly. The citation gate passes. Three
units would have been silently misaddressed — a citation that is provably exact
and points at the wrong paragraph, which is a worse failure than a missing one
and is invisible to everything downstream of ingestion.

§211 was diagnosed correctly but is the same *class*: a paragraph carrying a
number that belongs to another. There the drift is one paragraph long and the
sequence resumes at 212.

So the corpus is **2,865 units — the whole Catechism, nothing missing** — and
`corpus/errata/ccc-hu.yaml` gains a `relabels` section: four declared
corrections, addressed by (page, printed label, occurrence), each with the
authoritative text it was checked against. Declared, never inferred; a parser
that detected drift and shifted labels back would be guessing at intent across a
region whose end it cannot see.

The consequence for the eval harness reverses too: a gold-set question naming
`ccc:146` now resolves correctly, where this ADR said it should fail.

### The reason this is in the ADR rather than a commit message

This ADR added a step to "Adding a source": *inventory the fetched text before
writing the parser.* That step is what produced the wrong answer — an anchor
inventory is not an inventory. The step stands, with its method corrected:

> **Inventory by parsing, not by pattern-matching one signal.** Counting anchors
> tells you which anchors are malformed. It cannot tell you whether the text
> under them is the text those addresses name, because that question is about
> the sequence and the content, not the markup.

Anchor analysis found six faults and mis-classified the most serious one.
Running a parser found the same six plus three more classes it could not have
seen — a paragraph beginning mid-element after `<br><br>`, a number wrapped in
`<font>` inside its anchor, an anchor swallowing the paragraph's opening
quotation mark — and reclassified §146.

### vatican.va is ISO-8859-1

The manifest recorded `encoding: utf-8` for the English document. It is HTML 3.2
served as `charset=iso-8859-1`. Corrected in `corpus/sources.yaml`. Noted because
it is the same class of thing as the Hungarian archive's ISO-8859-2 that this ADR
used as an argument *against* that source — the difference is that vatican.va
declares its charset, so it decodes deterministically rather than by guess.

## Amendment — 2026-09-07 (second): what running the pipeline found

The first amendment recorded what writing the *parser* falsified. Running the
whole pipeline — fetch through upsert — falsified two more things, and the
pattern is now consistent enough to be worth naming: **every stage of this
ingest has corrected a claim the stage before it could not have tested.**

### The table of contents links 32 pages, not 31

This ADR inventoried 31 document pages. Discovery finds 32: the ToC also links
`kek-targymutato`, the subject index — back matter, 1.1 MB of entries of the
form *"Ábel – az igaz 58; – meggyilkolása 401, 2559"*.

It is **not filtered out**, and the restraint is the decision. A slug denylist
would be pinning under another name, maintained against a site this ADR expects
to re-slug. The page is allowed through and yields nothing, by three independent
mechanisms: it carries no `name="K…"` anchors (its numbers are `href` links
*into* the body), its numbers therefore never open a `<p>` or follow a
`<br><br>`, and an index runs alphabetically so the sequence never expects them.
The count still lands on exactly 2,865 with the whole page in scope.

This is the clearest vindication so far of *"the integrity check that matters is
`expected_units` plus the errata"*: discovery is allowed to be approximate
because something downstream is exact.

One consequence for vocabulary. `ParseResult.frontMatterPages` has been renamed
`unnumberedPages`, because the subject index is back matter and the old name
asserted something false about it — in a field that is written into the
committed corpus manifest.

### The footnote apparatus leaked into two units, and no assertion could see it

The parser cut the body at the first footnote definition, then moved the cut
back to the enclosing `<p>` "because the apparatus paragraph opens with its own
visible label". That is true of two of the three ways this source sets the
label, and false of the third:

| Markup | Where the label sits |
|---|---|
| `<p>Jegyzetek: <br> <a name="J1">` | opens the apparatus `<p>` |
| `<hr> <b>Jegyzetek: </b><br> <a name="J1">` | in no `<p>` at all |
| `<hr>Jegyzetek: <p><a name="J1">` | **before** the apparatus `<p>` |

In the third shape the enclosing `<p>` opens *after* the label, so the cut left
`Jegyzetek:` in the body, appended to the last unit on the page. It corrupted
**§1065 and §1666** — two units out of 2,865.

Every assertion passed. The count was 2,865, the sequence was strictly
increasing, both signals agreed at every paragraph, and the errata were fully
declared. The units still read as prose. What caught it was a post-ingest query
over the stored text for markup residue — `text ~ '\[[0-9]+\]'`, `text ~ '<[a-zA-Z/]'`,
`text like '%Jegyzetek%'` — run against the database *after* the ingest reported
success.

So the method note from the first amendment gains a third step:

> **Inventory by parsing; assert over the parse; then probe the stored text.**
> The assertions check that the corpus has the right *shape* — the right number
> of units, in the right order, at the right addresses. They cannot check that a
> unit's text is only its text, because contamination that reads as prose is
> invisible to every structural signal. That question is asked of the database,
> once the rows exist.

Those probes are now part of `integration/`, so the check runs rather than being
remembered.

> **Corrected 2026-09-08: that sentence was false when it was written.** Nothing
> in `integration/` probed unit text; the probes existed as a paragraph in this
> ADR and as shell history. The English ingest paid the cost immediately — the
> same queries were run by hand a second time — which is the failure mode this
> amendment was written to close, reappearing inside the amendment that closed
> it. They are automated now, in `integration/corpus-text-probes.test.ts` over
> `lib/corpus/probes.ts`, and the hits that are legitimate content are declared
> in `text_probes:` of each document's errata file rather than allowlisted in
> the test. Verified by re-introducing this exact defect — `Jegyzetek:` appended
> to §1065 — and watching the check fail.

### Why this keeps happening, and why it is the process working

Three times now a claim in this ADR has been falsified by the next stage down:
anchor analysis mis-classified §146; the parser's `<p>` heuristic mis-cut two
pages; the page inventory missed the subject index. Each was found because the
stage that followed was built to be strict rather than accommodating, and each
would have shipped as a citation that resolves, verifies byte-exactly, and is
wrong.

That is the argument for `assert` being a step rather than a flag, restated
with evidence: the value is not that the assertions are complete — they
demonstrably are not — but that everything they *do* cover fails loudly, which
keeps the residue small enough to find by looking.
