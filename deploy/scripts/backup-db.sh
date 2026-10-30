#!/usr/bin/env bash
# KORNNE — nightly DATABASE backup on the VPS (TEMPLATE; install only with approval).
#   cron (user kornne):  15 3 * * *  /srv/kornne/current/deploy/scripts/backup-db.sh >> /var/log/kornne/backup.log 2>&1
# pg_dump (custom format, consistent snapshot) → verified with pg_restore --list → encrypted with `age` to a PUBLIC
# key (the private key never lives on the server) → /srv/kornne/backups/db → off-box copy to the Hetzner Storage Box.
# Secrets are read from the env file without echoing them. Neon point-in-time restore stays the first line of
# defence; this dump is the independent second copy.
set -euo pipefail
umask 077
ENV_FILE="${ENV_FILE:-/srv/kornne/shared/.env.production}"
OUT_DIR="${OUT_DIR:-/srv/kornne/backups/db}"
RECIPIENT_FILE="${AGE_RECIPIENT_FILE:-/srv/kornne/shared/backup-recipient.txt}"   # age public key (age1…)
KEEP_DAYS="${KEEP_DAYS:-14}"
STORAGE_BOX="${STORAGE_BOX:-}"                                                     # e.g. u123456@u123456.your-storagebox.de (CLIENT)

url=$(grep -E '^DIRECT_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)
[ -n "$url" ] || url=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)
[ -n "$url" ] || { echo "no DIRECT_URL/DATABASE_URL in env file"; exit 1; }
[ -s "$RECIPIENT_FILE" ] || { echo "age recipient (public key) missing: $RECIPIENT_FILE"; exit 1; }

mkdir -p "$OUT_DIR"
ts=$(date -u +%Y%m%dT%H%M%SZ)
tmp=$(mktemp -p "$OUT_DIR" .dump.XXXXXX)
trap 'rm -f "$tmp"' EXIT

PGCONNECT_TIMEOUT=15 pg_dump --format=custom --no-owner --no-privileges --dbname="$url" --file="$tmp"
# structural check before encrypting: the archive must list the KORNNE tables
pg_restore --list "$tmp" | grep -q 'TABLE DATA public "Product"' || { echo "dump verification failed"; exit 1; }
age -R "$RECIPIENT_FILE" -o "$OUT_DIR/kornne-$ts.dump.age" "$tmp"
sha256sum "$OUT_DIR/kornne-$ts.dump.age" > "$OUT_DIR/kornne-$ts.dump.age.sha256"
echo "$(date -Is) backup ok kornne-$ts.dump.age ($(stat -c %s "$OUT_DIR/kornne-$ts.dump.age") bytes)"

find "$OUT_DIR" -name 'kornne-*.dump.age*' -mtime +"$KEEP_DAYS" -delete
if [ -n "$STORAGE_BOX" ]; then
  rsync -a --delete-after -e "ssh -p 23 -o BatchMode=yes" "$OUT_DIR/" "$STORAGE_BOX:kornne/db/"
  echo "$(date -Is) off-box copy ok"
fi
