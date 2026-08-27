-- =============================================================================
-- 0001_core — admin authorization foundation
-- -----------------------------------------------------------------------------
-- The minimum the template needs: an admin allowlist + role, and a reusable
-- updated_at trigger for your future tables. Patients/customers are anonymous
-- (no Supabase Auth); only admins authenticate.
-- =============================================================================

-- Reusable: keep updated_at fresh on UPDATE.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create type admin_role as enum ('admin', 'staff');

create table admin_users (
  id          uuid        primary key default gen_random_uuid(),
  email       text        not null unique,
  role        admin_role  not null default 'staff',
  created_at  timestamptz not null default now()
);

alter table admin_users enable row level security;

-- An authenticated user may read their own allowlist row (used by middleware &
-- lib/auth to resolve role). No anon access.
create policy "admin can read own row"
  on admin_users for select
  to authenticated
  using (email = (select auth.jwt() ->> 'email'));
