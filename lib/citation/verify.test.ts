import { describe, expect, it } from "vitest";

import type { ContextUnit, GeneratedAnswer } from "@/types/domain";
import { QUOTATION_LIMITS } from "./limits";
import { verifyAnswer } from "./verify";

/**
 * The gate is pure logic over fixed input, so these run with no API key, no
 * network and no database — which is what makes exhaustive coverage of the
 * adversarial cases affordable (ADR-015).
 *
 * The CCC text below is a FIXTURE, not the real Catechism. Using invented text
 * is deliberate: the repo ships no corpus (ADR-003), and a test that depended on
 * the real wording would be a test that ships it.
 */
const CCC_309: ContextUnit = {
  locator: "ccc:309",
  language: "hu",
  text: "A jó és rendezett világ Teremtője gondot visel minden teremtményére; miért van mégis a rossz?",
  sourceId: "ccc",
  authorityTier: 2,
  edition: "Szent István Társulat",
  url: "https://example.invalid/kek/309",
};

const CCC_310: ContextUnit = {
  locator: "ccc:310",
  language: "hu",
  text: "Isten teremthetett volna tökéletesebb világot is, de bölcsességében úton lévő világot akart.",
  sourceId: "ccc",
  authorityTier: 2,
  edition: "Szent István Társulat",
  url: "https://example.invalid/kek/310",
};

/** A unit with no edition and no link — the "source named" condition fails. */
const UNATTRIBUTED: ContextUnit = {
  ...CCC_310,
  locator: "ccc:311",
  edition: null,
  url: null,
};

const context = [CCC_309, CCC_310];

/**
 * Answer prose of a realistic length (~300 chars). Fixtures matter here: with
 * `maxQuotedRatioOfAnswer` at 0.25 an answer must be at least four times the
 * length of what it quotes, so a toy one-sentence fixture fails the ratio check
 * for reasons that have nothing to do with the behaviour under test.
 */
const PROSE =
  "A kérdés a Katekizmusban is szerepel, és a válasz nem egyetlen mondat. " +
  "A keresztény hagyomány nem tagadja a rossz valóságát, és nem is magyarázza " +
  "el egy tételmondattal; ehelyett több szálon közelít hozzá, a teremtés " +
  "jóságától a szabad akaraton át a megváltásig, és ezeket a szálakat együtt " +
  "kell olvasni.";

function answer(...segments: GeneratedAnswer["segments"]): GeneratedAnswer {
  return { language: "hu", segments };
}

const claim = (text: string, ...citations: string[]) =>
  ({ kind: "claim", text, citations }) as const;
const connective = (text: string) => ({ kind: "connective", text }) as const;
const quote = (locator: string, text: string) =>
  ({ kind: "quotation", locator, text }) as const;

describe("locator resolution", () => {
  it("passes an answer whose every claim cites a supplied unit", () => {
    const result = verifyAnswer(
      answer(claim("A rossz a jó hiánya.", "ccc:309"), claim("Isten úton lévő világot akart.", "ccc:310")),
      context
    );

    expect(result.status).toBe("pass");
  });

  // The headline failure this whole architecture exists to catch: a real-looking
  // locator the model was never shown.
  it("drops a fabricated locator and keeps the claim if another citation survives", () => {
    const result = verifyAnswer(
      answer(claim("A rossz a jó hiánya.", "ccc:309", "ccc:1730")),
      context
    );

    expect(result.status).toBe("repaired");
    if (result.status !== "repaired") return;
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].code).toBe("citation_not_in_context");
    expect(result.dropped[0].locator).toBe("ccc:1730");
    expect(result.answer.segments[0]).toEqual(claim("A rossz a jó hiánya.", "ccc:309"));
  });

  it("FAILS when dropping fabricated locators leaves a claim unsupported", () => {
    const result = verifyAnswer(answer(claim("A rossz a jó hiánya.", "ccc:1730")), context);

    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.violations.map((v) => v.code)).toContain("claim_without_citation");
  });

  it("FAILS a claim carrying no citation at all", () => {
    const result = verifyAnswer(answer(claim("A rossz a jó hiánya.")), context);

    expect(result.status).toBe("failed");
  });

  it("does not require a citation on connective prose", () => {
    const result = verifyAnswer(
      answer(connective("Két dolgot érdemes szétválasztani."), claim("A rossz a jó hiánya.", "ccc:309")),
      context
    );

    expect(result.status).toBe("pass");
  });

  // A locator existing in the corpus is NOT the test — being in the supplied
  // context is. Otherwise a lucky guess passes as a citation.
  it("rejects a locator that is real but was not supplied to the model", () => {
    const result = verifyAnswer(answer(claim("x", "ccc:310")), [CCC_309]);

    expect(result.status).toBe("failed");
  });
});

describe("quotation exactness (ADR-017 — faithful to the original)", () => {
  it("accepts a span that is verbatim in its unit", () => {
    const result = verifyAnswer(
      answer(
        claim(PROSE, "ccc:309"),
        quote("ccc:309", "miért van mégis a rossz?")
      ),
      context
    );

    expect(result.status).toBe("pass");
  });

  it("FAILS a fabricated quotation attributed to a real locator", () => {
    const result = verifyAnswer(
      answer(claim("x", "ccc:309"), quote("ccc:309", "Isten nem létezik.")),
      context
    );

    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.violations[0].code).toBe("quotation_not_exact");
  });

  // The ADR-014 nightmare in one test: a plausible translation of the real
  // passage, which a lenient comparison would wave through under a green check.
  it("FAILS a translated quotation, however faithful in meaning", () => {
    const result = verifyAnswer(
      answer(claim("x", "ccc:309"), quote("ccc:309", "why then is there evil?")),
      context
    );

    expect(result.status).toBe("failed");
  });

  // Byte-exact means byte-exact. Documented as a test so the strictness is a
  // decision on record rather than an accident someone later "fixes".
  it.each([
    ["a curly apostrophe swapped for a straight one", "gondot visel minden teremtményere"],
    ["a trailing space added", "miért van mégis a rossz? "],
    ["case changed", "Miért van mégis a rossz?"],
  ])("FAILS on %s", (_label, span) => {
    const result = verifyAnswer(answer(claim("x", "ccc:309"), quote("ccc:309", span)), context);

    expect(result.status).toBe("failed");
  });

  it("FAILS a quotation of a locator that was never supplied", () => {
    const result = verifyAnswer(
      answer(claim("x", "ccc:309"), quote("ccc:999", "bármi")),
      context
    );

    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.violations[0].code).toBe("quotation_unknown_locator");
  });
});

describe("quotation proportionality (ADR-017 — thresholds are the owner's)", () => {
  const longUnit: ContextUnit = { ...CCC_309, locator: "ccc:400", text: "x".repeat(2000) };

  it("drops an over-long quotation but keeps the answer", () => {
    const result = verifyAnswer(
      answer(claim("x".repeat(5000), "ccc:400"), quote("ccc:400", "x".repeat(500))),
      [longUnit]
    );

    expect(result.status).toBe("repaired");
    if (result.status !== "repaired") return;
    expect(result.dropped[0].code).toBe("quotation_too_long");
    expect(result.answer.segments).toHaveLength(1);
  });

  it("drops a quotation whose unit carries no edition or link", () => {
    const result = verifyAnswer(
      answer(claim("x".repeat(500), "ccc:311"), quote("ccc:311", "Isten teremthetett volna")),
      [UNATTRIBUTED]
    );

    expect(result.status).toBe("repaired");
    if (result.status !== "repaired") return;
    expect(result.dropped[0].code).toBe("quotation_missing_attribution");
  });

  // The evasion the per-unit limit exists for: several individually compliant
  // fragments reassembling most of one citable unit.
  it("sums quotations PER UNIT, so fragments cannot reassemble a paragraph", () => {
    const unit: ContextUnit = { ...CCC_309, locator: "ccc:401", text: "ab".repeat(100) };
    const third = "ab".repeat(40); // 80 chars each; 3 × 80 = 240 of 200… over 50%

    const result = verifyAnswer(
      answer(
        claim("x".repeat(4000), "ccc:401"),
        quote("ccc:401", third),
        quote("ccc:401", third),
        quote("ccc:401", third)
      ),
      [unit]
    );

    expect(result.status).toBe("repaired");
    if (result.status !== "repaired") return;
    expect(result.dropped.every((v) => v.code === "quotation_exceeds_unit_ratio")).toBe(true);
    expect(result.answer.segments.filter((s) => s.kind === "quotation")).toHaveLength(0);
  });

  it("drops from the end until the whole-answer ratio is satisfied", () => {
    const unit: ContextUnit = { ...CCC_309, locator: "ccc:402", text: "y".repeat(4000) };
    // 100 chars of prose + 3 × 100 quoted = 400 total; 300/400 = 75%, over 25%.
    const result = verifyAnswer(
      answer(
        claim("z".repeat(100), "ccc:402"),
        quote("ccc:402", "y".repeat(100)),
        quote("ccc:402", "y".repeat(100)),
        quote("ccc:402", "y".repeat(100))
      ),
      [unit]
    );

    expect(result.status).toBe("repaired");
    if (result.status !== "repaired") return;
    expect(result.dropped.every((v) => v.code === "quotation_exceeds_answer_ratio")).toBe(true);
    // Everything after the first quote goes; even one 100-char quote is 100/400.
    expect(result.answer.segments.filter((s) => s.kind === "quotation")).toHaveLength(0);
  });

  // Found by a fixture that looked reasonable and was not: the two thresholds
  // interact. At 0.25, an answer must be ~4x the length of what it quotes, so a
  // maximum-length 400-char quotation needs roughly a 1,600-char answer to
  // survive. Worth knowing before either number is tuned.
  it("requires an answer ~4x the quoted length at the default ratio", () => {
    const unit: ContextUnit = { ...CCC_309, locator: "ccc:404", text: "y".repeat(4000) };
    const span = "y".repeat(400);

    const tooShort = verifyAnswer(
      answer(claim("z".repeat(1000), "ccc:404"), quote("ccc:404", span)),
      [unit]
    );
    expect(tooShort.status).toBe("repaired");

    const longEnough = verifyAnswer(
      answer(claim("z".repeat(1600), "ccc:404"), quote("ccc:404", span)),
      [unit]
    );
    expect(longEnough.status).toBe("pass");
  });

  it("keeps a quotation that sits inside every limit", () => {
    const unit: ContextUnit = { ...CCC_309, locator: "ccc:403", text: "y".repeat(4000) };
    const result = verifyAnswer(
      answer(claim("z".repeat(1000), "ccc:403"), quote("ccc:403", "y".repeat(100))),
      [unit]
    );

    expect(result.status).toBe("pass");
  });

  // ADR-017: setting maxCharsPerQuote to 0 must revert to ADR-014's original
  // posture — locator and link, no quotation — without touching the gate.
  it("reverts to the no-quotation posture when the limit is set to zero", () => {
    const result = verifyAnswer(
      answer(claim(PROSE, "ccc:309"), quote("ccc:309", "miért van mégis a rossz?")),
      context,
      { ...QUOTATION_LIMITS, maxCharsPerQuote: 0 }
    );

    expect(result.status).toBe("repaired");
    if (result.status !== "repaired") return;
    expect(result.answer.segments.filter((s) => s.kind === "quotation")).toHaveLength(0);
    expect(result.answer.segments.filter((s) => s.kind === "claim")).toHaveLength(1);
  });
});

describe("reporting", () => {
  it("never repairs silently — every drop is reported", () => {
    const result = verifyAnswer(
      answer(claim("x", "ccc:309", "ccc:1730", "ccc:1731")),
      context
    );

    expect(result.status).toBe("repaired");
    if (result.status !== "repaired") return;
    expect(result.dropped.map((v) => v.locator)).toEqual(["ccc:1730", "ccc:1731"]);
  });

  it("reports every violation on a failed answer, not just the first", () => {
    const result = verifyAnswer(
      answer(claim("x", "ccc:1730"), quote("ccc:309", "hamis idézet")),
      context
    );

    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.violations.map((v) => v.code).sort()).toEqual([
      "citation_not_in_context",
      "claim_without_citation",
      "quotation_not_exact",
    ]);
  });

  it("does not mutate the answer it was given", () => {
    const original = answer(claim("x", "ccc:309", "ccc:1730"));
    const snapshot = structuredClone(original);

    verifyAnswer(original, context);

    expect(original).toEqual(snapshot);
  });

  it("handles an empty answer without dividing by zero", () => {
    expect(verifyAnswer(answer(), context).status).toBe("pass");
  });
});
