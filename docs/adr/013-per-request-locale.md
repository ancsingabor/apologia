# ADR-013 — Locale is resolved per request from the URL

Status: **Accepted** · Milestone 0 (implemented Milestone 1)

## Context

The template this repo grew from selects one language at build time:
`brand.locale` picks a dictionary from `config/copy/`, and `htmlLang` is a
module constant. Switching language means editing a config file and
redeploying. For a single-client site in one country, that is the right amount
of machinery.

Apologia serves Hungarian primarily and English secondarily, from one
deployment, and its output is intended to be found through search engines.

## Problem

A build-time locale gives both languages the same URLs, so only one can exist at
a time. For a site whose product *is* a library of indexable pages, that is
fatal: search engines need distinct, stable, crawlable URLs per language, and
readers need a link that stays in the language it was shared in.

Compounding it, `answers` are per-language content, not translations of a
template. A Hungarian answer and an English answer to the same question are
separate documents drawing on partly different sources — so language is a
property of the *content*, not merely of the UI chrome.

## Alternatives considered

1. **Keep build-time locale; deploy twice** on two domains. No code change.
   Two deployments, two databases or a shared one with divergent config, and
   cross-linking between languages becomes an external concern.
2. **Client-side switching.** Content is not indexed per language; defeats the
   purpose.
3. **`app/[lang]/` path segments**, with the locale resolved per request — the
   approach the Next.js i18n guide documents.
4. **Domain-based routing** (`.hu` / `.com`). Works and is well-indexed, but
   requires two domains and duplicates deployment config for no gain at this size.

## Decision

**`app/[lang]/` routing.** The locale is a route parameter resolved per request.
`proxy.ts` redirects a request with no locale segment to `brand.defaultLocale`.

`config/copy/` survives unchanged as the dictionary source — the `Copy` type and
the `en`/`hu` implementations are exactly what is wanted. What changes is the
lookup: `getCopy(locale)` becomes the primary accessor, and the module-level
`copy` constant is retired once the inherited pages are migrated.

`brand.locale` is replaced by `brand.defaultLocale` and `brand.locales`.

## Reasoning

This is the template's one structural assumption that does not survive contact
with the requirements, and it fails for a product reason rather than a technical
one: the deliverable is a body of indexable documents, and indexable documents
need URLs.

Path segments over domains, because one domain and one deployment is materially
less to operate, and `hreflang` linking between `/hu/...` and `/en/...` is
straightforward within a single app. The two-domain option buys a marginal SEO
signal at the cost of doubling the deployment surface — a bad trade at this size.

The copy layer being reusable as-is confirms the template's design was sound: the
dictionary abstraction was right, only the *selection* of a dictionary was
over-constrained.

## Consequences

- Every page and layout moves under `app/[lang]/`; `params.lang` is validated
  and 404s on an unsupported value.
- `proxy.ts` gains locale redirection alongside the existing admin guard, and
  the two concerns must not entangle — admin routes are not localised.
- `<html lang>` becomes per-request.
- `answers` carries a language column; a question asked in Hungarian yields a
  Hungarian answer at a Hungarian URL.
- Published pages need `hreflang` alternates where a counterpart exists.
- E2E specs must cover both a localised path and the redirect from a bare one.

## Trade-offs

**It diverges from the template**, so improvements do not flow between the two
repos in this area. Accepted: the requirement is genuinely different.

**Not every answer will exist in both languages**, so `hreflang` alternates are
conditional and some pages are single-language. That is honest — a fabricated
translation would be worse — but it complicates the page metadata.

**More routing surface to get wrong**, particularly the interaction between
locale redirection and the admin guard in `proxy.ts`. Mitigated by E2E coverage
of both, which the inherited harness already makes cheap.
