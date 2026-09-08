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
 * The matching itself is done HERE rather than as SQL `~`, which is a change
 * from the hand-run queries the ADR records, and the reason is ADR-015's axis
 * rather than convenience: a probe pattern is pure deterministic logic, so it
 * belongs under Vitest, and it can only be there if it lives in TypeScript.
 * Pushing the match into Postgres would leave `probes.test.ts` exercising a
 * duplicate of each pattern rather than the pattern that runs — a test of a
 * copy of the code.
 *
 * (An earlier version of this comment claimed PostgREST could not express a
 * bracket class in a filter. That was wrong: `?text=match.\[[0-9]+\]` works —
 * the operator is spelled `match`, not `~`. The choice stands on the reason
 * above, not on that one.)
 *
 * What this costs is real and is paid for deliberately:
 *
 *   * ~1.1 MB per document crosses the wire instead of only the hits. Verified
 *     byte-exact: sha256 over all 5,730 units is identical computed in Postgres
 *     and computed here after the round trip.
 *   * The two regex dialects do not agree, and JavaScript is the weaker one for
 *     this corpus — see `furnitureProbe`, where `\b` matched a Hungarian word
 *     inside a longer one and missed it standing alone, exactly backwards.
 *     Every probe therefore carries its POSIX spelling in `sql`, which a
 *     failure prints so investigation happens in the language ADR-019 records
 *     and a human will reach for.
 *
 * ⚠️ `sql` IS DUPLICATED LOGIC, AND NOTHING EXECUTES IT HERE. Duplication that
 * nothing runs is duplication that drifts, so the two spellings check each
 * other in `integration/corpus-text-probes.test.ts` — over adversarial text,
 * not over the real corpus, because a clean corpus makes almost every probe
 * return zero on both sides and "they agree" costs nothing to satisfy. That
 * check is what would have caught the `\b` bug above.
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
  /** The same probe as a Postgres POSIX regex. Not used for matching — it is
   *  printed in a failure so the query can be pasted into psql, which is how
   *  ADR-019 records these being run and how anyone will actually investigate
   *  one. Kept beside `pattern` so the two cannot drift apart unnoticed. */
  sql: string;
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
    sql: "<[a-zA-Z/]",
    why: "an HTML tag survived normalisation",
  },
  {
    name: "entity-residue",
    pattern: /&[a-zA-Z0-9#]+;/,
    sql: "&[a-zA-Z0-9#]+;",
    why: "an HTML entity was not decoded — `&ldquo;` was found this way",
  },
  {
    name: "bracket-footnote",
    pattern: /\[[0-9]+\]/,
    sql: "\\[[0-9]+\\]",
    why: "a footnote reference marker survived, or the text cites a year in brackets",
  },
  {
    name: "empty-text",
    pattern: /^\s*$/,
    sql: "^[[:space:]]*$",
    why: "a unit with no text at all — a marker matched something that is not a paragraph",
  },
  {
    name: "double-space",
    pattern: / {2}/,
    sql: "  ",
    why: "whitespace collapse did not run, or a tag was replaced by a space it should not have been",
  },
  {
    name: "leading-marker-residue",
    pattern: /^[0-9.]/,
    sql: "^[0-9.]",
    why: "a paragraph marker left its number or period behind, or the text opens with an enumerated item",
  },
];

/**
 * A word that appears only in page furniture, never in the work's prose.
 *
 * ⚠️ THE BOUNDARIES ARE `\p{L}` LOOKAROUNDS, NOT `\b`, AND THAT IS NOT STYLE.
 * JavaScript's `\b` is defined over `[A-Za-z0-9_]`, so a word ending in a
 * non-ASCII letter can never match: in `\bTárgymutató\b` the trailing `\b`
 * sits between `ó` and a space, neither of which is a word character to `\b`,
 * so there is no boundary and the probe silently matches nothing.
 *
 * That is the worst available failure for a check like this — it does not error,
 * it reports clean — and it is aimed squarely at the Hungarian half of a
 * Hungarian-first corpus. `Tárgymutató` is the name of a real page in it.
 * Postgres' `\y` gets this right natively, which is why the equivalent SQL in
 * `probeSql` is a plain `\y`; JavaScript has to be told.
 */
export function furnitureProbe(word: string): TextProbe {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return {
    name: `furniture:${word}`,
    pattern: new RegExp(
      `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`,
      "u"
    ),
    sql: `\\y${word}\\y`,
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

/**
 * The psql query that reproduces one probe, for the failure message.
 *
 * The matching this file does is in TypeScript, but investigating a hit is done
 * in a database shell — that is how §1065 was found and how the next one will
 * be. Handing over the exact query removes the step where someone reconstructs
 * it from a regex literal and gets it subtly wrong.
 */
export function probeSql(probe: TextProbe, sourceId: string, language: string): string {
  return (
    `select u.locator, u.text from units u join documents d on d.id = u.document_id\n` +
    `where d.source_id = '${sourceId}' and d.language = '${language}' and d.is_current\n` +
    `  and u.text ~ '${probe.sql.replace(/'/g, "''")}';`
  );
}

/** The message that fails the test, naming what to do about each hit. */
export function probeFailure(hits: readonly ProbeHit[], sql?: string): string {
  const lines = hits.map(
    (hit) => `  ${hit.locator}  ${hit.probe}\n      ${hit.excerpt}`
  );
  return (
    `${hits.length} undeclared text-probe hit(s) in the stored corpus:\n` +
    `${lines.join("\n")}\n\n` +
    (sql ? `Reproduce it:\n${sql}\n\n` : "") +
    `Contamination that reads as prose is invisible to every assertion in ` +
    `assert.ts — that is why this check exists (ADR-019 § Amendment 2). Either ` +
    `the parser is leaking markup into permanent text, or the hit is content ` +
    `and belongs in \`text_probes.expected\` of the document's errata file, ` +
    `with a note saying what it is.`
  );
}
