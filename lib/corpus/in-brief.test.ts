import { describe, expect, it } from "vitest";
import { inBriefRanges, isInBrief, type HeadingMark } from "./in-brief";

const label = (at: number): HeadingMark => ({ at, kind: "label" });
const heading = (at: number): HeadingMark => ({ at, kind: "heading" });
const empty = (at: number): HeadingMark => ({ at, kind: "empty" });

describe("where a run of summaries begins and ends", () => {
  it("runs from the label to the next heading", () => {
    expect(inBriefRanges([heading(0), label(10), heading(50)], 100)).toEqual([
      { start: 10, end: 50 },
    ]);
  });

  it("runs to the end of the page when no heading follows", () => {
    // The common shape: an In Brief block closes a section, so the page ends.
    expect(inBriefRanges([label(10)], 100)).toEqual([{ start: 10, end: 100 }]);
  });

  it("is NOT closed by an empty heading", () => {
    // vatican.va emits a heading with no text 683 times, inside blocks
    // included. Closing on one truncates the block and the units after it
    // silently lose their role — which no assertion can see, because the text
    // is unaffected.
    expect(inBriefRanges([label(10), empty(20), heading(50)], 100)).toEqual([
      { start: 10, end: 50 },
    ]);
  });

  it("treats two labels with no heading between them as one run", () => {
    expect(inBriefRanges([label(10), label(20), heading(50)], 100)).toEqual([
      { start: 10, end: 50 },
    ]);
  });

  it("finds several runs on one page", () => {
    // The Hungarian pages are print-page ranges and carry several sections.
    const marks = [label(10), heading(30), label(40), heading(60)];

    expect(inBriefRanges(marks, 100)).toEqual([
      { start: 10, end: 30 },
      { start: 40, end: 60 },
    ]);
  });

  it("finds none on a page with no label", () => {
    expect(inBriefRanges([heading(0), heading(50)], 100)).toEqual([]);
  });

  it("ignores a heading before any label", () => {
    expect(inBriefRanges([heading(5), heading(9), label(10)], 100)).toEqual([
      { start: 10, end: 100 },
    ]);
  });
});

describe("testing a marker against the runs", () => {
  const ranges = inBriefRanges([label(10), heading(50)], 100);

  it("includes a marker inside a run", () => {
    expect(isInBrief(ranges, 20)).toBe(true);
  });

  it("excludes one before it", () => {
    expect(isInBrief(ranges, 5)).toBe(false);
  });

  it("excludes one at the closing heading, which is not part of the run", () => {
    // Half-open: the heading's own offset ends the block. A marker there would
    // be the first paragraph of the NEXT section.
    expect(isInBrief(ranges, 50)).toBe(false);
  });

  it("includes one at the label's own offset", () => {
    // The label is blanked to spaces, so no marker can really sit here — but
    // the boundary is inclusive at the start and the test says which.
    expect(isInBrief(ranges, 10)).toBe(true);
  });

  it("excludes everything when there are no runs", () => {
    expect(isInBrief([], 20)).toBe(false);
  });
});
