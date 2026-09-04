/**
 * Quotation limits — the proportionality half of ADR-017.
 *
 * ⚠️ THESE NUMBERS ARE A LEGAL JUDGEMENT, NOT AN ENGINEERING ONE.
 *
 * The Hungarian quotation right (1999. évi LXXVI. tv. 34. §) permits quotation
 * without permission when it is faithful to the original, names its source, and
 * is *proportionate to the purpose of the quoting work*. The statute supplies no
 * number for the third condition — someone has to choose it, and the project
 * owner has taken that call explicitly (ADR-017).
 *
 * They live in one exported object, and nowhere else, so the choice stays
 * attributable and changeable in a single place. Do not inline a `slice(0, 300)`
 * anywhere in the answer path; a threshold that cannot be found later is a
 * threshold nobody can review.
 *
 * Tightening these needs no argument. Loosening them is an ADR amendment.
 * Setting `maxCharsPerQuote` to 0 reverts to ADR-014's original posture —
 * locator and link, no quotation — with no code change.
 */
export interface QuotationLimits {
  maxCharsPerQuote: number;
  maxQuotedRatioOfAnswer: number;
  maxQuotedRatioOfUnit: number;
  requireAttribution: boolean;
}

/**
 * Deliberately NOT `as const`. Literal types here would make the thresholds
 * unoverridable, which would block the revert path ADR-017 promises — setting
 * `maxCharsPerQuote` to 0 to return to ADR-014's posture — and would make them
 * untestable at any value but the shipped one.
 */
export const QUOTATION_LIMITS: QuotationLimits = {
  /** One quotation never runs long. ~a long sentence or two. */
  maxCharsPerQuote: 400,

  /** The answer stays substantially our own authorship (ADR-014). */
  maxQuotedRatioOfAnswer: 0.25,

  /**
   * Never reproduce a whole citable unit. Summed PER UNIT, so three short
   * quotations cannot be used to reassemble one CCC paragraph.
   */
  maxQuotedRatioOfUnit: 0.5,

  /** The statute's "source named" condition. Not a dial — turning this off
   *  would breach a stated requirement rather than relax a chosen threshold. */
  requireAttribution: true,
};
