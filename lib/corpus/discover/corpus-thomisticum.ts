import type { DiscoveredPage } from "./index";

/**
 * Page discovery for the Summa Theologiae at corpusthomisticum.org.
 *
 * The index (`iopera.html`) lists the whole Thomistic corpus; the Summa's pages
 * are the ones whose file name starts `sth`. 87 of them, from `sth0000` (the
 * prologue to the work) through `sth4084`.
 *
 * ⚠️ A PAGE IS NOT A QUESTION, and generating the list arithmetically is the
 * mistake this file exists to prevent. `sth1002` holds one question, `sth2001`
 * holds five, `sth3001` holds sixteen. The four-digit suffix is a page index
 * whose relation to question numbers is not a function — the index states the
 * mapping and nothing else does. ADR-019 already requires discovery over
 * pinning; here it is also the only thing that works.
 *
 * ── The Supplementum is not here, and that is correct ───────────────────────
 *
 * The index lists a Supplementum (quaestiones 1-99) under the name of
 * **Fr. Rainaldus Romanus** — Reginald of Piperno assembled it after Thomas
 * died, out of the earlier commentary on the Sentences. It is hosted elsewhere
 * and does not use the `sth` scheme, so this pattern excludes it by the
 * source's OWN attribution rather than by our convenience. `authority_tier: 3`
 * in the manifest is assigned to Aquinas (ADR-010); it is not ours to lend to a
 * compiler working from his notes.
 */

/**
 * Links to a Summa page. The attribute may be quoted or not and the tag may be
 * upper or lower case — this index is hand-maintained HTML 4.0 — so the pattern
 * commits to neither, the same rule `vatican-intratext` learned from `__P85`.
 */
const PAGE_HREF = /href\s*=\s*"?([^"#?\s>]*?(sth\d{4})\.html)/gi;

export function discoverCorpusThomisticumPages(
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

  // The index lists the parts in reading order, but it also carries navigation
  // and a bibliography that may link a page a second time. Sorting by slug is
  // the work's own order here — `sth1…` is Prima Pars, `sth4…` Tertia — and it
  // makes the list independent of where in the page a link happens to sit.
  return pages.sort((a, b) => a.slug.localeCompare(b.slug));
}
