# Hetzner VPS hazırlığı (Sprint 11)

> **Hiçbir sunucuya bağlanılmadı, hiçbir şey kurulmadı.** Bu belge ve `deploy/` dosyaları, müşteri sunucuyu seçip onay verdiğinde kullanılacak şablonlardır. Hangi VPS'in kullanılacağı henüz **belli değil** (BLOCKED).

## 1. Sunucu seçimi — salt-okunur denetim

```bash
ssh <yönetici>@<sunucu> 'bash -s' < deploy/scripts/server-audit-readonly.sh > server-audit-$(date +%F).txt
```

Yalnız OKUR:

- CPU, RAM, swap, disk, yük
- Node, PM2, Nginx, certbot, `pg_dump`, `restic`, `age` sürümleri
- Dinlenen portlar ve sahipleri
- Tüm PM2/Node süreçleri
- `nginx -T` içinden `server_name`, `listen`, `default_server`, `limit_req_zone`
- Etkin siteler, sertifikalar ve yenileme zamanlayıcısı
- Güvenlik duvarı
- KORNNE kullanıcı/dizinlerinin bugünkü durumu

**Asgari gereksinim** (tek sunucu; staging + production aynı kutuda):

| Kaynak | Asgari | Not |
|---|---|---|
| CPU | 2 vCPU | `next build` sunucuda yapılacaksa 3+ önerilir. Build CI'da yapılıp artefakt taşınabilir |
| RAM | 4 GB (+ ≥ 1 GB swap) | Çalışma anında prod ~400–700 MB + staging ~300–500 MB. Build anında +1,5 GB |
| Disk boş alan | ≥ 5 GB | 5 sürüm × ~600 MB + medya 107 MB (×2 ortam) + yedekler |
| Node | ≥ 22.12 (`package.json engines`; geliştirme 24.19) | Mevcut projelerle aynı Node sürümü paylaşılabilir; KORNNE kendi kullanıcısının PM2'siyle çalışır |
| Portlar | 3010 (prod), 3011 (staging), 3018/3019 (aday doğrulama) | **Varsayım**; `preflight.sh` ile boş olduğu doğrulanmadan kullanılmaz. Bilinen kullanımlar: 3000 (Mezbaha, MasaNova, bleibsichtbar), 5010/8081 (B2B-Voice) |

## 2. Çakışma ön-kontrolü (değişiklik yapmaz)

```bash
KORNNE_ENV=production KORNNE_PORT=3010 SERVER_NAMES="kornne.com www.kornne.com" \
  VHOST=deploy/nginx/kornne-production.conf.example bash deploy/scripts/preflight.sh
```

Engelleyici kontroller:

- Port dolu.
- `server_name` başka bir vhost'ta kullanılıyor.
- KORNNE vhost'unda `default_server` var.
- `limit_req_zone` veya `upstream` adı çakışıyor.
- **Bugünkü** `nginx -t` zaten hatalı.
- Disk < 5 GB veya Node < 22.12.

Uyarılar: RAM < 1,2 GB boş, swap < 1 GB, kullanıcı/dizin zaten var.

## 3. İzole yerleşim

| Öğe | Production | Staging |
|---|---|---|
| Unix kullanıcı/grup | `kornne` (sistem kullanıcısı, giriş kabuğu yok) | `kornne-staging` |
| Kök | `/srv/kornne` | `/srv/kornne-staging` |
| Sürümler | `releases/<ts>` (git worktree), `current` → symlink | aynı |
| Kalıcı | `shared/.env.production` (600), `shared/media/upload` (445 orijinal + yüklemeler), `shared/next-cache` (görsel optimizer + ISR), `shared/static/__maintenance.html` | ayrı kopyalar |
| Port | 127.0.0.1:3010 | 127.0.0.1:3011 |
| PM2 | `kornne-web` (kullanıcının kendi daemon'ı, `pm2 startup systemd -u kornne`) | `kornne-staging-web` |
| Log | `/var/log/kornne/` (logrotate 14 gün) | `/var/log/kornne-staging/` (7 gün) |
| Nginx | `deploy/nginx/kornne-production.conf.example` | `deploy/nginx/kornne-staging.conf.example` (Basic Auth + noindex) |
| Veritabanı | Neon KORNNE projesi, ana branch | **ayrı Neon branch** (maskeli kopya), asla prod branch değil |
| Analitik / bildirim | müşterinin prod mülkü / satış adresi | ayrı GA4 mülkü / test kutusu |

**Mezbaha Teknolojileri'nin `default_server` tanımı kopyalanmaz.** KORNNE vhost'larında `default_server` yok (birim testi ve preflight kontrol eder). Yükleme sırası:

1. Mevcut yapılandırmanın yedeği alınır: `sudo tar czf /root/nginx-$(date +%F).tgz /etc/nginx`.
2. `sudo nginx -t` çalıştırılır.
3. `sudo systemctl reload nginx` ile yeniden yüklenir (**restart değil**).
4. Diğer vhost'lar `curl -I` ile tekrar kontrol edilir.

## 4. Next.js ters vekil arkasında

| Konu | Karar |
|---|---|
| Çalıştırma | `next start` (PM2 fork, 1 instance), yalnız loopback; Nginx TLS sonlandırır |
| Başlıklar | CSP (zorunlu), HSTS, `X-Frame-Options: DENY`, nosniff, `Referrer-Policy`, `Permissions-Policy` uygulamadan gelir. `upgrade-insecure-requests` yalnız `SITE_URL` HTTPS ise eklenir (WebKit bulgusu) |
| İstemci IP | Nginx `X-Real-IP`/`X-Forwarded-For` başlıklarının **üzerine yazar**. Uygulama IP'yi tuzlu hash olarak tutar (oran sınırı). Nginx olmadan bu başlıklar sahtelenebilir; loopback bağlanma bunu engeller |
| Görsel optimize edici | `/_next/image` → AVIF/WebP; önbellek `shared/next-cache` (sürümler arasında korunur) |
| ISR | Katalog 300 sn, sitemap 3600 sn; admin işlemleri ilgili yolları yeniden doğrular. Tek instance olduğu için paylaşılan önbellek gerekmez |
| Medya | `/upload/*`: Nginx `try_files` ile `shared/media`'dan sunar; bulunamazsa uygulamanın güvenli rotası çalışır (özel karakterli adlar, gerçek 404) |
| Gövde limiti | Nginx 25 MB; uygulama görselde 10 MB, PDF'te 20 MB doğrular |
| Kesintisiz yeniden başlatma | PM2 fork modunda reload ~5–15 sn 502 üretir. Bu sürede Nginx `__maintenance.html` sayfasını gösterir (503 + `Retry-After`). Yeni sürüm önce geçici portta (3018/3019) smoke testinden geçer |
| Bellek | `max_memory_restart` 1 GB (prod) / 700 MB (staging); `--max-old-space-size` |
| Sağlık | `GET /api/health` → 200 `{status, db}` / 503. İç bilgi sızdırmaz. Cron: `deploy/scripts/healthcheck.sh` |

## 5. Kalıcı medya stratejisi
- **Öneri (onaylanmadı):** VPS diskinde `shared/media` (sürümden bağımsız; deploy uploadları silmez). Yedek: `restic` → Hetzner Storage Box (`deploy/scripts/backup-media.sh`).
- **Alternatifler:** Object Storage (S3) **onaysız seçilmedi**; `docs/architecture/media-storage.md` ile karşılaştırmalı.
- **İlk aktarım:** `data/source-media/originals` → `shared/media/upload` (rsync), ardından `node scripts/verify-media.mjs` 445/445.

## 6. Yedekleme ve geri yükleme

| Ne | Nasıl | Sıklık / saklama | Durum |
|---|---|---|---|
| Neon | Point-in-time restore (plan limitine göre) | sürekli | Müşterinin Neon planı teyit edilmeli |
| DB dökümü | `deploy/scripts/backup-db.sh`: `pg_dump -Fc` → `pg_restore --list` doğrulama → `age` ile **açık anahtara** şifreleme → Storage Box | günlük, 14 gün | READY (sunucuda `pg_dump` + `age` gerekli; yerelde çalıştırılmadı) |
| Medya | `restic` → Storage Box | günlük; 14 günlük / 8 haftalık / 12 aylık | READY |
| Geri yükleme provası | `scripts/ops/backup-rehearsal.mjs`: Neon salt-okunur dışa aktarım → PII maskeleme → izole `kornne_restore` DB → doğrulama | DONE — 52 sn, 49 tablo, 1.783 satır, tüm değişmezler ve 445 hash doğru |
| Sunucuda geri yükleme | `deploy/scripts/restore-db-isolated.sh` (yalnız `kornne_restore*` hedef; prod host reddedilir; maskeleme) | ihtiyaç anında | READY |

## 7. Güvenlik kontrol listesi (sunucu)
- [ ] Neon parolası yenilendi (**P0**) → yeni değer yalnız `shared/.env.production` (600), `SECRETS_ROTATION_CONFIRMED=true`.
- [ ] `IP_HASH_SALT` rastgele, ≥ 32 karakter. `STAGING_BASIC_AUTH_*` yalnız staging'de.
- [ ] Erişim: SSH yalnız anahtar; `kornne` kullanıcısına SSH girişi yok. Deploy, `sudo -u kornne` ile yapılır.
- [ ] UFW: 22/80/443 (mevcut kurallar **değiştirilmeden** doğrulanır).
- [ ] TLS: certbot webroot (mevcut zamanlayıcı); smoke testi ≥ 14 gün geçerlilik kontrol eder.
- [ ] Yedek anahtarları: `age` özel anahtarı sunucuda **yok**; restic parola dosyası 600.
- [ ] Admin oturumları DB'de (`Session`), çerez httpOnly + SameSite. Parola rotasyonu oturumları etkilemez; gerekirse admin'den oturumlar kapatılır.
- [ ] SMTP/bildirim sağlayıcı yokken outbox `BLOCKED` kalır; sahte gönderim yok.
