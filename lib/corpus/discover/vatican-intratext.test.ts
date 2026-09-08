import { describe, expect, it } from "vitest";
import { discoverVaticanIntratextPages } from "./vatican-intratext";

const INDEX = "https://www.vatican.va/archive/ENG0015/_INDEX.HTM";

/**
 * The markup shapes are copied from the real table of contents; no corpus text
 * is involved, because a ToC entry is a link and a section heading.
 */
describe("discovery", () => {
  it("reads unquoted relative hrefs and resolves them against the ToC", () => {
    const html =
      "<ul><li><a href=__P1.HTM>PROLOGUE</a></li>" +
      "<li><a href=__P2.HTM>I. The life of man</a></li></ul>";

    expect(discoverVaticanIntratextPages(html, INDEX)).toEqual([
      { slug: "__P1", url: "https://www.vatican.va/archive/ENG0015/__P1.HTM" },
      { slug: "__P2", url: "https://www.vatican.va/archive/ENG0015/__P2.HTM" },
    ]);
  });

  it("reads quoted and absolute hrefs too", () => {
    // __P85.HTM was re-saved through an editor and writes its own links this
    // way. The ToC could be re-saved the same way tomorrow.
    const html =
      '<a href="__P1.HTM">One</a>' +
      '<a HREF="https://www.vatican.va/archive/ENG0015/__P2.HTM">Two</a>';

    expect(discoverVaticanIntratextPages(html, INDEX).map((p) => p.slug)).toEqual([
      "__P1",
      "__P2",
    ]);
  });

  it("keeps the table of contents' order, which is NOT sortable", () => {
    // The base-36 naming runs __P9, __PA … __PZ, __P10. A lexicographic sort
    // puts __P10 long before __PZ, and the parser accepts a paragraph opening
    // mid-element only where the sequence expects it — so a re-ordered list
    // produces a corpus with holes.
    const html = ["__P9", "__PA", "__PZ", "__P10", "__PAE"]
      .map((s) => `<a href=${s}.HTM>x</a>`)
      .join("");

    expect(discoverVaticanIntratextPages(html, INDEX).map((p) => p.slug)).toEqual([
      "__P9",
      "__PA",
      "__PZ",
      "__P10",
      "__PAE",
    ]);
  });

  it("takes each page once, at its first occurrence", () => {
    const html =
      "<a href=__P2.HTM>Section</a><a href=__P1.HTM>Prologue</a><a href=__P2.HTM>Again</a>";

    expect(discoverVaticanIntratextPages(html, INDEX).map((p) => p.slug)).toEqual([
      "__P2",
      "__P1",
    ]);
  });

  it("ignores the navigation the ToC also links", () => {
    // _INDEX.HTM (itself), _AIUTO.HTM (help) and two absolute links into
    // vatican.va's own site are the whole of the rest of this page.
    const html =
      "<a href=_INDEX.HTM>back</a><a href=_AIUTO.HTM>Help</a>" +
      "<a href=http://www.vatican.va/phome_en.htm>The Holy See</a>" +
      "<a href=__P1.HTM>PROLOGUE</a>";

    expect(discoverVaticanIntratextPages(html, INDEX).map((p) => p.slug)).toEqual([
      "__P1",
    ]);
  });
});
