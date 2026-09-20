# Licensing

> **This is the page to read if you want to know how this is lawful.** It is
> the whole argument in one place, so that nobody has to assemble it from three
> ADRs. Per-source licence *facts* are not here — they live in
> [`corpus/sources.yaml`](../corpus/sources.yaml), which is the only place they
> are recorded. This page is the reasoning; that file is the record.

> **TL;DR**
> - The repository ships **manifests and a pipeline, never corpus text**
>   ([ADR-003](adr/003-ship-manifests-not-corpus.md)). Nothing you can clone
>   contains a copyrighted passage.
> - Full text **is** ingested into a private database, and the claim that makes
>   that lawful is **ingesting is not redistributing**. It is the load-bearing
>   one.
> - What a reader is ever shown is a **locator, a link to the official edition,
>   and our own prose** ([ADR-014](adr/014-translation-and-quotation.md)).
> - That display posture is enforced by **Postgres grants and RLS**, not by
>   policy — `units.text` has no grant to any public role.
> - A **work** and its **transcription** have separate licences, recorded
>   separately ([ADR-021](adr/021-licence-belongs-to-the-transcription.md)).
> - **No source is ingested without a resolved licence.** There is no `unknown`.

## The claim, in one paragraph

Apologia holds a private, non-public index of texts it is entitled to read,
built by fetching publicly readable editions. It does not republish them. A
reader of the site is shown a canonical address (*Catechism §1730*), a link to
the publisher's own edition, and prose we wrote ourselves. Where a passage is
quoted at all, it is quoted briefly, exactly, attributed, and only in a
language in which an authoritative text exists. The public repository contains
no corpus text of any kind. Every source carries a licence resolved before
ingestion, for the work and, where they differ, for the particular
transcription fetched.

## Why the corpus is mixed, and why English does not help

A natural assumption — one this project initially made — is that English
sources are broadly free and Hungarian ones broadly encumbered. That is true
for some tiers and **false for the most important one**:

| Tier | English | Hungarian | Asymmetry |
|---|---|---|---|
| Summa, Fathers, philosophy | public-domain translations (~1920) | mostly modern → copyrighted | **Yes — English wins decisively** |
| Bible | KJV, Douay-Rheims, ASV | Káldi 1626 (Catholic, PD); Károli 1908 (Protestant, PD) | Minor — both have PD options |
| **CCC, encyclicals, conciliar documents** | **LEV copyright** | **LEV copyright** | **None** |

Libreria Editrice Vaticana holds the Catechism and the encyclicals and licenses
national editions (USCCB in the United States, Szent István Társulat in
Hungary). **English is not freer than Hungarian for magisterial texts.** Any
plan that proposes going English-only to escape Hungarian copyright does not,
in fact, escape anything for the sources that matter most.

What resolves it is not choosing a different language's text but **not
reproducing text at all**.

## The two claims, which defend different things

They are often collapsed into "we only cite". They should not be — the first is
the one a hostile reader would attack.

### 1. Ingesting is not redistributing

Full source text is fetched, normalised and stored in Postgres, and will be
embedded into a vector index. This is what makes retrieval possible at all;
without it there is no product. The claim is that building a private index over
material one is entitled to read is not publication of that material.

Three things keep that claim narrow and checkable:

- **The public repository ships no text.** It ships `corpus/sources.yaml` (what
  a work is and how it may be used), `corpus/errata/*.yaml` (declared defects,
  by locator), `corpus/manifest.lock.yaml` (locators, hashes, counts,
  provenance) and the pipeline. Not one of those files contains a sentence of
  corpus prose. That is the whole point of ADR-003: an outsider must assemble
  the corpus themselves to reproduce a number, and that cost was accepted
  deliberately.
- **The index is not a distribution channel.** Nothing reads `units.text` except
  server-side code holding the service role.
- **Editorial apparatus is never persisted.** The Index Thomisticus reference
  numbers (`[28299]`) are used at parse time as a check signal and discarded,
  because they are the transcriber's work rather than Aquinas's.

### 2. What is displayed is a locator, a link, and our own prose

The answer's prose is ours, and generating it in Hungarian from English source
context is **authorship, not translation**. The quoted passage is not ours.

- A quotation is shown only in a language in which an authoritative text
  exists — English, clearly labelled, where no Hungarian edition does.
- A quotation is **never machine-translated**. A translated quotation is a
  sentence no source ever wrote, attributed to a real address.
- Quotations stay short and proportionate, and carry attribution
  ([ADR-017](adr/017-quotation-as-verified-invariant.md)).

See [ADR-014](adr/014-translation-and-quotation.md) for the full argument.

## This is enforced in Postgres, not by policy

A display rule that lives only in documentation is a rule that one careless
query breaks. This one does not.

Every corpus table carries **zero grants**, *and* RLS enabled with **no
policies** — two independent layers, and the end state rather than an
unfinished step. `anon` and `authenticated` are revoked by default, including
for future tables, so a table added and forgotten is unreachable rather than
exposed.

The practical consequence: **there is no query a browser can send that returns
`units.text`.** Not a filtered one, not an accidental one. If a page ever seems
to need source text, that is a licensing question to argue against ADR-003 and
ADR-014 first — and the answer is usually "display the locator instead".

See [architecture.md § Privileges](architecture.md#privileges).

## A work and its transcription are different facts

A work has one copyright status. **Its transcriptions do not**, and the two are
recorded separately ([ADR-021](adr/021-licence-belongs-to-the-transcription.md)).

The Catechism hides this, because LEV holds the work and licenses every edition
of it: one statement covers both. The Summa separates them cleanly. Aquinas
died in 1274 and the Leonine edition was printed in 1888, so the work is public
domain beyond argument — while corpusthomisticum.org, whose text the pipeline
actually fetches, reserves rights *quoad hanc editionem* over Busa's
transcription and Alarcón's recension.

So `license` sits on the source (the work) **and** optionally on the document
(the transcription). A null document licence means the work's licence governs.

This is the same move [ADR-019](adr/019-ccc-editions.md) made for `revision`,
for the same reason: which text you got is a property of the fetch, not of the
work. It is also what makes the Church Fathers rule below enforceable rather
than advisory — *resolve per translation, never per author* had been prose
since Milestone 0 with nothing able to check it.

## Where the per-source facts are

[`corpus/sources.yaml`](../corpus/sources.yaml), and nowhere else. Every entry
carries a `license` and a `license_note` stating the posture in prose; a
document may carry its own `license` where the transcription differs.

**`license` is required and must be resolved. There is no `unknown`.** A source
whose status has not been established does not go in that file at all — it
stays in the candidates table below until somebody establishes it. That rule is
what makes "no source is ingested without a resolved licence" true by
construction rather than by diligence.

Which of those sources have actually been ingested is
[guide/status.md](guide/status.md). Licence status and ingest status are
different questions and are deliberately kept in different files.

## Not yet resolved

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

An earlier draft claimed the only public-domain Hungarian option was Károli —
Protestant and archaic — and concluded that licensing would be making a
theological choice. That was wrong: **Káldi György's 1626 translation is
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

Milestone 1 uses (2) and (3); (1) is added when Scripture retrieval in
Hungarian proves necessary. Recorded because it constrains what the product can
be in Hungarian, and should not be settled by whichever file was easiest to
download.

## What this page does not claim

Stating the weak points is part of the argument being credible.

- **It is a posture, not an opinion of counsel.** Nobody qualified has reviewed
  it. It is the reasoning a careful engineer arrived at, written down so it can
  be argued with.
- **"Ingesting is not redistributing" is the claim most worth challenging.** It
  is defended by keeping the index private and shipping no text, not by any
  licence granting it.
- **One open question is recorded and unresolved**: whether corpus text may be
  sent to a *hosted* embedding API. The bake-off starts with local models, which
  do not raise it (ADR-003, ADR-008).
- **A null document licence is ambiguous** — it can mean "the work's licence
  governs" or "nobody looked". ADR-021 records this; a larger corpus would need
  an explicit `inherited` value.

## The code's own licence

MIT, in [LICENSE](../LICENSE). It covers the code and nothing else. The corpus
is not ours to license and is not covered by it.

## Go deeper

- [ADR-003](adr/003-ship-manifests-not-corpus.md) — ship manifests, not the corpus
- [ADR-014](adr/014-translation-and-quotation.md) — translate the explanation, never the quotation
- [ADR-017](adr/017-quotation-as-verified-invariant.md) — quotation as a verified invariant
- [ADR-021](adr/021-licence-belongs-to-the-transcription.md) — a licence belongs to the transcription
- [corpus.md](corpus.md) — what a source is, chunking, revision drift, adding a source
