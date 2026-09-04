import type {
  AnswerSegment,
  ContextUnit,
  GeneratedAnswer,
  VerificationResult,
  Violation,
} from "@/types/domain";
import { QUOTATION_LIMITS, type QuotationLimits } from "./limits";

/**
 * The citation gate (ADR-005). Deterministic, total, and run BEFORE display —
 * not a score, not a judge model, not after streaming.
 *
 * This is the single most important correctness property in the product: it is
 * what separates "the citation looks supported" from "the citation is provably
 * real". Everything here is pure logic over fixed input — no network, no
 * database, no API key — which is exactly why it is exhaustively unit tested
 * rather than measured (ADR-015).
 *
 * ── Two things worth understanding before changing this ──────────────────────
 *
 * 1. `context` IS THE UNIVERSE. The gate is given the units that were handed to
 *    the model, and nothing else. A locator absent from `context` is treated as
 *    fabricated even if it exists in the corpus — because the model did not see
 *    it, so it cannot have been reading it. Resolving against the database
 *    instead would turn a lucky guess into a passing citation.
 *
 * 2. THE COMPARISON IS BYTE-EXACT AND DELIBERATELY UNFORGIVING. A curly
 *    apostrophe against a straight one fails. That is the correct direction to
 *    fail in: a lenient comparison is one that can be talked into accepting a
 *    quotation the source never wrote, which is the precise failure ADR-014
 *    exists to prevent. Normalisation belongs at ingestion, applied once, on
 *    both sides — never here.
 */
export function verifyAnswer(
  answer: GeneratedAnswer,
  context: ContextUnit[],
  limits: QuotationLimits = QUOTATION_LIMITS
): VerificationResult {
  const units = new Map(context.map((u) => [u.locator, u]));
  const fatal: Violation[] = [];
  const dropped: Violation[] = [];

  // ── Pass 1: quotations ─────────────────────────────────────────────────────
  // Exactness is checked first and is never repairable. A quotation that is not
  // verbatim is a fabricated quotation attributed to a real locator — the
  // characteristic catastrophic failure in this domain. Dropping it would hide
  // a broken generator behind a green check.
  const survivingQuotes = new Set<number>();

  answer.segments.forEach((segment, index) => {
    if (segment.kind !== "quotation") return;

    const unit = units.get(segment.locator);
    if (!unit) {
      fatal.push({
        code: "quotation_unknown_locator",
        segment: index,
        locator: segment.locator,
        detail: `quoted ${segment.locator}, which was not in the supplied context`,
      });
      return;
    }

    if (!unit.text.includes(segment.text)) {
      fatal.push({
        code: "quotation_not_exact",
        segment: index,
        locator: segment.locator,
        detail: `the quoted span is not verbatim in ${segment.locator}`,
      });
      return;
    }

    // Below here the quotation is genuine; what remains are proportionality
    // dials, and a dial breach is repaired by dropping the quotation. The
    // answer's own prose carries the claim regardless.
    if (segment.text.length > limits.maxCharsPerQuote) {
      dropped.push({
        code: "quotation_too_long",
        segment: index,
        locator: segment.locator,
        detail: `${segment.text.length} chars exceeds maxCharsPerQuote=${limits.maxCharsPerQuote}`,
      });
      return;
    }

    if (limits.requireAttribution && !(unit.edition && unit.url)) {
      dropped.push({
        code: "quotation_missing_attribution",
        segment: index,
        locator: segment.locator,
        detail: `${segment.locator} lacks an edition or a link; the statute requires the source be named`,
      });
      return;
    }

    survivingQuotes.add(index);
  });

  // Per-unit ratio, summed across surviving quotations of the SAME unit. Summed
  // rather than checked one at a time because three compliant fragments can
  // otherwise reassemble a whole CCC paragraph, which is the thing the limit
  // exists to prevent.
  const quotedPerUnit = new Map<string, number>();
  for (const index of survivingQuotes) {
    const segment = answer.segments[index] as Extract<AnswerSegment, { kind: "quotation" }>;
    quotedPerUnit.set(
      segment.locator,
      (quotedPerUnit.get(segment.locator) ?? 0) + segment.text.length
    );
  }

  for (const [locator, quotedChars] of quotedPerUnit) {
    const unit = units.get(locator);
    if (!unit || unit.text.length === 0) continue;

    if (quotedChars / unit.text.length > limits.maxQuotedRatioOfUnit) {
      // Drop every quotation of this unit: the breach is a property of the set,
      // so there is no principled single member to blame.
      for (const index of [...survivingQuotes]) {
        const segment = answer.segments[index] as Extract<AnswerSegment, { kind: "quotation" }>;
        if (segment.locator !== locator) continue;
        survivingQuotes.delete(index);
        dropped.push({
          code: "quotation_exceeds_unit_ratio",
          segment: index,
          locator,
          detail:
            `${quotedChars}/${unit.text.length} of ${locator} quoted, over ` +
            `maxQuotedRatioOfUnit=${limits.maxQuotedRatioOfUnit}`,
        });
      }
    }
  }

  // Whole-answer ratio. Over the limit, quotations are dropped from the END
  // backwards until compliant — deterministic, and it keeps the earliest
  // quotation, which is the one the answer leads with.
  //
  // Both sides are measured over what SURVIVES, so the denominator shrinks as
  // quotations are dropped. That is the whole point of the limit: it constrains
  // the answer a reader is actually shown, not a draft that included text now
  // removed. Holding the denominator at the original length would let a
  // quotation-heavy draft satisfy the check by having been quotation-heavy.
  const proseChars = answer.segments.reduce(
    (n, s) => (s.kind === "quotation" ? n : n + s.text.length),
    0
  );
  const quotedChars = () =>
    [...survivingQuotes].reduce((n, i) => n + answer.segments[i].text.length, 0);

  for (const index of [...survivingQuotes].sort((a, b) => b - a)) {
    const displayed = proseChars + quotedChars();
    if (displayed === 0 || quotedChars() / displayed <= limits.maxQuotedRatioOfAnswer) break;

    survivingQuotes.delete(index);
    dropped.push({
      code: "quotation_exceeds_answer_ratio",
      segment: index,
      locator: (answer.segments[index] as Extract<AnswerSegment, { kind: "quotation" }>).locator,
      detail:
        `quoted text exceeds maxQuotedRatioOfAnswer=${limits.maxQuotedRatioOfAnswer} ` +
        `of the ${displayed}-char displayed answer`,
    });
  }

  // ── Pass 2: claims ─────────────────────────────────────────────────────────
  // An uncited claim is fatal, not repairable. The repair would be deleting a
  // sentence the answer depends on, which changes what the answer says — and a
  // gate that edits meaning is worse than one that refuses.
  const repairedSegments: AnswerSegment[] = [];

  answer.segments.forEach((segment, index) => {
    if (segment.kind === "connective") {
      repairedSegments.push(segment);
      return;
    }

    if (segment.kind === "quotation") {
      if (survivingQuotes.has(index)) repairedSegments.push(segment);
      return;
    }

    const kept: string[] = [];
    for (const locator of segment.citations) {
      if (units.has(locator)) {
        kept.push(locator);
        continue;
      }
      dropped.push({
        code: "citation_not_in_context",
        segment: index,
        locator,
        detail: `cited ${locator}, which was not in the supplied context`,
      });
    }

    if (kept.length === 0) {
      fatal.push({
        code: "claim_without_citation",
        segment: index,
        detail:
          segment.citations.length === 0
            ? "claim segment carries no citation at all"
            : "every citation on this claim was dropped, leaving it unsupported",
      });
      return;
    }

    repairedSegments.push(
      kept.length === segment.citations.length ? segment : { ...segment, citations: kept }
    );
  });

  if (fatal.length > 0) {
    // Report everything found, not just the first fatal one — a caller looking
    // at a failed answer wants the whole picture, and the eval harness slices
    // on these codes.
    return { status: "failed", violations: [...fatal, ...dropped] };
  }

  if (dropped.length === 0) {
    return { status: "pass", answer };
  }

  return {
    status: "repaired",
    answer: { ...answer, segments: repairedSegments },
    dropped,
  };
}
