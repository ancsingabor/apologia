"""The slate: which embedding models compete, and what is true about each.

Pure data and pure validation. No model is loaded here and nothing is
downloaded, so this module is importable and unit tested without torch — which
matters, because the facts below are the ones that silently ruin a comparison
and they deserve a gate that runs in a second.

⚠️ EVERY FIELD HERE WAS READ OFF A MODEL CARD, NOT REMEMBERED. The prefix
conventions in particular differ per family and are counter-intuitive in two of
the three cases: `bge-m3` requires *no* instruction, and EmbeddingGemma requires
a structured document prompt carrying a `title:` field we do not have. ADR-023
names this as the silent-degradation case — omitting or inventing a prefix costs
recall and raises nothing — so the prefixes are data, checked by
`assert_slate_is_informative` and by tests, rather than string literals buried
in an embedding loop.

── Why a slate and not a winner ─────────────────────────────────────────────

ADR-008 is deferred and is decided by measurement. `chunk_embeddings` is keyed
`(chunk_id, model)` and its `embedding` column is undimensioned and unindexed
precisely so that several candidates can sit side by side over one corpus. This
module is the list of what sits there. Choosing the list is a real decision;
choosing the winner is not one anybody gets to make in advance.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Serving(Enum):
    """How a candidate would answer a query in production, if it won.

    ⚠️ THIS FIELD EXISTS BECAUSE ADR-023'S OUTCOME TABLE HAS A MISSING ROW.
    It covers "an open-weights model wins" and both hosted cases, but not "an
    open-weights model wins and cannot be served". Retrieval is confined to one
    embedding space — the model that embedded the corpus must embed the question
    — so a candidate with no serving story is not a candidate that scored badly.
    It is one that cannot be used at all, and it must not be able to win.

    The pre-flight's job is to turn this from an intention into a measurement.
    """

    #: An ONNX export runs inside the deployed function. Cheapest, and the
    #: default assumption ADR-023 makes.
    BUNDLED_ONNX = "bundled-onnx"

    #: The same open weights run on a host we call. The corpus never leaves,
    #: so this does NOT raise ADR-003's licence question: what is transmitted is
    #: the user's own sentence, which ADR-003 explicitly sets apart.
    PROXIED = "proxied"

    #: A third-party embedding API. Blocked until ADR-003 § Open question is
    #: answered, because measuring one means transmitting the whole corpus.
    HOSTED_API = "hosted-api"

    #: Established by the pre-flight as unservable. Recorded rather than
    #: deleted, so the report says why a model is absent.
    NONE = "none"


@dataclass(frozen=True, slots=True)
class Candidate:
    """One model on the slate, with the facts that make a comparison honest."""

    #: The exact provider model id, written into `chunk_embeddings.model` and
    #: into every report. ADR-023's whole provenance argument rests on this
    #: naming what actually ran — including the export format, once quantized.
    model_id: str

    #: The pretraining family. Not decoration: two candidates sharing a base
    #: share a tokenizer and a language mix, so a slate that is all one family
    #: cannot answer "would different pretraining do better".
    base_family: str

    parameters_m: int
    max_sequence_tokens: int
    dimensions: int

    #: Prepended to a query and to a passage respectively. The empty string is
    #: a real, deliberate value — `bge-m3`'s card states the model "no longer
    #: requires adding instructions to the queries", and adding one anyway is a
    #: silent regression.
    query_prefix: str
    passage_prefix: str

    normalize: bool

    #: Why the two prefixes look the way they do. REQUIRED to be non-empty when
    #: they are asymmetric — see `assert_prefixes_are_declared`.
    prefix_note: str

    #: True when measuring this candidate means transmitting corpus text to a
    #: third party. Gated on ADR-003, never on convenience.
    transmits_corpus: bool

    serving: Serving

    @property
    def uses_prefixes(self) -> bool:
        return bool(self.query_prefix or self.passage_prefix)

    @property
    def is_measurable(self) -> bool:
        """Whether this candidate may be embedded at all, today.

        Separate from whether it could be *served*: the licence question governs
        the corpus pass, the pre-flight governs the query path, and conflating
        them would let one answer stand in for the other.
        """
        return not self.transmits_corpus

    def apply_query_prefix(self, text: str) -> str:
        return f"{self.query_prefix}{text}"

    def apply_passage_prefix(self, text: str) -> str:
        return f"{self.passage_prefix}{text}"


# ── The slate ────────────────────────────────────────────────────────────────
#
# Facts verified against each model card on 2026-09-14. If a card changes, this
# table is wrong until someone re-reads it — there is no way to check these from
# inside the repository, which is exactly why they are written down in one place
# instead of being passed around as arguments.

MULTILINGUAL_E5_LARGE = Candidate(
    model_id="intfloat/multilingual-e5-large",
    base_family="xlm-roberta",
    parameters_m=560,
    max_sequence_tokens=512,
    dimensions=1024,
    # The trailing space is part of the prefix. The card writes them as
    # "query: " and "passage: ", and dropping the space changes the tokens.
    query_prefix="query: ",
    passage_prefix="passage: ",
    normalize=True,
    prefix_note="Symmetric, per the card: every input starts with one or the other.",
    transmits_corpus=False,
    serving=Serving.BUNDLED_ONNX,
)

BGE_M3 = Candidate(
    model_id="BAAI/bge-m3",
    base_family="xlm-roberta",
    parameters_m=568,
    max_sequence_tokens=8192,
    dimensions=1024,
    # Deliberately empty. "The BGE-M3 model no longer requires adding
    # instructions to the queries" — adding one would be a quiet regression
    # that no assertion downstream could attribute.
    query_prefix="",
    passage_prefix="",
    normalize=True,
    prefix_note="Symmetric and empty: the card states instructions are not required.",
    transmits_corpus=False,
    serving=Serving.BUNDLED_ONNX,
)

QWEN3_EMBEDDING_06B = Candidate(
    model_id="Qwen/Qwen3-Embedding-0.6B",
    base_family="qwen3",
    parameters_m=600,
    max_sequence_tokens=32768,
    dimensions=1024,
    # ⚠️ GENUINELY ASYMMETRIC, AND THE CARD SAYS SO: queries carry a one-sentence
    # task instruction, documents carry nothing. An earlier version of this file
    # asserted both-or-neither and would have rejected this candidate outright.
    #
    # ⚠️ THE INSTRUCTION TEXT IS A TUNABLE, AND IT MUST NOT BE TUNED. The card
    # reports 1-5% swing from instruction wording, which is the same order as
    # the differences the bake-off is trying to measure. So it stays a neutral,
    # generic retrieval instruction, fixed before any score exists —
    # `docs/evaluation.md`'s rule about the gold set applied to a prompt.
    query_prefix=(
        "Instruct: Given a question, retrieve passages that answer it\nQuery:"
    ),
    passage_prefix="",
    normalize=True,
    prefix_note=(
        "Asymmetric by design: the card requires a task instruction on queries "
        "and states documents need none."
    ),
    transmits_corpus=False,
    serving=Serving.BUNDLED_ONNX,
)

# ⚠️ `google/embeddinggemma-300m` IS DELIBERATELY ABSENT. It is a gated repo:
# downloading it needs a HuggingFace login and acceptance of Google's Gemma
# terms, which is a licence obligation this repository has not taken on. Recorded
# here rather than silently omitted, so the decision is visible — and because the
# 401 it produces is an ENVIRONMENT fault, not a finding that the model cannot be
# served (`preflight.run` refuses to record it as one).

SLATE: tuple[Candidate, ...] = (
    MULTILINGUAL_E5_LARGE,
    BGE_M3,
    QWEN3_EMBEDDING_06B,
)


# ── Refusals ─────────────────────────────────────────────────────────────────


def assert_measurable(candidate: Candidate) -> None:
    """Refuse a candidate whose measurement would transmit the corpus.

    ADR-003 § Open question is explicit that this must not be decided by running
    the bake-off: "an architectural commitment made as a side effect of a
    measurement" is the failure. So a hosted candidate is *representable* here
    and refused at the point of use, rather than omitted from the slate — an
    absent constraint is one nobody re-argues.
    """
    if not candidate.is_measurable:
        raise ValueError(
            f"{candidate.model_id} cannot be measured yet: embedding the corpus "
            "with it means transmitting restricted magisterial text to a third "
            "party, which ADR-003 § Open question has not settled. That question "
            "is not answered by running this."
        )


def assert_servable(candidate: Candidate) -> None:
    """Refuse a candidate that could win but could never answer a query.

    The row missing from ADR-023's outcome table. Retrieval lives in one
    embedding space, so the winner must also embed the user's question; a model
    that cannot be served is not a cheap option with a caveat, it is unusable.
    Checked before it competes, so "perfect locally, unshippable in production"
    is not a discovery anyone makes after the compute is spent.
    """
    if candidate.serving is Serving.NONE:
        raise ValueError(
            f"{candidate.model_id} has no serving route, so it cannot embed a "
            "query at request time and cannot be the winner of a retrieval "
            "bake-off. Establish one, or drop it from the slate."
        )


def assert_prefixes_are_declared(slate: tuple[Candidate, ...]) -> None:
    """An asymmetric prefix pair must be explained, not merely present.

    ⚠️ THIS REPLACED A RULE THAT WAS SIMPLY WRONG. The first version demanded
    both prefixes or neither, reasoning that a query prefix with an empty
    passage prefix is a half-finished entry. Then `Qwen3-Embedding` arrived,
    whose card requires a task instruction on queries and *none* on documents —
    a real, documented asymmetry the rule would have rejected outright.

    The risk the old rule aimed at is real though: a forgotten passage prefix
    embeds the corpus into a different space from the queries, and nothing
    downstream raises. So asymmetry is allowed and must be *declared* — someone
    has to have read the card and written down why.
    """
    for candidate in slate:
        asymmetric = bool(candidate.query_prefix) != bool(candidate.passage_prefix)
        if asymmetric and not candidate.prefix_note.strip():
            raise ValueError(
                f"{candidate.model_id} sets one prefix and not the other with no "
                "note saying why. Either it is a documented asymmetry — record "
                "the card's wording in `prefix_note` — or a prefix was forgotten, "
                "which would embed the corpus into a different space from the "
                "queries with nothing raising."
            )


def assert_slate_is_informative(slate: tuple[Candidate, ...]) -> None:
    """Warn-by-raising when every candidate shares one pretraining family.

    Not a style rule. `multilingual-e5-large` and `bge-m3` are both XLM-RoBERTa
    derivatives: same backbone, same tokenizer, same 100-language pretraining
    mix. A slate of only those two measures retrieval fine-tuning and context
    window, and cannot say anything about whether a different pretraining mix
    reads Hungarian or Latin better — their Latin comes from the same source, so
    if it is weak it is weak in both, identically.

    A single-family slate is still a legitimate choice. It is not a legitimate
    *accident*, and ADR-008 has to say which it was.
    """
    if len(slate) < 2:
        raise ValueError("a bake-off needs at least two candidates")
    families = {candidate.base_family for candidate in slate}
    if len(families) == 1:
        raise ValueError(
            f"every candidate is {families.pop()!r}-based, so this bake-off "
            "compares fine-tuning and context window only — it cannot compare "
            "pretraining. Add a candidate from another family, or record in "
            "ADR-008 that the slate was single-family on purpose."
        )


def duplicate_model_ids(slate: tuple[Candidate, ...]) -> list[str]:
    """Model ids appearing more than once. Empty is the pass.

    `chunk_embeddings` is keyed `(chunk_id, model)`, so two entries sharing an
    id would write into each other's rows and the second would be silently
    dropped by `on conflict do nothing` — one candidate scoring another's
    vectors, with no error anywhere.
    """
    seen: dict[str, int] = {}
    for candidate in slate:
        seen[candidate.model_id] = seen.get(candidate.model_id, 0) + 1
    return sorted(model_id for model_id, count in seen.items() if count > 1)
