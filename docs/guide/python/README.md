# Python, for a TypeScript developer

## TL;DR

- The Python in this repo lives only in `harness/`. It measures retrieval and
  never serves a request ([ADR-023](../../adr/023-python-at-the-measurement-boundary.md)).
- **The goal is to understand what the repo uses, not to learn Python in
  general.** Each level below is one file in the harness, read next to its
  TypeScript counterpart.
- Three documents:
  - this path, with a progress checklist
  - [vocabulary.md](vocabulary.md), a TS ↔ Python phrasebook with a "first
    seen in" location for every entry
  - [walkthrough.md](walkthrough.md), one section per module, each with an
    exercise that breaks something on purpose
- **This track grows with the code.** When `db.py`, `bakeoff.py` and
  `score.py` land, each one brings its own level, its new vocabulary and its
  exercise.

## Before you start (10 minutes)

```bash
brew install uv                  # once. uv is npm + nvm + npx in one tool
cd harness
uv sync --all-groups             # ≈ npm ci: creates .venv/ from uv.lock
uv run pytest                    # ≈ npx vitest run. 34 tests, under a second
uv run ruff check .              # ≈ npx eslint .
uv run ruff format --check .     # ≈ npx prettier --check .
uv run mypy apologia_eval tests  # ≈ npx tsc --noEmit, in --strict mode
```

`uv run` runs a command inside the project's virtual environment, so you never
"activate" anything. The interpreter is pinned to 3.12 by `.python-version`.
This matters on a machine where a bare `python3` is an old Anaconda build.

## The path

Tick a box when you can explain the file to someone else without it open. The
ticks are committed, so progress is visible in the history as `docs(learn):`
commits.

### Level 0: tooling
- [ ] I can map `pyproject.toml` ↔ `package.json` and `uv.lock` ↔
      `package-lock.json`, and say what `[dependency-groups] dev` and
      `[project.optional-dependencies]` correspond to.
- [ ] I know why `pyproject.toml` splits the heavy dependencies (`torch`) into
      an optional extra: the deployed function must never pull them in.
- [ ] I have run all four gates above and seen each pass.

### Level 1: `hashing.py`, a port of `lib/corpus/hash.ts`
- [ ] `@dataclass(frozen=True, slots=True)`, `@property`, `str | None`
- [ ] `hashlib`, `.encode()`, `f"…"`, and why `None` must become `""` and not `"None"`
- [ ] **The `localeCompare` vs `sorted()` trap**, and why no test can catch it
      today
- [ ] Walkthrough exercise done

### Level 2: `gold.py`, pydantic as the Zod of Python
- [ ] `BaseModel`, `Literal[…]`, `ConfigDict(extra="forbid", frozen=True)`,
      `Field(default_factory=list)`
- [ ] A generator (`yield`, `Iterator[T]`) and `raise … from error`
- [ ] A set comprehension (`{… for … in … for … in …}`)
- [ ] Walkthrough exercise done

### Level 3: `metrics.py`, sets as a first-class type
- [ ] `frozenset`, and the operators `&`, `|=` and `<=` (they have no JS
      equivalent)
- [ ] Slicing `[:k]` and `enumerate(…, start=1)`
- [ ] Why a ranked result is `Sequence[frozenset[str]]` and not `list[str]`
- [ ] Walkthrough exercise done

### Level 3½: the tests
- [ ] `pytest` style: plain `assert`, `@pytest.fixture`, `tmp_path`,
      `pytest.raises(match=…)`, `@pytest.mark.parametrize`, `pytest.approx`
- [ ] Why every expected value in `test_metrics.py` is worked out by hand

### Level 4: `db.py`, the I/O shell
- [ ] Context managers (`with … as …`), and why they are the `try/finally` JS
      has no syntax for
- [ ] `if TYPE_CHECKING:` and a lazy `import` inside a function — the same
      trick for two different reasons (typing; an optional extra)
- [ ] Keyword-only arguments (`def f(*, remote: bool)`) and `setdefault`
- [ ] Why every query joins `documents.is_current`, and what breaks silently
      without it
- [ ] Why `verify_document_hashes` may order by `ordinal` — the argument in
      `lib/corpus/assert.ts`, not an assumption
- [ ] Walkthrough exercise done

### Level 5: `bakeoff.py` 📐, written when the file lands
Expected topics: `numpy` arrays (vs `Float32Array`), `sentence-transformers`,
query/passage prefixes, and a CLI entry point with `if __name__ == "__main__"`.

### Level 6: `score.py` 📐, written when the file lands
Expected topics: `pandas` DataFrames (vs arrays of objects plus `groupBy`),
`scipy.stats.bootstrap`, and what a confidence interval says at n = 8.

## How this track is kept current

The rule is in [`CLAUDE.md`](../../../CLAUDE.md): a new Python module arrives
with a walkthrough section, and a new idiom arrives with a vocabulary row.
`npm run docs:lint` fails if a module in `harness/apologia_eval/` has no
walkthrough section.
