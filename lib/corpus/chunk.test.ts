import { describe, expect, it } from "vitest";
import type { ParsedUnit } from "@/types/domain";
import {
  NUMBERED_PARAGRAPH_V1,
  chunkNumberedParagraph,
  chunkerFor,
} from "./chunk";

// Invented text throughout — see the note in parsers/katolikus-hu.test.ts.
const unit = (paragraph: number, over: Partial<ParsedUnit> = {}): ParsedUnit => ({
  locator: `ccc:${paragraph}`,
  paragraph,
  anchor: `K${String(paragraph).padStart(4, "0")}`,
  relabelledFrom: null,
  text: `A ${paragraph}. bekezdés szövege.`,
  role: null,
  page: "kek-001-002",
  ordinal: paragraph,
  ...over,
});

describe("numbered-paragraph@1", () => {
  it("emits one chunk per unit, carrying the unit's text", () => {
    const chunks = chunkNumberedParagraph([unit(1), unit(2)]);

    expect(chunks).toEqual([
      {
        strategy: NUMBERED_PARAGRAPH_V1,
        text: "A 1. bekezdés szövege.",
        unitLocators: ["ccc:1"],
      },
      {
        strategy: NUMBERED_PARAGRAPH_V1,
        text: "A 2. bekezdés szövege.",
        unitLocators: ["ccc:2"],
      },
    ]);
  });

  it("carries the versioned strategy id, not a bare name", () => {
    // A variant is a NEW id sitting beside this one in `chunks.strategy`, so
    // two chunkings can be scored over one corpus. Editing this function's
    // behaviour under the same name would silently invalidate every stored
    // comparison.
    expect(NUMBERED_PARAGRAPH_V1).toBe("numbered-paragraph@1");
  });

  it("references units by locator, so it needs no database", () => {
    const [chunk] = chunkNumberedParagraph([unit(146)]);
    expect(chunk.unitLocators).toEqual(["ccc:146"]);
  });

  it("uses the relabelled locator, not the number the source printed", () => {
    const relabelled = unit(146, { relabelledFrom: 147 });
    expect(chunkNumberedParagraph([relabelled])[0].unitLocators).toEqual([
      "ccc:146",
    ]);
  });

  it("preserves order", () => {
    const chunks = chunkNumberedParagraph([unit(1), unit(2), unit(3)]);
    expect(chunks.map((c) => c.unitLocators[0])).toEqual([
      "ccc:1",
      "ccc:2",
      "ccc:3",
    ]);
  });

  it("handles an empty corpus without inventing a chunk", () => {
    expect(chunkNumberedParagraph([])).toEqual([]);
  });
});

describe("the registry", () => {
  it("resolves the manifest's strategy name", () => {
    expect(chunkerFor("numbered-paragraph")).toBe(chunkNumberedParagraph);
  });

  it("refuses an unregistered strategy rather than falling back", () => {
    // There is deliberately no default (ADR-002): a generic splitter over a
    // source nobody has decided how to chunk destroys the boundaries the
    // corpus is built on, quietly.
    expect(() => chunkerFor("scholastic-article")).toThrow(/no default chunker/i);
  });

  it("names what is registered", () => {
    expect(() => chunkerFor("fixed-window")).toThrow(/numbered-paragraph/);
  });
});
