# ADR-010 — Authority tiers as first-class metadata

Status: **Accepted** · Milestone 0 · **amended 2026-09-30 — `source_kind` is a
type not a column, and the tier is not required where it matters;
§ Amendment at the foot**

> **TL;DR**
> - **Decision:** Every source carries a human-assigned authority tier (1 Scripture and dogma … 5 contemporary apologetics); scientific sources get no tier, only a separate `source_kind`.
> - **Because:** An answer must not present a theologian's opinion as Church teaching — and a physics paper has authority of a different kind, not a lower one.
> - **Cost:** Five buckets simplify finer theological distinctions, and each placement is our judgement, kept in a public manifest so it can be argued with.

## Context

The corpus mixes sources that carry radically different weight. A conciliar
definition, a papal encyclical, Aquinas, a contemporary apologist, and a
scientific paper are all *sources*, and a similarity search treats them
identically: as text with an embedding.

The Catholic tradition itself does not treat them identically. It has an
explicit, well-developed doctrine of the weight attaching to different kinds of
statement.

## Problem

The characteristic failure of a naive RAG system in this domain is **authority
confusion**: retrieving a passage where an apologist argues something, and
presenting it as "the Church teaches…". The answer is grounded — the passage is
real, the citation resolves, the verification gate passes — and it is wrong in
the way that matters most.

No metric built on groundedness catches this, because the answer *is* grounded.
The error is in the weight assigned to the source, and weight is not a property
that embeddings represent.

## Alternatives considered

1. **No tiers; instruct the model in the prompt** to distinguish magisterial
   from theological sources. Costs nothing. Relies on the model inferring
   authority from text it was given, which is exactly the inference that fails.
2. **A binary magisterial / non-magisterial flag.** Simple and catches the worst
   case, but collapses genuine distinctions — a conciliar definition and a papal
   audience are not equivalent.
3. **A graded tier on every source**, carried through retrieval, prompt, and
   display.

## Decision

Every source carries an explicit `authority_tier`, assigned by a human in the
manifest and never inferred:

| Tier | Contains |
|---|---|
| 1 | Scripture; conciliar definitions; defined dogma |
| 2 | Ordinary magisterium — encyclicals, CCC, dicasterial documents |
| 3 | Doctors and Fathers of the Church |
| 4 | Established theologians and philosophers |
| 5 | Contemporary apologetics; secondary literature |
| — | Scientific and historical material: *no* tier; a separate `source_kind` |

The last row is the important one. Scientific sources are **not** ranked on this
scale, because the scale measures ecclesial authority and a physics paper has
none — not low authority, but authority of a different kind. Placing them on one
axis would encode precisely the category error the system exists to avoid
(see ADR-011, H2).

The tier is used in three places, deliberately:

- **Retrieval** — as a filter and a ranking signal, not a hard gate. A tier-5
  source may be the best answer to "what do apologists say about…".
- **Prompt** — each context block is labelled with its tier, so the model is
  told what kind of source it is reading rather than left to guess.
- **Display** — the reader sees the tier. A claim resting on a tier-5 source
  looks different from one resting on tier 1.

`authority correctness` in the eval harness measures whether magisterial claims
rest on tier-1/2 sources.

## Reasoning

The distinction is real, external, and stable — it is not an ontology we
invented for the system's convenience. Encoding it as data rather than as prompt
text makes it inspectable, testable, and enforceable, and it survives a change of
model or prompt.

Assigning tiers by hand, in the manifest, is a deliberate constraint. It is
metadata about *how much a source should be trusted*, which is a judgement, and
a judgement made once per source by a person is worth more than one made per
query by a model.

Surfacing the tier to the reader matters as much as using it internally: it lets
someone evaluate the answer's evidential basis without taking our word for it,
which is the whole posture of the product.

## Consequences

- `sources.kind` (typed by the `source_kind` enum) and `sources.authority_tier`
  are columns on `sources`; the manifest carries both. **See § Amendment for
  what "required" turned out to mean.**
- Context assembly labels every block with its tier.
- The UI needs a way to show tiers without turning every answer into a
  bibliography.
- `authority correctness` becomes measurable, and it is the most domain-specific
  metric in the harness.

## Trade-offs

**The tiers are a simplification of a subtler reality.** The theological notes
distinguishing degrees of magisterial authority are finer than five buckets, and
some documents mix levels within a single text. Accepted: a coarse, honest
scale that is applied consistently beats a fine one applied inconsistently. The
tier is a retrieval and display signal, not a theological pronouncement, and the
docs must say so.

**Assignment is a judgement call that we are making.** Some will disagree with
specific placements. Mitigated by keeping the assignment in a reviewable
manifest in a public repository, where it can be argued with — rather than
buried in a prompt.

**Per-unit variation is not modelled.** The tier attaches to the source, so a
document quoting a lower-authority source inside a higher-authority text is
mis-tiered for that passage. A known limitation; per-unit overrides are the
escape hatch if it proves to matter.

## Amendment — 2026-09-30: `source_kind` is a type, and the tier is not required

Status of this amendment: **Accepted**. Two corrections, found by reading
`0005_corpus.sql` and `lib/corpus/manifest.ts` against the Consequences above.

**`sources.source_kind` is not a column.** `source_kind` is the Postgres *enum
type*; the column it types is `sources.kind`. The same slip was found and fixed
in `docs/architecture.md` during the guide review, and it survived here — which
is the ordinary way of these things: the layer nobody re-reads keeps the copy.

**The tier is nullable, and nothing requires it where it matters.** This ADR
said the two columns are "required" and that "the manifest cannot omit them".
Neither holds for the tier:

| | what it actually enforces |
|---|---|
| `constraint scientific_sources_carry_no_tier` | a `scientific` or `historical` source **must** have `authority_tier is null` |
| the same constraint, other direction | nothing — a `church_document` with a null tier satisfies it |
| `sourceSchema.authority_tier` (Zod) | `.nullable().default(null)` — the manifest may omit the key entirely |

So the schema makes the category error this ADR exists to prevent
*unrepresentable in one direction only*. Ranking a physics paper by ecclesial
authority cannot be expressed. **Ingesting an encyclical with no tier at all
can**, and it would pass the manifest schema, the database, and every assertion
in `assert.ts` — then reach context assembly as a block labelled with no tier,
which is the state the prompt was designed never to see.

The correction is deliberately *not* made here, because it is a code change and
this is a record: what is owed is a check that a tierable kind carries a tier,
and the honest place for it is the manifest schema rather than a second SQL
constraint — the manifest is where ADR-003 already requires a resolved
`license`, and a tier is the same kind of fact, resolved by a human before a
source enters. Recorded in [status.md](../guide/status.md) as owed.

It has not bitten yet only because both ingested sources are tiered by hand and
there are two of them. That is the shape of every defect in
[10 · War stories](../guide/10-war-stories.md): a check that reads as complete
because the corpus is too small to have met its gap.
