import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  assertPagesDiscovered,
  discovererFor,
  type DiscoveredPage,
} from "@/lib/corpus/discover";
import { rawContentHash } from "@/lib/corpus/hash";
import type { SourcePage } from "@/lib/corpus/parsers";
import type { ManifestDocument } from "@/types/domain";

/**
 * The `fetch` step (ADR-004): content-addressed, cached, hash-verified.
 *
 * ⚠️ THE CACHE DIRECTORY HOLDS CORPUS TEXT AND IS GITIGNORED (ADR-003). The
 * repository ships the manifest and the pipeline, never the text.
 *
 * The cache is not an optimisation. It is what makes the loop this project runs
 * on — inventory by parsing, fix the parser, parse again — cost nothing and hit
 * somebody else's server once. ADR-019 chose the more fragile fetch targets on
 * purpose, and they are not small: 31 pages behind the Hungarian table of
 * contents, 374 behind the English one. At the polite delay below a cold
 * English fetch is a minute and a half of vatican.va's time, and every re-parse
 * after the first should cost it nothing.
 */

const CACHE_ROOT = ".corpus-cache";
const POLITE_DELAY_MS = 250;
const USER_AGENT =
  "apologia-ingest/0.1 (+https://github.com/ancsingabor/apologia) source-grounded research corpus";

export interface FetchedPage extends SourcePage {
  url: string;
  /** sha256 of the decoded page, for the emitted manifest's provenance. */
  rawHash: string;
  fromCache: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Decode per the manifest's declared encoding.
 *
 * ⚠️ NOT `response.text()`, which assumes UTF-8 unless the server says
 * otherwise. The Hungarian pages are UTF-8, but vatican.va is HTML 3.2 served
 * as ISO-8859-1, and ADR-019 corrected the manifest after recording it as UTF-8
 * by mistake. Mis-decoding is permanent under ADR-017's byte-exact comparison:
 * every quotation of a mis-decoded unit fails the gate, and the stored text is
 * simply not what the book prints.
 */
async function decode(response: Response, encoding: string): Promise<string> {
  const buffer = await response.arrayBuffer();
  return new TextDecoder(encoding, { fatal: false }).decode(buffer);
}

function cachePath(sourceId: string, language: string, slug: string): string {
  return join(CACHE_ROOT, sourceId, language, `${slug}.html`);
}

async function readCache(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

async function writeCache(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, "utf8");
}

async function get(url: string, encoding: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/html" },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`GET ${url} → ${response.status} ${response.statusText}`);
  }
  return decode(response, encoding);
}

export interface FetchOptions {
  sourceId: string;
  document: ManifestDocument;
  /** Bypass the cache and re-download every page. */
  refetch: boolean;
  log: (message: string) => void;
}

/**
 * Discover the page list, then fetch every page in reading order.
 *
 * The list is discovered rather than pinned (ADR-019): the integrity check that
 * matters is `expected_units` plus the errata, and that is invariant under the
 * site re-slugging its pages, while a pinned list would break on a re-typeset
 * while proving nothing about the text.
 */
export async function fetchDocument(
  options: FetchOptions
): Promise<{ pages: FetchedPage[]; discovered: DiscoveredPage[] }> {
  const { sourceId, document, refetch, log } = options;

  log(`  index    ${document.indexUrl}`);
  const indexHtml = await get(document.indexUrl, document.encoding);
  const discovered = discovererFor(document.fetch)(indexHtml, document.indexUrl);
  assertPagesDiscovered(discovered, document.indexUrl);
  log(`  pages    ${discovered.length} discovered from the table of contents`);

  const pages: FetchedPage[] = [];
  let downloaded = 0;

  for (const { slug, url } of discovered) {
    const path = cachePath(sourceId, document.language, slug);
    const cached = refetch ? null : await readCache(path);

    let html: string;
    if (cached !== null) {
      html = cached;
    } else {
      // Sequential and unhurried. Somebody else's server, 374 pages of it.
      if (downloaded > 0) await sleep(POLITE_DELAY_MS);
      html = await get(url, document.encoding);
      await writeCache(path, html);
      downloaded += 1;
    }

    pages.push({
      page: slug,
      html,
      url,
      rawHash: rawContentHash(html),
      fromCache: cached !== null,
    });
  }

  log(
    `  fetched  ${downloaded} downloaded, ${pages.length - downloaded} from ${CACHE_ROOT}/`
  );

  return { pages, discovered };
}
