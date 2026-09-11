# ADR-018 — The model marks its own claims; the gate does not detect them

Status: **Accepted** · Milestone 1

> **TL;DR**
> - **Decision:** The model returns segments — `claim` with citations, `connective`, `quotation` — and the gate checks that every marked claim cites a unit from the context.
> - **Because:** Code cannot decide which sentences assert something; the model can label them, and mislabelling becomes a measurable behaviour instead of a hidden hole.
> - **Cost:** The guarantee covers *marked* claims only, and structured output may cost some prose quality.

## Context

ADR-005 commits the system to a deterministic citation gate with three checks,
and two of them are straightforward: a cited locator either was or was not in
the supplied context, and a quoted span either is or is not verbatim in its
unit. Both are set membership and string equality.

The third is not. *"Every claim-bearing sentence carries at least one citation"*
requires knowing which sentences make claims.

## Problem

Over free prose, that is not decidable. Deciding whether *"Ez a kérdés régóta
foglalkoztatja a teológusokat"* is a claim requiring a source or a connective
sentence requiring none is a judgement about meaning — precisely the
probabilistic reasoning the gate exists to avoid depending on.

Every mechanical proxy fails in a way that matters:

- **Cite every sentence.** Turns readable prose into a citation salad, and
  invites citing a source for "Two things are worth separating here."
- **Sentence-split and heuristically classify.** A classifier inside the gate,
  with a false-negative rate, silently passing uncited claims. The gate would
  stop being deterministic while still being described as deterministic, which
  is worse than not having it.
- **Ask a judge model.** Explicitly rejected by ADR-005.

## Alternatives considered

1. **Free-prose output plus inline citation markers** (`…a jó hiánya [ccc:309]`),
   parsed out by the gate. Familiar, and the format most models produce
   naturally. But an unmarked sentence is indistinguishable from a connective
   one, so the check degrades to "citations that are present resolve" — it
   cannot see a claim that carries no marker at all, which is the failure worth
   catching.
2. **Heuristic claim detection** over sentence splits. Rejected above.
3. **Structured segments**: the model returns its answer already divided into
   claims, connective prose, and quotations.

## Decision

**Three.** The generator returns `AnswerSegment[]`, each segment one of:

```ts
| { kind: "claim";      text: string; citations: string[] }
| { kind: "connective"; text: string }
| { kind: "quotation";  locator: string; text: string }
```

The gate then checks something it can actually decide: **every segment marked
`claim` carries at least one citation that was in the supplied context.**

## Reasoning

**This converts an undecidable check into a structural one.** The model is asked
to do the thing it is good at — recognising which of its own sentences assert
something — and the gate is left doing the thing code is good at: set membership
and string equality, exhaustively and identically every time.

**It moves the judgement to where it can be measured.** The model may still
mislabel: a claim buried in a `connective` segment passes the gate. But that is
now a *measurable* behaviour of the generator, scored by the eval harness on the
gold set, rather than an invisible hole in a check advertised as deterministic.
The system's honesty about its own limits is the thing being protected — see
`.claude/project.md` § Two kinds of correctness.

**Quotation as its own segment falls out for free**, and pays for itself twice:
it makes the ADR-017 proportionality ratios trivial to compute (quoted
characters over displayed characters, both directly available), and it makes a
quotation structurally incapable of being confused with our own prose — which is
the distinction ADR-014 rests on.

## Consequences

- The generation prompt must specify the segment contract, and the response is
  parsed with a Zod schema before it reaches the gate. A malformed response is a
  generation failure, not a verification failure, and the two are reported
  separately.
- `lib/citation/verify.ts` never sentence-splits, never tokenises, and contains
  no natural-language heuristics. It is pure set and string logic, which is why
  it is exhaustively unit tested with no API key (ADR-015).
- The renderer receives an already-structured answer, so displaying a claim with
  its citations, or a quotation with its attribution, needs no parsing.
- **A new eval metric is implied: claim-marking accuracy** — how often the model
  buries a claim in a connective segment. It has no baseline yet and will get
  one with the first eval run.

## Trade-offs

**A structured response is more constrained than free prose**, and prose quality
may suffer where an answer wants to flow across a claim/connective boundary.
Unknown in size until measured; the eval harness is where that shows up.

**The gate's guarantee is narrower than it first sounds, and this must not be
overstated in user-facing copy.** It proves that every *marked* claim is
supported by a real unit the model was shown. It does not prove the answer
contains no unsupported assertion. Writing "every claim is verified" on the site
would be a stronger promise than the code makes.

**It shifts load onto prompt design.** If the model marks poorly, the gate is
weaker while still reporting green. That risk is why claim-marking accuracy is a
tracked metric rather than an assumption.
