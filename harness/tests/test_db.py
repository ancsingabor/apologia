"""The pure half of `db.py`: rows in, objects out, and the two refusals.

No Postgres here, on purpose. `pyproject.toml` forbids it — "the repo's unit
gate is sub-second and service-free (ADR-015)" — so everything below runs
against fake row tuples shaped exactly like the `select` lists in `db.py`. What
needs a real database (the `is_current` join, the `<=>` ordering) belongs to the
integration lane, and a test here that pretended to cover it would be the
vacuous-check failure ADR-020 names.
"""

from __future__ import annotations

import pytest

from apologia_eval.db import (
    Chunk,
    assert_every_chunk_maps_to_a_unit,
    assert_sources_cover,
    chunk_from_row,
    document_keys_from_rows,
    ranked_units,
    snapshot,
    to_vector_literal,
    units_by_chunk,
)
from apologia_eval.hashing import DocumentKey, corpus_hash


def a_chunk(chunk_id: str, source_id: str = "ccc") -> Chunk:
    return Chunk(
        id=chunk_id,
        document_id="doc-1",
        source_id=source_id,
        language="hu",
        strategy="numbered-paragraph@1",
        text="…",
    )


# ── Row shaping ──────────────────────────────────────────────────────────────


def test_chunk_from_row_reads_the_select_list_in_order() -> None:
    """Column order is the contract between the SQL and this function.

    Written out positionally rather than by name because that is how psycopg
    returns a row: a reordered `select` list would otherwise put the language in
    `strategy` and nothing would raise.
    """
    chunk = chunk_from_row(
        ("chunk-1", "doc-9", "summa", "la", "scholastic-article@1", "Respondeo…")
    )
    assert chunk == Chunk(
        id="chunk-1",
        document_id="doc-9",
        source_id="summa",
        language="la",
        strategy="scholastic-article@1",
        text="Respondeo…",
    )


def test_units_by_chunk_collapses_pairs_into_sets() -> None:
    rows = [
        ("chunk-1", "summa:I.q2.a3.arg1"),
        ("chunk-1", "summa:I.q2.a3.co"),
        ("chunk-2", "ccc:283"),
    ]
    assert units_by_chunk(rows) == {
        "chunk-1": frozenset({"summa:I.q2.a3.arg1", "summa:I.q2.a3.co"}),
        "chunk-2": frozenset({"ccc:283"}),
    }


def test_units_by_chunk_returns_frozensets_not_lists() -> None:
    """The type is the modelling decision, so it is asserted directly.

    `metrics.RankedUnits` is a sequence of SETS. A list here would still "work"
    at every call site and would let one Summa article count as seven hits.
    """
    (units,) = units_by_chunk([("chunk-1", "ccc:1")]).values()
    assert isinstance(units, frozenset)


def test_a_duplicate_pair_does_not_inflate_a_chunk() -> None:
    """Two rows naming the same unit are one unit, not two."""
    collapsed = units_by_chunk([("chunk-1", "ccc:283"), ("chunk-1", "ccc:283")])
    assert collapsed["chunk-1"] == frozenset({"ccc:283"})


def test_document_keys_feed_the_corpus_hash() -> None:
    """The rows this returns must be the shape `corpus_hash` consumes.

    Anchored to the value in `corpus/manifest.lock.yaml`'s shape rather than to
    a number invented here: what is asserted is that the two functions compose,
    which is the only claim this test can honestly make.
    """
    keys = document_keys_from_rows([("ccc", "hu", "a" * 64), ("ccc", "en", "b" * 64)])
    assert keys == [
        DocumentKey("ccc", "hu", "a" * 64),
        DocumentKey("ccc", "en", "b" * 64),
    ]
    assert corpus_hash(keys) == corpus_hash(list(reversed(keys)))


# ── The refusals ─────────────────────────────────────────────────────────────


def test_a_chunk_mapping_to_no_unit_is_refused() -> None:
    """An orphan chunk is retrievable and can never score. It must not pass.

    This is the failure the assertion exists for: nothing raises on its own, the
    chunk simply never matches a gold expectation, and every metric is a little
    lower than it should be by an amount nobody can attribute.
    """
    with pytest.raises(ValueError, match="map to no unit"):
        assert_every_chunk_maps_to_a_unit(
            [a_chunk("chunk-1"), a_chunk("chunk-2")],
            {"chunk-1": frozenset({"ccc:283"})},
        )


def test_an_empty_unit_set_counts_as_an_orphan() -> None:
    """Present-but-empty is the same defect as absent, and is caught the same.

    `units_by_chunk` cannot produce an empty set, but a future caller could, and
    `links.get(id)` would then be truthy-checked into a pass.
    """
    with pytest.raises(ValueError, match="map to no unit"):
        assert_every_chunk_maps_to_a_unit(
            [a_chunk("chunk-1")], {"chunk-1": frozenset()}
        )


def test_a_fully_mapped_corpus_passes() -> None:
    assert_every_chunk_maps_to_a_unit(
        [a_chunk("chunk-1")], {"chunk-1": frozenset({"ccc:283"})}
    )


def test_a_missing_source_is_refused_by_name() -> None:
    """The pre-Summa case from `gold.sources_referenced`'s docstring.

    Three of the eight scorable questions would have scored zero for a reason
    that has nothing to do with retrieval quality.
    """
    with pytest.raises(ValueError, match="summa"):
        assert_sources_cover({"ccc", "summa"}, {"ccc"})


def test_a_corpus_holding_more_than_the_gold_set_needs_is_fine() -> None:
    """Extra sources are not a defect — the gold set need not cover everything."""
    assert_sources_cover({"ccc"}, {"ccc", "summa"})


def test_snapshot_runs_the_orphan_assertion() -> None:
    """The assertion has to be on the path everyone uses, not merely available."""
    with pytest.raises(ValueError, match="map to no unit"):
        snapshot([a_chunk("chunk-1")], {}, [])


# ── The bridge to the metrics ────────────────────────────────────────────────


def test_ranked_units_preserves_rank_order() -> None:
    links = {
        "chunk-1": frozenset({"ccc:283"}),
        "chunk-2": frozenset({"ccc:284"}),
    }
    assert ranked_units(["chunk-2", "chunk-1"], links) == [
        frozenset({"ccc:284"}),
        frozenset({"ccc:283"}),
    ]


def test_an_unknown_chunk_ranks_as_an_empty_set_not_a_gap() -> None:
    """A retrieved chunk we hold no mapping for occupies its rank and scores 0.

    Dropping it instead would silently promote every chunk below it, turning a
    miss at rank 1 into a hit at rank 1 — the one direction of error that
    flatters the retriever.
    """
    assert ranked_units(["unknown"], {}) == [frozenset()]


# ── The vector literal ───────────────────────────────────────────────────────


def test_vector_literal_is_pgvector_shaped() -> None:
    assert to_vector_literal([1.0, -0.5]) == "[1.0,-0.5]"


def test_vector_literal_round_trips_exactly() -> None:
    """Lossless is the whole claim. A truncated vector degrades recall silently.

    0.1 + 0.2 is chosen because it is the canonical float whose shortest decimal
    form is not its exact value; `repr` round-trips it, a `%.6f` would not.
    """
    value = 0.1 + 0.2
    rendered = to_vector_literal([value])
    assert float(rendered.strip("[]")) == value
