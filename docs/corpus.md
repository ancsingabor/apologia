# The corpus

> Status: **Milestone 0**. `corpus/sources.yaml` holds the entries whose licence
> status is settled. Everything else is a candidate, listed at the bottom of this
> file with what still has to be established.

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

## Pending licence resolution

These are wanted and not yet usable. Each needs its status established before it
becomes a manifest entry.

| Candidate | Tier | What has to be resolved |
|---|---|---|
| *Fides et Ratio*, *Humani Generis*, *Providentissimus Deus*, *Dei Verbum*, *Gaudium et Spes* | 2 | Same posture as the CCC (Holy See published). Needs the same explicit note per document, plus a stable fetch location for the Hungarian texts. |
| Church Fathers (Augustine, Athanasius, …) | 3 | Originals are public domain; **specific translations may not be**. Resolve per translation, not per author. |
| Szent István Társulat Bible | 1 | Under live copyright. Almost certainly not ingestible; needs a definite answer, not an assumption. |
| Káldi-Neovulgáta | 1 | Under live copyright. Same. |
| Károli 1908 | 1 | Public domain, but Protestant and archaic. A *licensing* solution to a *domain* problem — see below. |
| Contemporary Hungarian apologetics | 5 | Per work, per author. Some may be usable with permission; asking is cheap. |

### The Hungarian Bible problem

This is the sharpest constraint in the project and it deserves stating plainly
rather than being discovered later.

The Hungarian Bible translations a Catholic reader would expect to see cited are
under copyright. The one that is unambiguously free is Károli — a Protestant
translation from 1908 in archaic Hungarian. Using it because it is *available*
would be letting a licensing constraint make a theological choice, and an
attentive Hungarian Catholic reader would notice immediately.

Three honest options, none of them free:

1. **Cite Scripture in Hungarian from within magisterial documents.** The CCC
   and encyclicals quote Scripture extensively, and those quotations come with
   the document's own licence posture. Limits coverage to what the documents
   happen to quote.
2. **Seek permission** from a Hungarian publisher. Slow, possibly successful,
   and worth attempting because the answer is durable.
3. **Link rather than ingest** — retrieve and cite by reference, sending the
   reader to an official online text instead of reproducing it. Weakens
   retrieval, since unquoted verses are not searchable.

Option 1 is the Milestone 1 posture: Scripture reaches Hungarian readers through
the magisterial documents that quote it. Option 2 is worth pursuing in parallel.
This is recorded here because it constrains what the product can be in
Hungarian, and it is not a decision that should be made silently by whichever
file happened to be easiest to download.

## Adding a source

1. Resolve the licence. No entry without it.
2. Assign `authority_tier` (or `source_kind: scientific`) by hand.
3. Define the `locator_scheme` — the addressing the tradition already uses, not
   one we invent. If the work has none, use a synthetic scheme and mark it as
   such: synthetic locators carry none of the stability guarantees.
4. Choose or write a `chunking` strategy that respects the work's own structure.
5. Add fixtures and unit tests for the parser before ingesting at scale.
6. Grant the tables it touches in `supabase/migrations/` — deny-by-default means
   an ungranted table is unreachable.
