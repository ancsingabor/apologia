"""The pure half of the pre-flight: similarity, ranking, and the verdict text.

Every expected value here is worked out by hand, for the reason
`tests/test_metrics.py` states: these numbers end up in a permanent ADR, and a
measurement that agrees with itself proves nothing.

No model is exported and nothing is downloaded. What needs torch and an ONNX
runtime is operator-initiated and stays out of CI, by ADR-004's argument applied
to the same shape of job.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from apologia_eval.preflight import (
    PreflightResult,
    cosine,
    margins_at_k,
    merge_results,
    rank_against,
    ranking_agreement,
    verdict_lines,
)

# Three orthogonal unit vectors plus one deliberate near-duplicate, so ranking
# has an unambiguous right answer that can be read off by eye.
X = [1.0, 0.0, 0.0]
Y = [0.0, 1.0, 0.0]
Z = [0.0, 0.0, 1.0]
ALMOST_X = [0.9994, 0.0346, 0.0]  # ~2 degrees off X


# ── cosine ───────────────────────────────────────────────────────────────────


def test_identical_vectors_are_one() -> None:
    assert cosine(X, X) == pytest.approx(1.0)


def test_orthogonal_vectors_are_zero() -> None:
    assert cosine(X, Y) == pytest.approx(0.0)


def test_opposite_vectors_are_minus_one() -> None:
    assert cosine(X, [-1.0, 0.0, 0.0]) == pytest.approx(-1.0)


def test_magnitude_does_not_matter() -> None:
    """Cosine is scale-free, which is why normalisation is optional for ranking."""
    assert cosine(X, [7.0, 0.0, 0.0]) == pytest.approx(1.0)


def test_a_known_angle_by_hand() -> None:
    """45 degrees, worked out rather than recorded from a previous run."""
    assert cosine([1.0, 1.0], [1.0, 0.0]) == pytest.approx(1 / math.sqrt(2))


def test_a_dimension_mismatch_raises_rather_than_truncating() -> None:
    """The defect this module exists to catch, in its own helper.

    A silent `zip` would compare the first 3 dimensions of a 4-dimensional
    vector and return an entirely plausible number.
    """
    with pytest.raises(ValueError, match="dimension mismatch"):
        cosine(X, [1.0, 0.0, 0.0, 0.0])


def test_a_zero_vector_raises_rather_than_dividing_by_zero() -> None:
    with pytest.raises(ValueError, match="zero vector"):
        cosine(X, [0.0, 0.0, 0.0])


# ── ranking ──────────────────────────────────────────────────────────────────


def test_rank_against_orders_by_similarity() -> None:
    assert rank_against(X, [Y, ALMOST_X, Z]) == [1, 0, 2]


def test_rank_against_breaks_ties_deterministically() -> None:
    """Y and Z are both exactly orthogonal to X, so index order decides.

    An unstable sort here would make `ranking_agreement` report disagreement
    that is an artefact of sorting, not of the export.
    """
    assert rank_against(X, [Y, Z]) == [0, 1]
    assert rank_against(X, [Z, Y]) == [0, 1]


# ── ranking agreement, the measure that matters ──────────────────────────────


def test_identical_vectors_agree_completely() -> None:
    reference = [X, Y, Z, ALMOST_X]
    assert ranking_agreement(reference, reference, k=3) == 1.0


def test_a_uniform_scaling_changes_no_ranking() -> None:
    """The whole reason ranking is the headline and cosine is the footnote.

    An export that shrinks every vector by half moves every cosine and reorders
    nothing, so it has cost retrieval exactly nothing.
    """
    reference = [X, Y, Z, ALMOST_X]
    scaled = [[value * 0.5 for value in vector] for vector in reference]
    assert ranking_agreement(reference, scaled, k=3) == 1.0


def test_an_export_that_moves_a_nearest_neighbour_is_caught() -> None:
    """Three probes; the export pulls B away from A and towards C.

    Worked by hand, with A = [1,0], B ≈ 26° off A, C = [0,1]:

    | probe | reference nearest | exported nearest |
    |---|---|---|
    | A | B (0.9 vs 0.0) | B (0.436 vs 0.0) — unchanged |
    | B | A (0.9 vs 0.436) | **C** (0.9 vs 0.436) — changed |
    | C | B (0.436 vs 0.0) | B (0.9 vs 0.0) — unchanged |

    Two of three agree. Note that B's *cosines* changed for every probe while
    only one probe's ordering did: that gap is the whole reason ranking is the
    headline measure and cosine is the footnote.
    """
    a = [1.0, 0.0]
    b = [0.9, 0.436]
    c = [0.0, 1.0]
    b_moved = [0.436, 0.9]

    assert ranking_agreement([a, b, c], [a, b_moved, c], k=1) == pytest.approx(2 / 3)


def test_moving_one_vector_can_change_two_probes_orderings() -> None:
    """Because every probe is both a query and a document in this check.

    Perturbing only Z affects Z's own ranking *and* Y's, since Z is one of the
    documents Y ranks. Worked by hand at k=1, with Z' = [0, 0.7, 0.7]:

    | probe | reference nearest | exported nearest |
    |---|---|---|
    | X | ALMOST_X (0.9994) | ALMOST_X — unchanged |
    | Y | ALMOST_X (0.0346) | **Z'** (0.707) — changed |
    | Z | X (all ties → lowest index) | **Y** (0.707) — changed |
    | ALMOST_X | X (0.9994) | X — unchanged |

    Two of four. The first draft of this test expected three of four, having
    counted only the vector that was edited — the kind of error a recorded
    "expected" value would have frozen in place.
    """
    reference = [X, Y, Z, ALMOST_X]
    moved = [X, Y, [0.0, 0.7, 0.7], ALMOST_X]
    assert ranking_agreement(reference, moved, k=1) == pytest.approx(2 / 4)


# ── margins, which decide whether the agreement number means anything ────────


def test_margin_is_the_smallest_adjacent_gap_not_the_span() -> None:
    """Hand-worked on X, and the two answers differ — which is the whole point.

    X's similarities to the others: ALMOST_X 0.9994, Y 0.0, Z 0.0.
    Sorted: [0.9994, 0.0, 0.0]. Adjacent gaps: 0.9994, then 0.0.

    The rank1→rank3 **span** is 0.9994 and would say this ordering is rock
    solid. The smallest **adjacent** gap is 0.0 — Y and Z are exactly tied, so
    the least perturbation reorders them. The span flatters the test; the
    adjacent gap tells the truth.
    """
    margins = margins_at_k([X, Y, Z, ALMOST_X], k=3)
    assert margins[0] == pytest.approx(0.0, abs=1e-9)


def test_a_clearly_separated_ordering_has_a_real_margin() -> None:
    """Four vectors at distinct angles, so every adjacent gap is substantial."""
    separated = [
        [1.0, 0.0],
        [0.9659, 0.2588],  # 15 degrees
        [0.7071, 0.7071],  # 45 degrees
        [0.0, 1.0],  # 90 degrees
    ]
    # Probe 0's similarities: 0.9659, 0.7071, 0.0 → adjacent gaps 0.259, 0.707.
    assert margins_at_k(separated, k=3)[0] == pytest.approx(0.2588, abs=1e-3)


def test_a_tight_cluster_has_near_zero_margins() -> None:
    """The case that made the first real run misleading.

    Four vectors within about two degrees of each other rank against one another
    on gaps of ~0.001. A perturbation of 0.008 — which is what int8 quantization
    actually costs — reorders them freely, so `ranking_agreement` reports
    disagreement that is noise, not damage.
    """
    cluster = [
        [1.0, 0.0],
        [0.9999, 0.0141],
        [0.9997, 0.0245],
        [0.9995, 0.0316],
    ]
    margins = margins_at_k(cluster, k=3)
    assert max(margins) < 0.01


def test_margin_needs_more_probes_than_k() -> None:
    """Three probes cannot have a rank-3 margin: each ranks only two others."""
    with pytest.raises(ValueError, match="more than k"):
        margins_at_k([X, Y, Z], k=3)


def test_the_verdict_says_no_information_when_every_probe_is_noise_dominated() -> None:
    """The real `multilingual-e5-large` result: 10 of 10 below the perturbation.

    "Partly structural" would be actively misleading here — a reader would take
    it to mean some of the disagreement was real. When every ordering rests on a
    gap smaller than the noise, the agreement figure carries no information in
    either direction, and the verdict has to say exactly that.
    """
    lines = verdict_lines(
        a_result(
            min_cosine=0.99135,
            mean_cosine=0.99242,
            ranking_agreement_at_3=0.6,
            mean_reference_margin_at_3=0.0019,
            cosine_perturbation=0.0076,
            probes_with_margin_below_perturbation=10,
        )
    )
    assert any("no discriminative power" in line for line in lines)
    assert any("carries no information" in line for line in lines)
    assert not any("partly" in line for line in lines)


def test_the_verdict_warns_when_the_margin_is_below_the_perturbation() -> None:
    """A low agreement number must not read as evidence when the test was weak.

    This is `pending is not a pass` in another costume: a check that could not
    have detected anything must not be presented as though it failed.
    """
    lines = verdict_lines(
        a_result(
            min_cosine=0.991,
            mean_cosine=0.992,
            ranking_agreement_at_3=0.6,
            mean_reference_margin_at_3=0.0236,
            cosine_perturbation=0.0076,
            probes_with_margin_below_perturbation=3,
        )
    )
    assert any("decided by noise" in line for line in lines)
    assert any("partly" in line and "structural" in line for line in lines)


# ── merging, because the CLI measures one candidate per run ──────────────────


def test_merge_keeps_candidates_from_earlier_runs(tmp_path: Path) -> None:
    """The defect that would have made a three-model report impossible.

    Measuring one candidate per invocation is deliberate — peak memory is a
    whole-process figure — so a run that wrote only its own result would erase
    the other two every time, leaving no trace that they had ever been measured.
    """
    report = tmp_path / "preflight.json"
    report.write_text(
        json.dumps([a_result(model_id="BAAI/bge-m3").model_dump()]), encoding="utf-8"
    )

    merged = merge_results(
        report, [a_result(model_id="intfloat/multilingual-e5-large")]
    )
    assert {entry["model_id"] for entry in merged} == {
        "BAAI/bge-m3",
        "intfloat/multilingual-e5-large",
    }


def test_merge_replaces_a_re_measured_candidate(tmp_path: Path) -> None:
    """A second run of the same model updates it rather than duplicating it."""
    report = tmp_path / "preflight.json"
    report.write_text(
        json.dumps([a_result(model_id="BAAI/bge-m3", artifact_bytes=1).model_dump()]),
        encoding="utf-8",
    )

    merged = merge_results(report, [a_result(model_id="BAAI/bge-m3", artifact_bytes=2)])
    assert len(merged) == 1
    assert merged[0]["artifact_bytes"] == 2


def test_merge_orders_by_the_slate_not_by_run_time(tmp_path: Path) -> None:
    """A re-measured candidate must not jump position in the report."""
    report = tmp_path / "preflight.json"
    report.write_text(
        json.dumps([a_result(model_id="BAAI/bge-m3").model_dump()]), encoding="utf-8"
    )

    merged = merge_results(
        report, [a_result(model_id="intfloat/multilingual-e5-large")]
    )
    assert [entry["model_id"] for entry in merged] == [
        "intfloat/multilingual-e5-large",
        "BAAI/bge-m3",
    ]


def test_merge_normalises_an_entry_written_under_an_older_schema(
    tmp_path: Path,
) -> None:
    """A report written before a field existed must not stay a different shape.

    This actually happened: two candidates were measured before
    `fp32_control_cosine` was added, and merging raw dicts produced a report
    holding two schemas — found by a `KeyError` while reading it back.
    """
    report = tmp_path / "preflight.json"
    old_entry = a_result(model_id="BAAI/bge-m3").model_dump()
    del old_entry["fp32_control_cosine"]
    report.write_text(json.dumps([old_entry]), encoding="utf-8")

    merged = merge_results(report, [])
    assert "fp32_control_cosine" in merged[0]
    assert merged[0]["fp32_control_cosine"] is None


def test_merge_on_a_missing_report_is_just_this_run(tmp_path: Path) -> None:
    merged = merge_results(tmp_path / "absent.json", [a_result()])
    assert len(merged) == 1


# ── the control, which decides what a low agreement means ────────────────────


def test_a_clean_control_blames_the_quantization() -> None:
    """The real `Qwen3-Embedding-0.6B` result: control 1.0000, int8 0.624.

    That combination is attributable: the pipeline reproduces the original
    exactly, so the only thing left is the quantization.
    """
    lines = verdict_lines(
        a_result(mean_cosine=0.624, min_cosine=0.447, fp32_control_cosine=1.0)
    )
    assert any("quantization is what broke this" in line for line in lines)
    assert any("cannot be served as int8" in line for line in lines)


def test_a_dirty_control_refuses_to_blame_the_model() -> None:
    """If even fp32 disagrees, the fault is ours and must not be recorded.

    This is war story 8's lesson one level in: a number that cannot distinguish
    its own failure modes must not be reported as a verdict about the subject.
    """
    lines = verdict_lines(
        a_result(mean_cosine=0.624, min_cosine=0.447, fp32_control_cosine=0.71)
    )
    assert any("NOT a finding about the model" in line for line in lines)
    assert not any("quantization is what broke this" in line for line in lines)


def test_an_unmeasured_control_says_so_rather_than_passing() -> None:
    """`pending is not a pass`, applied to the control itself."""
    lines = verdict_lines(a_result(mean_cosine=0.624, fp32_control_cosine=None))
    assert any("not measured" in line for line in lines)


def test_a_healthy_export_needs_no_warning() -> None:
    """e5-large: control clean, int8 close. Neither warning should appear."""
    lines = verdict_lines(a_result(mean_cosine=0.99242, fp32_control_cosine=1.0))
    assert not any("⚠" in line for line in lines)


def test_mismatched_probe_counts_raise() -> None:
    with pytest.raises(ValueError, match="probe counts differ"):
        ranking_agreement([X, Y], [X], k=1)


def test_fewer_than_two_probes_raises() -> None:
    """Ranking needs something to rank against; one probe silently scores 1.0."""
    with pytest.raises(ValueError, match="at least two"):
        ranking_agreement([X], [X], k=1)


# ── the verdict ──────────────────────────────────────────────────────────────


def a_result(**overrides: object) -> PreflightResult:
    base: dict[str, object] = {
        "model_id": "test/model",
        "base_family": "test",
        "declared_dimensions": 1024,
        "serving": "bundled-onnx",
        "exported": True,
        "observed_dimensions": 1024,
        "probe_count": 10,
    }
    return PreflightResult(**{**base, **overrides})  # type: ignore[arg-type]


def test_a_failed_export_reads_as_a_finding_not_a_low_score() -> None:
    lines = verdict_lines(
        a_result(exported=False, export_error="RuntimeError: unsupported")
    )
    assert "export failed" in lines[0]
    assert any("cannot serve a query" in line for line in lines)


def test_a_dimension_mismatch_is_called_out_explicitly() -> None:
    """Declared 1024, exported 768 — the export is not the model we named.

    This is the one binary check the module allows itself, because it is not an
    invented threshold.
    """
    result = a_result(observed_dimensions=768)
    assert result.dimensions_match is False
    assert any(
        "not the model the slate describes" in line for line in verdict_lines(result)
    )


def test_a_clean_pass_still_states_what_was_not_established() -> None:
    """Silent green is the failure this repository keeps a war-stories page for.

    Agreement between an export and its original says nothing whatever about
    whether either retrieves well, and the verdict has to say so.
    """
    lines = verdict_lines(
        a_result(min_cosine=0.999, mean_cosine=0.9995, ranking_agreement_at_3=1.0)
    )
    assert any("Not established: retrieval quality" in line for line in lines)
