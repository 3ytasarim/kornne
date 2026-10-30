#!/usr/bin/env bash
# Post-deploy smoke test — wrapper around scripts/release/smoke.mjs (Sprint 11 replaced the Sprint 1 draft, whose
# EN product / redirect expectations no longer matched the approved data).
#   BASE=https://<host> MODE=staging|production AUTH=user:pass deploy/smoke-test.sh
set -euo pipefail
exec node "$(dirname "$0")/../scripts/release/smoke.mjs" --base="${BASE:?set BASE}" --mode="${MODE:-staging}" ${AUTH:+--auth="$AUTH"}
