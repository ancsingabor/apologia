# ADR-009 — Cost and abuse containment; the limiter fails closed

Status: **Accepted** · Milestone 0 (controls land in Phase 2)

## Context

`lib/rate-limit.ts` is inherited from the template this repo was scaffolded
from. There it protects contact forms, and on an errored check it **allows** the
request — it fails open. That is the right call for a bakery's order form: losing
a real customer enquiry costs more than accepting a duplicate one.

The ask endpoint is different in kind. Every accepted request spends money: an
embedding call, then a generation call.

## Problem

Two failure modes, and the inherited code has the wrong answer to both.

**Availability is no longer the thing to protect.** Under a fail-open limiter,
the moment the limiter breaks is the moment spending becomes unbounded — and a
limiter under load is disproportionately likely to be broken *because* someone
is abusing the endpoint. The failure mode correlates with the attack.

**A per-IP limit does not bound total spend.** It bounds one caller. A
distributed caller, or simply an unexpectedly popular link, is unaffected by any
per-IP threshold.

## Alternatives considered

1. **Keep fail-open, add alerting.** Preserves availability; alerting is a
   human-latency control against a machine-speed problem.
2. **Fail closed on the limiter only.** Bounds a single caller under failure.
   Still no ceiling on aggregate spend.
3. **Fail closed, plus a global daily budget with a hard kill switch.** Bounds
   both the individual and the aggregate.

## Decision

**Fail closed, and add a global daily budget.**

- `checkRateLimit()` returns `false` when the check itself errors. Implemented;
  the inverted branch is commented in place so the divergence from the template
  is visible to anyone reading it.
- A global daily spend ceiling gates the ask path independently of any per-IP
  count. Exceeded, the endpoint stops drafting and says so plainly.
- The honeypot field is retained from the template — it is free and it removes
  naive bots.

ADR-006 does most of the real work here: because answers are drafts and the
public reads pre-rendered pages, the expensive path is not what casual visitors
touch. This ADR bounds what remains.

## Reasoning

The decision turns on what is actually being protected. For a contact form it is
the enquiry; for a metered endpoint it is the bill. Availability of the ask path
is worth less than a bounded cost, because a reader who cannot draft a question
right now loses very little — every *published* answer stays served, since it is
a static page behind no limiter at all.

That is the property that makes fail-closed cheap: the site does not go down when
the limiter does. Only drafting pauses.

The global budget exists because per-IP limiting answers "is this caller
abusive?" and the question that actually matters is "how much can today cost?".
Those are different questions and they need different controls. Only the second
has a bounded worst case.

## Consequences

- The template's module is modified rather than reused verbatim, and the reason
  is recorded in the code as well as here.
- A budget counter and a kill switch are needed, checked before generation.
- A limiter outage degrades drafting to unavailable. Monitoring must distinguish
  "limiter is down" from "someone is being limited"; conflating them hides an
  outage behind expected behaviour.
- The endpoint needs an honest user-facing message for the budget-exceeded state.

## Trade-offs

**A limiter outage blocks legitimate drafting.** Accepted, and cheap for exactly
the reason above: published answers keep serving.

**The global budget is a shared resource.** One heavy user can exhaust the day
for everyone. A per-identity sub-budget is the refinement if that occurs; not
built now, because building it before observing the problem is speculation.

**Hashed-IP limiting is weak against a distributed caller.** Known. The global
budget is the backstop, and it is the control that actually has a worst case.

**These controls are not yet built.** Phase 2, after a threat model (planned as
`docs/threat-model.md`, not yet written) establishes what each one defends
against. Writing controls before the threat
model is how a security checklist becomes theatre.
