"""Metric definitions, checked against hand-computed expectations.

Every expected value below is worked out by hand in the test's own docstring or
comment. None is derived from the implementation — a metric that agrees with
itself proves nothing, and these numbers will be the basis of a permanent ADR.
"""

from __future__ import annotations

import pytest

from apologia_eval.metrics import (
    full_recall_at_k,
    is_scorable,
    recall_at_k,
    reciprocal_rank,
)


def chunks(*groups: str) -> list[frozenset[str]]:
    """Ranked result from a compact spelling: "a,b" is one chunk covering two."""
    return [frozenset(group.split(",")) for group in groups]


# ── recall@k ────────────────────────────────────────────────────────────────


def test_recall_hits_when_one_expected_unit_is_in_the_top_k() -> None:
    # ccc:284 sits at rank 2, so it is inside k=2 and outside k=1.
    retrieved = chunks("ccc:1", "ccc:284", "ccc:999")
    assert recall_at_k(retrieved, ["ccc:284"], k=2) == 1.0
    assert recall_at_k(retrieved, ["ccc:284"], k=1) == 0.0


def test_recall_is_binary_not_a_fraction() -> None:
    """Two of three expected units found still scores 1.0.

    `recall@k` as `docs/evaluation.md` defines it is "≥1 expected unit appears
    in the top k" — a hit rate over questions, not a per-question fraction.
    `full-recall@k` is the one that counts them all.
    """
    retrieved = chunks("ccc:283", "ccc:284")
    assert recall_at_k(retrieved, ["ccc:283", "ccc:284", "ccc:999"], k=10) == 1.0


def test_recall_rejects_a_question_with_no_expected_units() -> None:
    with pytest.raises(ValueError, match="no expected units"):
        recall_at_k(chunks("ccc:1"), [], k=5)


# ── full-recall@k ───────────────────────────────────────────────────────────


def test_full_recall_needs_every_expected_unit() -> None:
    retrieved = chunks("ccc:283", "ccc:284")
    assert full_recall_at_k(retrieved, ["ccc:283", "ccc:284"], k=2) == 1.0
    assert full_recall_at_k(retrieved, ["ccc:283", "ccc:284", "ccc:338"], k=2) == 0.0


def test_full_recall_accumulates_across_ranks() -> None:
    """The union of the top k, not any single chunk, must cover the expectation."""
    retrieved = chunks("ccc:283", "ccc:999", "ccc:284")
    assert full_recall_at_k(retrieved, ["ccc:283", "ccc:284"], k=2) == 0.0
    assert full_recall_at_k(retrieved, ["ccc:283", "ccc:284"], k=3) == 1.0


def test_one_summa_chunk_can_satisfy_full_recall_alone() -> None:
    """A `scholastic-article@1` chunk covers a whole article.

    q-0003 expects `.arg1` and `.ad1` of the same article, and both live in one
    chunk — so a single retrieval at rank 1 legitimately satisfies full-recall.
    This is why a ranked result is a sequence of SETS: flattening it would have
    counted this one chunk as two independent hits.
    """
    article = chunks(
        "summa:I.q2.a3.arg1,summa:I.q2.a3.sc,summa:I.q2.a3.co,summa:I.q2.a3.ad1"
    )
    expected = ["summa:I.q2.a3.arg1", "summa:I.q2.a3.ad1"]
    assert full_recall_at_k(article, expected, k=1) == 1.0
    assert reciprocal_rank(article, expected) == 1.0


# ── MRR ─────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("rank", "expected_rr"),
    [(1, 1.0), (2, 0.5), (3, 1 / 3), (4, 0.25)],
)
def test_reciprocal_rank_is_one_over_a_one_based_rank(
    rank: int, expected_rr: float
) -> None:
    retrieved = chunks(*(["ccc:999"] * (rank - 1)), "ccc:284")
    assert reciprocal_rank(retrieved, ["ccc:284"]) == pytest.approx(expected_rr)


def test_reciprocal_rank_uses_the_first_hit_not_the_best() -> None:
    """Rank 2 hits one expected unit; rank 3 hits two. The answer is 1/2."""
    retrieved = chunks("ccc:999", "ccc:283", "ccc:284,ccc:338")
    assert reciprocal_rank(retrieved, ["ccc:283", "ccc:284", "ccc:338"]) == 0.5


def test_reciprocal_rank_is_zero_past_the_cutoff() -> None:
    """A hit at rank 11 does not count towards MRR@10."""
    retrieved = chunks(*(["ccc:999"] * 10), "ccc:284")
    assert reciprocal_rank(retrieved, ["ccc:284"], k=10) == 0.0
    assert reciprocal_rank(retrieved, ["ccc:284"], k=11) == pytest.approx(1 / 11)


# ── scorability ─────────────────────────────────────────────────────────────


def test_refusal_questions_are_not_retrieval_questions() -> None:
    """q-0007 and q-0009 carry no expected_units and must be excluded.

    Scoring them as 0.0 understates the retriever; scoring them as 1.0
    overstates it. Neither is a retrieval result.
    """
    assert is_scorable([]) is False
    assert is_scorable(["ccc:283"]) is True


def test_k_must_be_at_least_one() -> None:
    with pytest.raises(ValueError, match="k must be >= 1"):
        recall_at_k(chunks("ccc:1"), ["ccc:1"], k=0)
