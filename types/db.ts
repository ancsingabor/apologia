// Raw DB row types — 1:1 with the Postgres schema (snake_case columns).
//
// The corpus tables below mirror `supabase/migrations/0005_corpus.sql`. The
// public half (topics, questions, answers, answer_citations, retrieval_traces)
// lands with `0006` and the query path. See docs/architecture.md § Data model.

export type AdminRole = "admin" | "staff";

export interface DbAdminUser {
  id: string;
  email: string;
  role: AdminRole;
  created_at: string;
}

/** Backs the rate-limit module (`lib/rate-limit.ts`). */
export interface DbRateLimitLog {
  id: string;
  identifier: string;
  action: string;
  created_at: string;
}

// ── Corpus (0005_corpus) ─────────────────────────────────────────────────────
// Reachable only through `createSupabaseServiceClient()`. These rows carry full
// source text and must never be serialised into a Server Component's props or
// an API response (ADR-003, ADR-014).

export type SourceKind =
  | "church_document"
  | "theological_work"
  | "bible"
  | "scientific"
  | "historical";

/** 1 = Scripture/dogma … 5 = contemporary apologetics. See ADR-010. */
export type AuthorityTier = 1 | 2 | 3 | 4 | 5;

export type CorpusLanguage = "hu" | "en" | "la";

/** The role a unit plays inside its parent — load-bearing for the Summa, where
 *  an objection states the OPPOSITE of the article's conclusion. */
export type UnitRole = "objection" | "sed_contra" | "respondeo" | "reply";

export interface DbSource {
  id: string;
  title: string;
  kind: SourceKind;
  author: string | null;
  /** Null is a positive statement, not a gap: scientific and historical sources
   *  are off the ecclesial-authority scale entirely (ADR-010). */
  authority_tier: AuthorityTier | null;
  license: string;
  license_note: string | null;
  canonical_url: string | null;
  locator_scheme: string;
  chunking: string;
  created_at: string;
  updated_at: string;
}

export interface DbDocument {
  id: string;
  source_id: string;
  language: CorpusLanguage;
  edition: string | null;
  fetched_from: string | null;
  content_hash: string;
  unit_count: number;
  is_current: boolean;
  ingested_at: string;
  created_at: string;
}

/** The atom (ADR-002). `locator` is the canonical address — 'ccc:309' — and is
 *  identical across languages, which is the cross-lingual alignment key. */
export interface DbUnit {
  id: string;
  document_id: string;
  locator: string;
  language: CorpusLanguage;
  /** Full source text. Server-side only — never send this to a browser. */
  text: string;
  ordinal: number;
  parent_id: string | null;
  role: UnitRole | null;
  /** True when the address is ours, not the tradition's — it carries none of
   *  the stability guarantees, and display must not imply otherwise. */
  locator_is_synthetic: boolean;
  created_at: string;
}

export interface DbChunk {
  id: string;
  document_id: string;
  strategy: string;
  language: CorpusLanguage;
  text: string;
  token_count: number | null;
  created_at: string;
}

export interface DbChunkUnit {
  chunk_id: string;
  unit_id: string;
  ordinal: number;
}

/** One row per (chunk, model), so two candidate embedding models can sit over
 *  the same corpus and be scored against the same gold set — which is what
 *  "ADR-008 is decided by measurement" has to mean concretely. */
export interface DbChunkEmbedding {
  chunk_id: string;
  model: string;
  dimensions: number;
  embedding: number[];
  created_at: string;
}
