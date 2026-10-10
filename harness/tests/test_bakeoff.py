"""Identity and vector refusals, without a model, network or database."""

from dataclasses import replace
from pathlib import Path

import pytest

from apologia_eval.bakeoff import (
    artifact_hash,
    embedding_identity,
    validate_artifact_configuration,
    validate_vectors,
)
from apologia_eval.candidates import BGE_M3, MULTILINGUAL_E5_LARGE, QWEN3_EMBEDDING_06B


def test_identity_tracks_configuration() -> None:
    original = embedding_identity(MULTILINGUAL_E5_LARGE, "hash-a", "mean")
    assert original == embedding_identity(MULTILINGUAL_E5_LARGE, "hash-a", "mean")
    assert original != embedding_identity(MULTILINGUAL_E5_LARGE, "hash-b", "mean")
    assert original != embedding_identity(MULTILINGUAL_E5_LARGE, "hash-a", "cls")
    assert original != embedding_identity(BGE_M3, "hash-a", "mean")
    changed = replace(MULTILINGUAL_E5_LARGE, query_prefix="forgotten: ")
    assert original != embedding_identity(changed, "hash-a", "mean")


def test_unknown_pooling_is_refused() -> None:
    with pytest.raises(ValueError, match="pooling"):
        embedding_identity(BGE_M3, "hash", "typo")


def test_artifact_hash_covers_tokenizer_external_data_and_names(tmp_path: Path) -> None:
    (tmp_path / "model.onnx").write_bytes(b"invented graph")
    tokenizer = tmp_path / "tokenizer.json"
    tokenizer.write_text("invented tokenizer")
    first = artifact_hash(tmp_path)
    tokenizer.write_text("changed tokenizer")
    assert first != artifact_hash(tmp_path)
    second = artifact_hash(tmp_path)
    (tmp_path / "model.onnx_data").write_bytes(b"weights")
    assert second != artifact_hash(tmp_path)
    third = artifact_hash(tmp_path)
    tokenizer.rename(tmp_path / "renamed.json")
    assert third != artifact_hash(tmp_path)


def test_missing_graph_is_refused(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="ONNX"):
        artifact_hash(tmp_path)


@pytest.mark.parametrize(
    ("vectors", "n", "dim", "message"),
    [
        ([], 1, 2, "number"),
        ([[1.0]], 1, 2, "dimensions"),
        ([[0.0, 0.0]], 1, 2, "zero"),
        ([[float("nan"), 1.0]], 1, 2, "nonfinite"),
        ([[float("inf"), 1.0]], 1, 2, "nonfinite"),
    ],
)
def test_invalid_vectors_are_refused(
    vectors: list[list[float]], n: int, dim: int, message: str
) -> None:
    with pytest.raises(ValueError, match=message):
        validate_vectors(vectors, n, dim)


def test_valid_vector() -> None:
    validate_vectors([[0.6, 0.8]], 1, 2)


def test_pooling_and_known_bad_qwen_export_are_refused(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="pooling disagrees"):
        validate_artifact_configuration(BGE_M3, tmp_path, "mean")
    (tmp_path / "model_quantized.onnx").write_bytes(b"invented graph")
    with pytest.raises(ValueError, match="failed the pre-flight"):
        validate_artifact_configuration(QWEN3_EMBEDDING_06B, tmp_path, "lasttoken")
    validate_artifact_configuration(BGE_M3, tmp_path, "cls")
