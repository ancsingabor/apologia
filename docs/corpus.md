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

1. Resolve the licence. No entry without it.
2. Assign `authority_tier` (or `source_kind: scientific`) by hand.
3. Define the `locator_scheme` — the addressing the tradition already uses, not
   one we invent. If the work has none, use a synthetic scheme and mark it as
   such: synthetic locators carry none of the stability guarantees.
4. Choose or write a `chunking` strategy that respects the work's own structure.
5. Add fixtures and unit tests for the parser before ingesting at scale.
6. Grant the tables it touches in `supabase/migrations/` — deny-by-default means
   an ungranted table is unreachable.
