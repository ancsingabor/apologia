-- =============================================================================
-- Schema grants — deny by default, grant back exactly what each role needs
--
-- Table privileges must be stated here, not inherited. Supabase projects used to
-- pre-grant `arwdDxtm` on every table created by `postgres` to anon,
-- authenticated and service_role; newer stack images narrowed that default to
-- `Dxtm` (TRUNCATE, REFERENCES, TRIGGER, MAINTAIN — no SELECT/INSERT/UPDATE/
-- DELETE). A schema that relies on the old default silently stops working when
-- replayed on a current CLI, in CI, on a preview branch, or on a rebuilt
-- project, and the symptom is a baffling `permission denied for table …` that
-- looks like an API-key problem but is not.
--
-- So this file makes the privilege model explicit and deliberately strict:
-- `anon` and `authenticated` get nothing by default and are granted, per table,
-- only what the app actually calls.
--
-- ⚠️ WHEN YOU ADD A TABLE: it is reachable by `service_role` (the server-side
-- clients) but by nothing else until you grant it here. If a public page or a
-- signed-in admin gets `permission denied for table your_new_table`, this file
-- is what you are missing — not RLS, and not your API keys.
--
-- Grants and RLS are two different layers and you need both. A grant says "this
-- role may touch this table at all"; an RLS policy says "…and only these rows".
-- Granting without a policy still exposes nothing (RLS denies by default once
-- enabled), but a policy without a grant fails with the error above.
-- =============================================================================

begin;

-- ── 1. Deny by default ───────────────────────────────────────────────────────
-- Future tables do not arrive pre-granted to the API roles. Adding a table must
-- be a deliberate act of granting — that is the point.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ── 2. The backend keeps full access ─────────────────────────────────────────
-- `service_role` is used only by `createSupabaseServiceClient()`, never reaches
-- a browser, and already bypasses RLS by design.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges for role postgres in schema public
  grant all on tables to service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to service_role;

-- ── 3. Grant back, per table, exactly what the app calls ─────────────────────

-- `admin_users` — read through `createSupabaseServerClient()` (a signed-in
-- session, so the `authenticated` role) by `lib/auth.ts` and `proxy.ts`, to
-- check the allowlist. Never written from the app; seeding is service-role work.
grant select on admin_users to authenticated;

-- `rate_limit_log` — `lib/rate-limit.ts` runs on the anon client from public
-- routes: it counts recent rows, then inserts one. No update or delete.
grant select, insert on rate_limit_log to anon;

-- Every domain table added from Milestone 1 on must be granted here (or in a
-- later migration) or it stays unreachable to everything but the service
-- client. That friction is deliberate. The intended end state:
--   `answers`  — grant select to anon, with an RLS policy of status='published',
--                so two independent layers say "the public sees published
--                answers and nothing else".
--   everything else in the corpus and trace path — service-role only.

commit;
