# ADR-006 — Answers are drafts until a human publishes them

Status: **Accepted** · Milestone 0

> **TL;DR**
> - **Decision:** Every answer is a draft until a human publishes it at a permanent URL; the database itself keeps drafts non-public.
> - **Because:** Automation can check that an answer is grounded, only a reviewer that it is right — and there is no anonymous LLM endpoint left to abuse.
> - **Cost:** Throughput is bounded by one reviewer, and nobody gets an instant answer to a new question.

## Context

The obvious shape for this product is a question box that returns an answer: ask,
retrieve, generate, display. It is what users expect and the shortest path to
something demonstrable.

The subject matter is contested. Some readers arrive looking for an answer;
others arrive intending to show the system saying something false, heretical, or
absurd. The second group sets the quality bar.

## Problem

An answer generated and displayed in one step is published, by a machine,
without review, under the project's name — on a topic where being confidently
wrong is the characteristic failure.

Worse, no available metric catches the failure that matters most. Groundedness
is not orthodoxy. An answer can cite real passages, pass every verification
check, and still misrepresent the Church — most commonly by presenting a
theologian's opinion or an apologist's argument as binding teaching. Retrieval
quality does not fix this, and neither does a better prompt.

## Alternatives considered

1. **Live oracle.** Ask → answer, immediately. Familiar and simple. Unbounded
   LLM spend on an anonymous public endpoint, nothing accumulates, and no human
   sits between the model and a screenshot.
2. **Hybrid** — live answers, with good ones later promoted to permanent pages.
   Keeps instant UX and still accumulates a library, but carries *both* the
   abuse-and-cost problem and the review pipeline.
3. **Curated library.** Questions produce drafts; a reviewer publishes; published
   answers get permanent URLs.

## Decision

**A question produces a draft. A human publishes. Published answers are
permanent, addressable documents** at `/hu/kerdes/<slug>` and `/en/question/<slug>`.

`answers.status` is `draft | published`. The public read path is granted
`select` on `answers` with an RLS policy of `status = 'published'` — the
guarantee is enforced in the database, not only in application code.

## Reasoning

The human review step is the only control that addresses the actual failure
mode. Every automated guardrail in this system checks whether an answer is
*grounded*; none can check whether it is *right*. A reviewer with domain
knowledge can, and there is no substitute.

Four things then fall out, and their combined weight is what makes this the
better architecture rather than merely the safer one:

- **Cost and abuse containment mostly disappears.** The expensive path is
  reachable only by drafting, and drafts are reviewed before they matter. An
  anonymous public LLM endpoint — which reliably becomes someone's free API
  proxy — is simply not part of the product.
- **Caching is free and total.** A published answer is a static page. Repeat
  questions cost nothing.
- **The output is SEO-indexable**, which is how anyone finds a niche knowledge
  site at all.
- **A corpus of reviewed question/answer pairs accumulates** — which is the
  scarcest asset in the whole project, because it is exactly what the evaluation
  gold set needs.

The last point deserves emphasis: the review queue is not only a safety control,
it is the data-collection mechanism for evaluation.

## Consequences

- An admin review UI is required (`/dashboard`, behind the inherited auth).
  `ADMIN_ROUTES` in `proxy.ts` covers it.
- `answers` needs a status column, a slug, and publication metadata.
- The reviewer is the only person who waits on generation — which is what makes
  ADR-005's non-streaming decision cheap.
- The first person to ask a novel question does not get an immediate answer.
- Answers must record the model, prompt version, and corpus manifest hash they
  were produced under, so a published page can be traced to the system that
  produced it.

## Trade-offs

**It does not scale past the reviewer.** Throughput is bounded by one person's
attention. This is the central limitation, and it is accepted deliberately: an
unreviewed answer in this domain is worth less than no answer.

**It is not what users expect.** No chat box, no instant reply. Some visitors
will leave. The bet is that a small, trustworthy, permanently-linkable library
serves the sceptical reader better than a fast oracle they have no reason to
believe.

**Review is unglamorous and easy to abandon.** If the queue is not worked, the
site stops growing. A backlog metric on the dashboard is the minimum honest
instrumentation.

**It constrains the product's future.** Going live-answer later means reopening
this ADR and ADR-005 together.
