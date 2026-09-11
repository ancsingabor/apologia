# Architecture

> Status lives in [guide/status.md](guide/status.md), and only there. Sections
> here marked *(built)* or *(planned)* say which half of the shape they describe;
> *(planned)* sections are the contract the remaining work implements against.
> This file is kept honest in both directions: if it claims something exists,
> it exists, and if it claims something is missing, it is.

## What this is

Apologia answers questions about Catholic apologetics, theology, philosophy,
history and their intersection with science, **from a curated corpus rather than
from a language model's memory**. Every claim carries a citation to a specific,
addressable passage in a real source, and the citation is checked mechanically
before a reader ever sees it.

It is not catechesis, not spiritual direction, and not the Magisterium. It is a
research aid that shows its work.

## The one idea everything else follows from

> **The atomic unit of the corpus is not "a chunk". It is a *citable unit*.**

Catholic sources have stable canonical addresses that predate this project by
centuries and will outlive it:

| Source | Locator | Example |
|---|---|---|
| Catechism of the Catholic Church | paragraph § | `ccc:1730` |
| Summa Theologiae | part / question / article | `summa:I.q2.a3` |
| Encyclicals & conciliar documents | section § | `fides-et-ratio:43` |
| Scripture | book chapter:verse | `bible:jn:1:1-14` |

Because those addresses exist, a citation is a **verifiable fact**, not a
plausible-looking string. The system can check that a cited locator resolves to
a real unit, and that the unit was actually in the context the model was given.
Most RAG systems can only ask a judge model whether a citation "looks
supported". This one can prove it.

Three consequences run through the whole design:

1. **Chunking aligns to citation boundaries** wherever the source has them —
   which is why one chunking strategy for the whole corpus would be wrong.
   The Summa's article structure, the CCC's numbered paragraphs, and a modern
   apologetics essay's prose are three different problems (ADR-002).
2. **Citation verification is deterministic**, and it is a hard gate, not a
   score (ADR-005).
3. **Cross-lingual retrieval gets an alignment key** — CCC §1730 is §1730 in
   Hungarian and in English, so the same unit exists in both languages under one
   identifier (ADR-007). This used to say *free*. What is free is the
   **numbering**; unit *identity* additionally requires that both documents
   descend from the same revision of the work, which is a property of the fetch
   and has to be established. ADR-019 is where that was paid for, and §2267 is
   why.

## Shape

Two processes. The split matters: **ingestion is not a web concern.**

### 1. Ingestion — an offline CLI *(built)*

```
source manifest (checked in)
  → fetch        content-addressed, hash-verified; revisions must agree
  → parse        per source type
  → assert       locator signals agree · sequence increases · count matches
  → normalise    into citable units with canonical locators
  → chunk        per-strategy, aligned to unit boundaries
  → embed
  → upsert       idempotent, resumable
  → emit         corpus manifest + hashes
```

Runs as `npm run ingest -- --source=ccc --language=hu` on a laptop or in CI. It
is never imported by `next build` and never runs in a request. The repo ships
the *manifest and the pipeline*, never the corpus text (ADR-003, ADR-004).

The pure stages live in `lib/corpus/` and are unit tested; the network, the
filesystem and Postgres live in `scripts/ingest/`. `embed` is deliberately
absent — `chunk_embeddings` is keyed by (chunk, model) so that embedding is a
separate pass run once per candidate, which is what "ADR-008 is decided by
measurement" has to mean concretely. Wiring one provider into the ingest would
settle that question by accident.

**Every document the manifest declares is ingested** — the Catechism in
Hungarian and English, the Summa in Latin; the KJV entry declares no documents
yet — with every declared erratum firing and nothing
undeclared, and `npm run eval:lint` resolves every gold-set locator. What is
*not* done is every embedding. Counts and hashes are in
`corpus/manifest.lock.yaml`; the current state is in
[guide/status.md](guide/status.md).

**`assert` is a step, not a flag.** Real web editions of canonical texts carry
typesetting defects, and a parser that meets them and loosens its rules has
discarded the property the corpus is built on. Each source declares its expected
unit count and its known defects (`corpus/errata/`); an *undeclared* failure stops
the ingest. `fetch` additionally refuses a multilingual source whose languages
descend from different revisions of the work — a divergence nothing downstream can
detect, because the locators still resolve and the citations still verify
(ADR-019, docs/corpus.md § Revision drift).

### 2. Query path — a route handler *(planned, Milestone 1)*

```
question
  → validate            Zod: length, language, shape
  → rate limit          fails CLOSED (lib/rate-limit.ts) + global daily budget
  → cache               lookup by normalised question hash
  → retrieve            pgvector cosine, top-k, metadata filters
  → compose context     source-tier labels, injection-hardened delimiters
  → generate            timeout + bounded retry + structured output
                        segments: claim(text, citations[]) | connective(text)
                                | quotation(locator, exact span)     ADR-018
  → VERIFY CITATIONS    ── deterministic hard gate ── lib/citation/verify.ts
                        every cited id exists ∧ was in the supplied context
                        every claim-bearing sentence carries ≥1 citation
                        every quoted span matches its unit's text EXACTLY
                        otherwise: drop the citation, or fail the answer.
                        Never silently pass.
  → persist             draft answer + citations + retrieval trace
  → review queue        a human publishes
  → /hu/kerdes/<slug>   permanent, indexable, cited
```

Answers are **drafts until a human publishes them**. Nothing reaches a permanent
URL unreviewed. That decision (ADR-006) is what makes the trust story survive a
hostile reader, and as a side effect it removes almost all of the cost and abuse
exposure that an anonymous public LLM endpoint would otherwise carry.

## Two languages, one corpus

Apologia answers in Hungarian and English over a corpus that is unavoidably
mixed — the public-domain tier is overwhelmingly English, while the magisterial
tier is copyrighted in *every* language.

The rule that makes this work, and the second-most load-bearing decision in the
system after the citable unit:

> **Translate the explanation. Never translate the quotation.**

The answer prose is ours, and generating it in Hungarian from English source
context is authorship, not translation. The quoted passage is not ours, and it is
shown only in a language in which an authoritative text exists — English, clearly
labelled, when no Hungarian edition exists.

Machine-translating a quotation would show the reader a sentence no source ever
wrote, attributed to a real locator, while the verification gate certified the
untranslated original. That is a fabricated quotation passing a green check, in a
domain where misattributed authority is the characteristic failure. So the gate
gains a third deterministic check: **a quoted span must match its unit's text
exactly.**

Full text is ingested for retrieval; what is *displayed* is the locator, a link
to the official edition, and our own prose. Embedding into a private index is not
redistribution — which is what lets restricted magisterial sources be used
properly without a licence that will never come.

See [ADR-014](adr/014-translation-and-quotation.md) and
[docs/corpus.md](corpus.md).

## Data model *(`0005` built and populated; `0006` planned)*

| Table | Holds | Migration |
|---|---|---|
| `sources` | work level: authority tier, author, license, canonical URL | `0005` |
| `documents` | a version of a source in one language, with a content hash | `0005` |
| `units` | **the citable unit**: locator, text, **language**, ordinal, parent, role | `0005` |
| `chunks` | text, strategy id, language | `0005` |
| `chunk_units` | chunk ↔ unit, n:m — a chunk may span units, a unit may split | `0005` |
| `chunk_embeddings` | one row per (chunk, model), so two candidates can be compared | `0005` |
| `topics` | the editorial spine: slug, part, titles, blurbs (ADR-016) | `0006` *(planned)* |
| `questions` | normalised text, hash, language, asked_at | `0006` *(planned)* |
| `answers` | `draft` \| `published`, body, model, prompt version, corpus hash, `topic_id` | `0006` *(planned)* |
| `answer_citations` | answer → unit, plus the verification result | `0006` *(planned)* |
| `retrieval_traces` | what was retrieved, scores, timings | `0006` *(planned)* |

Two things in `0005` are worth reading the migration for. **`chunk_embeddings` is
deliberately undimensioned and unindexed**: pgvector needs a fixed dimension to
build an index, and the dimension is a property of a model ADR-008 has not chosen
yet — settling it in a schema would decide by accident the question the milestone
exists to measure. At CCC scale (~2,865 paragraphs × 2 languages) an exact scan
is milliseconds and beats an approximate index anyway. And **`chunk_units` is
n:m on purpose**, because a short paragraph may share a chunk with its neighbour
while a long Summa article splits across several; a plain foreign key breaks in
one direction or the other, and that break is what pushes projects back to
fixed-window chunking.

The corpus tables carry **no grants at all** — not an omission, the product
decision. `units.text` holds restricted magisterial text, and the licensing
posture in ADR-003/ADR-014 rests on it never reaching a browser. `answers` is
the only table that gets `grant select to anon`, paired with an RLS policy of
`status = 'published'`.

`retrieval_traces` is not an afterthought: it is both the observability surface
and the substrate the evaluation harness scores against.

### Privileges

Inherited from the template and a good fit here. `anon` and `authenticated` are
revoked by default, including for future tables, and granted back per table.
The public read path is expressed twice over: `grant select on answers to anon`,
with an RLS policy of `status = 'published'`. Two independent layers say *the
public sees published answers and nothing else*. See
`supabase/migrations/0004_schema_grants.sql`.

## Two kinds of correctness

The repo draws a line through the middle of the system, and it is worth stating
plainly because it decides how each part is tested:

| | Deterministic | Probabilistic |
|---|---|---|
| **What** | parsers, chunkers, locator resolution, citation verification, rate limiting, auth | retrieval ranking, generated prose, groundedness, refusal behaviour |
| **How it's checked** | ordinary unit tests (Vitest) — a failure is a *bug* | the eval harness on a gold set — a change is a *number that moved* |
| **Standard** | must be exactly right | must be measurably better than the last baseline |

The line runs through the model call itself: the prose it returns is never
asserted, while the schema parsing, the timeout and retry, and the verification
gate around it are ordinary deterministic code. Which layer a given test belongs
in — Vitest, an integration test against a real Postgres, or Playwright — is
decided by that same axis and not by stack position; see
[ADR-015](adr/015-testing-strategy.md). Components, route handlers and Server
Actions deliberately get no unit tests.

Confusing the two is the most common failure in RAG codebases: teams write no
tests because "it's AI, it's non-deterministic", when in fact most of the system
is perfectly deterministic and perfectly testable. Citation verification in
particular is pure logic, and it is the single most important correctness
property in the product.

See `docs/evaluation.md` for the metric definitions and the release rule.

## Inherited from the template

Kept as-is: the `proxy.ts` admin guard plus the `requireAdmin()` double guard,
the three Supabase client factories, the deny-by-default grants model, the
Playwright + ephemeral local-Supabase harness, the CI gate, and the theming and
copy layers.

Changed on purpose:

- **`lib/rate-limit.ts` now fails closed.** The template limits contact forms,
  where losing a real enquiry costs more than accepting a duplicate. Here every
  accepted request spends money, and an outage of the limiter is exactly when an
  abusive caller is most likely to be the cause. ADR-009.
- **Locale is becoming per-request.** The template picks one language at build
  time; Apologia serves `/hu/...` and `/en/...` from one deployment. ADR-013.
- **`.env.example` is committed.** The template's `.gitignore` matched `.env*`
  with no exception, so its own example file was never actually in the repo — a
  real problem for a project whose setup instructions are the product.

Removed: the confirmation-token, ICS, and example-validator modules, and the
email-boundary policy (which governs client-owned mailboxes — Apologia has no
client). `lib/email/` is kept for one identified future use: notifying a
reviewer that drafts are waiting.

## Decision records

Every meaningful decision is in `docs/adr/`. Start with
[ADR-002](adr/002-citable-unit-model.md) — it is the one the rest hang off.
