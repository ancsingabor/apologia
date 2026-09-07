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
 */

const PAD = 4;

function expectedAnchor(paragraph: number): string {
  return `K${String(paragraph).padStart(PAD, "0")}`;
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
    const key = `${unit.page}:${unit.paragraph}`;
    const occurrence = (seen.get(key) ?? 0) + 1;
    seen.set(key, occurrence);

    const rule = errata.relabels.find(
      (r) =>
        r.page === unit.page &&
        r.foundLabel === unit.paragraph &&
        r.occurrence === occurrence
    );
    if (!rule) return unit;

    const paragraph = Number(rule.correctLocator.split(":")[1]);
    return {
      ...unit,
      locator: rule.correctLocator,
      paragraph,
      relabelledFrom: unit.paragraph,
    };
  });

  return relabelled
    .slice()
    .sort((a, b) => a.paragraph - b.paragraph)
    .map((unit, index) => ({ ...unit, ordinal: index + 1 }));
}

/** Every defect the three checks can see, over the relabelled units. */
export function detectDefects(
  units: ParsedUnit[],
  errata: CorpusErrata
): CorpusDefect[] {
  const defects: CorpusDefect[] = [];

  // ── Check 1: the two signals agree ─────────────────────────────────────────
  for (const unit of units) {
    // A relabelled unit's anchor necessarily disagrees — the source printed the
    // wrong number, which is what the relabel records. Reporting it again as an
    // anchor defect would need a second declaration for one fault.
    if (unit.relabelledFrom !== null) continue;

    const want = expectedAnchor(unit.paragraph);
    if (unit.anchor === null) {
      defects.push({
        kind: "anchor-absent",
        locator: unit.locator,
        page: unit.page,
        detail: `no anchor; located from the printed number ${unit.paragraph}`,
      });
    } else if (unit.anchor !== want) {
      defects.push({
        kind:
          unit.anchor === String(unit.paragraph)
            ? "anchor-missing-prefix"
            : "anchor-typo",
        locator: unit.locator,
        page: unit.page,
        detail: `anchor name="${unit.anchor}", expected "${want}"`,
      });
    }
  }

  // ── Check 2: the sequence is complete and strictly increasing ──────────────
  let previous = 0;
  for (const unit of units) {
    if (unit.paragraph <= previous) {
      defects.push({
        kind: "number-not-increasing",
        locator: unit.locator,
        page: unit.page,
        detail: `paragraph ${unit.paragraph} repeats or regresses after ${previous}`,
      });
    } else {
      for (let gap = previous + 1; gap < unit.paragraph; gap += 1) {
        defects.push({
          kind: "paragraph-absent",
          locator: `ccc:${gap}`,
          page: unit.page,
          detail: `sequence jumps ${previous} → ${unit.paragraph}`,
        });
      }
    }
    previous = Math.max(previous, unit.paragraph);
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
  const found = [...parsed.defects, ...detectDefects(units, errata)];

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
