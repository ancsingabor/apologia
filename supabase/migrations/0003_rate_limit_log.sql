-- =============================================================================
-- 0003_rate_limit_log — opt-in module (lib/rate-limit.ts)
-- -----------------------------------------------------------------------------
-- Append-only log of public form submissions, keyed by a HASHED identifier
-- (IP/email) so no raw PII is stored. `action` namespaces multiple forms.
-- Drop this migration if you don't use the rate-limit module.
-- =============================================================================

create table rate_limit_log (
  id          uuid        primary key default gen_random_uuid(),
  identifier  text        not null,  -- sha256(ip) — never raw
  action      text        not null,  -- e.g. 'contact_submit'
  created_at  timestamptz not null default now()
);

create index rate_limit_log_lookup_idx
  on rate_limit_log (identifier, action, created_at);

alter table rate_limit_log enable row level security;

-- Anon may insert and count their own bucket; the limit check reads with the
-- anon client. Rows are non-sensitive (hashed identifiers only).
create policy "anon can insert rate log"
  on rate_limit_log for insert
  to anon
  with check (true);

create policy "anon can read rate log"
  on rate_limit_log for select
  to anon
  using (true);
