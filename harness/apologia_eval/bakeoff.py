"""Embed the current corpus with the exact local ONNX artifact to be served.

No hosted provider and no implicit model download. The artifact, tokenizer,
pooling and candidate settings form one identity. Resuming that identity skips
committed chunks; changing any of them writes a separate embedding space.
The scorer imports the same encoder, so queries cannot use different weights.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from collections.abc import Sequence
from dataclasses import asdict, replace
from pathlib import Path
from typing import TYPE_CHECKING, Any

from apologia_eval import db
from apologia_eval.candidates import (
    SLATE,
    Candidate,
    assert_measurable,
    assert_servable,
)
from apologia_eval.preflight import exported_embeddings, load_exported

if TYPE_CHECKING:
    from psycopg import Connection

ROOT = Path(__file__).resolve().parents[2]
POOLING = ("mean", "cls", "lasttoken")


def embedding_identity(candidate: Candidate, artifact_hash: str, pooling: str) -> str:
    """A content identity rather than a mutable model name or filesystem path."""
    if pooling not in POOLING:
        raise ValueError(f"unknown pooling: {pooling}")
    # Bump encoder_version whenever preprocessing, pooling or inference changes.
    settings = asdict(candidate)
    settings["serving"] = candidate.serving.value
    payload = json.dumps(
        {
            "encoder_version": 1,
            "candidate": settings,
            "artifact_hash": artifact_hash,
            "pooling": pooling,
        },
        sort_keys=True,
    )
    digest = hashlib.sha256(payload.encode()).hexdigest()
    return f"{candidate.model_id}@onnx:{digest}"


def artifact_hash(directory: Path) -> str:
    """Hash every file, including tokenizer and external ONNX tensor data.

    A report cannot establish the revision of an old export retrospectively.
    Its content hash identifies exactly what ran, without claiming a revision.
    Keep exports in dedicated directories; reports belong elsewhere.
    """
    paths = sorted(p for p in directory.rglob("*") if p.is_file())
    if not paths or not any(p.suffix == ".onnx" for p in paths):
        raise ValueError("artifact must contain a local ONNX model")
    digest = hashlib.sha256()
    for path in paths:
        if path.is_symlink():
            raise ValueError("artifact files must not be symlinks")
        digest.update(path.relative_to(directory).as_posix().encode() + b"\0")
        digest.update(str(path.stat().st_size).encode() + b"\0")
        with path.open("rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(block)
    return digest.hexdigest()


def validate_vectors(
    vectors: Sequence[Sequence[float]], n: int, dimensions: int
) -> None:
    """Fail before writing a batch: count, dimension, finite values, nonzero norm."""
    if len(vectors) != n:
        raise ValueError("encoder returned the wrong number of vectors")
    for vector in vectors:
        if len(vector) != dimensions:
            raise ValueError("encoder returned the wrong vector dimensions")
        if not all(math.isfinite(v) for v in vector) or not any(vector):
            raise ValueError("encoder returned a nonfinite or zero vector")


def validate_artifact_configuration(
    candidate: Candidate, directory: Path, pooling: str
) -> None:
    """Apply the pooling and Qwen int8 findings recorded by the pre-flight.

    This is not a new fidelity threshold. Unknown replacement exports still
    need their own pre-flight; choosing a path is not a certification.
    """
    expected = {
        "intfloat/multilingual-e5-large": "mean",
        "BAAI/bge-m3": "cls",
        "Qwen/Qwen3-Embedding-0.6B": "lasttoken",
    }
    if pooling != expected[candidate.model_id]:
        raise ValueError("pooling disagrees with the measured candidate convention")
    config_path = directory / "ort_config.json"
    config = json.loads(config_path.read_text()) if config_path.exists() else {}
    quantized = bool(config.get("quantization")) or any(
        "quantized" in p.name for p in directory.glob("*.onnx")
    )
    if candidate.base_family == "qwen3" and quantized:
        raise ValueError(
            "Qwen3 int8 failed the pre-flight fidelity control; use a separately "
            "verified fp16/fp32 export, not the existing int8 artifact"
        )


class LocalEncoder:
    """Load once; explicit prefixes, context limit and pooling for both passes.

    Heavy libraries remain behind this I/O boundary. This measures ONNX, not
    reference PyTorch weights pretending to describe a quantized deployment.
    Selecting an artifact does not certify its fidelity: read the pre-flight.
    """

    def __init__(self, candidate: Candidate, directory: Path, pooling: str) -> None:
        assert_measurable(candidate)
        assert_servable(candidate)
        validate_artifact_configuration(candidate, directory, pooling)
        self.candidate = candidate
        self.pooling = pooling
        self.directory = directory
        self.hash = artifact_hash(directory)
        self.identity = embedding_identity(candidate, self.hash, pooling)
        self.loaded: tuple[Any, Any] = load_exported(directory)

    def lengths(self, texts: Sequence[str], *, query: bool = False) -> list[int]:
        tokenizer, _ = self.loaded
        prefix = (
            self.candidate.apply_query_prefix
            if query
            else self.candidate.apply_passage_prefix
        )
        return [
            len(tokenizer(prefix(text), truncation=False)["input_ids"])
            for text in texts
        ]

    def encode(self, texts: Sequence[str], *, query: bool = False) -> list[list[float]]:
        # exported_embeddings applies passage_prefix. Replacing only that field
        # reuses the exact inference path while preserving the query convention.
        candidate = (
            replace(self.candidate, passage_prefix=self.candidate.query_prefix)
            if query
            else self.candidate
        )
        vectors = exported_embeddings(candidate, self.loaded, texts, self.pooling)
        validate_vectors(vectors, len(texts), candidate.dimensions)
        return vectors

    def assert_unchanged(self) -> None:
        if artifact_hash(self.directory) != self.hash:
            raise ValueError("artifact changed during the run; discard its results")


def parser(description: str) -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=description)
    result.add_argument("model", choices=[c.model_id for c in SLATE])
    result.add_argument("--artifact", type=Path, required=True)
    result.add_argument("--pooling", choices=POOLING, required=True)
    result.add_argument("--remote", action="store_true")
    return result


def checked_corpus(conn: Connection[Any]) -> db.CorpusSnapshot:
    """Verify stored units before trusting the document hashes in provenance."""
    mismatches = db.verify_document_hashes(conn)
    if mismatches:
        raise ValueError(f"document hash mismatch: {', '.join(mismatches)}")
    corpus = db.load_corpus(conn)
    if not corpus.chunks:
        raise ValueError("current corpus is empty")
    return corpus


def main() -> int:
    args_parser = parser(__doc__ or "Embedding bake-off")
    args_parser.add_argument("--batch-size", type=int, default=16)
    args = args_parser.parse_args()
    if args.batch_size < 1:
        args_parser.error("--batch-size must be positive")
    candidate = next(c for c in SLATE if c.model_id == args.model)
    encoder = LocalEncoder(candidate, args.artifact, args.pooling)
    with db.connect(remote=args.remote) as conn:
        conn.execute("set transaction isolation level repeatable read")
        corpus = checked_corpus(conn)
        done = db.embedded_chunk_ids(conn, encoder.identity)
        pending = [c for c in corpus.chunks if c.id not in done]
        for start in range(0, len(pending), args.batch_size):
            batch = pending[start : start + args.batch_size]
            vectors = encoder.encode([chunk.text for chunk in batch])
            db.write_embeddings(
                conn,
                encoder.identity,
                candidate.dimensions,
                [
                    (chunk.id, vector)
                    for chunk, vector in zip(batch, vectors, strict=True)
                ],
            )
            print(f"Committed {min(start + len(batch), len(pending))}/{len(pending)}")
        encoder.assert_unchanged()
        if checked_corpus(conn).corpus_hash != corpus.corpus_hash:
            raise ValueError("corpus changed during embedding; rerun before scoring")
    print(f"Complete: {encoder.identity}; corpus {corpus.corpus_hash}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
