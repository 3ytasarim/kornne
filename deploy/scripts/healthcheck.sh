#!/usr/bin/env bash
# KORNNE — health probe for cron / uptime monitors (TEMPLATE). Exit 0 healthy, 1 unhealthy. Prints no internals.
#   */5 * * * *  /srv/kornne/current/deploy/scripts/healthcheck.sh || <alert command chosen by the client>
set -u
PORT="${KORNNE_PORT:-3010}"
body=$(curl -fsS --max-time 10 "http://127.0.0.1:$PORT/api/health" 2>/dev/null) || { echo "$(date -Is) DOWN (no 200)"; exit 1; }
case "$body" in *'"status":"ok"'*'"db":"ok"'*) exit 0;; *) echo "$(date -Is) DEGRADED $body"; exit 1;; esac
