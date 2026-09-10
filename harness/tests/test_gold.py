"""The gold-set reader, checked against the real frozen questions.

This suite reads `eval/questions/` directly rather than fixtures. The gold set
is frozen in git and is the thing the harness must actually parse, so a fixture
would test a copy and let the original drift.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from apologia_eval.gold import GoldQuestion, load_gold_set, sources_referenced

QUESTIONS = Path(__file__).resolve().parents[2] / "eval" / "questions"


@pytest.fixture(scope="module")
def gold() -> list[GoldQuestion]:
    return load_gold_set(QUESTIONS)


def test_reads_the_frozen_v0_set(gold: list[GoldQuestion]) -> None:
    """v0 is ten questions; `docs/evaluation.md` wants 40-60 eventually.

    Asserted as a lower bound, not an equality, so authoring the expansion does
    not break the suite.
    """
    assert len(gold) >= 10
    assert [q.id for q in gold][:10] == [f"q-{n:04d}" for n in range(1, 11)]


def test_eight_of_ten_are_retrieval_scorable(gold: list[GoldQuestion]) -> None:
    """q-0007 (adversarial) and q-0009 (out-of-scope) expect no units."""
    scorable = [q.id for q in gold if q.is_scorable]
    unscorable = [q.id for q in gold if not q.is_scorable]
    assert "q-0007" in unscorable
    assert "q-0009" in unscorable
    assert len(scorable) >= 8


def test_the_refusal_question_is_the_one_that_expects_refusal(
    gold: list[GoldQuestion],
) -> None:
    refusing = [q.id for q in gold if q.expects_refusal]
    assert refusing == ["q-0009"]


def test_cross_lingual_questions_form_their_own_slice(
    gold: list[GoldQuestion],
) -> None:
    """The split `docs/evaluation.md` requires on every retrieval metric."""
    slices = {q.slice for q in gold}
    assert slices == {"same-language", "cross-lingual"}
    assert any(q.cross_lingual for q in gold)
    assert any(not q.cross_lingual for q in gold)


def test_the_gold_set_depends_on_both_ingested_sources(
    gold: list[GoldQuestion],
) -> None:
    """Why the Summa had to be ingested before any model could be ranked.

    Three of the eight scorable questions expect `summa:` locators, and two of
    those expect nothing else — they would have scored a hard zero against a
    CCC-only corpus, for a reason unrelated to retrieval quality.
    """
    assert sources_referenced(gold) == {"ccc", "summa"}
    summa_only = [
        q.id
        for q in gold
        if q.expected_units and all(u.startswith("summa:") for u in q.expected_units)
    ]
    assert summa_only == ["q-0004", "q-0005"]


def test_summa_locators_are_leaf_level(gold: list[GoldQuestion]) -> None:
    """Articles are containers; the citable unit is `.arg1` / `.sc` / `.co` / `.adN`.

    Pins the correction from PR #11. `summa:I.q2.a3` addresses an article, which
    is not a unit and cannot resolve — it sat wrong in the gold set for a whole
    milestone because `eval:lint` could only report it as "pending".
    """
    leaves = (".arg", ".sc", ".co", ".ad")
    summa = [u for q in gold for u in q.expected_units if u.startswith("summa:")]
    assert summa, "expected the gold set to exercise the Summa"
    for locator in summa:
        assert locator.rpartition(".")[0], f"{locator} has no role segment"
        assert any(f".{part}" in locator for part in ("arg", "sc", "co", "ad")), (
            f"{locator} names an article, not a citable unit"
        )
        assert locator.startswith(tuple(f"summa:{p}" for p in ("I", "II", "III"))), (
            f"{locator} has no part prefix"
        )
        assert any(seg in locator for seg in leaves)


def test_an_unknown_key_is_rejected_not_ignored(tmp_path: Path) -> None:
    """A typo'd key must fail loudly.

    `expected_unit:` (singular) under a permissive parser would be dropped and
    the question would silently score as expecting nothing — a benchmark that
    quietly stops testing what it was written to test.
    """
    (tmp_path / "q-9999.yaml").write_text(
        yaml.safe_dump(
            {
                "id": "q-9999",
                "question": "Typo'd key?",
                "language": "hu",
                "category": "doctrine",
                "expected_unit": ["ccc:1"],
            }
        ),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="q-9999"):
        load_gold_set(tmp_path)


def test_an_unknown_category_is_rejected(tmp_path: Path) -> None:
    (tmp_path / "q-9998.yaml").write_text(
        yaml.safe_dump(
            {
                "id": "q-9998",
                "question": "Bad category?",
                "language": "hu",
                "category": "apologetics",
            }
        ),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="q-9998"):
        load_gold_set(tmp_path)


def test_an_empty_directory_is_an_error_not_an_empty_benchmark(
    tmp_path: Path,
) -> None:
    with pytest.raises(FileNotFoundError):
        load_gold_set(tmp_path)
