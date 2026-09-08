import { describe, expect, it } from "vitest";
import { compareLocators, crossLingualFailure } from "./cross-lingual";

describe("comparing locator sets", () => {
  it("passes when the two languages address the same units", () => {
    const report = compareLocators(
      ["ccc:1", "ccc:2", "ccc:3"],
      ["ccc:3", "ccc:1", "ccc:2"],
      "hu"
    );

    expect(report.ok).toBe(true);
    expect(report.shared).toBe(3);
    expect(report.against).toBe("hu");
  });

  it("reports the two directions separately", () => {
    // They mean different things. A locator only in the incoming parse is
    // usually a spurious unit; one only in the existing document is usually a
    // hole. "They differ by 2" sends the reader looking in one place.
    const report = compareLocators(
      ["ccc:1", "ccc:2", "ccc:9"],
      ["ccc:1", "ccc:2", "ccc:3"],
      "hu"
    );

    expect(report.ok).toBe(false);
    expect(report.shared).toBe(2);
    expect(report.onlyIncoming).toEqual(["ccc:9"]);
    expect(report.onlyExisting).toEqual(["ccc:3"]);
  });

  it("catches the shape a mis-cut page produces — a run of holes", () => {
    // __P85 losing §2337-§2359 in English while Hungarian keeps them.
    const existing = Array.from({ length: 30 }, (_, i) => `ccc:${i + 1}`);
    const incoming = existing.filter(
      (l) => Number(l.split(":")[1]) < 10 || Number(l.split(":")[1]) > 20
    );
    const report = compareLocators(incoming, existing, "hu");

    expect(report.onlyExisting).toHaveLength(11);
    expect(report.onlyIncoming).toEqual([]);
  });

  it("is a property of a pair, so an empty other side is a failure, not a pass", () => {
    // The caller skips the comparison entirely when no other language is
    // ingested. If it ever calls with an empty set anyway, that must not read
    // as agreement.
    const report = compareLocators(["ccc:1"], [], "hu");

    expect(report.ok).toBe(false);
    expect(report.onlyIncoming).toEqual(["ccc:1"]);
  });
});

describe("the failure message", () => {
  const report = compareLocators(
    ["ccc:1", "ccc:9"],
    ["ccc:1", "ccc:3"],
    "hu"
  );

  it("names both directions and the counts", () => {
    const message = crossLingualFailure(report, "en");

    expect(message).toMatch(/1 only in en: ccc:9/);
    expect(message).toMatch(/1 only in hu: ccc:3/);
    expect(message).toMatch(/1 locators shared/);
  });

  it("says this is not declarable in the errata", () => {
    // An allowance here would be permission for one language to address a unit
    // the other cannot, which is the identity claim being false rather than a
    // typesetting defect to be tolerated.
    expect(crossLingualFailure(report, "en")).toMatch(/not\s+declarable/);
  });

  it("truncates a long divergence instead of printing thousands of lines", () => {
    const many = compareLocators(
      Array.from({ length: 40 }, (_, i) => `ccc:${i + 1}`),
      [],
      "hu"
    );

    expect(crossLingualFailure(many, "en")).toMatch(/… and 28 more/);
  });
});
