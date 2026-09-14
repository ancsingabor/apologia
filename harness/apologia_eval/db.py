"""Reading the current corpus out of Postgres, and writing candidate vectors.

This module is the harness's I/O shell. The split it follows is the one
`CLAUDE.md` states for the ingestion CLI — **pure stages in `lib/corpus/`, I/O
in `scripts/ingest/`** — applied on this side of the language boundary: every
function that shapes rows into objects is pure, lives at module scope and is
unit tested against fake tuples, while the connection and the SQL are not
tested here at all. `pyproject.toml` forbids `harness/tests/` from touching
Postgres, the network or a model, and that rule is what keeps the CI lane
sub-second.

⚠️ **`psycopg`, not the Supabase client, and not by accident.** `ADR-023`
already chose this by putting `psycopg[binary]` in the `db` extra. Two things
PostgREST cannot do well: write ~9,183 vectors per candidate, and order by
pgvector's `<=>` cosine operator. The scorer's entire job is the second one.

⚠️ **The import is lazy.** `psycopg` lives in an optional extra, so a developer
who ran a plain `uv sync` must still be able to import this module and run the
pure tests. Importing the driver at module scope would turn an optional
dependency into a required one for the whole harness.
"""

from __future__ import annotations

import os
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any
from urllib.parse import urlparse

from apologia_eval.hashing import DocumentKey, HashableUnit, document_content_hash
from apologia_eval.metrics import RankedUnits

if TYPE_CHECKING:  # pragma: no cover - typing only
    from psycopg import Connection

# ── The is_current rule, stated once ─────────────────────────────────────────
#
# ⚠️ EVERY QUERY IN THIS FILE JOINS `documents.is_current = true`, AND THAT IS
# LOAD-BEARING. Re-ingesting a new edition INSERTS a new document rather than
# mutating the old one, so that stored citations keep resolving against the text
# they were verified against (`0005_corpus.sql`). The superseded rows stay.
#
# Omitting the join does not error and does not look wrong. It silently doubles
# the corpus for any source that has ever been re-ingested, embeds text nobody
# would ever be served, and reports every metric over a corpus that does not
# exist. `docs/guide/status.md` names this as the first thing `db.py` must get
# right, which is why it is repeated on each statement below rather than hidden
# behind a helper someone could forget to call.

_CURRENT = "join documents d on d.id = c.document_id and d.is_current"


@dataclass(frozen=True, slots=True)
class Chunk:
    """One row of `chunks`, with its source resolved.

    `source_id` is carried here rather than looked up later because the report
    slices truncation counts by source: ~80% of Summa chunks exceed 2,048
    characters against ~0% of CCC chunks, so a candidate's truncation count is
    meaningless as a single number (ADR-023 § Consequences).
    """

    id: str
    document_id: str
    source_id: str
    language: str
    strategy: str
    text: str


@dataclass(frozen=True, slots=True)
class CorpusSnapshot:
    """Everything the bake-off and the scorer read, as one value.

    Assembled by `snapshot()`, which is pure, so the assertions below can be
    exercised without a database.
    """

    chunks: tuple[Chunk, ...]
    units_by_chunk: dict[str, frozenset[str]]
    documents: tuple[DocumentKey, ...]

    @property
    def corpus_hash(self) -> str:
        """The provenance field every eval report must record.

        `docs/evaluation.md`: "a number without provenance is not evidence".
        """
        from apologia_eval.hashing import corpus_hash

        return corpus_hash(self.documents)

    @property
    def sources(self) -> set[str]:
        """The source ids actually present, for the gold-set coverage check."""
        return {chunk.source_id for chunk in self.chunks}


# ── Pure: rows in, objects out ───────────────────────────────────────────────


def chunk_from_row(row: tuple[str, str, str, str, str, str]) -> Chunk:
    """One `chunks` row, in the column order `load_chunks` selects."""
    chunk_id, document_id, source_id, language, strategy, text = row
    return Chunk(
        id=chunk_id,
        document_id=document_id,
        source_id=source_id,
        language=language,
        strategy=strategy,
        text=text,
    )


def units_by_chunk(rows: Iterable[tuple[str, str]]) -> dict[str, frozenset[str]]:
    """`(chunk_id, locator)` pairs collapsed into the shape `metrics.py` wants.

    A `frozenset` per chunk, never a list, because `metrics.RankedUnits` is a
    sequence of SETS — one Summa chunk covers a whole article, and flattening
    that would let a single chunk at rank 1 count as seven independent hits.
    """
    collected: dict[str, set[str]] = {}
    for chunk_id, locator in rows:
        collected.setdefault(chunk_id, set()).add(locator)
    return {chunk_id: frozenset(units) for chunk_id, units in collected.items()}


def document_keys_from_rows(rows: Iterable[tuple[str, str, str]]) -> list[DocumentKey]:
    """`(source_id, language, content_hash)` rows as hashable document keys."""
    return [
        DocumentKey(source_id=source_id, language=language, content_hash=content_hash)
        for source_id, language, content_hash in rows
    ]


def snapshot(
    chunks: Sequence[Chunk],
    links: dict[str, frozenset[str]],
    documents: Sequence[DocumentKey],
) -> CorpusSnapshot:
    """Assemble a snapshot and run the two assertions that guard a scoring run.

    Both raise rather than warn. A bake-off is expensive and a scoring run
    produces a permanent ADR, so the moment to notice a corpus that cannot be
    scored honestly is before the first forward pass, not in the report.
    """
    assert_every_chunk_maps_to_a_unit(chunks, links)
    return CorpusSnapshot(
        chunks=tuple(chunks),
        units_by_chunk=dict(links),
        documents=tuple(documents),
    )


def assert_every_chunk_maps_to_a_unit(
    chunks: Sequence[Chunk], links: dict[str, frozenset[str]]
) -> None:
    """Refuse a corpus holding a chunk that no unit points at.

    Such a chunk can be retrieved and can never satisfy a gold expectation,
    because expectations are written in unit locators and this chunk resolves to
    none. It would depress every metric by an amount nobody could attribute, and
    nothing would raise. This is ADR-020's rule — an assertion that cannot fail
    for the right reason is worse than an absent one — applied to the join that
    makes retrieval results comparable with the gold set at all.
    """
    orphans = [chunk.id for chunk in chunks if not links.get(chunk.id)]
    if orphans:
        raise ValueError(
            f"{len(orphans)} chunk(s) map to no unit, so they can never satisfy "
            f"a gold expectation: {', '.join(orphans[:5])}"
            + (" …" if len(orphans) > 5 else "")
        )


def assert_sources_cover(required: set[str], present: set[str]) -> None:
    """Refuse a scoring run whose corpus is missing a source the gold set needs.

    Pair this with `gold.sources_referenced()`, whose docstring already states
    the case: before the Summa was ingested, three of the eight scorable
    questions would have scored zero for a reason that has nothing to do with
    retrieval quality. A number produced that way is not a low score, it is a
    wrong one.
    """
    missing = sorted(required - present)
    if missing:
        raise ValueError(
            "the gold set expects sources the current corpus does not hold: "
            f"{', '.join(missing)}. Ingest them, or the run scores questions "
            "zero for a reason unrelated to retrieval."
        )


def ranked_units(
    chunk_ids: Sequence[str], links: dict[str, frozenset[str]]
) -> RankedUnits:
    """A ranked list of chunk ids, as the sets of units each one covers.

    The bridge between what retrieval returns (chunks) and what the gold set
    expects (units). Kept pure and here, rather than inline in `score.py`,
    because it is the exact place the n:m `chunk_units` mapping (ADR-002) is
    allowed to matter and everywhere else must not.
    """
    return [links.get(chunk_id, frozenset()) for chunk_id in chunk_ids]


def to_vector_literal(values: Sequence[float]) -> str:
    """A Python float sequence as a pgvector literal.

    `repr` of a float round-trips exactly in Python, so this is lossless. The
    alternative is the `pgvector` package; a string literal avoids a dependency
    for one line of formatting, and being explicit about the round-trip is worth
    more here than the convenience — a silently truncated vector would degrade
    recall by an amount no test would attribute to formatting.
    """
    return "[" + ",".join(repr(float(value)) for value in values) + "]"


# ── Impure: the connection and the SQL ───────────────────────────────────────


def _is_local(url: str) -> bool:
    return urlparse(url).hostname in {"localhost", "127.0.0.1"}


def connect(*, remote: bool = False) -> Connection[Any]:
    """Open a connection to `DB_URL`, refusing a remote target unless chosen.

    ⚠️ THE GUARD IS THE INGEST CLI'S, NOT THE E2E SEED'S, AND THE DIFFERENCE IS
    DELIBERATE (`scripts/ingest/client.ts`). Embedding the production corpus is
    a legitimate operator action — eventually a necessary one, since the query
    path needs production vectors — so a remote target cannot be forbidden. It
    can be required to be *chosen*: a stale `DB_URL` in a shell must not be able
    to write 9,183 vectors into production silently, and an operator who means
    it passes `--remote`.

    `DB_URL` is the name `supabase status -o env` already prints, so a local run
    is the same two lines `scripts/integration.sh` uses.
    """
    url = os.environ.get("DB_URL")
    if not url:
        raise RuntimeError(
            "DB_URL is not set.\n"
            "For a local run: `supabase start`, then\n"
            "  eval \"$(supabase status -o env | grep -E '^[A-Z0-9_]+=')\""
        )

    if not _is_local(url) and not remote:
        raise RuntimeError(
            f"Refusing to use a non-local database without --remote.\n"
            f"  target: {urlparse(url).hostname}\n\n"
            "Embedding the production corpus is legitimate, but it has to be "
            "chosen rather than inherited from whatever the shell happens to "
            "hold. Re-run with --remote if that is what you mean."
        )

    try:
        import psycopg
    except ModuleNotFoundError as error:  # pragma: no cover - environment
        raise RuntimeError(
            "psycopg is not installed. It lives in the `db` extra:\n"
            "  uv sync --all-groups --extra db"
        ) from error

    return psycopg.connect(url)


def load_chunks(conn: Connection[Any]) -> list[Chunk]:
    """Every chunk of every current document."""
    with conn.cursor() as cursor:
        cursor.execute(
            f"""
            select c.id::text, c.document_id::text, d.source_id,
                   c.language, c.strategy, c.text
            from chunks c
            {_CURRENT}
            order by d.source_id, c.language, c.id
            """
        )
        return [chunk_from_row(row) for row in cursor.fetchall()]


def load_chunk_units(conn: Connection[Any]) -> dict[str, frozenset[str]]:
    """Which unit locators each current chunk covers."""
    with conn.cursor() as cursor:
        cursor.execute(
            f"""
            select cu.chunk_id::text, u.locator
            from chunk_units cu
            join chunks c on c.id = cu.chunk_id
            join units u on u.id = cu.unit_id
            {_CURRENT}
            """
        )
        return units_by_chunk(cursor.fetchall())


def load_document_keys(conn: Connection[Any]) -> list[DocumentKey]:
    """The current documents, as the corpus hash sees them."""
    with conn.cursor() as cursor:
        cursor.execute(
            """
            select source_id, language, content_hash
            from documents
            where is_current
            """
        )
        return document_keys_from_rows(cursor.fetchall())


def load_corpus(conn: Connection[Any]) -> CorpusSnapshot:
    """The whole current corpus, assertions included."""
    return snapshot(load_chunks(conn), load_chunk_units(conn), load_document_keys(conn))


def verify_document_hashes(conn: Connection[Any]) -> list[str]:
    """Re-derive each current document's `content_hash` from its stored units.

    Returns the keys that disagree; an empty list is the pass.

    ⚠️ THIS IS THE CHECK THAT MAKES THE REPORT'S PROVENANCE MEAN SOMETHING.
    `corpus_hash` is a hash of hashes: it reads `documents.content_hash` and
    never looks at a unit. So a partially-written ingest — units missing, text
    truncated — produces a corpus hash that is stable, plausible, and describes
    a document that is not there. Every report would carry it and every report
    would be wrong in the same invisible way.

    ── Why ordering by `ordinal` is correct, and not a guess ────────────────

    `documentContentHash` hashes units "in the order given", and the array it is
    given comes from `applyRelabels`, whose last act is
    `.sort(compareSequence).map((unit, index) => ({...unit, ordinal: index + 1}))`
    (`lib/corpus/assert.ts`). So `ordinal` *is* the index of the hashed array,
    and `order by ordinal` reproduces the input exactly. `assertCorpus` returns
    that array unfiltered, and `scripts/ingest/upsert.ts` writes `unit.ordinal`
    through unchanged.

    If any of those three ever stops being true, this function starts reporting
    a mismatch for a corpus that is fine — so it is a check that has to be
    re-argued, not merely re-run, when the ingest's ordering changes.
    """
    mismatched: list[str] = []
    with conn.cursor() as cursor:
        cursor.execute(
            """
            select id::text, source_id, language, content_hash
            from documents
            where is_current
            order by source_id, language
            """
        )
        documents = cursor.fetchall()

        for document_id, source_id, language, stored in documents:
            cursor.execute(
                """
                select locator, role, text
                from units
                where document_id = %s
                order by ordinal
                """,
                (document_id,),
            )
            derived = document_content_hash(
                HashableUnit(locator=locator, role=role, text=text)
                for locator, role, text in cursor.fetchall()
            )
            if derived != stored:
                mismatched.append(f"{source_id}:{language}")
    return mismatched


def embedded_chunk_ids(conn: Connection[Any], model: str) -> set[str]:
    """Which chunks this candidate has already embedded.

    What makes the bake-off resumable: `chunk_embeddings` is keyed
    `(chunk_id, model)`, so a run that dies halfway can be re-run and will skip
    what it already wrote.
    """
    with conn.cursor() as cursor:
        cursor.execute(
            "select chunk_id::text from chunk_embeddings where model = %s",
            (model,),
        )
        return {row[0] for row in cursor.fetchall()}


def write_embeddings(
    conn: Connection[Any],
    model: str,
    dimensions: int,
    rows: Iterable[tuple[str, Sequence[float]]],
) -> int:
    """Insert `(chunk_id, model, dimensions, embedding)` rows. Returns the count.

    `on conflict do nothing` rather than an upsert: re-embedding the same chunk
    with the same model should be a no-op, and a *different* vector for the same
    key means the model id is lying about what produced it — which is the
    provenance failure ADR-023 argues the whole Python harness exists to avoid.
    Overwriting would hide it.
    """
    written = 0
    with conn.cursor() as cursor:
        for chunk_id, vector in rows:
            cursor.execute(
                """
                insert into chunk_embeddings
                    (chunk_id, model, dimensions, embedding)
                values (%s, %s, %s, %s::vector)
                on conflict (chunk_id, model) do nothing
                """,
                (chunk_id, model, dimensions, to_vector_literal(vector)),
            )
            written += cursor.rowcount
    conn.commit()
    return written


def search(
    conn: Connection[Any], model: str, query_vector: Sequence[float], k: int
) -> list[str]:
    """The top *k* chunk ids for one query vector, by cosine distance.

    Exact sequential scan, no index, and that is the schema's decision rather
    than an omission: pgvector needs a fixed dimension to build HNSW, the
    dimension is a property of the model ADR-008 has not chosen, and an exact
    scan over 9,183 vectors is both fast and *more accurate* than an approximate
    index (`0005_corpus.sql` § chunk_embeddings).

    ⚠️ `model` FILTERS, AND IT MUST. Vectors are only comparable inside one
    model's space; mixing two candidates' rows would compute cosines between
    unrelated spaces and return noise without raising (ADR-023).
    """
    with conn.cursor() as cursor:
        cursor.execute(
            f"""
            select c.id::text
            from chunk_embeddings e
            join chunks c on c.id = e.chunk_id
            {_CURRENT}
            where e.model = %s
            order by e.embedding <=> %s::vector
            limit %s
            """,
            (model, to_vector_literal(query_vector), k),
        )
        return [row[0] for row in cursor.fetchall()]
