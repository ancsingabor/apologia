import { normaliseUnitText, trimMarkerResidue } from "@/lib/corpus/normalise";
import type { UnitRole } from "@/types/db";
import type { CorpusDefect, ParseResult, ParsedUnit } from "@/types/domain";

/**
 * The Summa Theologiae in Latin, from corpusthomisticum.org.
 *
 * Textum Leoninum Romae 1888, transcribed to magnetic tape by Roberto Busa SJ,
 * recensed by Enrique Alarcón. HTML 4.0, ISO-8859-1, uppercase tags.
 *
 * ── THIS SOURCE IS THE OPPOSITE POLE FROM vatican.va ───────────────────────
 *
 * ADR-020 was written about a source that states each address ONCE. This one
 * states it four times, and a fifth list of them per page:
 *
 *   <DIV CLASS="D">Quaestio 2</DIV>
 *   <DIV CLASS="E">Articulus 1</DIV>
 *   <P TITLE="I q. 2 a. 1 arg. 1"><A NAME="28299"><SPAN CLASS="ref">[28299]
 *   Iª q. 2 a. 1 arg. 1 </SPAN></A>Ad primum sic proceditur…
 *
 * `TITLE`, the text of `SPAN.ref`, and the enclosing headings each give the
 * address; `A NAME` and the bracketed id each give the reference number; and a
 * JavaScript `<OPTION>` block enumerates every unit on the page. Across all
 * 23,326 units of the inventory those signals disagree ZERO times.
 *
 * That is worth exactly as much as ADR-020 says it is. Four fields emitted by
 * one generator out of one database are still ONE witness, and §211 of the
 * Catechism is the standing proof that signals agreeing with each other is not
 * the same as their being right. What this parser can honestly claim is that
 * the rendering is sound. Whether a unit carries the address it belongs to is
 * answered elsewhere — by each question's own stated article count, which
 * Aquinas wrote and no transcriber supplied.
 *
 * ── ROLE COMES FROM THE LABEL. THE ITALICS ARE QUOTATIONS ──────────────────
 *
 * Every unit body carries `<I>` — 23,324 of them — and they mark Scripture,
 * Damascene and Aristotle being quoted, NOT the role of the passage. ADR-020
 * records 122 Catechism units mis-roled by reading role off whole-paragraph
 * italics, in a project whose argument is that structure and typography are
 * different things. The same trap is here in a different guise, and the role is
 * read from `arg.` / `s. c.` / `co.` / `ad` in the label, full stop.
 *
 * ── THE REFERENCE IDS ARE NOT PERSISTED ────────────────────────────────────
 *
 * `[28299]` is the Index Thomisticus number: the Fundación's apparatus, and the
 * part of this page its editors can most plausibly claim (ADR-021). It is used
 * here as a check signal and discarded. Stored text is Leonine Latin only.
 *
 * A convenience of the same fact: the unit bodies contain NO HTML entities at
 * all — every `&ordf;` and `&oacute;` on these pages is in the apparatus or the
 * page furniture — so the `&ldquo;` failure ADR-020 records cannot arise here.
 */

/** A unit block. Attribute presence, never order or case (the `__P85` rule). */
const UNIT =
  /<p\b(?=[^>]*\btitle\s*=)[^>]*\btitle\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/p>/gi;

/** The apparatus span: `[28299] Iª q. 2 a. 1 arg. 1`. Stripped from the text. */
const REF =
  /<span\b(?=[^>]*\bclass\s*=\s*"?ref"?)[^>]*>\s*\[(\d+)\]\s*([^<]*?)\s*<\/span>/i;

const ANCHOR = /<a\b(?=[^>]*\bname\s*=)[^>]*\bname\s*=\s*"?([^"\s>]+)"?/i;

/** `D` is a Quaestio heading, `E` an Articulus, `G` a Prooemium, `B` a part. */
const HEADING =
  /<div\b(?=[^>]*\bclass\s*=\s*"?[BDEG]"?)[^>]*\bclass\s*=\s*"?([BDEG])"?[^>]*>([^<]*)<\/div>/gi;

/** The per-page dropdown, written by `document.write` one option at a time. */
const OPTION = /value\s*=\s*"?#(\d+)"?\s*>([^']*)'/gi;

/**
 * This source has no footnote apparatus inside a unit, so there is nothing to
 * strip. `normaliseUnitText` takes the pattern as an argument rather than
 * defaulting, precisely so that "this source has none" is stated instead of
 * inherited — see the note on the two CCC patterns in `normalise.ts`.
 */
const FOOTNOTE_REF_NONE = /(?!)/g;

const PART_RANK: Record<string, number> = { I: 1, "I-II": 2, "II-II": 3, III: 4 };

/**
 * Reading order within an article: objections, then the sed contra, then the
 * respondeo, then the replies. `ad arg.` is the reply to an unnumbered sed
 * contra and shares the reply rank; the inventory confirms it never occurs in
 * the same article as a numbered `ad`, in any of its 68 appearances.
 */
const ROLE_RANK: Record<string, number> = {
  pr: 0,
  arg: 1,
  sc: 2,
  co: 3,
  ad: 4,
  adarg: 4,
};

const ROLE_OF: Record<string, UnitRole> = {
  pr: "prooemium",
  arg: "objection",
  sc: "sed_contra",
  co: "respondeo",
  ad: "reply",
  adarg: "reply",
};

interface Address {
  part: string | null;
  question: number | null;
  article: number | null;
  role: string;
  index: number;
}

/**
 * `Iª-IIae, q. 123` and `I-II q. 123` are one address spelled two ways.
 *
 * The ordinal `ª` is `&ordf;` undecoded in the raw HTML, `IIae` is the same
 * part `II` in an inflected form — and TEN pages of Secunda Secundae put a
 * comma after the part where the other 77 do not, which is 2,686 units. That
 * comma is this source's `__P85`: a subset produced differently, invisible
 * until two spellings of one address are compared and the comparison is what
 * notices.
 */
export function foldLocator(spelling: string): string {
  return spelling
    .replace(/&ordf;/gi, "")
    .replace(/ª/g, "")
    .replace(/IIae/g, "II")
    .replace(/,/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const WORK_PR = /^Summa theologiae,?\s*pr\.$/i;
const PART_PR = /^(I|I-II|II-II|III)\s+pr\.$/;
const ADDRESS = /^(I|I-II|II-II|III)\s+q\.\s*(\d+)(?:\s+a\.\s*(\d+))?\s*(.*)$/;

/** `arg. 3` → `{ role: 'arg', index: 3 }`. Null for anything unrecognised. */
function readRole(text: string): { role: string; index: number } | null {
  const trimmed = text.trim();
  if (/^pr\.$/.test(trimmed)) return { role: "pr", index: 0 };
  if (/^co\.$/.test(trimmed)) return { role: "co", index: 0 };
  if (/^ad\s+arg\.$/.test(trimmed)) return { role: "adarg", index: 0 };

  const arg = /^arg\.\s*(\d+)$/.exec(trimmed);
  if (arg) return { role: "arg", index: Number(arg[1]) };

  const ad = /^ad\s+(\d+)$/.exec(trimmed);
  if (ad) return { role: "ad", index: Number(ad[1]) };

  const sc = /^s\.\s*c\.(?:\s*(\d+))?$/.exec(trimmed);
  if (sc) return { role: "sc", index: sc[1] ? Number(sc[1]) : 0 };

  return null;
}

/**
 * Read a label into the address it states.
 *
 * Five shapes, and the last one is the surprise: SIX questions consist of a
 * single article and address their units at the QUESTION level, with no `a.`
 * at all — `II-II q. 48 arg. 1`. Normalising those to `a. 1` would invent an
 * address the source does not state, which ADR-002 forbids in as many words:
 * the addressing is the tradition's, not ours.
 */
export function parseAddress(label: string): Address | null {
  if (WORK_PR.test(label)) {
    return { part: null, question: null, article: null, role: "pr", index: 0 };
  }

  const part = PART_PR.exec(label);
  if (part) {
    return {
      part: part[1],
      question: null,
      article: null,
      role: "pr",
      index: 0,
    };
  }

  const match = ADDRESS.exec(label);
  if (!match) return null;

  const role = readRole(match[4]);
  if (!role) return null;

  return {
    part: match[1],
    question: Number(match[2]),
    article: match[3] ? Number(match[3]) : null,
    role: role.role,
    index: role.index,
  };
}

/** `summa:I.q2.a1.arg3`, `summa:II-II.q48.arg1`, `summa:I-II.pr`, `summa:pr`. */
export function locatorOf(address: Address): string {
  const role =
    address.role === "arg" || address.role === "ad" || address.role === "sc"
      ? `${address.role}${address.index > 0 ? address.index : ""}`
      : address.role;

  const segments = [
    address.part,
    address.question === null ? null : `q${address.question}`,
    address.article === null ? null : `a${address.article}`,
    role,
  ].filter((segment): segment is string => segment !== null);

  return `summa:${segments.join(".")}`;
}

/**
 * The ordering tuple (ADR-002's `sequence`): part, question, article, role,
 * index. A question's prooemium is `[1, 2, 0, 0, 0]` and its first objection
 * `[1, 2, 1, 1, 1]`, so the prooemium sorts ahead of the articles it announces.
 */
export function sequenceOf(address: Address): number[] {
  return [
    address.part === null ? 0 : PART_RANK[address.part],
    address.question ?? 0,
    address.article ?? 0,
    ROLE_RANK[address.role],
    address.index,
  ];
}

interface Mark {
  at: number;
  kind: string;
  number: number | null;
}

/** Where each Quaestio / Articulus heading sits, so a unit can be placed under it. */
function headingsOf(html: string): Mark[] {
  const marks: Mark[] = [];
  HEADING.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HEADING.exec(html)) !== null) {
    const digits = /(\d+)/.exec(match[2]);
    marks.push({
      at: match.index,
      kind: match[1],
      number: digits ? Number(digits[1]) : null,
    });
  }
  return marks;
}

/** The Quaestio and Articulus in force at a byte offset. */
function positionAt(marks: Mark[], offset: number) {
  let quaestio: number | null = null;
  let articulus: number | null = null;
  for (const mark of marks) {
    if (mark.at > offset) break;
    if (mark.kind === "D") {
      quaestio = mark.number;
      articulus = null;
    }
    // A Prooemium heading closes the preceding article; a part heading opens a
    // region with neither in force yet.
    if (mark.kind === "G") articulus = null;
    if (mark.kind === "B") {
      quaestio = null;
      articulus = null;
    }
    if (mark.kind === "E") articulus = mark.number;
  }
  return { quaestio, articulus };
}

/** The page's own enumeration of its units, from the `<OPTION>` dropdown. */
export function enumerationOf(html: string): string[] {
  const listed: string[] = [];
  OPTION.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = OPTION.exec(html)) !== null) {
    listed.push(foldLocator(match[2]));
  }
  return listed;
}

/**
 * The dropdown writes `ad` where the body writes `ad arg.` — 68 times, every
 * time. That is not a defect and it IS the evidence the two lists are produced
 * by different code rather than one string emitted twice, which is the only
 * reason comparing them is worth anything.
 */
function tocSpelling(label: string): string {
  return label.replace(/\bad arg\.$/, "ad");
}

/**
 * Compare the page's own enumeration against the units parsed from its body.
 *
 * This is the analogue of `vatican-intratext`'s footnote balance: a per-page
 * check on the boundary a parser is most likely to get wrong, aimed at the
 * failure this codebase actually had. `__P85` lost 23 paragraphs to a boundary
 * pattern that found no body, and the count assertion reported an off-by-23
 * pointing at nothing in particular. A page that ships a list of what it
 * contains can say which units went missing.
 *
 * Its honest limit: both lists come out of Alarcón's database, so this catches
 * EXTRACTION faults and cannot catch a labelling one.
 */
function checkEnumeration(
  page: string,
  html: string,
  labels: string[]
): CorpusDefect[] {
  const listed = enumerationOf(html);

  if (listed.length === 0) {
    return [
      {
        kind: "enumeration-absent",
        locator: `page:${page}`,
        page,
        detail:
          "no <OPTION> enumeration on this page; the per-page check is skipped",
      },
    ];
  }

  const body = labels.map(tocSpelling);
  const toc = listed.map(tocSpelling);
  if (body.join("|") === toc.join("|")) return [];

  const inBody = new Set(body);
  const inToc = new Set(toc);
  const missing = toc.filter((l) => !inBody.has(l));
  const extra = body.filter((l) => !inToc.has(l));

  return [
    {
      kind: "enumeration-mismatch",
      locator: `page:${page}`,
      page,
      detail:
        `dropdown lists ${toc.length}, body holds ${body.length}` +
        (missing.length ? `; ${missing.length} listed but absent` : "") +
        (extra.length ? `; ${extra.length} present but unlisted` : ""),
    },
  ];
}

/**
 * How the Summa counts, in words. `sexdecim` and `sedecim` are both sixteen;
 * `duodeviginti` and `octodecim` are both eighteen. Aquinas's editors were not
 * standardising spelling, and a numeral this table cannot read is reported as
 * unread rather than guessed at.
 */
const LATIN_NUMERALS: Record<string, number> = {
  unum: 1, duo: 2, tria: 3, quattuor: 4, quatuor: 4, quinque: 5, sex: 6,
  septem: 7, octo: 8, novem: 9, decem: 10, undecim: 11, duodecim: 12,
  tredecim: 13, quattuordecim: 14, quatuordecim: 14, quindecim: 15,
  sedecim: 16, sexdecim: 16, septendecim: 17, duodeviginti: 18, octodecim: 18,
  undeviginti: 19, novendecim: 19, viginti: 20,
};

const NUMERAL = Object.keys(LATIN_NUMERALS)
  .sort((a, b) => b.length - a.length)
  .join("|");

/**
 * `Et circa hoc quaeruntur quatuor` — the count, adjacent to the verb.
 *
 * ⚠️ ADJACENCY IS THE WHOLE RULE, and it was learned the hard way. A looser
 * pattern that allowed words between `quaeruntur` and the numeral read I q. 74
 * — "Deinde quaeritur de omnibus SEPTEM diebus in communi. Et quaeruntur TRIA"
 * — as announcing seven articles, because the seven days come first. It has
 * three. Over the whole work the loose form finds not one question the strict
 * one misses: 501 of 510 either way. It was pure risk for no reading.
 *
 * The compound alternative is the source's own spelling: II-II q. 83 says
 * "quaeruntur decem et septem" and has seventeen articles.
 */
const QUAERUNTUR = new RegExp(
  `\\bquaeruntur\\s+(?:(${NUMERAL})\\s+et\\s+(${NUMERAL})|(${NUMERAL}))\\b`,
  "i"
);

/** The article count a question's prooemium states, or null if it states none. */
export function statedArticleCount(prooemium: string): number | null {
  const match = QUAERUNTUR.exec(prooemium);
  if (!match) return null;
  const [, left, right, single] = match;
  if (single !== undefined) return LATIN_NUMERALS[single.toLowerCase()];
  return LATIN_NUMERALS[left.toLowerCase()] + LATIN_NUMERALS[right.toLowerCase()];
}

/** `summa:I.q74.a3.arg1` → `summa:I.q74.a3`; `summa:II-II.q48.pr` → `summa:II-II.q48`. */
function parentLocator(locator: string): string {
  return locator.slice(0, locator.lastIndexOf("."));
}

interface Shape {
  locator: string;
  page: string;
  objections: number[];
  sedContra: number;
  respondeo: number;
  replies: number[];
}

/** Group units into the articles they belong to, reading the ordering tuple. */
function articlesOf(units: ParsedUnit[]): Map<string, Shape> {
  const articles = new Map<string, Shape>();

  for (const unit of units) {
    const [part, question, article, rank, index] = unit.sequence;
    if (rank === ROLE_RANK.pr) continue;

    const key = `${part}.${question}.${article}`;
    let shape = articles.get(key);
    if (!shape) {
      shape = {
        locator: parentLocator(unit.locator),
        page: unit.page,
        objections: [],
        sedContra: 0,
        respondeo: 0,
        replies: [],
      };
      articles.set(key, shape);
    }

    if (rank === ROLE_RANK.arg) shape.objections.push(index);
    else if (rank === ROLE_RANK.sc) shape.sedContra += 1;
    else if (rank === ROLE_RANK.co) shape.respondeo += 1;
    // `ad arg.` carries index 0: it answers the sed contra, which is not
    // numbered, so it has no objection to point at and none is required.
    else if (index > 0) shape.replies.push(index);
  }

  return articles;
}

/**
 * The invariants an article holds, and the two it does not.
 *
 * ⚠️ `objections.length === replies.length` IS NOT ONE OF THEM. It fails on 120
 * of 2,669 articles, because Aquinas regularly answers several objections in
 * one reply — "Ad primum et secundum dicendum…" — and a gap in reply numbering
 * is the same thing seen from the other side. Asserting equality would need
 * ~140 errata entries, which is ADR-020's wildcard spelled at length, and every
 * one of them would be declaring that a thirteenth-century author wrote his
 * book wrong.
 *
 * What IS invariant is that a reply has something to answer. A reply may
 * address an objection or a sed contra, so the bound is their sum; across all
 * 23,326 units nothing exceeds it, and a reply numbered past it means the
 * parser lost an objection or the source gained one.
 *
 * A duplicated `co.` needs no check here: two respondeos in one article
 * produce the same locator and the same ordering tuple, which `assert.ts`
 * check 2 already reports as `number-not-increasing`.
 */
export function checkArticleShapes(units: ParsedUnit[]): CorpusDefect[] {
  const defects: CorpusDefect[] = [];

  for (const shape of articlesOf(units).values()) {
    const answerable = shape.objections.length + shape.sedContra;
    const orphaned = shape.replies.filter((n) => n > answerable);
    if (orphaned.length > 0) {
      defects.push({
        kind: "reply-without-objection",
        locator: shape.locator,
        page: shape.page,
        detail:
          `reply ${orphaned.join(", ")} with ${shape.objections.length} ` +
          `objection(s) and ${shape.sedContra} sed contra`,
      });
    }

    if (shape.respondeo === 0) {
      defects.push({
        kind: "respondeo-absent",
        locator: shape.locator,
        page: shape.page,
        detail: `no co. unit; ${shape.objections.length} objection(s), ${shape.replies.length} reply(ies)`,
      });
    }

    const numbered = [...shape.objections].sort((a, b) => a - b);
    const gap = numbered.findIndex((n, i) => n !== i + 1);
    if (gap !== -1) {
      defects.push({
        kind: "objection-not-contiguous",
        locator: shape.locator,
        page: shape.page,
        detail: `objections numbered ${numbered.join(", ")}`,
      });
    }
  }

  return defects;
}

/**
 * Compare each question's article count against the count it announces.
 *
 * THIS IS THE ONE CHECK IN THIS SOURCE THAT IS NOT THE TRANSCRIBER'S WORD.
 *
 * Every other signal here — the `TITLE`, the apparatus span, the headings, the
 * reference ids, the dropdown — is a field emitted by one generator out of one
 * database, so their agreement is evidence that the rendering is sound and
 * nothing more (ADR-020's §211: two signals agreeing can be wrong together).
 * The prooemium's "Et circa hoc quaeruntur quatuor" was written by Aquinas in
 * the thirteenth century and reaches us through a different path entirely.
 *
 * That makes it the closest thing this source has to the cross-lingual diff the
 * Catechism gets for free, and the Summa is ingested in one language only. It
 * agrees for 500 of the 501 questions that state a countable numeral. The one
 * that does not is II-II q. 48, which announces four and which this edition
 * renders as a single article — Aquinas and his editors disagreeing about where
 * the article boundaries fall, faithfully transcribed, and declared rather than
 * repaired, because patching either side would invent a structure neither
 * states.
 *
 * Nine questions use a prooemium formula carrying no numeral and two carry no
 * prooemium at all. For those the check is SKIPPED and the skip is declared, so
 * "we could not check this" never arrives looking like "we checked".
 */
export function checkStatedArticleCounts(units: ParsedUnit[]): CorpusDefect[] {
  const counted = new Map<string, Set<number>>();
  const prooemia = new Map<string, ParsedUnit>();

  for (const unit of units) {
    const [part, question, article, rank] = unit.sequence;
    if (question === 0) continue; // the work's and the parts' own prologues
    const key = `${part}.${question}`;

    if (rank === ROLE_RANK.pr && article === 0) {
      prooemia.set(key, unit);
      continue;
    }
    if (!counted.has(key)) counted.set(key, new Set());
    // Article 0 is a single-article question addressing its units at the
    // question level — one article, which is what the set records.
    counted.get(key)!.add(article);
  }

  const defects: CorpusDefect[] = [];

  for (const [key, articles] of counted) {
    const prooemium = prooemia.get(key);
    if (!prooemium) {
      const sample = units.find((u) => u.sequence.slice(0, 2).join(".") === key)!;
      defects.push({
        kind: "article-count-unstated",
        locator: parentLocator(sample.locator).replace(/\.a\d+$/, ""),
        page: sample.page,
        detail: "no prooemium unit, so no stated article count to check",
      });
      continue;
    }

    const locator = parentLocator(prooemium.locator);
    const stated = statedArticleCount(prooemium.text);

    if (stated === null) {
      defects.push({
        kind: "article-count-unstated",
        locator,
        page: prooemium.page,
        detail: "prooemium states no countable article number",
      });
    } else if (stated !== articles.size) {
      defects.push({
        kind: "article-count-mismatch",
        locator,
        page: prooemium.page,
        detail: `prooemium states ${stated} article(s), the edition renders ${articles.size}`,
      });
    }
  }

  return defects;
}

export function parseCorpusThomisticum(
  pages: { page: string; html: string }[]
): ParseResult {
  const units: ParsedUnit[] = [];
  const defects: CorpusDefect[] = [];
  const unnumberedPages: string[] = [];
  const skipped: Record<string, number> = {};

  const skip = (reason: string) => {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
  };

  for (const { page, html } of pages) {
    const marks = headingsOf(html);
    const labels: string[] = [];
    let ordinal = 0;

    UNIT.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = UNIT.exec(html)) !== null) {
      const [, title, inner] = match;
      const at = match.index;

      const address = parseAddress(title.trim());
      if (!address) {
        skip("title-unparseable");
        defects.push({
          kind: "label-disagreement",
          locator: `page:${page}`,
          page,
          detail: `TITLE="${title}" is not an address this parser reads`,
        });
        continue;
      }

      const locator = locatorOf(address);
      labels.push(foldLocator(title));

      // ── the second and third statements of the same address ──────────────
      const ref = REF.exec(inner);
      const anchor = ANCHOR.exec(inner);
      const refLocator = ref ? foldLocator(ref[2]) : null;

      if (refLocator !== null && refLocator !== foldLocator(title)) {
        defects.push({
          kind: "label-disagreement",
          locator,
          page,
          detail: `TITLE says "${foldLocator(title)}", the apparatus says "${refLocator}"`,
        });
      }

      const here = positionAt(marks, at);
      const questionDisagrees =
        here.quaestio !== null &&
        address.question !== null &&
        here.quaestio !== address.question;
      const articleDisagrees =
        here.articulus !== null &&
        address.article !== null &&
        here.articulus !== address.article;

      if (questionDisagrees || articleDisagrees) {
        defects.push({
          kind: "label-disagreement",
          locator,
          page,
          detail:
            `TITLE says q. ${address.question} a. ${address.article}, ` +
            `the headings say Quaestio ${here.quaestio} Articulus ${here.articulus}`,
        });
      }

      // ── the text, with the apparatus removed ────────────────────────────
      const body = ref ? inner.replace(REF, "") : inner;
      const text = trimMarkerResidue(
        normaliseUnitText(body, FOOTNOTE_REF_NONE)
      );

      ordinal += 1;
      units.push({
        locator,
        sequence: sequenceOf(address),
        label: foldLocator(title),
        // The reference id is the SECOND signal here, not the address: it is
        // corroboration and it is discarded before storage (ADR-021).
        anchor: anchor ? anchor[1] : null,
        anchorExpected: ref ? ref[1] : null,
        relabelledFrom: null,
        text,
        role: ROLE_OF[address.role] ?? null,
        page,
        ordinal,
      });
    }

    if (labels.length === 0) {
      unnumberedPages.push(page);
      continue;
    }

    defects.push(...checkEnumeration(page, html, labels));
  }

  // Whole-document checks: an article's own shape, and the article count each
  // question announces in its prooemium (ADR-022).
  defects.push(...checkArticleShapes(units));
  defects.push(...checkStatedArticleCounts(units));

  // Every unit states its address twice over, in two spellings, so check 1 has
  // an operand. The sequence is a TREE — how many objections an article carries
  // is a fact about the article, not something its address implies — so the
  // completeness half of check 2 is skipped, and ADR-022 says what pays for it.
  return {
    units,
    defects,
    unnumberedPages,
    skipped,
    anchorSignal: true,
    denseSequence: false,
  };
}
