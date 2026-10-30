#!/usr/bin/env bash
# KORNNE — MEDIA backup (445 originals + admin uploads) from the persistent media dir (TEMPLATE; approval needed).
#   cron (user kornne):  45 3 * * *  /srv/kornne/current/deploy/scripts/backup-media.sh >> /var/log/kornne/backup.log 2>&1
# restic: encrypted, deduplicated snapshots on the Hetzner Storage Box (SFTP). Weekly integrity check of the
# originals against the database hashes is done by `node scripts/verify-media.mjs` from the release.
set -euo pipefail
MEDIA_DIR="${MEDIA_DIR:-/srv/kornne/shared/media}"
export RESTIC_REPOSITORY="${RESTIC_REPOSITORY:?sftp:<storage-box>:kornne/media (CLIENT)}"
export RESTIC_PASSWORD_FILE="${RESTIC_PASSWORD_FILE:-/srv/kornne/shared/restic-password}"   # chmod 600
[ -d "$MEDIA_DIR/upload" ] || { echo "media dir missing: $MEDIA_DIR/upload"; exit 1; }
count=$(find "$MEDIA_DIR/upload" -type f | wc -l)
[ "$count" -ge 445 ] || { echo "only $count files — refusing to snapshot a partial media dir"; exit 1; }
restic backup --tag kornne-media --host kornne "$MEDIA_DIR"
restic forget --tag kornne-media --keep-daily 14 --keep-weekly 8 --keep-monthly 12 --prune
[ "$(date +%u)" = 7 ] && restic check --read-data-subset=10%
echo "$(date -Is) media backup ok ($count files)"
