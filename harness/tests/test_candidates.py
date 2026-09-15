"""The slate, and the three refusals that keep a comparison honest.

Pure data, so these run with no extras installed at all — which is the point:
the facts most likely to ruin a bake-off silently (a wrong prefix, a duplicate
model id, an accidentally single-family slate) are gated in under a second.
"""

from __future__ import annotations

import pytest

from apologia_eval.candidates import (
    BGE_M3,
    MULTILINGUAL_E5_LARGE,
    QWEN3_EMBEDDING_06B,
    SLATE,
    Candidate,
    Serving,
    assert_measurable,
    assert_prefixes_are_declared,
    assert_servable,
    assert_slate_is_informative,
    duplicate_model_ids,
)


def test_the_slate_has_three_candidates() -> None:
    assert len(SLATE) == 3


def test_no_duplicate_model_ids() -> None:
    """`chunk_embeddings` is keyed `(chunk_id, model)`.

    Two entries sharing an id would write into each other's rows, and
    `on conflict do nothing` would drop the second silently — one candidate
    scored against another's vectors, with nothing raised anywhere.
    """
    assert duplicate_model_ids(SLATE) == []


# ── Prefixes: read off the cards, and counter-intuitive twice ────────────────


def test_e5_prefixes_keep_their_trailing_space() -> None:
    """The card writes "query: " and "passage: ". The space is part of it.

    Stripping it changes the tokenisation of every single input, and nothing
    would raise — recall would simply be worse for the whole run.
    """
    assert MULTILINGUAL_E5_LARGE.query_prefix == "query: "
    assert MULTILINGUAL_E5_LARGE.passage_prefix == "passage: "
    assert MULTILINGUAL_E5_LARGE.apply_query_prefix("Mit tanít?") == "query: Mit tanít?"


def test_bge_m3_takes_no_prefix_at_all() -> None:
    """Empty is a deliberate value here, not a gap someone forgot to fill.

    The model card: "the BGE-M3 model no longer requires adding instructions to
    the queries". Adding one anyway is a silent regression, so it is asserted
    rather than left to whoever writes the embedding loop.
    """
    assert BGE_M3.query_prefix == ""
    assert BGE_M3.passage_prefix == ""
    assert BGE_M3.uses_prefixes is False
    assert BGE_M3.apply_query_prefix("Miért?") == "Miért?"


def test_qwen3_is_asymmetric_on_purpose() -> None:
    """Queries carry a task instruction; documents carry nothing. Per the card.

    This candidate is why the both-or-neither rule had to go: it is a real,
    documented asymmetry, and the old rule would have rejected it.
    """
    assert QWEN3_EMBEDDING_06B.query_prefix.startswith("Instruct:")
    assert QWEN3_EMBEDDING_06B.passage_prefix == ""
    assert QWEN3_EMBEDDING_06B.prefix_note.strip()


def test_an_undeclared_asymmetry_is_refused() -> None:
    """The risk the old rule aimed at, kept: a forgotten passage prefix.

    It would embed the corpus into a different space from the queries, and
    nothing downstream would raise. Allowed only when someone has read the card
    and written down why.
    """
    with pytest.raises(ValueError, match="no note saying why"):
        assert_prefixes_are_declared(
            (a_candidate(query_prefix="query: ", prefix_note="  "),)
        )


def test_a_declared_asymmetry_passes() -> None:
    assert_prefixes_are_declared(
        (a_candidate(query_prefix="Instruct: …", prefix_note="documented on the card"),)
    )


def test_every_slate_candidate_declares_its_prefixes() -> None:
    assert_prefixes_are_declared(SLATE)


# ── The slate must be able to answer the question it is asked ────────────────


def test_the_slate_spans_more_than_one_pretraining_family() -> None:
    """Two of the three are XLM-RoBERTa; the third is what makes it a comparison.

    `multilingual-e5-large` and `bge-m3` share a backbone, a tokenizer and a
    100-language pretraining mix. A slate of only those two can compare
    fine-tuning and context window and nothing else — their Latin comes from the
    same source, so weak Latin would be weak identically in both.
    """
    assert_slate_is_informative(SLATE)
    assert len({c.base_family for c in SLATE}) >= 2


def test_a_single_family_slate_is_refused_by_name() -> None:
    with pytest.raises(ValueError, match="xlm-roberta"):
        assert_slate_is_informative((MULTILINGUAL_E5_LARGE, BGE_M3))


def test_a_one_candidate_slate_is_refused() -> None:
    with pytest.raises(ValueError, match="at least two"):
        assert_slate_is_informative((BGE_M3,))


# ── The two gates ────────────────────────────────────────────────────────────


def a_candidate(**overrides: object) -> Candidate:
    base = {
        "model_id": "test/model",
        "base_family": "test",
        "parameters_m": 1,
        "max_sequence_tokens": 512,
        "dimensions": 8,
        "query_prefix": "",
        "passage_prefix": "",
        "normalize": True,
        "prefix_note": "",
        "transmits_corpus": False,
        "serving": Serving.BUNDLED_ONNX,
    }
    return Candidate(**{**base, **overrides})  # type: ignore[arg-type]


def test_a_hosted_candidate_is_refused_and_names_the_open_question() -> None:
    """ADR-003 must not be settled as a side effect of running the bake-off.

    Represented and refused, rather than omitted: a constraint that is simply
    absent from the slate is one nobody ever re-argues.
    """
    with pytest.raises(ValueError, match="ADR-003"):
        assert_measurable(a_candidate(transmits_corpus=True))


def test_every_slate_candidate_is_measurable_today() -> None:
    for candidate in SLATE:
        assert_measurable(candidate)


def test_an_unservable_candidate_cannot_compete() -> None:
    """The row missing from ADR-023's outcome table, as a gate.

    A model that cannot embed a query at request time cannot be the winner of a
    retrieval bake-off, because the corpus and the question must share one
    embedding space.
    """
    with pytest.raises(ValueError, match="no serving route"):
        assert_servable(a_candidate(serving=Serving.NONE))


def test_measurable_and_servable_are_different_questions() -> None:
    """One is a licence question about the corpus, one is about the query path.

    Conflating them would let an answer to either stand in for the other.
    """
    hosted_but_servable = a_candidate(transmits_corpus=True, serving=Serving.HOSTED_API)
    assert_servable(hosted_but_servable)
    with pytest.raises(ValueError):
        assert_measurable(hosted_but_servable)
