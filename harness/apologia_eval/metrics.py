"""Retrieval metrics, exactly as `docs/evaluation.md` fixes them.

These are pure functions over data, so under ADR-015's axis they get unit tests
and a failure is a bug — the same rule that puts `lib/corpus/` under Vitest.
The axis is determinism, not which language or which side of the boundary.

── What a "retrieved item" is, and why it is a SET of locators ──────────────

The gold set expresses expectations in citable units (`ccc:283`,
`summa:I.q2.a3.co`). Retrieval returns CHUNKS. Those are not the same thing and
the mapping is n:m by design — `chunk_units` exists so that re-chunking never
invalidates a citation (ADR-002).

For the Catechism the distinction is invisible: `numbered-paragraph@1` puts one
unit in one chunk. For the Summa it is the whole story: `scholastic-article@1`
puts an entire article — objections, sed contra, respondeo, replies — into one
chunk, so a single retrieved chunk covers many units at once.

So a ranked result is a sequence of *sets*: position i is the set of unit
locators that the i-th retrieved chunk maps to. Flattening that to a list of
locators would be wrong in a way that inflates every score, because one Summa
chunk would count as ~7 separate hits and `full-recall@k` would be satisfied by
retrieving a single chunk at rank 1.
"""

from __future__ import annotations

from collections.abc import Sequence

RankedUnits = Sequence[frozenset[str]]
"""Ranked retrieval result: position i holds the units the i-th chunk covers."""


def _covered(retrieved: RankedUnits, k: int) -> set[str]:
    """Every unit locator covered by the top *k* retrieved chunks."""
    if k < 1:
        raise ValueError(f"k must be >= 1, got {k}")
    covered: set[str] = set()
    for chunk_units in retrieved[:k]:
        covered |= chunk_units
    return covered


def recall_at_k(retrieved: RankedUnits, expected: Sequence[str], k: int) -> float:
    """1.0 if at least one expected unit appears in the top *k*, else 0.0.

    Binary per question; the reported figure is the mean over questions. A
    question with no expected units is not a retrieval question at all (the
    refusal cases, q-0007 and q-0009) and must be excluded by the caller rather
    than scored — see `is_scorable`.
    """
    if not expected:
        raise ValueError("recall is undefined for a question with no expected units")
    return 1.0 if _covered(retrieved, k) & set(expected) else 0.0


def full_recall_at_k(retrieved: RankedUnits, expected: Sequence[str], k: int) -> float:
    """1.0 only if *every* expected unit appears in the top *k*.

    `docs/evaluation.md` calls this "the one that matters for multi-source
    questions". It is the metric the Summa ingest unblocked: q-0003 is the only
    multi-source question in v0, so before the Summa was in a database this
    metric had zero valid instances.
    """
    if not expected:
        raise ValueError("recall is undefined for a question with no expected units")
    return 1.0 if set(expected) <= _covered(retrieved, k) else 0.0


def reciprocal_rank(
    retrieved: RankedUnits, expected: Sequence[str], k: int = 10
) -> float:
    """1/rank of the first chunk covering any expected unit, else 0.0.

    Ranks are 1-based. Averaged over questions this is MRR@k.
    """
    if not expected:
        raise ValueError("MRR is undefined for a question with no expected units")
    if k < 1:
        raise ValueError(f"k must be >= 1, got {k}")
    wanted = set(expected)
    for index, chunk_units in enumerate(retrieved[:k], start=1):
        if chunk_units & wanted:
            return 1.0 / index
    return 0.0


def is_scorable(expected: Sequence[str]) -> bool:
    """Whether a gold question participates in retrieval metrics at all.

    Two of the ten v0 questions have no `expected_units` — q-0007 (adversarial)
    and q-0009 (out-of-scope). They test refusal behaviour, which is measured
    separately. Averaging them in as zeros would report a retriever as worse
    than it is; averaging them in as ones would report it as better. Neither is
    a retrieval result, so they are excluded and counted.
    """
    return len(expected) > 0
