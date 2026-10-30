#!/usr/bin/env bash
# KORNNE — restore a database backup into an ISOLATED target (Neon branch or scratch Postgres). NEVER production.
# Run on the operator machine (the age PRIVATE key lives there, not on the server):
#   TARGET_URL='postgresql://…/kornne_restore_YYYYMMDD' bash deploy/scripts/restore-db-isolated.sh kornne-<ts>.dump.age
# Refuses targets whose database name does not start with "kornne_restore" or whose host equals PROD_HOST.
# After restore: personal data is MASKED (rehearsals / staging must not hold customer data) and counts are printed.
set -euo pipefail
DUMP="${1:?dump file (*.dump.age)}"
TARGET_URL="${TARGET_URL:?TARGET_URL of an isolated database}"
AGE_KEY="${AGE_KEY:-$HOME/.config/kornne/backup-key.txt}"
PROD_HOST="${PROD_HOST:-}"     # hostname of the production database (refusal guard)
db=$(printf '%s' "$TARGET_URL" | sed -E 's#^.*/([^/?]+).*$#\1#')
host=$(printf '%s' "$TARGET_URL" | sed -E 's#^[a-z]+://[^@]*@([^:/]+).*$#\1#')
case "$db" in kornne_restore*) ;; *) echo "REFUSED: target database must be kornne_restore* (got $db)"; exit 1;; esac
[ -n "$PROD_HOST" ] && [ "$host" = "$PROD_HOST" ] && { echo "REFUSED: target host is the production host"; exit 1; }
sha256sum -c "$DUMP.sha256"
tmp=$(mktemp); trap 'shred -u "$tmp" 2>/dev/null || rm -f "$tmp"' EXIT
age -d -i "$AGE_KEY" -o "$tmp" "$DUMP"
start=$(date +%s)
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$TARGET_URL" "$tmp"
psql "$TARGET_URL" -v ON_ERROR_STOP=1 <<'SQL'
-- mask personal data in the isolated copy
UPDATE "QuoteRequest" SET name='Maskeli Kişi', company=NULL, email='masked+'||right(id,6)||'@example.invalid', phone=NULL, message=NULL, "ipHash"=NULL;
UPDATE "QuoteNote" SET body='[maskeli not]';
UPDATE "Customer" SET email='masked+'||right(id,6)||'@example.invalid', name='Maskeli', phone=NULL, "passwordHash"=NULL;
UPDATE "User" SET email='masked+'||right(id,6)||'@example.invalid', name='Maskeli Yönetici', "passwordHash"='!masked';
UPDATE "Order" SET billing=NULL, shipping=NULL, note=NULL, "accessTokenHash"=NULL;
DELETE FROM "Session"; DELETE FROM "UserInvite"; DELETE FROM "LoginAttempt";
SELECT (SELECT count(*) FROM "Product") products, (SELECT count(*) FROM "MediaAsset") media,
       (SELECT count(*) FROM "Redirect" WHERE source='LEGACY_AUDIT') redirects,
       (SELECT count(*) FROM "Price" WHERE status='UNVERIFIED') unverified_prices,
       (SELECT count(*) FROM "QuoteRequest") quotes;
SQL
echo "restore + masking finished in $(( $(date +%s) - start )) s → $db"
