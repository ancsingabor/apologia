# ADR-014 — Translate the explanation, never the quotation

Status: **Accepted** · Milestone 0
Amended by [ADR-017](017-quotation-as-verified-invariant.md) — display posture only.

> The core rule here is unchanged and is not up for revision: answer prose is
> generated in the reader's language, source passages are never machine
> translated, and a quoted span must match its unit's text exactly. What
> ADR-017 revisits is the *conservative display posture* below ("quote minimally
> if at all"), which was chosen when the alternative looked like an unbounded
> rights question. It replaces that sentence with machine-checked limits under
> the Hungarian quotation right. Nothing in the translation rule moves.

## Context

Apologia answers in Hungarian and English. The corpus is unavoidably mixed:

- The **public-domain tier** is overwhelmingly English. The Summa, the Fathers,
  and the older philosophical works have excellent out-of-copyright English
  translations; the Hungarian equivalents are modern and encumbered.
- The **magisterial tier** is copyrighted in *every* language. Libreria Editrice
  Vaticana holds the CCC and the encyclicals and licenses national editions.
  English is not freer than Hungarian here.
- The **Bible** has public-domain options in both: KJV/Douay-Rheims in English,
  and Káldi's 1626 Catholic translation in Hungarian — archaic, but Catholic and
  unambiguously out of copyright.

So a Hungarian reader will frequently get an answer whose best source exists
only in English.

## Problem

The obvious fix is to translate source passages into Hungarian on the fly. It is
cheap, the model is good at it, and it makes every answer feel native.

It also breaks the property the entire architecture exists to provide.

[ADR-002](002-citable-unit-model.md) makes a citation a *verifiable fact*:
`ccc:1730` resolves to a real unit, and the displayed text is what the source
actually says. Machine-translate that passage and the system shows the reader a
sentence **no source ever wrote**, attributed to CCC §1730 regardless — while
the verification gate ([ADR-005](005-verify-then-display.md)) certifies the
English original, not the Hungarian on screen. The gate passes; the displayed
quotation is fabricated.

Three things make this worse than ordinary MT risk:

1. **An authoritative Hungarian text usually already exists.** Machine-translating
   the CCC when the official Hungarian edition is published is not filling a gap —
   it is manufacturing a competing text, and every divergence is a defect a
   reader can find in seconds.
2. **Theological vocabulary is precisely where MT fails.** *Egylényegű*,
   *szubsztancia/akcidens*, concupiscence, ordinary magisterium — terms of art
   with equivalents fixed by centuries of usage. MT yields plausible wrong words,
   and the person asking an apologetics question is the person who notices.
3. **It reintroduces the failure authority tiers exist to prevent**
   ([ADR-010](010-authority-tiers.md)) — presenting something as magisterial
   teaching when it is not. Here the fabrication sits inside quotation marks,
   which is the worst possible place for it.

## Alternatives considered

1. **English-only corpus, translate everything on the fly.** Simplest pipeline,
   single embedding space. Fabricates quotations, and — decisively — does not
   even solve the licensing problem it was proposed for, because the CCC and the
   encyclicals are copyrighted in English too.
2. **Hungarian-only corpus.** No translation problem. Forfeits the public-domain
   tier almost entirely; the corpus becomes too thin to answer well.
3. **Translate quotations but label them as machine-translated.** Honest about
   provenance. Still shows an invented text next to a real locator, and a label
   does not survive a screenshot.
4. **Separate the two kinds of text and treat them differently.**

## Decision

**Translate the explanation. Never translate the quotation.**

The two halves of an answer have different authors and get different rules:

| | Author | Rule |
|---|---|---|
| **Explanation** — the answer prose | us | Generated directly in the reader's language. This is authorship, not translation: the model writes Hungarian from English source context, exactly as a Hungarian scholar reading English sources does. |
| **Quotation** — source passages | the source | Displayed only in a language in which an authoritative text exists. Never machine-translated. |

Per source, the quotation rule resolves as:

- **An official Hungarian text exists** (CCC, encyclicals) → cite the Hungarian
  locator and link to the official text.
- **No Hungarian text exists** (Summa in public-domain English) → show the
  English, **explicitly labelled as English**, wrapped in Hungarian explanation.

### Display posture: cite and link, quote minimally

Full text is ingested for **retrieval**. What is *displayed* is the locator, a
link to the official text, and our own prose — with at most a short attributed
quote.

This is chosen on both correctness and licensing grounds. Embedding text into a
private index is not redistribution; showing a locator, a link and an original
summary requires no licence at all. It is what lets the CCC and the encyclicals
be used properly without a redistribution grant that will never be forthcoming.

## Reasoning

The proposal that prompted this ADR — English-only plus on-the-fly translation —
was right about one thing and wrong about two, and separating them is the whole
decision.

**Right:** for the public-domain tier, English-first is correct and not a
compromise. Those translations are better resourced than anything available in
Hungarian, and taking them removes a real constraint.

**Wrong about licensing:** it was proposed as a way around Hungarian copyright,
but the most important sources are equally restricted in English. The licensing
problem is solved by *not reproducing text*, not by *changing which language's
text we reproduce*.

**Wrong about translation:** it treats an answer as one undifferentiated block
of text to be rendered in the reader's language. It is not. It is our prose
wrapped around someone else's words, and only one of those may be restated.

The resulting rule costs almost nothing to implement — it is a provenance and
display rule, not new infrastructure — and it is strictly more honest than
either pure option. A Hungarian answer citing an English Summa passage, labelled
as such, is what Hungarian theological writing has always looked like.

## Consequences

- `units` carries its language; the renderer must never display a unit in a
  language other than the one it was ingested in.
- Answer pages need a visible provenance affordance for English-sourced
  citations, and `hreflang`-style links to official source texts.
- The CCC is ingested in **both** Hungarian and English. Paragraph numbers are
  identical across translations, so a Hungarian query can retrieve against the
  Hungarian text while an English-only source is still reachable — and the
  same-`§` alignment remains the free cross-lingual key from ADR-002.
- The generation prompt must instruct: answer in the reader's language, and
  reproduce source text **only verbatim in its own language**, never restated
  inside quotation marks.
- A new deterministic check joins the verification gate: **no quoted span may
  differ from the source unit's text.** Like citation validity, this is exact
  string comparison, not a judgement — and it is what mechanically enforces this
  ADR rather than merely asking the model to comply.
- Káldi 1626 becomes a viable public-domain Catholic Hungarian Bible; ADR-003's
  "Hungarian Bible problem" is narrowed, not eliminated.

## Trade-offs

**Hungarian answers will sometimes show English passages.** A genuine
friction for a reader with no English. Partly mitigated because the *explanation*
is always Hungarian and carries the substance; the English appears as evidence,
not as the argument.

**Sparser pages.** Cite-and-link reads as more scholarly and less immediately
satisfying than a page dense with block quotes. Accepted: an answer whose
quotations are trustworthy is worth more than one that is merely fuller.

**Dependence on external links.** Official texts move, and a dead link is a dead
citation. The locator remains valid and resolvable even when the link rots, which
is precisely why the citable-unit model is worth having.

**We forgo a real convenience.** On-the-fly translation would genuinely improve
the reading experience for most users most of the time. This ADR trades average
experience for a guarantee that holds in the worst case — which is the trade the
whole product is built on.
