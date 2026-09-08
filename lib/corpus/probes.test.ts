import { describe, expect, it } from "vitest";
import { emptyErrata } from "./errata";
import {
  TEXT_PROBES,
  furnitureProbe,
  probeFailure,
  probeUnits,
  staleDeclarations,
  undeclaredHits,
} from "./probes";
import type { CorpusErrata } from "@/types/domain";

// Invented text throughout — see the note in parsers/katolikus-hu.test.ts.
const unit = (locator: string, text: string) => ({ locator, text });

function errata(over: Partial<CorpusErrata> = {}): CorpusErrata {
  return { ...emptyErrata("ccc", "hu", 3), ...over };
}

describe("what the probes catch", () => {
  // Each of these is a real failure this project has had or nearly had, and
  // none of them is visible to any assertion in assert.ts: the count, the
  // sequence and the anchors are all still right when they happen.
  const cases: [string, string, string][] = [
    ["markup-residue", "A tag survived <em>normalisation</em>.", "an HTML tag"],
    ["entity-residue", "He said &ldquo;something&rdquo;.", "an entity"],
    ["bracket-footnote", "A leaked footnote marker[64] mid-sentence.", "a [n] marker"],
    ["empty-text", "   ", "a unit with no text"],
    ["double-space", "A tag became  a space it should not have.", "a doubled space"],
    ["leading-marker-residue", ". A marker left its period behind.", "leading residue"],
  ];

  it.each(cases)("%s catches %#: %s", (probe, text) => {
    const hits = probeUnits([unit("ccc:1", text)], TEXT_PROBES);

    expect(hits.map((h) => h.probe)).toContain(probe);
  });

  it("passes clean prose", () => {
    const clean = [
      unit("ccc:1", "Ordinary prose, with a comma and a full stop."),
      unit("ccc:2", 'A quotation: "so be it", and a dash - like this.'),
    ];

    expect(probeUnits(clean, TEXT_PROBES)).toEqual([]);
  });

  it("reports every probe a unit trips, not just the first", () => {
    const hits = probeUnits([unit("ccc:1", "1. <b>Two</b> faults.")], TEXT_PROBES);

    expect(hits.map((h) => h.probe).sort()).toEqual([
      "leading-marker-residue",
      "markup-residue",
    ]);
  });

  it("carries an excerpt, so a failure can be judged without a query", () => {
    const [hit] = probeUnits([unit("ccc:1", "<p>Leaked.")], TEXT_PROBES);

    expect(hit.excerpt).toMatch(/^<p>Leaked\./);
  });
});

describe("the furniture probe", () => {
  // "Jegyzetek" appended to §1065 and §1666 is the failure that reached
  // production, so this is the single most valuable probe in the set.
  it("catches the apparatus label leaking into a unit", () => {
    const hits = probeUnits(
      [unit("ccc:1065", "A bekezdés vége. Jegyzetek:")],
      [furnitureProbe("Jegyzetek")]
    );

    expect(hits.map((h) => h.probe)).toEqual(["furniture:Jegyzetek"]);
  });

  it("matches whole words only", () => {
    // An earlier hand-run flagged §1159 because "Previously" contains
    // "Previous". A probe that cries wolf is a probe that gets declared away.
    const hits = probeUnits(
      [unit("ccc:1159", "Previously God could not be represented by an image.")],
      [furnitureProbe("Previous")]
    );

    expect(hits).toEqual([]);
  });
});

describe("declaring a hit", () => {
  const found = probeUnits(
    [unit("ccc:1059", "A decree of the Council of Lyons II [1274].")],
    TEXT_PROBES
  );

  it("silences the exact pair it declares", () => {
    const declared = errata({
      textProbes: [{ locator: "ccc:1059", probe: "bracket-footnote" }],
    });

    expect(undeclaredHits(found, declared)).toEqual([]);
  });

  it("does NOT silence a different fault at the same locator", () => {
    // Same rule as assertCorpus: the pair (locator, probe) must match. A
    // wildcard by locator would let real contamination in behind a note about
    // something else.
    const contaminated = probeUnits(
      [unit("ccc:1059", "A decree [1274] with <em>markup</em>.")],
      TEXT_PROBES
    );
    const declared = errata({
      textProbes: [{ locator: "ccc:1059", probe: "bracket-footnote" }],
    });

    expect(undeclaredHits(contaminated, declared).map((h) => h.probe)).toEqual([
      "markup-residue",
    ]);
  });

  it("does not silence the same fault at a different locator", () => {
    const declared = errata({
      textProbes: [{ locator: "ccc:9999", probe: "bracket-footnote" }],
    });

    expect(undeclaredHits(found, declared)).toHaveLength(1);
  });

  it("reports a declaration that has stopped firing", () => {
    // The source was fixed, or the text moved under a note checked against
    // the old wording. Either way the note is no longer describing anything.
    const declared = errata({
      textProbes: [
        { locator: "ccc:1059", probe: "bracket-footnote" },
        { locator: "ccc:1", probe: "markup-residue" },
      ],
    });

    expect(staleDeclarations(found, declared)).toEqual([
      { locator: "ccc:1", probe: "markup-residue" },
    ]);
  });
});

describe("the failure message", () => {
  it("names the locator, the probe and the text, and says where to put it", () => {
    const hits = probeUnits([unit("ccc:1", "<p>Leaked markup.")], TEXT_PROBES);
    const message = probeFailure(hits);

    expect(message).toMatch(/ccc:1\s+markup-residue/);
    expect(message).toMatch(/<p>Leaked markup\./);
    expect(message).toMatch(/text_probes\.expected/);
  });
});
