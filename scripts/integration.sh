#!/usr/bin/env bash
#
# Integration-test orchestration — the middle row of ADR-015's table:
# deterministic code that crosses a real Postgres.
#
# Mirrors scripts/e2e.sh: bring up the local ephemeral Supabase stack, capture
# its local demo keys, and run against them. The real cloud project and the
# credentials in .env.local are never used — every Supabase env var below is
# overridden with the LOCAL values, and integration/ hard-guards on a localhost
# URL before it truncates anything.
#
# Usage: npm run test:integration [-- extra vitest args...]
set -euo pipefail

cd "$(dirname "$0")/.."

echo "▶ Starting local Supabase stack (idempotent)…"
supabase start >/dev/null

echo "▶ Applying any pending migrations…"
supabase migration up >/dev/null

echo "▶ Capturing local stack credentials…"
eval "$(supabase status -o env 2>/dev/null | grep -E '^[A-Z0-9_]+=')"

export NEXT_PUBLIC_SUPABASE_URL="${API_URL}"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="${PUBLISHABLE_KEY:-${ANON_KEY:-}}"
export SUPABASE_SERVICE_ROLE_KEY="${SECRET_KEY:-${SERVICE_ROLE_KEY:-}}"

if [ -z "${SUPABASE_SERVICE_ROLE_KEY}" ]; then
  echo "✗ Could not read the local stack's service key from \`supabase status -o env\`." >&2
  echo "  Expected SECRET_KEY (or legacy SERVICE_ROLE_KEY)." >&2
  exit 1
fi

# The corpus tables carry no grants at all (0005_corpus), so these tests are
# unreachable without the service role. An unset key silently degrades to anon
# and resurfaces much later as a confusing `permission denied for table …`.
case "${NEXT_PUBLIC_SUPABASE_URL}" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *)
    echo "✗ Refusing to run: NEXT_PUBLIC_SUPABASE_URL is not local (${NEXT_PUBLIC_SUPABASE_URL})." >&2
    exit 1
    ;;
esac

echo "▶ Running integration tests…"
npx vitest run --config vitest.integration.config.mts "$@"
