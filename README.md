# Apologia

Source-grounded answers to questions of Catholic apologetics, theology and
philosophy — in Hungarian and English.

The design commitment: every claim will be traced to a specific, canonically
addressable passage (CCC §1730, *Summa* I q.2 a.3, Jn 1:1–14), every citation
**checked mechanically** before anyone sees it, and every answer **published by
a human**.

It is a research aid that shows its work. It is not catechesis, not spiritual
direction, and not the Magisterium.

> **What exists today is not the whole of that.** The corpus is ingested and
> the measurement harness runs; **the query path does not, so nobody can ask a
> question yet.** This page marks each piece ■ built or ░ planned, and
> [`docs/guide/status.md`](docs/guide/status.md) is the only place the detail
> is kept — where the two disagree, status.md is right.

## Why this repository might be worth reading

It is an attempt to show how a **production-oriented** AI application is
designed, rather than how quickly one can be assembled. The interesting parts
are the decisions, and they are written down:

- **[docs/guide/](docs/guide/README.md)** — the human layer: eleven short
  chapters that summarise the system and link down into the detail. Start at
  [11 — questions a reviewer asks](docs/guide/11-questions-a-reviewer-asks.md)
  if you are here to judge the engineering.
- **[docs/adr/](docs/adr/)** — every meaningful decision, including the ones
  that went *against* the more impressive-looking option, and the trade-offs
  each one accepted.
- **[docs/architecture.md](docs/architecture.md)** — the shape, and the one idea
  the rest follows from.
- **[docs/evaluation.md](docs/evaluation.md)** — what "better retrieval" is
  allowed to mean here, written before the retriever, with a release rule.
- **[docs/corpus.md](docs/corpus.md)** — why one chunking strategy for the whole
  corpus would be wrong, and where the licensing asymmetry between English and
  Hungarian sources actually is (not where you would expect).
- **[ADR-014](docs/adr/014-translation-and-quotation.md)** — why the system
  answers in Hungarian but will not translate a quotation, and how that is
  enforced by a string comparison rather than by asking the model nicely.
- **[ADR-011](docs/adr/011-semantic-layer-preregistration.md)** — a
  pre-registered experiment, with hypotheses, a kill criterion, and a prediction
  recorded before the result is known.
- **[docs/guide/10-war-stories.md](docs/guide/10-war-stories.md)** — the bugs
  that passed every check while being wrong, and what each one changed.

A few things it deliberately does **not** do: no dedicated vector database, no
queue, no streaming, no agent framework. Each of those is a decision with an ADR
behind it, not an oversight.

## Architecture in one diagram

`■` built · `░` not built yet — the detail, and what is next, is in
[status.md](docs/guide/status.md).

```
  ┌─────────────────────────────────────────────────────────────────┐
  │ ■ ingestion — an offline CLI, never runs in a request (ADR-004) │
  │                                                                 │
  │   corpus/sources.yaml ──▶ fetch ──▶ parse ──▶ citable units     │
  │   (a manifest, not text)      └──▶ chunk per strategy ──▶ upsert│
  └────────────────────────────────┬────────────────────────────────┘
                                   ▼
                         ■ Postgres + pgvector
                                   │
           ┌───────────────────────┴────────────────────────┐
           ▼                                                ▼
  ┌──────────────────────────────┐   ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
  │ measurement — offline,       │   ┊ ░ query path (guide 06)        ┊
  │ Python only (ADR-023)        │   ┊                                ┊
  │                              │   ┊   question ──▶ validate ──▶    ┊
  │  ■ servability pre-flight    │   ┊   rate limit ──▶ retrieve ──▶  ┊
  │  ░ bake-off ──▶ ░ score      │   ┊   compose context ──▶ generate ┊
  │         │                    │   ┊          │                     ┊
  │         ▼                    │   ┊          ▼                     ┊
  │  ░ ADR-008 decided by number │   ┊   ▸ VERIFY CITATIONS ◂ ──▶ draft┊
  └──────────────────────────────┘   └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄│┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
                                                       ▼
                                      ░ human review ──▶ published
                                                       ▼
                                      ░ /hu/kerdes/<slug>  (permanent, cited)
```

The citation gate is the exception worth naming: `lib/citation/verify.ts` is
**built and unit tested, and wired to nothing** — it exists before the path it
guards. The rule it enforces, that the whole answer is generated and checked
before any of it is shown (and therefore that v1 does not stream), is
[ADR-005](docs/adr/005-verify-then-display.md).

## Getting started

```bash
npm install
cp .env.example .env.local     # fill in Supabase + provider keys
npx supabase db push           # or paste supabase/migrations/* into the SQL editor
npm run dev
```

**What you will see:** the template's landing page and, once you add yourself to
`admin_users`, an admin dashboard at `/dashboard` showing your email and role.
Both are real and guarded — the proxy checks the allowlist and every Server
Action re-checks it — but neither is an Apologia screen yet. There is no
question box. The interesting work today is at the command line, below.

**The corpus is not in this repository**, by design — see
[ADR-003](docs/adr/003-ship-manifests-not-corpus.md). `corpus/sources.yaml`
describes each source and how to obtain it; the ingestion CLI fetches and
indexes it locally.

## Commands

Working today:

| | |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | production build |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | type-check (also runs on `git push`) |
| `npm test` | Vitest — the deterministic suite (also runs on `git push`) |
| `npm run test:integration` | Vitest against an ephemeral local Supabase stack |
| `npm run test:e2e` | Playwright against an ephemeral local Supabase stack |
| `npm run ingest` | ingest a source — see below |
| `npm run eval:lint` | resolve every gold-set locator against ingested text |
| `npm run eval:preflight` | can a candidate embedding model be served at all — see below |
| `npm run docs:lint` | check the docs' structure: ADR TL;DRs and index, Python walkthrough, relative links (also on `git push`) |

Not written yet — listed so their absence is visible, not to imply they run:

| | |
|---|---|
| `npm run eval` | score the gold set and write a report. Waits on the bake-off. |

### Ingesting the corpus

```bash
npm run ingest -- --source=ccc --language=hu --dry-run   # fetch, parse, assert only
npm run ingest -- --source=ccc --language=hu             # …and write
```

| Flag | |
|---|---|
| `--dry-run` | fetch, parse and assert; touch no database |
| `--refetch` | bypass `.corpus-cache/` and re-download every page |
| `--remote` | permit writing to a non-local Supabase target |

The run is **idempotent** (an unchanged corpus writes nothing), **cached**
(pages are re-fetched only with `--refetch`), and **resumable** (an interrupted
run leaves a document the next run sweeps). It writes `corpus/manifest.lock.yaml`
— which is committed, and carries hashes and counts but no corpus text (ADR-003).

⚠️ `--remote` exists because the CLI has no localhost hard-guard, deliberately:
ingesting into the cloud project is a legitimate operator action. It just has to
be *chosen* rather than inherited from whatever `.env.local` happens to hold.

### Measuring — the Python harness

Python lives in [`harness/`](harness/README.md) and nowhere else, under a rule
that has to be stated to be enforceable: it is permitted where the deliverable
is *a measurement or the model that produced it*
([ADR-023](docs/adr/023-python-at-the-measurement-boundary.md)). Nothing here
runs in a request.

The harness exists to settle **ADR-008 — which embedding model** — by
measurement rather than by reputation. The order is deliberate:

```bash
npm run eval:preflight -- <model-id>   # ■ can this candidate be served?
                                       # ░ bakeoff.py — embed the corpus, per candidate
                                       # ░ score.py   — score the gold set, with CIs
```

The pre-flight runs **first**, before any candidate embeds a corpus, because a
model that wins a bake-off and then cannot be served has cost hours to discover.
It already paid for itself: one of the three candidates reproduces itself at
cosine 1.00000 unquantized and falls apart under int8, which would otherwise
have entered the bake-off and produced plausible, meaningless numbers. The
measured baseline is committed at `eval/reports/preflight.json`; the reading of
it is in [status.md](docs/guide/status.md) and
[guide 07](docs/guide/07-measurement.md).

The gold set it scores against is ten hand-written questions in
[`eval/`](eval/README.md) — not generated by a model, and deliberately small
enough that the harness reports the sample size that *would* separate two
candidates rather than pretending the current one does.

Coming from TypeScript and new to Python? The guide has a
[learning path, a TS ↔ Python vocabulary, and a walkthrough of every module](docs/guide/python/README.md).

## Secrets

No credentials are committed. `.env.example` documents every variable by name.
The Supabase service role key is needed only by an operator running the CLI or
`eval:lint`, never by the deployed app — a side effect of
[ADR-004](docs/adr/004-offline-ingestion-cli.md), and a welcome one. The
embedding key is not so contained: the query path must embed the question at
request time with the same model that embedded the corpus
([ADR-023](docs/adr/023-python-at-the-measurement-boundary.md) corrects
ADR-004 on this).

## Provenance

Scaffolded from a private Next.js + Supabase starter template, which supplied
the admin auth (proxy guard + `requireAdmin()` double guard), the Supabase
client factories, the deny-by-default privilege model, the copy layer, and the
Playwright + local-Supabase CI harness. The landing page and dashboard you see
on `npm run dev` are still the template's.

Three things diverged, and each has an ADR rather than a note:

- **`lib/rate-limit.ts` was inverted from fail-open to fail-closed.** The
  template protects contact forms, where losing an enquiry is the expensive
  outcome; here the expensive outcome is an unbounded bill. Same code, opposite
  correct answer — [ADR-009](docs/adr/009-fail-closed-rate-limiting.md).
- **Locale became per-request.** The template picks one language at build time;
  Apologia serves `/hu/…` and `/en/…` from one deployment —
  [ADR-013](docs/adr/013-per-request-locale.md).
- **The theme registry and the transactional email module were removed**, with
  their dependencies, along with the confirmation-token, ICS and
  example-validator modules. What each was replaced by is in
  [CLAUDE.md](CLAUDE.md#what-the-template-left-that-this-project-does-not-have).

## Licence

MIT for the code. The corpus is not covered — each source carries its own terms,
recorded in `corpus/sources.yaml`.
