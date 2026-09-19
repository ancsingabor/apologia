import { readFile } from "node:fs/promises";
import { load } from "js-yaml";
import { assertCorpus } from "@/lib/corpus/assert";
import {
  compareLocators,
  crossLingualFailure,
} from "@/lib/corpus/cross-lingual";
import { chunkerFor } from "@/lib/corpus/chunk";
import { emptyErrata, parseErrata } from "@/lib/corpus/errata";
import { documentContentHash } from "@/lib/corpus/hash";
import { parseManifest, selectDocument } from "@/lib/corpus/manifest";
import { parserFor } from "@/lib/corpus/parsers";
import type { CorpusErrata, ManifestDocument } from "@/types/domain";
import { parseArgs } from "./args";
import { connect } from "./client";
import { emitManifest } from "./emit";
import { fetchDocument } from "./fetch";
import { currentLocators, siblingLanguages } from "./siblings";
import { upsertDocument } from "./upsert";

/**
 * `npm run ingest -- --source=ccc --language=hu`
 *
 * The pipeline of ADR-004, in order:
 *
 *   fetch → parse → assert → chunk → hash → cross-lingual → upsert → emit
 *
 * It is a sequence of functions with a main(), not a distributed choreography,
 * and that is the point: the CLI form keeps the pipeline readable for a
 * repository whose purpose includes being learned from. Every stage that can be
 * a pure function is one, and lives in `lib/corpus/`; this file holds the
 * network, the filesystem, the database and the reporting.
 *
 * `embed` is deliberately absent. `chunk_embeddings` is keyed by (chunk, model)
 * so that embedding is a second pass run once per candidate model — which is
 * what "ADR-008 is decided by measurement" has to mean concretely. Wiring one
 * provider in here would settle that question by accident.
 */

const log = (message: string) => console.log(message);

/**
 * Load a document's declared errata, or an empty declaration when it has none.
 *
 * ⚠️ `errata: null` means "nothing declared". For an uninventoried source that
 * means UNCHECKED, not clean — the manifest says exactly this about the English
 * CCC. An empty declaration set makes every defect undeclared, so such a source
 * fails its first ingest loudly, which is the correct outcome and is why this
 * does not quietly succeed.
 */
async function loadErrata(
  document: ManifestDocument,
  sourceId: string,
  expectedUnits: number | null
): Promise<CorpusErrata> {
  if (document.errata) {
    return parseErrata(load(await readFile(document.errata, "utf8")));
  }
  if (expectedUnits === null) {
    throw new Error(
      `Source "${sourceId}" (${document.language}) declares neither an errata ` +
        `file nor expected_units. There is nothing to assert the parse against, ` +
        `and an unasserted parse is how a corpus acquires silent holes (ADR-019).`
    );
  }
  return emptyErrata(sourceId, document.language, expectedUnits);
}

function reportAssertions(report: ReturnType<typeof assertCorpus>["report"]): void {
  log(`  units    ${report.unitCount} after relabelling`);

  if (report.stale.length > 0) {
    // Not fatal, but loud. A stale allowance is permission the checks no longer
    // need, and permission nobody revisits is how a strict check goes soft.
    log(`\n  ⚠ ${report.stale.length} STALE declaration(s) — the source was fixed upstream:`);
    for (const allowance of report.stale) {
      log(`      ${allowance.locator}  ${allowance.kind}`);
    }
    log(`    Delete them from the errata file so they stop standing as permission.`);
  }

  if (!report.ok) {
    log(`\n  ✗ ${report.undeclared.length} UNDECLARED defect(s):`);
    for (const defect of report.undeclared.slice(0, 40)) {
      log(`      ${defect.locator}  ${defect.kind}  [${defect.page ?? "—"}]  ${defect.detail}`);
    }
    if (report.undeclared.length > 40) {
      log(`      … and ${report.undeclared.length - 40} more`);
    }
    throw new Error(
      "Assertions failed. An undeclared defect stops the ingest by design " +
        "(ADR-019): the rules stay strict and known faults are declared in " +
        "corpus/errata/, so meeting a new one is never an argument for " +
        "loosening the rules. Inventory the fault, verify it against the " +
        "authoritative text, and declare it — or fix the parser."
    );
  }

  log(`  assert   ok — every defect declared`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // ── manifest ──────────────────────────────────────────────────────────────
  const sources = parseManifest(load(await readFile("corpus/sources.yaml", "utf8")));
  const { source, document } = selectDocument(sources, args.source, args.language);

  log(`\n▶ ${source.title} — ${document.language} (revision ${document.revision})`);

  // ── fetch ─────────────────────────────────────────────────────────────────
  const { pages } = await fetchDocument({
    sourceId: source.id,
    document,
    refetch: args.refetch,
    log,
  });

  // ── parse ─────────────────────────────────────────────────────────────────
  const parsed = parserFor(document.parser)(pages);
  log(`  parsed   ${parsed.units.length} units from ${pages.length} pages`);
  if (parsed.unnumberedPages.length > 0) {
    // Front matter plus the subject index — see lib/corpus/discover.ts. Listed
    // rather than counted: a BODY page falling silent would appear here first,
    // and would otherwise be a number that grew by one.
    log(`  skipped  ${parsed.unnumberedPages.length} pages with no numbered paragraphs`);
    log(`             ${parsed.unnumberedPages.join(", ")}`);
  }
  // A jump in these counters between runs means the source changed shape.
  const skipped = Object.entries(parsed.skipped)
    .map(([kind, count]) => `${kind}=${count}`)
    .join("  ");
  if (skipped) log(`  ignored  ${skipped}`);

  // ── assert ────────────────────────────────────────────────────────────────
  const errata = await loadErrata(document, source.id, source.expectedUnits);
  const { units, report } = assertCorpus(parsed, errata);
  reportAssertions(report);

  // ── chunk ─────────────────────────────────────────────────────────────────
  const chunks = chunkerFor(source.chunking)(units);
  const contentHash = documentContentHash(units);
  log(`  chunked  ${chunks.length} chunks (${chunks[0]?.strategy ?? "—"})`);
  log(`  hash     ${contentHash}`);

  if (args.dryRun) {
    log(`\n✓ dry run — nothing written. ${units.length} units, ${chunks.length} chunks.\n`);
    return;
  }

  // ── upsert ────────────────────────────────────────────────────────────────
  const target = connect({ remote: args.remote });
  log(`\n  target   ${new URL(target.url).host}${target.local ? " (local)" : " ⚠ REMOTE"}`);

  // ── cross-lingual ─────────────────────────────────────────────────────────
  // Before anything is written, not after. ADR-002 claims a locator is a
  // cross-lingual identity; this is where that stops being prose. It runs
  // against the corpus rather than the manifest, so it also stands in for the
  // agreement check `assert.ts` cannot run over a source that states each
  // paragraph number once (ADR-020).
  //
  // Nothing to compare on the first language of a source, which is not a pass:
  // the check is a property of a PAIR, and it says so.
  const siblings = await siblingLanguages(target.db, source.id, document.language);
  let crossLingual = "no other language ingested";
  if (siblings.length === 0) {
    log(`  cross    no other language ingested yet — nothing to compare`);
  }
  for (const sibling of siblings) {
    const existing = await currentLocators(target.db, source.id, sibling);
    const report = compareLocators(
      units.map((unit) => unit.locator),
      existing,
      sibling
    );
    if (!report.ok) throw new Error(crossLingualFailure(report, document.language));
    crossLingual = `${report.shared} locators identical to ${siblings.join("/")}`;
    log(`  cross    ${report.shared} locators, identical to ${sibling}`);
  }

  const result = await upsertDocument({
    db: target.db,
    source,
    document,
    units,
    chunks,
    contentHash,
    log,
  });

  // ── emit ──────────────────────────────────────────────────────────────────
  // Runs even when the upsert was a no-op, so that a run whose emit failed can
  // recover: otherwise the next run reports "unchanged" and returns before ever
  // reaching here, and no flag rewrites the manifest. `emitManifest` compares
  // content and writes only on a difference, so a genuine no-op still leaves
  // the working tree clean.
  const emitted = await emitManifest({
    sourceId: source.id,
    language: document.language,
    revision: document.revision,
    edition: document.edition,
    encoding: document.encoding,
    indexUrl: document.indexUrl,
    parser: document.parser,
    chunking: chunks[0]?.strategy ?? source.chunking,
    contentHash,
    unitCount: result.unitCount,
    chunkCount: result.chunkCount,
    pages: pages.map((page) => ({ slug: page.page, raw_hash: page.rawHash })),
    unnumberedPages: parsed.unnumberedPages,
    skipped: parsed.skipped,
    anchorSignal: parsed.anchorSignal,
    crossLingual,
    report,
  });

  if (emitted.written) log(`  emitted  ${emitted.path}`);

  if (result.status === "unchanged") {
    log(`\n✓ unchanged — nothing to do. The current document already carries this hash.\n`);
    return;
  }
  log(`\n✓ ingested ${result.unitCount} units, ${result.chunkCount} chunks.\n`);
}

main().catch((error: unknown) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
