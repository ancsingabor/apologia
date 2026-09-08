import type { DiscoveredPage } from "./index";

/**
 * Discovering the English Catechism's page list from its IntraText table of
 * contents at `vatican.va/archive/ENG0015/_INDEX.HTM`.
 *
 * Same rule as the Hungarian side (ADR-019): the list is read at fetch time,
 * never pinned. Here that restraint costs less and buys the same thing — the
 * integrity check that matters is `expected_units` plus the errata, and it is
 * invariant under the site renumbering its files.
 *
 * ── 374 pages, and the ToC's order is the document's order ──────────────────
 *
 * IntraText splits the work at every section heading, so where katolikus.hu has
 * 31 pages of print-page ranges this has 374 pages of one section each, named
 * in a base-36 sequence: `__P1` … `__P9`, `__PA` … `__PZ`, `__P10` … `__PAE`.
 *
 * That naming is NOT sortable — `__P10` follows `__PZ`, and a lexicographic
 * sort puts it long before. So the order is taken from the table of contents
 * and nothing re-sorts it. This is load-bearing for the same reason it is in
 * Hungarian: `parseVaticanIntratext` accepts a paragraph opening mid-element
 * only where the sequence expects it, and the strictly-increasing assertion is
 * meaningless per page. It is not asserted here — a mis-ordering surfaces
 * downstream as a monotonicity failure, which also catches orderings that look
 * plausible.
 *
 * ── What the ToC does not link ──────────────────────────────────────────────
 *
 * Unlike the Hungarian ToC, which also links the subject index, this one links
 * body pages only: `_INDEX.HTM` (itself), `_AIUTO.HTM` (help) and two absolute
 * links to vatican.va's own navigation are the whole of the rest, and the `__P`
 * prefix excludes all four. Six of the 374 carry no numbered paragraph — the
 * Creeds, the commandment epigraphs, an Article title page — and yield nothing,
 * exactly as the Hungarian front matter does.
 */

/**
 * Links into the document body. Attributes here are UNQUOTED (`href=__P1.HTM`),
 * which is HTML 3.2 and legal; the optional quote makes the pattern survive a
 * re-save through an editor that adds them — the shape `__P85.HTM` is already
 * in, and which the parser has to cope with too.
 *
 * The ToC lists each page once, so there is no fragment to strip and no
 * de-duplication to do; both are kept anyway, because the cost is a `Set` and
 * the alternative is a silent doubling if the page ever gains cross-links.
 */
const PAGE_HREF = /href\s*=\s*"?([^"#?\s>]*?(__P[0-9A-Za-z]+)\.HTM)/gi;

/**
 * Extract the ordered, de-duplicated page list from the table of contents.
 *
 * `indexUrl` resolves the relative hrefs; passing the ToC's own URL is what
 * makes this correct without hardcoding the host.
 */
export function discoverVaticanIntratextPages(
  indexHtml: string,
  indexUrl: string
): DiscoveredPage[] {
  const pages: DiscoveredPage[] = [];
  const seen = new Set<string>();

  PAGE_HREF.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PAGE_HREF.exec(indexHtml)) !== null) {
    const [, href, slug] = match;
    if (seen.has(slug)) continue;
    seen.add(slug);
    pages.push({ slug, url: new URL(href, indexUrl).toString() });
  }

  return pages;
}
