#!/usr/bin/env bash
# KORNNE — READ-ONLY server inventory for choosing / validating a Hetzner VPS. Changes NOTHING.
# Run only after the client named the server and approved an SSH session:
#   ssh <admin>@<server> 'bash -s' < deploy/scripts/server-audit-readonly.sh > server-audit-$(date +%F).txt
# Uses sudo only for commands that READ (nginx -T, ss -p, certbot certificates, ufw status). Review the output for
# secrets before sharing it (nginx -T can print auth_basic file paths; it never prints certificate keys).
set -u
section() { printf '\n===== %s =====\n' "$1"; }

section "system"
uname -a; (lsb_release -ds 2>/dev/null || cat /etc/os-release | head -3)
echo "uptime: $(uptime -p 2>/dev/null)"
section "cpu / memory / swap"
nproc; free -h; swapon --show 2>/dev/null || echo "no swap"
section "disk"
df -hT -x tmpfs -x devtmpfs
du -sh /srv/* /var/www/* 2>/dev/null | sort -h | tail -20
section "runtime versions"
for b in node npm pm2 nginx certbot psql pg_dump restic rsync age gpg; do printf '%-9s ' "$b"; command -v "$b" >/dev/null && ("$b" --version 2>&1 || "$b" -v 2>&1) | head -1 || echo "MISSING"; done
section "listening TCP ports (who owns them)"
sudo ss -ltnp 2>/dev/null | sort -k4 || ss -ltn
section "PM2 processes (all users) — process list only"
ps -eo user,pid,rss,etime,cmd --sort=-rss | grep -E "PM2|node " | grep -v grep | head -40
section "nginx: server names, listens, default_server"
sudo nginx -T 2>/dev/null | grep -nE "^# configuration file|server_name|listen|default_server|proxy_pass|limit_req_zone" | head -200
section "nginx: enabled sites"
ls -l /etc/nginx/sites-enabled/ 2>/dev/null; ls -l /etc/nginx/conf.d/ 2>/dev/null
section "TLS certificates"
sudo certbot certificates 2>/dev/null | grep -E "Certificate Name|Domains|Expiry" || echo "certbot not available"
systemctl list-timers 2>/dev/null | grep -iE "certbot|letsencrypt" || true
section "firewall"
sudo ufw status verbose 2>/dev/null || sudo iptables -S 2>/dev/null | head -30
section "existing users / dirs that KORNNE would create"
for u in kornne kornne-staging; do id "$u" 2>/dev/null || echo "user $u: absent"; done
for d in /srv/kornne /srv/kornne-staging /var/log/kornne /var/log/kornne-staging; do [ -e "$d" ] && echo "EXISTS $d" || echo "absent $d"; done
section "load"
cat /proc/loadavg; vmstat 1 3 2>/dev/null | tail -3
echo; echo "audit finished — nothing was changed"
