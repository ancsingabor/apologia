"""The frozen gold set, read from `eval/questions/*.yaml`.

Validated with pydantic for the same reason `lib/corpus/manifest.ts` validates
with Zod: a malformed question should fail at the boundary with a line that
names the file, not surface later as a metric that is quietly wrong.

The gold set is authored by hand and frozen in git BEFORE a retriever exists
(`docs/evaluation.md`), so this module only ever reads it. Nothing here writes,
generates or repairs a question — a benchmark a program can edit is a benchmark
fitted to the system it judges.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError

Category = Literal[
    "doctrine",
    "philosophy",
    "history",
    "science",
    "adversarial",
    "out-of-scope",
    "in-scope-looks-out",
]

Language = Literal["hu", "en"]


class GoldQuestion(BaseModel):
    """One `eval/questions/q-NNNN.yaml`."""

    # `extra="forbid"` on purpose: a typo'd key (`expected_unit:`) would
    # otherwise be silently dropped and the question would score as though it
    # expected nothing. The gold set is small and hand-written, which is
    # exactly the population where typos survive review.
    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str
    question: str
    language: Language
    category: Category
    expected_units: list[str] = Field(default_factory=list)
    expects_refusal: bool = False
    cross_lingual: bool = False
    adversarial_target: str | None = None
    notes: str | None = None

    @property
    def is_scorable(self) -> bool:
        """Whether this question participates in the retrieval metrics."""
        return len(self.expected_units) > 0

    @property
    def slice(self) -> str:
        """The reporting slice: cross-lingual is reported separately.

        `docs/evaluation.md` requires all three retrieval metrics split by
        same-language vs cross-lingual, "because the mixed-corpus decision
        (ADR-007) means an aggregate number would hide the case most likely to
        be weak".
        """
        return "cross-lingual" if self.cross_lingual else "same-language"


def load_gold_set(directory: Path) -> list[GoldQuestion]:
    """Every question in `directory`, ordered by id.

    Raises on the first malformed file rather than skipping it. A gold set that
    silently loses a question reports a metric over a benchmark nobody
    specified.
    """
    questions = sorted(_load_each(directory), key=lambda q: q.id)
    if not questions:
        raise FileNotFoundError(f"no gold questions found in {directory}")

    seen: dict[str, Path] = {}
    for question in questions:
        if question.id in seen:
            raise ValueError(f"duplicate question id {question.id!r}")
        seen[question.id] = directory
    return questions


def _load_each(directory: Path) -> Iterator[GoldQuestion]:
    for path in sorted(directory.glob("q-*.yaml")):
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            raise ValueError(f"{path}: expected a mapping, got {type(raw).__name__}")
        try:
            yield GoldQuestion.model_validate(raw)
        except ValidationError as error:
            # Re-raised with the filename attached: pydantic names the field but
            # not the file, and "extra inputs are not permitted" is unhelpful
            # when ten questions could have produced it.
            raise ValueError(f"{path}: {error}") from error


def sources_referenced(questions: list[GoldQuestion]) -> set[str]:
    """The source ids the gold set expects, from the locator prefixes.

    Used to refuse a scoring run whose corpus is missing a source the gold set
    depends on. Before the Summa was ingested this would have returned
    `{"ccc", "summa"}` against a corpus holding only `ccc` — three of the eight
    scorable questions would have scored zero for a reason that has nothing to
    do with retrieval quality.
    """
    return {
        locator.split(":", 1)[0]
        for question in questions
        for locator in question.expected_units
    }
