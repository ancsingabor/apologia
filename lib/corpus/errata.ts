import { z } from "zod";
import type { CorpusErrata } from "@/types/domain";

/**
 * Reading `corpus/errata/*.yaml` (ADR-003, ADR-019).
 *
 * An errata file declares the defects a source is KNOWN to carry, so that an
 * undeclared one stops the ingest. Its more important job is second-order: it
 * keeps the known faults from being used as an argument for loosening the
 * assertions in `./assert.ts`.
 *
 * ── Why the schema is strict about shape but tolerant of extra keys ──────────
 *
 * The real `ccc-hu.yaml` carries prose alongside the machine-readable part:
 * `found`, `expected`, `repair`, `note`, `verified_against`. Those exist for a
 * human deciding whether a declaration is still honest, and the parser has no
 * business requiring or rejecting them. What it does require is the pair the
 * matching is mechanical over — `(locator, kind)` — because a declaration that
 * cannot be matched is a declaration that silently permits nothing.
 *
 * ⚠️ `kind` is validated against the parser's own vocabulary. A typo like
 * `anchor-typoo` would otherwise sit in the file looking like permission while
 * matching no defect the parser can emit, and the ingest would fail with a
 * message pointing at the source rather than at the declaration.
 */

const DEFECT_KIND = z.enum([
  "anchor-absent",
  "anchor-missing-prefix",
  "anchor-typo",
  "misnumbered",
  "number-not-increasing",
  "paragraph-absent",
  "marker-inline",
  "footnote-unbalanced",
  "count-mismatch",
]);

const relabelSchema = z.looseObject({
  page: z.string().min(1),
  found_label: z.number().int().positive(),
  occurrence: z.number().int().positive(),
  correct_locator: z.string().regex(/^[a-z0-9-]+:\S+$/i, {
    message: "correct_locator must be a canonical locator, e.g. `ccc:146`",
  }),
});

const allowanceSchema = z.looseObject({
  locator: z.string().min(1),
  kind: DEFECT_KIND,
});

const errataSchema = z.looseObject({
  source: z.string().min(1),
  language: z.enum(["hu", "en", "la"]),
  expected_units: z.number().int().positive(),
  relabels: z.array(relabelSchema).default([]),
  allowed: z.array(allowanceSchema).default([]),
});

/**
 * Parse an already-loaded YAML document into the pure `CorpusErrata` the
 * assertions consume. Takes parsed YAML rather than a path so the filesystem
 * stays in the CLI shell.
 */
export function parseErrata(raw: unknown): CorpusErrata {
  const errata = errataSchema.parse(raw);

  return {
    source: errata.source,
    language: errata.language,
    expectedUnits: errata.expected_units,
    relabels: errata.relabels.map((relabel) => ({
      page: relabel.page,
      foundLabel: relabel.found_label,
      occurrence: relabel.occurrence,
      correctLocator: relabel.correct_locator,
    })),
    allowed: errata.allowed.map((allowance) => ({
      locator: allowance.locator,
      kind: allowance.kind,
    })),
  };
}

/**
 * The errata a document declares none of.
 *
 * ⚠️ `errata: null` in the manifest means "nothing declared", which for an
 * uninventoried source means "unchecked" and NOT "clean" — the manifest says so
 * in as many words about the English CCC. The distinction is not this
 * function's to make: an empty declaration set makes every defect undeclared,
 * so an uninventoried source fails its first ingest loudly, which is the
 * correct outcome. `expectedUnits` still comes from the manifest.
 */
export function emptyErrata(
  source: string,
  language: CorpusErrata["language"],
  expectedUnits: number
): CorpusErrata {
  return { source, language, expectedUnits, relabels: [], allowed: [] };
}
