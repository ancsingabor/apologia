-- =============================================================================
-- 0005_corpus — the citable-unit model (ADR-002)
-- -----------------------------------------------------------------------------
-- The corpus half of the data model: what a source is, what a version of it is,
-- what a citable unit is, and how units are chunked for retrieval.
--
-- ⚠️ EVERY TABLE HERE IS SERVICE-ROLE ONLY, AND THAT IS THE PRODUCT DECISION,
-- not an oversight. `units.text` holds the full text of restricted magisterial
-- sources. It is ingested for retrieval and MUST NEVER reach a browser — the
-- licensing posture in ADR-003/ADR-014 rests on exactly that. What a reader
-- sees is a locator, a link to the official edition, our own prose, and (under
-- ADR-017) a short verified quotation. There are deliberately no grants to
-- `anon` or `authenticated` at the bottom of this file.
--
-- The public half — topics, questions, answers, answer_citations,
-- retrieval_traces — lands in 0006 with the query path. `answers` is the only
-- table in the system that gets `grant select to anon`, paired with an RLS
-- policy of status='published' (ADR-006, ADR-016).
-- =============================================================================

begin;

-- pgvector. Postgres is the vector store; there is no separate one (ADR-001).
create extension if not exists vector;

-- ── sources ─────────────────────────────────────────────────────────────────
-- One row per work, mirroring an entry in corpus/sources.yaml. The manifest is
-- the source of truth and this table is its ingested projection: the pipeline
-- upserts from the YAML, never the other way round (ADR-003, ADR-004).

create type source_kind as enum (
  'church_document',   -- CCC, encyclicals, conciliar documents
  'theological_work',  -- the Summa, the Fathers
  'bible',
  'scientific',        -- physics, cosmology, biology — no ecclesial authority
  'historical'
);

create table sources (
  id              text        primary key,           -- 'ccc', 'summa' — the manifest id
  title           text        not null,
  kind            source_kind not null,
  author          text,                              -- null for the Bible, deliberately

  -- ADR-010. Assigned by a human in the manifest, NEVER inferred. Null is not
  -- "unknown" — it is the positive statement that this source is off the scale,
  -- which is the correct answer for scientific and historical material. Ranking
  -- a physics paper by ecclesial authority is the category error the whole
  -- system exists to avoid, so the constraint below makes it unrepresentable.
  authority_tier  smallint    check (authority_tier between 1 and 5),

  license         text        not null,              -- resolved, always. There is no 'unknown'.
  license_note    text,
  canonical_url   text,
  locator_scheme  text        not null,              -- 'ccc:<paragraph>'
  chunking        text        not null,              -- strategy name; no default (ADR-002)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint scientific_sources_carry_no_tier check (
    (kind in ('scientific', 'historical') and authority_tier is null)
    or kind not in ('scientific', 'historical')
  )
);

create trigger sources_set_updated_at
  before update on sources
  for each row execute function set_updated_at();

-- ── documents ───────────────────────────────────────────────────────────────
-- A specific version of a source in a specific language: the Hungarian CCC and
-- the English CCC are two documents of one source. Content-addressed, so a
-- re-fetch that changes nothing is a no-op and a re-fetch that changes
-- something is visible (ADR-004).

create table documents (
  id            uuid        primary key default gen_random_uuid(),
  source_id     text        not null references sources(id) on delete cascade,
  language      text        not null check (language in ('hu', 'en', 'la')),
  edition       text,                                -- 'Szent István Társulat, 2. kiadás'
  fetched_from  text,
  content_hash  text        not null,                -- sha256 of the normalised source text
  unit_count    integer     not null default 0,

  -- Re-ingesting a new edition inserts a new document rather than mutating the
  -- old one, so stored citations keep resolving against the text they were
  -- verified against. Exactly one document per (source, language) is current.
  is_current    boolean     not null default true,

  ingested_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create unique index documents_one_current_per_language_idx
  on documents (source_id, language)
  where is_current;

create index documents_source_idx on documents (source_id, language);

-- ── units ───────────────────────────────────────────────────────────────────
-- THE ATOM (ADR-002). A passage with a stable, canonical, externally meaningful
-- address that predates this project and will outlive it.

create table units (
  id            uuid        primary key default gen_random_uuid(),
  document_id   uuid        not null references documents(id) on delete cascade,

  -- 'ccc:309', 'summa:I.q2.a3'. The same locator exists once per language —
  -- CCC §309 is §309 in Hungarian and in English. That identity is the
  -- cross-lingual alignment key we did not have to build (ADR-002, ADR-007).
  locator       text        not null,
  language      text        not null check (language in ('hu', 'en', 'la')),

  -- Full source text. Never selected into anything a browser can see.
  text          text        not null,

  ordinal       integer     not null,                -- reading order within the document
  parent_id     uuid        references units(id) on delete cascade,

  -- Load-bearing for the Summa: an objection states the OPPOSITE of the
  -- article's conclusion. A chunker that loses this retrieves objections as
  -- though they were teaching (docs/corpus.md § Why chunking is per-source).
  role          text,                                -- 'objection' | 'sed_contra' | 'respondeo' | 'reply' | null

  -- True when the address is ours rather than the tradition's. Synthetic
  -- locators carry NONE of the stability guarantees, and display must not imply
  -- an authority the locator does not have (ADR-002 § Trade-offs).
  locator_is_synthetic boolean not null default false,

  created_at    timestamptz not null default now()
);

create unique index units_locator_idx on units (document_id, locator);

-- The lookup the citation gate makes on every answer, and `eval:lint` makes on
-- every expected_units entry: does this locator resolve, in this language?
create index units_resolve_idx on units (locator, language);
create index units_document_order_idx on units (document_id, ordinal);
create index units_parent_idx on units (parent_id) where parent_id is not null;

-- ── chunks ──────────────────────────────────────────────────────────────────
-- What gets embedded. Aligned to unit boundaries, never across them blindly.
-- Citations point at UNITS, not chunks, so re-tuning the chunker does not
-- invalidate a single stored citation (ADR-002 § Reasoning).

create table chunks (
  id           uuid        primary key default gen_random_uuid(),
  document_id  uuid        not null references documents(id) on delete cascade,
  strategy     text        not null,                 -- 'numbered-paragraph', 'scholastic-article', 'pericope'
  language     text        not null check (language in ('hu', 'en', 'la')),
  text         text        not null,
  token_count  integer,
  created_at   timestamptz not null default now()
);

create index chunks_document_idx on chunks (document_id, strategy);

-- n:m on purpose. A short CCC paragraph and its neighbour may share a chunk; a
-- long Summa article splits across several. Either direction breaks a plain
-- foreign key, and getting this wrong is what forces fixed-window chunking
-- later, so it is modelled honestly now.
create table chunk_units (
  chunk_id  uuid    not null references chunks(id) on delete cascade,
  unit_id   uuid    not null references units(id) on delete cascade,
  ordinal   integer not null,                        -- unit order within the chunk
  primary key (chunk_id, unit_id)
);

create index chunk_units_unit_idx on chunk_units (unit_id);

-- ── chunk_embeddings ────────────────────────────────────────────────────────
-- Separate from `chunks`, and deliberately UNDIMENSIONED, because ADR-008 (the
-- embedding provider) is still open and is to be decided BY MEASUREMENT rather
-- than from model cards. Deciding it here, in a schema, would settle by
-- accident the question the milestone exists to answer.
--
-- One row per (chunk, model) lets two candidate models sit side by side over
-- the same corpus and be scored against the same gold set — which is what
-- "decided by measurement" has to mean concretely.
--
-- ⚠️ NO VECTOR INDEX YET, and that is not an omission. pgvector requires a
-- fixed dimension to build HNSW/IVFFlat, and the dimension is a property of the
-- model we have not chosen. The CCC is ~2,865 paragraphs × 2 languages, so an
-- exact sequential scan over a few thousand vectors runs in milliseconds and is
-- more accurate than an approximate index. The dimensioned column and its index
-- land in the migration that accompanies ADR-008, once there is a number behind
-- the choice.
create table chunk_embeddings (
  chunk_id    uuid        not null references chunks(id) on delete cascade,
  model       text        not null,                  -- exact provider model id
  dimensions  integer     not null,
  embedding   vector      not null,
  created_at  timestamptz not null default now(),
  primary key (chunk_id, model)
);

create index chunk_embeddings_model_idx on chunk_embeddings (model);

-- ── Privileges ──────────────────────────────────────────────────────────────
-- Deliberately empty of grants. Deny-by-default (0004) means every table above
-- is already unreachable by `anon` and `authenticated`, and that is the desired
-- end state — not a step on the way to one.
--
-- If a future page needs to render source text, that is not a missing grant. It
-- is a licensing decision that has to be argued against ADR-003 and ADR-014
-- first, and the answer will usually be "display the locator instead".
--
-- RLS is enabled with no policies as a second, independent layer: even if a
-- grant were added here by mistake, RLS denies by default once enabled and
-- nothing becomes readable.
alter table sources          enable row level security;
alter table documents        enable row level security;
alter table units            enable row level security;
alter table chunks           enable row level security;
alter table chunk_units      enable row level security;
alter table chunk_embeddings enable row level security;

commit;
