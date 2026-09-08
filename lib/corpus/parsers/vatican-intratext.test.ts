import { describe, expect, it } from "vitest";
import { parseVaticanIntratext } from "./vatican-intratext";

/**
 * ⚠️ EVERY FIXTURE BELOW IS INVENTED ENGLISH PROSE, NEVER THE REAL CATECHISM.
 *
 * A test depending on the actual wording would ship corpus (ADR-003), and would
 * test nothing extra: the defects this parser exists to survive are STRUCTURAL.
 * Reproducing a paragraph that opens after a `<br>`, or a page written in the
 * other HTML dialect, exercises exactly the same code paths as the real §2436
 * and `__P85.HTM` do, and ships nothing.
 *
 * The markup shapes ARE copied faithfully from vatican.va, because they are the
 * contract under test — including the unquoted attributes, which are HTML 3.2
 * and are what the file actually contains.
 */

const FURNITURE =
  "<table><tr><td>Catechism of the Catholic Church</td></tr></table>" +
  "<center><b><a href=__P1.HTM>Previous</a></b> - <b><a href=__P3.HTM>Next</a></b></center>";

const NAV =
  "<center><br><br><hr size=1 width=70%><font face=Verdana size=2>" +
  "<center><b><a href=__P1.HTM>Previous</a></b> - <b><a href=__P3.HTM>Next</a></b></center>" +
  "</font></center>";

/** A page in the dialect 373 of the 374 pages are written in. */
function page(body: string, name = "__P2") {
  return { page: name, html: `${FURNITURE}<hr size=1 noshade>${body}${NAV}` };
}

/** One numbered paragraph, as a block of its own. */
const P = (n: number, text: string) =>
  `<p class=MsoNormal>${n}\n${text}</p>`;

/** An IN BRIEF paragraph: the italics open BEFORE the number. */
const BRIEF = (n: number, text: string) =>
  `<p class=MsoNormal><i style='mso-bidi-font-style:normal'>${n}\n${text}</i></p>`;

/** A footnote reference and its definition, told apart by `-` versus `$`. */
const REF = (id: string, shown: number) =>
  `<font face=Verdana size=2><sup><a name=-${id} href=#$${id}>${shown}</a></sup></font>`;
const DEF = (id: string, shown: number, text: string) =>
  `<font size=3><b><a name=$${id} href=#-${id}>${shown}</a></b></font>` +
  `<font face=Verdana size=1> ${text}<br><br><br></font>`;

const apparatus = (...defs: string[]) =>
  `<br/><br/><hr size=1 width=30% align=left/>${defs.join("")}`;

describe("the body boundaries", () => {
  it("ends the body at the footnote apparatus", () => {
    const body =
      P(1, `The body of the paragraph.${REF("28T", 74)}`) +
      apparatus(DEF("28T", 74, "Cf. Some Work 1:1."));
    const { units } = parseVaticanIntratext([page(body)]);

    expect(units).toHaveLength(1);
    expect(units[0].text).toBe("The body of the paragraph.");
  });

  it("ends the body at the navigation when the page has no footnotes", () => {
    // Four of twenty sampled pages carry no apparatus rule at all, so the
    // fallback is not an edge case — it is how those pages terminate.
    const { units } = parseVaticanIntratext([page(P(1, "No footnotes here."))]);

    expect(units[0].text).toBe("No footnotes here.");
  });

  it("parses the page written in the OTHER HTML dialect", () => {
    // __P85.HTM: uppercase tags, quoted attributes, attributes in the other
    // order. Matching `<hr size=1 noshade>` literally finds no body there and
    // loses §2337-§2359 — 23 paragraphs, silently.
    const html =
      '<TABLE><TR><TD>Catechism</TD></TR></TABLE>\n<HR SIZE=1>\n<HR noShade SIZE=1>\n' +
      '<P class=MsoNormal>2337 The paragraph on the page nobody re-saved twice.</P>\n' +
      "<CENTER><HR SIZE=1 width=\"70%\"></CENTER>";
    const { units } = parseVaticanIntratext([{ page: "__P85", html }]);

    expect(units.map((u) => u.locator)).toEqual(["ccc:2337"]);
    expect(units[0].text).toBe(
      "The paragraph on the page nobody re-saved twice."
    );
  });

  it("reports a page with no body rule rather than skipping it", () => {
    const { units, defects } = parseVaticanIntratext([
      { page: "__PZZ", html: "<html><body>Something else entirely</body></html>" },
    ]);

    expect(units).toEqual([]);
    expect(defects).toEqual([
      expect.objectContaining({ kind: "count-mismatch", page: "__PZZ" }),
    ]);
  });
});

describe("the footnote apparatus balance", () => {
  // The compensating check ADR-020 requires of a source with one signal. What
  // it really watches is the body/apparatus cut, which is the boundary that
  // silently corrupted two Hungarian units with every other check green.
  it("passes when every reference has its definition", () => {
    const body =
      P(1, `Text.${REF("2A", 7)}`) +
      P(2, `More text.${REF("2B", 8)}`) +
      apparatus(DEF("2A", 7, "Cf. A."), DEF("2B", 8, "Cf. B."));

    expect(parseVaticanIntratext([page(body)]).defects).toEqual([]);
  });

  it("fires when a definition has no reference — the cut moved early", () => {
    const body =
      P(1, "Text with its reference lost above the cut.") +
      apparatus(DEF("2A", 7, "Cf. A."));
    const { defects } = parseVaticanIntratext([page(body)]);

    expect(defects).toHaveLength(1);
    expect(defects[0].kind).toBe("footnote-unbalanced");
    expect(defects[0].detail).toMatch(/1 defined but unreferenced/);
  });

  it("fires when a reference has no definition — the cut moved late", () => {
    // The apparatus is now INSIDE the last unit's text, which is the shape
    // that reads as prose and that no structural assertion can see.
    const body = P(1, `Text.${REF("2A", 7)}`) + DEF("2A", 7, "Cf. A.");
    const { defects } = parseVaticanIntratext([page(body)]);

    expect(defects[0].kind).toBe("footnote-unbalanced");
    expect(defects[0].detail).toMatch(/1 referenced but undefined/);
  });
});

describe("markers", () => {
  it("spans a unit to the next marker, absorbing its block quotes", () => {
    // An indented <p> is a quotation belonging to the paragraph that
    // introduces it. Treating an element as a unit would orphan it.
    const body =
      P(1, "The paragraph introduces a quotation:") +
      "<p class=MsoNormal style='margin-left:35.4pt'>The quotation itself.</p>" +
      P(2, "The next paragraph.");
    const { units } = parseVaticanIntratext([page(body)]);

    expect(units).toHaveLength(2);
    expect(units[0].text).toBe(
      "The paragraph introduces a quotation: The quotation itself."
    );
  });

  it("accepts a paragraph that opens mid-element, and declares it", () => {
    // §2436's shape: a bare number after a single <br>, inside its
    // predecessor's element.
    const body = P(1, "The first paragraph.<br>\n2 The second, with no block of its own.");
    const { units, defects } = parseVaticanIntratext([page(body)]);

    expect(units.map((u) => u.locator)).toEqual(["ccc:1", "ccc:2"]);
    expect(units[0].text).toBe("The first paragraph.");
    expect(units[1].text).toBe("The second, with no block of its own.");
    expect(defects).toEqual([
      expect.objectContaining({ kind: "marker-inline", locator: "ccc:2" }),
    ]);
  });

  it("rejects a bare number the sequence does not expect", () => {
    // Nothing corroborates an inline marker in this source — there is no
    // anchor — so the sequence is the only evidence, and a year, a verse
    // number or a date must not become a paragraph. Seven candidates in the
    // real document are rejected here; two are accepted.
    const body = P(1, "The paragraph mentions a date. 1962 was a long time ago.");
    const { units, skipped } = parseVaticanIntratext([page(body)]);

    expect(units).toHaveLength(1);
    expect(skipped["numeric-lead-uncorroborated"]).toBe(1);
  });

  it("does not read an enumerated item as a marker", () => {
    // §113 and §114 open with "2." and "3.". A marker's number is followed by
    // whitespace or a tag; a period is neither.
    const body = P(1, "The first criterion.") + "<p class=MsoNormal>2. The second criterion.</p>";
    const { units } = parseVaticanIntratext([page(body)]);

    expect(units.map((u) => u.locator)).toEqual(["ccc:1"]);
    expect(units[0].text).toBe("The first criterion. 2. The second criterion.");
  });

  it("counts the sequence across pages, not within one", () => {
    const { units } = parseVaticanIntratext([
      page(P(1, "First page."), "__P2"),
      page(P(2, "Second page.<br>\n3 Continues inline."), "__P3"),
    ]);

    expect(units.map((u) => u.locator)).toEqual(["ccc:1", "ccc:2", "ccc:3"]);
    expect(units.map((u) => u.ordinal)).toEqual([1, 2, 3]);
  });
});

describe("headings", () => {
  it("removes a bold heading instead of appending it to the previous unit", () => {
    const body =
      P(1, "The paragraph.") +
      "<p class=MsoNormal><b style='mso-bidi-font-weight:normal'>II. The Vocation to Chastity</b></p>" +
      P(2, "The next paragraph.");
    const { units, skipped } = parseVaticanIntratext([page(body)]);

    expect(units[0].text).toBe("The paragraph.");
    expect(skipped["heading-bold"]).toBe(1);
  });

  it("removes an all-caps heading", () => {
    const body = P(1, "The paragraph.") + "<p class=MsoNormal>THE SIXTH COMMANDMENT</p>";
    const { units, skipped } = parseVaticanIntratext([page(body)]);

    expect(units[0].text).toBe("The paragraph.");
    expect(skipped["heading-allcaps"]).toBe(1);
  });

  it("does NOT delete a numbered paragraph that opens with an inline tag", () => {
    // ⚠️ The order inside `headingKind` is what this guards. Both an IN BRIEF
    // paragraph and a heading open with an inline tag; only the number tells
    // them apart. Test the tag first and 537 summaries vanish silently.
    const { units } = parseVaticanIntratext([
      page(BRIEF(1, "A summary set entirely in italics.")),
    ]);

    expect(units).toHaveLength(1);
    expect(units[0].text).toBe("A summary set entirely in italics.");
  });

  it("does not treat a paragraph quoting capitals as a heading", () => {
    // §826 quotes St Thérèse in capitals. The test looks at a whole <p>.
    const body = P(1, 'She wrote: "IN THE HEART OF THE CHURCH I WILL BE LOVE."');
    const { units } = parseVaticanIntratext([page(body)]);

    expect(units).toHaveLength(1);
  });
});

describe("the IN BRIEF role", () => {
  it("marks a paragraph whose italics wrap the whole body", () => {
    const { units } = parseVaticanIntratext([
      page(BRIEF(1, "The summary.") + P(2, "Ordinary prose.")),
    ]);

    expect(units.map((u) => u.role)).toEqual(["summary", null]);
  });

  it("does not mark a paragraph with an italic phrase inside it", () => {
    const body = P(1, "The paragraph cites <i>Lumen Gentium</i> in passing.");
    const { units } = parseVaticanIntratext([page(body)]);

    expect(units[0].role).toBeNull();
    expect(units[0].text).toBe("The paragraph cites Lumen Gentium in passing.");
  });

  it("inherits the italics for a paragraph that opens mid-element", () => {
    // §2077's shape. The <i> opened at the top of §2076's <p> and closes below
    // §2077, so a marker that owns no tags of its own must inherit them — or
    // the unit silently loses a role no assertion can check.
    const body = BRIEF(1, "The first summary.<br>\n2 The second summary.");
    const { units } = parseVaticanIntratext([page(body)]);

    expect(units.map((u) => [u.locator, u.role])).toEqual([
      ["ccc:1", "summary"],
      ["ccc:2", "summary"],
    ]);
  });
});

describe("normalisation", () => {
  it("removes footnote references, superscript and all", () => {
    const body =
      P(1, `Before${REF("28T", 74)} and after${REF("28U", 75)}.`) +
      apparatus(DEF("28T", 74, "Cf. A."), DEF("28U", 75, "Cf. B."));
    const { units } = parseVaticanIntratext([page(body)]);

    expect(units[0].text).toBe("Before and after.");
  });

  it("decodes &ldquo; to the character it denotes, not to a straight quote", () => {
    // Sixteen occurrences beside 7,381 &quot;. Folding them onto `"` would be
    // normalising typography; decoding an entity is not (ADR-017).
    const { units } = parseVaticanIntratext([
      page(P(1, "He said &ldquo;something&quot; aloud.")),
    ]);

    expect(units[0].text).toBe('He said “something" aloud.');
  });
});

describe("pages with no numbered paragraphs", () => {
  it("reports them rather than failing", () => {
    // Six real pages: the Prologue title page, the Creeds, and four
    // commandment epigraphs. Unnumbered in the printed book too, so giving
    // them a locator would mean a synthetic scheme (ADR-002).
    const body =
      "<p class=MsoNormal><b>The Credo</b></p>" +
      "<p class=MsoNormal>I believe in God the Father almighty.</p>";
    const { units, unnumberedPages } = parseVaticanIntratext([page(body, "__P13")]);

    expect(units).toEqual([]);
    expect(unnumberedPages).toEqual(["__P13"]);
  });
});

describe("the assertion contract", () => {
  it("declares that this source carries one signal", () => {
    // Not a convenience. ADR-020 makes it a debt: `assert.ts` skips its
    // agreement check, and the balance check above plus the cross-lingual test
    // in integration/ are what pay for it.
    const { anchorSignal, units } = parseVaticanIntratext([page(P(1, "Text."))]);

    expect(anchorSignal).toBe(false);
    expect(units[0].anchor).toBeNull();
  });
});
