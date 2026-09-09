# The corpus

> Status: **Milestone 1**. Ingested: the Catechism in Hungarian and English
> (2,865 units each) and the **Summa Theologiae in Latin** (23,326 units, 512
> questions, 2,669 articles — [ADR-022](adr/022-asserting-a-source-with-no-sibling-edition.md)).
> `corpus/sources.yaml` holds the entries whose licence
> status is settled. Everything else is a candidate, listed at the bottom of this
> file with what still has to be established. The CCC additionally carries its
> fetch locations and its revision, settled in
> [ADR-019](adr/019-ccc-editions.md).

## What a source is

A source is a *work*, not a file: the Catechism, not "ccc-hu.html". A work has
one identity across its translations and revisions, and it carries the metadata
that governs how it may be used and how much it is worth:

| Field | Why it exists |
|---|---|
| `authority_tier` | how much weight a claim resting on it may be given (ADR-010) |
| `source_kind` | what *kind* of claim it makes — doctrinal, philosophical, scientific, historical |
| `license` | whether we may use it, and how (ADR-003) |
| `locator_scheme` | how a citable unit inside it is addressed (ADR-002) |
| `chunking` | which parsing strategy the pipeline applies |
| `languages` | which translations we ingest |
| `cross_lingual_key` | the unit identifier shared across translations, where one exists |
| `revision` (per document) | which revision of the work this text descends from — see § Revision drift |
| `license` (per document) | the licence of THIS TRANSCRIPTION, where it differs from the work's — see § Licensing the transcription ([ADR-021](adr/021-licence-belongs-to-the-transcription.md)) |

## Why chunking is per-source

The clearest argument against a uniform chunker is the Summa.

Each article runs: **objections** (arguments *against* the position), **sed
contra** (an authority against the objections), **respondeo** (Aquinas's actual
teaching), then **replies** to each objection. A fixed-window chunker cuts
through that structure and produces chunks with no record of which part they
came from.

The consequence is not a subtle quality loss. A chunk drawn from an objection
states a position **Aquinas is about to reject** — often in crisp, quotable,
highly retrievable prose. A system that does not model the role of a passage
will happily retrieve *"it seems that God does not exist"* and cite Aquinas for
it. The text is real, the locator resolves, and every verification check passes.

That failure is invisible to groundedness metrics, and it is why the parser
must carry the *role* of each unit alongside its text.

The Summa is now ingested and the argument survived contact with it, with one
correction: the role is carried on the unit **and repeated in the chunk**.
`scholastic-article@1` groups an article's units into one chunk and labels each
passage in the tradition's own vocabulary — `[Obiectio 2]`, `[Sed contra]`,
`[Respondeo]` — because a chunk is what an embedding model sees, and a role
recorded only in a neighbouring column is a role the retriever cannot use. The
labels go in the chunk text and never in `units.text`, which is permanent and
byte-compared by [ADR-017](adr/017-quotation-as-verified-invariant.md).

The CCC needs a different strategy again (numbered paragraphs, some very short,
with cross-references), and Scripture a third (pericope boundaries, not verse
counts). Hence: no default chunker, a named strategy per source.

## Authority tiers

Defined in [ADR-010](adr/010-authority-tiers.md). In short: tier 1 Scripture and
defined dogma; tier 2 ordinary magisterium; tier 3 Doctors and Fathers; tier 4
established theologians; tier 5 contemporary apologetics.

Scientific and historical works get **no tier** — they take a `source_kind`
instead. This is deliberate. Ecclesial authority is not a scale a physics paper
belongs on; placing it there would encode the exact category error the system
exists to avoid.

## Licensing: where the real asymmetry is

A natural assumption — and one this project initially made — is that English
sources are broadly free and Hungarian ones broadly encumbered. That is true for
some tiers and **false for the most important one**:

| Tier | English | Hungarian | Asymmetry |
|---|---|---|---|
| Summa, Fathers, philosophy | public-domain translations (~1920) | mostly modern → copyrighted | **Yes — English wins decisively** |
| Bible | KJV, Douay-Rheims, ASV | Káldi 1626 (Catholic, PD); Károli 1908 (Protestant, PD) | Minor — both have PD options |
| **CCC, encyclicals, conciliar documents** | **LEV copyright** | **LEV copyright** | **None** |

Libreria Editrice Vaticana holds the Catechism and the encyclicals and licenses
national editions (USCCB in the United States, Szent István Társulat in Hungary).
**English is not freer than Hungarian for magisterial texts.** Any plan that
proposes going English-only to escape Hungarian copyright does not, in fact,
escape anything for the sources that matter most.

What resolves it is not choosing a different language's text but **not
reproducing text at all**: ingest for retrieval, display a locator, a link to the
official edition, and our own prose. See
[ADR-014](adr/014-translation-and-quotation.md).

## Licensing the transcription

A work has one copyright status. **Its transcriptions do not**, and the two are
recorded separately ([ADR-021](adr/021-licence-belongs-to-the-transcription.md)).

The Catechism hid this, because LEV holds the work and licenses every edition of
it: one statement covers both. The Summa separates them cleanly. Aquinas died in
1274 and the Leonine edition was printed in 1888, so the work is public domain
beyond argument — while corpusthomisticum.org, whose text the pipeline actually
fetches, reserves rights *quoad hanc editionem* over Busa's transcription and
Alarcón's recension.

So `license` sits on the source (the work) **and** optionally on the document
(the transcription). A null document licence means the work's licence governs.

This is the same move [ADR-019](adr/019-ccc-editions.md) made for `revision`, for
the same reason: which text you got is a property of the fetch, not of the work.
It is also what makes the Church Fathers rule below enforceable rather than
advisory — *resolve per translation, never per author* had been prose since
Milestone 0 with nothing able to check it.

The posture that follows: ingest for retrieval, **never persist the editorial
apparatus** (the Index Thomisticus `[28299]` reference numbers are used at parse
time as a check signal and discarded), display locator and link
([ADR-014](adr/014-translation-and-quotation.md)).

## Revision drift

A work has one identity across its translations. It does **not** have one text.
Magisterial documents get amended, the amendment reaches each national edition on
its own schedule, and both editions keep publishing under the same paragraph
numbers.

This was found the ordinary way — by comparing two Hungarian editions of the
Catechism that turned out to be two different revisions of it:

| Source | §2267 |
|---|---|
| `archiv.katolikus.hu` | *"…nem zárja ki a halálbüntetéshez folyamodást…"* |
| `katolikus.hu` (current) | *"…a halálbüntetés megengedhetetlen…"* |

The first is the 1997 *editio typica*; the second carries the 2018 *Rescriptum*.
`vatican.va` English is also 2018-amended.

**Why this is a corpus problem and not a data-entry problem.** Pairing the 1997
Hungarian with the 2018 English would leave every locator resolving, every
quotation byte-exact, and the citation gate passing — while `ccc:2267` taught
opposite doctrine depending on the reader's language. The numbering is what the
tradition gives us for free; unit *identity* also requires a shared revision, and
that is a property of the fetch. Nothing downstream can detect its absence, which
is why it is established before ingestion rather than measured after.

So: **`revision` is required on every document entry, and the entries for one
source must agree on it.** Disagreement blocks ingestion of the second language;
it does not downgrade to a warning.

The general shape, which will recur for every encyclical and conciliar document:

- Prefer the **current** revision in every language, even at the cost of a worse
  fetch target. ADR-019 took 31 template-generated pages over a static ZIP for
  exactly this.
- **Never patch one revision with paragraphs from another.** There is no published
  diff of the *editio typica* against the *Rescriptum*, so a hand-patch
  generalises from the paragraph you happened to check and turns a detectable
  divergence into an undetectable one.
- Expect a **window of disagreement** after any future amendment, when one
  edition has updated and the other has not. `revision` makes that a condition
  the pipeline can see; it does not prevent it.

### Source defects are declared, not tolerated

The current Hungarian CCC is a real web edition with real defects: of its 2,865
paragraphs, eight are broken — four with a malformed or missing anchor, and four
that carry the wrong number. They live in `corpus/errata/ccc-hu.yaml` with their
defect kind and the signal the parser recovers from. Nothing is missing: the
corpus is 2,865 of 2,865.

The file exists less to record the defects than to keep them from eroding the
checks. A parser that meets six known-bad anchors and responds by relaxing its
assertions has thrown away the property the corpus is built on. Declared errata
let the assertions stay strict, so an *undeclared* failure is a new defect and
stops the ingest. The errata file holds locators and defect kinds only — no
corpus text, not even the missing paragraph's — so it ships under ADR-003.

One defect is worth naming here, because it shaped the parser. In §211 the anchor
and the printed number *agree with each other* and are *both wrong* (both read
210), so a parser that cross-checks the two signals accepts it and files the
paragraph as a duplicate §210. Only asserting that the sequence strictly
increases catches it. Agreement between two signals is not the same as
correctness, and one paragraph in the Catechism is there to prove it.

### Inventory by parsing, not by pattern-matching one signal

The first pass at the Hungarian CCC counted anchors and concluded that §146 was
missing. It is not: the source prints §146, §147 and §148 as *147*, *148* and
*149*, and a duplicate 149 puts the sequence back in step. Ingested as printed,
`ccc:147` would have returned §146's text under a locator that resolves and a
quotation that verifies byte-exactly.

**A mislabelled paragraph is a worse defect than a missing one**, because a gap
is visible to the sequence check while a wrong label is visible only to someone
who compares the text against an authoritative edition. Counting anchors tells
you which anchors are malformed. It cannot tell you whether the text under an
address is the text that address names — that question is about the sequence and
the content, not the markup.

Hence the rule, and it is why "Adding a source" puts inventory before the parser
and defines inventory as *running one*: pattern-matching a single signal found
six faults and misdiagnosed the most serious. A parser found the same six, three
more structural classes, and the misnumbering. See
[ADR-019 § Amendment](adr/019-ccc-editions.md#amendment--2026-09-07).

## Pending licence resolution

Wanted, not yet manifest entries. Each needs its status established first.

| Candidate | Tier | What has to be resolved |
|---|---|---|
| *Fides et Ratio*, *Humani Generis*, *Providentissimus Deus*, *Dei Verbum*, *Gaudium et Spes* | 2 | Same LEV posture as the CCC. Needs a per-document note and a stable fetch location for both language editions. |
| Church Fathers (Augustine, Athanasius, …) | 3 | Originals are public domain; **specific translations may not be**. Resolve per translation, never per author. |
| Káldi 1626 (Hungarian Catholic Bible) | 1 | Translation dates to 1626 — the text is certainly public domain. Confirm the specific edition/typesetting taken (an 1865-or-earlier printing is safe); modern re-typesettings may carry their own rights. |
| Káldi-Neovulgáta (1997) | 1 | Live copyright. The modern revision, not to be confused with Káldi 1626. Not ingestible without permission. |
| Szent István Társulat Bible | 1 | Live copyright. Same posture — cite and link, do not reproduce. |
| Contemporary Hungarian apologetics | 5 | Per work, per author. Some may be usable with permission; asking is cheap and the answer is durable. |

### The Hungarian Bible question

Narrower than it first appears, but not gone.

An earlier draft of this document claimed the only public-domain Hungarian option
was Károli — Protestant and archaic — and concluded that licensing would be
making a theological choice. That was wrong: **Káldi György's 1626 translation is
Catholic and out of copyright.** It is the Hungarian counterpart of the
Douay-Rheims: archaic, but doctrinally unproblematic and free.

So the real constraint is register, not licensing. Káldi's Hungarian is 17th
century and will read as remote to a modern enquirer, in the way the
Douay-Rheims does in English. Three postures, and they compose:

1. **Káldi 1626 as the ingestible Hungarian Scripture text** — free, Catholic,
   searchable. Archaic phrasing is a real cost to readability.
2. **Cite modern translations without reproducing them** — locator plus a link
   to an official online edition. Costs nothing legally, and lets a reader reach
   the phrasing they actually use.
3. **Scripture reached through the magisterial documents that quote it** — the
   CCC and the encyclicals quote extensively, and those quotations arrive with
   the document's own posture.

Milestone 1 uses (2) and (3); (1) is added when Scripture retrieval in Hungarian
proves necessary. Recorded here because it constrains what the product can be in
Hungarian, and should not be settled by whichever file was easiest to download.

## Adding a source

1. Resolve the licence — for the **work** and, where they differ, for the
   **transcription** you intend to fetch (§ Licensing the transcription). No
   entry without it, at either level.
2. Assign `authority_tier` (or `source_kind: scientific`) by hand.
3. Define the `locator_scheme` — the addressing the tradition already uses, not
   one we invent. If the work has none, use a synthetic scheme and mark it as
   such: synthetic locators carry none of the stability guarantees.
4. Establish the `revision` of every language you intend to ingest, and check
   they agree (§ Revision drift). For a single-language source this is a note;
   for a multilingual one it is a precondition.
5. Choose or write a `chunking` strategy that respects the work's own structure.
6. Inventory the fetched text before writing the parser — **by parsing it**, not
   by pattern-matching one signal (§ Inventory by parsing). Count the units and
   declare what you find in `corpus/errata/`. Discovering defects from failing
   assertions later is how assertions get loosened.
7. Add fixtures and unit tests for the parser before ingesting at scale — the
   errata are the fixture list.
8. Grant the tables it touches in `supabase/migrations/` — deny-by-default means
   an ungranted table is unreachable.
