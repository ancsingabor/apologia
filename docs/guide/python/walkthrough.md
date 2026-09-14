# Harness walkthrough

One section per module in `harness/apologia_eval/`, in the order to read them.
Each section follows the same shape:

- what the module is for
- its TypeScript twin, if it has one
- the Python it teaches
- **one exercise that breaks something on purpose**

The exercises follow the repo's own rule: a check you haven't seen fail isn't
a check yet. Every predicted outcome below was run before it was written down.

Undo any exercise with `git checkout -- harness/`.

---

## `hashing.py`: the corpus hash, ported

**What it does.** It reproduces two TypeScript functions byte for byte:

- `document_content_hash`, a sha256 over each unit's `locator \t role \t text \n`
- `corpus_hash`, a sha256 over the sorted list of `source:language \t hash`

Every eval report must record the corpus hash so a number can be traced to the
exact corpus it was measured on. The report writer is Python, so the hash has
to exist in Python *identically*.

**TS twin.** `lib/corpus/hash.ts`, which stays authoritative. "Do not improve
anything here. Byte-compatibility is the entire specification" is in the file
header.

**Read it with.** `tests/test_hashing.py`. Its expected values were produced
by the TypeScript implementation, never by this one, and one of them is the
real `corpus_hash` from `corpus/manifest.lock.yaml`.

**The Python it teaches:**
- `@dataclass(frozen=True, slots=True)` as a typed, immutable record, and
  `@property` as a getter
- `str | None` and the explicit `x if x is not None else ""`, the long form of
  `??`
- `hashlib.sha256()`, `.update(…)`, `.hexdigest()`, and why strings need
  `.encode()`
- `sorted(…, key=lambda …)`, and why that's **not** the same as `localeCompare`

**Exercise: find the test that can't see a bug.**

1. In `corpus_hash`, change `key=lambda d: d.key` to
   `key=lambda d: d.key, reverse=True`. Run `uv run pytest`.
   `test_corpus_hash_ignores_document_order` fails, as it should.
2. Now change it to `key=lambda d: d.key.upper()` instead. Run it again.
   **All 34 tests pass.**

Why does step 2 pass? Every key the corpus can produce today (`ccc:en`,
`ccc:hu`, `summa:la`) is lowercase ASCII, and for those keys upper-case order,
code-point order and ICU collation all agree. The test pins that *assumption*.
It can't prove the sort is right in general. Read the docstring of
`test_sort_agrees_with_localecompare_for_lowercase_ascii_keys`: it says exactly
this. A source id with an accent would make the Python and TypeScript hashes
disagree, and today nothing would notice until two machines disagreed about a
published number.

**Bonus.** Replace `unit.role if unit.role is not None else ""` with
`f"{unit.role}"`. Several tests fail, because `f"{None}"` is `"None"`. JS would
give `"null"`. Neither is the empty string that `?? ""` produces.

---

## `gold.py`: the gold set, validated

**What it does.** It reads every `eval/questions/q-*.yaml` file, validates
each one into a `GoldQuestion`, and refuses the whole set on the first
malformed file, naming that file. It only ever *reads*. Nothing here writes or
repairs a question, because a benchmark a program can edit gets fitted to the
system it judges.

**TS twin.** There isn't a direct one. The pattern is Zod at a boundary, as in
`lib/corpus/manifest.ts`. Compare with `scripts/eval-lint.ts:44`, which reads
the same files with `z.looseObject`, deliberately loose because it only needs
the locators.

**The Python it teaches:**
- pydantic `BaseModel` as a class-shaped Zod schema, `Literal[…]` as a string
  union, and `model_validate` as `parse`
- `ConfigDict(extra="forbid", frozen=True)`, which is `z.strictObject` plus
  immutability
- `Field(default_factory=list)` and the mutable-default trap
- A generator: `_load_each` `yield`s one question at a time, and `sorted(…)`
  consumes it
- `raise ValueError(f"{path}: {error}") from error`, which re-raises with the
  filename and keeps the cause chain
- A nested set comprehension in `sources_referenced`

**Exercise: make a typo invisible.**

1. In `GoldQuestion.model_config`, delete `extra="forbid", `. Run
   `uv run pytest`.
   `test_an_unknown_key_is_rejected_not_ignored` fails.
2. Read that test. It writes a question with `expected_unit:` (singular). With
   `forbid`, loading fails loudly. Without it, pydantic silently drops the key,
   and the question would score as if it expected nothing: a benchmark that
   quietly stops testing what it was written to test.

The same typo would sail through `eval:lint`, whose schema is loose. It is
caught only because this stricter reader runs in CI against the real gold set.
That is a design gap worth knowing about.

---

## `metrics.py`: recall, full recall, MRR

**What it does.** It implements the three retrieval metrics in
`docs/evaluation.md`. The key modelling choice is in the module docstring:
**a ranked result is a sequence of *sets* of unit locators.** Position *i*
holds the units the *i*-th chunk covers. For the Catechism each set has one
element. For the Summa, one chunk covers a whole article, so each set has
several. Flattening would let one Summa chunk count as seven hits.

**TS twin.** None, which is the point. This is new code whose deliverable is a
measurement (ADR-023). Its tests are hand-computed, because a metric that agrees
with itself proves nothing.

**The Python it teaches:**
- `frozenset[str]`, and set algebra as operators: `a & b` (intersection), `a |=
  b` (union in place) and `a <= b` (subset)
- Truthiness: an empty set is falsy, so `if chunk_units & wanted:` reads as
  "if they overlap"
- Slicing with `retrieved[:k]` and 1-based ranks with `enumerate(…, start=1)`
- `RankedUnits = Sequence[frozenset[str]]`, a type alias with no keyword
- Leading-underscore privacy: `_covered` isn't part of the module's API

**Exercise: two off-by-ones.**

1. In `reciprocal_rank`, change `enumerate(retrieved[:k], start=1)` to
   `enumerate(retrieved[:k])`. Run `uv run pytest`. Tests fail, including
   `test_reciprocal_rank_is_zero_past_the_cutoff`. The first rank is now 0, and
   `1.0 / 0` raises.
2. Undo that. In `_covered`, change `retrieved[:k]` to `retrieved`, so it
   ignores *k*. Several tests fail, including
   `test_full_recall_accumulates_across_ranks`. Every metric is now "@∞".

Then read `test_one_summa_chunk_can_satisfy_full_recall_alone`. It is the
sets-not-lists decision, stated as a test.

---

## `db.py`: the corpus, read out of Postgres

**What it does.** It reads the current corpus (chunks, their unit mapping, the
document keys the corpus hash is built from), writes candidate vectors into
`chunk_embeddings`, and runs the cosine search the scorer needs.

**TS twin.** `scripts/ingest/client.ts` and `scripts/ingest/upsert.ts`, and the
resemblance is deliberate. The `--remote` guard is copied from the ingest CLI's
reasoning almost word for word: a remote target cannot be *forbidden*, because
embedding the production corpus is eventually necessary — it can be required to
be **chosen**.

**The shape to notice before the Python.** The module is split down the middle.
Everything above `# ── Impure` is pure: rows in, objects out, unit tested
against fake tuples. Everything below opens a connection and is not tested here
at all. That is `CLAUDE.md`'s "pure stages in `lib/corpus/`, I/O in
`scripts/ingest/`" rule, restated on the Python side of the boundary — and it
is what lets `harness/tests/` stay service-free and sub-second.

**Three decisions worth reading the comments for:**

1. **`documents.is_current`.** Re-ingesting inserts a new document rather than
   mutating the old one, so superseded rows stay. Every query joins on
   `is_current`. Forgetting it does not error — it silently doubles the corpus
   and scores every metric over text nobody would be served.
2. **`verify_document_hashes` orders by `ordinal`, and that is argued, not
   assumed.** `corpus_hash` is a hash of hashes: it reads
   `documents.content_hash` and never looks at a unit, so a half-written ingest
   yields a stable, plausible hash for a document that is not there. The
   re-derivation closes that — and it is only correct because
   `applyRelabels` (`lib/corpus/assert.ts`) ends with
   `.sort(…).map((unit, index) => ({...unit, ordinal: index + 1}))`, making
   `ordinal` literally the index of the array that was hashed.
3. **`on conflict do nothing`, not an upsert**, in `write_embeddings`. If the
   same `(chunk, model)` key produces a *different* vector, the model id is
   lying about what produced it — the exact provenance failure ADR-023 says the
   harness exists to prevent. Overwriting would hide it.

**The Python it teaches:**
- `with conn.cursor() as cursor:` — a context manager, the `try/finally` that
  JavaScript has no syntax for (`db.py:271`)
- `if TYPE_CHECKING:` plus `from __future__ import annotations`: an import that
  exists for `mypy` and never at runtime (`db.py:34`)
- A **lazy import** inside a function body, so an optional dependency stays
  optional (`db.py:259`)
- `os.environ.get("DB_URL")` ≈ `process.env.DB_URL` — `.get` returns `None`
  rather than raising (`db.py:241`)
- `def connect(*, remote: bool = False)`: the bare `*` makes every later
  argument keyword-only. There is no JS equivalent short of an options object.
- `collected.setdefault(key, set()).add(v)` — the one-line "get or create"
  (`db.py:125`)
- `@property` for a derived value that reads like a field (`db.py:84`)
- `urlparse(url).hostname` ≈ `new URL(url).hostname` (`db.py:224`)

**Exercise: three ways to make the corpus lie.**

1. In `snapshot`, delete the `assert_every_chunk_maps_to_a_unit(chunks, links)`
   line. `uv run pytest` → **1 failed, 48 passed**;
   `test_snapshot_runs_the_orphan_assertion` reports `DID NOT RAISE ValueError`.
   That test exists because an assertion that is merely *available* is not a
   gate — it has to be on the path every caller uses.
2. Undo that. In `units_by_chunk`, change `frozenset(units)` to `list(units)`.
   `uv run pytest` → **3 failed, 46 passed**, and `uv run mypy` also fails with
   `Value expression in dictionary comprehension has incompatible type
   "list[str]"`. Two independent gates catch one mistake, which is the point of
   the type alias: a list here would still "work" at every call site and would
   let one Summa article count as seven hits.
3. Undo that. In `to_vector_literal`, change `repr(float(value))` to
   `f"{float(value):.6f}"`. `uv run pytest` → **2 failed**, with
   `assert 0.3 == 0.30000000000000004`. Six decimal places looks generous and is
   not: it silently truncates every vector, and the only symptom in production
   would be recall that is slightly worse than it should be, for a reason no
   metric attributes to formatting.

---

## Modules not yet written 📐

`bakeoff.py` and `score.py` get their sections here when they land. The docs
lint requires it: a module in `harness/apologia_eval/` without a section in this
file fails `npm run docs:lint`.
