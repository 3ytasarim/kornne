# Hetzner Staging / Production Yayın Planı (TASLAK)

> **Hiçbir adım uygulanmadı.** Sunucuya bağlanılmadı; Nginx/PM2/DNS'e dokunulmadı. Her adım müşteri/ekip onayıyla yapılacak.

## 0. Ön denetim (salt-okunur, onaydan sonra)

Yerel makinede iki bilinen SSH hedefi var; KORNNE'ye hangisinin ayrılacağı **belirtilmedi**, bu yüzden bağlanmadım. Onay gelince yalnızca okuma komutları:

```
uname -a; lsb_release -a; nproc; free -h; df -h
node -v; pm2 -v; pm2 list
sudo nginx -v; sudo nginx -T | grep -E "server_name|listen|default_server"   # sadece okuma
sudo ss -ltnp | grep -E ":(30[0-9]{2}|80|443)\b"
ls /srv /var/www
```

Bilinen port kullanımları (diğer projelerin deploy dosyalarından): **3000** (Mezbaha, MasaNova, bleibsichtbar), 5010/8081 (B2B-Voice). KORNNE için **3010** önerildi; `ss` ile boş olduğu doğrulanmadan kullanılmaz.

## 1. İzolasyon

| Öğe | Değer |
|---|---|
| Sistem kullanıcısı | `kornne` (`adduser --system --group --home /srv/kornne`) |
| Dizinler | `/srv/kornne/releases/<timestamp>`, `/srv/kornne/current` → symlink, `/srv/kornne/shared/{.env.production, upload/}` |
| Log | `/var/log/kornne/` (logrotate) |
| Port | `127.0.0.1:3010` (yalnız loopback) |
| Süreç | PM2 — `deploy/ecosystem.config.cjs`, `pm2 startup systemd -u kornne` (mevcut PM2 örneği **paylaşılmaz**; `kornne` kullanıcısının kendi PM2 daemon'ı) |
| Nginx | `deploy/nginx/kornne-staging.conf.example` + `snippets/kornne-proxy.conf`; **`default_server` yok** (sunucudaki mevcut catch-all'ı bozmamak için); `nginx -t` → `systemctl reload nginx` (restart yok) |
| Env | `shared/.env.production` chmod 600, sahibi `kornne`; içerik loglanmaz |
| DB | Neon (KORNNE projesi). Uygulama: pooler URL; migrasyon: `DIRECT_URL` |

## 2. Staging erişim kontrolü

- Nginx `auth_basic` (bcrypt htpasswd) + uygulama içi `STAGING_BASIC_AUTH_*` (çift katman), `/api/health` hariç.
- `SITE_INDEXABLE=false` → meta robots noindex, `X-Robots-Tag` (proxy + Nginx), `robots.txt: Disallow: /`, boş sitemap.
- Staging alan adı DNS'i: müşteri onayı (open-questions #14).

## 3. Build & release (CI veya sunucuda)

```
git clone/fetch → /srv/kornne/releases/<ts>
npm ci && npx prisma generate
ln -s /srv/kornne/shared/.env.production .env.production
ln -s /srv/kornne/shared/upload public/upload        # orijinal medya (S2 kararına göre)
npx prisma migrate deploy                             # yalnız ileri migrasyon; asla `migrate dev`/reset
npm run build
ln -sfn /srv/kornne/releases/<ts> /srv/kornne/current
pm2 startOrReload deploy/ecosystem.config.cjs --update-env && pm2 save
BASE=https://<staging> AUTH=… deploy/smoke-test.sh
```

Küçük VPS'te build bellek sorunları yaşandığı için (PestShield deneyimi) build CI'da yapılıp artefakt olarak taşınabilir; karar sunucu denetiminden sonra.

## 4. SSL, firewall, güvenlik

- Let's Encrypt (certbot webroot, mevcut yenileme zamanlayıcısı kullanılır).
- UFW: yalnız 22/80/443 (mevcut kurallar **değiştirilmeden** kontrol edilir).
- Nginx: `/admin/login` için `limit_req` 10/dk; dotfile engeli; `X-Real-IP` üzerine yazılır (uygulama IP hash'ini bundan alır).
- Fail2ban/Cloudflare kullanımı mevcut sunucu pratiğine göre.

## 5. Health, izleme

- `GET /api/health` → `{"status":"ok","db":"ok"}` (200) / 503; iç bilgi sızdırmaz.
- Uptime izleme (Better Uptime vb.) health endpoint'ine.
- PM2 log + logrotate; S11'de Sentry.

## 6. Yedek & geri dönüş

- **DB:** Neon point-in-time restore (plan limitine göre) + günlük `pg_dump` (Hetzner'de `kornne` kullanıcısı, 14 gün saklama, şifreli) — S11'de devreye.
- **Medya:** `shared/upload` günlük rsync/restic → Hetzner Storage Box (S3 olarak varsayılmaz; SFTP/rsync).
- **Rollback:** `current` symlink'i bir önceki release'e çevir + `pm2 reload kornne-web`. Geri alınamaz migrasyonlar için expand/contract deseni.

## 7. Canlıya geçiş (S11, ayrı onay)

DNS TTL düşürme → son içerik dondurma → eski siteden son delta → `SITE_INDEXABLE=true` + doğrulanmış katalog → DNS → 301 haritası kontrolü (`docs/audit/redirect-map.csv`) → Search Console adres değişikliği gerekmez (aynı alan adı) → Merchant yeni kaynak paralel test → 24 s / 7 g / 30 g izleme.
