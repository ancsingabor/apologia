import type { DiscoveredPage } from "./index";

/**
 * Discovering the Hungarian Catechism's page list from its table of contents.
 *
 * ADR-019 requires this list be **discovered at fetch time, not pinned**. The
 * reasoning is worth restating, because pinning 31 slugs is obviously cheaper
 * and obviously more stable:
 *
 *   The integrity check that matters is `expected_units` plus the errata, and
 *   that check is invariant under the site re-slugging its pages. A pinned list
 *   of print-page ranges would break on a re-typeset while proving nothing
 *   about the text — it would fail loudly for a reason unrelated to
 *   correctness, and pass silently if a page were retitled but re-ordered.
 *
 * So: take the order the table of contents gives, and let the assertions in
 * `./assert.ts` decide whether the result is the Catechism.
 *
 * ── The list over-collects, on purpose ──────────────────────────────────────
 *
 * ADR-019 inventoried 31 pages. Discovery finds **32**: the table of contents
 * also links `kek-targymutato`, the subject index — back matter, 1.1 MB of
 * entries like *"Ábel – az igaz 58; – meggyilkolása 401, 2559"*.
 *
 * That page is not filtered out, and the restraint is the point. A slug
 * denylist would be pinning under another name, and it would have to be
 * maintained against a site that is expected to re-slug. The page is instead
 * allowed through and yields nothing, by three independent mechanisms:
 *
 *   1. it carries no `name="K…"` anchors at all, so `MARKER_ANCHORED` finds
 *      nothing — every number in it is a `href` link INTO the body;
 *   2. its numbers sit inside `<a href>` tags rather than opening a `<p>` or
 *      following a `<br><br>`, so `MARKER_BARE` finds nothing either;
 *   3. even a match would need the sequence to expect it, and an index runs in
 *      alphabetical order — "Ábel 58" after §2865.
 *
 * The count lands on exactly 2,865 with the whole page in scope. This is what
 * ADR-019 meant by the integrity check being `expected_units` plus the errata
 * rather than the file list: discovery is allowed to be approximate because
 * something downstream is exact.
 *
 * ── Order is load-bearing ────────────────────────────────────────────────────
 *
 * `parseKatolikusHu` takes every page at once and in reading order, because the
 * paragraph sequence spans pages: an un-anchored number is accepted only where
 * the sequence expects it, and the strictly-increasing assertion is meaningless
 * per page. A ToC in document order gives reading order for free. A mis-ordered
 * list is not checked here — it is caught downstream as a monotonicity failure,
 * which is a better place for it because that check also catches orderings that
 * look plausible.
 */

/**
 * Links into the document body. The ToC repeats a page once per section
 * heading, with a `#K0056` fragment — 855 hrefs for 31 pages — so the fragment
 * is dropped and the first occurrence of each page wins.
 */
const PAGE_HREF = /href="([^"#?]*\/dokumentumtar\/(kek-[a-z0-9-]+))[^"]*"/gi;

/**
 * Extract the ordered, de-duplicated page list from the table of contents.
 *
 * `indexUrl` resolves the site's root-relative hrefs; passing the ToC's own URL
 * is what makes this correct without hardcoding the host.
 */
export function discoverKatolikusHuPages(
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
