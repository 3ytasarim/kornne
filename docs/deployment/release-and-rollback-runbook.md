# Yayın ve geri alma runbook'u (Sprint 11) — YALNIZ HAZIRLIK

> Bu belgedeki **hiçbir adım uygulanmadı.** Sunucu, DNS, MX, SSL, Hostinger, Merchant ve Search Console'a dokunulmadı. Her bölüm müşterinin yazılı onayıyla ve önceki bölüm yeşilken uygulanır. Betikler varsayılan olarak DRY-RUN'dır. `release.sh --execute` için `KORNNE_RELEASE_APPROVED` zorunludur.

## 0. Ön koşullar (hepsi işaretlenmeden başlanmaz)
- [ ] **P0 Neon parola rotasyonu** yapıldı; yeni değer yalnız sunucu `shared/.env.production` dosyasında; `SECRETS_ROTATION_CONFIRMED=true`.
- [ ] Sunucu seçildi; `server-audit-readonly.sh` çıktısı incelendi; `preflight.sh` 0 engel.
- [ ] `docs/deployment/go-no-go.md` matrisinde seçilen yayın modu (A veya B) **GO**.
- [ ] Hostinger'daki mevcut kornne.com tam yedeği alındı (dosyalar + veritabanı dökümü) ve indirildi (**müşteri**).
- [ ] DNS bölgesinin tam dökümü alındı (A, AAAA, CNAME, MX, TXT/SPF, DKIM, DMARC, CAA). Ekran görüntüsü + metin.

## 1. Staging (önce)
1. Kullanıcı ve dizinler (yalnız onay sonrası; bkz. `hetzner-readiness.md` §3), Node, PM2 kurulumu.
2. Neon'da **staging branch** açılır (maskeli). Staging `.env` doldurulur (`deploy/env/staging.env.example`).
3. Medya kopyası `/srv/kornne-staging/shared/media/upload` dizinine konur → `verify-media` 445/445.
4. `KORNNE_ENV=staging bash deploy/scripts/release.sh --ref <sha>` (dry-run) → gözden geçirilir → `--execute`.
5. Nginx staging vhost'u: `nginx -t` → `reload` → certbot (staging alt alanı).
6. `node scripts/release/smoke.mjs --base=https://<staging> --mode=staging --auth=…` → hepsi `ok` olmalı.
7. Staging'de tam E2E + Lighthouse (gerçek ağ) + axe; sonuçlar müşteriye sunulur.

## 2. Bakım penceresi ve DNS hazırlığı (go-live − 48 saat)
- [ ] **TTL düşürme:** `kornne.com` ve `www` A/AAAA kayıtlarının TTL'i 300 sn'ye indirilir (müşterinin DNS panelinde). **MX, SPF, DKIM, DMARC kayıtlarına dokunulmaz.** E-posta Hostinger'da kalıyorsa MX aynen kalır.
- [ ] Bakım penceresi düşük trafik saatinde seçilir (öneri: Pazar 07:00–09:00 TRT). Sorumlular: teknik, müşteri onaycısı, iletişim.
- [ ] İçerik dondurma: eski sitede ürün/sayfa değişikliği yapılmaz. Son delta (yeni ürün/görsel) aktarılır.

## 3. Go-live (production)
1. Production `.env`: `SITE_URL=https://kornne.com`, `SITE_INDEXABLE=true`, `CATALOG_DATA_VERIFIED` yalnız gerekli onaylar varsa, `SEO_LOCALES=tr`, analitik yalnız onaylıysa.
2. `KORNNE_ENV=production bash deploy/scripts/release.sh --ref <aynı sha> --execute` — DB yedeği, migration kapısı, build, aday smoke (3018), symlink, PM2.
3. Sertifika: önce `www` + apex için certbot (DNS henüz eski sunucudayken HTTP-01 çalışmaz → **DNS değişikliğinden hemen sonra** ya da DNS-01 ile).
4. **DNS değişikliği** (müşteri veya yetkili): A/AAAA → Hetzner IP. MX/TXT değişmez.
5. Doğrulama (yayılım sürerken, `curl --resolve` ile yeni IP'ye zorlanarak):
   - `node scripts/release/smoke.mjs --base=https://kornne.com --mode=production` → 125 yönlendirme (301, tek adım, 200), ana sayfa + ürün + kategori 200, gerçek 404, robots/sitemap/canonical, CSP/HSTS, TLS ≥ 14 gün, admin → login, Merchant feed kapalı, `/odeme` kilitli, eski görsel 200, kırık görsel 404.
   - Teklif kaydı: test e-postasıyla (`@kornne.test` değil, müşterinin belirlediği test kutusu) bir teklif → admin'de görünür → outbox (`BLOCKED` ya da sağlayıcı varsa `SENT`) → test kaydı admin'den kapatılır.
   - E-posta: MX değişmediği için kurumsal e-postanın çalıştığı test edilir (gönder/al).
6. Search Console: domain doğrulama (DNS TXT; müşteri onayı) → sitemap gönder → URL Denetimi (5 örnek).
7. **Merchant:** hiçbir işlem yok. Eski feed çalışmaya devam eder. Ürün kimliği eşlemesi olmadan **yeniden yükleme yapılmaz** (`merchant-connection-checklist.md`).

## 4. İzleme
- **İlk 24 saat:** saatlik smoke, PM2 log (5xx), Nginx 404 listesi, health. Search Console "Sayfa dizine ekleme" raporu.
- **7 gün:** eski URL trafiği (404 raporu → eksik yönlendirme varsa yalnız onayla eklenir), Core Web Vitals.
- **30 gün:** Hostinger hesabı kapatılmadan önce trafik ve indeks karşılaştırması. Ondan sonra eski hosting kapatılır (müşteri).

## 5. Uygulama geri alma (dakikalar)
**Ne zaman:** smoke kırmızı, 5xx artışı, kritik akış (teklif) bozuk.

```bash
KORNNE_ENV=production bash deploy/scripts/rollback.sh            # dry-run: hangi sürüme döneceğini gösterir
KORNNE_ENV=production bash deploy/scripts/rollback.sh --execute
node scripts/release/smoke.mjs --base=https://kornne.com --mode=production
```

`current` önceki sürüme döner ve PM2 yeniden yüklenir; 5–15 sn bakım sayfası gösterilir. Migration'lar eklemeli olduğu için eski sürüm yeni şemayla çalışır (`check-migrations.mjs` yıkıcı SQL'i reddeder).

## 6. Veritabanı geri alma (ayrı onay; uygulama geri almasından AYRI)
- **Şema:** yıkıcı migration yok → şema geri alması normalde gerekmez. Gerekirse yalnız ileri yönlü düzeltme migration'ı yazılır (expand/contract).
- **Veri:**
  1. Neon point-in-time restore yeni bir **branch**'e yapılır.
  2. Branch'te `restore-db-isolated.sh` / doğrulama sorguları çalıştırılır.
  3. Uygulama bağlantısı onayla o branch'e çevrilir.

  Production branch üzerinde doğrudan restore yapılmaz.
- **Kanıt:** `scripts/ops/backup-rehearsal.mjs` provası 52 sn'de 49 tabloyu geri yükleyip değişmezleri doğruladı (`data/qa-logs/backup-rehearsal.json`).

## 7. Tam geri dönüş (DNS) — en son çare
1. A/AAAA kayıtları Hostinger IP'sine geri alınır (TTL 300 → 5–10 dk).
2. Yeni sunucuda `SITE_INDEXABLE=false` yapılır ve uygulama yeniden başlatılır → noindex olur, robots kapanır, sitemap boşalır (kod değişikliği yok).
3. Search Console'da sitemap kaldırılmaz (aynı alan adı; eski site URL'leri zaten aynı yollar).
4. Merchant'ta işlem gerekmez (eski feed hiç durmadı).
5. Olay raporu yazılır; yeni denemeden önce kök neden kapatılır.

| Geri alma türü | Uygulama | DB şeması | DB verisi | DNS |
|---|---|---|---|---|
| Uygulama | `rollback.sh` | — | — | — |
| Veri | — | — | Neon PITR → branch → doğrulama → bağlantı | — |
| Tam | `SITE_INDEXABLE=false` | — | — | A → Hostinger |
