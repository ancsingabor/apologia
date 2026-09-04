# ADR-017 — Quotation is a verified invariant, not a policy note

Status: **Accepted** · Milestone 1
Supersedes part of [ADR-014](014-translation-and-quotation.md) — display posture only.

> **Legal responsibility.** The reading of Hungarian quotation law below, and the
> thresholds set from it, are the project owner's decision, taken with that
> stated explicitly. This ADR does not constitute legal advice. What the
> engineering contributes is not an opinion on the law — it is the machinery
> that makes compliance *checkable* rather than asserted.

## Context

ADR-014 settled the hard part: translate the explanation, never the quotation.
It then took a deliberately conservative display posture — show the locator, link
to the official edition, "quote minimally if at all" — because the CCC is
copyright Libreria Editrice Vaticana and no licence is forthcoming.

That posture was chosen when the alternative looked like an unbounded rights
question. It is worth revisiting for one reason: Hungarian copyright law contains
an explicit, enumerated **quotation right** (1999. évi LXXVI. törvény 34. §),
which permits anyone to quote a portion of a work without permission, provided
the quotation is faithful to the original, proportionate to the purpose of the
quoting work, and names its source.

## Problem

"Quote minimally if at all" is not a specification. It cannot be implemented,
cannot be tested, and cannot be shown to a rights holder as evidence of anything.
It is a sentence in a document, and sentences in documents drift away from the
code that is supposed to embody them.

Meanwhile the product cost of quoting nothing is real. A reader asking why
suffering exists is told *"the Catechism addresses this at §309"* and handed a
link. The answer is honest but thin, and the sceptic the product is designed for
gets our paraphrase where they wanted the Church's own words.

## Alternatives considered

1. **Keep the conservative posture.** Zero rights exposure, permanently. Also
   permanently weaker answers, and it leaves an enumerated legal right unused
   out of vagueness rather than analysis.
2. **Quote freely under the quotation right, enforced by review.** The human
   reviewer (ADR-006) judges proportionality per answer. But a rule applied by
   tired human judgement across thousands of answers is a rule that is
   sometimes applied.
3. **Quote under explicit, machine-checked limits**, with the thresholds owned
   by the project owner and the checking owned by the code.

## Decision

**Three.** Quotation is permitted, and every condition the statute names is
expressed as a deterministic check that runs *before display*, inside the
existing citation gate (ADR-005).

The statute names three conditions. Each maps to code:

| Requirement | Check |
|---|---|
| faithful to the original | the quoted span is **byte-identical** to `units.text` for its locator |
| source named | every quote carries locator, edition, and a link to the official text |
| proportionate to the purpose | bounded length per quote, per answer, and per source unit |

The proportionality thresholds live in **one exported config object**, not
scattered through the code:

```ts
export const QUOTATION_LIMITS = {
  maxCharsPerQuote:        400,   // one quote never runs long
  maxQuotedRatioOfAnswer: 0.25,   // the answer stays substantially ours
  maxQuotedRatioOfUnit:   0.50,   // never reproduce a whole unit
  requireAttribution:     true,
} as const;
```

A violation is a **gate failure**, handled exactly as a bad citation is: drop the
quotation, or fail the answer. Never silently pass.

## Reasoning

**The exact-match check is not a promise of faithfulness. It is a proof of it.**
This is the unusual position the citable-unit model puts the project in. A
normal publisher asserts that its quotations are accurate; here, a quotation that
differs from the source by a single character cannot reach a reader, because the
comparison against `units.text` runs before render. The condition the statute
cares about most is the one the architecture already enforces for other reasons.

**This is why relaxing the posture is safe here and would not be elsewhere.** A
system that machine-translated quotations, or reconstructed them from a model's
memory, would be quoting words no source ever wrote — under a green check, which
is worse than not checking. ADR-014 refused that, and it stands unchanged. What
changes is only the display of spans that are *provably* the source's own.

**Thresholds are a judgement, so they are owned and visible.** Proportionality is
not a number the statute supplies; someone has to choose it. Putting the numbers
in one config object with an ADR attached means the choice is attributable,
reviewable, and changeable in one place — rather than implied by scattered
`slice(0, 300)` calls that nobody can find later.

**The numbers themselves are deliberately conservative.** 400 characters is a
long sentence or two, well inside what an apologetics work quotes routinely; 25%
of the answer keeps the prose substantially ours, which is the point ADR-014
makes about authorship; 50% of a unit means a short CCC paragraph is never
reproduced whole. They can be tightened without argument. Loosening them is an
ADR amendment.

## Consequences

- `lib/citation/verify.ts` gains quotation checks alongside locator resolution
  and context membership. **They are unit-testable with no API key, no network,
  and no database** — a canned model response and a fixture unit are enough
  (ADR-015).
- Answers may render an exact quotation with attribution and a link. ADR-014's
  translation rule is untouched: a Hungarian answer over an English-only source
  quotes **in English, labelled**, and never in translation.
- The display change is confined to the answer renderer. Nothing about ingestion,
  storage, or retrieval moves — full text was already ingested and already
  service-role only (`0005_corpus`).
- The eval harness gains a slice: answers whose quotations were dropped by the
  gate. A rising number is a prompt regression, not a legal event.

## Trade-offs

**This increases rights exposure from zero to small**, and that is a real change
of posture, taken knowingly by the owner. The mitigation is that every condition
is enforced mechanically and every threshold is one edit away from tightening —
including to zero, which reverts to ADR-014's original posture without a code
change.

**The analysis is jurisdiction-specific.** §34 is Hungarian law and the site is
Hungarian-first, but it is served on the open internet. The English edition is a
separate question under separate law and is not settled here.

**Byte-identity is strict, and will sometimes be too strict.** A curly versus
straight apostrophe, or a non-breaking space, will fail a quotation that is
substantively correct. That is the right direction to fail in, but it means
normalisation at ingestion must be decided carefully and applied identically on
both sides of the comparison — a real source of future bugs, and the reason the
comparison belongs in one tested function rather than inline.
