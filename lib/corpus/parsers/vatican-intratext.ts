import type { CorpusDefect, ParseResult, ParsedUnit } from "@/types/domain";
import {
  FOOTNOTE_REF_INTRATEXT,
  normaliseUnitText,
  trimMarkerResidue,
} from "../normalise";

/**
 * Parser for the English Catechism as published at
 * `vatican.va/archive/ENG0015/` — IntraText, HTML 3.2, ISO-8859-1 (ADR-019).
 *
 * ── What makes this source a different problem from the Hungarian one ────────
 *
 * The markup is cleaner: a numbered paragraph is a `<p class=MsoNormal>` whose
 * text opens with its number. That is the good news, and it is not the news
 * that matters.
 *
 *   **THERE ARE NO PARAGRAPH ANCHORS.** Every `<a name=…>` in the body is a
 *   footnote. The printed number is the only signal this source carries.
 *
 * The Hungarian parser treats the printed number as authoritative and the
 * anchor as a cross-check, and `assert.ts` checks the two agree. Here there is
 * nothing to agree with, so this parser reports `anchorSignal: false` and
 * ADR-020 requires the missing check to be paid for rather than waived. It is
 * paid twice:
 *
 *   1. **here**, by `checkFootnoteBalance` — every reference in the body has a
 *      definition in the apparatus and vice versa. That guards the body cut,
 *      which is the boundary with the worst track record: in Hungarian a
 *      mis-placed cut appended the apparatus label to §1065 and §1666 with the
 *      count, the sequence and both signals green, and only a query over the
 *      stored text found it;
 *   2. **in `integration/`**, by asserting the English locator set equals the
 *      Hungarian one — 2,865 addresses agreed on by two editions from different
 *      publishers, which is a stronger statement than anything the Hungarian
 *      document can make about itself.
 *
 * ── The four structural facts, each of which cost a parse ────────────────────
 *
 *   * `__P85.HTM` is a DIFFERENT HTML DIALECT — uppercase tags, quoted
 *     attributes, `<HR noShade SIZE=1>` where the other 373 pages have
 *     `<hr size=1 noshade>`. Somebody re-saved it through a WYSIWYG editor. A
 *     boundary pattern written against the common form loses the entire page:
 *     §2337–§2359, 23 paragraphs, with no error. So every boundary here is
 *     matched by ATTRIBUTE PRESENCE, never by attribute order or case.
 *   * §2077 and §2436 BEGIN MID-`<p>` — one after a `<br>`, one mid-sentence
 *     inside the preceding paragraph's element. A unit boundary is not an
 *     element boundary in this source either.
 *   * BLOCK QUOTES are `<p class=MsoNormal style='margin-left:35.4pt'>` and
 *     belong to the paragraph that introduces them. Spanning marker-to-marker
 *     absorbs them; treating an element as a unit would orphan them.
 *   * IN BRIEF paragraphs are wrapped in `<i>` that OPENS BEFORE THE NUMBER.
 *     The marker therefore has to hand the tag back (see `Marker.opens`), or
 *     the italic-wrap test can never fire and every summary loses its role.
 */

/** This source's apparatus shape. Passed at every call: `normaliseUnitText`
 *  takes no default, so applying another edition's pattern is unrepresentable. */
const normalise = (fragment: string) =>
  normaliseUnitText(fragment, FOOTNOTE_REF_INTRATEXT);

/**
 * The three horizontal rules that bound a page, matched by the attributes they
 * carry rather than by how they are written.
 *
 * ⚠️ ATTRIBUTE ORDER AND CASE ARE NOT STABLE HERE. 373 pages say
 * `<hr size=1 noshade>` and `__P85.HTM` says `<HR noShade SIZE=1>`. Lookaheads
 * make each attribute an independent requirement, so neither order nor case nor
 * the presence of quotes can decide whether a page parses.
 *
 *   BODY_OPEN   the last rule of the page furniture; the text begins after it
 *   APPARATUS   the short rule introducing the footnote definitions
 *   TAIL        the rule above the Previous/Next navigation
 *
 * A page with no footnotes has no APPARATUS rule at all — 4 of the sampled 20
 * — so the body ends at TAIL instead. Both are optional and the fallback is the
 * end of the document, which is safe because the navigation carries no digits
 * that could be read as a paragraph.
 */
const BODY_OPEN =
  /<hr\b(?=[^>]*\bnoshade\b)(?=[^>]*\bsize\s*=\s*"?1"?)[^>]*>/i;
const APPARATUS = /<hr\b(?=[^>]*\bwidth\s*=\s*"?30%"?)[^>]*>/i;
const TAIL = /<hr\b(?=[^>]*\bwidth\s*=\s*"?70%"?)[^>]*>/i;

/** A paragraph block, whatever its indentation. Used to blank headings. */
const P_BLOCK =
  /<p\b[^>]*\bclass\s*=\s*"?MsoNormal"?[^>]*>([\s\S]*?)<\/p>/gi;

/**
 * A paragraph marker opening its own block.
 *
 * The match ends BEFORE the number — the number is a lookahead — so that
 * `Marker.opens` can hold the inline tags the `<p>` opened with and hand them
 * back to the unit. `<i style='mso-bidi-font-style:normal'>2857` is how every
 * IN BRIEF paragraph is set, and the `</i>` that closes it sits at the end of
 * the paragraph: swallow the opening tag into the marker and the unit's body is
 * italic-closed but never italic-opened, so `isInBrief` returns false for all
 * 537 of them.
 *
 * The `[\s<]` lookahead after the number is what keeps "2." out. §113 and §114
 * open with `2.` and `3.` — enumerated items inside the paragraph on the
 * preceding numbers — and a period is neither.
 */
const MARKER_BLOCK =
  /<p\b[^>]*\bclass\s*=\s*"?MsoNormal"?[^>]*>((?:\s*<(?:i|b|em|strong|font|span)\b[^>]*>)*)\s*(?=(\d{1,4})[\s<])/gi;

/**
 * A paragraph marker with no block of its own: a bare number after a `<br>`, or
 * after the end of the preceding sentence, inside another paragraph's element.
 *
 * ⚠️ THIS PATTERN IS NOT EVIDENCE OF A PARAGRAPH ON ITS OWN, and here that
 * warning is sharper than it is in the Hungarian parser. There the un-anchored
 * case was the exception and an anchor corroborated the rest; here NOTHING
 * corroborates, so an accepted inline marker rests entirely on the sequence
 * expecting it. Only two do — §2077 and §2436 — and seven further candidates in
 * the document are rejected by that rule. Both acceptances are declared in
 * `corpus/errata/ccc-en.yaml` as `marker-inline`, so a third one appearing
 * fails the ingest rather than joining quietly.
 *
 * The lookbehind is what makes `match.index` land on the number itself, which
 * is what lets an inline candidate be recognised as a duplicate of a block
 * marker by position.
 */
const MARKER_INLINE =
  /(?<=(?:<br\s*\/?>|[.!?][")”]?)\s{1,3})(\d{1,4})(?=\s)/g;

/** Footnote REFERENCE and DEFINITION, told apart by one character of anchor
 *  name: `<a name=-28T>` points down, `<a name=$28T>` points back. */
const FOOTNOTE_REF_ID = /<a\b[^>]*\bname\s*=\s*"?-([0-9A-Za-z]+)"?[^>]*>/gi;
const FOOTNOTE_DEF_ID = /<a\b[^>]*\bname\s*=\s*"?\$([0-9A-Za-z]+)"?[^>]*>/gi;

const ITALIC_OPEN = /^<(?:em|i)\b/i;
const ITALIC_TAGS = /<\/?(?:em|i)\b[^>]*>/gi;

interface SourcePage {
  /** Slug as fetched: '__P79'. Provenance for every defect message. */
  page: string;
  html: string;
}

interface Marker {
  start: number;
  end: number;
  printed: number;
  /** Inline tags in force where the paragraph starts, given back to the unit's
   *  body. For a block marker these are its own `<p>`'s; for an inline one they
   *  are inherited from the element it opens inside — see `enclosingOpens`. */
  opens: string;
  inline: boolean;
}

interface Region {
  body: string;
  apparatus: string;
}

/**
 * Split a page into its body and its footnote apparatus.
 *
 * Returns null when the page carries no body rule at all, which is a changed
 * page rather than an empty one and is reported as a defect by the caller.
 */
function regionsOf(html: string): Region | null {
  const open = BODY_OPEN.exec(html);
  if (!open) return null;

  const rest = html.slice(open.index + open[0].length);
  const apparatus = APPARATUS.exec(rest);
  if (apparatus) {
    return {
      body: rest.slice(0, apparatus.index),
      apparatus: rest.slice(apparatus.index),
    };
  }

  const tail = TAIL.exec(rest);
  return {
    body: tail ? rest.slice(0, tail.index) : rest,
    apparatus: "",
  };
}

function idsIn(source: string, pattern: RegExp): Set<string> {
  const ids = new Set<string>();
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) ids.add(match[1]);
  return ids;
}

/**
 * The compensating check ADR-020 requires of a source with one signal.
 *
 * A reference in the body and its definition in the apparatus share an id, so
 * the two sets must be equal. What this actually watches is the CUT between
 * them: move it early and definitions appear with no reference, move it late
 * and the apparatus is inside the last unit's text — which is the failure that
 * reached production in Hungarian, reading as prose and visible to nothing.
 *
 * The whole page is one defect rather than one per id: a moved cut breaks every
 * footnote on the page at once, and forty identical lines describe one fault.
 */
function checkFootnoteBalance(page: string, region: Region): CorpusDefect[] {
  const referenced = idsIn(region.body, FOOTNOTE_REF_ID);
  const defined = idsIn(region.apparatus, FOOTNOTE_DEF_ID);

  const undefined_ = [...referenced].filter((id) => !defined.has(id));
  const unreferenced = [...defined].filter((id) => !referenced.has(id));
  if (undefined_.length === 0 && unreferenced.length === 0) return [];

  return [
    {
      kind: "footnote-unbalanced",
      locator: `page:${page}`,
      page,
      detail:
        `${referenced.size} reference(s), ${defined.size} definition(s); ` +
        `${undefined_.length} referenced but undefined ` +
        `(${undefined_.slice(0, 4).join(", ") || "—"}), ` +
        `${unreferenced.length} defined but unreferenced ` +
        `(${unreferenced.slice(0, 4).join(", ") || "—"}). ` +
        `The body/apparatus cut has moved.`,
    },
  ];
}

/**
 * A heading, or a paragraph? Headings must be blanked before markers are
 * scanned, because a unit's text runs from its own marker to the next one — so
 * a heading left in place is appended to the PRECEDING paragraph's permanent
 * text.
 *
 * ⚠️ ORDER IS LOAD-BEARING, and differently from the Hungarian parser. There
 * the exemption is "carries an anchor"; there are no anchors here, so it is
 * "carries a number". Both IN BRIEF paragraphs and headings open with an inline
 * tag — `<i>` and `<b>` respectively — and the number is the only thing that
 * separates a summary from a section title. Test the number first or 537
 * summaries are silently deleted.
 */
function headingKind(fragment: string): string | null {
  const text = normalise(fragment);
  if (!text) return "empty";

  MARKER_BLOCK.lastIndex = 0;
  if (/^(?:\s*<(?:i|b|em|strong|font|span)\b[^>]*>)*\s*\d{1,4}[\s<]/i.test(fragment)) {
    return null;
  }

  if (/^\s*(?:<(?:strong|b)\b[^>]*>\s*)+/i.test(fragment)) return "bold";

  // Section headings are set in capitals: "THE SIXTH COMMANDMENT". Checked on
  // letters only, so punctuation and digits do not vote. §826 quotes St Thérèse
  // in capitals mid-paragraph and is unaffected — this looks at a whole `<p>`.
  const letters = text.replace(/[^\p{L}]/gu, "");
  if (letters.length > 0 && letters === letters.toUpperCase()) return "allcaps";

  return null;
}

/**
 * Blank headings in place, preserving every byte offset so marker positions
 * found afterwards still line up with the region string.
 */
function blankHeadings(body: string, skipped: Record<string, number>): string {
  return body.replace(P_BLOCK, (whole, inner: string) => {
    const kind = headingKind(inner);
    if (kind === null) return whole;
    skipped[`heading-${kind}`] = (skipped[`heading-${kind}`] ?? 0) + 1;
    return " ".repeat(whole.length);
  });
}

/**
 * The inline tags in force at `at`, taken from the `<p>` it sits inside.
 *
 * A paragraph that opens mid-element is still governed by that element's
 * markup: §2077 is an IN BRIEF summary, and the `<i>` that says so opened at
 * the top of §2076's `<p>` and closes below §2077. Reading `opens` as "the tags
 * this marker happened to consume" gives an inline marker none, and the unit
 * silently loses its role — invisible to every assertion, because `role` is
 * metadata and the text is unaffected.
 *
 * So the context is inherited rather than invented. This looks only at the
 * tags the enclosing `<p>` opened with, which is exactly what a block marker in
 * the same element would have captured.
 */
function enclosingOpens(region: string, at: number): string {
  const open = region.lastIndexOf("<p", at);
  if (open < 0) return "";
  const opens = /^<p\b[^>]*>((?:\s*<(?:i|b|em|strong|font|span)\b[^>]*>)*)/i.exec(
    region.slice(open, at)
  );
  return opens ? opens[1] : "";
}

function collectMarkers(region: string): Marker[] {
  const markers: Marker[] = [];
  const blockNumberAt = new Set<number>();

  MARKER_BLOCK.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MARKER_BLOCK.exec(region)) !== null) {
    const numberAt = m.index + m[0].length;
    blockNumberAt.add(numberAt);
    markers.push({
      start: m.index,
      end: numberAt + m[2].length,
      printed: Number(m[2]),
      opens: m[1],
      inline: false,
    });
  }

  MARKER_INLINE.lastIndex = 0;
  while ((m = MARKER_INLINE.exec(region)) !== null) {
    // A block marker's number is preceded by the `<p>` tag and its whitespace,
    // so the inline pattern matches it too. Compared by the NUMBER's position,
    // which is why the lookbehind exists.
    if (blockNumberAt.has(m.index)) continue;
    markers.push({
      start: m.index,
      end: m.index + m[1].length,
      printed: Number(m[1]),
      opens: enclosingOpens(region, m.index),
      inline: true,
    });
  }

  return markers.sort((a, b) => a.start - b.start);
}

/**
 * Is the whole body italic? That is how the CCC's IN BRIEF summaries are set.
 * Inline `<i>` on a scripture reference must not count, so this requires the
 * body to OPEN italic and to lose nothing when the italic tags are removed.
 *
 * `opens` is the tags the marker consumed, put back — see `MARKER_BLOCK`.
 */
function isInBrief(opens: string, body: string): boolean {
  const whole = (opens + body).trim();
  if (!ITALIC_OPEN.test(whole)) return false;
  return normalise(whole) === normalise(whole.replace(ITALIC_TAGS, ""));
}

/**
 * Parse the whole English document.
 *
 * Takes every page at once, in the table of contents' order, because the
 * sequence spans pages: an inline marker is accepted only where the sequence
 * expects it, and the monotonicity assertion is meaningless per page.
 */
export function parseVaticanIntratext(pages: SourcePage[]): ParseResult {
  const units: ParsedUnit[] = [];
  const defects: CorpusDefect[] = [];
  const unnumberedPages: string[] = [];
  const skipped: Record<string, number> = {};

  let ordinal = 0;
  let last = 0;

  for (const { page, html } of pages) {
    const region = regionsOf(html);
    if (region === null) {
      defects.push({
        kind: "count-mismatch",
        locator: `page:${page}`,
        page,
        detail: "no body rule — the page shape changed",
      });
      continue;
    }

    defects.push(...checkFootnoteBalance(page, region));

    const scanned = blankHeadings(region.body, skipped);

    const accepted: Marker[] = [];
    for (const marker of collectMarkers(scanned)) {
      if (marker.inline && marker.printed !== last + 1) {
        skipped["numeric-lead-uncorroborated"] =
          (skipped["numeric-lead-uncorroborated"] ?? 0) + 1;
        continue;
      }
      if (marker.inline) {
        defects.push({
          kind: "marker-inline",
          locator: `ccc:${marker.printed}`,
          page,
          detail:
            "paragraph begins mid-element; located only because the sequence " +
            `expected ${marker.printed} there`,
        });
      }
      accepted.push(marker);
      last = Math.max(last, marker.printed);
    }

    if (accepted.length === 0) {
      unnumberedPages.push(page);
      continue;
    }

    accepted.forEach((marker, index) => {
      const stop = accepted[index + 1]?.start ?? scanned.length;
      const raw = scanned.slice(marker.end, stop);
      ordinal += 1;
      units.push({
        locator: `ccc:${marker.printed}`,
        paragraph: marker.printed,
        anchor: null,
        relabelledFrom: null,
        text: trimMarkerResidue(normalise(raw)),
        role: isInBrief(marker.opens, raw) ? "summary" : null,
        page,
        ordinal,
      });
    });
  }

  // One signal. `assert.ts` skips its agreement check and ADR-020 says what
  // pays for it: `checkFootnoteBalance` above, and the cross-lingual
  // locator-set equality test in `integration/`.
  return { units, defects, unnumberedPages, skipped, anchorSignal: false };
}
