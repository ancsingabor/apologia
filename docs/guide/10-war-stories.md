# 10 · War stories

## TL;DR

- These bugs share one trait: **none of them crashed**. Each one produced a
  plausible, green, *wrong* result.
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

## The pattern

| Lesson | From |
|---|---|
| A wrong label is worse than a gap. A gap shows up in the sequence, a wrong label only against another edition | 1 |
| Some facts are properties of the *fetch*, not the text, and must be declared and checked before fetching | 2 |
| Two independent editions disagreeing is the best bug detector here | 3 |
| If logic can't be tested, extract it. Don't patch it where it sits | 4 |
| A green summary line is itself a claim, and it can be false | 5 |

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
