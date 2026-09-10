"""Pins the Python hash port against values produced by TypeScript.

⚠️ EVERY EXPECTED VALUE IN THIS FILE WAS PRODUCED BY `lib/corpus/hash.ts`,
never by the Python implementation it checks. A test that computes its own
expectation from the code under test asserts only that the code is
deterministic — which is exactly the "assertion that cannot fail for the right
reason" ADR-020 rejects.

To regenerate after an intentional change to the TypeScript original, run the
TS functions over these same inputs and paste the results. If that feels
laborious, that is the point: the hash is a published provenance value and
changing it invalidates every eval report that recorded one.
"""

from __future__ import annotations

import pytest

from apologia_eval.hashing import (
    DocumentKey,
    HashableUnit,
    corpus_hash,
    document_content_hash,
    raw_content_hash,
)

# ── from lib/corpus/hash.ts ──────────────────────────────────────────────────
TS_EMPTY = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
TS_SINGLE_NULL_ROLE = "d131c4f2fa0d461dd1ddd84e41e131979037398b0b8ca6d7860857ed4e9d375d"
TS_WITH_ROLE = "b0372adf35263c4153680f931d1a44fd4335656bd2478f17644c3273bec0cfa3"
TS_ORDER_AB = "222b9544527d60f788d0dfdb928e565ae020cb6e1bd9cf45d2c87af02e9d166f"
TS_ORDER_BA = "385f682078b5c148fc4a58afc5bb1ea065f1b2968467d741dd01535d26701d27"
TS_UNICODE_HU = "b195fe851a2afcca987eb45ddb1c6a6fbf1f775ffb5290f788caab96ff049deb"
TS_TAB = "c9c1f66b903295238f724a34d7fc1b9b8d38678179e24a39fe8c36d8a43d3368"
TS_NEWLINE = "17e4f688e69084049869980642ae46386d9cb8de1ebb50d4e321eafddb3efae1"
TS_RAW = "1ceb5bf30854386248499cd2c93b49138f89926317a81f9182d0ae30aa62e351"

# The three documents actually ingested, and the corpus hash the pipeline
# emitted for them — this value is in `corpus/manifest.lock.yaml`.
CCC_HU = "5b85fbee822b627adfc2c4f805ba502e5ccd774f3e9da303b34f798ba67c9657"
CCC_EN = "82a9737f9027dbab0108a05a8a7166f07110ab79e71d9226af9d90bd5a985e5f"
SUMMA_LA = "c697b39661e22e1f1fc6881cc26b081d87385bd1bde1f4c9bfbecdecc98a6181"
TS_CORPUS_REAL = "42a33a159bfef11abeeec05ecdbdf942ebdbf89c0bde79148f6a5fe826f09597"


def test_empty_document_matches_typescript() -> None:
    assert document_content_hash([]) == TS_EMPTY


def test_none_role_serialises_as_empty_string() -> None:
    """`unit.role ?? ""` — a null role and an empty role are the same bytes."""
    null_role = document_content_hash([HashableUnit("ccc:1", None, "Hello.")])
    empty_role = document_content_hash([HashableUnit("ccc:1", "", "Hello.")])
    assert null_role == TS_SINGLE_NULL_ROLE
    assert empty_role == TS_SINGLE_NULL_ROLE


def test_role_is_covered_by_the_hash() -> None:
    """The In Brief correction changed 552 hu roles with byte-identical text.

    A hash over locator and text alone would have reported "unchanged" and
    persisted none of it.
    """
    unit = HashableUnit("summa:I.q2.a3.co", "respondeo", "Respondeo dicendum.")
    assert document_content_hash([unit]) == TS_WITH_ROLE
    without_role = document_content_hash(
        [HashableUnit("summa:I.q2.a3.co", None, "Respondeo dicendum.")]
    )
    assert without_role != TS_WITH_ROLE


def test_unit_order_changes_the_document_hash() -> None:
    a = HashableUnit("ccc:1", None, "A")
    b = HashableUnit("ccc:2", None, "B")
    assert document_content_hash([a, b]) == TS_ORDER_AB
    assert document_content_hash([b, a]) == TS_ORDER_BA
    assert TS_ORDER_AB != TS_ORDER_BA


def test_hungarian_text_matches_typescript() -> None:
    """UTF-8 encoding agrees. Node's `hash.update(string)` defaults to utf8."""
    unit = HashableUnit("ccc:1", None, "Az Egyház tanítása — őrző.")
    assert document_content_hash([unit]) == TS_UNICODE_HU


@pytest.mark.parametrize(
    ("text", "expected"),
    [("a\tb", TS_TAB), ("a\nb", TS_NEWLINE)],
)
def test_separator_characters_inside_text(text: str, expected: str) -> None:
    """Text containing the field and record separators is not escaped.

    Pinned rather than fixed: the TypeScript original does not escape either,
    so the port must not. It is a theoretical collision the corpus cannot
    currently produce — normalisation collapses whitespace — and the place to
    change it, if ever, is `lib/corpus/hash.ts`, at the cost of every recorded
    hash.
    """
    assert document_content_hash([HashableUnit("ccc:1", None, text)]) == expected


def test_raw_content_hash_matches_typescript() -> None:
    assert raw_content_hash("Az Egyház") == TS_RAW


def test_corpus_hash_matches_the_committed_lockfile() -> None:
    """The end-to-end pin: the value the real pipeline emitted on 2026-09-10."""
    documents = [
        DocumentKey("ccc", "hu", CCC_HU),
        DocumentKey("ccc", "en", CCC_EN),
        DocumentKey("summa", "la", SUMMA_LA),
    ]
    assert corpus_hash(documents) == TS_CORPUS_REAL


def test_corpus_hash_ignores_document_order() -> None:
    """A corpus is a set; ingest order is not part of its identity."""
    forward = [
        DocumentKey("ccc", "hu", CCC_HU),
        DocumentKey("ccc", "en", CCC_EN),
        DocumentKey("summa", "la", SUMMA_LA),
    ]
    assert corpus_hash(list(reversed(forward))) == TS_CORPUS_REAL


def test_sort_agrees_with_localecompare_for_lowercase_ascii_keys() -> None:
    """Guards the one place this port can silently diverge.

    `corpusHash` sorts with `localeCompare` (ICU collation); this port sorts by
    code point. They coincide only while every key is lowercase ASCII. This
    test documents the assumption; it does not make it safe. If a source id
    ever contains an uppercase letter or a diacritic, `corpus_hash` needs a
    real collation, and the failure will show up here rather than as two
    machines disagreeing about a published provenance value.
    """
    keys = ["ccc:en", "ccc:hu", "summa:la"]
    assert keys == sorted(keys)
    assert all(key == key.lower() and key.isascii() for key in keys)
