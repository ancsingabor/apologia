"""The corpus hash, reproduced from TypeScript.

⚠️ THIS FILE IS A PORT AND MUST STAY ONE. `lib/corpus/hash.ts` is the original
and remains authoritative; this exists because `docs/evaluation.md` requires
every eval report to record the corpus hash, and the harness that writes those
reports is Python.

ADR-023 named this as the consequence of introducing a second language: a
serialisation contract now spans the boundary. `tests/test_hashing.py` pins the
agreement against values produced by the TypeScript implementation. If the two
ever drift, every report's provenance field becomes a number that cannot be
tied back to a corpus — which is precisely what recording it was meant to
prevent.

Do not "improve" anything here. Byte-compatibility is the entire specification.
"""

from __future__ import annotations

import hashlib
from collections.abc import Iterable, Sequence
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class DocumentKey:
    """One ingested document, as `corpusHash` sees it."""

    source_id: str
    language: str
    content_hash: str

    @property
    def key(self) -> str:
        return f"{self.source_id}:{self.language}"


@dataclass(frozen=True, slots=True)
class HashableUnit:
    """The three fields a unit row contributes to its document's hash."""

    locator: str
    role: str | None
    text: str


def document_content_hash(units: Iterable[HashableUnit]) -> str:
    r"""sha256 over ``locator \t role \t text \n`` per unit, in the order given.

    Mirrors ``documentContentHash`` in ``lib/corpus/hash.ts``. Three things the
    original's comments establish, repeated because they are load-bearing:

    - It hashes the NORMALISED UNITS, never the fetched HTML, so a re-theming
      that alters no words is correctly a no-op (ADR-019).
    - ``locator`` is included so a pure relabelling moves the hash — the §146
      case, where three paragraphs kept their text and changed their address.
    - ``role`` is included for the same reason: correcting In Brief detection
      changed 552 hu and 544 en roles while the text stayed byte-identical, and
      a hash without ``role`` would have reported "unchanged" and written
      nothing.

    A ``None`` role serialises as the empty string, matching ``unit.role ?? ""``.
    """
    digest = hashlib.sha256()
    for unit in units:
        role = unit.role if unit.role is not None else ""
        digest.update(f"{unit.locator}\t{role}\t{unit.text}\n".encode())
    return digest.hexdigest()


def corpus_hash(documents: Sequence[DocumentKey]) -> str:
    r"""sha256 over ``sourceId:language \t contentHash \n``, sorted by key.

    Mirrors ``corpusHash`` in ``lib/corpus/hash.ts``, which sorts with
    ``String.prototype.localeCompare``.

    ⚠️ THE SORT IS THE ONE PLACE THIS PORT COULD SILENTLY DIVERGE.
    ``localeCompare`` is ICU collation; Python's ``sorted()`` is code-point
    order. They agree for every key the corpus can currently produce — source
    ids and language codes are lowercase ASCII (``ccc:en``, ``ccc:hu``,
    ``summa:la``), where collation and code-point order coincide — and
    ``tests/test_hashing.py`` pins that. They would NOT agree in general: ICU
    orders case- and accent-insensitively at the primary level, so a source id
    containing an uppercase letter or a diacritic could sort differently in the
    two languages and produce two different corpus hashes for one corpus.

    If a source id ever stops being lowercase ASCII, this function is wrong and
    the test that guards it must be the thing that says so.
    """
    digest = hashlib.sha256()
    for doc in sorted(documents, key=lambda d: d.key):
        digest.update(f"{doc.key}\t{doc.content_hash}\n".encode())
    return digest.hexdigest()


def raw_content_hash(text: str) -> str:
    """Provenance for one fetched page. Mirrors ``rawContentHash``."""
    return hashlib.sha256(text.encode()).hexdigest()
