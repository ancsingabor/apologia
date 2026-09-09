import type {
  AssertionReport,
  CorpusDefect,
  CorpusErrata,
  ParseResult,
  ParsedUnit,
} from "@/types/domain";

/**
 * The `assert` step of the ingestion pipeline (ADR-019).
 *
 * It is a STEP, not a flag, and the distinction is the whole point. Real web
 * editions of canonical texts carry typesetting defects; a parser that meets
 * them and responds by relaxing its rules has discarded the property the corpus
 * is built on. So the rules stay strict and the known defects are declared in
 * `corpus/errata/*.yaml`, which means an UNDECLARED failure stops the ingest.
 *
 * Three checks, and they are not redundant — each catches something the others
 * pass:
 *
 * | Check | Catches in the Hungarian CCC |
 * |---|---|
 * | anchor agrees with printed number | §74, §2096, §2213, §2621 |
 * | sequence is complete and strictly increasing | §146–§148, §211 |
 * | count matches `expected_units` | a page that silently failed to fetch |
 *
 * The second one is the one people delete as redundant. It is not. In §211 the
 * anchor said `K0210` and the printed number said `210.` — the two signals
 * agreed with each other and were both wrong, so the agreement check passes and
 * the paragraph is filed as a duplicate §210. Agreement between two signals is
 * not correctness; it is only evidence against *independent* error.
 *
 * ── The first check needs a source that has two signals ─────────────────────
 *
 * vatican.va states each paragraph number once. Every `<a name=…>` in its body
 * is a footnote, so there is no second operand and the check would report all
 * 2,865 English units as `anchor-absent` — 2,865 errata allowances, which is a
 * wildcard spelled at length.
 *
 * So the check is conditioned on `ParseResult.anchorSignal`, and ADR-020 makes
 * that a debt rather than a discount: a parser that declares no anchor signal
 * owes a compensating check. `vatican-intratext` pays with a per-page footnote
 * apparatus balance — which guards the body/apparatus cut, the boundary that
 * silently corrupted §1065 and §1666 in Hungarian with every assertion here
 * green — and with a cross-lingual locator-set equality test in `integration/`,
 * which is a stronger check than anything the Hungarian document has.
 */

/**
 * Lexicographic order over `ParsedUnit.sequence`.
 *
 * `[146] < [147]` and `[1, 2, 1, 1, 3] < [1, 2, 1, 2, 1]`, by the same rule.
 * A shorter tuple that is a prefix of a longer one sorts first, which is what
 * puts a question's prooemium ahead of its articles: `summa:I.q2.pr` is
 * `[1, 2]` and `summa:I.q2.a1.arg1` is `[1, 2, 1, 1, 1]`.
 */
export function compareSequence(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const left = a[i] ?? -Infinity;
    const right = b[i] ?? -Infinity;
    if (left !== right) return left < right ? -1 : 1;
  }
  return 0;
}

/** `[146]` → `[147]`. Only meaningful for a dense one-dimensional sequence. */
function successor(sequence: number[]): number[] {
  return [sequence[0] + 1];
}

/**
 * Apply declared `misnumbered` errata, then re-sort into locator order.
 *
 * This exists because the Hungarian source has a drift region: paragraphs 146,
 * 147 and 148 are printed as 147, 148 and 149, and the duplicate 149 puts the
 * sequence back in step. Ingested as printed, `ccc:147` would return §146's
 * text under a locator that resolves and a quotation that verifies — a citation
 * that is provably exact and points at the wrong paragraph.
 *
 * The corrections are DECLARED rather than inferred. A parser that tried to
 * detect drift and shift labels back would be guessing at intent across a
 * region it cannot see the end of; a table of four entries someone checked
 * against the authoritative text is a fact.
 */
export function applyRelabels(
  units: ParsedUnit[],
  errata: CorpusErrata
): ParsedUnit[] {
  const seen = new Map<string, number>();

  const relabelled = units.map((unit) => {
    const key = `${unit.page}:${unit.label}`;
    const occurrence = (seen.get(key) ?? 0) + 1;
    seen.set(key, occurrence);

    const rule = errata.relabels.find(
      (r) =>
        r.page === unit.page &&
        String(r.foundLabel) === unit.label &&
        r.occurrence === occurrence
    );
    if (!rule) return unit;

    // A relabel is declared for a numbered source, where the corrected locator's
    // own number IS the corrected position. A tree-shaped source has never
    // needed one; if it ever does, the rule will have to carry the sequence.
    const corrected = Number(rule.correctLocator.split(":")[1]);
    return {
      ...unit,
      locator: rule.correctLocator,
      sequence: [corrected],
      relabelledFrom: unit.label,
    };
  });

  return relabelled
    .slice()
    .sort((a, b) => compareSequence(a.sequence, b.sequence))
    .map((unit, index) => ({ ...unit, ordinal: index + 1 }));
}

/**
 * Every defect the three checks can see, over the relabelled units.
 *
 * `anchorSignal` says whether the source addresses its paragraphs a second time
 * in markup. It is a fact about the edition, reported by its parser — never a
 * knob to turn when a check becomes inconvenient (ADR-020).
 */
export function detectDefects(
  units: ParsedUnit[],
  errata: CorpusErrata,
  anchorSignal: boolean,
  denseSequence: boolean
): CorpusDefect[] {
  const defects: CorpusDefect[] = [];

  // ── Check 1: the two signals agree ─────────────────────────────────────────
  // Skipped entirely, rather than passed vacuously, when the source has one
  // signal: "we did not check this" and "we checked and it was fine" must not
  // arrive in the report looking the same.
  for (const unit of anchorSignal ? units : []) {
    // A relabelled unit's anchor necessarily disagrees — the source printed the
    // wrong number, which is what the relabel records. Reporting it again as an
    // anchor defect would need a second declaration for one fault.
    if (unit.relabelledFrom !== null) continue;

    const want = unit.anchorExpected;
    if (unit.anchor === null) {
      defects.push({
        kind: "anchor-absent",
        locator: unit.locator,
        page: unit.page,
        detail: `no anchor; located from the printed label ${unit.label}`,
      });
    } else if (unit.anchor !== want) {
      defects.push({
        kind:
          unit.anchor === unit.label ? "anchor-missing-prefix" : "anchor-typo",
        locator: unit.locator,
        page: unit.page,
        detail: `anchor name="${unit.anchor}", expected "${want}"`,
      });
    }
  }

  // ── Check 2: the sequence is complete and strictly increasing ──────────────
  // STRICTLY INCREASING applies to every source; COMPLETE applies only where
  // the source says what "complete" means. A tree has no next address, so gap
  // enumeration is skipped rather than guessed — inventing a successor for it
  // is ADR-020's rejected option 2, an assertion that cannot fail for the right
  // reason.
  // ⚠️ A dense sequence starts at 1, and the sentinel is what asserts it. Start
  // it empty instead and a document whose first paragraphs failed to parse
  // reports nothing at all — the gap loop has no left edge to run from. That
  // regression was introduced by this generalisation and caught by nothing in
  // the suite, which is why the case below is now pinned by a test.
  let previous: number[] = denseSequence ? [0] : [];
  for (const unit of units) {
    if (previous.length > 0 && compareSequence(unit.sequence, previous) <= 0) {
      defects.push({
        kind: "number-not-increasing",
        locator: unit.locator,
        page: unit.page,
        detail: `${unit.label} repeats or regresses after ${previous.join(".")}`,
      });
    } else if (denseSequence) {
      for (
        let gap = previous.length > 0 ? successor(previous) : unit.sequence;
        compareSequence(gap, unit.sequence) < 0;
        gap = successor(gap)
      ) {
        defects.push({
          kind: "paragraph-absent",
          locator: `${errata.source}:${gap[0]}`,
          page: unit.page,
          detail: `sequence jumps ${previous.join(".")} → ${unit.sequence.join(".")}`,
        });
      }
    }
    if (previous.length === 0 || compareSequence(unit.sequence, previous) > 0) {
      previous = unit.sequence;
    }
  }

  // ── Check 3: the count ─────────────────────────────────────────────────────
  if (units.length !== errata.expectedUnits) {
    defects.push({
      kind: "count-mismatch",
      locator: `${errata.source}:*`,
      page: null,
      detail: `parsed ${units.length} units, manifest expects ${errata.expectedUnits}`,
    });
  }

  return defects;
}

/**
 * Run the whole step: relabel, detect, and compare against what is declared.
 *
 * `ok` is false when anything is undeclared, and the caller must treat that as
 * fatal. A stale declaration — one that never fired — is reported but not
 * fatal: it means the source was fixed upstream, and the allowance should be
 * deleted so it stops standing as permission nobody has revisited.
 */
export function assertCorpus(
  parsed: ParseResult,
  errata: CorpusErrata
): { units: ParsedUnit[]; report: AssertionReport } {
  const units = applyRelabels(parsed.units, errata);
  const found = [
    ...parsed.defects,
    ...detectDefects(units, errata, parsed.anchorSignal, parsed.denseSequence),
  ];

  const allowed = new Set(errata.allowed.map((a) => `${a.locator}|${a.kind}`));
  const fired = new Set(found.map((d) => `${d.locator}|${d.kind}`));

  const undeclared = found.filter(
    (d) => !allowed.has(`${d.locator}|${d.kind}`)
  );
  const stale = errata.allowed.filter(
    (a) => !fired.has(`${a.locator}|${a.kind}`)
  );

  return {
    units,
    report: {
      ok: undeclared.length === 0,
      unitCount: units.length,
      undeclared,
      stale,
    },
  };
}
