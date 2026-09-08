import { readFile } from "node:fs/promises";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { load } from "js-yaml";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

/**
 * PostgREST caps a response, so 2,865 units need paging.
 *
 * ⚠️ ORDERED, because Postgres makes no promise about row order without an
 * `ORDER BY` and `.range()` alone pages over a sequence the server may change.
 * Unordered, this test would probe an arbitrary subset of the corpus and report
 * it clean — the worst outcome a check has available. See the note in
 * `scripts/ingest/siblings.ts`, where the same bug surfaced first.
 */
const PAGE = 1000;

/** Every stored unit of a document — the bytes a citation is verified against. */
async function storedUnits(documentId: string): Promise<StoredUnit[]> {
  const units: StoredUnit[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("units")
      .select("locator, text")
      .eq("document_id", documentId)
      .order("ordinal")
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

/**
 * ── The two spellings of a probe must agree ─────────────────────────────────
 *
 * Every probe is written twice: as the `RegExp` that runs, and as the POSIX
 * pattern a failure hands you for psql. That is duplication, and duplication
 * nothing executes is duplication that drifts — the `sql` half is never used
 * for matching, so an edit to `pattern` alone would go unnoticed until someone
 * pasted a query that quietly reproduced nothing.
 *
 * So the two check each other, which is this codebase's own move: `assert.ts`
 * exists because two independent spellings of the same fact are worth more than
 * one. Here it is worth more than usual, because the dialects genuinely differ
 * and JavaScript is the weaker of the two for this corpus — `\b` is defined
 * over [A-Za-z0-9_] and cannot see a word ending in `ó`.
 *
 * ⚠️ IT IS CHECKED OVER ADVERSARIAL TEXT, NOT OVER THE REAL CORPUS. Comparing
 * across `ccc` is nearly free: the corpus is clean, so almost every probe
 * returns zero on both sides and "they agree" costs nothing to satisfy. It
 * would NOT have caught the `\b` bug, because no furniture word is actually
 * contaminated. The fixture below contaminates one on purpose.
 */
const DIALECT_SOURCE = "test-probe-dialect";

/** One unit per probe, each crafted to trip exactly that probe. */
const ADVERSARIAL: [string, string][] = [
  ["markup-residue", "A tag survived <em>normalisation</em>."],
  ["entity-residue", "He said &ldquo;something&rdquo; aloud."],
  ["bracket-footnote", "A leaked footnote marker[64] mid-sentence."],
  ["empty-text", " "],
  ["double-space", "A tag became  a space it should not have."],
  ["leading-marker-residue", ". A marker left its period behind."],
  // The `\b` case. JavaScript saw nothing here; Postgres saw it.
  ["furniture-hu", "A bekezdés vége. Tárgymutató"],
  ["furniture-en", "The paragraph ends. IntraText"],
  ["furniture-nav", "The paragraph ends. Previous"],
  // Must trip NOTHING: the guards against a probe crying wolf.
  ["clean-hu", "A Tárgymutatóban minden megtalálható."],
  ["clean-en", "Previously God could not be represented by an image."],
];

describe("the JavaScript and SQL spellings of a probe", () => {
  let documentId: string;

  beforeAll(async () => {
    await db.from("sources").delete().eq("id", DIALECT_SOURCE);
    await db.from("sources").insert({
      id: DIALECT_SOURCE,
      title: "Probe dialect fixture",
      kind: "church_document",
      locator_scheme: "test:<n>",
      chunking: "numbered-paragraph",
      license: "test-licence",
    });
    const { data, error } = await db
      .from("documents")
      .insert({
        source_id: DIALECT_SOURCE,
        language: "hu",
        content_hash: "0".repeat(64),
        unit_count: ADVERSARIAL.length,
        is_current: true,
      })
      .select("id");
    if (error) throw new Error(error.message);
    documentId = data![0].id as string;

    const { error: unitError } = await db.from("units").insert(
      ADVERSARIAL.map(([name, text], index) => ({
        document_id: documentId,
        locator: `test:${name}`,
        language: "hu",
        text,
        ordinal: index + 1,
      }))
    );
    if (unitError) throw new Error(unitError.message);
  });

  afterAll(async () => {
    await db.from("sources").delete().eq("id", DIALECT_SOURCE);
  });

  const probes = [
    ...TEXT_PROBES,
    ...["Tárgymutató", "IntraText", "Previous"].map(furnitureProbe),
  ];

  it.each(probes.map((probe) => [probe.name, probe] as const))(
    "%s matches the same units either way",
    async (_name, probe) => {
      const units = await storedUnits(documentId);
      const inJs = probeUnits(units, [probe])
        .map((hit) => hit.locator)
        .sort();

      const { data, error } = await db
        .from("units")
        .select("locator")
        .eq("document_id", documentId)
        .filter("text", "match", probe.sql);
      if (error) throw new Error(`${probe.name} as SQL: ${error.message}`);
      const inSql = (data ?? []).map((row) => row.locator as string).sort();

      expect(inJs, `probe.pattern and probe.sql disagree for ${probe.name}`).toEqual(
        inSql
      );
      // And neither is vacuous: a probe that matches nothing on adversarial
      // text agrees with the other trivially and checks nothing.
      expect(inJs.length).toBeGreaterThan(0);
    }
  );
});
