# Architecture

> **Wanting the shape rather than the argument? Read
> [the guide](guide/README.md) instead** — eleven chapters of about three
> minutes each, with the diagrams. This file is the layer beneath it: it exists
> to be exhaustive, states every rejected alternative, and is written for
> someone auditing a decision rather than meeting it. Where the two disagree,
> this file is right and the guide is the bug.

> Status lives in [guide/status.md](guide/status.md), and only there. Sections
> here marked *(built)* or *(planned)* say which half of the shape they describe;
> *(planned)* sections are the contract the remaining work implements against.
> This file is kept honest in both directions: if it claims something exists,
> it exists, and if it claims something is missing, it is.

> **TL;DR**
> - A research aid that answers **from a curated corpus**, where every citation
>   in an answer is checked mechanically before display. That check is built
>   (`lib/citation/verify.ts`); the path that would run it is not.
> - The atom is the **citable unit**, a passage with a canonical address
>   (`ccc:1730`). That is what makes a citation verifiable (ADR-002).
> - **Two processes**: an offline ingestion CLI *(built)* and a query path
>   *(planned)* whose centre is a deterministic citation gate.
> - **Translate the explanation, never the quotation**. A quoted span must match
>   its unit byte for byte (ADR-014).
> - Deterministic parts are unit tested; probabilistic parts are measured on a
>   gold set. The diagrams for all of this are in [the guide](guide/README.md).

## What this is

Apologia answers questions about Catholic apologetics, theology, philosophy,
history and their intersection with science, **from a curated corpus rather than
from a language model's memory**. Every claim carries a citation to a specific,
addressable passage in a real source, and no citation reaches a reader
unchecked: the check is deterministic code, it runs before display, and an
answer that fails it does not become a draft.

**That paragraph is the contract this repository is built to, not a report on a
running system.** The corpus behind it is ingested and the gate that enforces
it is written and tested; the query path between the two is §2 and does not
exist yet. Every claim below carries *(built)* or *(planned)* for that reason,
and [guide/status.md](guide/status.md) settles any disagreement.

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
   score (ADR-005). What that means concretely is the next section.
3. **Cross-lingual retrieval gets an alignment key** — CCC §1730 is §1730 in
   Hungarian and in English, so the same unit exists in both languages under one
   identifier (ADR-007). This used to say *free*. What is free is the
   **numbering**; unit *identity* additionally requires that both documents
   descend from the same revision of the work, which is a property of the fetch
   and has to be established. ADR-019 is where that was paid for, and §2267 is
   why.

## What "checked mechanically" means

Every rule the gate applies is decidable by code over fixed input:

```
every cited locator resolves to a real unit           — else drop the citation
every cited locator was in the supplied context       — else drop the citation
every claim-bearing sentence retains ≥1 citation      — else the answer fails
every quoted span matches its unit's text byte-exact  — else the answer fails
```

No judge model, no threshold, nothing to tune. The usual alternative is to ask
a second model whether a citation *looks* supported and receive `0.87` back — a
number that then needs a cutoff, and a cutoff is a dial someone moves until the
demo passes. This has no dial. The citation is dropped, or the answer never
becomes a draft.

Two properties are easy to miss and are the reason this is stronger than it
sounds:

- **The supplied context is the universe.** A locator that exists in the corpus
  but was not handed to the model counts as fabricated. The model cannot have
  been reading something it was never given, so resolving against the database
  instead would let a lucky guess pass as scholarship.
- **The comparison is byte-exact and unforgiving.** A curly apostrophe against
  a straight one fails. That is the correct direction to fail in: a lenient
  comparison is one that can be talked into accepting a quotation the source
  never wrote. All tolerance is spent once, at ingestion, on both sides — never
  in the gate.

This is `lib/citation/verify.ts`. It is **built and exhaustively unit tested,
and wired to nothing** — it exists ahead of the path it guards, which is §2
(ADR-005, ADR-014, ADR-017).

## Shape

Two processes. The split matters: **ingestion is not a web concern.**

### 1. Ingestion — an offline CLI *(built)*

```
source manifest (checked in)
  → fetch          content-addressed, hash-verified; revisions must agree
  → parse          per source type, into citable units with canonical
                   locators. Text is normalised here — once, permanently
  → assert         locator signals agree · sequence increases · count matches
  → chunk          per-strategy, aligned to unit boundaries
  → hash           over the normalised units, not the fetched HTML
  → cross-lingual  a sibling language's locators must match, before any write
  → upsert         write-or-replace (update + insert); idempotent, resumable
  → emit           corpus manifest + hashes, committed

  embed            ✗ not a stage here, deliberately — see below
```

That is the order `scripts/ingest/main.ts` actually runs, which is the
authority: if this diagram and that file disagree, the file is right.
[guide/04](guide/04-ingestion.md) draws the same pipeline with the failure each
stage exists to catch, and is the better page to read first.

`hash` is what makes the upsert idempotent rather than merely repeatable: it
covers the normalised units (locator, role, text), so a re-fetch of a source
that has been re-themed but not re-worded produces the same hash and the run
stops at "unchanged". A single relabelled paragraph produces a different one.

Three of those stage names are opaque unless you already know them, so plainly:
**upsert** is `update` + `insert` — write the document, and if it is already
there replace it rather than add a second copy. **assert** is the check that
the parse is complete and correctly numbered; it is not a list of accepted
defects, which is a separate file it reads. **emit** writes an artefact:
`corpus/manifest.lock.yaml`, committed, carrying locators, hashes, counts and
provenance and not one word of corpus text (ADR-003). A retrieval number is
only interpretable against the corpus it was measured over, so
`docs/evaluation.md` requires every eval report to record the hash this step
produces — which turns "my local run disagrees with CI" from an invisible
problem into a visible one.

**`normalise` is part of `parse`, not a stage after it**, and the distinction
costs more than it looks. Normalisation operates on *characters* — footnote
markers stripped, NFC composition — and what it returns becomes the permanent
bytes of `units.text`. Chunking operates on *units* and groups them for
embedding. Changing the chunker invalidates nothing, because citations point at
units and never at chunks (ADR-002); changing the normaliser invalidates every
stored quotation, because the text each one was verified against no longer
exists. `lib/corpus/normalise.ts` carries that warning at the top of the file.

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
Hungarian and English, the Summa in Latin; the King James Version entry
declares no documents yet — with every declared erratum firing and nothing
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

**`cross-lingual` runs before anything is written, not after.** ADR-002 claims
a locator is a cross-lingual identity; this stage is where that stops being
prose. A new language's locators are compared against every sibling language
already in the corpus, and a mismatch aborts the run before a single row is
inserted. It runs against the corpus rather than the manifest, which also makes
it the agreement check `assert` cannot perform on a source that states each
paragraph number only once (ADR-020). On the first language of a source there
is nothing to compare — and it reports that as *nothing to compare*, not as a
pass, because the property belongs to a pair.

### 2. Query path — a route handler *(planned, Milestone 1)*

```
question                from anyone — the endpoint is public and anonymous
  → validate            Zod: length, language, shape
  → rate limit          fails CLOSED (lib/rate-limit.ts) + global daily budget
  → cache               already asked? serve or queue-note, and spend nothing
  → retrieve            pgvector cosine, top-k, metadata filters
  → compose context     build the LLM prompt: source-tier labels,
                        injection-hardened delimiters
  → generate            timeout + bounded retry + structured output
                        segments: claim(text, citations[]) | connective(text)
                                | quotation(locator, exact span)     ADR-018
  → VERIFY CITATIONS    ── deterministic hard gate ── lib/citation/verify.ts
                        every cited id exists ∧ was in the supplied context
                        every claim-bearing sentence carries ≥1 citation
                        every quoted span matches its unit's text EXACTLY
                        otherwise: drop the citation, or fail the answer.
                        Never silently pass.
  → persist             a DRAFT, readable by nobody, + citations
                        + the retrieval trace (never served; it is evidence)
  → review queue        a human publishes
  → /hu/kerdes/<slug>   permanent, indexable, cited
```

Answers are **drafts until a human publishes them**. Nothing reaches a permanent
URL unreviewed. That decision (ADR-006) is what makes the trust story survive a
hostile reader, and as a side effect it removes almost all of the cost and abuse
exposure that an anonymous public LLM endpoint would otherwise carry.

**Who calls this, and what they get back.** Anyone. The ask endpoint is public
and anonymous — what review withholds is the *answer*, not the *access*. The
caller receives a receipt, and the answer appears, if it appears, when a
reviewer publishes it. So this path is two paths wearing one name: a **write**
path that anyone can trigger and nobody can read, and a **read** path of
published pages that anyone can read and nobody can trigger.

**Why three cost controls and not one.** Review removes the abuse of
*consuming* model output — there is no free proxy here, because the caller
never sees the text. It does nothing about the cost of *producing* it: every
accepted request spends an embedding call and a generation call before a human
is involved at all, so ten thousand submitted questions buy ten thousand
generations and a queue nobody can work. Hence the limiter, which fails closed
because a limiter is disproportionately likely to be broken *because* someone
is hammering it (ADR-009); the daily budget, because a per-IP limit bounds one
caller and says nothing about the total; and `cache`.

**`cache` is a cost control, not a performance optimisation** — which is worth
stating because the word suggests otherwise, and because ADR-006 uses
*caching* for something else entirely (a published answer is a static page:
that is the read path). Here: the question is normalised and hashed against
`questions` (`0006`). A hit on a **published** answer serves it. A hit on an
existing **draft** says so — the question is already in the queue. Either way
nothing is embedded and nothing is generated. Only a genuinely novel question
reaches the expensive path, which is the same bet the whole design makes:
questions repeat, and a library is the right shape for that.

**`compose context` builds the LLM prompt**, and its two jobs are both
defensive. **Source-tier labels** ([ADR-010](adr/010-authority-tiers.md)) tell
the model that a Catechism paragraph outranks a contemporary apologist, because
the failure ADR-006 is most worried about is not a fabricated citation — it is
an answer that cites perfectly real passages and still presents a theologian's
opinion as binding teaching. No retrieval metric catches that. **Hardened
delimiters** keep the boundary explicit between trusted instruction and
untrusted material, and the untrusted material includes the question, which
arrived from an anonymous stranger.

**`generate` returns structure, not prose** ([ADR-018](adr/018-segmented-answers.md)).
The model emits typed segments — `claim` carrying its own citations,
`connective`, `quotation` — rather than paragraphs that something else then
annotates. That inversion is what makes the gate possible at all: deciding
which sentences *assert* something is the hard problem, and code cannot do it,
so the model marks its own claims and the gate checks the marks. The cost is
stated rather than hidden — the guarantee covers *marked* claims, so a claim
mislabelled as a `connective` passes, which is a measurable generator behaviour
instead of a silent hole.

**`persist` writes a draft, which is not a page.** A draft is not a slow page
or an unlisted one; it is invisible, enforced by the grant *and* the RLS policy
on `answers`. The permanent URL does not exist until a human acts. Persisted
alongside it is the **retrieval trace** — what was retrieved, with scores and
timings — which is never served to anyone and exists for measurement. That is
the quiet benefit in ADR-006: the review queue is also the data-collection
mechanism, and reviewed question/answer pairs are what the evaluation gold set
is short of.

## Two languages, one corpus

Apologia is **Hungarian-first** and answers in both languages — not for reach,
but because the corpus gives it no choice. The sources are unavoidably mixed:
the public-domain tier is overwhelmingly English, and the magisterial tier is
copyrighted in *every* language. So the language the product speaks and the
languages its sources exist in do not line up, and the gap has to be crossed
somewhere. Crossing it in the wrong place is what this section rules out.

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
domain where misattributed authority is the characteristic failure. So the
quotation rule in the gate's list above is there for this reason specifically:
**a quoted span must match its unit's text exactly.**

**Ingesting is not redistributing, and that distinction is what makes the
project lawful at all.** Full text goes into the index for retrieval; what comes
*out* is the locator, a link to the official edition, and our own prose.
Embedding into a private index is not publication, so restricted magisterial
sources can be used properly without a licence that was never going to be
granted. It is also why `units.text` carries no grants and never reaches a
browser — see [Privileges](#privileges) below, where the same argument is
enforced in Postgres rather than in prose.

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
| `topics` | the editorial spine: slug, part, a title and a blurb per language (ADR-016) | `0006` 📐 |
| `questions` | normalised text, hash, language, asked_at | `0006` 📐 |
| `answers` | `draft` \| `published`, body, model, prompt version, corpus hash, `topic_id` | `0006` 📐 |
| `answer_citations` | answer → unit, plus the verification result | `0006` 📐 |
| `retrieval_traces` | what was retrieved, scores, timings | `0006` 📐 |

**The Migration column names the file in `supabase/migrations/` that creates
the table** — `0005` is `0005_corpus.sql`. The number is here rather than a
plain "built" because those files carry their reasoning in SQL comments and are
the primary source for it; the row tells you which one to open. `0006` 📐 is a
plan, not a file: nothing on disk is numbered `0006` yet, and the tables may
well land split across more than one migration. What each will hold is settled;
where it lands is not.

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

**A topic's `blurb` is a couple of paragraphs of our own framing**, written by
a person, and ADR-016 makes it carry more weight than a column list suggests:
it is the *only* prose on a topic page that is not a published answer. `part`
is the grouping above a topic, so the spine is two levels deep and no deeper.
The table is hand-written and about twenty rows — the point of it is
findability, not content, and a topic page is **empty at launch by design**,
filling as answers are reviewed. Note what is absent: there is no `unit_topics`
table and no topic column on `units`. **The corpus is not topicked at all**,
because retrieval already does that work semantically and a hand-labelled
corpus is a year of domain work that would go stale.

### Privileges

`anon` and `authenticated` hold **nothing** by default. Both are revoked on
every existing table and on future ones, so adding a table and forgetting it
leaves that table unreachable rather than exposed — the failure lands on the
safe side. Privileges are granted back one table at a time in
`supabase/migrations/0004_schema_grants.sql`.

**Grants and RLS are two layers and both are needed.** A grant says a role may
touch a table at all; a policy says which rows. A grant with no policy exposes
nothing once RLS is on — but a policy with no grant fails with `permission
denied for table …`, which reads like an API-key problem and is not.

| Role | Holds today | Why |
|---|---|---|
| `anon` | `select, insert on rate_limit_log` | the limiter runs on the anon client from a public route: count recent rows, insert one. No update, no delete |
| `authenticated` | `select on admin_users` | the allowlist check in `proxy.ts` and `lib/auth.ts` |
| `service_role` | everything, and bypasses RLS | server-only clients; never reaches a browser |
| everything else | **nothing** | the corpus tables carry zero grants *and* RLS enabled with no policies — two independent layers, and the end state rather than an unfinished step |

When `answers` lands (`0006` 📐) the public read path gets the same treatment
twice over: `grant select on answers to anon`, paired with an RLS policy of
`status = 'published'`, so two independent layers say *the public sees
published answers and nothing else*.

**A public endpoint is not a database privilege**, and the query path is where
that distinction earns its keep. Anyone may post a question — the ask endpoint
is anonymous (§2) — but `anon` will never hold `insert on questions`. The route
handler runs server-side and writes the question, the draft, its citations and
the retrieval trace with the **service client**. What an anonymous caller can
reach over HTTP and what the `anon` role can reach in Postgres are two
different questions, and the answer to the second is: one table, the rate
limiter's own log.

That is load-bearing rather than incidental. Because the grant does not exist,
an abusive caller cannot skip the limiter by writing through PostgREST
directly. The route handler is the only door, and it checks the limiter before
it spends anything.

## Two kinds of correctness

The repo draws a line through the middle of the system, and it is worth stating
plainly because it decides how each part is tested:

| | Deterministic | Probabilistic |
|---|---|---|
| **What** | parsers, chunkers, locator resolution, citation verification, rate limiting, auth | retrieval ranking, generated prose, groundedness, refusal behaviour |
| **How it's checked** | **asserted** — Vitest, pytest, or a real Postgres, by what the test must touch. A failure is a *bug* | **measured** — the eval harness on a gold set. A change is a *number that moved* |
| **Standard** | must be exactly right | must be measurably better than the last baseline |

The line runs through the model call itself: the prose it returns is never
asserted, while the schema parsing, the timeout and retry, and the verification
gate around it are ordinary deterministic code. Which layer a given test belongs
in is decided by that same axis and not by stack position; see
[ADR-015](adr/015-testing-strategy.md). Components, route handlers and Server
Actions deliberately get no unit tests.

**"Deterministic" does not mean "unit test".** The left column has three
runners of its own, and which one a test lands in follows from what it must
touch, not from what it is testing:

| | Runner | For |
|---|---|---|
| pure, TypeScript | Vitest, `npm test` | parsers, chunkers, the citation gate |
| pure, Python | pytest | the harness's metrics and hashing |
| crosses Postgres | Vitest + local stack, `npm run test:integration` | behaviour that only exists in the database |

That third row is the one people forget, and it is not a convenience. Some
deterministic rules are enforced *by Postgres* and are unrepresentable in
TypeScript: `integration/corpus-upsert.test.ts` exercises the partial unique
index that makes two current documents impossible, and the crashed-run
signature (`is_current = false, unit_count = 0`) that the next run sweeps.
Both are exactly deterministic and neither can be reached without a database.
`integration/corpus-text-probes.test.ts` is the other case — it searches the
*stored* text for leftover markup, which the assertions cannot see because they
check the corpus's shape rather than its content. Playwright is the fourth
runner, for a user-visible flow. The routing table is in
[TESTING.md](../TESTING.md).

**The gold set is not another test layer.** It never returns pass or fail — it
returns numbers, read against a baseline rather than asserted. The one
deterministic thing beside it is `npm run eval:lint`, which resolves every
locator a gold question expects against ingested units: a gold set that points
at a paragraph which does not exist is a *bug*, while a low `recall@k` is a
*measurement*. An unverified gold set produces confident, meaningless numbers,
which is why that check exists at all.

Confusing the two is the most common failure in RAG codebases: teams write no
tests because "it's AI, it's non-deterministic", when in fact most of the system
is perfectly deterministic and perfectly testable. Citation verification in
particular is pure logic, and it is the single most important correctness
property in the product.

See `docs/evaluation.md` for the metric definitions and the release rule.

## Decision records

Every meaningful decision is in `docs/adr/`. Start with
[ADR-002](adr/002-citable-unit-model.md) — it is the one the rest hang off.
