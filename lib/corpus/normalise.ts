/**
 * Text normalisation at ingestion — the other half of ADR-017's byte-exact
 * quotation comparison.
 *
 * ⚠️ WHAT THIS FUNCTION RETURNS IS PERMANENT.
 *
 * `lib/citation/verify.ts` compares a reader-facing quotation against
 * `units.text` byte-for-byte and refuses anything that differs by one
 * character. That check has no tolerance to spend, which is deliberate — a
 * lenient comparison is one that can be talked into accepting a quotation the
 * source never wrote. The consequence is that ALL tolerance has to be spent
 * here instead, once, at ingestion.
 *
 * Two rules follow, and neither is negotiable:
 *
 * 1. **Normalisation is applied to both sides of the comparison, or to
 *    neither.** The generator quotes from context text that came out of this
 *    function, so its quotations are already normalised. Never normalise
 *    inside the gate.
 * 2. **Changing this function invalidates every stored citation.** Not the
 *    locators — those are stable by design (ADR-002) — but every verified
 *    quotation, because the text it was checked against no longer exists. A
 *    change here means re-ingesting the corpus and re-verifying every
 *    published answer.
 *
 * So it does the minimum that makes the comparison survivable, and nothing
 * that reconstructs, repairs, or prettifies.
 */

/**
 * Footnote references, which are markup rather than text.
 *
 * The CCC's apparatus is dense — several references per paragraph in both
 * editions. Keeping their visible numbers would mean a quotation has to contain
 * "[9]" to verify, which no generator will produce and no reader wants to see.
 *
 * ⚠️ THE PATTERN IS PER SOURCE, AND IS PASSED IN RATHER THAN DEFAULTED. Two
 * editions of one work set their apparatus in unrelated markup, and a default
 * would silently apply one source's shape to another — leaving the other's
 * reference numbers embedded in permanent text, invisibly, because the unit
 * still reads as prose. Making the argument required costs one token at each
 * call site and makes that mistake unrepresentable.
 *
 * Both patterns rest on the same asymmetry, spelled differently: an inline
 * REFERENCE and the DEFINITION at the foot of the page are distinguishable only
 * by a prefix on the anchor name.
 *
 * | | reference | definition |
 * |---|---|---|
 * | katolikus.hu | `name="JB9"` | `name="J9"` |
 * | vatican.va | `name=-28T` | `name=$28T` |
 */

/**
 * katolikus.hu. Attribute ORDER varies — both `<a name="JB7" href="#J7">` and
 * `<a href="#J64" name="JB64">` occur — so the name is matched anywhere in the
 * tag. Anchoring it to the first attribute leaves the `[64]` markers in 1,586
 * units, silently.
 */
export const FOOTNOTE_REF_KATOLIKUS =
  /<a\b[^>]*\bname="JB\d+"[^>]*>[\s\S]*?<\/a>/gi;

/**
 * vatican.va (IntraText). The reference is a superscript wrapping the anchor,
 * `<sup><a name=-28T href=#$28T>74</a></sup>`, and the WHOLE `<sup>` is removed
 * so the visible number leaves with it. Attributes are unquoted here, and the
 * `$` of a definition is a regex metacharacter — matching `name=-` rather than
 * "not `$`" keeps the discriminator positive.
 */
export const FOOTNOTE_REF_INTRATEXT =
  /<sup\b[^>]*>\s*<a\b[^>]*\bname\s*=\s*"?-[0-9A-Za-z]+"?[^>]*>[\s\S]*?<\/a>\s*<\/sup>/gi;

/**
 * Block-level and break tags become a space; every other tag is removed with no
 * space at all.
 *
 * This is not a stylistic choice — it is what HTML means. An inline element
 * boundary produces no whitespace, so replacing every tag with a space corrupts
 * the text at every inline boundary: `(<em>Ter 10,5</em>)` becomes
 * `( Ter 10,5 )`, and §1077, whose anchor swallows the paragraph's opening
 * quotation mark, becomes `„ Áldott` instead of `„Áldott`.
 *
 * Under a byte-exact quotation comparison those spurious spaces are permanent
 * and invisible: the stored text simply is not what the book prints, and every
 * faithful quotation of those passages fails the gate.
 */
const BLOCK_TAG =
  /<\/?(?:p|div|blockquote|br|li|ul|ol|table|tr|td|th|h[1-6]|hr|dl|dt|dd|pre)\b[^>]*>/gi;
const INLINE_TAG = /<[^>]+>/g;

/**
 * Only the named entities these sources actually use, plus numeric forms. A
 * general HTML entity table would be more code and more ways to be wrong; an
 * unrecognised entity is left alone and will show up as a visible oddity in the
 * text rather than being silently mangled into something plausible.
 *
 * ── Why `&ldquo;` is here, and why it does not become `"` ───────────────────
 *
 * vatican.va sets 7,381 quotation marks as `&quot;` and sixteen as `&ldquo;`.
 * Mapping the odd sixteen onto `"` would make the corpus typographically
 * uniform, and would be exactly the reconstruction this file forbids: it is a
 * guess about what the typesetter meant. `&ldquo;` *denotes* U+201C, so
 * decoding it to U+201C is decoding, not repair. The corpus keeps sixteen units
 * with a curly quote beside the rest with straight ones, which is what the
 * source says, and a byte-exact gate wants what the source says.
 */
const NAMED: ReadonlyArray<readonly [RegExp, string]> = [
  [/&nbsp;/gi, " "],
  [/&quot;/gi, '"'],
  [/&ldquo;/gi, "\u201C"],
  [/&lt;/gi, "<"],
  [/&gt;/gi, ">"],
];

function decodeEntities(input: string): string {
  let out = input;
  for (const [pattern, replacement] of NAMED) {
    out = out.replace(pattern, replacement);
  }
  out = out.replace(/&#(\d+);/g, (_, code: string) =>
    String.fromCodePoint(Number(code))
  );
  out = out.replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
    String.fromCodePoint(Number.parseInt(code, 16))
  );
  // `&amp;` is undone LAST, or `&amp;lt;` decodes to `<` instead of `&lt;`.
  return out.replace(/&amp;/gi, "&");
}

/**
 * Turn a fragment of source HTML into the text of a citable unit.
 *
 * Deliberately NOT done here: smart-quote conversion, dash conversion, spelling
 * or casing repair. The Hungarian edition already sets „…” and – correctly
 * (which is a large part of why it was chosen over the 1997 archive — ADR-019),
 * so there is nothing to reconstruct, and a normaliser that GUESSES at intended
 * typography is one that can silently rewrite the Catechism.
 */
export function normaliseUnitText(
  fragment: string,
  footnoteRefs: RegExp
): string {
  const withoutRefs = fragment.replace(footnoteRefs, "");
  const withoutBlocks = withoutRefs.replace(BLOCK_TAG, " ");
  const withoutTags = withoutBlocks.replace(INLINE_TAG, "");
  const decoded = decodeEntities(withoutTags);

  return (
    decoded
      // NFC: Hungarian ő and ű exist precomposed and as base+combining. Two
      // byte sequences that render identically would fail the gate for no
      // reason a reader could ever understand.
      .normalize("NFC")
      // The source is pretty-printed, so newlines and runs of indentation sit
      // mid-sentence. A non-breaking space is a space.
      .replace(/[\s   ]+/g, " ")
      .trim()
  );
}

/**
 * Strip a stray leading period or space left behind by a malformed paragraph
 * marker — `<a name="K0222">222.</a>.` prints its period twice, and without
 * this the unit's text would begin ". Hinni Istenben…".
 *
 * Narrow on purpose: leading punctuation immediately after a paragraph marker
 * is always a typesetting artefact, but the same characters anywhere else are
 * content.
 */
export function trimMarkerResidue(text: string): string {
  return text.replace(/^[.\s]+/, "");
}
