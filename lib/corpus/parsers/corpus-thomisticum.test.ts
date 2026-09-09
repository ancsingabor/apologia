import { describe, expect, it } from "vitest";
import type { CorpusDefect, ParsedUnit } from "@/types/domain";
import { compareSequence } from "../assert";
import {
  checkArticleShapes,
  checkStatedArticleCounts,
  enumerationOf,
  foldLocator,
  locatorOf,
  parseAddress,
  parseCorpusThomisticum,
  sequenceOf,
  statedArticleCount,
} from "./corpus-thomisticum";

/**
 * ⚠️ EVERY FIXTURE BELOW IS INVENTED LATIN, NEVER THE REAL SUMMA.
 *
 * Real wording would ship corpus text (ADR-003) and would test nothing extra:
 * the defects this parser has to survive are structural — an address spelled
 * two ways, a heading that disagrees with a title, a dropdown describing a
 * different page. The MARKUP shapes are copied faithfully, including the
 * uppercase tags, the `&ordf;` ordinals and the `document.write` dropdown.
 */

/** The ornate spelling the apparatus uses: `I-II` is written `Iª-IIae`. */
function ornate(address: string): string {
  return address
    .replace(/^II-II/, "II&ordf;-IIae")
    .replace(/^I-II/, "I&ordf;-IIae")
    .replace(/^III/, "III&ordf;")
    .replace(/^I(?![I&-])/, "I&ordf;");
}

interface UnitOptions {
  /** Override the apparatus spelling, to make the two statements disagree. */
  ref?: string;
  /** Override the reference id in `<A NAME>`, to make the two ids disagree. */
  anchor?: string;
}

function P(id: number, title: string, text: string, over: UnitOptions = {}) {
  const shown = over.ref ?? ornate(title);
  return (
    `<P TITLE="${title}">` +
    `<A NAME="${over.anchor ?? id}">` +
    `<SPAN CLASS="ref">[${id}] ${shown} </SPAN></A>${text}</P>`
  );
}

const QUAESTIO = (n: number) => `<DIV CLASS="D">Quaestio ${n}</DIV>`;
const ARTICULUS = (n: number) => `<DIV CLASS="E">Articulus ${n}</DIV>`;

/** The per-page dropdown, written one `document.write` at a time. */
function dropdown(entries: [number, string][]): string {
  return (
    `<SCRIPT LANGUAGE="JavaScript">\n` +
    `document.write('<OPTION VALUE="none">INDEX');\n` +
    entries
      .map(([id, label]) => `document.write('<OPTION VALUE="#${id}">${ornate(label)}');`)
      .join("\n") +
    `\n</SCRIPT>`
  );
}

const FURNITURE =
  `<DIV CLASS="tres">CORPUS THOMISTICUM</DIV>` +
  `<DIV CLASS="uno">Sancti Thomae de Aquino</DIV>`;

function page(body: string, toc = ""): string {
  return `<HTML LANG="LA"><BODY>${FURNITURE}${toc}${body}</BODY></HTML>`;
}

/** One complete article: two objections, a sed contra, a respondeo, two replies. */
const ARTICLE = [
  P(101, "I q. 1 a. 1 arg. 1", "Videtur quod fictum nomen non sit necessarium."),
  P(102, "I q. 1 a. 1 arg. 2", "Praeterea, res fictae nullam habent naturam."),
  P(103, "I q. 1 a. 1 s. c.", "Sed contra est quod fictor probationis dicit."),
  P(104, "I q. 1 a. 1 co.", "Respondeo dicendum quod exemplum fictum docet."),
  P(105, "I q. 1 a. 1 ad 1", "Ad primum dicendum quod fictio non nocet."),
  P(106, "I q. 1 a. 1 ad 2", "Ad secundum dicendum quod natura ficta sufficit."),
].join("");

const ARTICLE_TOC: [number, string][] = [
  [101, "I q. 1 a. 1 arg. 1"],
  [102, "I q. 1 a. 1 arg. 2"],
  [103, "I q. 1 a. 1 s. c."],
  [104, "I q. 1 a. 1 co."],
  [105, "I q. 1 a. 1 ad 1"],
  [106, "I q. 1 a. 1 ad 2"],
];

const one = (body: string, toc?: [number, string][]) =>
  parseCorpusThomisticum([
    { page: "sth1001", html: page(body, toc ? dropdown(toc) : "") },
  ]);

describe("addresses", () => {
  it("reads every label shape the source actually uses", () => {
    const shapes: [string, string, number[]][] = [
      ["Summa theologiae, pr.", "summa:pr", [0, 0, 0, 0, 0]],
      ["I-II pr.", "summa:I-II.pr", [2, 0, 0, 0, 0]],
      ["I q. 2 pr.", "summa:I.q2.pr", [1, 2, 0, 0, 0]],
      ["I q. 2 a. 1 arg. 3", "summa:I.q2.a1.arg3", [1, 2, 1, 1, 3]],
      ["I q. 2 a. 1 s. c.", "summa:I.q2.a1.sc", [1, 2, 1, 2, 0]],
      ["I q. 3 a. 8 s. c. 2", "summa:I.q3.a8.sc2", [1, 3, 8, 2, 2]],
      ["I q. 2 a. 1 co.", "summa:I.q2.a1.co", [1, 2, 1, 3, 0]],
      ["I q. 2 a. 1 ad 2", "summa:I.q2.a1.ad2", [1, 2, 1, 4, 2]],
      ["I q. 1 a. 4 ad arg.", "summa:I.q1.a4.adarg", [1, 1, 4, 4, 0]],
      // The six single-article questions, addressed with no `a.` at all.
      ["II-II q. 48 arg. 1", "summa:II-II.q48.arg1", [3, 48, 0, 1, 1]],
    ];

    for (const [label, locator, sequence] of shapes) {
      const address = parseAddress(label);
      expect(address, label).not.toBeNull();
      expect(locatorOf(address!), label).toBe(locator);
      expect(sequenceOf(address!), label).toEqual(sequence);
    }
  });

  it("refuses a label it does not understand rather than guessing", () => {
    expect(parseAddress("I q. 2 a. 1 qc. 3")).toBeNull();
    expect(parseAddress("IV q. 1 co.")).toBeNull();
    expect(parseAddress("prologus")).toBeNull();
  });

  it("sorts the whole work into reading order", () => {
    // Shuffled, then sorted by the comparator `assert.ts` actually uses. A
    // question's prooemium must land ahead of the articles it announces, and a
    // part's ahead of its questions.
    const labels = [
      "III q. 1 a. 1 co.",
      "I q. 2 a. 1 ad 1",
      "I q. 2 a. 1 arg. 1",
      "Summa theologiae, pr.",
      "I q. 2 a. 1 co.",
      "I-II pr.",
      "I q. 2 pr.",
      "I q. 2 a. 1 s. c.",
      "II-II q. 48 arg. 1",
    ];

    const sorted = labels
      .map((label) => ({ label, sequence: sequenceOf(parseAddress(label)!) }))
      .sort((a, b) => compareSequence(a.sequence, b.sequence))
      .map((entry) => entry.label);

    expect(sorted).toEqual([
      "Summa theologiae, pr.",
      "I q. 2 pr.",
      "I q. 2 a. 1 arg. 1",
      "I q. 2 a. 1 s. c.",
      "I q. 2 a. 1 co.",
      "I q. 2 a. 1 ad 1",
      "I-II pr.",
      "II-II q. 48 arg. 1",
      "III q. 1 a. 1 co.",
    ]);
  });
});

describe("the two spellings of one address", () => {
  it("folds the ordinal, the inflection and the comma onto one form", () => {
    expect(foldLocator("II&ordf;-IIae q. 123 a. 1 co.")).toBe("II-II q. 123 a. 1 co.");
    expect(foldLocator("II&ordf;-IIae, q. 123 a. 1 co.")).toBe("II-II q. 123 a. 1 co.");
    expect(foldLocator("I&ordf; q. 2 pr.")).toBe("I q. 2 pr.");
  });

  it("accepts the comma spelling ten Secunda Secundae pages use", () => {
    // 2,686 units carry it. Folding is what makes them agree; without it every
    // one of those units reports a label-disagreement.
    const { units, defects } = parseCorpusThomisticum([
      {
        page: "sth3123",
        html: page(
          P(1, "II-II q. 123 a. 1 co.", "Respondeo dicendum quod fortitudo.", {
            ref: "II&ordf;-IIae, q. 123 a. 1 co.",
          })
        ),
      },
    ]);
    expect(defects.filter((d) => d.kind === "label-disagreement")).toEqual([]);
    expect(units[0].locator).toBe("summa:II-II.q123.a1.co");
  });

  it("FLAGS a genuine disagreement between title and apparatus", () => {
    // The guard on the test above: folding must not fold away a real fault.
    const { defects } = parseCorpusThomisticum([
      {
        page: "sth3123",
        html: page(
          P(1, "II-II q. 123 a. 1 co.", "Respondeo dicendum quod fortitudo.", {
            ref: "II&ordf;-IIae q. 124 a. 1 co.",
          })
        ),
      },
    ]);
    expect(defects.map((d) => d.kind)).toContain("label-disagreement");
  });

  it("FLAGS a heading that disagrees with the title", () => {
    // §211's shape in this source: the address said twice by two fields.
    const { defects } = one(
      QUAESTIO(1) + ARTICULUS(9) + P(1, "I q. 1 a. 1 co.", "Respondeo dicendum.")
    );
    const found = defects.find((d) => d.kind === "label-disagreement");
    expect(found?.detail).toMatch(/Articulus 9/);
  });

  it("passes when the headings agree, so the check is not free", () => {
    const { defects } = one(
      QUAESTIO(1) + ARTICULUS(1) + P(1, "I q. 1 a. 1 co.", "Respondeo dicendum.")
    );
    expect(defects.filter((d) => d.kind === "label-disagreement")).toEqual([]);
  });
});

describe("units", () => {
  it("reads a whole article into its five roles", () => {
    const { units } = one(QUAESTIO(1) + ARTICULUS(1) + ARTICLE, ARTICLE_TOC);

    expect(units.map((u) => [u.locator, u.role])).toEqual([
      ["summa:I.q1.a1.arg1", "objection"],
      ["summa:I.q1.a1.arg2", "objection"],
      ["summa:I.q1.a1.sc", "sed_contra"],
      ["summa:I.q1.a1.co", "respondeo"],
      ["summa:I.q1.a1.ad1", "reply"],
      ["summa:I.q1.a1.ad2", "reply"],
    ]);
  });

  it("keeps the apparatus out of the stored text", () => {
    // `[28299]` is the Fundación's reference id, not Aquinas's Latin (ADR-021).
    const { units } = one(ARTICLE, ARTICLE_TOC);
    for (const unit of units) {
      expect(unit.text).not.toMatch(/\[\d+\]/);
      expect(unit.text).not.toMatch(/q\.\s*\d/);
    }
    expect(units[3].text).toBe("Respondeo dicendum quod exemplum fictum docet.");
  });

  it("carries the reference id as corroboration, never as the address", () => {
    const { units } = one(ARTICLE, ARTICLE_TOC);
    expect(units[0].anchor).toBe("101");
    expect(units[0].anchorExpected).toBe("101");
    expect(units[0].label).toBe("I q. 1 a. 1 arg. 1");
  });

  it("reports a reference id that does not match its own anchor", () => {
    // Two statements of the same number; `assert.ts` check 1 compares them.
    const { units } = one(
      P(101, "I q. 1 a. 1 co.", "Respondeo dicendum.", { anchor: "999" })
    );
    expect(units[0].anchor).toBe("999");
    expect(units[0].anchorExpected).toBe("101");
  });

  it("declares an anchor signal and a sequence that is NOT dense", () => {
    const result = one(ARTICLE, ARTICLE_TOC);
    expect(result.anchorSignal).toBe(true);
    // How many objections an article has is a fact about the article, so there
    // is no successor to enumerate gaps against (ADR-020's rejected option 2).
    expect(result.denseSequence).toBe(false);
  });
});

describe("role comes from the label, not from the italics", () => {
  // ADR-020: 122 Catechism units were mis-roled by reading role off italics, in
  // a project whose argument is that structure and typography differ. Here the
  // italics mark Scripture and Aristotle being quoted — 23,324 of them.
  it("does not let a fully italic body change the role", () => {
    const { units } = one(
      P(1, "I q. 1 a. 1 co.", "<I>Respondeo dicendum quod omnia italica sunt.</I>")
    );
    expect(units[0].role).toBe("respondeo");
    expect(units[0].text).toBe("Respondeo dicendum quod omnia italica sunt.");
  });

  it("gives an objection the objection role however it is typeset", () => {
    const { units } = one(
      P(1, "I q. 1 a. 1 arg. 1", "Videtur quod <I>non sit ita</I>, ut dicitur.")
    );
    expect(units[0].role).toBe("objection");
  });
});

describe("markup this source varies", () => {
  it("reads lowercase tags and unquoted attributes", () => {
    // The `__P85` rule: boundaries match by attribute PRESENCE, never by order
    // or case, because one page in a corpus is always saved through some other
    // editor.
    const { units } = parseCorpusThomisticum([
      {
        page: "sth9999",
        html: page(
          `<div class=D>Quaestio 1</div><div class=E>Articulus 1</div>` +
            `<p title="I q. 1 a. 1 co." lang="la">` +
            `<a name=1><span class=ref>[1] I&ordf; q. 1 a. 1 co. </span></a>` +
            `Respondeo dicendum quod forma servatur.</p>`
        ),
      },
    ]);
    expect(units).toHaveLength(1);
    expect(units[0].locator).toBe("summa:I.q1.a1.co");
    expect(units[0].text).toBe("Respondeo dicendum quod forma servatur.");
  });

  it("ignores the page furniture entirely", () => {
    const { units } = one(ARTICLE, ARTICLE_TOC);
    for (const unit of units) {
      expect(unit.text).not.toMatch(/CORPUS|THOMISTICUM|Sancti Thomae/);
    }
  });
});

describe("the page's own enumeration", () => {
  /** This block tests the per-page check only; the whole-document ones have
   *  their own describes, and a fixture article carries no prooemium. */
  const enumerationOnly = (result: { defects: CorpusDefect[] }): CorpusDefect[] =>
    result.defects.filter((d) => d.kind.startsWith("enumeration-"));

  it("is silent when the dropdown and the body agree", () => {
    expect(enumerationOnly(one(ARTICLE, ARTICLE_TOC))).toEqual([]);
  });

  it("tolerates the dropdown's own `ad` for the body's `ad arg.`", () => {
    // It writes the short form 68 times, always. That systematic difference is
    // the evidence the two lists are generated separately rather than one
    // string emitted twice — which is the only reason comparing them is worth
    // anything at all.
    const result = one(
      P(1, "I q. 1 a. 4 co.", "Respondeo dicendum.") +
        P(2, "I q. 1 a. 4 ad arg.", "Ad argumentum dicendum."),
      [
        [1, "I q. 1 a. 4 co."],
        [2, "I q. 1 a. 4 ad"],
      ]
    );
    expect(enumerationOnly(result)).toEqual([]);
  });

  it("FIRES when the dropdown describes units the body does not hold", () => {
    // sth2098's shape: a dropdown left describing a page range that no longer
    // matches how the text is split.
    const defects = enumerationOnly(
      one(ARTICLE, [
        ...ARTICLE_TOC,
        [107, "I q. 2 a. 1 arg. 1"],
        [108, "I q. 2 a. 1 co."],
      ])
    );
    expect(defects).toHaveLength(1);
    expect(defects[0]).toMatchObject({
      kind: "enumeration-mismatch",
      locator: "page:sth1001",
    });
    expect(defects[0].detail).toMatch(/2 listed but absent/);
  });

  it("FIRES when the body holds a unit the dropdown omits", () => {
    // sth4001's shape.
    const defects = enumerationOnly(one(ARTICLE, ARTICLE_TOC.slice(1)));
    expect(defects[0].kind).toBe("enumeration-mismatch");
    expect(defects[0].detail).toMatch(/1 present but unlisted/);
  });

  it("declares the absence rather than passing vacuously", () => {
    // The four prologue pages hold one unit and carry no dropdown. "We could
    // not check this" and "we checked and it was fine" must not look the same.
    const { defects } = one(P(1, "I-II pr.", "Quia, sicut Damascenus dicit."));
    expect(defects.map((d) => [d.kind, d.locator])).toEqual([
      ["enumeration-absent", "page:sth1001"],
    ]);
  });

  it("extracts the enumeration independently of the body", () => {
    expect(enumerationOf(dropdown(ARTICLE_TOC))).toEqual([
      "I q. 1 a. 1 arg. 1",
      "I q. 1 a. 1 arg. 2",
      "I q. 1 a. 1 s. c.",
      "I q. 1 a. 1 co.",
      "I q. 1 a. 1 ad 1",
      "I q. 1 a. 1 ad 2",
    ]);
  });
});

describe("pages that yield nothing", () => {
  it("records a page with no units rather than dropping it", () => {
    const { units, unnumberedPages } = parseCorpusThomisticum([
      { page: "sthnav", html: page("<P>Index nominum.</P>") },
    ]);
    expect(units).toEqual([]);
    expect(unnumberedPages).toEqual(["sthnav"]);
  });

  it("reports a title it cannot read instead of skipping it silently", () => {
    const { defects, skipped } = one(
      P(1, "I q. 1 a. 1 qc. 3", "Quaestiuncula tertia.")
    );
    expect(skipped["title-unparseable"]).toBe(1);
    expect(defects.map((d) => d.kind)).toContain("label-disagreement");
  });
});

// ── Step 4: the structural assertions ──────────────────────────────────────

/** A parsed unit built straight from its label, for the whole-document checks. */
function U(label: string, text = "Textum fictum."): ParsedUnit {
  const address = parseAddress(label)!;
  return {
    locator: locatorOf(address),
    sequence: sequenceOf(address),
    label,
    anchor: "1",
    anchorExpected: "1",
    relabelledFrom: null,
    text,
    role: null,
    page: "sth1001",
    ordinal: 1,
  };
}

/** An article with `objections` objections, `sedContra` sed contras, and the
 *  replies listed — the four dials every shape test below turns. */
function article(
  at: string,
  { objections = 0, sedContra = 0, respondeo = true, replies = [] as number[], adArg = false } = {}
): ParsedUnit[] {
  return [
    ...Array.from({ length: objections }, (_, i) => U(`${at} arg. ${i + 1}`)),
    ...Array.from({ length: sedContra }, (_, i) =>
      U(sedContra === 1 ? `${at} s. c.` : `${at} s. c. ${i + 1}`)
    ),
    ...(respondeo ? [U(`${at} co.`)] : []),
    ...replies.map((n) => U(`${at} ad ${n}`)),
    ...(adArg ? [U(`${at} ad arg.`)] : []),
  ];
}

describe("an article's shape", () => {
  it("passes the ordinary case", () => {
    const found = checkArticleShapes(
      article("I q. 1 a. 1", { objections: 3, sedContra: 1, replies: [1, 2, 3] })
    );
    expect(found).toEqual([]);
  });

  it("allows FEWER replies than objections, which is Aquinas writing", () => {
    // 120 of 2,669 articles answer several objections in one reply. Asserting
    // equality would need ~140 errata entries declaring that a thirteenth
    // century author wrote his book wrong (ADR-020's wildcard, spelled out).
    const found = checkArticleShapes(
      article("I q. 1 a. 1", { objections: 3, sedContra: 1, replies: [1] })
    );
    expect(found).toEqual([]);
  });

  it("allows a GAP in reply numbering, which is the same thing sideways", () => {
    const found = checkArticleShapes(
      article("I q. 1 a. 1", { objections: 4, sedContra: 1, replies: [1, 3, 4] })
    );
    expect(found).toEqual([]);
  });

  it("allows a reply that answers the SED CONTRA rather than an objection", () => {
    // `ad 4` against three objections looks orphaned until you count the sed
    // contra as answerable. It fires 45 times if you do not, and every one of
    // those is a correct article.
    const found = checkArticleShapes(
      article("I q. 13 a. 5", { objections: 3, sedContra: 1, replies: [1, 2, 3, 4] })
    );
    expect(found).toEqual([]);
  });

  it("FLAGS a reply numbered past anything it could answer", () => {
    // The guard on all four tests above: the bound is objections + sed contras,
    // and one past it means an objection went missing in the parse.
    const found = checkArticleShapes(
      article("I q. 1 a. 1", { objections: 3, sedContra: 1, replies: [1, 2, 3, 4, 5] })
    );
    expect(found.map((d) => [d.locator, d.kind])).toEqual([
      ["summa:I.q1.a1", "reply-without-objection"],
    ]);
  });

  it("does not require an objection for `ad arg.`", () => {
    // It answers the sed contra, which carries no number to point at.
    const found = checkArticleShapes(
      article("I q. 1 a. 4", { objections: 2, sedContra: 1, adArg: true })
    );
    expect(found).toEqual([]);
  });

  it("FLAGS an article with no respondeo", () => {
    // I q. 74 a. 3 and I q. 91 a. 4, and those two only.
    const found = checkArticleShapes(
      article("I q. 74 a. 3", { objections: 7, respondeo: false, replies: [1, 2, 3] })
    );
    expect(found.map((d) => [d.locator, d.kind])).toEqual([
      ["summa:I.q74.a3", "respondeo-absent"],
    ]);
  });

  it("FLAGS objections that are not numbered 1..n", () => {
    const found = checkArticleShapes([
      U("I q. 1 a. 1 arg. 1"),
      U("I q. 1 a. 1 arg. 3"),
      U("I q. 1 a. 1 co."),
    ]);
    expect(found.map((d) => d.kind)).toEqual(["objection-not-contiguous"]);
  });

  it("checks a single-article question at the question level", () => {
    // The six questions that carry no `a.` at all still have a shape.
    const found = checkArticleShapes(
      article("II-II q. 48", { objections: 5, respondeo: false, replies: [1] })
    );
    expect(found.map((d) => [d.locator, d.kind])).toEqual([
      ["summa:II-II.q48", "respondeo-absent"],
    ]);
  });
});

describe("the article count a question states about itself", () => {
  it("reads the plain formula", () => {
    expect(statedArticleCount("Et circa hoc quaeruntur quatuor, primo…")).toBe(4);
  });

  it("reads the source's own compound numeral", () => {
    // II-II q. 83 says this, and has seventeen articles.
    expect(statedArticleCount("Et circa hoc quaeruntur decem et septem.")).toBe(17);
  });

  it("takes the count ADJACENT to the verb, not the first number in the sentence", () => {
    // I q. 74's exact shape. A pattern that allows words in between reads the
    // seven days as the article count; the question has three articles. This is
    // the regression test for a bug that reached the inventory report.
    expect(
      statedArticleCount(
        "Deinde quaeritur de omnibus septem diebus in communi. Et quaeruntur tria."
      )
    ).toBe(3);
  });

  it("returns null rather than guessing when no numeral follows", () => {
    expect(statedArticleCount("Deinde considerandum est de fide.")).toBeNull();
    expect(statedArticleCount("Et circa hoc quaeruntur de his quae sequuntur.")).toBeNull();
  });

  it("is silent when the stated count matches the articles parsed", () => {
    const found = checkStatedArticleCounts([
      U("I q. 1 pr.", "Et circa hoc quaeruntur duo."),
      ...article("I q. 1 a. 1", { objections: 1, respondeo: true }),
      ...article("I q. 1 a. 2", { objections: 1, respondeo: true }),
    ]);
    expect(found).toEqual([]);
  });

  it("FLAGS the question whose edition segments it differently", () => {
    // II-II q. 48: Aquinas announces four topics, the Leonine edition renders
    // one article. Both faithfully transcribed, and they disagree — which is
    // exactly the divergence this check exists to surface.
    const found = checkStatedArticleCounts([
      U("II-II q. 48 pr.", "Et circa hoc quaeruntur quatuor, primo…"),
      ...article("II-II q. 48", { objections: 5, respondeo: true }),
    ]);
    expect(found.map((d) => [d.locator, d.kind])).toEqual([
      ["summa:II-II.q48", "article-count-mismatch"],
    ]);
    expect(found[0].detail).toMatch(/states 4 article\(s\), the edition renders 1/);
  });

  it("SKIPS a prooemium that states no number, and says so", () => {
    const found = checkStatedArticleCounts([
      U("I q. 1 pr.", "Deinde considerandum est de sacra doctrina."),
      ...article("I q. 1 a. 1", { objections: 1 }),
    ]);
    expect(found.map((d) => [d.locator, d.kind])).toEqual([
      ["summa:I.q1", "article-count-unstated"],
    ]);
  });

  it("SKIPS a question carrying no prooemium at all, and says so", () => {
    // I q. 71 and I q. 72, both single-article questions.
    const found = checkStatedArticleCounts(article("I q. 71", { objections: 2 }));
    expect(found.map((d) => [d.locator, d.kind])).toEqual([
      ["summa:I.q71", "article-count-unstated"],
    ]);
  });

  it("ignores the work's and the parts' own prologues", () => {
    // They announce parts, not articles, and have no article count to check.
    expect(checkStatedArticleCounts([U("Summa theologiae, pr."), U("I-II pr.")])).toEqual([]);
  });
});
