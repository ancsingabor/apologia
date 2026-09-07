import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { load } from "js-yaml";
import { z } from "zod";
import { connect } from "./ingest/client";

/**
 * `npm run eval:lint`
 *
 * Resolves every `expected_units` locator in the gold set against ingested
 * units, and fails if one that SHOULD resolve does not.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * `eval/README.md` carries a ⚠️: the locators in the gold set were stated from
 * knowledge of the sources and never checked against ingested text, because
 * there was no ingested text. An unverified gold set produces confident,
 * meaningless numbers — a retriever scored against `ccc:283` gets no credit for
 * finding it if the expected locator was a typo, and full credit for missing it
 * if the locator does not exist at all. Every later claim rests on that.
 *
 * ── The distinction that makes it runnable today ────────────────────────────
 *
 * The gold set names sources the corpus does not have yet: `summa:I.q2.a3`,
 * `humani-generis:36`. Failing on those would make this command useless until
 * the whole corpus exists, and a check nobody can run is a check nobody runs.
 *
 * So a locator is judged against whether its SOURCE is ingested:
 *
 *   * source ingested, locator does not resolve  → FAILURE. The gold set is
 *     wrong about a text we actually hold, which is the case that corrupts
 *     measurement.
 *   * source not ingested                        → pending. Reported and
 *     counted, never fatal. This is the ⚠️, narrowed to exactly the list of
 *     locators still unverified.
 *
 * ⚠️ Pending is not a pass. It is the honest statement that these have not been
 * checked, which is the thing `eval/README.md` asks to be recorded rather than
 * glossed.
 */

const QUESTIONS_DIR = "eval/questions";

const questionSchema = z.looseObject({
  id: z.string().min(1),
  question: z.string().min(1),
  language: z.enum(["hu", "en"]),
  expected_units: z.array(z.string()).default([]),
  expects_refusal: z.boolean().default(false),
});

interface Expectation {
  questionId: string;
  locator: string;
  sourceId: string;
}

/** `ccc:283` → `ccc`. The prefix before the first colon is the source id. */
function sourceOf(locator: string): string {
  return locator.split(":")[0];
}

async function readGoldSet(): Promise<Expectation[]> {
  const files = (await readdir(QUESTIONS_DIR))
    .filter((name) => name.endsWith(".yaml"))
    .sort();

  const expectations: Expectation[] = [];
  for (const file of files) {
    const raw = load(await readFile(join(QUESTIONS_DIR, file), "utf8"));
    const question = questionSchema.parse(raw);

    for (const locator of question.expected_units) {
      expectations.push({
        questionId: question.id,
        locator,
        sourceId: sourceOf(locator),
      });
    }
  }
  return expectations;
}

async function main(): Promise<void> {
  const remote = process.argv.includes("--remote");
  const { db } = connect({ remote });

  const expectations = await readGoldSet();
  const wanted = [...new Set(expectations.map((e) => e.locator))];
  console.log(
    `\n▶ eval:lint — ${wanted.length} distinct locators across ${
      new Set(expectations.map((e) => e.questionId)).size
    } questions\n`
  );

  // Which sources do we actually hold a CURRENT document for? A source with no
  // current document is not ingested, whatever rows may linger from an
  // interrupted run or a superseded revision.
  const { data: documents, error: documentsError } = await db
    .from("documents")
    .select("id, source_id")
    .eq("is_current", true);

  if (documentsError) {
    throw new Error(`reading documents: ${documentsError.message}`);
  }
  const ingested = new Set((documents ?? []).map((row) => row.source_id as string));
  const currentDocuments = (documents ?? []).map((row) => row.id as string);

  // ⚠️ SCOPED TO CURRENT DOCUMENTS, and that is not a detail. Re-ingesting
  // inserts a new document and demotes the old one rather than mutating it, so
  // that citations keep resolving against the text they were verified against
  // (0005_corpus). Superseded rows therefore accumulate, and a locator that
  // resolves ONLY in a superseded document is not one the retriever can return.
  // Counting it as resolved would report a gold set as verified against a text
  // the system no longer serves.
  const { data: resolved, error: unitsError } = await db
    .from("units")
    .select("locator, language")
    .in("document_id", currentDocuments)
    .in("locator", wanted);

  if (unitsError) throw new Error(`resolving locators: ${unitsError.message}`);

  const languagesByLocator = new Map<string, string[]>();
  for (const row of resolved ?? []) {
    const locator = row.locator as string;
    languagesByLocator.set(locator, [
      ...(languagesByLocator.get(locator) ?? []),
      row.language as string,
    ]);
  }

  const failures: Expectation[] = [];
  const pending: Expectation[] = [];
  let ok = 0;

  for (const expectation of expectations) {
    const languages = languagesByLocator.get(expectation.locator);
    if (languages && languages.length > 0) {
      ok += 1;
    } else if (ingested.has(expectation.sourceId)) {
      failures.push(expectation);
    } else {
      pending.push(expectation);
    }
  }

  console.log(`  resolved  ${ok}`);

  if (pending.length > 0) {
    const bySource = new Map<string, string[]>();
    for (const item of pending) {
      bySource.set(item.sourceId, [
        ...(bySource.get(item.sourceId) ?? []),
        `${item.locator} (${item.questionId})`,
      ]);
    }
    console.log(`  pending   ${pending.length} — source not ingested yet:`);
    for (const [source, items] of [...bySource].sort()) {
      console.log(`              ${source}: ${items.join(", ")}`);
    }
  }

  if (failures.length > 0) {
    console.log(`\n  ✗ ${failures.length} locator(s) do NOT resolve in an INGESTED source:`);
    for (const failure of failures) {
      console.log(`      ${failure.locator}  (${failure.questionId})`);
    }
    console.error(
      `\n✗ The gold set expects units that do not exist in a corpus we hold.\n` +
        `  Either the locator is wrong, or ingestion lost a unit. Both corrupt\n` +
        `  measurement silently — a retriever gets no credit for finding a\n` +
        `  paragraph the gold set misnames.\n`
    );
    process.exit(1);
  }

  const verdict =
    pending.length > 0
      ? `✓ every locator in an ingested source resolves. ${pending.length} still pending.`
      : `✓ every locator resolves.`;
  console.log(`\n${verdict}\n`);
}

main().catch((error: unknown) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
