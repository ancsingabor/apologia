# 10 · War stories

## TL;DR

- These bugs share one trait: **none of them crashed.** Each produced a
  plausible, green, *wrong* result. Story 6 is the exception that proves it —
  the same defect class, made to crash on purpose.
- In this domain the worst bug is **a citation that resolves, verifies
  byte-exactly, and points at the wrong text.** Most of the defences in this
  repo exist because of the stories below.
- **Every story ends in a commit hash.** `git show` it: the messages are
  written to be read, and they are the long version this page summarises.

## 1 · Three paragraphs with the wrong number

The Hungarian Catechism looked one paragraph short — 2,864 of 2,865. §146 was
there, **mislabelled**: the source prints 146–148 as 147–149, and a duplicate
149 puts the sequence back in step. Ingested as printed, `ccc:147` returns
§146's text — the locator resolves, the quotation verifies byte-exactly, the
gate passes. Invisible because the first inventory counted HTML anchors, and
the anchors are where every fault in this source lives. Found by writing a real
parser and checking paragraph by paragraph against vatican.va.

**Fixed** — the printed number is authoritative and the anchor only a
cross-check; `relabels` in `corpus/errata/ccc-hu.yaml`; a strictly-increasing
sequence assertion. `ce8b277`

## 2 · The same paragraph, opposite doctrine

No symptom, and there never would have been one. One Hungarian edition was far
cleaner to scrape — 39 files and a ZIP — and it is the **1997** text, where
§2267 says the death penalty is "not excluded". The English text is the **2018**
revision, where it is "inadmissible". Same locator, opposite teaching,
depending on the reader's language. Every downstream check passes: nothing
after ingestion can see which revision a text descends from. Found by reading
§2267 in each candidate edition *before* choosing a fetch target.

**Fixed** — `revision` is mandatory on every manifest document, the manifest
refuses a multilingual source whose revisions differ, and the easier archive
was rejected (ADR-019). `166a883`

## 3 · A heading inside a paragraph

`ccc:267` read like prose. A section heading, `3.§ A Mindenható`, had been
appended to it, because it was typeset in mixed case where every sibling
heading is in capitals. It passed the count, the sequence, both anchor signals
and every text probe. Found by diffing **roles** between Hungarian and English:
the unclosed block ran on into §268–271, and the two languages disagreed.

**Fixed** — roles come from section labels rather than italics, a centred `<p>`
counts as a heading in that source, and cross-lingual comparison became a
standing technique. `02b633e`

## 4 · `--dryrun` wrote to the database

A typo in the one flag whose job is *don't write* produced a write, with no
warning: the parser accepted unknown flags and ignored them, so `--dryrun` and
`--dry-runn` both meant "go ahead". Coverage was not merely missing, it was
**structurally impossible** — the parser lived in `main.ts`, which calls
`main()` at import, so no test could load it. Found in code review, which
turned up a second, unrecoverable-emit bug of the same shape.

**Fixed** — `scripts/ingest/args.ts` was extracted and made closed: an unknown
flag is fatal, and the likely one is suggested. The fix was the extraction, not
a patch. `79de175`

## 5 · A skip that reported as a pass

CI said `31 passed` for the corpus text probes on every run. CI never has a
corpus: each test printed a warning and `return`ed, and Vitest counts that as a
pass. The probes had **never once run in CI**. The warning went to stderr while
the summary line — the thing people read — said "passed", and the file's own
header warned against exactly this. Found by chasing one stray `⚠ skipped:`
line instead of accepting the green tick; the same bug was then found one file
over.

**Fixed** — `ctx.skip()`, so a skip is counted as a skip. `5a77d04`, `0e3e730`

## 6 · The bug that refused to happen

The first story that is **not** a bug that shipped — the same defect class,
caught as it was written, by a habit the previous five paid for.

The pre-flight stopped dead on its first real run: `RuntimeError: could not
read a pooling mode for intfloat/multilingual-e5-large`. `pooling_mode()`
looked for the older boolean flags, while sentence-transformers v5 reports
`{'pooling_mode': 'mean'}`, a single string — so it found neither and hit its
own `raise`. **That raise is the story.** Pooling decides how token vectors
become one sentence vector (`e5` mean-pools, `bge-m3` takes CLS), and a wrong
guess still yields a 1024-dimensional vector, plausible cosines and a complete
report — measuring *our own mistake* instead of the export.

**Fixed** — read the v3+ key, keep the flags as a fallback, keep the `raise`
with no default. Two further bugs surfaced only because this one stopped the
run: per-query timing that included a model reload, and an export written
without its tokenizer. Then it fired again on `Qwen3`, which pools
`lasttoken`, because decoder-derived models take the final position rather
than averaging. **Three catches from one refusal** — and `return "mean"` would
have looked reasonable, since two of the three candidates do mean-pool.
`f5c8363`

## 7 · A number that looked like evidence

The subtler half of the same run: a **correct implementation of a measurement
that could not measure what it was being read as measuring.**

The pre-flight reported `multilingual-e5-large` at mean cosine **0.992** and
top-3 ranking agreement **60%** — read plainly, "barely moves the vectors but
reorders results four times in ten", which would be a real reason to distrust
quantized serving. The 60% carries **no information at all.** The probes are
the ten gold questions ranked against each other: unrelated questions, which
`e5` packs into a band of 0.76–0.92. Each ordering rests on a
smallest-adjacent-gap of **0.0019** while quantization moves a vector by
**0.0076** — noise four times the signal, for **10 probes out of 10**. Every
part of the code is sound and has hand-computed tests; the *reading* is wrong,
and nothing in the output said so.

**Fixed** — the report now prints the margin and the perturbation beside the
agreement figure, which is never shown alone, and when every probe is
noise-dominated the verdict says the check had no discriminative power rather
than softening it to "partly". The diagnostic needed correcting twice itself:
the rank1→rank3 **span** flattered the test, and switching to the smallest
adjacent gap moved the verdict from 2 of 10 noise-dominated probes to **10 of
10**. `f5c8363`

## 8 · The disk was full, so the model "could not be served"

`✗ BAAI/bge-m3: export failed — OSError: [Errno 28] No space left on device`,
recorded as `serving: none`: a claim about the **model**, manufactured from a
fact about the **disk**. `bge-m3` is fine and exported cleanly minutes later —
the pre-flight had been keeping the ~2 GB fp32 ONNX intermediate for every
candidate, although only the quantized directory is ever loaded. Noticed
because "cannot be served" is a strong claim to derive from `ENOSPC`.

Worse than invisible, it is **self-confirming**. `serving: none` makes
`assert_servable` refuse the candidate permanently, so the model leaves the
slate and the report explains why in a sentence that reads as a real finding.
With `bge-m3` gone the slate would have been two XLM-RoBERTa models, which
`assert_slate_is_informative` would then have refused as unable to compare
pretraining. **A full disk would have silently reshaped the entire bake-off.**

**Fixed** — `MemoryError` and `OSError` now **raise**; only a library's own
export failure counts as a result, and the fp32 intermediate is deleted once
the int8 artifact exists. It proved itself within the hour, when
`embeddinggemma-300m` failed with a **401 gated-repo** error: the old handler
would have filed that as "cannot be served", while the new one raised and made
the real finding actionable — *a gated repo is a licence obligation, not a
technical limit.* `f5c8363`

## The pattern

| Lesson | From |
|---|---|
| A wrong label is worse than a gap. A gap shows up in the sequence, a wrong label only against another edition | 1 |
| Some facts are properties of the *fetch*, not the text, and must be declared and checked before fetching | 2 |
| Two independent editions disagreeing is the best bug detector here | 3 |
| If logic can't be tested, extract it. Don't patch it where it sits | 4 |
| A green summary line is itself a claim, and it can be false | 5 |
| Where a wrong guess would be unrecoverable downstream, refuse to guess. The refusal catches your own bugs, not just the source's | 6 |
| A metric must report its own resolution. A comparison can only detect a difference larger than the noise in what it compares | 7 |
| A catch-all around a measurement turns environment faults into verdicts. Distinguish "it failed" from "we could not run it" | 8 |

## Where this lives in code

| File | What |
|---|---|
| `corpus/errata/ccc-hu.yaml` | the relabels from story 1, each with its reason |
| `lib/corpus/assert.ts` | the sequence and anchor assertions stories 1 and 3 bought |
| `scripts/ingest/args.ts` | story 4's extraction; unknown flags are fatal |
| `harness/apologia_eval/preflight.py` | stories 6–8: the refusals, the margins, the raises |

## Go deeper

- [ADR-019 and its amendments](../adr/019-ccc-editions.md): stories 1–3 in
  full
- [docs/corpus.md § Inventory by parsing](../corpus.md#inventory-by-parsing-not-by-pattern-matching-one-signal)
- [09 · Quality](09-quality.md): the countermeasures, as habits
- `git show <commit>` on any hash above — that is the full record, and this page
  is the summary of it

## Check yourself

<details><summary>Why is a mislabelled paragraph worse than a missing one?</summary>

A missing paragraph breaks the sequence and shows up. A mislabelled one
resolves, verifies and passes every gate while citing the wrong text.
</details>

<details><summary>What do stories 4 and 5 have in common with stories 1–3?</summary>

Every one is a silent success doing the opposite of what was asked. The defence
is the same too: make the check able to fail, then watch it fail.
</details>

<details><summary>Stories 7 and 8 both came from correct code. What was wrong?</summary>

The output claimed more than the check had established — a ranking number with
no resolution, and a verdict about a model derived from a fact about a disk.
Neither is a coding error, and no assertion would have caught either.
</details>
