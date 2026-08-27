import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Deterministic test data + a service-role client for the LOCAL Supabase stack.
 *
 * Safety: every entry point calls assertLocalSupabase() so a misconfigured run
 * can never write into the production project. The service-role key used here is
 * the Supabase CLI's local demo key supplied by scripts/e2e.sh — never the real
 * cloud key.
 *
 * EXTEND PER PROJECT: this template ships only the admin allowlist, so the seed
 * below is minimal. As you add domain tables (products, orders, …), clear them
 * (children first) and insert deterministic fixtures inside seedFixtures(), then
 * assert on them from your specs. Keep fixtures a small, hand-written seed — NOT
 * a copy of production data — so tests stay deterministic and PII-free.
 */

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

export const TEST_ADMIN = {
  email: "e2e-admin@streamforge.test",
  // Local-only credential for the disposable stack. Not a secret.
  password: "e2e-local-password-123",
  role: "admin" as const,
};

function localEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. Run via `npm run test:e2e` (scripts/e2e.sh wires up the local stack)."
    );
  }
  return { url, serviceKey };
}

/**
 * Hard guard: refuse to do anything unless we are pointed at a local stack.
 * Prevents this suite from ever touching the production Supabase project.
 */
export function assertLocalSupabase(): void {
  const { url } = localEnv();
  const host = new URL(url).hostname;
  const isLocal = host === "127.0.0.1" || host === "localhost" || host === "::1";
  if (!isLocal) {
    throw new Error(
      `Refusing to run E2E against non-local Supabase URL: ${url}. ` +
        "The suite must target a local `supabase start` stack only."
    );
  }
}

export function createServiceClient(): SupabaseClient {
  assertLocalSupabase();
  const { url, serviceKey } = localEnv();
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Reusable helper for clearing a table between runs. Call from seedFixtures()
 * in FK-dependency order (children first) as you add domain tables.
 */
export async function deleteAll(db: SupabaseClient, table: string): Promise<void> {
  const { error } = await db.from(table).delete().neq("id", ZERO_UUID);
  if (error) throw new Error(`Failed to clear ${table}: ${error.message}`);
}

/**
 * Reset the relevant tables and insert deterministic fixtures.
 *
 * The template has no domain tables yet, so this is intentionally a no-op beyond
 * the guard — the test admin itself is provisioned in e2e/auth.ts. Add your own
 * clears + inserts here as the schema grows. Example:
 *
 *   const db = createServiceClient();
 *   await deleteAll(db, "order_items");
 *   await deleteAll(db, "orders");
 *   await db.from("orders").insert([ ... ]);
 */
export async function seedFixtures(): Promise<void> {
  assertLocalSupabase();
  // No domain tables to seed in the base template.
}
