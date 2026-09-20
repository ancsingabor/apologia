# The corpus

> What is ingested today is in [guide/status.md](guide/status.md); per-document
> counts and hashes are in `corpus/manifest.lock.yaml`. The Summa's shape — 512
> questions, 2,669 articles — is argued in
> [ADR-022](adr/022-asserting-a-source-with-no-sibling-edition.md).
> [`corpus/sources.yaml`](../corpus/sources.yaml) holds the entries whose
> licence status is settled; everything else is a candidate. **Licensing has
> its own page — [licensing.md](licensing.md)** — and this file does not repeat
> it. The CCC additionally carries its fetch locations and its revision,
> settled in [ADR-019](adr/019-ccc-editions.md).

> **TL;DR**
> - A **source** is a work (the Catechism), carrying its authority tier, licence,
>   locator scheme and chunking strategy. A **document** is one fetched text of
>   it in one language and revision.
> - **Chunking is per source**, because the Summa's objection/respondeo
>   structure, the CCC's numbered paragraphs and Scripture's pericopes are three
>   different problems. There is no default chunker.
> - **Licensing is asymmetric where you would not expect.** Magisterial texts
>   are copyrighted in *every* language, so the answer is to display locators
>   and links, not to switch languages.
> - **A licence belongs to the transcription** as well as the work, and
>   **revisions must agree** across languages, or one locator means two texts.
> - Source defects are **declared in errata, never tolerated**, and a source is
>   inventoried by **parsing** it, not by counting one signal.

## What a source is

A source is a *work*, not a file: the Catechism, not "ccc-hu.html". A work has
one identity across its translations and revisions, and it carries the metadata
that governs how it may be used and how much it is worth:

| Field | Why it exists |
|---|---|
| `title`, `author` | the work's own identity; `author` may be null |
| `authority_tier` | how much weight a claim resting on it may be given (ADR-010). Null for `scientific` and `historical` works, deliberately |
| `kind` | what *kind* of work it is — `church_document`, `theological_work`, `bible`, `scientific`, `historical`. (The Postgres enum *type* is named `source_kind`; the field is `kind`.) |
| `license`, `license_note` | whether we may use it, and how (ADR-003); the note carries the posture in prose |
| `locator_scheme` | how a citable unit inside it is addressed (ADR-002) |
| `chunking` | which parsing strategy the pipeline applies |
| `languages` | which translations we ingest |
| `cross_lingual_key` | the unit identifier shared across translations, where one exists |
| `revision` (per document) | which revision of the work this text descends from — see § Revision drift |
| `license` (per document) | the licence of THIS TRANSCRIPTION, where it differs from the work's — see [licensing.md](licensing.md#a-work-and-its-transcription-are-different-facts) ([ADR-021](adr/021-licence-belongs-to-the-transcription.md)) |

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

## Licensing

The whole legal argument — what is ingested, what is displayed, why ingesting
is not redistributing, and how the display posture is enforced in Postgres
rather than by policy — is [licensing.md](licensing.md). It is one page on
purpose: somebody asking "how is this lawful?" should not have to assemble the
answer from three ADRs.

Two consequences land in this file rather than that one, because they shape the
corpus itself:

- **A work and its transcription carry separate licences**, recorded separately
  ([ADR-021](adr/021-licence-belongs-to-the-transcription.md)). `license` sits
  on the source and optionally on the document; a null document licence means
  the work's licence governs. Which text you got is a property of the fetch,
  not of the work — the same move [ADR-019](adr/019-ccc-editions.md) made for
  `revision`.
- **Editorial apparatus is never persisted.** The Index Thomisticus `[28299]`
  reference numbers are used at parse time as a check signal and discarded:
  they are the transcriber's work, not Aquinas's.

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

What the window costs is **availability, not correctness**. While two editions
disagree, the source cannot be ingested in both languages at all —
`assertRevisionsAgree` in `lib/corpus/manifest.ts` refuses the manifest before
a single page is fetched. The way through is the first bullet: ingest whichever
edition carries the current revision, and let an answer in the other language
cite it labelled, which [ADR-014](adr/014-translation-and-quotation.md) already
permits wherever no authoritative text exists in the reader's language. So a
Hungarian answer may end up quoting the English §2267 during such a window.
Serving the superseded Hungarian paragraph *because* it is Hungarian is the one
option that is never right — it is the failure this whole section exists to
prevent, arrived at by a different route.

### Source defects are declared, not tolerated

The current Hungarian CCC is a real web edition with real defects: of its 2,865
paragraphs, eight are broken — four with a malformed or missing anchor, and four
that carry the wrong number. They live in `corpus/errata/ccc-hu.yaml` with their
defect kind and the signal the parser recovers from. Nothing is missing: the
corpus is 2,865 of 2,865.

The file exists less to record the defects than to keep them from eroding the
checks. A parser that meets four known-bad anchors and responds by relaxing its
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
[ADR-019 § Amendment (first)](adr/019-ccc-editions.md#amendment--2026-09-07-first-what-writing-the-parser-found).

## Pending licence resolution

Candidates wanted but not yet manifest entries, with what has to be established
for each, are in [licensing.md § Not yet resolved](licensing.md#not-yet-resolved).
A source whose licence is unresolved does not get an entry in
`corpus/sources.yaml` — that is the rule the file enforces, and it is why there
is no `unknown` value.

## Adding a source

1. Resolve the licence — for the **work** and, where they differ, for the
   **transcription** you intend to fetch ([licensing.md](licensing.md#a-work-and-its-transcription-are-different-facts)). No
   entry without it, at either level.
2. Assign `authority_tier` (or `kind: scientific`) by hand.
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
8. **No migration, and no grant.** A source is data, not schema: the corpus
   tables in `0005_corpus.sql` already hold every source, and the ingest writes
   them with the service client (`scripts/ingest/client.ts`, built on
   `SUPABASE_SERVICE_ROLE_KEY`), which holds `grant all` and bypasses RLS. The
   deny-by-default rule is about `anon` and `authenticated`, and neither is
   anywhere near this path. Reaching for a grant here would put a public role
   on `units.text` and silently dismantle the posture
   [licensing.md](licensing.md#this-is-enforced-in-postgres-not-by-policy)
   rests on.
9. Run the ingest, then update [guide/status.md](guide/status.md) in the same
   PR. `emit` rewrites `corpus/manifest.lock.yaml` for you; status.md is the
   part a human has to remember.
