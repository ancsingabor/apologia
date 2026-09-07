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
 * The CCC's apparatus is dense — `<a name="JB9" href="#J9">[9]</a>` several
 * times per paragraph. Keeping the `[9]` would mean a quotation has to contain
 * "[9]" to verify, which no generator will produce and no reader wants to see.
 *
 * Note the asymmetry this relies on: an inline REFERENCE carries
 * `name="JB<n>"`, while the footnote DEFINITION at the foot of the page carries
 * `name="J<n>"` and points back at the reference. That prefix is the only
 * reliable way to tell them apart in this source.
 *
 * ⚠️ Attribute ORDER varies — both `<a name="JB7" href="#J7">` and
 * `<a href="#J64" name="JB64">` occur — so the name must be matched anywhere in
 * the tag. Anchoring it to the first attribute leaves the `[64]` markers in the
 * text, which is silent: the unit still looks like prose.
 */
const FOOTNOTE_REF = /<a\b[^>]*\bname="JB\d+"[^>]*>[\s\S]*?<\/a>/gi;

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
 * Only the four named entities this source actually uses, plus numeric forms.
 * A general HTML entity table would be more code and more ways to be wrong;
 * an unrecognised entity is left alone and will show up as a visible oddity in
 * the text rather than being silently mangled into something plausible.
 */
const NAMED: ReadonlyArray<readonly [RegExp, string]> = [
  [/&nbsp;/gi, " "],
  [/&quot;/gi, '"'],
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
export function normaliseUnitText(fragment: string): string {
  const withoutRefs = fragment.replace(FOOTNOTE_REF, "");
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
