# TypeScript ↔ Python vocabulary

Only the idioms this repository actually uses. Each row says where the idiom
first appears, so you can read it in context. Paths are relative to
`harness/` unless they start with `lib/` or `scripts/`.

## Tooling

| Concept | TypeScript (this repo) | Python (this repo) | First seen in |
|---|---|---|---|
| Project manifest | `package.json` | `pyproject.toml` | `pyproject.toml:1` |
| Lockfile | `package-lock.json` | `uv.lock` | `uv.lock` |
| Install exactly | `npm ci` | `uv sync --all-groups` | `README.md` |
| Run a tool | `npx vitest` | `uv run pytest` | `README.md` |
| Runtime pin | `.nvmrc` / `engines` | `.python-version` + `requires-python` | `.python-version` |
| Dev dependencies | `devDependencies` | `[dependency-groups] dev` | `pyproject.toml:19` |
| Opt-in dependency sets | *(no clean equivalent)* | `[project.optional-dependencies]`: `db`, `local-models`, `stats` | `pyproject.toml:11` |
| Installed packages | `node_modules/` | `.venv/` | — |
| Lint + format | ESLint + Prettier | `ruff check` + `ruff format` | `pyproject.toml:27` |
| Type check | `tsc --noEmit` (strict) | `mypy --strict` | `pyproject.toml:34` |
| Test runner | Vitest | pytest | `tests/` |
| Package entry | `index.ts` | `__init__.py` (it also marks the folder as a package) | `apologia_eval/__init__.py` |

## Types and data shapes

| Concept | TypeScript | Python | First seen in |
|---|---|---|---|
| Nullable | `string \| null` | `str \| None` | `hashing.py:43` |
| String-literal union | `"hu" \| "en"` / `z.enum([...])` | `Literal["hu", "en"]` | `gold.py:32` |
| Immutable record | `readonly` fields / `Readonly<T>` | `@dataclass(frozen=True, slots=True)` | `hashing.py:25` |
| Getter | `get key() { … }` | `@property` | `hashing.py:33` |
| Validated schema | Zod `z.object({...})` | pydantic `class X(BaseModel)` | `gold.py:35` |
| Reject unknown keys | `z.strictObject(...)` | `ConfigDict(extra="forbid")` | `gold.py:42` |
| Ignore unknown keys | `z.looseObject(...)` (`scripts/eval-lint.ts:44`) | pydantic's default (`extra="ignore"`) | — |
| Default value | `.default([])` | `Field(default_factory=list)`, never `= []` | `gold.py:48` |
| Parse or throw | `schema.parse(raw)` | `Model.model_validate(raw)` | `gold.py:96` |
| Type alias | `type RankedUnits = …` | `RankedUnits = Sequence[frozenset[str]]` | `metrics.py:30` |
| Lazy annotations | *(always erased)* | `from __future__ import annotations` | every module, line ~13–26 |
| Abstract collection types | `ReadonlyArray<T>`, `Iterable<T>` | `collections.abc.Sequence`, `Iterable`, `Iterator` | `hashing.py:21` |

> **Why `Field(default_factory=list)` and not `= []`?** In a plain function, a
> default value is evaluated once, when the `def` runs, so `def f(x=[])` shares
> one list across every call. JS evaluates default parameters on each call.
> This is the classic Python trap. A `@dataclass` refuses `= []` outright.
> Pydantic happens to copy defaults, so `= []` would work there, but the
> factory states the intent and is the habit that is safe everywhere.

## Syntax

| Concept | TypeScript | Python | First seen in |
|---|---|---|---|
| Template literal | `` `${a}:${b}` `` | `f"{a}:{b}"` | `hashing.py:35` |
| Debug-quote a value | `JSON.stringify(id)` | `f"{id!r}"` (uses `repr`) | `gold.py:85` |
| Nullish fallback | `x ?? ""` | `x if x is not None else ""` | `hashing.py:66` |
| Ternary | `c ? a : b` | `a if c else b` | `metrics.py:54` |
| Arrow function | `(d) => d.key` | `lambda d: d.key` | `hashing.py:91` |
| Sort by key | `arr.sort((a, b) => a.localeCompare(b))` | `sorted(arr, key=…)` (returns a new list) | `hashing.py:91` |
| First *k* | `arr.slice(0, k)` | `arr[:k]` | `metrics.py:39` |
| Index + value, 1-based | `arr.forEach((x, i) => …i + 1…)` | `enumerate(arr, start=1)` | `metrics.py:82` |
| Generator | `function*` + `yield` | a `def` containing `yield`, typed `Iterator[T]` | `gold.py:90` |
| Map/filter/flatMap | `.flatMap(q => q.units.map(…))` | comprehension `{… for q in qs for l in q.units}` | `gold.py:113` |
| Private by convention | not exported | leading underscore: `_covered`, `_load_each` | `metrics.py:34` |
| Doc comment | JSDoc `/** … */` | docstring `"""…"""` as the first statement | every function |
| Raw string | `String.raw` | `r"""…"""`, so `\t` stays literal in the docstring | `hashing.py:48` |
| Variadic args | `(...groups: string[])` | `(*groups: str)` | `tests/test_metrics.py:20` |
| Script entry point | module-scope `main()` call | `if __name__ == "__main__":` | 📐 `bakeoff.py` |

> **The entry-point row matters here.** `scripts/ingest/main.ts` calls `main()`
> at module scope, so nothing in it could be imported by a test. That is how
> the `--dryrun` bug hid ([war story 4](../10-war-stories.md#4----dryrun-wrote-to-the-database)).
> Python's `if __name__ == "__main__":` runs `main()` only when the file is
> executed, never when it is imported, so the same file stays testable.

## Sets: the part JS doesn't have

| Operation | TypeScript | Python | First seen in |
|---|---|---|---|
| Immutable set | `ReadonlySet<string>` | `frozenset[str]` (hashable, so it can sit inside other sets) | `metrics.py:30` |
| Union in place | `for (x of b) a.add(x)` | `a \|= b` | `metrics.py:40` |
| Intersection is non-empty | `[...a].some(x => b.has(x))` | `a & b` (an empty set is falsy) | `metrics.py:54` |
| Subset | `[...a].every(x => b.has(x))` | `a <= b` | `metrics.py:67` |

## Errors

| Concept | TypeScript | Python | First seen in |
|---|---|---|---|
| Throw | `throw new Error(msg)` | `raise ValueError(msg)`, choosing a specific built-in class | `metrics.py:37` |
| Wrap with cause | `new Error(msg, { cause: e })` | `raise ValueError(msg) from e` | `gold.py:101` |
| Catch | `try { } catch (e) { }` | `try: … except ValidationError as e:` | `gold.py:95` |

## Bytes and hashing

| Concept | TypeScript | Python | First seen in |
|---|---|---|---|
| sha256 | `createHash("sha256")` (`lib/corpus/hash.ts:55`) | `hashlib.sha256()` | `hashing.py:64` |
| String to bytes | implicit UTF-8 in `hash.update(str)` | explicit `.encode()` (UTF-8 by default) | `hashing.py:67` |
| Hex digest | `.digest("hex")` | `.hexdigest()` | `hashing.py:98` |

## Resources, environment and the database

| Concept | TypeScript | Python | First seen in |
|---|---|---|---|
| Scoped resource | `try { … } finally { x.close() }` | `with conn.cursor() as cursor:` — a context manager | `db.py:271` |
| Type-only import | `import type { X }` (erased) | `if TYPE_CHECKING:` + `from __future__ import annotations` | `db.py:34` |
| Optional dependency | `await import("x")` inside a branch | `import psycopg` inside the function body | `db.py:259` |
| Env var | `process.env.DB_URL` | `os.environ.get("DB_URL")` — returns `None`, never raises | `db.py:241` |
| Keyword-only argument | an options object `f({ remote: true })` | a bare `*` in the signature: `def f(*, remote: bool)` | `db.py:227` |
| Get or create | `m.get(k) ?? m.set(k, new Set()).get(k)` | `d.setdefault(k, set()).add(v)` | `db.py:125` |
| Derived field | a getter | `@property` | `db.py:84` |
| Parse a URL | `new URL(u).hostname` | `urlparse(u).hostname` | `db.py:224` |
| Rows affected | `count` from the client | `cursor.rowcount` | `db.py:415` |

## Enums, immutable updates and measurement

| Concept | TypeScript | Python | First seen in |
|---|---|---|---|
| Enum | a string union, or `enum` | `class Serving(Enum)`, compared with `is` | `candidates.py:32` |
| Registry of constants | exported `const` objects | module-level frozen dataclass instances | `candidates.py:120` |
| Immutable sequence type | `readonly Candidate[]` | `tuple[Candidate, ...]` | `candidates.py:172` |
| Strict pairwise iteration | no equivalent — `zip` truncates silently in both | `zip(a, b, strict=True)` raises on a length mismatch | `preflight.py:79` |
| Immutable update | `{ ...result, exported: true }` | `result.model_copy(update={...})` (pydantic) | `preflight.py` |
| Counter | `m.set(k, (m.get(k) ?? 0) + 1)` | `d[k] = d.get(k, 0) + 1` | `candidates.py:248` |
| Monotonic clock | `performance.now()` | `time.perf_counter()` | `preflight.py` |
| Recursive glob | `fs.readdir(…, {recursive:true})` | `Path.rglob("*")` | `preflight.py:140` |
| Exit code from main | `process.exit(n)` | `raise SystemExit(main())` | `preflight.py` |

## Testing

| Concept | Vitest | pytest | First seen in |
|---|---|---|---|
| Assertion | `expect(a).toBe(b)` | plain `assert a == b` (pytest rewrites it to show both sides) | `tests/test_metrics.py` |
| Float compare | `toBeCloseTo` | `pytest.approx` | `tests/test_metrics.py:94` |
| Expect a throw | `expect(() => f()).toThrow(/re/)` | `with pytest.raises(E, match="re"):` | `tests/test_gold.py:119` |
| Table-driven test | `it.each([...])` | `@pytest.mark.parametrize` | `tests/test_hashing.py:86` |
| Shared setup | `beforeAll` | `@pytest.fixture(scope="module")`, injected by parameter name | `tests/test_gold.py:20` |
| Temp directory | `mkdtemp` + cleanup | the `tmp_path` fixture | `tests/test_gold.py:100` |

## Traps that cross the language boundary

| Trap | What happens | Where |
|---|---|---|
| **Sort order** | `localeCompare` is ICU collation, while Python's `sorted()` is code-point order. They agree for lowercase ASCII keys only. An uppercase or accented source id would give two different corpus hashes for one corpus. | `hashing.py:72`, `tests/test_hashing.py:126` |
| **`None` in an f-string** | `f"{None}"` is `"None"`, and JS `` `${null}` `` is `"null"`. Neither is `""`, which is what the hash needs. | `hashing.py:66` |
| **Unknown keys** | `eval-lint.ts` reads the gold set loosely and `gold.py` strictly. A typo'd key is caught by pytest in CI, not by `eval:lint`. | `scripts/eval-lint.ts:44`, `gold.py:42` |
| **Mutable defaults** | `def f(x=[])` shares one list across every call, where JS would create a fresh one | see the note under *Types* |
| **`zip` truncates** | `zip([1,2,3], [1,2])` yields two pairs and raises nothing. Comparing a 768-dim export against a 1024-dim reference returns a plausible cosine. `strict=True` is the fix. | `preflight.py:79`, `tests/test_preflight.py:59` |
| **`ru_maxrss` units** | bytes on macOS, kilobytes on Linux. The raw number makes a Mac look 1,024 times hungrier than a CI runner, and nobody notices the unit. | `preflight.py:143` |
