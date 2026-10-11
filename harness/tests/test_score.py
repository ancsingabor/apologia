"""Hand-calculated retrieval and paired statistics; no service substitutes."""

import math

import pytest

from apologia_eval.gold import GoldQuestion
from apologia_eval.score import (
    Report,
    aggregate,
    aggregate_by_source,
    compare_reports,
    estimated_sample_size,
    gold_hash,
    mean_interval,
    score_question,
    summary,
)


def question(identifier: str = "q-1", cross: bool = False) -> GoldQuestion:
    return GoldQuestion(
        id=identifier,
        question="invented",
        language="hu",
        category="doctrine",
        expected_units=["ccc:1", "summa:I.q1.a1.co"],
        cross_lingual=cross,
    )


def test_chunk_sets_preserve_rank_and_full_recall() -> None:
    result = score_question(question(), [frozenset(), frozenset({"ccc:1"})])
    assert result.metrics["recall@5"] == 1
    assert result.metrics["full-recall@5"] == 0
    assert result.metrics["MRR@10"] == 0.5
    whole = score_question(question(), [frozenset(question().expected_units)])
    assert whole.metrics["full-recall@5"] == 1
    assert whole.metrics["MRR@10"] == 1


def test_unscorable_question_must_be_excluded() -> None:
    q = question().model_copy(update={"expected_units": []})
    with pytest.raises(ValueError, match="no expected units"):
        score_question(q, [])


def test_metric_cutoffs() -> None:
    result = score_question(question(), [frozenset()] * 10 + [frozenset({"ccc:1"})])
    assert result.metrics["recall@10"] == 0
    assert result.metrics["recall@20"] == 1
    assert result.metrics["MRR@10"] == 0


def test_slices_and_empty_slice() -> None:
    scores = [
        score_question(question(), [frozenset({"ccc:1"})]),
        score_question(question("q-2", True), []),
    ]
    result = aggregate(scores, resamples=99)
    assert result["all"]["recall@10"].mean == 0.5
    assert result["same-language"]["recall@10"].mean == 1
    assert result["cross-lingual"]["recall@10"].mean == 0
    assert aggregate(scores[:1])["cross-lingual"]["recall@10"].n == 0


def test_bootstrap_reproducible_and_bounded() -> None:
    values = [0.0, 0.0, 1.0, 1.0]
    a = mean_interval(values, seed=4, resamples=999)
    assert a == mean_interval(values, seed=4, resamples=999)
    assert a.mean == 0.5
    assert a.low is not None and a.high is not None
    assert 0 <= a.low <= a.mean <= a.high <= 1


def test_degenerate_intervals_are_explicit() -> None:
    assert mean_interval([]).status == "empty"
    assert mean_interval([1]).low is None
    constant = mean_interval([1, 1, 1])
    assert constant.low == constant.high == 1
    assert "unobserved" in constant.status
    with pytest.raises(ValueError, match="nonfinite"):
        mean_interval([math.nan])
    with pytest.raises(ValueError, match="positive"):
        mean_interval([0, 1], resamples=0)


def test_sample_size_is_total_paired_n() -> None:
    # [1, 0, 0, 0]: mean=.25, sample variance=.25.
    # (1.959964 + .841621)^2 * .25 / .25^2 = 31.3955 -> 32.
    assert estimated_sample_size([1, 0, 0, 0]) == 32
    assert estimated_sample_size([0, 0]) is None
    assert estimated_sample_size([1, 1]) is None
    assert estimated_sample_size([1, -1]) is None
    assert estimated_sample_size([1]) is None


def test_gold_identity_tracks_expectations_and_not_file_order() -> None:
    a, b = question(), question("q-2")
    assert gold_hash([a, b]) == gold_hash([b, a])
    assert gold_hash([a]) != gold_hash([a.model_copy(update={"cross_lingual": True})])


def report(identity: str, hits: list[bool]) -> Report:
    scores = [
        score_question(question(f"q-{i}"), [frozenset({"ccc:1"})] if hit else [])
        for i, hit in enumerate(hits)
    ]
    return Report(
        created_at="2026-10-08",
        corpus_hash="corpus",
        gold_hash="gold",
        embedding_identity=identity,
        model_id="invented",
        base_family="invented",
        artifact_hash="artifact",
        pooling="mean",
        max_sequence_tokens=512,
        dimensions=2,
        query_prefix="",
        passage_prefix="",
        seed=0,
        resamples=99,
        packages={},
        excluded_question_ids=["q-excluded"],
        truncation_by_source={},
        questions=scores,
        slices=aggregate(scores, resamples=99),
        source_slices={},
        retrieval_latency_ms={"p50": 1, "p95": 2},
    )


def test_paired_comparison_preserves_gains_losses_and_ties() -> None:
    a = report("a", [True, False, True, False])
    b = report("b", [False, True, False, False])
    compared = compare_reports([a, b])["slices"]["all"]
    reordered = b.model_copy(update={"questions": list(reversed(b.questions))})
    assert compare_reports([a, b]) == compare_reports([a, reordered])
    assert compared["first"] == "a"
    assert compared["first_gains"] == ["q-0", "q-2"]
    assert compared["first_loses"] == ["q-1"]
    assert compared["paired_recall@10"]["mean"] == 0.25
    assert (
        compare_reports([a, a.model_copy(update={"embedding_identity": "c"})])[
            "slices"
        ]["all"]["estimated_total_n"]
        is None
    )


@pytest.mark.parametrize("field", ["corpus_hash", "gold_hash"])
def test_incomparable_reports_refused(field: str) -> None:
    a, b = report("a", [True]), report("b", [True])
    with pytest.raises(ValueError, match="different corpus or gold"):
        compare_reports([a, b.model_copy(update={field: "different"})])


def test_mismatched_question_ids_and_duplicates_refused() -> None:
    a, b = report("a", [True]), report("b", [True, False])
    with pytest.raises(ValueError, match="same questions"):
        compare_reports([a, b])
    with pytest.raises(ValueError, match="duplicate embedding"):
        compare_reports([a, a])
    with pytest.raises(ValueError, match="at least two"):
        compare_reports([a])


def test_report_roundtrip_and_human_summary() -> None:
    a = report("a", [True, False])
    assert Report.model_validate_json(a.model_dump_json()) == a
    text = summary(a)
    assert "q-excluded" in text
    assert "not measured" in text
    assert "cross-lingual" in text
    assert "q-0" in text and "q-1" in text
    assert "Query truncated" in text
    assert "p50: 1.00 ms" in text


def test_source_slices_keep_mixed_ranking_and_narrow_expectations() -> None:
    scored = score_question(question(), [frozenset({"ccc:1"})])
    slices = aggregate_by_source([scored])
    assert slices["ccc"]["full-recall@10"].mean == 1
    assert slices["summa"]["recall@10"].mean == 0
    assert slices["ccc"]["recall@10"].n == 1
