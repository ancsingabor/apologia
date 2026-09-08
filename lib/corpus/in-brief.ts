/**
 * Which units are the Catechism's *In Brief* summaries.
 *
 * ── The signal both parsers were reading was the wrong one ──────────────────
 *
 * Both originally inferred this from whole-paragraph italics, and both were
 * wrong in opposite directions: 610 summaries in Hungarian against 538 in
 * English, agreeing on 488. Neither was wrong about any TEXT — they were
 * reading typography.
 *
 * The Hungarian edition italicises §112–§114 and §116–§117, which are the
 * criteria for interpreting Scripture and the senses of Scripture, ordinary
 * paragraphs both. It leaves some of its *Összefoglalás* blocks upright where
 * vatican.va sets the matching IN BRIEF in italics. Two typesetters made
 * different choices about emphasis, twenty years apart, and the corpus was
 * inferring a structural fact from them.
 *
 * The structural fact is the LABEL. Each block of summaries is opened by a
 * heading — *Összefoglalás*, IN BRIEF — and runs until the next heading. Both
 * parsers were already finding those labels and blanking them as headings,
 * which is the specific irony worth recording: the right signal was being
 * detected and discarded one line before the wrong one was consulted.
 *
 * ── Why an empty heading does not close a block ─────────────────────────────
 *
 * vatican.va emits `<p class=MsoNormal><b style='…'></b></p>` — a heading with
 * no text — 683 times, including inside In Brief blocks. Treating one as a
 * boundary truncates the block at its first such artefact, and the units after
 * it silently lose their role. So a block is closed by a heading that says
 * something, and by the end of the page.
 */

export type HeadingMark =
  /** The In Brief label. Opens a run of summaries. */
  | { at: number; kind: "label" }
  /** Any other heading with text. Closes an open run. */
  | { at: number; kind: "heading" }
  /** A heading with no text at all. Closes nothing — see above. */
  | { at: number; kind: "empty" };

export interface Range {
  start: number;
  end: number;
}

/**
 * Turn the headings found on a page into the byte ranges its summaries live in.
 *
 * Offsets are into the heading-blanked region, which preserves every byte
 * position, so a marker found later can be tested against these directly.
 */
export function inBriefRanges(
  marks: readonly HeadingMark[],
  regionEnd: number
): Range[] {
  const ranges: Range[] = [];
  let open: number | null = null;

  for (const mark of marks) {
    if (mark.kind === "empty") continue;
    if (mark.kind === "label") {
      // A second label with no heading between them is one block, not two.
      if (open === null) open = mark.at;
      continue;
    }
    if (open !== null) {
      ranges.push({ start: open, end: mark.at });
      open = null;
    }
  }

  if (open !== null) ranges.push({ start: open, end: regionEnd });
  return ranges;
}

/** Does a marker at this offset fall inside a run of summaries? */
export function isInBrief(ranges: readonly Range[], at: number): boolean {
  return ranges.some((range) => range.start <= at && at < range.end);
}
