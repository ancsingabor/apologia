import { readFile } from "node:fs/promises";
import { load } from "js-yaml";
import { assertCorpus } from "@/lib/corpus/assert";
import { chunkerFor } from "@/lib/corpus/chunk";
import { emptyErrata, parseErrata } from "@/lib/corpus/errata";
import { documentContentHash } from "@/lib/corpus/hash";
import { parseManifest, selectDocument } from "@/lib/corpus/manifest";
import { parserFor } from "@/lib/corpus/parsers";
import type { CorpusErrata, ManifestDocument } from "@/types/domain";
import { connect } from "./client";
import { emitManifest } from "./emit";
import { fetchDocument } from "./fetch";
import { upsertDocument } from "./upsert";

/**
 * `npm run ingest -- --source=ccc --language=hu`
 *
 * The pipeline of ADR-004, in order:
 *
 *   fetch → parse → assert → chunk → upsert → emit
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

const USAGE = `
Usage: npm run ingest -- --source=<id> --language=<hu|en> [options]

  --dry-run     fetch, parse and assert; touch no database
  --refetch     bypass the .corpus-cache/ and re-download every page
  --remote      permit writing to a non-local Supabase target
`;

interface Args {
  source: string;
  language: string;
  dryRun: boolean;
  refetch: boolean;
  remote: boolean;
}

function parseArgs(argv: string[]): Args {
  const flags = new Map<string, string>();
  for (const arg of argv) {
    const match = /^--([a-z-]+)(?:=(.*))?$/.exec(arg);
    if (!match) throw new Error(`Unrecognised argument: ${arg}\n${USAGE}`);
    flags.set(match[1], match[2] ?? "true");
  }

  const source = flags.get("source");
  const language = flags.get("language");
  if (!source || !language) {
    throw new Error(`--source and --language are both required.\n${USAGE}`);
  }

  return {
    source,
    language,
    dryRun: flags.get("dry-run") === "true",
    refetch: flags.get("refetch") === "true",
    remote: flags.get("remote") === "true",
  };
}

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
  return emptyErrata(sourceId, document.language as "hu" | "en" | "la", expectedUnits);
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

  const result = await upsertDocument({
    db: target.db,
    source,
    document,
    units,
    chunks,
    contentHash,
    log,
  });

  if (result.status === "unchanged") {
    log(`\n✓ unchanged — nothing to do. The current document already carries this hash.\n`);
    return;
  }

  // ── emit ──────────────────────────────────────────────────────────────────
  const path = await emitManifest({
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
    report,
  });

  log(`  emitted  ${path}`);
  log(`\n✓ ingested ${result.unitCount} units, ${result.chunkCount} chunks.\n`);
}

main().catch((error: unknown) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
