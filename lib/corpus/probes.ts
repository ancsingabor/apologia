import type { CorpusErrata, ProbeHit } from "@/types/domain";

/**
 * The third step of ADR-019's method: **probe the stored text.**
 *
 * ── Why the assertions cannot do this ───────────────────────────────────────
 *
 * `assert.ts` checks that the corpus has the right SHAPE — the right number of
 * units, in the right order, at the right addresses. It cannot check that a
 * unit's text is *only* its text, because contamination that reads as prose is
 * invisible to every structural signal.
 *
 * That is not hypothetical. The Hungarian footnote apparatus leaked into §1065
 * and §1666 with the count at 2,865, the sequence strictly increasing, both
 * signals agreeing at every paragraph and the errata fully declared. The units
 * read as prose. What found it was a query over the stored text, run by hand
 * after the ingest reported success.
 *
 * ADR-019 § Amendment 2 said those probes "are now part of `integration/`, so
 * the check runs rather than being remembered." **That was not true**, and the
 * English ingest proved the cost: the probes were run by hand again. This file
 * and `integration/corpus-text-probes.test.ts` are what make the sentence true.
 *
 * ── Why they run against the DATABASE, not the parse ────────────────────────
 *
 * The question is what was STORED, which is what a citation will be verified
 * against under ADR-017. Asking the parser is asking the component under
 * suspicion, so the rows come from Postgres.
 *
 * The matching itself is done here rather than as SQL `~`, which is a change
 * from the hand-run queries the ADR records. Two reasons, and neither is
 * convenience: PostgREST cannot express a bracket class in a filter value
 * without quoting rules that are their own footgun, and a pattern that lives in
 * TypeScript is one `probes.test.ts` can exercise with no database at all. The
 * bytes are still the stored bytes, which is the part that mattered.
 *
 * ── Why hits are declared in the errata rather than allowlisted here ────────
 *
 * A probe cannot be uniformly strict, because some hits are content: §1059
 * contains "[1274]", the date of the Second Council of Lyons, and §113 opens
 * with "2." because it is the second of three criteria for interpreting
 * Scripture. Those are facts about a document, established by a human reading
 * it — which is exactly what `corpus/errata/*.yaml` already is. Putting them in
 * an allowlist here instead would scatter one document's declared facts across
 * two files and hide them from the reader who goes looking in the obvious one.
 */

export interface TextProbe {
  /** Declared in the errata as `probe:`. */
  name: string;
  /** Matched against `units.text` as read back from Postgres. Non-global, so
   *  `test()` carries no `lastIndex` between units. */
  pattern: RegExp;
  /** What a hit would mean. Shown when one is undeclared. */
  why: string;
}

/** A stored unit, as read back from the corpus. */
export interface StoredUnit {
  locator: string;
  text: string;
}

/**
 * ⚠️ These are properties of "a unit's text is only its text", so they are
 * SOURCE-INDEPENDENT on purpose and a new source inherits them for free. What
 * is per-source is which hits are legitimate, and that lives in the errata.
 *
 * Page furniture is the exception and is declared per document
 * (`text_probes.furniture`), because "Jegyzetek" and "IntraText" are facts
 * about two particular websites. Matched on word boundaries: an earlier
 * hand-run of this probe flagged §1159 because "Previously" contains
 * "Previous".
 */
export const TEXT_PROBES: readonly TextProbe[] = [
  {
    name: "markup-residue",
    pattern: /<[a-zA-Z\/]/,
    why: "an HTML tag survived normalisation",
  },
  {
    name: "entity-residue",
    pattern: /&[a-zA-Z0-9#]+;/,
    why: "an HTML entity was not decoded — `&ldquo;` was found this way",
  },
  {
    name: "bracket-footnote",
    pattern: /\[[0-9]+\]/,
    why: "a footnote reference marker survived, or the text cites a year in brackets",
  },
  {
    name: "empty-text",
    pattern: /^\s*$/,
    why: "a unit with no text at all — a marker matched something that is not a paragraph",
  },
  {
    name: "double-space",
    pattern: / {2}/,
    why: "whitespace collapse did not run, or a tag was replaced by a space it should not have been",
  },
  {
    name: "leading-marker-residue",
    pattern: /^[0-9.]/,
    why: "a paragraph marker left its number or period behind, or the text opens with an enumerated item",
  },
];

/** A word that appears only in page furniture, never in the work's prose. */
export function furnitureProbe(word: string): TextProbe {
  return {
    name: `furniture:${word}`,
    pattern: new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`),
    why: `"${word}" belongs to the page template, so the body cut has moved`,
  };
}

/** Every probe hit across a document's stored units. */
export function probeUnits(
  units: readonly StoredUnit[],
  probes: readonly TextProbe[]
): ProbeHit[] {
  const hits: ProbeHit[] = [];
  for (const unit of units) {
    for (const probe of probes) {
      if (!probe.pattern.test(unit.text)) continue;
      hits.push({
        locator: unit.locator,
        probe: probe.name,
        excerpt: `${unit.text.slice(0, 90)}…`,
      });
    }
  }
  return hits;
}

/**
 * The hits nobody has declared.
 *
 * Matched on the exact pair (locator, probe), never on the locator alone — so a
 * DIFFERENT contamination at a locator that already has one declared hit still
 * fails. Same rule as `assertCorpus`, for the same reason.
 */
export function undeclaredHits(
  found: readonly ProbeHit[],
  errata: CorpusErrata
): ProbeHit[] {
  const declared = new Set(
    errata.textProbes.map((hit) => `${hit.locator}|${hit.probe}`)
  );
  return found.filter((hit) => !declared.has(`${hit.locator}|${hit.probe}`));
}

/**
 * Declarations that never fired.
 *
 * Reported for the same reason a stale allowance is: a declaration nobody
 * revisits is how a strict check goes soft. Here it also means the text
 * changed under a declaration that was checked against the old wording.
 */
export function staleDeclarations(
  found: readonly ProbeHit[],
  errata: CorpusErrata
): CorpusErrata["textProbes"] {
  const fired = new Set(found.map((hit) => `${hit.locator}|${hit.probe}`));
  return errata.textProbes.filter(
    (hit) => !fired.has(`${hit.locator}|${hit.probe}`)
  );
}

/** The message that fails the test, naming what to do about each hit. */
export function probeFailure(hits: readonly ProbeHit[]): string {
  const lines = hits.map(
    (hit) => `  ${hit.locator}  ${hit.probe}\n      ${hit.excerpt}`
  );
  return (
    `${hits.length} undeclared text-probe hit(s) in the stored corpus:\n` +
    `${lines.join("\n")}\n\n` +
    `Contamination that reads as prose is invisible to every assertion in ` +
    `assert.ts — that is why this check exists (ADR-019 § Amendment 2). Either ` +
    `the parser is leaking markup into permanent text, or the hit is content ` +
    `and belongs in \`text_probes.expected\` of the document's errata file, ` +
    `with a note saying what it is.`
  );
}
