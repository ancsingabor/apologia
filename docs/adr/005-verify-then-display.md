# ADR-005 — Verify citations before display; no streaming in v1

Status: **Accepted** · Milestone 0

## Context

The generation step returns an answer plus a list of cited unit ids. Because the
corpus is addressed by canonical locators (ADR-002), those citations can be
checked mechanically: does the locator resolve to a real unit, and was that unit
actually in the context the model was given?

Modern LLM UIs stream tokens as they are produced. It is the expected shape, and
the AI SDK makes it nearly free to implement.

## Problem

Streaming and verification are in direct conflict. A token stream reaches the
reader *before* the answer is complete, so any check that requires the whole
answer — including every citation check — necessarily runs after the reader has
already seen the text. You cannot un-show a fabricated citation.

## Alternatives considered

1. **Stream, verify afterwards, correct in place.** Best perceived latency. The
   reader may see an unverified claim, and a retraction that appears after
   someone has read or screenshotted the text has not prevented the harm.
2. **Two-phase stream** — stream prose with citation markers withheld, resolve
   them at the end. Preserves most of the latency benefit. But the *claims*
   stream unverified, and an ungrounded claim is the actual failure mode; the
   citation is only its evidence.
3. **Generate fully, verify, then display.** Highest perceived latency. The
   reader never sees an unverified claim.

## Decision

**Generate the complete answer, run the verification gate, then display.** No
streaming in v1.

The gate is a hard gate, not a score:

```
every cited id resolves to a real unit          — else the citation is dropped
every cited id was in the supplied context      — else the citation is dropped
every claim-bearing sentence retains ≥1 citation — else the answer fails
```

An answer that cannot satisfy this does not become a draft.

## Reasoning

The product's entire claim is *"every statement is traceable to a real source."*
Streaming makes that claim false for the window between the first token and the
final check — small in seconds, total in effect, because the reader has already
read it.

The cost of this decision is also unusually low here, and that is what makes it
easy. Because answers are drafts reviewed by a human before publication
(ADR-006), the person waiting on generation is the reviewer, not a member of the
public. Readers of the site get a **pre-rendered, already-verified page** and
experience no latency at all. Streaming would optimise a wait that only one
person ever experiences.

Put differently: the curated-library shape converts perceived latency from a
product problem into an internal-tooling preference, and paying it buys a
correctness property that cannot otherwise be had.

## Consequences

- The ask endpoint has a multi-second response time. It needs an explicit
  timeout, bounded retries, and a UI that shows progress honestly.
- Verification runs server-side over a complete answer — simple, synchronous,
  fully unit-testable. It is ordinary deterministic code and is tested as such.
- `citation validity` should read 100% by construction. It is tracked as a
  metric so that a regression is *visible*, not because it is a dial to tune.
- The API contract returns a whole answer, not a stream. Adding streaming later
  is a breaking change to that contract — knowingly accepted.

## Trade-offs

**The reviewer waits.** Several seconds of blank screen with no token feedback.
Genuinely worse ergonomics for the one person who uses the tool most.

**It looks dated.** A reviewer of this repository may read "no streaming" as
naivety rather than as a decision. That is a real cost to the portfolio goal, and
the reason this ADR exists: the choice is defensible, but only if the reasoning
is written down.

**It forecloses a live-answer product** without revisiting the decision. If
Apologia ever offers instant public answers, this ADR and ADR-006 are reopened
together — they are one decision wearing two hats.

**Revisit in Phase 3.** If measurement shows citation validity is genuinely
100% across a large sample, the two-phase stream becomes defensible on evidence
rather than on hope. That is the right order.
