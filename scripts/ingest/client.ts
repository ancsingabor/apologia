import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The service-role client for the ingestion CLI.
 *
 * ⚠️ NOT `lib/supabase/server.ts`. That module imports `next/headers` at module
 * scope, so importing any of its factories from a `tsx` process fails before
 * the first line runs. `e2e/fixtures/seed.ts` builds its client the same way
 * and for the same reason.
 *
 * The corpus tables carry no grants at all — deliberately, because `units.text`
 * holds restricted magisterial text and the licensing posture in ADR-003 and
 * ADR-014 rests on it never reaching a browser. So the ingest reaches them with
 * the service role, which is exactly the secret ADR-004 keeps out of the
 * deployed application: an operator running this CLI needs it, a request path
 * never does.
 */

/**
 * ⚠️ NO LOCALHOST HARD-GUARD HERE, AND THAT IS DELIBERATE — the inverse of
 * `e2e/fixtures/seed.ts`, which refuses to run against anything but a local
 * stack.
 *
 * The difference is that the E2E seed has no legitimate reason to touch the
 * cloud project, while ingesting the corpus into production is the entire point
 * of the CLI eventually. So the target cannot be forbidden. It can be required
 * to be CHOSEN: a remote target is printed and demands `--remote`, so a stale
 * `.env.local` cannot put 2,865 paragraphs into production silently, and an
 * operator who means it types four words.
 */
function isLocal(url: string): boolean {
  const { hostname } = new URL(url);
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export interface IngestTarget {
  db: SupabaseClient;
  url: string;
  local: boolean;
}

export function connect(options: { remote: boolean }): IngestTarget {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set.\n" +
        "For a local run: `supabase start`, then export the values from " +
        "`supabase status -o env`."
    );
  }

  const local = isLocal(url);
  if (!local && !options.remote) {
    throw new Error(
      `Refusing to write to a non-local Supabase target without --remote.\n` +
        `  target: ${new URL(url).host}\n\n` +
        `Ingesting into the cloud project is a legitimate operator action, but ` +
        `it has to be chosen rather than inherited from whatever .env.local ` +
        `happens to hold. Re-run with --remote if that is what you mean.`
    );
  }

  return {
    db: createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    url,
    local,
  };
}
