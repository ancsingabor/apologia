"""Can this candidate actually answer a query? Measured, before it competes.

ADR-023's outcome table covers "an open-weights model wins", "a hosted API wins
and the licence permits", and "a hosted API wins and the licence forbids". It
has no row for **an open-weights model wins and cannot be served** — and that is
not a cheap option with a caveat. Retrieval is confined to one embedding space,
so the model that embedded the corpus must also embed the user's question. A
winner that cannot be served is unusable, and the bake-off would have spent
hours establishing it.

So servability is established first, and the two facts that decide it are
measured rather than assumed:

1. **Does it export at all**, and how large is the artifact? A model is bundled
   as an exported artifact, never as this environment — torch is gigabytes and
   never ships.
2. **Does the exported artifact agree with the original?** This is the same
   provenance argument ADR-023 makes against third-party ONNX exports —
   "a report saying `multilingual-e5-large` when what ran was somebody's int8
   export is not traceable" — turned on our own export. If the corpus is scored
   with PyTorch weights and queries are served by a quantized export, the number
   in ADR-008 describes a model that never answers a query.

── What is NOT decided here ────────────────────────────────────────────────

⚠️ NO PASS/FAIL THRESHOLD ON AGREEMENT. `docs/evaluation.md` refuses invented
target numbers, and "cosine ≥ 0.99" would be exactly that: a figure nobody
derived, cleared trivially or quietly lowered. What is binary and *not* invented
is whether the export ran and produced the declared dimension. Everything else
is reported, and ADR-008 argues about it with the numbers in hand.

── Two measurements that mean less than they look ──────────────────────────

**Cosine agreement is the weaker check.** Quantization can shift every vector
slightly and change nothing that matters, because retrieval only ever uses the
*order* similarities induce. So the ranking check below is the one to read: it
asks whether the export ranks the probe texts the way the original does.

**Peak memory is per-process, not per-model.** `ru_maxrss` is a high-water mark
for the whole process, so measuring three candidates in one run reports the
largest, three times. The CLI therefore measures one candidate per invocation,
and the field is named to say so.
"""

from __future__ import annotations

import errno
import json
import math
import resource
import shutil
import sys
import time
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from apologia_eval.candidates import SLATE, Candidate, Serving, assert_measurable

# ── Pure: similarity, ranking, and what counts as agreement ──────────────────
#
# Implemented in plain Python rather than numpy on purpose. The probe set is ten
# vectors, so vectorisation buys nothing, and keeping this half dependency-free
# means the CI lane — which installs neither `stats` nor `local-models` — can
# actually run the tests that pin it.


def cosine(a: Sequence[float], b: Sequence[float]) -> float:
    """Cosine similarity. Raises on a length mismatch rather than truncating.

    A silent `zip` would compare the first 768 dimensions of a 1024-dimensional
    vector against a 768-dimensional one and return a plausible number, which is
    the precise shape of defect this module exists to catch.
    """
    if len(a) != len(b):
        raise ValueError(f"dimension mismatch: {len(a)} vs {len(b)}")
    if not a:
        raise ValueError("cosine is undefined for an empty vector")
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0.0 or norm_b == 0.0:
        raise ValueError("cosine is undefined for a zero vector")
    return dot / (norm_a * norm_b)


def rank_against(
    query: Sequence[float], documents: Sequence[Sequence[float]]
) -> list[int]:
    """Indices of `documents`, most similar to `query` first.

    Ties break by index so the ordering is deterministic; an unstable sort would
    make the ranking comparison below report spurious disagreement.
    """
    scored = [
        (cosine(query, document), -index) for index, document in enumerate(documents)
    ]
    return [-index for _, index in sorted(scored, reverse=True)]


def ranking_agreement(
    reference: Sequence[Sequence[float]], exported: Sequence[Sequence[float]], k: int
) -> float:
    """Fraction of probes whose top-*k* ordering survives the export.

    Each probe is used as a query against every other probe, once under the
    reference vectors and once under the exported ones. The comparison is on the
    ORDER, because that is the only thing retrieval consumes — a quantization
    that moves every cosine by 0.01 and reorders nothing has cost nothing.

    1.0 means the export ranks exactly as the original does on this probe set.
    """
    if len(reference) != len(exported):
        raise ValueError("reference and exported probe counts differ")
    if len(reference) < 2:
        raise ValueError("ranking agreement needs at least two probes")
    if k < 1:
        raise ValueError(f"k must be >= 1, got {k}")

    agreed = 0
    for index in range(len(reference)):
        others = [i for i in range(len(reference)) if i != index]
        reference_order = [
            others[position]
            for position in rank_against(
                reference[index], [reference[i] for i in others]
            )
        ]
        exported_order = [
            others[position]
            for position in rank_against(exported[index], [exported[i] for i in others])
        ]
        if reference_order[:k] == exported_order[:k]:
            agreed += 1
    return agreed / len(reference)


def margins_at_k(reference: Sequence[Sequence[float]], k: int) -> list[float]:
    """Per probe, the SMALLEST ADJACENT gap the top-*k* ordering rests on.

    ⚠️ THE ADJACENT GAP, NOT THE RANK1-TO-RANK*K* SPAN, AND THE DIFFERENCE
    MATTERS. A first draft measured the span, which flatters the test: for
    `ranking_agreement` to score a probe as agreeing, every adjacent comparison
    inside the top *k* must survive — s1>s2, s2>s3, … — and also s_k>s_{k+1}, or
    the *set* changes. Each of those gaps is smaller than the span, so the span
    overstates how much perturbation the ordering can absorb.

    Returned per probe so the caller can count how many orderings rest on a gap
    narrower than the perturbation being tested.

    ⚠️ WITHOUT THIS, `ranking_agreement` IS UNINTERPRETABLE, AND THE FIRST RUN
    PROVED IT. `multilingual-e5-large` scored 0.992 mean cosine and only 60%
    top-3 ranking agreement, which reads as "quantization broke the ordering".
    It did not. The ten gold questions are unrelated to each other and sit in a
    narrow similarity band (0.76-0.92 measured), so the smallest adjacent gap
    each ordering rests on averages 0.0019 — roughly a QUARTER of the 0.0076
    that quantization moves a vector. All ten probes were noise-dominated, so
    the agreement figure carried no information whatever.

    A ranking check can only detect a perturbation *smaller than the margins it
    is asked to preserve*. So the margin is reported next to the agreement, and
    a reader can see whether the test had any power to discriminate at all.

    This is the `pending is not a pass` instinct in another costume: a number
    that cannot fail for the right reason must not be presented as though it
    passed or failed.
    """
    if k < 1:
        raise ValueError(f"k must be >= 1, got {k}")
    if len(reference) <= k:
        raise ValueError(f"need more than k={k} probes to measure a margin at k")

    margins: list[float] = []
    for index in range(len(reference)):
        others = [
            cosine(reference[index], reference[j])
            for j in range(len(reference))
            if j != index
        ]
        ordered = sorted(others, reverse=True)
        # Gaps s1-s2 … s_k-s_{k+1}: every comparison the top-k ordering rests
        # on, including the one that keeps the k-th item inside the set.
        gaps = [ordered[i] - ordered[i + 1] for i in range(min(k, len(ordered) - 1))]
        margins.append(min(gaps))
    return margins


def directory_bytes(path: Path) -> int:
    """Total size of every file under `path`. What actually has to be bundled."""
    return sum(item.stat().st_size for item in path.rglob("*") if item.is_file())


def peak_rss_mb() -> float:
    """Process high-water memory, normalised across platforms.

    ⚠️ `ru_maxrss` IS BYTES ON macOS AND KILOBYTES ON LINUX. Reporting the raw
    number would make a Mac look 1,024 times hungrier than a CI runner, and the
    figure would be compared across them without anybody noticing the unit.
    """
    raw = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return raw / (1024 * 1024) if sys.platform == "darwin" else raw / 1024


# ── The report ───────────────────────────────────────────────────────────────


class PreflightResult(BaseModel):
    """One candidate's servability, as a frozen artifact.

    Pydantic rather than a dataclass because ADR-023 makes the report schema a
    cross-language serialisation contract, and this is the first piece of it.
    """

    model_id: str
    base_family: str
    declared_dimensions: int
    serving: str

    exported: bool
    export_error: str | None = None

    artifact_bytes: int | None = None
    observed_dimensions: int | None = None
    load_seconds: float | None = None
    query_seconds: float | None = None
    peak_rss_mb_process: float | None = None

    #: Worst and mean cosine between the reference and exported vectors over the
    #: probe set. The weaker of the two agreement measures — see the module
    #: docstring.
    min_cosine: float | None = None
    mean_cosine: float | None = None

    #: Fraction of probes whose top-k ordering is unchanged. Read it ONLY
    #: alongside the two fields below — see `margins_at_k`.
    ranking_agreement_at_3: float | None = None

    #: Mean of the SMALLEST ADJACENT gap each probe's top-3 ordering rests on,
    #: under the reference vectors. How much room the ranking check had to
    #: detect anything at all.
    mean_reference_margin_at_3: float | None = None

    #: How far the export moved a vector, in the same units (1 - mean cosine).
    cosine_perturbation: float | None = None

    #: THE CONTROL. Mean cosine between the *unquantized* export and the
    #: reference. It separates the three reasons a candidate can disagree:
    #: quantization damaged it (control ~1.0, int8 low), the export itself is
    #: wrong, or our handling of that architecture is wrong (control also low).
    #: Only the first is a fact about the model. `None` means not measured —
    #: a resumed run reuses an int8 artifact whose fp32 intermediate is gone.
    fp32_control_cosine: float | None = None

    #: Probes whose margin is smaller than that perturbation. For these the
    #: ordering is decided by noise, and disagreement means nothing.
    probes_with_margin_below_perturbation: int | None = None

    probe_count: int = 0
    notes: list[str] = Field(default_factory=list)

    @property
    def dimensions_match(self) -> bool:
        """The one binary check that is not an invented threshold."""
        return self.observed_dimensions == self.declared_dimensions


def verdict_lines(result: PreflightResult) -> list[str]:
    """A human summary that states what was NOT established, too.

    A pre-flight that printed only green ticks would be the "silent green" this
    repository keeps a war-stories page about: the interesting outcome here is
    usually a caveat, not a pass.
    """
    if not result.exported:
        return [
            f"✗ {result.model_id}: export failed — {result.export_error}",
            "  Not a low score. This candidate cannot serve a query, so under "
            "`assert_servable` it cannot compete.",
        ]

    lines = [f"✓ {result.model_id}: exported"]
    if result.artifact_bytes is not None:
        lines.append(f"  artifact   {result.artifact_bytes / 1e6:,.0f} MB")
    if not result.dimensions_match:
        lines.append(
            f"  ✗ dimensions  declared {result.declared_dimensions}, "
            f"observed {result.observed_dimensions} — the export is not the "
            "model the slate describes"
        )
    if result.min_cosine is not None:
        lines.append(
            f"  agreement  cosine min {result.min_cosine:.5f} "
            f"mean {result.mean_cosine:.5f} over {result.probe_count} probes"
        )

    # The control decides what a low agreement MEANS, so it is printed next to
    # it rather than left in the JSON for someone to notice.
    if result.fp32_control_cosine is None:
        lines.append(
            "  control    not measured — resumed onto an existing artifact, so "
            "a low agreement below could not be attributed. Delete the "
            "candidate's .preflight/ directory to re-measure."
        )
    else:
        lines.append(
            f"  control    unquantized export vs original: "
            f"{result.fp32_control_cosine:.5f}"
        )
        if result.fp32_control_cosine > 0.999 and (result.mean_cosine or 1.0) < 0.9:
            lines.append(
                "  ⚠ The export pipeline is CORRECT and the quantization is "
                "what broke this: pooling, inputs and prefixes reproduce the "
                "original exactly, and int8 does not. This candidate cannot be "
                "served as int8 — a different precision, or none, is required."
            )
        elif result.fp32_control_cosine < 0.999:
            lines.append(
                "  ⚠ Even UNQUANTIZED the export disagrees with the original, "
                "so the fault is in the export or in how this architecture is "
                "handled here — NOT a finding about the model. Do not record "
                "the agreement figure above as one."
            )
    if result.ranking_agreement_at_3 is not None:
        lines.append(
            f"  ranking    top-3 order preserved on "
            f"{result.ranking_agreement_at_3:.0%} of probes"
        )
        if (
            result.mean_reference_margin_at_3 is not None
            and result.cosine_perturbation is not None
        ):
            lines.append(
                f"  margin     smallest adjacent gap averages "
                f"{result.mean_reference_margin_at_3:.4f}; the export moves a "
                f"vector by {result.cosine_perturbation:.4f}"
            )
            weak = result.probes_with_margin_below_perturbation or 0
            # Scaled wording, because "partly structural" would be false when
            # every probe is noise-dominated — and that is the case that most
            # needs saying plainly. A reader who takes "partly" from a 10-of-10
            # result has been told the opposite of the truth.
            if weak == result.probe_count:
                lines.append(
                    f"  ⚠ ALL {weak} probes rest on a gap SMALLER than that "
                    "perturbation. This check has no discriminative power on "
                    "this probe set: the agreement figure above carries no "
                    "information, in either direction."
                )
            elif weak:
                lines.append(
                    f"  ⚠ {weak} of {result.probe_count} probes have a margin "
                    "SMALLER than that perturbation. For those the ordering is "
                    "decided by noise, so the disagreement above is partly "
                    "structural — not evidence the export is worse."
                )
            lines.append(
                "  These probes are unrelated questions, not query/passage "
                "pairs, so they cluster. The real ranking test is the bake-off."
            )
            # ⚠️ The cross-candidate trap. Each model is compared against ITS
            # OWN quantization noise, over a margin distribution its own
            # geometry produced — measured: e5-large spreads these ten probes
            # by 0.0019 and bge-m3 by 0.0150, eight times wider. So one model
            # scoring 70% and another 60% says nothing about which is better;
            # the two numbers were taken under different conditions. Only the
            # bake-off, where every candidate answers the same gold questions
            # over the same corpus, compares candidates.
            lines.append(
                "  NOT comparable across candidates: each is measured against "
                "its own noise and its own margins. Only the bake-off compares."
            )
    if result.load_seconds is not None:
        lines.append(
            f"  cold load  {result.load_seconds:.1f}s   "
            f"one query {result.query_seconds:.3f}s"
        )
    lines.append(
        "  Not established: retrieval quality. This says the export behaves "
        "like the original, not that either retrieves well."
    )
    return lines


# ── Impure: export, load, measure ────────────────────────────────────────────


@dataclass(frozen=True, slots=True)
class Probes:
    """The texts the agreement check runs over.

    The frozen gold-set questions, read from `eval/questions/`: real Hungarian,
    in-domain, already in git, and requiring no database. Inventing probe
    sentences here would measure agreement on text unlike anything the system
    will ever see.
    """

    texts: tuple[str, ...]

    @staticmethod
    def from_gold(directory: Path) -> Probes:
        from apologia_eval.gold import load_gold_set

        return Probes(tuple(q.question for q in load_gold_set(directory)))


def export_int8(candidate: Candidate, out_dir: Path) -> tuple[Path, Path | None]:
    """Export to ONNX and dynamically quantize to int8. Returns the directory.

    int8 rather than fp32 because int8 is what would realistically ship: these
    are 300-570M parameter models, fp32 puts them at 1.2-2.3 GB, and a function
    has to load that into memory on a cold start. Measuring fp32 and serving
    int8 would reproduce ADR-023's own provenance complaint in reverse.
    """
    from optimum.onnxruntime import ORTModelForFeatureExtraction, ORTQuantizer
    from optimum.onnxruntime.configuration import AutoQuantizationConfig

    fp32_dir = out_dir / "fp32"
    int8_dir = out_dir / "int8"

    # Resumable, for the same reason the bake-off is: exporting a 570M-parameter
    # model is minutes of CPU after a multi-gigabyte download, and a re-run to
    # fix a measurement should not pay for it twice.
    # The tokenizer is part of the condition, not just the graph: a directory
    # holding one and not the other is not a servable artifact, and resuming
    # onto it would skip the export and then fail at load with a confusing
    # error about a missing tokenizer file.
    if (int8_dir / "model_quantized.onnx").exists() and (
        int8_dir / "tokenizer_config.json"
    ).exists():
        # Resumed: the fp32 intermediate was deleted after the original run, so
        # the control cannot be measured. Reported as not-measured, never as a
        # pass — the distinction story 5 in guide 10 exists for.
        return int8_dir, None

    model = ORTModelForFeatureExtraction.from_pretrained(
        candidate.model_id, export=True
    )
    model.save_pretrained(fp32_dir)

    quantizer = ORTQuantizer.from_pretrained(fp32_dir)
    quantizer.quantize(
        save_dir=int8_dir,
        quantization_config=AutoQuantizationConfig.avx512_vnni(
            is_static=False, per_channel=False
        ),
    )

    # ⚠️ THE QUANTIZER WRITES ONLY THE GRAPH. Without this the export directory
    # holds `model_quantized.onnx` and two JSON configs and NO tokenizer, so
    # loading it back fails — and a deployed artifact missing its tokenizer is
    # not a servable model. Saving it here means the directory is the whole
    # thing that would ship, which is what the size measurement should cover.
    from transformers import AutoTokenizer

    AutoTokenizer.from_pretrained(candidate.model_id).save_pretrained(int8_dir)

    # fp32 is kept just long enough for the control measurement in `run`, then
    # deleted there. It is a build intermediate — only the quantized directory
    # ever serves — and keeping it costs ~2 GB per candidate, which filled this
    # machine's disk and surfaced as an "export failed" finding about a model
    # that was fine.
    AutoTokenizer.from_pretrained(candidate.model_id).save_pretrained(fp32_dir)
    return int8_dir, fp32_dir


def reference_embeddings(
    candidate: Candidate, texts: Sequence[str]
) -> list[list[float]]:
    """Embed with the original weights, through sentence-transformers.

    Passage prefixes, not query prefixes: the probes stand in for corpus text.
    Which prefix is applied is a property of the candidate, never a constant.
    """
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer(candidate.model_id)
    prefixed = [candidate.apply_passage_prefix(text) for text in texts]
    vectors = model.encode(
        prefixed, normalize_embeddings=candidate.normalize, convert_to_numpy=True
    )
    return [[float(value) for value in vector] for vector in vectors]


def pooling_mode(candidate: Candidate) -> str:
    """Read the pooling the model actually declares, rather than assume one.

    ⚠️ POOLING DIFFERS PER FAMILY AND IS PART OF THE SERVING CONTRACT. `e5` mean-
    pools, `bge-m3` takes the CLS token. Guessing wrong produces vectors that
    are confidently in the wrong place, and the agreement check would then be
    measuring our own mistake rather than the export.

    So it is read off the sentence-transformers module list — the same artifact
    the reference embeddings come from — instead of being written down here.
    """
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer(candidate.model_id)
    for _, module in model.named_children():
        config = getattr(module, "get_config_dict", None)
        if config is None:
            continue
        settings = config()

        # sentence-transformers v3+ reports a single string. The first draft of
        # this function read only the older boolean flags
        # (`pooling_mode_mean_tokens`), found neither, and raised — which is the
        # refusal working: it stopped the run instead of quietly defaulting to
        # mean pooling and making every later number describe a different model.
        mode = settings.get("pooling_mode")
        if isinstance(mode, str) and mode in {"mean", "cls", "lasttoken"}:
            return mode

        # Older releases, kept so a pinned-back environment does not silently
        # fall through to the raise below.
        if settings.get("pooling_mode_cls_token"):
            return "cls"
        if settings.get("pooling_mode_mean_tokens"):
            return "mean"

    raise RuntimeError(
        f"could not read a pooling mode for {candidate.model_id}. Do not guess: "
        "an assumed pooling makes every later number describe a different model."
    )


def load_exported(int8_dir: Path) -> tuple[Any, Any]:
    """Load the exported artifact once. Returns `(tokenizer, model)`.

    ⚠️ SEPARATE FROM EMBEDDING ON PURPOSE, AND THE FIRST DRAFT GOT THIS WRONG.
    `exported_embeddings` used to call `from_pretrained` itself, so every call
    paid a full model load — which meant the reported per-query time was really
    "cold load divided by the probe count", overstating serving cost by orders
    of magnitude. Serving cost is the entire question this module exists to
    answer, so the load has to be hoisted where it can be timed on its own.
    """
    from optimum.onnxruntime import ORTModelForFeatureExtraction
    from transformers import AutoTokenizer

    return (
        AutoTokenizer.from_pretrained(int8_dir),
        ORTModelForFeatureExtraction.from_pretrained(int8_dir),
    )


def exported_embeddings(
    candidate: Candidate,
    loaded: tuple[Any, Any],
    texts: Sequence[str],
    pooling: str,
) -> list[list[float]]:
    """Embed with an already-loaded artifact, reproducing the declared pooling."""
    import numpy

    tokenizer, model = loaded

    vectors: list[list[float]] = []
    for text in texts:
        encoded = tokenizer(
            candidate.apply_passage_prefix(text),
            return_tensors="np",
            truncation=True,
            max_length=candidate.max_sequence_tokens,
        )
        # ⚠️ DECODER-DERIVED MODELS WANT `position_ids` AS A REAL INPUT, and the
        # tokenizer does not emit one. The two encoder candidates infer
        # positions internally and reject the argument if passed; `Qwen3` fails
        # with "Input position_ids is required by model but not provided". So it
        # is supplied only when the exported graph actually declares it, read off
        # the model rather than switched on the candidate's name.
        inputs = dict(encoded)
        if "position_ids" in getattr(model, "input_names", ()):
            length = int(encoded["input_ids"].shape[-1])
            inputs["position_ids"] = numpy.arange(length, dtype="int64")[None, :]

        hidden = model(**inputs).last_hidden_state  # (1, tokens, dim)
        mask = encoded["attention_mask"][0]
        if pooling == "cls":
            pooled = hidden[0][0]
        elif pooling == "lasttoken":
            # The last NON-PADDING position, not `hidden[0][-1]`. They coincide
            # here because inputs are embedded one at a time and never padded —
            # but a batched caller would silently pool a pad token, which is a
            # vector of nothing, for every input shorter than the longest.
            pooled = hidden[0][max(int(sum(mask)) - 1, 0)]
        else:
            total = sum(hidden[0][index] * weight for index, weight in enumerate(mask))
            pooled = total / max(float(sum(mask)), 1.0)
        values = [float(v) for v in pooled]
        if candidate.normalize:
            norm = math.sqrt(sum(v * v for v in values)) or 1.0
            values = [v / norm for v in values]
        vectors.append(values)
    return vectors


def run(candidate: Candidate, probes: Probes, work_dir: Path) -> PreflightResult:
    """Measure one candidate end to end. Never raises for an export failure.

    An export that fails is a *finding*, not a crash: it establishes that the
    candidate cannot be served, which is exactly what this run is for.
    """
    assert_measurable(candidate)

    result = PreflightResult(
        model_id=candidate.model_id,
        base_family=candidate.base_family,
        declared_dimensions=candidate.dimensions,
        serving=candidate.serving.value,
        exported=False,
        probe_count=len(probes.texts),
    )

    try:
        int8_dir, fp32_dir = export_int8(
            candidate, work_dir / candidate.model_id.replace("/", "_")
        )

    # ⚠️ ENVIRONMENT FAULTS ARE NOT FINDINGS, AND THIS DISTINCTION WAS PAID FOR.
    # The first `bge-m3` run died on `OSError: [Errno 28] No space left on
    # device` — and the catch-all below dutifully recorded `serving: none`,
    # which says "this model cannot answer a query". That is a claim about the
    # model, made from a fact about the disk. `assert_servable` would then have
    # refused a perfectly good candidate for the rest of the slate's life.
    #
    # A full disk or exhausted memory says nothing about a model, so it is
    # raised rather than recorded. The operator fixes it and re-runs.
    except (MemoryError, OSError) as error:
        hint = (
            "\nFree space — the fp32 intermediates under .preflight/ and "
            "~/.cache/huggingface are the usual culprits."
            if getattr(error, "errno", None) in {errno.ENOSPC, errno.EDQUOT}
            else ""
        )
        raise RuntimeError(
            f"the environment failed while exporting {candidate.model_id}: "
            f"{error!r}.\nThis is NOT a finding about the model — it says "
            f"nothing about whether it can be served.{hint}"
        ) from error

    # Broad on purpose: an export can fail in a dozen library-specific ways, and
    # every one of them is the same finding — this candidate has no bundled
    # serving route. Narrowing it would turn a result into a crash.
    except Exception as error:
        return result.model_copy(
            update={
                "exported": False,
                "export_error": f"{type(error).__name__}: {error}",
                "serving": Serving.NONE.value,
                "notes": [
                    "Export failed, so this candidate has no bundled serving "
                    "route. A proxied route may still exist; that is a separate "
                    "decision and is not established here."
                ],
            }
        )

    pooling = pooling_mode(candidate)
    reference = reference_embeddings(candidate, probes.texts)

    # Cold load, timed on its own: this is what a function pays on a cold start.
    started = time.perf_counter()
    loaded = load_exported(int8_dir)
    load_seconds = time.perf_counter() - started

    # One warm embed first, discarded. The very first inference pays for lazy
    # session setup inside onnxruntime, and folding that into the average would
    # report a per-query cost no real query after the first one ever pays.
    exported_embeddings(candidate, loaded, probes.texts[:1], pooling)

    started = time.perf_counter()
    exported = exported_embeddings(candidate, loaded, probes.texts, pooling)
    query_seconds = (time.perf_counter() - started) / max(len(probes.texts), 1)

    # ── The control ──────────────────────────────────────────────────────────
    # Measured from the fp32 intermediate that already exists on disk, so it
    # costs one extra load and no extra export. Without it a low agreement has
    # three possible causes and the report cannot say which: quantization
    # damaged the model, the export is wrong, or our handling of this
    # architecture is wrong. Only the first is a fact about the candidate.
    #
    # It earned its place immediately: `Qwen3-Embedding-0.6B` scored 0.62 mean
    # cosine on int8, and the fp32 control came back at 1.0000 — so the pooling,
    # the position_ids and the prefixes were all right, and the int8 artifact
    # genuinely is a different model.
    control: float | None = None
    if fp32_dir is not None:
        fp32_loaded = load_exported(fp32_dir)
        fp32_vectors = exported_embeddings(
            candidate, fp32_loaded, probes.texts, pooling
        )
        control = sum(
            cosine(r, f) for r, f in zip(reference, fp32_vectors, strict=True)
        ) / len(reference)
        shutil.rmtree(fp32_dir, ignore_errors=True)

    similarities = [cosine(r, e) for r, e in zip(reference, exported, strict=True)]
    mean_cosine = sum(similarities) / len(similarities)

    # How far the export moved a vector, in the same units as a margin, so the
    # two can be compared directly.
    perturbation = 1.0 - mean_cosine
    margins = margins_at_k(reference, k=3)

    return result.model_copy(
        update={
            "exported": True,
            "artifact_bytes": directory_bytes(int8_dir),
            "observed_dimensions": len(exported[0]),
            "load_seconds": load_seconds,
            "query_seconds": query_seconds,
            "peak_rss_mb_process": peak_rss_mb(),
            "min_cosine": min(similarities),
            "mean_cosine": mean_cosine,
            "fp32_control_cosine": control,
            "ranking_agreement_at_3": ranking_agreement(reference, exported, k=3),
            "mean_reference_margin_at_3": sum(margins) / len(margins),
            "cosine_perturbation": perturbation,
            "probes_with_margin_below_perturbation": sum(
                1 for margin in margins if margin < perturbation
            ),
            "notes": [f"pooling read from the model: {pooling}"],
        }
    )


def main() -> int:
    """`npm run eval:preflight -- [model-id]`. One candidate per run by default.

    One at a time because `peak_rss_mb_process` is a process high-water mark:
    measuring three in one process would report the largest, three times.
    """
    repo = Path(__file__).resolve().parents[2]
    probes = Probes.from_gold(repo / "eval" / "questions")
    work_dir = repo / ".preflight"
    work_dir.mkdir(exist_ok=True)

    wanted = sys.argv[1:] or [candidate.model_id for candidate in SLATE]
    chosen = [candidate for candidate in SLATE if candidate.model_id in wanted]
    if not chosen:
        print(f"no candidate matches {wanted}", file=sys.stderr)
        return 2

    results: list[PreflightResult] = []
    for candidate in chosen:
        print(f"\n▶ {candidate.model_id}", flush=True)
        result = run(candidate, probes, work_dir)
        results.append(result)
        for line in verdict_lines(result):
            print(line, flush=True)

    reports = repo / "eval" / "reports"
    reports.mkdir(parents=True, exist_ok=True)
    out = reports / "preflight.json"
    print(f"\n→ {out.relative_to(repo)}")
    out.write_text(json.dumps(merge_results(out, results), indent=2) + "\n", "utf-8")
    return 0


def merge_results(
    report_path: Path, fresh: Sequence[PreflightResult]
) -> list[dict[str, Any]]:
    """Fold this run's results into an existing report, keyed by model id.

    ⚠️ WITHOUT THIS, ONE-CANDIDATE-PER-RUN SILENTLY DESTROYS THE REPORT. The CLI
    measures a single candidate per invocation on purpose, because peak memory
    is a whole-process high-water mark — so overwriting the file with only the
    current run's results means the report never holds more than one model, and
    the two it dropped left no trace.

    Ordered by `SLATE` rather than by when each was run, so a reader sees the
    candidates in a stable order and a re-measured one does not jump position.
    """
    # ⚠️ ENTRIES FROM EARLIER RUNS ARE RE-VALIDATED, NOT COPIED THROUGH. The
    # schema grows — `fp32_control_cosine` was added after two candidates had
    # already been measured — and merging raw dicts leaves a report holding two
    # shapes, where a reader (or a `KeyError`) discovers it later. Round-tripping
    # through the model gives an older entry the current field set, and a field
    # nobody measured reads as `None`, which the verdict renders as "not
    # measured" rather than passing it over in silence.
    existing: dict[str, dict[str, Any]] = {}
    if report_path.exists():
        for entry in json.loads(report_path.read_text(encoding="utf-8")):
            result = PreflightResult.model_validate(entry)
            existing[result.model_id] = result.model_dump()

    for result in fresh:
        existing[result.model_id] = result.model_dump()

    order = [candidate.model_id for candidate in SLATE]
    return sorted(
        existing.values(),
        key=lambda entry: (
            order.index(str(entry["model_id"]))
            if entry["model_id"] in order
            else len(order)
        ),
    )


if __name__ == "__main__":
    raise SystemExit(main())
