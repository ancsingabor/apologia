import { discoverCorpusThomisticumPages } from "./corpus-thomisticum";
import { discoverKatolikusHuPages } from "./katolikus-hu";
import { discoverVaticanIntratextPages } from "./vatican-intratext";

/**
 * The discoverer registry: a manifest `fetch:` id → the function that reads a
 * document's page list out of its table of contents.
 *
 * ADR-019 settled that the list is discovered at fetch time and never pinned.
 * What it did not settle is that the two editions of one work put their tables
 * of contents in unrelated shapes — 855 fragment-bearing hrefs to 31 print-page
 * slugs on one side, 374 unquoted relative links in a base-36 sequence on the
 * other. `scripts/ingest/fetch.ts` called the Hungarian one by name for every
 * document, which was invisible while only Hungarian could be ingested.
 *
 * So the manifest's `fetch:` value names WHICH table of contents shape rather
 * than merely asserting THAT one is read. An unknown id is fatal for the same
 * reason `parserFor` makes it fatal: there is nothing sensible to fall back to,
 * and a "generic" link scraper over an unknown page would produce a plausible
 * page list bearing no relation to the work's own ordering — which downstream
 * reads as a corpus with holes in it, arriving quietly.
 */

/** A page of a document, as the table of contents names and locates it. */
export interface DiscoveredPage {
  /** Slug as the errata and defect messages name it: 'kek-052-063', '__P79'. */
  slug: string;
  /** Absolute URL to fetch. */
  url: string;
}

type Discoverer = (indexHtml: string, indexUrl: string) => DiscoveredPage[];

const DISCOVERERS: Record<string, Discoverer> = {
  "katolikus-hu-toc": discoverKatolikusHuPages,
  "vatican-intratext-toc": discoverVaticanIntratextPages,
  "corpus-thomisticum-index": discoverCorpusThomisticumPages,
};

export function discovererFor(id: string): Discoverer {
  const discoverer = DISCOVERERS[id];
  if (!discoverer) {
    throw new Error(
      `No discoverer "${id}". Registered: ${Object.keys(DISCOVERERS).join(", ")}.\n` +
        `The manifest's \`fetch:\` names which table of contents shape a ` +
        `document's page list is read from. There is no generic one (ADR-019).`
    );
  }
  return discoverer;
}

/**
 * A table of contents that yields nothing is a changed page, not an empty book.
 *
 * Worth its own failure because it is the one discovery outcome that would
 * otherwise be quiet: zero pages parses to zero units, and the count assertion
 * would report `parsed 0 units, manifest expects 2865` — true, but pointing at
 * the parser instead of at the fetch.
 */
export function assertPagesDiscovered(
  pages: DiscoveredPage[],
  indexUrl: string
): void {
  if (pages.length === 0) {
    throw new Error(
      `No document pages found at ${indexUrl}.\n` +
        `The table of contents' link shape has changed. The page list is ` +
        `discovered rather than pinned on purpose (ADR-019), so this is the ` +
        `expected place to notice a re-slugging — update the pattern in ` +
        `lib/corpus/discover/ rather than hardcoding a list.`
    );
  }
}

export {
  discoverCorpusThomisticumPages,
  discoverKatolikusHuPages,
  discoverVaticanIntratextPages,
};
