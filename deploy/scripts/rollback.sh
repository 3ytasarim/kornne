#!/usr/bin/env bash
# KORNNE — APPLICATION rollback (TEMPLATE). DRY-RUN unless --execute. Points `current` back to the previous release
# and reloads PM2; ~5–15 s of 502 → Nginx shows the maintenance page meanwhile.
#   KORNNE_ENV=production bash deploy/scripts/rollback.sh [--to /srv/kornne/releases/<ts>] [--execute]
# DATABASE is NOT rolled back here: migrations are additive (expand/contract), the previous release runs on the newer
# schema. A schema/data restore is a separate, approved procedure (deploy/scripts/restore-db-isolated.sh → verify →
# Neon branch restore / point-in-time) — see docs/deployment/release-and-rollback-runbook.md §6.
set -euo pipefail
ENV="${KORNNE_ENV:-production}"
ROOT=$([ "$ENV" = staging ] && echo /srv/kornne-staging || echo /srv/kornne)
PORT=$([ "$ENV" = staging ] && echo 3011 || echo 3010)
TO=""; EXECUTE=0
while [ $# -gt 0 ]; do case "$1" in --to) TO="$2"; shift 2;; --execute) EXECUTE=1; shift;; *) echo "unknown arg $1"; exit 2;; esac; done
CUR=$(readlink -f "$ROOT/current")
[ -n "$TO" ] || TO=$(ls -1dt "$ROOT"/releases/* | grep -vx "$CUR" | head -1)
[ -d "$TO" ] || { echo "no previous release found"; exit 1; }
echo "== rollback ($ENV): $CUR → $TO  mode: $([ "$EXECUTE" = 1 ] && echo EXECUTE || echo DRY-RUN)"
run() { echo "+ $*"; [ "$EXECUTE" = 1 ] && eval "$@" || true; }
run "ln -sfn '$TO' '$ROOT/current.new' && mv -Tf '$ROOT/current.new' '$ROOT/current'"
run "cd '$ROOT/current' && KORNNE_ENV=$ENV pm2 startOrReload deploy/ecosystem.config.cjs --update-env && pm2 save"
run "for i in \$(seq 1 30); do curl -fsS http://127.0.0.1:$PORT/api/health >/dev/null && echo healthy && break; sleep 2; done"
echo "== rollback $([ "$EXECUTE" = 1 ] && echo done || echo 'dry run — nothing changed'). Next: run scripts/release/smoke.mjs against the public URL."
