import { describe, expect, it } from "vitest";
import { parseKatolikusHu } from "./katolikus-hu";

/**
 * ⚠️ EVERY FIXTURE BELOW IS INVENTED HUNGARIAN PROSE, NEVER THE REAL CATECHISM.
 *
 * A test that depended on the actual wording would be a test that ships corpus
 * (ADR-003). It also would not test anything extra: the defects this parser
 * exists to survive are STRUCTURAL, so reproducing the structure — an anchor
 * with a stray digit, a number wrapped in `<font>`, a paragraph that begins
 * after a `<br><br>` — exercises exactly the same code paths as the real §2621
 * does, and ships nothing.
 *
 * The markup shapes, on the other hand, are copied faithfully from
 * katolikus.hu, because they are the contract under test.
 */
function page(body: string, name = "kek-001-002") {
  return {
    page: name,
    html: `<html><body><div class="col-xs-12 nav"><p>Menü</p></div>
      <div class="col-xs-12 article-content">${body}</div>
      <div class="col-xs-12 footer"><p>Lábléc</p></div></body></html>`,
  };
}

const P = (n: number, text: string) =>
  `<p><a name="K${String(n).padStart(4, "0")}">${n}.</a> ${text}</p>`;

describe("the footnote apparatus boundary", () => {
  // All three markup shapes are copied from real pages. Getting this wrong is
  // quiet: the apparatus is appended to the LAST unit on the page, which still
  // reads as prose, and no assertion can see it — the count, the sequence and
  // the anchors are all still right.
  const NAV =
    '<p align="center"><a href="/dokumentumtar/a-katolikus-egyhaz-katekizmusa">Vissza a főoldalra</a></p>';

  it("cuts a label that opens the apparatus paragraph", () => {
    const body = `${P(1, "A törzsszöveg.")}${NAV}<hr><p>Jegyzetek: <br>
      <a href="#JB1" name="J1">[1]</a> Vö. Jn 13,1.</p>`;
    const { units } = parseKatolikusHu([page(body)]);

    expect(units).toHaveLength(1);
    expect(units[0].text).toBe("A törzsszöveg.");
  });

  it("cuts a label sitting in no <p> at all", () => {
    // kek-697-723, the last page — so this shape guards §2865.
    const body = `${P(1, "A törzsszöveg.")}${NAV}<hr> <b>Jegyzetek: </b><br>
      <a href="#JB1" name="J1">[1]</a> Vö. Lk 11,2-4.`;
    const { units } = parseKatolikusHu([page(body)]);

    expect(units[0].text).toBe("A törzsszöveg.");
  });

  it("cuts a label sitting BEFORE the apparatus paragraph", () => {
    // kek-199-298 and kek-415-448. The enclosing <p> of the first definition
    // opens AFTER the label, so moving the cut back to it leaves "Jegyzetek:"
    // in the body. This corrupted §1065 and §1666 — two units out of 2,865.
    const body = `${P(1, "A törzsszöveg.")}${NAV}<hr>Jegyzetek: <p><a href="#JB1" name="J1">[1]</a> Vö. Jn 13,1.</p>`;
    const { units } = parseKatolikusHu([page(body)]);

    expect(units[0].text).toBe("A törzsszöveg.");
    expect(units[0].text).not.toMatch(/Jegyzetek/);
  });

  it("does not truncate a page whose prose happens to say Jegyzetek", () => {
    // The label is accepted as the boundary only when nothing but markup and
    // whitespace separates it from the first definition. Without that
    // proximity test, a body mention would cut the page short — losing
    // paragraphs, which at least fails loudly, but for the wrong reason.
    const body = `${P(1, "A Jegyzetek című fejezetről szóló bekezdés.")}${P(2, "A második.")}${NAV}<hr><p>Jegyzetek: <br><a name="J1">[1]</a> Vö.</p>`;
    const { units } = parseKatolikusHu([page(body)]);

    expect(units.map((u) => u.locator)).toEqual(["ccc:1", "ccc:2"]);
    expect(units[0].text).toBe("A Jegyzetek című fejezetről szóló bekezdés.");
  });

  it("keeps the whole body when a page carries no apparatus", () => {
    const { units } = parseKatolikusHu([page(P(1, "Nincs jegyzet.") + NAV)]);
    expect(units[0].text).toBe("Nincs jegyzet.");
  });
});

describe("locating paragraphs", () => {
  it("reads the printed number and keeps the anchor as corroboration", () => {
    const { units } = parseKatolikusHu([page(P(1, "Az első bekezdés szövege."))]);

    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({
      locator: "ccc:1",
      sequence: [1],
      label: "1",
      anchor: "K0001",
      anchorExpected: "K0001",
      text: "Az első bekezdés szövege.",
      role: null,
      ordinal: 1,
    });
  });

  it("ignores everything outside the article-content container", () => {
    const { units } = parseKatolikusHu([page(P(1, "Csak ez a szöveg."))]);
    expect(units[0].text).toBe("Csak ez a szöveg.");
  });

  it("finds a paragraph that starts after <br><br> inside another <p>", () => {
    // The shape of §78: element boundaries are NOT unit boundaries here.
    const body = `<p><a name="K0077">77.</a> A hetvenhetes bekezdés.<br> <br>
      <a name="K0078">78.</a> A hetvennyolcas bekezdés.</p>`;
    const { units } = parseKatolikusHu([page(body)]);

    expect(units.map((u) => u.locator)).toEqual(["ccc:77", "ccc:78"]);
    expect(units[0].text).toBe("A hetvenhetes bekezdés.");
    expect(units[1].text).toBe("A hetvennyolcas bekezdés.");
  });

  it("keeps an opening quotation mark that the anchor swallowed", () => {
    // The shape of §1077. The „ lives INSIDE the anchor, after the number.
    const body = `<p><a name="K0100">100. „</a>Idézett mondat kezdete.”</p>`;
    const { units } = parseKatolikusHu([page(body)]);

    expect(units[0].text).toBe("„Idézett mondat kezdete.”");
  });

  it("reads a number wrapped in presentational tags inside the anchor", () => {
    // The shape of §1182.
    const body = `<p><a name="K0200"><font size="-1">200 </font></a><font size="-1"> A kétszázas bekezdés.</font></p>`;
    const { units } = parseKatolikusHu([page(body)]);

    expect(units[0]).toMatchObject({ locator: "ccc:200", anchor: "K0200" });
    expect(units[0].text).toBe("A kétszázas bekezdés.");
  });

  it("strips a doubled period left by a malformed marker", () => {
    // The shape of §222: "<a …>222.</a>." prints its period twice.
    const body = `<p><a name="K0222">222.</a>. A bekezdés szövege.</p>`;
    const { units } = parseKatolikusHu([page(body)]);
    expect(units[0].text).toBe("A bekezdés szövege.");
  });
});

describe("what is NOT a paragraph", () => {
  it("rejects a dateline that merely begins with a number", () => {
    // The front matter ends "2002. Szent Péter és Pál ünnepén" — a date, and
    // indistinguishable from a paragraph number without corroboration.
    const body = `<p>2002. Szent Péter és Pál ünnepén</p>`;
    const result = parseKatolikusHu([page(body)]);

    expect(result.units).toHaveLength(0);
    expect(result.skipped["numeric-lead-uncorroborated"]).toBe(1);
    expect(result.unnumberedPages).toEqual(["kek-001-002"]);
  });

  it("accepts an un-anchored number the sequence expects", () => {
    // The shape of §2096: no anchor at all, and no trailing period either.
    const body = `${P(1, "Első.")}<p> 2 A második bekezdés.</p>`;
    const { units } = parseKatolikusHu([page(body)]);

    expect(units.map((u) => u.locator)).toEqual(["ccc:1", "ccc:2"]);
    expect(units[1].anchor).toBeNull();
  });

  it("drops headings, in capitals and in bold", () => {
    const body = `<p>A NOÉVAL KÖTÖTT SZÖVETSÉG</p>
      ${P(1, "Első.")}
      <p align="center"><strong>2. Cikkely<br>A MÁSODIK CIKKELY CÍME</strong></p>
      ${P(2, "Második.")}`;
    const { units, skipped } = parseKatolikusHu([page(body)]);

    expect(units.map((u) => u.text)).toEqual(["Első.", "Második."]);
    expect(skipped["heading-allcaps"]).toBe(1);
    expect(skipped["heading-bold"]).toBe(1);
  });

  it("does NOT drop a body paragraph that opens in bold", () => {
    // Order-of-checks regression: classifying these as headings deleted 49
    // paragraphs in an earlier draft, silently.
    const body = `<p><strong><a name="K0003">3.</a></strong> Félkövéren kezdődő bekezdés.</p>`;
    const { units } = parseKatolikusHu([page(body)]);

    expect(units).toHaveLength(1);
    expect(units[0].text).toBe("Félkövéren kezdődő bekezdés.");
  });

  it("drops a paragraph that is nothing but a navigation link", () => {
    const body = `${P(1, "Első.")}<p align="center"><a href="/dokumentumtar/x">Vissza a főoldalra</a></p>`;
    const { units, skipped } = parseKatolikusHu([page(body)]);

    expect(units[0].text).toBe("Első.");
    expect(skipped["heading-nav"]).toBe(1);
  });

  it("cuts the footnote apparatus at the start of its own paragraph", () => {
    // Cutting at the first definition anchor instead leaves the visible
    // "Jegyzetek:" label glued to the last unit — which is how §2865 broke.
    const body = `${P(1, "Az utolsó bekezdés.")}
      <hr>
      <p>Jegyzetek: <br> <a href="#JB1" name="J1" id="J1">[1]</a> Egy hivatkozás.<br></p>`;
    const { units } = parseKatolikusHu([page(body)]);

    expect(units).toHaveLength(1);
    expect(units[0].text).toBe("Az utolsó bekezdés.");
  });

  it("does not treat a mid-body <hr> as the end of the body", () => {
    const body = `${P(1, "Első.")}<hr>${P(2, "Második.")}`;
    const { units } = parseKatolikusHu([page(body)]);
    expect(units.map((u) => u.locator)).toEqual(["ccc:1", "ccc:2"]);
  });
});

describe("unit text", () => {
  it("removes footnote references whatever order their attributes are in", () => {
    const body = `<p><a name="K0001">1.</a> Egy állítás.<a name="JB7" href="#J7">[7]</a> Egy másik.<a href="#J64" name="JB64">[64]</a></p>`;
    const { units } = parseKatolikusHu([page(body)]);

    expect(units[0].text).toBe("Egy állítás. Egy másik.");
    expect(units[0].text).not.toMatch(/\[\d+\]/);
  });

  it("adds no space at an inline tag boundary", () => {
    const body = `<p><a name="K0001">1.</a> A vers (<em>Ter 10,5</em>) idézése.</p>`;
    const { units } = parseKatolikusHu([page(body)]);

    // "( Ter 10,5 )" would be permanently wrong under a byte-exact comparison.
    expect(units[0].text).toBe("A vers (Ter 10,5) idézése.");
  });

  it("attaches a blockquote to the preceding unit (ADR-019 decision A)", () => {
    const body = `<p><a name="K0001">1.</a> A bekezdés kezdete.</p>
      <blockquote><p>Egy idézett mondat.</p></blockquote>`;
    const { units } = parseKatolikusHu([page(body)]);

    expect(units).toHaveLength(1);
    expect(units[0].text).toBe("A bekezdés kezdete. Egy idézett mondat.");
  });

  it("decodes entities, collapses whitespace, and normalises to NFC", () => {
    const composed = "ő"; // U+0151
    const decomposed = "ő"; // o + combining double acute
    const body = `<p><a name="K0001">1.</a> Els&#337; sor&nbsp;&quot;idézet&quot;
      második    sor ${decomposed}</p>`;
    const { units } = parseKatolikusHu([page(body)]);

    expect(units[0].text).toBe(`Els${composed} sor "idézet" második sor ${composed}`);
  });
});

describe("the summary role (In Brief)", () => {
  // ⚠️ THE ROLE COMES FROM THE LABEL, NOT FROM THE ITALICS.
  //
  // It used to come from whole-paragraph italics, and this edition italicises
  // §112–§114 and §116–§117 — the criteria for interpreting Scripture and the
  // senses of Scripture, ordinary paragraphs both — while leaving some
  // Összefoglalás blocks upright. 610 units carried the role against the
  // English document's 538, agreeing on 488. See lib/corpus/in-brief.ts.
  const LABEL = "<p><strong>Összefoglalás</strong></p>";

  it("marks every paragraph under the label", () => {
    const body = `${P(1, "Rendes szöveg.")}${LABEL}${P(2, "Összefoglaló.")}${P(3, "Még egy.")}`;
    const { units } = parseKatolikusHu([page(body)]);

    expect(units.map((u) => [u.locator, u.role])).toEqual([
      ["ccc:1", null],
      ["ccc:2", "summary"],
      ["ccc:3", "summary"],
    ]);
  });

  it("stops at the next heading", () => {
    const body = `${LABEL}${P(1, "Összefoglaló.")}<p><strong>2. Cikkely</strong></p>${P(2, "Rendes szöveg.")}`;
    const { units } = parseKatolikusHu([page(body)]);

    expect(units.map((u) => u.role)).toEqual(["summary", null]);
  });

  it("marks a label set OUTSIDE any <p>", () => {
    // kek-566-644 sets exactly one this way — `</p> <b>Összefoglalás</b> <p>` —
    // so P_BLOCK never sees it and §2504–§2513 lost their role. The Jegyzetek
    // problem again: a label in this source is not reliably an element.
    const body = `${P(1, "Rendes szöveg.")}<b>Összefoglalás</b>${P(2, "Összefoglaló.")}`;
    const { units } = parseKatolikusHu([page(body)]);

    expect(units.map((u) => u.role)).toEqual([null, "summary"]);
  });

  it("does not mark an italic paragraph outside a block", () => {
    // Exactly what the old rule marked, and why it disagreed with English.
    const body = P(1, "<em>Dőlt betűs, de nem összefoglaló.</em>");
    const { units } = parseKatolikusHu([page(body)]);

    expect(units[0].role).toBeNull();
  });

  it("marks an upright paragraph inside a block", () => {
    const body = `${LABEL}${P(1, "Álló betűs, de összefoglaló.")}`;
    const { units } = parseKatolikusHu([page(body)]);

    expect(units[0].role).toBe("summary");
  });
});

describe("a centred heading", () => {
  // ⚠️ THIS IS WHY §267 CARRIED A HEADING IN ITS TEXT FOR A WHOLE RELEASE.
  //
  // `3.§ A Mindenható` is set in mixed case where every sibling — `2.§ AZ
  // ATYA`, `4. § A TEREMTŐ` — is in capitals, so neither the bold nor the
  // all-caps rule saw it, and its text was appended to the preceding
  // paragraph. One unit out of 2,865, reading as prose, invisible to every
  // assertion and every text probe. It was found only because the In Brief
  // block it failed to close ran on into §268–§271 and the cross-lingual role
  // comparison noticed.
  it("does not leak into the preceding paragraph", () => {
    const body = `${P(1, "Első.")}<p align="center">3.§<br><strong>A Mindenható</strong></p>${P(2, "Második.")}`;
    const { units, skipped } = parseKatolikusHu([page(body)]);

    expect(units.map((u) => u.text)).toEqual(["Első.", "Második."]);
    expect(skipped["heading-bold"]).toBeUndefined();
    expect(skipped["heading-centred"]).toBe(1);
  });

  it("closes an In Brief block", () => {
    const body = `<p><strong>Összefoglalás</strong></p>${P(1, "Összefoglaló.")}<p align="center">3.§<br><strong>A Mindenható</strong></p>${P(2, "Rendes szöveg.")}`;
    const { units } = parseKatolikusHu([page(body)]);

    expect(units.map((u) => u.role)).toEqual(["summary", null]);
  });

  it("never swallows a numbered paragraph", () => {
    // Safe by construction: the anchor test comes first, so a centred
    // paragraph carrying a marker is still a unit.
    const body = `<p align="center"><a name="K0001">1.</a> Középre zárt bekezdés.</p>`;
    const { units } = parseKatolikusHu([page(body)]);

    expect(units.map((u) => u.text)).toEqual(["Középre zárt bekezdés."]);
  });
});
