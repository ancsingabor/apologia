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

describe("locating paragraphs", () => {
  it("reads the printed number and keeps the anchor as corroboration", () => {
    const { units } = parseKatolikusHu([page(P(1, "Az első bekezdés szövege."))]);

    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({
      locator: "ccc:1",
      paragraph: 1,
      anchor: "K0001",
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
    expect(result.frontMatterPages).toEqual(["kek-001-002"]);
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
  it("marks a wholly italic paragraph", () => {
    const body = `<p><strong>Összefoglalás</strong></p>
      <p><a name="K0001">1.</a> <em>Az összefoglaló bekezdés szövege.</em></p>`;
    const { units } = parseKatolikusHu([page(body)]);

    expect(units[0].role).toBe("summary");
  });

  it("does not mark a paragraph with merely italic fragments in it", () => {
    const body = `<p><a name="K0001">1.</a> A vers (<em>Ter 10,5</em>) idézése folytatódik.</p>`;
    const { units } = parseKatolikusHu([page(body)]);

    expect(units[0].role).toBeNull();
  });
});

describe("across pages", () => {
  it("numbers ordinals continuously and records provenance", () => {
    const { units } = parseKatolikusHu([
      page(P(1, "Első."), "kek-001-002"),
      page(P(2, "Második."), "kek-003-004"),
    ]);

    expect(units.map((u) => [u.page, u.ordinal])).toEqual([
      ["kek-001-002", 1],
      ["kek-003-004", 2],
    ]);
  });

  it("reports a page whose container is gone rather than skipping it quietly", () => {
    const { defects } = parseKatolikusHu([
      { page: "kek-999", html: "<html><body><p>1. Nincs tartalom.</p></body></html>" },
    ]);

    expect(defects).toHaveLength(1);
    expect(defects[0].kind).toBe("count-mismatch");
    expect(defects[0].detail).toMatch(/page shape changed/);
  });
});
