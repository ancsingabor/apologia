// Enriched app types — mapped from DB rows with relationships and computed
// fields. UI and Server Actions work with these; map `db → domain` at the
// data-access layer so raw rows never leak into components.

import type {
  AdminRole,
  AuthorityTier,
  CorpusLanguage,
  SourceKind,
  UnitRole,
} from "./db";

export interface AdminUser {
  id: string;
  email: string;
  role: AdminRole;
}

// ── The citation gate (ADR-005, ADR-014, ADR-017) ────────────────────────────

/**
 * A citable unit as it was handed to the model, and as the gate later checks
 * against. This is the *supplied context* — not the corpus. A locator that is
 * not in here is fabricated whether or not it exists in the database, because
 * the model never saw it.
 */
export interface ContextUnit {
  /** Canonical address: 'ccc:309', 'summa:I.q2.a3'. */
  locator: string;
  language: CorpusLanguage;
  /** Verbatim unit text, exactly as ingested. The comparison is byte-exact. */
  text: string;
  sourceId: string;
  /** Null for scientific and historical sources — off the scale, not low on
   *  it (ADR-010). */
  authorityTier: AuthorityTier | null;
  /** Named edition, for the statute's "source named" condition. */
  edition: string | null;
  /** Link to the official text. */
  url: string | null;
}

/**
 * The model returns an answer as segments rather than prose.
 *
 * This is a deliberate constraint on the generator, and the reason is that
 * "every claim-bearing sentence carries a citation" is NOT decidable over free
 * text. Detecting which sentences make claims is exactly the probabilistic
 * judgement the gate must not make. Requiring the model to mark its own claims
 * turns an undecidable check into a structural one.
 *
 * What this buys and what it does not: the gate can prove every marked claim is
 * cited. It cannot prove the model did not bury a claim inside a `connective`
 * segment. That residue is measured by the eval harness (groundedness), never
 * asserted here — see `.claude/project.md` § Two kinds of correctness.
 */
export type AnswerSegment =
  | { kind: "claim"; text: string; citations: string[] }
  | { kind: "connective"; text: string }
  | { kind: "quotation"; locator: string; text: string };

export interface GeneratedAnswer {
  /** The reader's language. Answer prose is authored in it; quotations are
   *  never translated into it (ADR-014). */
  language: CorpusLanguage;
  segments: AnswerSegment[];
}

export type ViolationCode =
  /** Cited a locator that was not in the supplied context. */
  | "citation_not_in_context"
  /** A claim segment left with no surviving citation. Fatal. */
  | "claim_without_citation"
  /** Quoted a locator that was not in the supplied context. */
  | "quotation_unknown_locator"
  /** The span is not verbatim in its unit. Fabrication — always fatal. */
  | "quotation_not_exact"
  | "quotation_too_long"
  | "quotation_exceeds_unit_ratio"
  | "quotation_exceeds_answer_ratio"
  | "quotation_missing_attribution";

export interface Violation {
  code: ViolationCode;
  /** Index into `GeneratedAnswer.segments`. */
  segment: number;
  locator?: string;
  detail: string;
}

/**
 * `pass`     — clean.
 * `repaired` — offending citations/quotations removed; what remains is verified
 *              and publishable. Never silent: `dropped` says what went.
 * `failed`   — cannot be repaired without misrepresenting the answer. Nothing
 *              is displayed.
 */
export type VerificationResult =
  | { status: "pass"; answer: GeneratedAnswer }
  | { status: "repaired"; answer: GeneratedAnswer; dropped: Violation[] }
  | { status: "failed"; violations: Violation[] };

// ── Corpus ingestion (ADR-004, ADR-019) ──────────────────────────────────────
// The parser's output, before it becomes `DbUnit` rows. Nothing here touches a
// database, a network, or the filesystem — which is what lets 2,865 paragraphs
// of parsing logic be unit tested in milliseconds (ADR-015).

/**
 * A defect kind the parser can detect. This vocabulary is shared with
 * `corpus/errata/*.yaml`: a declared erratum names the kind the parser emits,
 * so matching is mechanical rather than by prose description.
 */
export type CorpusDefectKind =
  /** No `name="K…"` anchor on the paragraph at all. */
  | "anchor-absent"
  /** Anchor present but unpadded and unprefixed — `name="74"`. */
  | "anchor-missing-prefix"
  /** Anchor present and wrong in some other way — `name="K26201"`. */
  | "anchor-typo"
  /** The printed label is wrong; the paragraph belongs at another locator. */
  | "misnumbered"
  /** A label repeats or goes backwards. The only signal that catches a
   *  paragraph whose anchor AND printed number are both wrong and agree. */
  | "number-not-increasing"
  /** A number is missing from the sequence entirely. */
  | "paragraph-absent"
  /** The paragraph does not begin its own block element — it opens mid-`<p>`,
   *  after a `<br>` or mid-sentence, and was located only because the sequence
   *  expected it there. Nothing structural marks it, so it is declared. */
  | "marker-inline"
  /** A footnote reference in the body has no definition in the page's
   *  apparatus, or a definition has no reference. The body/apparatus cut is the
   *  historically fragile boundary, and this is what notices when it moves. */
  | "footnote-unbalanced"
  /** The final tally does not match the manifest's `expected_units`. */
  | "count-mismatch";

export interface CorpusDefect {
  kind: CorpusDefectKind;
  /** Canonical locator the defect concerns — 'ccc:211'. */
  locator: string;
  /** Source page it was found on, for diagnosis. Null for whole-run defects. */
  page: string | null;
  detail: string;
}

/** A citable unit as parsed, before it is mapped to a `DbUnit`. */
export interface ParsedUnit {
  /** Canonical address, after any declared relabelling: 'ccc:146'. */
  locator: string;
  /** The paragraph number the locator resolves to. */
  paragraph: number;
  /** The anchor exactly as found, or null. Corroboration only — never the
   *  source of the locator (ADR-019). */
  anchor: string | null;
  /** Set when a declared `misnumbered` erratum moved this unit: the wrong
   *  label the source printed. Null for the overwhelming majority. */
  relabelledFrom: number | null;
  /** Normalised text. This is permanent: ADR-017 compares reader-facing
   *  quotations against it byte-for-byte. */
  text: string;
  role: UnitRole | null;
  page: string;
  ordinal: number;
}

export interface ParseResult {
  units: ParsedUnit[];
  defects: CorpusDefect[];
  /**
   * Pages carrying no numbered paragraphs.
   *
   * Mostly the front matter — Laetamur magnopere, Fidei depositum, the prologue
   * — which is unnumbered in the printed book too, so those pages are not
   * citable units under `ccc:<paragraph>` and giving them one would mean a
   * synthetic locator scheme (ADR-002).
   *
   * ⚠️ NOT only front matter, which is why this field is not called that. The
   * Hungarian table of contents also links the subject index
   * (`kek-targymutato`), 1.1 MB of entries like "Ábel – az igaz 58" whose
   * paragraph numbers are links into the body rather than markers of it. It
   * yields nothing, by three independent mechanisms, and the count still lands
   * exactly on 2,865 — see lib/corpus/discover.ts.
   */
  unnumberedPages: string[];
  /** Counters for things deliberately not turned into units. Informational,
   *  but a jump here between runs means the source changed shape. */
  skipped: Record<string, number>;
  /**
   * Does this source address its paragraphs a SECOND time, in markup?
   *
   * The Hungarian Catechism states every paragraph number twice — printed as
   * `56.` and again as `name="K0056"` — and `assert.ts`'s first check is that
   * the two agree. vatican.va states it once: every `<a name=…>` in its body is
   * a footnote. So the check has no second operand there, and running it anyway
   * would report all 2,865 units as `anchor-absent`.
   *
   * ⚠️ This is a statement about the SOURCE, not a switch a parser may reach
   * for when a check becomes inconvenient. Setting it false does not make a
   * document less checked by permission — ADR-020 requires the missing check to
   * be paid for, and `vatican-intratext` pays with a footnote-apparatus balance
   * check per page and a cross-lingual locator-set equality test.
   */
  anchorSignal: boolean;
}

// ── Errata (ADR-003, ADR-019) ────────────────────────────────────────────────
// The parsed form of `corpus/errata/*.yaml`. Reading the YAML is the CLI's job;
// everything below is pure data so the assertions stay testable.

/**
 * A paragraph the source labels wrongly. Addressed by (page, printed label,
 * occurrence) rather than by position in the run, so the declaration stays
 * valid when a page is re-typeset.
 */
export interface ErrataRelabel {
  page: string;
  foundLabel: number;
  /** 1-based: which occurrence of `foundLabel` on that page. */
  occurrence: number;
  correctLocator: string;
}

/** A defect that is known, looked at, and permitted — never a wildcard. */
export interface ErrataAllowance {
  locator: string;
  kind: CorpusDefectKind;
}

export interface CorpusErrata {
  source: string;
  language: CorpusLanguage;
  expectedUnits: number;
  relabels: ErrataRelabel[];
  allowed: ErrataAllowance[];
}

export interface AssertionReport {
  ok: boolean;
  unitCount: number;
  /** Defects with no matching declaration. Any entry here stops the ingest. */
  undeclared: CorpusDefect[];
  /**
   * Declarations that never fired. Not fatal, but reported loudly: a stale
   * allowance is permission the checks no longer need, and permission nobody
   * revisits is how a strict check goes soft.
   */
  stale: ErrataAllowance[];
}

// ── The manifest (ADR-003, ADR-004) ──────────────────────────────────────────
// The parsed form of `corpus/sources.yaml`. That file is the source of truth
// and the `sources` table is its ingested projection — the pipeline upserts
// from the YAML, never the other way round.

/**
 * One (language, revision) of a work: the manifest side of a `documents` row.
 *
 * `revision` is REQUIRED and every document of a multilingual source must agree
 * on it. That is not a quality metric, it is a precondition of ingesting a
 * source in more than one language at all (ADR-019): translations descending
 * from different revisions have numbering that aligns and content that does
 * not, which silently falsifies the cross-lingual identity ADR-002 claims for a
 * locator. Enforced in `lib/corpus/manifest.ts`, not merely documented.
 */
export interface ManifestDocument {
  language: CorpusLanguage;
  revision: string;
  /** Null is "not established", never a guess — same rule as `authority_tier`. */
  edition: string | null;
  indexUrl: string;
  /** Key into the discoverer registry — which table of contents shape this
   *  document's page list is read from. The list is discovered at fetch time
   *  and never pinned (ADR-019); this names HOW, not WHICH pages. */
  fetch: string;
  /** Key into the parser registry. An unknown id is fatal, not a default. */
  parser: string;
  /** What the bytes are, per document: the HU pages are UTF-8, vatican.va is
   *  ISO-8859-1. Guessing here corrupts text permanently under ADR-017. */
  encoding: string;
  /** Path to this document's errata file, or null when none is declared. */
  errata: string | null;
}

export interface ManifestSource {
  id: string;
  title: string;
  kind: SourceKind;
  /** Null is a positive statement: off the ecclesial-authority scale (ADR-010). */
  authorityTier: AuthorityTier | null;
  author: string | null;
  languages: CorpusLanguage[];
  /** Resolved, always. There is no `unknown` (ADR-003). */
  license: string;
  licenseNote: string | null;
  locatorScheme: string;
  /** Key into the chunker registry; there is deliberately no default (ADR-002). */
  chunking: string;
  canonicalUrl: string | null;
  /** Asserted at ingest. Null for a source not yet inventoried. */
  expectedUnits: number | null;
  documents: ManifestDocument[];
}

// ── Chunking (ADR-002) ───────────────────────────────────────────────────────

/**
 * What gets embedded. Aligned to unit boundaries, never across them blindly.
 *
 * Units are referenced by LOCATOR rather than by database id, because chunking
 * happens before anything is inserted — which is what keeps the chunker a pure
 * function over the parser's output and testable without a database.
 */
export interface ParsedChunk {
  /** Versioned strategy id: 'numbered-paragraph@1'. A variant is a NEW id
   *  sitting beside this one in `chunks.strategy`, never a mutation of it, so
   *  two chunkings can be scored over one corpus. */
  strategy: string;
  text: string;
  /** The units this chunk covers, in reading order. n:m by design. */
  unitLocators: string[];
}
