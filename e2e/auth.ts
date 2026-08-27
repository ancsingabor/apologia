import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createServerClient } from "@supabase/ssr";
import { assertLocalSupabase, createServiceClient, TEST_ADMIN } from "./fixtures/seed";

export const STORAGE_STATE_PATH = "e2e/.auth/storageState.json";

/**
 * Create the local-only test admin: an auth.users entry (with password) plus the
 * admin_users allowlist row. Idempotent across reruns. Service-role bypasses RLS.
 */
async function ensureTestAdmin(): Promise<void> {
  const db = createServiceClient();

  const { error: createErr } = await db.auth.admin.createUser({
    email: TEST_ADMIN.email,
    password: TEST_ADMIN.password,
    email_confirm: true,
  });
  // Re-runs hit the same disposable user — that's fine.
  if (createErr && !/already.*registered|already been registered/i.test(createErr.message)) {
    throw new Error(`Failed to create test admin auth user: ${createErr.message}`);
  }

  const { error: allowlistErr } = await db
    .from("admin_users")
    .upsert({ email: TEST_ADMIN.email, role: TEST_ADMIN.role }, { onConflict: "email" });
  if (allowlistErr) {
    throw new Error(`Failed to upsert admin_users row: ${allowlistErr.message}`);
  }
}

/**
 * Sign the test admin in with a password and capture the session cookies that
 * @supabase/ssr writes. Using the real library guarantees the cookie encoding
 * (incl. chunking) matches exactly what the app's proxy decodes — we
 * never hand-roll a JWT or weaken any auth check.
 */
async function mintSessionCookies(): Promise<Record<string, string>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  if (!publishableKey) throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set.");

  const jar: Record<string, string> = {};
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return Object.entries(jar).map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) jar[name] = value;
      },
    },
  });

  const { error } = await supabase.auth.signInWithPassword({
    email: TEST_ADMIN.email,
    password: TEST_ADMIN.password,
  });
  if (error) throw new Error(`Test admin sign-in failed: ${error.message}`);

  if (Object.keys(jar).length === 0) {
    throw new Error("Sign-in produced no session cookies — cannot build storageState.");
  }
  return jar;
}

/**
 * Build a Playwright storageState file with a genuine admin session so specs
 * start logged in. The cookies are valid only against the local stack.
 */
export async function mintAdminStorageState(): Promise<void> {
  assertLocalSupabase();
  await ensureTestAdmin();
  const jar = await mintSessionCookies();

  const cookies = Object.entries(jar).map(([name, value]) => ({
    name,
    value,
    domain: "localhost",
    path: "/",
    expires: -1, // session cookie; regenerated every run
    httpOnly: false,
    secure: false,
    sameSite: "Lax" as const,
  }));

  await mkdir(dirname(STORAGE_STATE_PATH), { recursive: true });
  await writeFile(
    STORAGE_STATE_PATH,
    JSON.stringify({ cookies, origins: [] }, null, 2),
    "utf8"
  );
}
