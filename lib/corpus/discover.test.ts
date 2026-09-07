import { describe, expect, it } from "vitest";
import { assertPagesDiscovered, discoverKatolikusHuPages } from "./discover";

const INDEX = "https://katolikus.hu/cikk/a-katolikus-egyhaz-katekizmusa";

/**
 * The markup shapes are copied from the real table of contents; no corpus text
 * is involved, because a ToC entry is a link and a heading.
 */
describe("discovery", () => {
  it("resolves root-relative hrefs against the index URL", () => {
    const pages = discoverKatolikusHuPages(
      '<a href="/dokumentumtar/kek-005-006">Bevezetés</a>',
      INDEX
    );

    expect(pages).toEqual([
      { slug: "kek-005-006", url: "https://katolikus.hu/dokumentumtar/kek-005-006" },
    ]);
  });

  it("collapses the fragment links a ToC repeats per section heading", () => {
    // The real page carries 855 hrefs for 31 pages: one per page plus one per
    // section, each with a #K0056 fragment.
    const html = `
      <a href="/dokumentumtar/kek-031-051">A kinyilatkoztatás</a>
      <a href="/dokumentumtar/kek-031-051#K0051">I. szakasz</a>
      <a href="/dokumentumtar/kek-031-051#K0054">II. szakasz</a>
      <a href="/dokumentumtar/kek-031-051#K0054">II. szakasz (ismét)</a>`;

    expect(discoverKatolikusHuPages(html, INDEX).map((p) => p.slug)).toEqual([
      "kek-031-051",
    ]);
  });

  it("preserves table-of-contents order, which is reading order", () => {
    // Load-bearing: the paragraph sequence spans pages, so `parseKatolikusHu`
    // needs every page at once and in order. A mis-ordering is not asserted
    // here — it surfaces downstream as a monotonicity failure.
    const html = `
      <a href="/dokumentumtar/kek-005-006">a</a>
      <a href="/dokumentumtar/kek-052-063">c</a>
      <a href="/dokumentumtar/kek-017-022">b</a>`;

    expect(discoverKatolikusHuPages(html, INDEX).map((p) => p.slug)).toEqual([
      "kek-005-006",
      "kek-052-063",
      "kek-017-022",
    ]);
  });

  it("ignores links outside the document tree", () => {
    const html = `
      <a href="/cikk/valami-mas">Egyéb</a>
      <a href="/dokumentumtar/kek-005-006">KEK</a>
      <a href="/dokumentumtar/masik-dokumentum">Másik</a>`;

    expect(discoverKatolikusHuPages(html, INDEX).map((p) => p.slug)).toEqual([
      "kek-005-006",
    ]);
  });

  it("accepts an absolute href", () => {
    const pages = discoverKatolikusHuPages(
      '<a href="https://katolikus.hu/dokumentumtar/kek-005-006">KEK</a>',
      INDEX
    );
    expect(pages[0].url).toBe("https://katolikus.hu/dokumentumtar/kek-005-006");
  });

  it("collects the subject index too, rather than filtering by slug", () => {
    // ADR-019 inventoried 31 pages; the ToC links 32. `kek-targymutato` is the
    // subject index — back matter. It is deliberately NOT excluded: a denylist
    // would be pinning under another name. It yields no units because it has no
    // `name="K…"` anchors, its numbers sit inside href links, and an index runs
    // alphabetically so the sequence never expects them.
    const html = `
      <a href="/dokumentumtar/kek-697-723">Utolsó rész</a>
      <a href="/dokumentumtar/kek-targymutato">Tárgymutató</a>`;

    expect(discoverKatolikusHuPages(html, INDEX).map((p) => p.slug)).toEqual([
      "kek-697-723",
      "kek-targymutato",
    ]);
  });

  it("is not confused by a re-slugged page name", () => {
    // The list is discovered rather than pinned precisely so a re-typeset does
    // not break the fetch (ADR-019). Integrity is `expected_units` + errata.
    const pages = discoverKatolikusHuPages(
      '<a href="/dokumentumtar/kek-elso-resz">Első rész</a>',
      INDEX
    );
    expect(pages[0].slug).toBe("kek-elso-resz");
  });
});

describe("assertPagesDiscovered", () => {
  it("fails loudly on an empty result", () => {
    // Zero pages would otherwise parse to zero units and be reported as a count
    // mismatch — true, but pointing at the parser instead of at the fetch.
    expect(() => assertPagesDiscovered([], INDEX)).toThrow(/link shape has changed/);
  });

  it("passes when pages were found", () => {
    expect(() =>
      assertPagesDiscovered([{ slug: "kek-005-006", url: INDEX }], INDEX)
    ).not.toThrow();
  });
});
