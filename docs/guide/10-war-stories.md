# 10 · War stories

## TL;DR

- These bugs share one trait: **none of them crashed**. Each one produced a
  plausible, green, *wrong* result. Story 6 is the exception that proves it —
  the same defect class, made to crash on purpose.
- In this domain the worst bug is **a citation that resolves, verifies
  byte-exactly, and points at the wrong text**. Most of the defences in this
  repo exist because of the stories below.
- The recurring lessons:
  - inventory by *parsing*, not by counting one signal
  - compare two independent editions
  - make the summary line honest
  - extract pure logic until a test can reach it
- Each story links to the commit that fixed it. The history is part of the
  evidence.

## 1 · Three paragraphs with the wrong number

|  |  |
|---|---|
| **Symptom** | None. The Hungarian Catechism appeared to be missing §146, so the corpus looked like 2,864 of 2,865. |
| **Reality** | §146 was there, *mislabelled*. The source prints 146, 147 and 148 as 147, 148 and 149, and a duplicate 149 puts the sequence back in step. Ingested as printed, `ccc:147` would return §146's text: the locator resolves, the quote verifies and the gate passes. |
| **Why invisible** | The first inventory counted HTML anchors, and the anchors are where every fault in this source lives. |
| **Found by** | Writing a real parser, then checking paragraph by paragraph against vatican.va. |
| **What changed** | Printed number is authoritative, the anchor is only a cross-check; `relabels` in `corpus/errata/ccc-hu.yaml`; a strictly-increasing sequence assertion. |
| **Commit** | `ce8b277` |

## 2 · The same paragraph, opposite doctrine

|  |  |
|---|---|
| **Symptom** | None, and there never would have been one. |
| **Reality** | One Hungarian edition was cleaner to scrape: 39 files and a ZIP. It is the 1997 text, where §2267 says the death penalty is "not excluded". The English text is the 2018 revision, where it is "inadmissible". Same locator, opposite teaching, depending on the reader's language. |
| **Why invisible** | Every downstream check passes. Nothing after ingestion can see which revision a text descends from. |
| **Found by** | Reading §2267 in each candidate edition *before* choosing a fetch target. |
| **What changed** | A mandatory `revision` on every manifest document; the manifest refuses a multilingual source whose revisions differ; the easier archive was rejected (ADR-019). |
| **Commit** | `166a883` |

## 3 · A heading inside a paragraph

|  |  |
|---|---|
| **Symptom** | None. `ccc:267` read like prose. |
| **Reality** | A section heading, `3.§ A Mindenható`, had been appended to it, because it was typeset in mixed case where every sibling heading is in capitals. |
| **Why invisible** | It passed the count, the sequence, both anchor signals and every text probe. |
| **Found by** | Diffing *roles* between Hungarian and English. The unclosed block ran into §268–271, and the two languages disagreed. |
| **What changed** | Roles come from section labels, not italics; centred `<p>` counts as a heading in that source; cross-lingual comparison became a standing technique. |
| **Commit** | `02b633e` |

## 4 · `--dryrun` wrote to the database

|  |  |
|---|---|
| **Symptom** | A typo in the one flag whose job is *don't write* produced a write, with no warning. |
| **Reality** | The argument parser accepted unknown flags and ignored them, so `--dryrun` and `--dry-runn` both meant "go ahead". |
| **Why invisible** | The parser lived in `main.ts`, which runs `main()` at import, so no test could import it. Coverage wasn't just missing, it was structurally impossible. |
| **Found by** | Code review, with the same review finding a second, unrecoverable-emit bug of the same shape. |
| **What changed** | `scripts/ingest/args.ts` was extracted and made closed: unknown flags are fatal and the likely one is suggested. The fix was the extraction, not a patch. |
| **Commit** | `79de175` |

## 5 · A skip that reported as a pass

|  |  |
|---|---|
| **Symptom** | CI said `31 passed` for the corpus text probes on every run. |
| **Reality** | CI never has a corpus. Each test printed a warning and `return`ed, and Vitest counts that as a pass. The probes had never once run in CI. |
| **Why invisible** | The warning went to stderr, while the summary line, the thing people read, said "passed". The file's own header warned against exactly this. |
| **Found by** | Chasing one stray `⚠ skipped:` line in CI output instead of accepting the green tick. The same bug was then found one file over. |
| **What changed** | `ctx.skip()`, so skips are counted as skips. |
| **Commits** | `5a77d04`, `0e3e730` |

## 6 · The bug that refused to happen

The first story here that is **not** a bug that shipped. It is the same defect
class as the others, caught at the moment it was written — recorded because the
thing that caught it was a habit the previous five stories paid for.

|  |  |
|---|---|
| **Symptom** | `RuntimeError: could not read a pooling mode for intfloat/multilingual-e5-large.` The servability pre-flight stopped dead on its first real run. |
| **Reality** | `pooling_mode()` inspected the sentence-transformers module list for boolean flags (`pooling_mode_mean_tokens`). Those are an older API; v5 reports `{'pooling_mode': 'mean'}`, a single string. The function found neither flag and fell through to its own `raise`. |
| **Why it would have been invisible** | Pooling decides how token vectors become one sentence vector — `e5` mean-pools, `bge-m3` takes the CLS token. Guess wrong and you still get a 1024-dimensional vector, still get plausible cosines, still get a complete report. The agreement check would have been measuring *our own mistake* instead of the export, and every number after it would have described a different model. |
| **Found by** | The function refusing to guess. It was written with no default, on the explicit grounds that an assumed pooling is unrecoverable downstream — so a wrong implementation surfaced as a loud stop instead of a plausible number. |
| **What changed** | Read the v3+ string key, keep the old boolean flags as a fallback, and keep the `raise` with no default. Two further bugs in the same run were found only because this one stopped it: per-query timing that included a full model reload, and an export directory written without its tokenizer. |
| **Then it did it again** | Two candidates later, `Qwen/Qwen3-Embedding-0.6B` raised the same error — it pools `lasttoken`, a third mode the function did not know. Decoder-derived embedding models take the final position rather than averaging; a `mean` default would have produced perfectly plausible vectors for a model that never uses mean pooling. **Three distinct catches from one refusal.** |
| **Commit** | this PR |

The counterfactual is the point. A `return "mean"` fallback — entirely
reasonable-looking, since two of the three candidates do mean-pool — would have
turned this into story 7 in the older style: green, plausible, and wrong.

## 7 · A number that looked like evidence

Found in the same run as story 6, and the subtler of the two. Story 6 was a
wrong implementation. This is a **correct implementation of a measurement that
could not measure what it was being read as measuring.**

|  |  |
|---|---|
| **Symptom** | The pre-flight reported `multilingual-e5-large`: mean cosine **0.992**, top-3 ranking agreement **60%**. Read plainly: "the int8 export barely moves the vectors, but reorders results four times in ten." That would be a real reason to distrust quantized serving. |
| **Reality** | The 60% carries **no information at all**. The probes are the ten gold questions ranked against each other — unrelated questions, which `e5` packs into a narrow band (measured: 0.76–0.92). Each top-3 ordering rests on a smallest-adjacent-gap of **0.0019** on average, while quantization moves a vector by **0.0076**. The noise is four times the signal, for **10 probes out of 10**. The ordering was never going to survive, whatever the export did. |
| **Why invisible** | Every part of it is sound. The cosine is right, the ranking comparison is right, the code has hand-computed tests. Nothing is broken — the *reading* is wrong, and nothing in the output said so. It is `pending is not a pass` wearing new clothes: a check with no power to discriminate, presented as though it had discriminated. |
| **Found by** | Asking whether 0.992 cosine and 60% ranking agreement could both be true of a healthy export, then measuring the margin distribution instead of assuming the ranking metric was meaningful. |
| **What changed** | The report carries `mean_reference_margin_at_3`, `cosine_perturbation` and `probes_with_margin_below_perturbation`; the agreement number is never printed alone; and when *every* probe is noise-dominated the verdict says the check has no discriminative power rather than softening it to "partly". |
| **Commit** | this PR |

**Two corrections along the way, both worth keeping**, because each made the
finding stronger rather than weaker:

1. The first diagnostic measured the rank1→rank3 **span**. That flatters the
   test: an ordering survives only if every *adjacent* comparison survives, and
   adjacent gaps are far smaller than the span. Switching to the smallest
   adjacent gap moved the verdict from "2 of 10 probes are noise-dominated" to
   **10 of 10**.
2. The verdict first said the disagreement was "partly structural". At 10 of 10
   that is not a hedge, it is the opposite of the truth — a reader would take it
   to mean some of the disagreement was real.

The general form will recur: **a comparison can only detect a difference larger
than the noise in the thing being compared.** A metric that does not report its
own resolution invites exactly one reading — the alarming one. And a diagnostic
*about* resolution has to measure the quantity the metric actually rests on, or
it inherits the same fault one level up.

## 8 · The disk was full, so the model "could not be served"

|  |  |
|---|---|
| **Symptom** | `✗ BAAI/bge-m3: export failed — OSError: [Errno 28] No space left on device`, recorded in the report as `serving: none`, with the line *"this candidate cannot serve a query, so under `assert_servable` it cannot compete."* |
| **Reality** | A claim about the **model**, manufactured from a fact about the **disk**. `bge-m3` is fine; it exported cleanly minutes later. The pre-flight had been keeping the ~2 GB fp32 ONNX intermediate for every candidate, although only the quantized directory is ever loaded or measured. |
| **Why invisible** | It is worse than invisible, it is self-confirming. `serving: none` makes `assert_servable` refuse the candidate permanently, so the model disappears from the slate and the report explains why in a sentence that reads as a real finding. With `bge-m3` gone the slate would have been two XLM-RoBERTa models — which `assert_slate_is_informative` would then have refused as unable to compare pretraining. A full disk would have silently reshaped the entire bake-off. |
| **Found by** | Noticing that "cannot be served" is a strong claim to derive from `ENOSPC`, and checking `df`. |
| **What changed** | `MemoryError` and `OSError` now **raise** instead of being recorded: *"This is NOT a finding about the model — it says nothing about whether it can be served."* Only library exceptions count as a real export failure. Separately, the fp32 intermediate is deleted once the int8 artifact exists. |
| **Commit** | this PR |

It proved itself within the hour: the next candidate, `embeddinggemma-300m`,
failed with a **401 gated-repo** error. Under the old handler that would have
been filed as "cannot be served" and would have removed the only
non-XLM-RoBERTa model from the slate. Under the new one it raised, and the
actual finding — *the repo is gated, which is a licence obligation, not a
technical limit* — was visible enough to act on.

The general form: **`except Exception` around a measurement turns every
environment fault into a result.** Where the result is a verdict about the thing
being measured, that is not robustness, it is fabrication.

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

## Go deeper

- [ADR-019 and its amendments](../adr/019-ccc-editions.md): stories 1–3 in
  full
- [docs/corpus.md § Inventory by parsing](../corpus.md#inventory-by-parsing-not-by-pattern-matching-one-signal)
- [09 · Quality](09-quality.md): the countermeasures, as habits
- `git show <commit>` on any hash above. The commit messages are written to be
  read.

## Check yourself

<details><summary>Why is a mislabelled paragraph worse than a missing one?</summary>

A missing paragraph breaks the sequence and shows up. A mislabelled one
resolves, verifies and passes every gate while citing the wrong text.
</details>

<details><summary>What do stories 4 and 5 have in common with stories 1–3?</summary>

Every one is a silent success doing the opposite of what was asked. The defence
is the same too: make the check able to fail, then watch it fail.
</details>
