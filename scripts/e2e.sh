#!/usr/bin/env bash
#
# E2E orchestration.
#
# Brings up the local ephemeral Supabase stack, captures its local demo keys,
# and runs Playwright against them. The real cloud project and the credentials
# in .env.local are never used: every Supabase env var below is overridden with
# the LOCAL values, and e2e/fixtures/seed.ts hard-guards on a localhost URL.
#
# Usage: scripts/e2e.sh [extra playwright args...]
set -euo pipefail

cd "$(dirname "$0")/.."

echo "▶ Starting local Supabase stack (idempotent)…"
supabase start >/dev/null

echo "▶ Capturing local stack credentials…"
# `supabase status -o env` prints API_URL / ANON_KEY / SERVICE_ROLE_KEY etc.
# Keep only real KEY=VALUE lines — the CLI also emits notices on stdout/stderr.
eval "$(supabase status -o env 2>/dev/null | grep -E '^[A-Z0-9_]+=')"

# Point the app + setup at the LOCAL stack (these override anything in .env.local).
# Prefer the stack's own PUBLISHABLE_KEY/SECRET_KEY, falling back to the legacy
# ANON_KEY/SERVICE_ROLE_KEY JWTs: current CLIs emit both, but the legacy pair is
# deprecated (Supabase supports it until the end of 2026) and will eventually
# disappear from `supabase status`. Fail loudly rather than handing the seed an
# empty key — an unset key silently degrades to anon and resurfaces much later
# as a confusing `permission denied for table …`.
export NEXT_PUBLIC_SUPABASE_URL="${API_URL}"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="${PUBLISHABLE_KEY:-${ANON_KEY:-}}"
export SUPABASE_SERVICE_ROLE_KEY="${SECRET_KEY:-${SERVICE_ROLE_KEY:-}}"

if [ -z "${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY}" ]; then
  echo "✗ Could not read the local stack's API keys from \`supabase status -o env\`." >&2
  echo "  Expected PUBLISHABLE_KEY/SECRET_KEY (or legacy ANON_KEY/SERVICE_ROLE_KEY)." >&2
  exit 1
fi
export NEXT_PUBLIC_APP_URL="http://localhost:3000"
export E2E_BASE_URL="http://localhost:3000"

# Harmless placeholders so any eager module init doesn't fail (the E2E path
# does not actually send email).
export RESEND_API_KEY="${RESEND_API_KEY:-e2e-dummy}"
export CRON_SECRET="${CRON_SECRET:-e2e-dummy}"

case "${NEXT_PUBLIC_SUPABASE_URL}" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *)
    echo "✗ Refusing to run: NEXT_PUBLIC_SUPABASE_URL is not local (${NEXT_PUBLIC_SUPABASE_URL})." >&2
    exit 1
    ;;
esac

echo "▶ Running Playwright…"
npx playwright test "$@"
