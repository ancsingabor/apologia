"""Retrieval reports and paired comparisons over the frozen gold questions.

Intervals describe resampling this small authored set, not a random sample of
all future questions. No generation metrics are invented: this is retrieval
only. A tied or constant paired sample supplies no sample-size estimate.
"""

from __future__ import annotations

import hashlib
import json
import math
from collections.abc import Sequence
from datetime import UTC, datetime
from importlib.metadata import version
from pathlib import Path
from time import perf_counter
from typing import Any

import numpy as np
from pydantic import BaseModel, ConfigDict
from scipy.stats import bootstrap, norm

from apologia_eval import db
from apologia_eval.bakeoff import ROOT, LocalEncoder, checked_corpus, parser
from apologia_eval.candidates import SLATE
from apologia_eval.gold import GoldQuestion, load_gold_set, sources_referenced
from apologia_eval.metrics import full_recall_at_k, recall_at_k, reciprocal_rank

METRICS = (
    "recall@5",
    "recall@10",
    "recall@20",
    "full-recall@5",
    "full-recall@10",
    "full-recall@20",
    "MRR@10",
)
SLICES = ("all", "same-language", "cross-lingual")


class Record(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, allow_inf_nan=False)


class QuestionScore(Record):
    id: str
    slice: str
    expected_units: list[str]
    retrieved: list[list[str]]
    metrics: dict[str, float]
    latency_ms: float
    query_truncated: bool


class Interval(Record):
    n: int
    mean: float | None
    low: float | None
    high: float | None
    status: str


class Report(Record):
    schema_version: int = 1
    created_at: str
    corpus_hash: str
    gold_hash: str
    embedding_identity: str
    model_id: str
    base_family: str
    artifact_hash: str
    pooling: str
    max_sequence_tokens: int
    dimensions: int
    query_prefix: str
    passage_prefix: str
    generation_model: None = None
    prompt_version: None = None
    seed: int
    resamples: int
    packages: dict[str, str]
    excluded_question_ids: list[str]
    truncation_by_source: dict[str, dict[str, int]]
    questions: list[QuestionScore]
    slices: dict[str, dict[str, Interval]]
    source_slices: dict[str, dict[str, Interval]]
    retrieval_latency_ms: dict[str, float]
    # The product does not answer questions yet; these cannot be measured here.
    end_to_end_latency_ms: None = None
    cost_per_answer: None = None
    cache_hit_rate: None = None


def gold_hash(questions: Sequence[GoldQuestion]) -> str:
    payload = json.dumps(
        [q.model_dump() for q in sorted(questions, key=lambda q: q.id)],
        sort_keys=True,
        ensure_ascii=False,
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def score_question(
    question: GoldQuestion,
    retrieved: Sequence[frozenset[str]],
    latency_ms: float = 0.0,
    query_truncated: bool = False,
) -> QuestionScore:
    metrics: dict[str, float] = {}
    for k in (5, 10, 20):
        metrics[f"recall@{k}"] = recall_at_k(retrieved, question.expected_units, k)
        metrics[f"full-recall@{k}"] = full_recall_at_k(
            retrieved, question.expected_units, k
        )
    metrics["MRR@10"] = reciprocal_rank(retrieved, question.expected_units)
    return QuestionScore(
        id=question.id,
        slice=question.slice,
        expected_units=question.expected_units,
        retrieved=[sorted(units) for units in retrieved],
        metrics=metrics,
        latency_ms=latency_ms,
        query_truncated=query_truncated,
    )


def mean_interval(
    values: Sequence[float], *, seed: int = 0, resamples: int = 9999
) -> Interval:
    """Percentile bootstrap of question means; explicit degeneracy handling.

    BCa is undefined on constant binary samples. Percentile intervals remain
    finite, but a zero-width interval is not evidence of population certainty.
    A singleton gets no interval at all. Batch bounds bootstrap memory.
    """
    if resamples < 1:
        raise ValueError("resamples must be positive")
    if not all(math.isfinite(value) for value in values):
        raise ValueError("nonfinite metric")
    if not values:
        return Interval(n=0, mean=None, low=None, high=None, status="empty")
    mean = float(np.mean(values))
    if len(values) == 1:
        return Interval(n=1, mean=mean, low=None, high=None, status="singleton")
    if len(set(values)) == 1:
        return Interval(
            n=len(values),
            mean=mean,
            low=mean,
            high=mean,
            status="constant: bootstrap cannot reveal unobserved variation",
        )
    result = bootstrap(
        (np.asarray(values),),
        np.mean,
        method="percentile",
        confidence_level=0.95,
        n_resamples=resamples,
        batch=256,
        random_state=np.random.default_rng(seed),
    )
    return Interval(
        n=len(values),
        mean=mean,
        low=float(result.confidence_interval.low),
        high=float(result.confidence_interval.high),
        status="percentile-bootstrap",
    )


def aggregate(
    questions: Sequence[QuestionScore], *, seed: int = 0, resamples: int = 9999
) -> dict[str, dict[str, Interval]]:
    return {
        slice_name: {
            metric: mean_interval(
                [
                    q.metrics[metric]
                    for q in questions
                    if slice_name == "all" or q.slice == slice_name
                ],
                seed=seed,
                resamples=resamples,
            )
            for metric in METRICS
        }
        for slice_name in SLICES
    }


def aggregate_by_source(
    questions: Sequence[QuestionScore], *, seed: int = 0, resamples: int = 9999
) -> dict[str, dict[str, Interval]]:
    """Score only each source's expected units, against the SAME mixed ranking.

    A multi-source question belongs to several slices. These are overlapping
    diagnostics, not values to average back into the overall metric.
    """
    sources = sorted({u.split(":", 1)[0] for q in questions for u in q.expected_units})
    result: dict[str, dict[str, Interval]] = {}
    for source in sources:
        scored: list[QuestionScore] = []
        for q in questions:
            expected = [u for u in q.expected_units if u.split(":", 1)[0] == source]
            if not expected:
                continue
            gold = GoldQuestion(
                id=q.id,
                question="source diagnostic",
                language="hu",
                category="doctrine",
                expected_units=expected,
            )
            scored.append(score_question(gold, [frozenset(us) for us in q.retrieved]))
        result[source] = aggregate(scored, seed=seed, resamples=resamples)["all"]
    return result


def estimated_sample_size(differences: Sequence[float]) -> int | None:
    """Exploratory paired normal approximation: 95% two-sided, 80% power.

    n ≈ (z_.975 + z_.8)^2 * sample_variance(difference) / mean(difference)^2.
    Not a guarantee or a stopping rule: top-two selection and tiny authored
    slices make this planning-only. Zero variance or effect is unidentifiable.
    """
    if len(differences) < 2 or not all(math.isfinite(d) for d in differences):
        return None
    effect = float(np.mean(differences))
    variance = float(np.var(differences, ddof=1))
    if effect == 0 or variance == 0:
        return None
    z = float(norm.ppf(0.975) + norm.ppf(0.8))
    return max(2, math.ceil(z * z * variance / (effect * effect)))


def compare_reports(reports: Sequence[Report]) -> dict[str, Any]:
    """Top two by recall@10 per slice, then paired question-level differences.

    This is exploratory selection, not a statistical declaration of a winner.
    Preserve ids so release review can inspect every lost recall@10 question.
    """
    if len(reports) < 2:
        raise ValueError("comparison needs at least two reports")
    if len({r.embedding_identity for r in reports}) != len(reports):
        raise ValueError("duplicate embedding identity")
    if len({(r.corpus_hash, r.gold_hash) for r in reports}) != 1:
        raise ValueError("reports describe different corpus or gold sets")
    reference = {q.id: (q.slice, q.expected_units) for q in reports[0].questions}
    for report in reports:
        if len({q.id for q in report.questions}) != len(report.questions):
            raise ValueError("duplicate scored question id")
        if {q.id: (q.slice, q.expected_units) for q in report.questions} != reference:
            raise ValueError("reports do not score the same questions")
    result: dict[str, Any] = {}
    for slice_name in SLICES:
        rows = {
            r.embedding_identity: [
                q for q in r.questions if slice_name == "all" or q.slice == slice_name
            ]
            for r in reports
        }
        if not any(rows.values()):
            result[slice_name] = {"status": "empty", "n": 0}
            continue
        ordered = sorted(
            rows,
            key=lambda key: (
                -float(np.mean([q.metrics["recall@10"] for q in rows[key]])),
                key,
            ),
        )
        first, second = ordered[:2]
        a = {q.id: q for q in rows[first]}
        b = {q.id: q for q in rows[second]}
        differences = [
            a[key].metrics["recall@10"] - b[key].metrics["recall@10"]
            for key in sorted(a)
        ]
        result[slice_name] = {
            "first": first,
            "second": second,
            "paired_recall@10": mean_interval(
                differences, seed=reports[0].seed, resamples=reports[0].resamples
            ).model_dump(),
            "estimated_total_n": estimated_sample_size(differences),
            "first_loses": [
                key
                for key in sorted(a)
                if a[key].metrics["recall@10"] < b[key].metrics["recall@10"]
            ],
            "first_gains": [
                key
                for key in sorted(a)
                if a[key].metrics["recall@10"] > b[key].metrics["recall@10"]
            ],
        }
    return {
        "schema_version": 1,
        "corpus_hash": reports[0].corpus_hash,
        "gold_hash": reports[0].gold_hash,
        "embedding_identities": [r.embedding_identity for r in reports],
        "seed": reports[0].seed,
        "resamples": reports[0].resamples,
        "selection_metric": "recall@10",
        "confidence_level": 0.95,
        "planning_power": 0.8,
        "sample_size_method": "exploratory paired normal approximation",
        "slices": result,
    }


def summary(report: Report) -> str:
    lines = [
        "# Retrieval evaluation",
        "",
        f"Model: `{report.embedding_identity}`",
        f"Corpus: `{report.corpus_hash}`",
        f"Gold set: `{report.gold_hash}`",
        "",
        "95% percentile bootstrap; questions are resampled, not chunks.",
        "The authored set is small. Constant samples hide unobserved variation.",
        "Generation, cost per answer and end-to-end latency are not measured.",
        "",
        f"Excluded: {', '.join(report.excluded_question_ids) or 'none'}",
        "",
        "| Slice | Metric | n | Mean | 95% interval | Status |",
        "|---|---|---|---|---|---|",
    ]
    for slice_name, metrics in {
        **report.slices,
        **{f"source:{s}": m for s, m in report.source_slices.items()},
    }.items():
        for metric, interval in metrics.items():
            lines.append(
                f"| {slice_name} | {metric} | {interval.n} | {interval.mean} | "
                f"{interval.low}, {interval.high} | {interval.status} |"
            )
    lines.extend(
        [
            "",
            "## Per-question retrieval",
            "",
            "| Question | Slice | recall@10 | full-recall@10 | "
            "MRR@10 | Query truncated |",
            "|---|---|---|---|---|---|",
        ]
    )
    for question in report.questions:
        lines.append(
            f"| {question.id} | {question.slice} | "
            f"{question.metrics['recall@10']} | "
            f"{question.metrics['full-recall@10']} | "
            f"{question.metrics['MRR@10']:.4f} | {question.query_truncated} |"
        )
    lines.extend(["", "## Retrieval latency after model load", ""])
    for percentile, value in report.retrieval_latency_ms.items():
        lines.append(f"- {percentile}: {value:.2f} ms")
    lines.extend(
        [
            "",
            "## Passage truncation",
            "",
            "| Source | Chunks | Truncated |",
            "|---|---|---|",
        ]
    )
    for source, counts in report.truncation_by_source.items():
        lines.append(f"| {source} | {counts['total']} | {counts['truncated']} |")
    return "\n".join(lines) + "\n"


def main() -> int:
    cli = parser(__doc__ or "Retrieval scoring")
    cli.add_argument("--seed", type=int, default=0)
    cli.add_argument("--resamples", type=int, default=9999)
    cli.add_argument("--output", type=Path, default=ROOT / "eval/reports")
    cli.add_argument("--compare", type=Path, action="append", default=[])
    args = cli.parse_args()
    if args.seed < 0 or args.resamples < 1:
        cli.error("seed must be nonnegative and resamples positive")
    questions = load_gold_set(ROOT / "eval/questions")
    if not any(q.is_scorable for q in questions):
        raise ValueError("gold set contains no retrieval-scorable questions")
    candidate = next(c for c in SLATE if c.model_id == args.model)
    encoder = LocalEncoder(candidate, args.artifact, args.pooling)
    with db.connect(remote=args.remote) as conn:
        # One snapshot throughout retrieval; no partial/concurrently changing corpus.
        conn.execute("set transaction isolation level repeatable read, read only")
        corpus = checked_corpus(conn)
        db.assert_sources_cover(sources_referenced(questions), corpus.sources)
        present = set().union(*corpus.units_by_chunk.values())
        required = {u for q in questions for u in q.expected_units}
        if required - present:
            raise ValueError(f"unresolved gold locators: {sorted(required - present)}")
        if {c.id for c in corpus.chunks} - db.embedded_chunk_ids(
            conn, encoder.identity
        ):
            raise ValueError("incomplete candidate embeddings; run bakeoff first")
        truncation: dict[str, dict[str, int]] = {}
        # Tokenize in bounded groups, even though ONNX inference itself is serial.
        for start in range(0, len(corpus.chunks), 32):
            batch = corpus.chunks[start : start + 32]
            lengths = encoder.lengths([c.text for c in batch])
            for chunk, length in zip(batch, lengths, strict=True):
                counts = truncation.setdefault(
                    chunk.source_id, {"total": 0, "truncated": 0}
                )
                counts["total"] += 1
                counts["truncated"] += int(length > candidate.max_sequence_tokens)
        scored: list[QuestionScore] = []
        for question in questions:
            if not question.is_scorable:
                continue
            length = encoder.lengths([question.question], query=True)[0]
            start_time = perf_counter()
            vector = encoder.encode([question.question], query=True)[0]
            chunk_ids = db.search(conn, encoder.identity, vector, 20)
            latency = (perf_counter() - start_time) * 1000
            scored.append(
                score_question(
                    question,
                    db.ranked_units(chunk_ids, corpus.units_by_chunk),
                    latency,
                    length > candidate.max_sequence_tokens,
                )
            )
        encoder.assert_unchanged()
    report = Report(
        created_at=datetime.now(UTC).isoformat(),
        corpus_hash=corpus.corpus_hash,
        gold_hash=gold_hash(questions),
        embedding_identity=encoder.identity,
        model_id=candidate.model_id,
        base_family=candidate.base_family,
        artifact_hash=encoder.hash,
        pooling=args.pooling,
        max_sequence_tokens=candidate.max_sequence_tokens,
        dimensions=candidate.dimensions,
        query_prefix=candidate.query_prefix,
        passage_prefix=candidate.passage_prefix,
        seed=args.seed,
        resamples=args.resamples,
        packages={
            name: version(name)
            for name in ("numpy", "scipy", "onnxruntime", "transformers")
        },
        excluded_question_ids=[q.id for q in questions if not q.is_scorable],
        truncation_by_source=truncation,
        questions=scored,
        slices=aggregate(scored, seed=args.seed, resamples=args.resamples),
        source_slices=aggregate_by_source(
            scored, seed=args.seed, resamples=args.resamples
        ),
        retrieval_latency_ms={
            f"p{p}": float(np.percentile([q.latency_ms for q in scored], p))
            for p in (50, 95)
        },
    )
    comparison = None
    if args.compare:
        others = [Report.model_validate_json(p.read_text()) for p in args.compare]
        comparison = compare_reports([report, *others])
    args.output.mkdir(parents=True, exist_ok=True)
    stem = datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ")
    (args.output / f"{stem}.json").write_text(report.model_dump_json(indent=2) + "\n")
    human = summary(report)
    if comparison is not None:
        (args.output / f"{stem}.comparison.json").write_text(
            json.dumps(comparison, indent=2, allow_nan=False) + "\n"
        )
        human += "\n## Exploratory top-two comparison\n\n"
        human += "Ranked by recall@10 per slice; ties use identity order.\n"
        human += "Sample size is a paired normal approximation (95%, 80% power).\n"
        human += "It is total n, not additional n; null means unidentifiable.\n"
        human += "Selection is exploratory and does not establish a winner.\n\n"
        human += "```json\n" + json.dumps(comparison, indent=2) + "\n```\n"
    (args.output / f"{stem}.md").write_text(human, encoding="utf-8")
    print(human)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
