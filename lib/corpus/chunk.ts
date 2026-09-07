import type { ParsedChunk, ParsedUnit } from "@/types/domain";

/**
 * Chunking (ADR-002).
 *
 * Chunks are what gets embedded; citations point at UNITS, not chunks. That
 * separation is why re-tuning the chunker does not invalidate a single stored
 * citation, and it is what makes chunking a variable the eval harness can move
 * rather than a decision that has to be right first time.
 */

/**
 * The Milestone 1 baseline: one chunk per citable unit.
 *
 * ── Why 1:1, when the schema models n:m ─────────────────────────────────────
 *
 * `chunk_units` is n:m because a short CCC paragraph may share a chunk with its
 * neighbour while a long Summa article splits across several, and a plain
 * foreign key breaks in one direction or the other. That relation is modelled
 * honestly and exercised here at 1:1 — which is not the same as simplifying it
 * away, and leaves packing implementable without a migration.
 *
 * Packing short neighbours to a token budget is very likely an improvement: a
 * one-sentence paragraph embeds poorly on its own. It is also a tuning
 * parameter, and `.claude/project.md` rule 6 forbids a chunking change without
 * an eval report diff. There is no baseline yet to diff against, so the
 * baseline is what this produces. Packing becomes `numbered-paragraph@2`,
 * measured against it.
 *
 * ── The version suffix ──────────────────────────────────────────────────────
 *
 * `@1` is not decoration. `chunks.strategy` is a plain text column, so two
 * strategies can populate the same corpus simultaneously and be scored over the
 * same gold set — exactly what `chunk_embeddings`'s (chunk, model) key does for
 * embedding models. A variant is therefore a NEW id sitting beside this one,
 * never an edit to this function's behaviour under the same name. Editing it in
 * place would silently invalidate every stored comparison.
 */
export const NUMBERED_PARAGRAPH_V1 = "numbered-paragraph@1";

export function chunkNumberedParagraph(units: ParsedUnit[]): ParsedChunk[] {
  return units.map((unit) => ({
    strategy: NUMBERED_PARAGRAPH_V1,
    text: unit.text,
    unitLocators: [unit.locator],
  }));
}

type Chunker = (units: ParsedUnit[]) => ParsedChunk[];

/**
 * Manifest `chunking:` value → strategy.
 *
 * There is deliberately no default (ADR-002). A source whose strategy is not
 * registered is a source nobody has decided how to chunk, and guessing is the
 * uniform-chunker failure the citable-unit model exists to avoid.
 */
const CHUNKERS: Record<string, Chunker> = {
  "numbered-paragraph": chunkNumberedParagraph,
};

export function chunkerFor(strategy: string): Chunker {
  const chunker = CHUNKERS[strategy];
  if (!chunker) {
    throw new Error(
      `No chunking strategy "${strategy}". Registered: ${Object.keys(CHUNKERS).join(", ")}.\n` +
        `There is no default chunker on purpose (ADR-002): a source's strategy ` +
        `must respect its own structure, and falling back to a generic splitter ` +
        `destroys the boundaries the corpus is built on.`
    );
  }
  return chunker;
}
