// Raw DB row types — 1:1 with the Postgres schema (snake_case columns).
//
// Domain tables (sources, documents, units, chunks, questions, answers,
// answer_citations, retrieval_traces) land here in Milestone 1, alongside their
// migrations. See docs/architecture.md § Data model.

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
