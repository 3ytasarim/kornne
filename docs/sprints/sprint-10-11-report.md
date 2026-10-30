# KORNNE — Sprint 10 + 11 raporu

**Tarih:** 22–23.10.2026 · **Kapsam:**

- Sprint 10: analitik ve izin altyapısı, dönüşüm olayları, SEO/GEO/görsel yeniden denetimi, performans, çapraz tarayıcı ve erişilebilirlik.
- Sprint 11: Hetzner dağıtım hazırlığı, yedekleme ve geri yükleme, güvenlik ve regresyon, canlıya geçiş planı.

**Durum:** iki sprint tamamlandı. **Production deploy, DNS, Merchant, ödeme ve Google hesaplarına hiçbir işlem yapılmadı.** Bir sonraki talimat bekleniyor.

Durum etiketleri:

- `DONE`: çalışıyor ve test edildi.
- `READY-BUT-DISABLED`: hazır, bilerek kapalı.
- `BLOCKED`: müşteri kararı veya erişimi gerekiyor.
- `NOT-TESTED`: bu ortamda test edilemedi.

## Kırmızı çizgiler — uyuldu
| Kural | Kanıt |
|---|---|
| Gerçek Neon verisi değişmedi | Sprint başı ve sonu sayımları aynı (`docs/data-migration/evidence/s1011-before.json`, `s1011-after.json`). Bu sprintte **migration yok** (5 migration, hepsi eklemeli) |
| 41 fiyat onaysız, #208 DRAFT + 307, 74 eşleşme SUGGESTED | aynı |
| 445 orijinal + 125 yönlendirme | 445/445 hash (dosya + HTTP), 125/125 tek adımda 301 → 200 (smoke + E2E) |
| Merchant'a veri gönderilmedi; ödeme kapalı | Merchant API kapalı; feed herkese açık değil; ödeme webhook'u 404; `/odeme` kilitli (smoke testi) |
| Google hesaplarına bağlanılmadı | Analitik varsayılan kapalı. Testlerde sahte kimlik kullanıldı ve Google'a giden her istek **iptal edildi** |
| Canlı kornne.com, Hostinger, Hetzner, DNS, Nginx | Dokunulmadı. Dağıtım dosyaları yalnız şablon; betikler DRY-RUN ve `--execute` için yazılı onay gerekiyor |
| Commit / push / diğer projeler | Yok. Tuzla-Dus PostgreSQL'i (:54329) kullanılmadı; 54391 KORNNE'nin kendi `.test-db` kopyası |
| Neon parolası | Hâlâ yenilenmedi → **P0 engel** (bkz. §4) |

Yapılan dış istekler (Google hesapları dışında):

- Playwright tarayıcı indirmeleri (`cdn.playwright.dev`)
- npm paketi `@axe-core/playwright`
- `npm audit` (npm kayıt sunucusu)
- Merchant/Google belgelerine bağlantı yok; Neon'dan yalnız okuma

---

## 1. Tamamlanan ve test edilen özellikler (DONE)

### Sprint 10
- **Performans kök neden düzeltmeleri** (ölçümlü; `docs/qa/sprint-10-11-test-results.md`):
  - 5 dilin tüm sözlükleri her sayfada 2 × 55 KB JS olarak iniyordu → `src/lib/i18n/format.ts` ve `boundary-strings.ts`.
  - Arapça sayfada gereksiz Latin font dosyaları iniyordu; Arapça başlıklar yanlış (Latin slab / sistem) fontla çiziliyordu → CSS katman düzeltmesi.
  - Kart görsellerinde gerçek boyuta göre `sizes`.
  - Kategoride 2 öncelikli görsel.
- **Lighthouse (mobil, 3 koşu ortancası):**

  | Sayfa | Önce | Son |
  |---|---:|---:|
  | Ana | 89 | **89** |
  | Kategori | 88 | **90** |
  | Ürün | 88 | **90** |
  | Arapça | 83 | **89** |
  | Arama | 90 | **92** |
  | Teklif | 91 | **93** |

  CLS ≤ 0,029; erişilebilirlik 100; en iyi uygulamalar 100. **Ana sayfa 90 sınırında dalgalanıyor (89–90): hedef tutturuldu denemez.**
- **Çapraz tarayıcı:** sistem Chrome + Playwright Chromium, Firefox, WebKit: 15 test × 4 motor, hepsi yeşil. Bu sırada 2 gerçek hata bulunup düzeltildi:
  - WebKit'te HTTP host'ta CSP `upgrade-insecure-requests` sayfayı kırıyordu.
  - Firefox'ta mega menü Esc sonrası yeniden açılıyordu.
- **Erişilebilirlik:** axe (WCAG 2.1 A+AA) ile 11 vitrin sayfası, 3 koyu tema sayfası ve 14 admin ekranı tarandı; ciddi/kritik bulgu 0. Düzeltilenler:
  - kontrast (4 nokta)
  - dil butonunun erişilebilir adı (WCAG 2.5.3)
  - klavyeyle odaklanamayan kaydırılabilir tablolar
- **SEO yeniden denetimi:**
  - 263 URL, dev ve prodlike'ta 0 hata.
  - Prodlike sitemap 46 URL ve 116 görsel; staging/production ayrımı kanıtlı.
  - 125 yönlendirme, #208 307, 445 görsel ve 6 kırık görsel (404).
  - Aksiyon listesi: `docs/seo/pre-launch-seo-checklist.md`.

### Sprint 11
- **Güvenlik regresyonu** (`tests/e2e/security.spec.ts`, 7 test):
  - başlıklar ve yeni zorunlu CSP
  - yol geçişi
  - yetkisiz erişim
  - CSRF (yabancı Origin)
  - rol/IDOR
  - XSS
  - giriş kilitleme
  - Merchant/ödeme kapalı
  
  Ayrıntı: `docs/security/security-audit.md`.
- **Yedek → geri yükleme provası:** `scripts/ops/backup-rehearsal.mjs`. Neon salt-okunur dışa aktarıldı, PII maskelendi, izole `kornne_restore` veritabanına geri yüklendi ve doğrulandı. **52 sn; 49 tablo, 1.783 satır.** Tüm değişmezler ve 445 medya hash'i doğru.
- **Yük ve idempotency:**
  - 25 eşzamanlı aynı teklif → 1 kayıt; 25 farklı teklif → 25 kayıt + 25 outbox satırı.
  - Yerel HTTP: 600 istek, 20 eşzamanlı, 0 hata.
- **Smoke testi** (`scripts/release/smoke.mjs`; canlıda da çalışacak): yerel 26/26, üretim adayı 24/24. Kapsadıkları:
  - 125 yönlendirme, #208
  - robots/sitemap (ortama göre)
  - canonical, başlıklar, HSTS, TLS süresi
  - admin, Merchant feed, ödeme
  - eski görsel URL'si, kırık görsel
- **Dağıtım betiklerinin güvenlik kontrolleri** (birim testli):
  - `release.sh` varsayılan DRY-RUN; onaysız `--execute` → çıkış kodu 3.
  - Migration kapısı yıkıcı SQL'i reddediyor.
  - Nginx şablonlarında `default_server` yok.
  - Ortam şablonlarında sır yok, tüm anahtarlar kapalı.
  - Staging ve production ayrı.

### Test sayıları
| | Önceki | Şimdi |
|---|---:|---:|
| Vitest (unit + entegrasyon) | 188 | **211** |
| Playwright | 82 | **171** (Chrome 111, Chromium 15, Firefox 15, WebKit 15, prodlike 15) |
| Lint / typecheck / i18n / 2 build | ✅ | ✅ |

## 2. Geliştirilen ama etkinleştirilmeyen özellikler (READY-BUT-DISABLED)
| Özellik | Açmak için | Dosyalar |
|---|---|---|
| **GA4 / GTM + Consent Mode v2** — basic mod (seçimden önce betik yok); reddet/kabul/özelleştir/geri çek; PII filtresi; 9 olay (`generate_lead` referans başına tek); ticari olaylar engelli | `ANALYTICS_ENABLED=true` + `G-…`/`GTM-…` (müşterinin hesabı) + çerez metni onayı | `src/lib/analytics/*`, `src/components/analytics/AnalyticsRoot.tsx`, `docs/analytics/measurement-plan.md` |
| **Search Console doğrulama etiketi** | `GOOGLE_SITE_VERIFICATION` | `src/lib/analytics/config.ts` |
| **Admin › Analitik & izin** — dürüst durum ekranı (BAĞLI DEĞİL, sentetik metrik yok) | — (ekran açık, bağlantı kapalı) | `src/app/admin/(panel)/analytics` |
| **Teklif bildirimi outbox tüketicisi** — idempotent talep, geri çekilme, FAILED; müşteri verisi yok | Sağlayıcı + alıcı + sır rotasyonu | `src/lib/notifications/outbox-worker.ts` |
| **Hetzner dağıtımı:** PM2 (staging/prod ayrı), Nginx (prod + staging, `default_server` yok, bakım sayfası), logrotate, env şablonları, salt-okunur denetim, preflight, release/rollback, DB/medya yedeği, izole geri yükleme, health | Sunucu seçimi + yazılı onay | `deploy/**`, `docs/deployment/*` |
| **Merchant API, ödeme** (önceki sprintler) | `go-no-go.md` Mod B | — |

## 3. Müşteri onayı gerektiren işlemler
- **Altyapı:** Hetzner VPS seçimi ve SSH erişimi; staging alan adı; production DNS değişikliği (A/AAAA; **MX/SPF/DKIM/DMARC korunacak**); Hostinger tam yedeği.
- **Bildirim:** teklif bildirimleri için e-posta sağlayıcısı ve alıcı **veya** onaylı manuel takip prosedürü.
- **Hukuki:** KVKK aydınlatma, çerez metni, teklif verisi saklama süresi (taslak 730 gün), mesafeli satış ve iade metinleri.
- **Google hesapları:** GA4 / GTM / Search Console erişimi (mevcut hesaplar); staging için ayrı GA4 mülkü.
- **Firma:** ticari unvan ve vergi bilgileri.
- **Katalog:**
  - 41 fiyat ve KDV, stok
  - Marka ve GTIN/MPN
  - Merchant erişimi ve eski ID'ler
  - Ödeme sağlayıcısı (Mod B)
- **İçerik:**
  - 74 çeviri eşleşmesi ve RU/AR içerik; indeksleme dilleri
  - #208
  - 9 küçük ana görsel, 6 kırık görsel, 112 alt metin, WhatsApp görsellerinin kullanım izni
  - Teknik PDF'ler ve özellikler
- **Medya depolama:** VPS kalıcı dizin + Storage Box yedeği (öneri) veya Object Storage.

## 4. Canlı yayına engel olan kritik eksikler (P0 / P1)
| Öncelik | Engel | Mod |
|---|---|---|
| **P0** | **Neon parola rotasyonu** yapılmadı (yazışmada ifşa oldu). Yeni sır yalnız sunucu `.env` dosyasında olmalı; `SECRETS_ROTATION_CONFIRMED` | A + B |
| **P0** | Hetzner sunucusu belli değil; staging yok | A + B |
| **P0** | Teklif bildirim süreci (sağlayıcı/alıcı veya manuel sorumlu) | A + B |
| **P0** | KVKK/çerez/saklama hukuki onayı; ticari unvan | A + B |
| **P0** | DNS erişimi, MX koruma kontrolü, Hostinger yedeği | A + B |
| P0 (Mod B) | 41 fiyat, stok, ödeme sağlayıcısı + sandbox, mesafeli satış/iade/kargo | B |
| P0 (Merchant) | Hesap erişimi, eski ID'ler, marka/GTIN/MPN, görseller | B |
| P1 | 74 çeviri / RU-AR içerik (bugün noindex ile güvenli) | — |
| P1 | Ana sayfa Lighthouse 89–90 sınırında; gerçek sunucuda tekrar ölçülecek | — |
| P1 | Pentest, gerçek Safari/iOS ve ekran okuyucu elle testleri: NOT-TESTED | — |
| P2 | Geliştirme aracı ESLint zincirinde 5 "high" npm uyarısı (çalışma zamanında yok) | — |

**GO/NO-GO:** her iki mod için bugün **NO-GO** (`docs/deployment/go-no-go.md`).

## 5. Teslim edilen belgeler
- `docs/analytics/measurement-plan.md`
- `docs/seo/pre-launch-seo-checklist.md`
- `docs/qa/sprint-10-11-test-results.md`
- `docs/security/security-audit.md`
- `docs/deployment/hetzner-readiness.md`
- `docs/deployment/release-and-rollback-runbook.md`
- `docs/deployment/go-no-go.md`
- `docs/next-steps/production-launch-readiness.md`
- Ekran görüntüleri: `docs/qa/screenshots/s1011-*` (21)
- Lighthouse: `docs/qa/lighthouse-s1011/`
- Kanıt: `docs/data-migration/evidence/s1011-*.json`, `data/qa-logs/backup-rehearsal.json`

**Durduk.** Production deploy, DNS, Merchant ve ödeme aktivasyonu yalnız yeni ve açık talimatla yapılacak.
