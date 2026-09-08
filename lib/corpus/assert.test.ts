import { describe, expect, it } from "vitest";
import type { CorpusErrata, ParseResult, ParsedUnit } from "@/types/domain";
import { applyRelabels, assertCorpus, detectDefects } from "./assert";

// Invented text throughout — see the note in parsers/katolikus-hu.test.ts.
function unit(paragraph: number, over: Partial<ParsedUnit> = {}): ParsedUnit {
  return {
    locator: `ccc:${paragraph}`,
    paragraph,
    anchor: `K${String(paragraph).padStart(4, "0")}`,
    relabelledFrom: null,
    text: `A ${paragraph}. bekezdés szövege.`,
    role: null,
    page: "kek-001-002",
    ordinal: paragraph,
    ...over,
  };
}

function errata(over: Partial<CorpusErrata> = {}): CorpusErrata {
  return {
    source: "ccc",
    language: "hu",
    expectedUnits: 3,
    relabels: [],
    allowed: [],
    textProbes: [],
    furniture: [],
    ...over,
  };
}

const parsed = (units: ParsedUnit[]): ParseResult => ({
  units,
  defects: [],
  unnumberedPages: [],
  skipped: {},
  anchorSignal: true,
});

describe("check 1 — the two signals agree", () => {
  it("passes a clean run", () => {
    const found = detectDefects([unit(1), unit(2), unit(3)], errata(), true);
    expect(found).toEqual([]);
  });

  it("flags an unprefixed anchor separately from a mistyped one", () => {
    const found = detectDefects(
      [unit(1, { anchor: "1" }), unit(2, { anchor: "K20021" }), unit(3)],
      errata(),
      true
    );

    expect(found.map((d) => [d.locator, d.kind])).toEqual([
      ["ccc:1", "anchor-missing-prefix"],
      ["ccc:2", "anchor-typo"],
    ]);
  });

  it("flags an absent anchor", () => {
    const found = detectDefects(
      [unit(1), unit(2, { anchor: null }), unit(3)],
      errata(),
      true
    );
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe("anchor-absent");
  });
});

describe("check 1 over a source that carries one signal", () => {
  // vatican.va states each paragraph number once — every `<a name=…>` in its
  // body is a footnote — so the agreement check has no second operand. It is
  // SKIPPED rather than passed vacuously: "we did not check this" and "we
  // checked and it was fine" must not arrive in the report looking the same.
  const anchorless = [
    unit(1, { anchor: null }),
    unit(2, { anchor: null }),
    unit(3, { anchor: null }),
  ];

  it("does not report every unit as anchor-absent", () => {
    expect(detectDefects(anchorless, errata(), false)).toEqual([]);
  });

  it("still runs the sequence and the count", () => {
    // ADR-020 skips one check; it does not soften the other two.
    const found = detectDefects(
      [unit(1, { anchor: null }), unit(3, { anchor: null })],
      errata({ expectedUnits: 3 }),
      false
    );

    expect(found.map((d) => d.kind)).toEqual([
      "paragraph-absent",
      "count-mismatch",
    ]);
  });

  it("takes the flag from the parse, not from the errata", () => {
    // It is a fact about the SOURCE, reported by its parser in code. Nothing
    // in the manifest or the errata file can set it.
    const { report } = assertCorpus(
      { ...parsed(anchorless), anchorSignal: false },
      errata()
    );

    expect(report.ok).toBe(true);
    expect(report.unitCount).toBe(3);
  });
});

describe("check 2 — the sequence", () => {
  it("catches a gap", () => {
    const found = detectDefects([unit(1), unit(3)], errata({ expectedUnits: 2 }), true);
    expect(found.map((d) => [d.locator, d.kind])).toEqual([
      ["ccc:2", "paragraph-absent"],
    ]);
  });

  it("catches a duplicate whose two signals AGREE and are both wrong", () => {
    // §211's shape, and the reason this check is not redundant with check 1.
    // Anchor K0002 and printed number 2 corroborate each other perfectly; the
    // paragraph is really §3. Check 1 sees nothing wrong with either unit.
    const units = [unit(1), unit(2), unit(2, { ordinal: 3 })];

    expect(
      detectDefects(units, errata(), true).filter((d) => d.kind.startsWith("anchor"))
    ).toEqual([]);

    const found = detectDefects(units, errata(), true);
    expect(found.map((d) => d.kind)).toEqual(["number-not-increasing"]);
  });
});

describe("check 3 — the count", () => {
  it("fires when a page silently failed to parse", () => {
    const found = detectDefects([unit(1), unit(2)], errata({ expectedUnits: 3 }), true);
    expect(found.map((d) => d.kind)).toContain("count-mismatch");
    expect(found.find((d) => d.kind === "count-mismatch")?.detail).toMatch(
      /parsed 2 units, manifest expects 3/
    );
  });
});

describe("declared relabels", () => {
  const drift = errata({
    expectedUnits: 4,
    relabels: [
      { page: "p", foundLabel: 3, occurrence: 1, correctLocator: "ccc:2" },
      { page: "p", foundLabel: 4, occurrence: 1, correctLocator: "ccc:3" },
    ],
  });

  it("repairs a drift region and records what the source printed", () => {
    // The §146–§148 shape: the source prints 1, 3, 4, 4 — a +1 drift that the
    // duplicate 4 puts back in step.
    const units = applyRelabels(
      [
        unit(1, { page: "p" }),
        unit(3, { page: "p" }),
        unit(4, { page: "p" }),
        unit(4, { page: "p" }),
      ],
      drift
    );

    expect(units.map((u) => u.locator)).toEqual([
      "ccc:1",
      "ccc:2",
      "ccc:3",
      "ccc:4",
    ]);
    expect(units.map((u) => u.relabelledFrom)).toEqual([null, 3, 4, null]);
    expect(units.map((u) => u.ordinal)).toEqual([1, 2, 3, 4]);
  });

  it("leaves the sequence perfect afterwards", () => {
    const units = applyRelabels(
      [unit(1, { page: "p" }), unit(3, { page: "p" }), unit(4, { page: "p" }), unit(4, { page: "p" })],
      drift
    );
    const found = detectDefects(units, drift, true).filter(
      (d) => d.kind === "paragraph-absent" || d.kind === "number-not-increasing"
    );
    expect(found).toEqual([]);
  });

  it("does not re-report a relabelled unit's anchor as a defect", () => {
    // The source printed the wrong number, which the relabel already records.
    // Reporting it again would need a second declaration for one fault.
    const units = applyRelabels(
      [unit(1, { page: "p" }), unit(3, { page: "p" }), unit(4, { page: "p" }), unit(4, { page: "p" })],
      drift
    );
    expect(
      detectDefects(units, drift, true).filter((d) => d.kind.startsWith("anchor"))
    ).toEqual([]);
  });

  it("addresses by occurrence, so only the intended duplicate moves", () => {
    const only2nd = errata({
      expectedUnits: 2,
      relabels: [{ page: "p", foundLabel: 1, occurrence: 2, correctLocator: "ccc:2" }],
    });
    const units = applyRelabels(
      [unit(1, { page: "p" }), unit(1, { page: "p" })],
      only2nd
    );
    expect(units.map((u) => u.locator)).toEqual(["ccc:1", "ccc:2"]);
    expect(units.map((u) => u.relabelledFrom)).toEqual([null, 1]);
  });
});

describe("the gate on the whole run", () => {
  it("passes when every defect is declared", () => {
    const { report } = assertCorpus(
      parsed([unit(1, { anchor: "1" }), unit(2), unit(3)]),
      errata({ allowed: [{ locator: "ccc:1", kind: "anchor-missing-prefix" }] })
    );

    expect(report.ok).toBe(true);
    expect(report.undeclared).toEqual([]);
    expect(report.stale).toEqual([]);
  });

  it("FAILS on an undeclared defect, which is the whole point", () => {
    // A seventh defect appears — the site was re-typeset. The ingest must stop
    // rather than absorb it.
    const { report } = assertCorpus(
      parsed([unit(1, { anchor: "1" }), unit(2, { anchor: null }), unit(3)]),
      errata({ allowed: [{ locator: "ccc:1", kind: "anchor-missing-prefix" }] })
    );

    expect(report.ok).toBe(false);
    expect(report.undeclared.map((d) => [d.locator, d.kind])).toEqual([
      ["ccc:2", "anchor-absent"],
    ]);
  });

  it("does not let a declaration cover a different defect at the same locator", () => {
    const { report } = assertCorpus(
      parsed([unit(1, { anchor: null }), unit(2), unit(3)]),
      errata({ allowed: [{ locator: "ccc:1", kind: "anchor-typo" }] })
    );

    expect(report.ok).toBe(false);
    expect(report.undeclared[0].kind).toBe("anchor-absent");
  });

  it("reports a declaration that no longer fires as stale", () => {
    // The source was fixed upstream. The allowance is now permission the checks
    // do not need, and permission nobody revisits is how a strict check goes soft.
    const { report } = assertCorpus(
      parsed([unit(1), unit(2), unit(3)]),
      errata({ allowed: [{ locator: "ccc:1", kind: "anchor-missing-prefix" }] })
    );

    expect(report.ok).toBe(true);
    expect(report.stale).toEqual([
      { locator: "ccc:1", kind: "anchor-missing-prefix" },
    ]);
  });

  it("carries parser-level defects into the same gate", () => {
    const { report } = assertCorpus(
      {
        units: [unit(1), unit(2), unit(3)],
        defects: [
          {
            kind: "count-mismatch",
            locator: "page:kek-999",
            page: "kek-999",
            detail: "no article-content container",
          },
        ],
        unnumberedPages: [],
        skipped: {},
        anchorSignal: true,
      },
      errata()
    );

    expect(report.ok).toBe(false);
    expect(report.undeclared[0].locator).toBe("page:kek-999");
  });
});
