#!/usr/bin/env bash
# KORNNE — release to a Hetzner VPS (TEMPLATE). DRY-RUN by default: prints every step, changes nothing.
# Executing requires BOTH --execute and KORNNE_RELEASE_APPROVED=<approval reference> (client's written go).
#   KORNNE_ENV=staging bash deploy/scripts/release.sh --ref <git-sha>                     # dry run
#   KORNNE_ENV=staging KORNNE_RELEASE_APPROVED="mail 2026-11-03" bash deploy/scripts/release.sh --ref <sha> --execute
# Run as the environment's Unix user (kornne / kornne-staging) on the server, from a checkout of this repository.
# Flow: preflight → new release dir → shared links → npm ci → prisma generate → DB backup → forward-only migrations
#       (destructive SQL refused) → build → candidate smoke on a temp port → atomic symlink switch → pm2 reload →
#       health + smoke → keep 5 releases. Automatic rollback (app only) if the post-switch checks fail.
set -euo pipefail
ENV="${KORNNE_ENV:-production}"
ROOT=$([ "$ENV" = staging ] && echo /srv/kornne-staging || echo /srv/kornne)
PORT=$([ "$ENV" = staging ] && echo 3011 || echo 3010)
CANDIDATE_PORT=$([ "$ENV" = staging ] && echo 3019 || echo 3018)
BASE="${SMOKE_BASE:-}"                         # public URL for the post-switch smoke (https://…)
REF=""; EXECUTE=0
while [ $# -gt 0 ]; do case "$1" in --ref) REF="$2"; shift 2;; --execute) EXECUTE=1; shift;; *) echo "unknown arg $1"; exit 2;; esac; done
[ -n "$REF" ] || { echo "--ref <git sha> required"; exit 2; }
if [ "$EXECUTE" = 1 ] && [ -z "${KORNNE_RELEASE_APPROVED:-}" ]; then echo "REFUSED: KORNNE_RELEASE_APPROVED is not set (no written approval)"; exit 3; fi
run() { echo "+ $*"; [ "$EXECUTE" = 1 ] && eval "$@" || true; }

TS=$(date -u +%Y%m%d%H%M%S); REL="$ROOT/releases/$TS"; PREV=$(readlink -f "$ROOT/current" 2>/dev/null || echo "")
echo "== KORNNE release ($ENV) ref=$REF → $REL  (previous: ${PREV:-none})  mode: $([ "$EXECUTE" = 1 ] && echo EXECUTE || echo DRY-RUN)"

run "bash deploy/scripts/preflight.sh || [ -n \"$PREV\" ]"     # first install must pass; re-runs only warn about own port
run "git -C '$ROOT/repo' fetch --quiet origin && git -C '$ROOT/repo' worktree add --detach '$REL' '$REF'"
run "ln -sfn '$ROOT/shared/.env.production' '$REL/.env.production'"
run "mkdir -p '$ROOT/shared/next-cache' && mkdir -p '$REL/.next' && ln -sfn '$ROOT/shared/next-cache' '$REL/.next/cache'"
run "rm -rf '$REL/public/upload' && ln -sfn '$ROOT/shared/media/upload' '$REL/public/upload'"
run "cd '$REL' && npm ci --no-audit --no-fund && npx prisma generate"
# 1) database: backup, then forward-only migrations (expand/contract — destructive statements need a separate plan)
run "bash '$REL/deploy/scripts/backup-db.sh'"
run "cd '$REL' && node scripts/release/check-migrations.mjs"
run "cd '$REL' && npx prisma migrate deploy"
# 2) build + candidate smoke on a temporary loopback port (the live process keeps serving)
run "cd '$REL' && NODE_OPTIONS=--max-old-space-size=1536 npm run build"
run "cd '$REL' && (PORT=$CANDIDATE_PORT npx next start -H 127.0.0.1 -p $CANDIDATE_PORT & echo \$! > /tmp/kornne-candidate.pid) && sleep 8"
run "node '$REL/scripts/release/smoke.mjs' --base=http://127.0.0.1:$CANDIDATE_PORT --mode=$([ "$ENV" = staging ] && echo staging || echo production-candidate) ; rc=\$?; kill \$(cat /tmp/kornne-candidate.pid); [ \$rc -eq 0 ]"
# 3) switch + reload + verify (automatic app rollback on failure)
run "ln -sfn '$REL' '$ROOT/current.new' && mv -Tf '$ROOT/current.new' '$ROOT/current'"
run "cd '$ROOT/current' && KORNNE_ENV=$ENV pm2 startOrReload deploy/ecosystem.config.cjs --update-env && pm2 save"
run "for i in \$(seq 1 30); do curl -fsS http://127.0.0.1:$PORT/api/health >/dev/null && break; sleep 2; done"
if [ -n "$BASE" ]; then
  run "node '$REL/scripts/release/smoke.mjs' --base='$BASE' --mode=$([ "$ENV" = staging ] && echo staging || echo production) || KORNNE_ENV=$ENV bash '$REL/deploy/scripts/rollback.sh' --to '$PREV' --execute"
fi
run "ls -1dt '$ROOT'/releases/* | tail -n +6 | xargs -r -I{} git -C '$ROOT/repo' worktree remove --force {}"
echo "== done ($([ "$EXECUTE" = 1 ] && echo executed || echo 'dry run — nothing changed'))"
