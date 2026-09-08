import { readFile } from "node:fs/promises";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { parseErrata } from "@/lib/corpus/errata";
import { parseManifest } from "@/lib/corpus/manifest";
import {
  TEXT_PROBES,
  furnitureProbe,
  probeFailure,
  probeSql,
  probeUnits,
  staleDeclarations,
  undeclaredHits,
  type StoredUnit,
} from "@/lib/corpus/probes";

/**
 * ADR-019's third method step, automated at last.
 *
 * > **Inventory by parsing; assert over the parse; then probe the stored text.**
 * > The assertions check that the corpus has the right *shape* […] They cannot
 * > check that a unit's text is only its text, because contamination that reads
 * > as prose is invisible to every structural signal. That question is asked of
 * > the database, once the rows exist.
 *
 * ADR-019 § Amendment 2 said those probes were "now part of `integration/`, so
 * the check runs rather than being remembered." They were not, and the English
 * ingest paid for it: the probes were run by hand a second time, and would have
 * been run by hand for every source after that or forgotten. This file is what
 * makes the sentence true.
 *
 * ── Why this test reads the REAL corpus, when every other test invents one ───
 *
 * The rest of `integration/` invents three units, because it is testing
 * row-level upsert behaviour and 2,865 real paragraphs would ship corpus text
 * (ADR-003) and add nothing. This test is the exception, and has to be:
 *
 *   **the thing under suspicion IS the real ingested text.** A probe over an
 *   invented corpus tests the regex. A probe over the stored corpus tests the
 *   parser, the normaliser and the body-boundary logic at once, which is the
 *   only place their output has ever been wrong.
 *
 * It ships no corpus text either way: it asserts an EMPTY result set, and the
 * excerpt in a failure message only exists on the path where the corpus is
 * already broken.
 *
 * ── When there is no corpus, this test SKIPS and says so ────────────────────
 *
 * A fresh clone has an empty database. Skipping is the honest outcome — the
 * probe has nothing to ask — but it is announced rather than silent, because a
 * check that quietly passes on no rows is worse than no check at all.
 */

const LOCAL_HOSTS = ["localhost", "127.0.0.1"];

function localClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Run via `npm run test:integration` — scripts/integration.sh wires up the local stack."
    );
  }
  if (!LOCAL_HOSTS.includes(new URL(url).hostname)) {
    throw new Error(`Refusing to run against a non-local target: ${url}`);
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const db = localClient();

/** Every (source, language) the manifest declares an errata file for. */
async function declaredDocuments() {
  const sources = parseManifest(
    load(await readFile("corpus/sources.yaml", "utf8"))
  );
  return sources.flatMap((source) =>
    source.documents
      .filter((document) => document.errata !== null)
      .map((document) => ({
        sourceId: source.id,
        language: document.language,
        errataPath: document.errata as string,
      }))
  );
}

async function currentDocumentId(
  sourceId: string,
  language: string
): Promise<string | null> {
  const { data, error } = await db
    .from("documents")
    .select("id")
    .eq("source_id", sourceId)
    .eq("language", language)
    .eq("is_current", true)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data?.[0]?.id as string | undefined) ?? null;
}

/** PostgREST caps a response, so 2,865 units need paging. */
const PAGE = 1000;

/** Every stored unit of a document — the bytes a citation is verified against. */
async function storedUnits(documentId: string): Promise<StoredUnit[]> {
  const units: StoredUnit[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("units")
      .select("locator, text")
      .eq("document_id", documentId)
      .range(from, from + PAGE - 1);

    if (error) throw new Error(`reading units failed: ${error.message}`);
    const page = data ?? [];
    units.push(
      ...page.map((row) => ({
        locator: row.locator as string,
        text: row.text as string,
      }))
    );
    if (page.length < PAGE) return units;
  }
}

const documents = await declaredDocuments();

describe.each(documents)(
  "the stored text of $sourceId ($language)",
  ({ sourceId, language, errataPath }) => {
    it("contains only its own text, or a declared exception", async () => {
      const documentId = await currentDocumentId(sourceId, language);
      if (documentId === null) {
        // Announced, never silent. `npm run ingest -- --source=… --language=…`.
        console.warn(
          `  ⚠ skipped: no current ${sourceId} (${language}) document ingested locally`
        );
        return;
      }

      const errata = parseErrata(load(await readFile(errataPath, "utf8")));
      const units = await storedUnits(documentId);
      expect(units.length).toBeGreaterThan(0);

      const probes = [...TEXT_PROBES, ...errata.furniture.map(furnitureProbe)];
      const hits = probeUnits(units, probes);

      const undeclared = undeclaredHits(hits, errata);
      // Hand over the query for the first hit, so investigating starts in psql
      // rather than by reconstructing a regex from a stack trace.
      const first = probes.find((probe) => probe.name === undeclared[0]?.probe);
      expect(
        undeclared,
        probeFailure(undeclared, first && probeSql(first, sourceId, language))
      ).toEqual([]);
    });

    it("declares no exception that has stopped firing", async () => {
      // A declaration nobody revisits is how a strict check goes soft — and
      // here a stale one also means the text moved under a note that was
      // checked against the old wording.
      const documentId = await currentDocumentId(sourceId, language);
      if (documentId === null) return;

      const errata = parseErrata(load(await readFile(errataPath, "utf8")));
      const hits = probeUnits(await storedUnits(documentId), TEXT_PROBES);

      expect(staleDeclarations(hits, errata)).toEqual([]);
    });
  }
);
