import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ManifestDocument,
  ManifestSource,
  ParsedChunk,
  ParsedUnit,
} from "@/types/domain";

/**
 * The `upsert` step (ADR-004): idempotent, content-hashed, resumable.
 *
 * ── There are no transactions here, and the ordering is what replaces one ────
 *
 * `supabase-js` speaks PostgREST, which has no multi-statement transaction. So
 * atomicity is bought with ordering instead, and the order below is the
 * load-bearing part of this file:
 *
 *   1. sweep any incomplete document left by a crashed run
 *   2. upsert the source
 *   3. hash the units; if the current document already carries that hash, stop
 *   4. insert the new document as NOT current, with unit_count 0
 *   5. insert units, chunks, chunk_units
 *   6. demote the old current document, then promote the new one
 *
 * A crash anywhere in 4–5 leaves a document that is not current and has
 * unit_count 0 — a state no completed run can produce, which is what makes it a
 * reliable signature for step 1 to sweep. Nothing was ever promoted, so no
 * reader and no citation ever saw a half-ingested corpus.
 *
 * Step 6's order is forced by `documents_one_current_per_language_idx`, a
 * partial unique index over (source_id, language) where is_current. Two current
 * documents are unrepresentable, so the demote must precede the promote — and
 * that constraint is a feature: it makes "which text was this citation verified
 * against" answerable by construction rather than by convention.
 */

/** PostgREST rejects very large bodies; 2,865 rows go in comfortable batches. */
const BATCH = 500;

type Row = Record<string, unknown>;

async function insertBatched(
  db: SupabaseClient,
  table: string,
  rows: Row[],
  select?: string
): Promise<Row[]> {
  const returned: Row[] = [];

  for (let index = 0; index < rows.length; index += BATCH) {
    const slice = rows.slice(index, index + BATCH);
    const insert = db.from(table).insert(slice);
    const { data, error } = select ? await insert.select(select) : await insert;

    if (error) {
      throw new Error(
        `insert into ${table} (rows ${index}–${index + slice.length}) failed: ${error.message}`
      );
    }
    if (data) returned.push(...(data as unknown as Row[]));
  }

  return returned;
}

/**
 * Step 1. Remove documents a previous run never finished.
 *
 * `is_current = false AND unit_count = 0` is exactly the crashed-run signature:
 * step 4 inserts in that state and step 6 is the only thing that leaves it, so
 * a completed document never matches. Cascades clear its units, chunks and
 * chunk_units.
 */
async function sweepIncomplete(
  db: SupabaseClient,
  sourceId: string,
  language: string,
  log: (message: string) => void
): Promise<void> {
  const { data, error } = await db
    .from("documents")
    .delete()
    .eq("source_id", sourceId)
    .eq("language", language)
    .eq("is_current", false)
    .eq("unit_count", 0)
    .select("id");

  if (error) throw new Error(`sweeping incomplete documents: ${error.message}`);
  if (data && data.length > 0) {
    log(`  swept    ${data.length} incomplete document(s) from an interrupted run`);
  }
}

/**
 * Step 2. The manifest is the source of truth and this table is its projection
 * — the pipeline upserts from the YAML, never the other way round.
 */
async function upsertSource(
  db: SupabaseClient,
  source: ManifestSource
): Promise<void> {
  const { error } = await db.from("sources").upsert(
    {
      id: source.id,
      title: source.title,
      kind: source.kind,
      author: source.author,
      authority_tier: source.authorityTier,
      license: source.license,
      license_note: source.licenseNote,
      canonical_url: source.canonicalUrl,
      locator_scheme: source.locatorScheme,
      chunking: source.chunking,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (error) throw new Error(`upserting source ${source.id}: ${error.message}`);
}

export interface UpsertResult {
  status: "unchanged" | "ingested";
  documentId: string | null;
  unitCount: number;
  chunkCount: number;
  contentHash: string;
}

export interface UpsertOptions {
  db: SupabaseClient;
  source: ManifestSource;
  document: ManifestDocument;
  units: ParsedUnit[];
  chunks: ParsedChunk[];
  contentHash: string;
  log: (message: string) => void;
}

export async function upsertDocument(
  options: UpsertOptions
): Promise<UpsertResult> {
  const { db, source, document, units, chunks, contentHash, log } = options;
  const { language } = document;

  await sweepIncomplete(db, source.id, language, log);
  await upsertSource(db, source);

  // ── Step 3: idempotency ───────────────────────────────────────────────────
  // The hash is over normalised units, not fetched HTML, so a re-theming that
  // changes no words is correctly a no-op here (lib/corpus/hash.ts).
  const { data: current, error: currentError } = await db
    .from("documents")
    .select("id, content_hash")
    .eq("source_id", source.id)
    .eq("language", language)
    .eq("is_current", true)
    .maybeSingle();

  if (currentError) {
    throw new Error(`reading the current document: ${currentError.message}`);
  }

  if (current?.content_hash === contentHash) {
    return {
      status: "unchanged",
      documentId: current.id as string,
      unitCount: units.length,
      chunkCount: chunks.length,
      contentHash,
    };
  }

  // ── Step 4: insert, NOT current ───────────────────────────────────────────
  const { data: inserted, error: insertError } = await db
    .from("documents")
    .insert({
      source_id: source.id,
      language,
      edition: document.edition,
      fetched_from: document.indexUrl,
      content_hash: contentHash,
      unit_count: 0,
      is_current: false,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    throw new Error(`inserting the document row: ${insertError?.message}`);
  }
  const documentId = inserted.id as string;

  // ── Step 5: the corpus ────────────────────────────────────────────────────
  const unitRows = units.map((unit) => ({
    document_id: documentId,
    locator: unit.locator,
    language,
    text: unit.text,
    ordinal: unit.ordinal,
    parent_id: null,
    role: unit.role,
    // CCC locators are the tradition's, not ours. `true` here would claim the
    // address carries none of the stability guarantees, which would be a lie
    // about a paragraph number that predates the project by decades.
    locator_is_synthetic: false,
  }));

  const returnedUnits = await insertBatched(db, "units", unitRows, "id, locator");
  log(`  units    ${returnedUnits.length} inserted`);

  const unitIdByLocator = new Map(
    returnedUnits.map((row) => [row.locator as string, row.id as string])
  );

  const chunkRows = chunks.map((chunk) => ({
    document_id: documentId,
    strategy: chunk.strategy,
    language,
    text: chunk.text,
    token_count: null,
  }));

  const returnedChunks = await insertBatched(db, "chunks", chunkRows, "id");
  log(`  chunks   ${returnedChunks.length} inserted (${chunks[0]?.strategy ?? "—"})`);

  // Chunks come back in insertion order per batch, which is the order `chunks`
  // was built in — so index alignment is sound. The join is still made through
  // locators rather than positions, because that is the invariant that would
  // survive a chunker which emitted its output in a different order.
  const linkRows = returnedChunks.flatMap((row, index) =>
    chunks[index].unitLocators.map((locator, ordinal) => {
      const unitId = unitIdByLocator.get(locator);
      if (!unitId) {
        throw new Error(
          `chunk ${index} references unit ${locator}, which was not inserted`
        );
      }
      return { chunk_id: row.id as string, unit_id: unitId, ordinal };
    })
  );

  await insertBatched(db, "chunk_units", linkRows);
  log(`  links    ${linkRows.length} chunk_units`);

  // ── Step 6: demote, then promote ──────────────────────────────────────────
  if (current) {
    const { error } = await db
      .from("documents")
      .update({ is_current: false })
      .eq("id", current.id);
    if (error) throw new Error(`demoting the previous document: ${error.message}`);
    log(`  demoted  the previous current document (${current.content_hash})`);
  }

  const { error: promoteError } = await db
    .from("documents")
    .update({ is_current: true, unit_count: units.length })
    .eq("id", documentId);

  if (promoteError) {
    throw new Error(`promoting the new document: ${promoteError.message}`);
  }

  return {
    status: "ingested",
    documentId,
    unitCount: units.length,
    chunkCount: chunks.length,
    contentHash,
  };
}
