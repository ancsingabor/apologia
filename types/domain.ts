// Enriched app types — mapped from DB rows with relationships and computed
// fields. UI and Server Actions work with these; map `db → domain` at the
// data-access layer so raw rows never leak into components.

import type { AdminRole, AuthorityTier, CorpusLanguage } from "./db";

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
