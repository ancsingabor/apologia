import type {
  CorpusDefect,
  ParseResult,
  ParsedUnit,
} from "@/types/domain";
import { normaliseUnitText, trimMarkerResidue } from "../normalise";

/**
 * Parser for the Hungarian Catechism as published at
 * `katolikus.hu/dokumentumtar/kek-*` — the source chosen in ADR-019.
 *
 * ── Why this scans a string instead of walking a DOM ─────────────────────────
 *
 * The obvious implementation reaches for an HTML parser and treats each `<p>`
 * as a paragraph. That is wrong for this source, and the reason is worth
 * stating because it looks like naivety otherwise:
 *
 *   **A citable unit's boundary is not an element boundary here.**
 *
 *   * §78 begins mid-`<p>`, after a `<br><br>`, inside its predecessor's
 *     element. Element-per-paragraph loses it entirely.
 *   * §1077's anchor swallows the paragraph's opening quotation mark —
 *     `<a name="K1077">1077. „</a>Áldott…` — so the marker and the text share
 *     an element and the „ must survive.
 *   * §1182's number is wrapped in `<font size="-1">` *inside* the anchor.
 *
 * A DOM would have to be flattened back to a string to handle any of those, so
 * it buys nothing and hides the offsets the algorithm needs. What makes this
 * safe is not the parsing technique but the assertions in `../assert.ts`: the
 * count, the sequence, and the two-signal agreement. A mis-parse cannot pass
 * them quietly.
 *
 * ── The two signals ─────────────────────────────────────────────────────────
 *
 * Every paragraph states its number twice: in the visible printed text (`56.`)
 * and in the anchor attribute (`name="K0056"`). **The printed number is
 * authoritative and the anchor is the cross-check** — the inverse of the
 * obvious design, and settled by evidence: all eight known defects in this
 * source are in the anchor, none in the printed number. The printed number came
 * from the book and someone proofread it; the anchor is invisible plumbing and
 * a broken one has no visible symptom.
 */

/** The article body. Everything outside it is navigation, sidebars, widgets. */
const CONTENT_OPEN = /<div[^>]*class="[^"]*article-content[^"]*"[^>]*>/i;
const DIV_TAG = /<(\/?)div\b[^>]*>/gi;

/**
 * Where the body ends: the first footnote DEFINITION. Definitions carry
 * `name="J<n>"`, inline references carry `name="JB<n>"`, and that prefix is the
 * only reliable discriminator. Attribute order varies here too
 * (`<a href="#JB1" name="J1" id="J1">`), so the name is matched anywhere in the
 * tag rather than in a fixed position.
 *
 * Getting this wrong is quiet rather than loud: the apparatus is appended to
 * the LAST unit on the page, which still reads as prose. It silently corrupted
 * 22 units before the order-independent match.
 *
 * The `<hr>` above the "Jegyzetek:" block looks like a tidier boundary and is
 * NOT usable — several pages carry an `<hr>` mid-body, and cutting there loses
 * 500 paragraphs.
 *
 * The cut is then moved back to the START of the enclosing `<p>`, because the
 * apparatus paragraph opens with its own visible label — `<p>Jegyzetek: <br>
 * <a href="#JB1" name="J1">…` — and cutting at the first anchor leaves that
 * label appended to §2865.
 */
const BODY_END = /<a\b[^>]*\bname="J\d+"[^>]*>/i;

/** A `<p>` holding nothing but one link is navigation ("Vissza a főoldalra"). */
const NAV_ONLY = /^\s*<a\b[^>]*>[\s\S]*?<\/a>\s*$/i;

const P_BLOCK = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;

/**
 * A paragraph marker carried by an anchor. The match ends immediately after the
 * NUMBER — deliberately not consuming `</a>` — because some anchors also
 * contain the start of the paragraph's own text (§1077's opening „). Inline
 * presentational tags may sit between the anchor and its number (§1182).
 */
const MARKER_ANCHORED =
  /<a\s+name="(K?\d+)"[^>]*>(?:\s*<(?:font|span|em|i|b|strong)\b[^>]*>)*\s*(\d{1,4})\s*\.{0,2}/gi;

/**
 * A paragraph marker with no anchor at all (§2096, §2213): a bare number
 * opening a `<p>`, or following a `<br><br>` break inside one (§78).
 */
const MARKER_BARE =
  /(?:<p\b[^>]*>|<br\s*\/?>\s*<br\s*\/?>)\s*(\d{1,4})\s*\.{0,2}\s+/gi;

const ITALIC_OPEN = /^<(?:em|i)\b/i;
const ITALIC_TAGS = /<\/?(?:em|i)\b[^>]*>/gi;
const LEADING_CLOSERS = /^(?:\s|<\/a>|<\/font>|<\/span>)+/i;

interface SourcePage {
  /** Slug as fetched: 'kek-031-051'. Provenance for every defect message. */
  page: string;
  html: string;
}

interface Marker {
  start: number;
  end: number;
  printed: number;
  anchor: string | null;
}

/** Isolate the article body, or null when the page has no recognisable one. */
function contentRegion(html: string): string | null {
  const open = CONTENT_OPEN.exec(html);
  if (!open) return null;

  const from = open.index + open[0].length;
  const rest = html.slice(from);
  DIV_TAG.lastIndex = 0;

  let depth = 1;
  let tag: RegExpExecArray | null;
  while ((tag = DIV_TAG.exec(rest)) !== null) {
    depth += tag[1] ? -1 : 1;
    if (depth === 0) return rest.slice(0, tag.index);
  }
  return null;
}

/**
 * A heading, or a paragraph? Headings must be removed before markers are
 * scanned, because a unit's text runs from its own marker to the next one — so
 * a heading left in place is appended to the preceding paragraph's permanent
 * text.
 *
 * ⚠️ ORDER IS LOAD-BEARING. The marker check comes FIRST: a body paragraph may
 * open with `<strong>`, and classifying those as headings silently deletes
 * them. Getting this backwards cost 49 paragraphs in an earlier draft.
 */
function headingKind(fragment: string): string | null {
  const text = normaliseUnitText(fragment);
  if (!text) return "empty";
  if (/<a\s+name="K?\d+"/i.test(fragment)) return null;
  if (NAV_ONLY.test(fragment.trim())) return "nav";
  // NOTE: there is deliberately no exemption for a bold block that merely
  // STARTS with a digit. "2. Cikkely" is a heading, and exempting it does not
  // create a spurious unit — a marker needs an anchor or sequence corroboration
  // — it silently appends the heading's text to the PRECEDING paragraph, which
  // is worse, because the unit still reads as prose. A bold body paragraph is
  // already exempt by the anchor check above.
  if (/^\s*(?:<(?:strong|b)\b[^>]*>\s*)+/i.test(fragment)) return "bold";

  // Section headings are set in capitals with no number: "A NOÉVAL KÖTÖTT
  // SZÖVETSÉG". Checked on letters only, so punctuation and digits do not vote.
  const letters = text.replace(/[^\p{L}]/gu, "");
  if (letters.length > 0 && letters === letters.toUpperCase()) return "allcaps";

  return null;
}

/**
 * Blank headings in place, preserving every byte offset so marker positions
 * found afterwards still line up with the region string.
 */
function blankHeadings(
  region: string,
  skipped: Record<string, number>
): string {
  return region.replace(P_BLOCK, (whole, inner: string) => {
    const kind = headingKind(inner);
    if (kind === null) return whole;
    skipped[`heading-${kind}`] = (skipped[`heading-${kind}`] ?? 0) + 1;
    return " ".repeat(whole.length);
  });
}

function collectMarkers(region: string): Marker[] {
  const markers: Marker[] = [];

  MARKER_ANCHORED.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MARKER_ANCHORED.exec(region)) !== null) {
    markers.push({
      start: m.index,
      end: m.index + m[0].length,
      printed: Number(m[2]),
      anchor: m[1],
    });
  }

  MARKER_BARE.lastIndex = 0;
  while ((m = MARKER_BARE.exec(region)) !== null) {
    const start = m.index;
    const overlaps = markers.some((k) => k.start <= start && start < k.end);
    if (overlaps) continue;
    markers.push({
      start,
      end: start + m[0].length,
      printed: Number(m[1]),
      anchor: null,
    });
  }

  return markers.sort((a, b) => a.start - b.start);
}

/**
 * Is the whole body italic? That is how the CCC's "Összefoglalás" / In Brief
 * summaries are set. Inline `<em>` on a scripture reference must not count, so
 * this requires the body to OPEN italic and to lose nothing when the italic
 * tags are removed — i.e. the italics wrap everything.
 */
function isInBrief(body: string): boolean {
  const stripped = body.replace(LEADING_CLOSERS, "").trim();
  if (!ITALIC_OPEN.test(stripped)) return false;
  return (
    normaliseUnitText(stripped) ===
    normaliseUnitText(stripped.replace(ITALIC_TAGS, ""))
  );
}

/**
 * Parse the whole Hungarian document.
 *
 * Takes every page at once, in reading order, because the sequence spans pages:
 * the corroboration rule below and the monotonicity assertion are both
 * meaningless per page.
 */
export function parseKatolikusHu(pages: SourcePage[]): ParseResult {
  const units: ParsedUnit[] = [];
  const defects: CorpusDefect[] = [];
  const frontMatterPages: string[] = [];
  const skipped: Record<string, number> = {};

  let ordinal = 0;
  let last = 0;

  for (const { page, html } of pages) {
    const raw = contentRegion(html);
    if (raw === null) {
      defects.push({
        kind: "count-mismatch",
        locator: `page:${page}`,
        page,
        detail: "no article-content container — the page shape changed",
      });
      continue;
    }

    const end = BODY_END.exec(raw);
    let cut = raw.length;
    if (end) {
      const enclosing = raw.lastIndexOf("<p", end.index);
      cut = enclosing >= 0 ? enclosing : end.index;
    }
    const body = raw.slice(0, cut);
    const region = blankHeadings(body, skipped);

    const accepted: Marker[] = [];
    for (const marker of collectMarkers(region)) {
      // A leading number is NOT sufficient evidence of a paragraph. The front
      // matter ends with "2002. Szent Péter és Pál ünnepén" — a dateline, and
      // indistinguishable from a paragraph number on its own. So an
      // un-anchored number is accepted only where the sequence expects it.
      if (marker.anchor === null && marker.printed !== last + 1) {
        skipped["numeric-lead-uncorroborated"] =
          (skipped["numeric-lead-uncorroborated"] ?? 0) + 1;
        continue;
      }
      accepted.push(marker);
      last = Math.max(last, marker.printed);
    }

    if (accepted.length === 0) {
      frontMatterPages.push(page);
      continue;
    }

    accepted.forEach((marker, index) => {
      const stop = accepted[index + 1]?.start ?? region.length;
      const raw = region.slice(marker.end, stop);
      ordinal += 1;
      units.push({
        locator: `ccc:${marker.printed}`,
        paragraph: marker.printed,
        anchor: marker.anchor,
        relabelledFrom: null,
        text: trimMarkerResidue(normaliseUnitText(raw)),
        role: isInBrief(raw) ? "summary" : null,
        page,
        ordinal,
      });
    });
  }

  return { units, defects, frontMatterPages, skipped };
}
