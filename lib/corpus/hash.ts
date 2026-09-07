import { createHash } from "node:crypto";
import type { ParsedUnit } from "@/types/domain";

/**
 * Content addressing for the ingest (ADR-004).
 *
 * ⚠️ THE DOCUMENT HASH IS OVER NORMALISED UNITS, NOT OVER FETCHED HTML.
 *
 * `0005_corpus` specifies `content_hash` as "sha256 of the normalised source
 * text", and following that literally rather than hashing the download is what
 * makes the idempotency claim true in practice.
 *
 * ADR-019 accepted "a live text is a moving hash" as a cost of choosing
 * katolikus.hu over the 1999 archive: the modern pages are template-generated
 * and can be re-themed under us, so a raw-HTML hash would change on a CSS class
 * rename and every such change would present as a corpus revision. Hashing what
 * we actually store instead means a re-theming that alters no words produces an
 * identical hash and the re-ingest is correctly a no-op. The hash moves when
 * the TEXT moves, which is the only event it was ever meant to signal.
 *
 * The raw page hashes are still recorded, in the emitted manifest, where
 * provenance belongs — they answer "what exactly did we download", which is a
 * different question from "did the corpus change".
 */

/**
 * The hash of a document's ingested content.
 *
 * Includes the locator alongside the text, so a pure relabelling — the §146
 * case, where three paragraphs keep their text and change their address — moves
 * the hash. Text alone would not: it would report "unchanged" for a corpus in
 * which every citation had just started resolving somewhere else.
 *
 * Units are taken in the order given, which after `applyRelabels` is locator
 * order, so the hash does not depend on the source's page ordering.
 */
export function documentContentHash(units: ParsedUnit[]): string {
  const hash = createHash("sha256");
  for (const unit of units) {
    hash.update(`${unit.locator}\t${unit.text}\n`);
  }
  return hash.digest("hex");
}

/** Provenance for one fetched page, recorded in the emitted manifest. */
export function rawContentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * The corpus hash: one value over every ingested document.
 *
 * `docs/evaluation.md` expects every eval report to record it, so that a
 * retrieval number can be tied to the exact corpus it was measured over — and
 * so that a local run and a CI run diverging becomes visible rather than
 * silent. Sorted by document key, because the corpus is a set and the order
 * documents happened to be ingested in is not part of its identity.
 */
export function corpusHash(
  documents: { sourceId: string; language: string; contentHash: string }[]
): string {
  const hash = createHash("sha256");
  const ordered = [...documents].sort((a, b) =>
    `${a.sourceId}:${a.language}`.localeCompare(`${b.sourceId}:${b.language}`)
  );
  for (const doc of ordered) {
    hash.update(`${doc.sourceId}:${doc.language}\t${doc.contentHash}\n`);
  }
  return hash.digest("hex");
}
