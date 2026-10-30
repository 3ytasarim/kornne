# Sprint 10 + 11 — test sonuçları

**Tarih:** 22–23.10.2026 · **Ortam:** Windows 11, Node 24.19.

**Tarayıcılar:**

- Sistem Chrome
- Playwright 1.64.1 Chromium 156, Firefox 157, WebKit 27.2 (`.pw-browsers/`, gitignore). Firefox Windows'ta ASCII olmayan kullanıcı klasörü yolundan başlatılamadığı için motorlar proje içinde ASCII bir yola kuruldu.

**İzolasyon:**

- Yazan testler yalnız yerel `kornne_it`, `kornne_e2e` ve `kornne_restore` veritabanlarına yazar (embedded PG 18, 127.0.0.1:54391; KORNNE'nin kendi `.test-db` kopyası, başka projeye ait değil).
- Neon'a yalnız salt-okunur oturum açıldı.
- Ham loglar: `data/qa-logs/s1011-*`, `s10-*`, `s11-*`.

## Özet

| Kontrol | Komut | Sonuç |
|---|---|---|
| Lint | `npx eslint .` | ✅ 0 hata, 0 uyarı |
| Typecheck | `npm run typecheck` | ✅ |
| i18n (5 dil, yeni `consent` bölümü dahil) | `npm run i18n:check` | ✅ |
| Unit + entegrasyon | `npx vitest run` | ✅ **211/211**, 20 dosya. Önceki 188 korunuyor. **+23:** analitik/izin/CSP 11, sözlük-sınır eşitliği 1, dağıtım şablonları 7, outbox 3, teklif yük 1 |
| Production build | `next build` ×2 (`.next`, `.next-prodlike`) | ✅ |
| Playwright tam koşu | `npm run test:e2e` | ✅ **171/171** (5,3 dk), 36 atlanan (ekran görüntüsü üreticileri). Önceki 82 korunuyor. **+89** |
| — sistem Chrome | | 111 (önceki 74 + güvenlik 7 + axe 15 + çapraz tarayıcı 15) |
| — Chromium / Firefox / WebKit | | 15 / 15 / 15 |
| — prodlike (üretim önizlemesi) | | 15 (önceki 8 + izin 7) |
| Son değişiklik sonrası yeniden kontrol | vitrin + axe + 4 motor | ✅ 124/124 |
| SEO denetimi (263 URL) | `scripts/seo/audit.ts` dev / prodlike | ✅ 0 hata, 4 uyarı; prodlike sitemap 46 URL / 116 görsel |
| Smoke (yayın sonrası betiği) | `scripts/release/smoke.mjs` | ✅ yerel 26/26; üretim adayı 24/24 (125 yönlendirmenin hepsi dahil) |
| Migration kapısı | `scripts/release/check-migrations.mjs` | ✅ 5/5 eklemeli |
| Yedek → geri yükleme provası | `scripts/ops/backup-rehearsal.mjs` | ✅ 52 sn; 49 tablo, 1.783 satır; değişmezler + 445 medya hash'i; PII maskeli |
| Yük (yerel) | `scripts/qa/load-smoke.mjs` 20 eşzamanlı, 600 istek | ✅ 0 hata, 109 istek/sn; p95: statik ~235 ms, arama ~600 ms, health ~130 ms |
| Teklif yük/idempotency | vitest | ✅ aynı anahtarla 25 eşzamanlı istek → 1 kayıt; farklı anahtarla 25 → 25 kayıt + 25 outbox satırı |
| Medya bütünlüğü | `node scripts/verify-media.mjs` | ✅ 445/445 |
| Bağımlılık açıkları | `npm audit --omit=dev` | ✅ üretimde 0. Tüm bağımlılıklarda 5 "high": `eslint-config-next` → micromatch → braces (yalnız geliştirme/lint aracı; çalışma zamanında yok; düzeltmesi kırıcı sürüm) |
| Neon artık kaydı | `node scripts/qa/s67-residue.mjs` | ✅ sprint başı = sprint sonu |

## Yeni E2E kapsamı
- **İzin (`consent.prodlike`, 7 test):**
  - İlk ziyarette banner görünür, odak bir seçenektedir; Google betiği, `dataLayer` ve çerez yoktur.
  - **Reddet:** hiçbir şey yüklenmez (sonraki ziyarette de).
  - **Kabul:** default `denied` → update `granted` sırası; betik isteği yapılır ve iptal edilir. `page_view` sorgu dizesi olmadan, `view_item` gönderilir.
  - Yalnız analitik seçimi: reklam sinyalleri `denied` kalır. E-postaya benzeyen arama terimi atılır.
  - **Gerçek teklif + çift tıklama:** tek `generate_lead`; e-posta, ad, telefon, not ve referans `dataLayer` içinde yok.
  - **Footer'dan geri çekme:** `update denied`, `_ga` silinir, sonraki gezintide olay yok.
  - Search Console meta etiketi ve CSP.
  - Google'a giden her istek iptal edildi; ölçüm kimliği sahtedir.
- **Güvenlik (`security`, 7 test):**
  - Başlıklar; `/upload` yol geçişi ve dotfile → 404
  - Yetkisiz erişim: admin → login, CSV/feed kapalı, webhook 404
  - Yabancı Origin ile server action (CSRF) reddedilir, kayıt oluşmaz
  - Rol/IDOR sınırları
  - Yansıtılan XSS
  - Giriş kilitleme (hesap + IP)
- **Erişilebilirlik (`a11y`, 15 test):**
  - axe WCAG 2.0/2.1 A+AA, ciddi ve kritik bulgu = **0**.
  - Kapsam: 11 vitrin sayfası (TR/EN/AR, 404, arama, teklif, iletişim, kurumsal), 3 sayfa koyu tema + 375 px, admin girişi + 13 admin ekranı.
  - Düzeltilen bulgular: kontrast (admin grup başlıkları, koyu tema fiyat kutusu ve bağlantılar, "Bloke" rozeti), dil butonunun erişilebilir adı, odaklanamayan kaydırılabilir tablolar.
- **Çapraz tarayıcı (`storefront.xbrowser`, 15 test × 4 motor):**
  - 8 sayfa: 200, `lang`/`dir`, tek H1, 320 ve 1440 px'te taşma yok
  - Gerçek 404
  - Atlama bağlantısı
  - Mega menü (Esc + odak dönüşü)
  - Galeri lightbox
  - AR mobil menü (sağdan açılır)
  - Teklif listesi ve hata ilişkilendirme (`aria-invalid`, `aria-describedby`)
  - Admin girişi klavye

## Tarayıcı bulguları
| Motor | Bulgu | Durum |
|---|---|---|
| WebKit | CSP `upgrade-insecure-requests` HTTP host'ta tüm alt kaynakları HTTPS'e yükseltiyor → JS/CSS yüklenmiyor | Düzeltildi (yalnız HTTPS'te ekleniyor) |
| Firefox | Mega menü: bekleyen hover zamanlayıcısı Esc sonrası menüyü yeniden açıyor | Düzeltildi |
| Firefox | Next'in hidrasyondaki `history.replaceState` çağrısını navigasyon olarak raporluyor (site hatası değil) | Test DOM'u doğrudan okuyor |
| WebKit | Varsayılan Safari ayarı Tab'ı bağlantılara taşımıyor | Atlama bağlantısı doğrudan odaklanarak test edildi |

**Gerçek cihaz testi yapılmadı:** gerçek Safari (macOS/iOS), Samsung Internet ve Android Chrome cihazları → NOT-TESTED. Ekran okuyucu (NVDA/VoiceOver) elle testi de NOT-TESTED.

## Lighthouse (mobil, simüle kısıtlama, 3 koşu ortancası)
Ayrıntı: `docs/qa/lighthouse-s1011/summary.json`.

- **Ortam:** yerel `next start` (:3470, noindex). Index açılmadı. SEO puanı 69 ve tek başarısız denetim `is-crawlable`.
- **Koşu sağlığı:** 18 koşu, 0 geçersiz. Windows'taki geçici klasör temizleme hatası ayrıca sayıldı.

| Sayfa | S8+9 sonu | **S10+11 son** (koşular) | LCP | FCP | CLS | TBT | Belge | A11y / BP |
|---|---:|---|---|---|---|---|---|---|
| Ana | 89 | **89** (89/89/89) | 3,8 sn | 1,3 sn | 0 | 60 ms | 24 KB | 100 / 100 |
| Kategori | 88 | **90** (90/90/89) | 3,6 sn | 1,1 sn | 0 | 50 ms | 30 KB | 100 / 100 |
| Ürün | 88 | **90** (91/90/90) | 3,6 sn | 1,1 sn | 0 | 50 ms | 25 KB | 100 / 100 |
| Arapça ana | **83** | **89** (89/89/89) | 3,8 sn | 1,5 sn | 0 | 30 ms | 25 KB | 100 / 100 |
| Arama | 90 | **92** (92/91/92) | 3,4 sn | 1,1 sn | 0 | 30 ms | 20 KB | 100 / 100 |
| Teklif listesi | 91 | **93** (93/93/93) | 3,2 sn | 1,1 sn | 0,029 | 60 ms | 16 KB | 100 / 100 |

- **Hedef değerlendirmesi:**
  - Kategori ve ürün 90'a ulaştı. **Ana sayfa 89–90 sınırında dalgalanıyor** (aynı kodla önceki iki ölçümde 90, son ölçümde 89) → hedef **tutturuldu denemez**.
  - Arapça 83 → 89.
  - Koşudan koşuya ±1–2 puan oynama var.
- **Gözlenen vs. simüle:** gözlenen LCP ≈ FCP ≈ 0,27–0,33 sn. 3,6 sn olan, Lighthouse'un simüle "slow 4G" modelidir; LCP'den önce başlayan tüm istekleri (JS, font, görsel) LCP'ye bağımlı sayar.
- **INP:** laboratuvarda ölçülemez; vekil metrik TBT 30–60 ms. Gerçek alan verisi (CrUX) canlıya geçişten sonra gelir.

### Yapılan ölçülebilir iyileştirmeler

| # | Değişiklik | Etki (ölçülen) |
|---|---|---|
| 1 | İstemci bileşenleri `format` için sözlük dizinini içe aktarıyordu; error/not-found sınırları tüm sözlükleri ve `locale-map.json` dosyasını alıyordu. 5 dilin sözlükleri her sayfada 2 × 55 KB JS paketi olarak iniyordu | Paketler ~6 KB'ye düştü. Ana 89→90, kategori 88→89, ürün 88→90 |
| 2 | Arapça sayfa: Latin metin için zaten yüklü Inter kullanılıyor (IBM Plex Arabic'in 4 Latin dosyası artık istenmiyor) | AR 84→88 |
| 3 | Arapça başlıklar Latin slab fontuna düşüyordu (CSS katman sırası hatası) → Arapça font. Slab dosyaları AR'de yüklenmiyor | AR 88→89 + doğru tipografi |
| 4 | Kart görselleri `sizes`: gerçek kart genişliği (`calc(50vw - 24px)`) → mobilde 480 yerine 360 px türev | Kategori görsel aktarımı 142→108 KB |
| 5 | Kategoride öncelikli (preload) görsel 4 → 2 (mobil ilk satır) | Bant genişliği LCP görseline |
| — | Denendi, geri alındı: Arapça fontu önyükleme (TR 90→86); dile özgü önyükleme (Next tüm dillerde önyüklüyor) | — |

**Kalan darboğazlar ve sonraki adım:**

- 14 KB render-blocking CSS
- React/Next çatı JS'i (~120 KB aktarım)
- Lantern'in gecikmeli görsel varsayımı
- Hetzner'de HTTP/2 + Brotli ile gerçek ağ ölçümü ve CrUX alan verisi gerekli.

## Ekran görüntüleri (`docs/qa/screenshots/s1011-*`, 21 adet)
- **Her motor için** (chrome, chromium, firefox, webkit): ana 1440, ürün 375, AR ana 375.
- **Chrome:** RU 320, ürün koyu 375, AR kategori 1440, admin Analitik 1440 + 375.
- **İzin banner'ı** (prodlike): 1440, 375, AR 375, tercih paneli.

## Tekrar komutları

```bash
npm run db:local:start            # arka planda açık kalır
npx vitest run
npm run test:e2e                  # 2 build + 5 proje
QA_SHOTS=1 node scripts/test-db/e2e.mjs --no-build tests/e2e/visual1011.xbrowser.spec.ts tests/e2e/visual1011.prodlike.spec.ts
node scripts/test-db/serve.mjs dev   # sonra:
LH_PAGES=home,category,product,home-ar,search,quote-list LH_OUT=docs/qa/lighthouse-s1011 node scripts/qa/lighthouse.mjs <lighthouse-cli> http://localhost:3470
node scripts/release/smoke.mjs --base=http://localhost:3470 --mode=local
node scripts/ops/backup-rehearsal.mjs
```
