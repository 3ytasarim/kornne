# Güvenlik denetimi (Sprint 11)

**Kapsam:** OWASP Top 10 (2021) eksenli kod incelemesi ve otomatik testler. Ortam: yerel izole build ve yerel DB kopyası. Neon'a yalnız salt-okunur erişim yapıldı. Sızma testi (pentest) veya üçüncü taraf denetimi **yapılmadı** (NOT-TESTED).

## Bulgular ve düzeltmeler (bu sprint)

| # | Bulgu | Etki | Durum |
|---|---|---|---|
| S1 | CSP yalnız `frame-ancestors`/`object-src` içeriyordu; dış betik kaynağı sınırsızdı | XSS ile dış betik yükleme | **Düzeltildi:** zorunlu CSP (`default-src 'self'`, dış betik yalnız Google tag host'ları ve yalnız analitik açıkken; `frame-src`/`object-src 'none'`, `base-uri`, `form-action`) |
| S2 | `upgrade-insecure-requests` HTTP host'larda (yerel önizleme) WebKit/Safari'de tüm JS/CSS'i kırıyordu | Erişilemezlik (yalnız HTTP) | **Düzeltildi:** yalnız `SITE_URL` HTTPS ise eklenir |
| S3 | Mega menü: bekleyen hover zamanlayıcısı Esc sonrası menüyü yeniden açıyordu (Firefox) | Erişilebilirlik / klavye tuzağı riski | **Düzeltildi** |
| S4 | Arapça başlıklar CSS katman sırası nedeniyle Latin slab fontuna düşüyordu | Görsel / okunabilirlik | **Düzeltildi** |
| S5 | Kontrast: admin grup başlıkları, koyu tema fiyat kutusu ve bağlantılar, "Bloke" rozeti | WCAG 1.4.3 | **Düzeltildi** (axe 0 ciddi/kritik) |
| S6 | Kaydırılabilir admin tabloları klavyeyle odaklanamıyordu | WCAG 2.1.1 | **Düzeltildi** (`tabIndex=0` + region etiketi) |
| S7 | Dil seçici butonunun erişilebilir adı görünen metni içermiyordu | WCAG 2.5.3 | **Düzeltildi** |
| S8 | İstemci paketinde 5 dilin tüm sözlükleri (yaklaşık 110 KB JS) | Performans; bilgi sızıntısı değil | **Düzeltildi** |

## OWASP kontrol listesi

| Alan | Uygulama | Kanıt |
|---|---|---|
| A01 Erişim kontrolü | Deny-by-default RBAC (modül + 37 işlem); her server action `requirePermission`; reddedilenler loglanır (`auth.denied`) | `security.spec` rol sınırları / IDOR, `sprint67`, `sprint89` yeniden oynatma testleri |
| A01 IDOR | Kayıt sayfaları modül yetkisini ayrıca kontrol eder; bilinmeyen id → 404 | `security.spec` |
| A02 Kriptografi | Argon2 parola hash'i; oturum token'ı DB'de hash; IP tuzlu SHA-256; TLS 1.2/1.3 (Nginx şablonu), HSTS 2 yıl; yedekler `age` ile açık anahtara şifrelenir | `deploy/*` |
| A03 Enjeksiyon | Prisma parametreli sorgular; Zod doğrulama; zengin metin allow-list sanitizasyonu; JSON-LD kaçışı | birim testleri, XSS E2E |
| A04 Tasarım | Ödeme kapısı ortam + ön koşullarla kilitli; Merchant API 5 koşullu açık katılım; analitik açık katılım; outbox sağlayıcısız `BLOCKED` | `go-no-go.md` |
| A05 Yapılandırma | Zorunlu CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, `x-powered-by` yok; admin `no-store` + noindex | `security.spec` başlık testi |
| A06 Bileşenler | `npm audit --omit=dev`: 0 açık | test sonuçları |
| A07 Kimlik doğrulama | Hesap + IP bazında 15 dakikada 5 hatalı denemede kilit; genel hata mesajı; zamanlama dengelemesi için sahte hash | `security.spec` kilitleme testi |
| A08 Bütünlük | Ödeme webhook'ları HMAC imzalı + idempotent (kilitliyken 404); medya SHA-256 doğrulaması | `commerce-flow`, `sprint45` |
| A09 Loglama | Denetim kaydı (gizli alanlar redakte); PM2 logları; analitik ve loglarda PII yok | `analytics.test`, `consent.prodlike` |
| A10 SSRF | SEO denetimi yalnız uygulamanın kendi adresi; Merchant istemcisi sabit Google uç noktası; dış URL kullanıcıdan alınmaz | `seo-audit.test` |
| CSRF | Next server action Origin = Host denetimi | `security.spec`: yabancı Origin reddedildi, kayıt oluşmadı |
| Dosya yükleme | MIME (magic bytes) + boyut; SVG kabul edilmez; düz dizin; yol geçişi 404 | `security.spec` yol geçişi, `sprint67` yükleme |
| Teklif PII | Listede maskeli; detay ve CSV yalnız yetkiliyle, denetimli; analitik ve URL'lerde yok | `sprint45`, `consent.prodlike` |
| Fiyat dört göz | Öneren ≠ onaylayan (serviste zorunlu) | `admin-services` |
| Oran sınırı | Teklif (IP + bot süresi), login; Nginx `limit_req` şablonu | entegrasyon + E2E |

## Açık riskler / NOT-TESTED
- **P0 — Neon parolası ifşa oldu ve yenilenmedi.** Canlıya geçişin önkoşulu.
- **`script-src 'unsafe-inline'`:** statik sayfalar için nonce kullanılmadı; seçilirse performans maliyeti var. Dış betik kaynakları yine kısıtlı.
- **İstemci IP güveni:** `X-Real-IP` Nginx tarafından üzerine yazılmalı (şablonda var). Nginx'siz doğrudan erişim loopback bağlanma ile engelleniyor.
- **Henüz yapılmadı:** üçüncü taraf pentest, gerçek sunucu sertleştirme denetimi, WAF/fail2ban kararı.
- **Hukuki uygunluk (KVKK/çerez):** teknik altyapı var; hukuki uygunluk iddia edilmez.
