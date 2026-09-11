# ADR-004 — Ingestion is an offline CLI

Status: **Accepted** · Milestone 0

> **TL;DR**
> - **Decision:** Ingestion is a standalone `tsx` CLI — idempotent, content-hashed, resumable — never a route, a cron or a queue.
> - **Because:** No user waits on it; a web job imports timeouts and an attack surface, a queue a second runtime, for a batch run perhaps a dozen times a year.
> - **Cost:** Ingestion is manual and single-process. (Its claim that the embedding key is operator-only is corrected by ADR-023.)

## Context

Ingestion fetches, parses, chunks, embeds and upserts the corpus. For the full
corpus it is a long job: minutes to hours, thousands of embedding calls, and
network I/O against sources of varying reliability. It runs when a source is
added or a chunking strategy changes — not on a schedule and never in response
to a user.

The app is a Next.js deployment on Vercel.

## Problem

Where does this pipeline live?

## Alternatives considered

1. **A route handler** (`/api/ingest`) triggered by an admin or a cron. Zero new
   infrastructure. But it inherits a function's execution limits, has no natural
   resumption, is awkward to run against a laptop's database, and puts a
   long-running batch job behind an HTTP request that must not time out.
2. **A queue plus workers.** The textbook answer for long-running work. Requires
   a queue, a worker runtime, and a deployment story for both — for a job that
   runs when a human decides to add a source.
3. **A plain CLI, run on demand.** `npm run ingest`. No runtime infrastructure.

## Decision

**A standalone CLI entry point**, run with `tsx`. It is never imported by
`next build` and never executes in a request. It runs on a laptop or in a CI job.

Properties it must have, because a long batch job without them is unusable:
**idempotent** (re-running changes nothing), **content-hashed** (unchanged
sources are skipped), and **resumable** (a failure at source 9 of 12 does not
redo the first 8).

## Reasoning

Ingestion is not a web concern, and modelling it as one imports every constraint
of the web tier — execution limits, request timeouts, cold starts, an HTTP
trigger surface that then has to be authenticated and rate-limited — in exchange
for nothing. The job has no user waiting on it.

The queue option is the more interesting rejection. Queues and workers earn
their operational cost when work arrives unpredictably, must survive process
death, or needs to scale horizontally. Ingestion here is none of those: it is a
human-initiated batch job that runs perhaps a dozen times a year. Introducing a
queue would demonstrate familiarity with the pattern while making the system
harder to run and understand — which is the specific failure mode this project
is meant to avoid.

The CLI form also keeps the pipeline *readable*, which matters for a repository
whose purpose includes being learned from. It is a sequence of functions with a
`main()`, not a distributed choreography.

## Consequences

- No ingestion infrastructure to deploy, secure, or pay for.
- The pipeline is directly testable: its stages are pure functions over fixtures.
- The `SUPABASE_SERVICE_ROLE_KEY` and the embedding API key are needed only by
  an operator running the CLI, never by the deployed application. This shrinks
  the runtime's secret surface, which is a security win that fell out of an
  architectural choice.
- A corpus refresh is a deliberate operator action with an artefact (the corpus
  manifest), not an invisible background process.

## Trade-offs

**Ingestion is manual.** Nobody is notified when an upstream source changes.
Acceptable for a corpus of historical documents; it would not be for a news
system. If it becomes a problem, a scheduled CI job running the same CLI is the
smallest possible fix — the decision does not paint us into a corner.

**No horizontal scale.** A full re-embed is bounded by one process and the
embedding provider's rate limits. At this corpus size that is minutes.

**Local and CI runs can diverge** if operators run different versions. The
corpus manifest hash recorded in each eval report is what makes such a
divergence visible rather than silent.
