import { describe, expect, it } from "vitest";
import type { ParsedUnit } from "@/types/domain";
import {
  NUMBERED_PARAGRAPH_V1,
  SCHOLASTIC_ARTICLE_V1,
  chunkNumberedParagraph,
  chunkScholasticArticle,
  chunkerFor,
} from "./chunk";

// Invented text throughout — see the note in parsers/katolikus-hu.test.ts.
const unit = (paragraph: number, over: Partial<ParsedUnit> = {}): ParsedUnit => ({
  locator: `ccc:${paragraph}`,
  sequence: [paragraph],
  label: String(paragraph),
  anchor: `K${String(paragraph).padStart(4, "0")}`,
  anchorExpected: `K${String(paragraph).padStart(4, "0")}`,
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
    const relabelled = unit(146, { relabelledFrom: "147" });
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
    expect(chunkerFor("scholastic-article")).toBe(chunkScholasticArticle);
  });

  it("refuses an unregistered strategy rather than falling back", () => {
    // There is deliberately no default (ADR-002): a generic splitter over a
    // source nobody has decided how to chunk destroys the boundaries the
    // corpus is built on, quietly.
    expect(() => chunkerFor("pericope")).toThrow(/no default chunker/i);
  });

  it("names what is registered", () => {
    expect(() => chunkerFor("fixed-window")).toThrow(/numbered-paragraph/);
  });
});

describe("scholastic-article@1", () => {
  /** A Summa unit. Invented Latin — see the note at the top of this file. */
  const su = (locator: string, text: string): ParsedUnit => ({
    locator: `summa:${locator}`,
    sequence: [1, 2, 3, 0, 0],
    label: locator,
    anchor: null,
    anchorExpected: null,
    relabelledFrom: null,
    text,
    role: null,
    page: "sth1002",
    ordinal: 1,
  });

  const ARTICLE = [
    su("I.q2.a3.arg1", "Videtur quod nomen fictum non sit."),
    su("I.q2.a3.arg2", "Praeterea, ficta nihil significant."),
    su("I.q2.a3.sc", "Sed contra est quod fictor dicit."),
    su("I.q2.a3.co", "Respondeo dicendum quod exemplum docet."),
    su("I.q2.a3.ad1", "Ad primum dicendum quod fictio iuvat."),
    su("I.q2.a3.ad2", "Ad secundum dicendum quod signum sufficit."),
  ];

  it("puts a whole article in one chunk", () => {
    const [chunk, ...rest] = chunkScholasticArticle(ARTICLE);
    expect(rest).toEqual([]);
    expect(chunk.strategy).toBe(SCHOLASTIC_ARTICLE_V1);
    expect(chunk.unitLocators).toEqual(ARTICLE.map((u) => u.locator));
  });

  it("LABELS every passage with its role", () => {
    // The whole point. An objection states what Aquinas is about to reject, in
    // crisp quotable prose; retrieved unlabelled it cites him for the opposite
    // of his teaching, with every downstream check green.
    const [chunk] = chunkScholasticArticle(ARTICLE);
    expect(chunk.text).toBe(
      [
        "summa:I.q2.a3",
        "[Obiectio 1] Videtur quod nomen fictum non sit.",
        "[Obiectio 2] Praeterea, ficta nihil significant.",
        "[Sed contra] Sed contra est quod fictor dicit.",
        "[Respondeo] Respondeo dicendum quod exemplum docet.",
        "[Ad 1] Ad primum dicendum quod fictio iuvat.",
        "[Ad 2] Ad secundum dicendum quod signum sufficit.",
      ].join("\n")
    );
  });

  it("keeps the objection and the respondeo that answers it together", () => {
    const [chunk] = chunkScholasticArticle(ARTICLE);
    expect(chunk.text).toMatch(/\[Obiectio 1\]/);
    expect(chunk.text).toMatch(/\[Respondeo\]/);
  });

  it("names the article each chunk came from", () => {
    const [chunk] = chunkScholasticArticle(ARTICLE);
    expect(chunk.text.split("\n")[0]).toBe("summa:I.q2.a3");
  });

  it("splits a long article at unit boundaries, never inside one", () => {
    // I-II q. 102 a. 5 is 40,749 characters. One chunk per article regardless
    // would hand an embedding model several times its context.
    const long = [
      su("I-II.q102.a5.arg1", "a".repeat(4000)),
      su("I-II.q102.a5.arg2", "b".repeat(4000)),
      su("I-II.q102.a5.co", "c".repeat(4000)),
    ];
    const chunks = chunkScholasticArticle(long);

    expect(chunks.length).toBeGreaterThan(1);
    // Every unit lands in exactly one chunk, whole.
    expect(chunks.flatMap((c) => c.unitLocators)).toEqual(long.map((u) => u.locator));
    for (const chunk of chunks) {
      expect(chunk.text.split("\n")[0]).toBe("summa:I-II.q102.a5");
    }
  });

  it("gives an over-budget unit its own chunk rather than cutting it", () => {
    // A unit is the atom (ADR-002); splitting one across two chunks would put
    // half a citable passage in each.
    const chunks = chunkScholasticArticle([su("I.q1.a1.co", "x".repeat(9000))]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].unitLocators).toEqual(["summa:I.q1.a1.co"]);
  });

  it("groups by article, so two articles never share a chunk", () => {
    const chunks = chunkScholasticArticle([
      su("I.q2.a3.co", "Respondeo primum."),
      su("I.q2.a4.co", "Respondeo secundum."),
    ]);
    expect(chunks.map((c) => c.unitLocators)).toEqual([
      ["summa:I.q2.a3.co"],
      ["summa:I.q2.a4.co"],
    ]);
  });

  it("labels the roles the Summa carries beyond the usual four", () => {
    const chunks = chunkScholasticArticle([
      su("I.q3.a8.sc1", "Sed contra primum."),
      su("I.q3.a8.sc2", "Sed contra secundum."),
    ]);
    expect(chunks[0].text).toMatch(/\[Sed contra 1\]/);
    expect(chunks[0].text).toMatch(/\[Sed contra 2\]/);

    const adArg = chunkScholasticArticle([su("I.q1.a4.adarg", "Ad argumentum.")]);
    expect(adArg[0].text).toMatch(/\[Ad argumentum\]/);

    const pr = chunkScholasticArticle([su("I.q2.pr", "Circa quae quaeruntur tria.")]);
    expect(pr[0].text).toMatch(/\[Prooemium\]/);
  });

  it("handles the work's own prologue, which has no article above it", () => {
    const chunks = chunkScholasticArticle([su("pr", "Quia Catholicae veritatis.")]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe("summa:pr\n[Prooemium] Quia Catholicae veritatis.");
  });

  it("adds its labels to the CHUNK only, never to the unit", () => {
    // `units.text` is permanent and byte-compared by ADR-017's quotation gate.
    // A label written into a unit would fail every quotation of it.
    const units = [...ARTICLE];
    chunkScholasticArticle(units);
    expect(units[0].text).toBe("Videtur quod nomen fictum non sit.");
  });
});
