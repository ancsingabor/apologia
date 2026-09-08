/**
 * The cross-lingual locator check (ADR-020, discharging ADR-002).
 *
 * ── Why this is a pipeline step and not a note in the ADR ───────────────────
 *
 * ADR-002 claims that a locator is a CROSS-LINGUAL IDENTITY: `ccc:2267` names
 * the same citable unit in Hungarian and in English, and that identity is the
 * alignment key ADR-007's cross-lingual evaluation is built on. Until a second
 * language was ingested, that claim was prose about one document.
 *
 * It is also the claim with the worst failure mode in the project. ADR-019
 * records what a revision mismatch does: the locator resolves in both
 * languages, the quotation is byte-exact, the citation gate is green,
 * groundedness is perfect, and the answer teaches the opposite doctrine
 * depending on the reader's language. `manifest.ts` already refuses a source
 * whose documents declare different revisions — but that is a check on what the
 * manifest SAYS. This is a check on what was actually parsed out of the pages.
 *
 * ── It also pays a debt ─────────────────────────────────────────────────────
 *
 * vatican.va states each paragraph number once, so `assert.ts` cannot run its
 * agreement check over the English document (ADR-020). This is half of what
 * replaces it, and it is a stronger kind of evidence than the check it stands
 * in for: agreement between two signals written by the same typesetter is what
 * §211 defeated, both being wrong together. Two editions, from two publishers,
 * in two languages, parsed by two parsers written months apart, agreeing on
 * 2,865 addresses is evidence against error that is genuinely independent.
 *
 * ── What it cannot do ───────────────────────────────────────────────────────
 *
 * It compares ADDRESSES, not text. Two editions can agree on every locator and
 * still descend from different revisions of the work — that is exactly the
 * §2267 case, where the numbering aligns perfectly and the content contradicts.
 * Revision agreement is checked separately, before the fetch, in `manifest.ts`.
 * Neither check subsumes the other and deleting either one is a silent loss.
 */

export interface CrossLingualReport {
  ok: boolean;
  /** The language already in the corpus that this parse was compared against. */
  against: string;
  /** Locators present in both. */
  shared: number;
  /** Locators this parse has and the other language does not. */
  onlyIncoming: string[];
  /** Locators the other language has and this parse does not. */
  onlyExisting: string[];
}

/**
 * Compare the locator set about to be ingested against one already in the
 * corpus.
 *
 * Divergence is reported in BOTH directions rather than as a count, because the
 * two mean different things: a locator only in the incoming parse is usually a
 * spurious unit, and one only in the existing document is usually a hole. A
 * single "they differ by 23" number sends the reader looking in one place.
 */
export function compareLocators(
  incoming: Iterable<string>,
  existing: Iterable<string>,
  against: string
): CrossLingualReport {
  const here = new Set(incoming);
  const there = new Set(existing);

  const onlyIncoming = [...here].filter((locator) => !there.has(locator));
  const onlyExisting = [...there].filter((locator) => !here.has(locator));

  return {
    ok: onlyIncoming.length === 0 && onlyExisting.length === 0,
    against,
    shared: here.size - onlyIncoming.length,
    onlyIncoming,
    onlyExisting,
  };
}

/** How many divergent locators to name before the list stops being readable. */
const SHOWN = 12;

function sample(locators: string[]): string {
  const shown = locators.slice(0, SHOWN).join(", ");
  return locators.length > SHOWN
    ? `${shown}, … and ${locators.length - SHOWN} more`
    : shown;
}

/**
 * Turn a failing report into the message that stops the ingest.
 *
 * Fatal, and deliberately not declarable in `corpus/errata/`. An allowance here
 * would be permission for one language to address a unit the other cannot,
 * which is not a typesetting defect to be tolerated — it is the identity claim
 * being false, and the answer is to fix the parse or to stop claiming the two
 * documents are the same work.
 */
export function crossLingualFailure(
  report: CrossLingualReport,
  language: string
): string {
  return (
    `The ${language} parse and the ingested ${report.against} document do not ` +
    `address the same units.\n` +
    `  ${report.shared} locators shared\n` +
    `  ${report.onlyIncoming.length} only in ${language}: ${sample(report.onlyIncoming) || "—"}\n` +
    `  ${report.onlyExisting.length} only in ${report.against}: ${sample(report.onlyExisting) || "—"}\n` +
    `\nADR-002 claims a locator is a cross-lingual identity, and ADR-007's ` +
    `evaluation uses it as an alignment key. A locator that resolves in one ` +
    `language and not the other silently falsifies both. This is not ` +
    `declarable in corpus/errata/: it is not a typesetting defect, it is the ` +
    `claim being wrong (ADR-020).`
  );
}
