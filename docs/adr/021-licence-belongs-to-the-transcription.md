# ADR-021 — A licence describes a transcription, not only a work

Status: **Accepted** · Milestone 1
Extends [ADR-003](003-ship-manifests-not-corpus.md) and follows the shape
[ADR-019](019-ccc-editions.md) established for `revision`.

> **TL;DR**
> - **Decision:** A document (the transcription) may carry its own licence, separate from the source's (the work's); null means the work's licence governs.
> - **Because:** The Summa is public domain while its digital transcription's rights are reserved — which text you got is a property of the fetch, not of the work.
> - **Cost:** A null licence can mean either "inherited" or "nobody looked".

## Context

`corpus/sources.yaml` carries `license` on the **source** — the work. That was
right for everything in the manifest until now, because the Catechism's work and
every edition of it are encumbered together: Libreria Editrice Vaticana holds the
text and licenses the national editions, so "the CCC is LEV copyright" is a true
and complete statement about both the work and any file we fetch.

Adding the Summa breaks that. Thomas Aquinas died in 1274 and the Leonine edition
was printed in 1888; there is no live copyright in either, and `license:
public-domain` on the source is simply correct. The text this pipeline actually
fetches is corpusthomisticum.org's, and that page says:

> © Fundación Tomás de Aquino **quoad hanc editionem**. Iura omnia asservantur.

*As to this edition.* Busa's transcription onto magnetic tape and Alarcón's
recension are the claim, not Aquinas's Latin.

## Problem

Both statements are true, they are about different things, and the manifest can
hold only one of them. Whichever is recorded, a reader of the file learns the
author's intent rather than the fact: `public-domain` reads as "this file is
free to redistribute", which is not established, and anything stricter libels a
work that has been out of copyright for seven centuries.

This is not a one-source problem. `docs/corpus.md` already states the general
rule, for the Church Fathers, as prose the schema cannot enforce:

> Originals are public domain; **specific translations may not be**. Resolve per
> translation, never per author.

Every Father, every encyclical with a licensed national edition, and the 1920
Dominican Summa translation will meet it.

## Alternatives considered

1. **A compound value.** `license: public-domain-text-restricted-transcription`,
   detail in `license_note`. No schema change.
2. **Leave the schema; explain in prose.** `license: public-domain` with the
   Fundación's terms written into `license_note`.
3. **Move it to the document**, optional, null meaning "the work's licence
   governs this transcription".
4. **Resolve the licence before touching the schema** — write to the Fundación,
   and design the field once there is an answer.

## Decision

**Three.** `documentSchema` gains `license` and `license_note`, both nullable and
defaulting to null. The source-level fields remain, and remain the statement
about the **work**. A document's licence, when stated, is validated by the same
`UNRESOLVED_LICENCE` rule as the source's: there is still no `unknown`.

The Summa reads:

```yaml
license: public-domain          # the work — Aquinas d. 1274, Leonine 1888
documents:
  - license: transcription-rights-reserved   # Busa/Alarcón, per the Fundación
```

The Catechism's documents keep `license: null`, which is a positive statement —
*the work's licence governs this file too* — and is the ordinary case.

**One consequence is operational rather than declarative.** The Index Thomisticus
reference numbers — the `[28299]` prefixes — are the clearest editorial
contribution on the page, so the parser uses them at parse time as a check signal
and **discards them**. Stored text is Leonine Latin and nothing else.

## Reasoning

**This is `revision`'s argument, applied to a second field.** ADR-019 moved
`revision` onto the document because a work has one identity and does **not**
have one text, and which text you got is a property of the fetch. Copyright has
exactly that structure: a work has one status, its transcriptions do not, and
which transcription you fetched is a property of the fetch. The two fields now
sit on the same row for the same reason.

**Option 1 is a value that has to be parsed by a human.** It encodes a
two-part fact in a string that the schema treats as opaque, so nothing can act
on either half, and the next such source invents its own spelling.

**Option 2 keeps the distinction alive only where nobody enforces it.** The
project's whole method is that a rule stated in prose beside an automated check
is a rule the next source gets only if somebody re-reads the prose — ADR-020 §
"The third method step is now a step" records that failing in this codebase
already, about the text probes. `docs/corpus.md` has been carrying the Fathers
rule as prose since Milestone 0, and the Summa is the first source that would
have quietly violated it.

**Option 4 is the cautious one and it defers the wrong thing.** Writing to
`ealarcon@unav.es` is worth doing and remains open; a reply would settle every
future Thomistic text at once. But it is an answer about one publisher, and the
schema gap is about the shape of the corpus. Blocking a structural fix on
correspondence gets neither.

## Consequences

- `ManifestDocument` gains `license` and `licenseNote`. The two CCC documents set
  them to null; nothing else about them changes.
- The field is a **record, not an enforcement**. Nothing downstream reads it to
  restrict behaviour, and that is honest: the posture it describes — ingest for
  retrieval, display locator and link, never redistribute text (ADR-014) — is
  enforced by the absence of a grant on the corpus tables and by the citation
  display, not by a string in a manifest.
- The Fathers, when they arrive, have somewhere to put the per-translation
  answer that `docs/corpus.md` demands.

## Trade-offs

**We are making a claim, and it should be visible as one.** The posture rests on
the view that a faithful transcription of a public-domain text does not attract
a new copyright in it, which is the ordinary reading in this jurisdiction but is
not a court's. What the manifest now records is the Fundación's claim, stated in
their words, next to our conduct — not an assertion that the claim is void.

**A null document licence is ambiguous between two things**: "the work's licence
governs" and "nobody has looked at this transcription specifically". Only the
first is intended, and the manifest cannot currently tell them apart. That is
tolerable while every source in the file has been inventoried by hand; a corpus
of fifty sources would need `license: inherited` to be written rather than
implied.

**One more field is one more thing to get wrong.** The source-level licence is
now the *less* specific of two, and a reader skimming for "can we use this" will
find it first.
