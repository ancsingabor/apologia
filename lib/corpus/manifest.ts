import { z } from "zod";
import type { ManifestSource } from "@/types/domain";

/**
 * Reading `corpus/sources.yaml` (ADR-003, ADR-004).
 *
 * That file is the contract between the corpus and the pipeline, and the
 * `sources` table is its ingested projection — the pipeline upserts from the
 * YAML, never the other way round. So a malformed manifest has to fail here,
 * loudly, before a fetch is attempted.
 *
 * ── Two rules live in this file rather than in the YAML's comments ──────────
 *
 * The manifest documents both of these in prose. Prose is not a check, and both
 * are the kind of rule that is obeyed until the one time it is not:
 *
 * 1. **`license` must be resolved.** ADR-003 says there is no `unknown`; a
 *    source whose status has not been established does not belong in the file.
 *    An empty string, `unknown`, `tbd` or `null` is rejected.
 * 2. **Every document of a multilingual source must agree on `revision`.**
 *    This is ADR-019's precondition, and it is the one worth having as code.
 *    Translations descending from different revisions have numbering that
 *    aligns and content that does not — CCC §2267 says the death penalty is
 *    "not excluded" in the 1997 Hungarian text and "inadmissible" in the
 *    2018-amended English one. Every downstream check passes: the locator
 *    resolves, the quotation is byte-exact, the citation gate is green,
 *    groundedness is perfect. The answer is grounded in a superseded text and
 *    teaches the opposite doctrine depending on the reader's language.
 *    Nothing after ingestion can see it, so it is caught before the fetch.
 */

const LANGUAGE = z.enum(["hu", "en", "la"]);

const UNRESOLVED_LICENCE = new Set(["", "unknown", "tbd", "none", "null", "?"]);

const documentSchema = z.object({
  language: LANGUAGE,
  // Required, and required to be meaningful — see rule 2 above.
  revision: z.string().min(1, "revision is required on every document entry"),
  edition: z.string().nullable().default(null),
  index_url: z.url(),
  // Which table of contents shape the page list is read from — a key into
  // the discoverer registry, which does the validating, as it does for
  // `parser`. The list is discovered rather than pinned either way (ADR-019).
  fetch: z.string().min(1),
  parser: z.string().min(1),
  encoding: z.string().min(1),
  errata: z.string().nullable().default(null),
});

const sourceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  kind: z.enum([
    "church_document",
    "theological_work",
    "bible",
    "scientific",
    "historical",
  ]),
  authority_tier: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])
    .nullable()
    .default(null),
  author: z.string().nullable().default(null),
  languages: z.array(LANGUAGE).min(1),
  license: z
    .string()
    .refine((value) => !UNRESOLVED_LICENCE.has(value.trim().toLowerCase()), {
      message:
        "license must be resolved — ADR-003 has no `unknown`. A source whose " +
        "status is not established belongs in docs/corpus.md § Pending " +
        "licence resolution, not in the manifest.",
    }),
  license_note: z.string().nullable().default(null),
  locator_scheme: z.string().min(1),
  chunking: z.string().min(1),
  canonical_url: z.string().nullable().default(null),
  expected_units: z.number().int().positive().nullable().default(null),
  notes: z.string().nullable().default(null),
  cross_lingual_key: z.string().nullable().default(null),
  // A source that has not reached the fetch stage carries no `documents:` block
  // yet — `summa` and `kjv` are licensed but not located. That is a legitimate
  // manifest state; asking to ingest such a source is what fails, in `select`.
  documents: z.array(documentSchema).default([]),
});

const manifestSchema = z.object({
  version: z.number().int().nonnegative(),
  sources: z.array(sourceSchema).min(1),
});

/**
 * ADR-019's precondition. A source is ingestable in more than one language only
 * if its documents descend from one revision of the work.
 *
 * Checked over the manifest as a whole rather than per requested language,
 * because the failure is a property of the PAIR: ingesting only Hungarian from
 * a manifest whose English entry disagrees would succeed today and produce the
 * divergence the moment English is added. The condition is wrong before either
 * fetch, so it is reported before either fetch.
 */
function assertRevisionsAgree(source: {
  id: string;
  documents: { language: string; revision: string }[];
}): void {
  const revisions = new Map<string, string[]>();
  for (const doc of source.documents) {
    revisions.set(doc.revision, [
      ...(revisions.get(doc.revision) ?? []),
      doc.language,
    ]);
  }
  if (revisions.size <= 1) return;

  const detail = [...revisions.entries()]
    .map(([revision, languages]) => `${languages.join("/")}=${revision}`)
    .join(", ");

  throw new Error(
    `Source "${source.id}": documents descend from different revisions (${detail}).\n` +
      `Revision agreement is a PRECONDITION of ingesting a source in more than ` +
      `one language, not a quality metric (ADR-019). Under one locator space the ` +
      `numbering would align and the content would contradict, and no check after ` +
      `ingestion can see it.`
  );
}

function toDomain(source: z.infer<typeof sourceSchema>): ManifestSource {
  return {
    id: source.id,
    title: source.title,
    kind: source.kind,
    authorityTier: source.authority_tier,
    author: source.author,
    languages: source.languages,
    license: source.license,
    licenseNote: source.license_note,
    locatorScheme: source.locator_scheme,
    chunking: source.chunking,
    canonicalUrl: source.canonical_url,
    expectedUnits: source.expected_units,
    documents: source.documents.map((doc) => ({
      language: doc.language,
      revision: doc.revision,
      edition: doc.edition,
      indexUrl: doc.index_url,
      fetch: doc.fetch,
      parser: doc.parser,
      encoding: doc.encoding,
      errata: doc.errata,
    })),
  };
}

/**
 * Parse an already-loaded YAML document into typed sources.
 *
 * Takes parsed YAML rather than a path, so the validation stays a pure function
 * over data and the filesystem stays in the CLI shell (ADR-015).
 */
export function parseManifest(raw: unknown): ManifestSource[] {
  const manifest = manifestSchema.parse(raw);
  for (const source of manifest.sources) assertRevisionsAgree(source);
  return manifest.sources.map(toDomain);
}

/**
 * Pick the one source and one document an ingest run was asked for.
 *
 * Both misses are ordinary operator errors and both name what is available,
 * because the alternative is a stack trace against `undefined` three stages
 * later.
 */
export function selectDocument(
  sources: ManifestSource[],
  sourceId: string,
  language: string
): { source: ManifestSource; document: ManifestSource["documents"][number] } {
  const source = sources.find((s) => s.id === sourceId);
  if (!source) {
    throw new Error(
      `No source "${sourceId}" in the manifest. Available: ${sources
        .map((s) => s.id)
        .join(", ")}`
    );
  }

  const document = source.documents.find((d) => d.language === language);
  if (!document) {
    const listed = source.documents.map((d) => d.language).join(", ");
    throw new Error(
      `Source "${sourceId}" has no document for language "${language}". ` +
        (listed
          ? `Available: ${listed}.`
          : `It carries no \`documents:\` block yet — its fetch location is ` +
            `not settled, so there is nothing to ingest.`)
    );
  }

  return { source, document };
}
