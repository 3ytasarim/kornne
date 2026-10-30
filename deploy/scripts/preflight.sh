#!/usr/bin/env bash
# KORNNE — conflict PRE-FLIGHT on the chosen VPS. READ-ONLY: exits non-zero on any blocker, changes nothing.
#   KORNNE_ENV=production|staging  KORNNE_PORT=3010  SERVER_NAMES="kornne.com www.kornne.com"  \
#   VHOST=deploy/nginx/kornne-production.conf.example  bash deploy/scripts/preflight.sh
# Checks: port free · server_name not served by another vhost · no default_server in the KORNNE vhost · our
# vhost would not introduce a second default · disk / RAM / swap headroom · Node ≥ 22.12 · nginx -t currently OK ·
# KORNNE user/dirs state · zone names unique.
set -u
ENV="${KORNNE_ENV:-production}"
PORT="${KORNNE_PORT:-$([ "$ENV" = staging ] && echo 3011 || echo 3010)}"
NAMES="${SERVER_NAMES:?set SERVER_NAMES (space separated)}"
VHOST="${VHOST:-deploy/nginx/kornne-$ENV.conf.example}"
FAIL=0; WARN=0
ok()   { echo "  ok    $*"; }
warn() { echo "  WARN  $*"; WARN=$((WARN+1)); }
bad()  { echo "  FAIL  $*"; FAIL=$((FAIL+1)); }

echo "== KORNNE preflight ($ENV, port $PORT, names: $NAMES)"

# 1. port
if ss -ltn "( sport = :$PORT )" 2>/dev/null | grep -q LISTEN; then bad "port $PORT is already in use: $(sudo ss -ltnp "( sport = :$PORT )" 2>/dev/null | tail -1)"; else ok "port $PORT free"; fi

# 2. server_name collisions with OTHER vhosts (our own future file excluded)
CONF=$(sudo nginx -T 2>/dev/null)
if [ -z "$CONF" ]; then bad "cannot read nginx -T (sudo?)"; fi
for n in $NAMES; do
  hits=$(printf '%s\n' "$CONF" | awk -v n="$n" '/^# configuration file/{f=$4} /server_name/{for(i=2;i<=NF;i++){g=$i; sub(";","",g); if(g==n) print f}}' | grep -v "kornne" | sort -u)
  if [ -n "$hits" ]; then bad "server_name $n already served by: $hits"; else ok "server_name $n not used by another vhost"; fi
done

# 3. default_server rules
if grep -nE "^[^#]*default_server" "$VHOST" >/dev/null 2>&1; then bad "$VHOST contains default_server (forbidden — another project owns the catch-all)"; else ok "no default_server in $VHOST"; fi
defaults=$(printf '%s\n' "$CONF" | grep -cE "^[^#]*listen[^;]*default_server")
ok "existing default_server listens on the box: $defaults (left untouched)"

# 4. zone / upstream name clashes
for z in $(grep -oE "zone=[a-z_]+" "$VHOST" | cut -d= -f2 | sort -u) $(grep -oE "upstream [a-z_]+" "$VHOST" | awk '{print $2}'); do
  if printf '%s\n' "$CONF" | grep -qE "(zone=$z:|upstream $z )"; then bad "name $z already defined in nginx"; else ok "name $z unique"; fi
done

# 5. current nginx config valid (we never reload a broken config)
if sudo nginx -t >/dev/null 2>&1; then ok "nginx -t passes today"; else bad "nginx -t FAILS already — fix before touching anything"; fi

# 6. resources
avail_disk=$(df -Pm / | awk 'NR==2{print $4}'); [ "${avail_disk:-0}" -ge 5000 ] && ok "disk free ${avail_disk} MB" || bad "disk free ${avail_disk} MB < 5000 MB (build + 2 releases + media + backups)"
avail_mem=$(free -m | awk '/Mem:/{print $7}'); swap=$(free -m | awk '/Swap:/{print $2}')
[ "${avail_mem:-0}" -ge 1200 ] && ok "RAM available ${avail_mem} MB" || warn "RAM available ${avail_mem} MB < 1200 MB — build on CI / another machine and ship the artefact"
[ "${swap:-0}" -ge 1024 ] && ok "swap ${swap} MB" || warn "swap ${swap} MB < 1024 MB"

# 7. node
if command -v node >/dev/null; then v=$(node -v | tr -d v); maj=${v%%.*}; min=$(echo "$v" | cut -d. -f2)
  if [ "$maj" -gt 22 ] || { [ "$maj" -eq 22 ] && [ "$min" -ge 12 ]; }; then ok "node $v"; else bad "node $v < 22.12 (package.json engines)"; fi
else bad "node not installed"; fi

# 8. user / dirs
U=$([ "$ENV" = staging ] && echo kornne-staging || echo kornne); R=$([ "$ENV" = staging ] && echo /srv/kornne-staging || echo /srv/kornne)
id "$U" >/dev/null 2>&1 && warn "user $U already exists (expected only on re-runs)" || ok "user $U will be new"
[ -e "$R" ] && warn "$R already exists (expected only on re-runs)" || ok "$R will be new"

echo "== result: $FAIL blocker(s), $WARN warning(s) — nothing was changed"
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
