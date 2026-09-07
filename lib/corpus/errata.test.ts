import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { emptyErrata, parseErrata } from "./errata";

/**
 * This suite reads the REAL `corpus/errata/ccc-hu.yaml`, which is safe under
 * ADR-003 for the same reason the file itself is: it contains locators and
 * defect kinds, and not one word of corpus text.
 *
 * Reading the real file is the point. A hand-written fixture would test the
 * schema against itself; the risk being covered is that the file someone
 * maintains by hand drifts out of the shape the assertions match on.
 */
const realErrata = () =>
  parseErrata(load(readFileSync("corpus/errata/ccc-hu.yaml", "utf8")));

describe("the shipped ccc-hu.yaml", () => {
  it("parses and maps snake_case to the domain type", () => {
    const errata = realErrata();

    expect(errata).toMatchObject({
      source: "ccc",
      language: "hu",
      expectedUnits: 2865,
    });
  });

  it("declares the four relabels, addressed by page/label/occurrence", () => {
    const errata = realErrata();

    expect(errata.relabels).toHaveLength(4);
    expect(errata.relabels).toContainEqual({
      page: "kek-052-063",
      foundLabel: 147,
      occurrence: 1,
      correctLocator: "ccc:146",
    });
    // THE IMPORTANT ONE: anchor K0210 and printed 210 agree and are both wrong,
    // so only the strictly-increasing assertion catches it. Addressed by
    // occurrence 2 — the first 210 on that page is the real one.
    expect(errata.relabels).toContainEqual({
      page: "kek-067-120",
      foundLabel: 210,
      occurrence: 2,
      correctLocator: "ccc:211",
    });
  });

  it("declares the four permitted anchor defects", () => {
    const errata = realErrata();

    expect(errata.allowed).toEqual([
      { locator: "ccc:74", kind: "anchor-missing-prefix" },
      { locator: "ccc:2096", kind: "anchor-absent" },
      { locator: "ccc:2213", kind: "anchor-absent" },
      { locator: "ccc:2621", kind: "anchor-typo" },
    ]);
  });

  it("keeps the prose fields without letting them into the domain type", () => {
    // `found`, `expected`, `repair`, `note`, `verified_against` exist for a
    // human deciding whether a declaration is still honest. The parser neither
    // requires nor rejects them, and does not carry them further.
    const [first] = realErrata().allowed;
    expect(Object.keys(first).sort()).toEqual(["kind", "locator"]);
  });
});

describe("schema", () => {
  const minimal = {
    source: "ccc",
    language: "hu",
    expected_units: 10,
    relabels: [],
    allowed: [],
  };

  it("defaults relabels and allowed to empty", () => {
    const errata = parseErrata({
      source: "ccc",
      language: "hu",
      expected_units: 10,
    });
    expect(errata.relabels).toEqual([]);
    expect(errata.allowed).toEqual([]);
  });

  it("rejects a defect kind the parser cannot emit", () => {
    // A typo would otherwise sit in the file looking like permission while
    // matching nothing, and the ingest would fail pointing at the source.
    expect(() =>
      parseErrata({
        ...minimal,
        allowed: [{ locator: "ccc:74", kind: "anchor-typoo" }],
      })
    ).toThrow();
  });

  it("rejects a correct_locator that is not a canonical locator", () => {
    expect(() =>
      parseErrata({
        ...minimal,
        relabels: [
          { page: "p", found_label: 147, occurrence: 1, correct_locator: "146" },
        ],
      })
    ).toThrow();
  });

  it("rejects a zeroth occurrence — the field is 1-based", () => {
    expect(() =>
      parseErrata({
        ...minimal,
        relabels: [
          {
            page: "p",
            found_label: 147,
            occurrence: 0,
            correct_locator: "ccc:146",
          },
        ],
      })
    ).toThrow();
  });
});

describe("emptyErrata", () => {
  it("declares nothing, so every defect is undeclared", () => {
    // `errata: null` means "unchecked", not "clean". An uninventoried source
    // failing its first ingest loudly is the correct outcome.
    const errata = emptyErrata("ccc", "en", 2865);
    expect(errata.allowed).toEqual([]);
    expect(errata.relabels).toEqual([]);
    expect(errata.expectedUnits).toBe(2865);
  });
});
