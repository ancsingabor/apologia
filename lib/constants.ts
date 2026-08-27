/**
 * Rate limiting for the public ask endpoint.
 *
 * These are deliberately tighter than a contact form's: every accepted question
 * costs an embedding call plus a generation call. See `lib/rate-limit.ts` for
 * why this limiter fails CLOSED, and ADR-009 for the containment model.
 */
export const RATE_LIMIT_MAX_QUESTIONS = 5;
export const RATE_LIMIT_WINDOW_MINUTES = 10;

/** Admin authorization roles (mirror of the `admin_role` Postgres enum). */
export const ADMIN_ROLES = ["admin", "staff"] as const;
