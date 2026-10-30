# KORNNE — Sprint 8 + 9 raporu

**Tarih:** 22–23.10.2026 · **Kapsam:**

- Sprint 8: teknik SEO, Google Görsel SEO, GEO temeli, çok dilli SEO, yapılandırılmış veri, yönlendirmeler, performans.
- Sprint 9: Google Merchant uygunluk motoru, feed önizlemesi, Merchant API adaptörü, admin kontrol merkezi.

**Durum:** iki sprint tamamlandı. **Sprint 10'a geçilmedi.**

## Kırmızı çizgiler — uyuldu

| Kural | Durum |
|---|---|
| Canlı kornne.com (Hostinger), DNS, MX, Search Console, GA4, Ads, Hetzner, Nginx | **Dokunulmadı** |
| Merchant hesabı, feed'i, kampanyaları | **Dokunulmadı.** Google'a **0 istek**. Merchant API varsayılan KAPALI ve açılması kodda 5 koşula bağlı |
| 41 onaysız fiyat | Değişmedi, otomatik onay yok (41/41 UNVERIFIED) |
| 74 dil eşleşmesi | Onaylanmadı (74/74 SUGGESTED). Sahte RU/AR sayfası yok; çevirisiz ürün adresi 404 |
| 445 orijinal görsel / 125 yönlendirme / #208 307 | Bayt-bayt aynı / 125 tek adım 301 / #208 307 (testli) |
| Gerçek Neon'da test verisi | **Yok.** Yazan tüm testler yerel, izole veritabanında. Neon'a yalnız salt-okunur oturum |
| Uydurma fiyat, stok, GTIN, marka, sertifika, yorum, Offer | Yok (birim, entegrasyon ve E2E testli) |
| Commit / push / deploy | Yok |
| Diğer projeler | Dokunulmadı. Tuzla-Dus'un yerel PostgreSQL'i (:54329) bilinçli olarak kullanılmadı |
| Neon parolası | **Hâlâ yenilenmedi** — bkz. §7 karar 1. Parola hiçbir yerde yazdırılmadı |

---

## 1. Oluşturulan dosyalar ve gerçek işlevler

### 1.1 Test izolasyonu (önce yapıldı; spec kuralı 4)

| Dosya | İşlev |
|---|---|
| `scripts/test-db/local-pg.mjs` | `embedded-postgres` (devDependency) ile 127.0.0.1:54391'de yerel PostgreSQL 18. İki veritabanı açar: `kornne_it` (boş, entegrasyon) ve `kornne_e2e`. `clone` komutu Neon'u **READ ONLY** transaction içinde okuyup kopyalar |
| `tests/test-db-url.mjs` | `assertLocalTestUrl`: yerel olmayan host, neon.tech, yanlış port veya DB için **REFUSED** |
| `tests/integration/global-setup.ts`, `tests/e2e/global-setup.ts` | Hedefin yerel kopya olduğunu doğrular (`current_database`, `inet_server_addr`). Değilse "SKIPPED — ISOLATION UNAVAILABLE" |
| `scripts/test-db/{e2e,build,serve,deploy}.mjs`, `tests/prodlike-env.mjs`, `playwright.config.ts` | İki build (`.next` noindex :3470 ve `.next-prodlike` :3471), iki Playwright projesi (chrome, prodlike), tüm DB URL'leri yerel |
| `src/lib/audit-log.ts` → `writeAuditLogVia(db, …)` | Servisler denetim kaydını enjekte edilen istemciyle yazar. Testte bile global Neon istemcisine yazılmaz |

### 1.2 Sprint 8 — SEO

| Dosya | İşlev |
|---|---|
| `src/lib/seo/audit.ts` | URL bazlı denetim: HTTP durumu, index/noindex (meta + X-Robots-Tag), canonical (hedef + origin), hreflang (self, x-default, karşılıklılık, kırık alternatif), başlık/açıklama/H1, lang/dir, OG/Twitter, JSON-LD (ayrıştırma, Offer/Rating/Review yasağı), alt metin, yönlendirmenin tek adımda 200'e gitmesi (zincir/döngü), sitemap ve robots kuralları |
| `src/lib/seo/inventory.ts` | DB'den rota envanteri: 5 dil × tüm rota aileleri, 40 ürün, kategoriler + sayfalama + filtre, CMS, 125 yönlendirme, #208, 404 vakaları |
| `scripts/seo/audit.ts` | CLI; yalnız localhost hedef kabul eder |
| `src/lib/seo/site.ts` → `seoLocales()` | Dil politikası (`SEO_LOCALES`, varsayılan `tr`) |
| `src/lib/seo/metadata.ts` | Onaysız dilde noindex; hreflang yalnız indekslenebilir sürümler arasında (≥ 2); `clampDescription` (≤ 160) |
| `src/app/sitemap.ts` | Yalnız 200 + index + canonical URL; gerçek `lastmod`; görseller; SEO dilleri |
| `src/lib/seo/json-ld.ts` → `collectionPageJsonLd` | Kategori sayfalarında ItemList (fiyat/teklif yok) |
| `src/lib/catalog/*` | `updatedAt` (sitemap) ve `CatalogCategory.translatedLocales` (onaylı kategori adı) |
| `src/lib/seo/image-audit.ts`, `scripts/seo/image-audit.ts` | 445 görsel: boyut, MIME (magic bytes), bayt, SHA-256, kullanım, alt metin, kopyalar, dosya adı sezgisi, en-boy oranı, uzantı/biçim uyuşmazlığı, Merchant eşikleri (100 / 500 (31.01.2027) / 1500) |
| `src/lib/seo/geo.ts` | GEO önerileri (yalnız öneri, kanıtlı; içerik üretmez) |
| `src/lib/admin/seo-audit.ts` | Denetimi çalıştırır ve `SeoAuditRun` + denetim kaydına yazar. SSRF korumalı hedef. PII'siz CSV |
| **Admin ekranları** | `/admin/seo/qa` (URL denetimi, filtre, düzenleme bağlantıları, CSV), `/admin/seo/gorseller` (iş listesi, 6 kırık görsel, 445 dosya doğrulama), `/admin/seo/geo`; `/admin/seo` dil politikasına uyarlandı |
| `src/app/admin/seo/qa/export/route.ts` | CSV (yalnız `seo.export`; denetimli, `no-store`) |
| `src/app/[locale]/page.tsx`, `layout.tsx` | 320 px'te RU başlık ve kutucuk taşması düzeltildi; Inter önyüklemesi (performans) |

### 1.3 Sprint 9 — Merchant

| Dosya | İşlev |
|---|---|
| `src/lib/merchant/readiness.ts` | Uygunluk motoru. 31 neden kodu; engelleyici ve uyarı ayrımı; GS1 GTIN kontrol hanesi |
| `src/lib/merchant/facts.ts` | Gerçek veriler (salt-okunur): fiyat (geçerli VERIFIED = sayfa fiyatı), stok, görsel, çeviri, marka, eşleme, hedef ayarları (yalnız VERIFIED), ödeme kapısı, iade onayı |
| `src/lib/merchant/feed.ts` | Feed (XML RSS 2.0 + g:, TSV, CSV). Yalnız READY; `toFeedItem` READY olmayanı, onaysız fiyatı ve bilinmeyen stoğu **yeniden reddeder** |
| `src/lib/merchant/api/{types,transform,client,mock}.ts` | Merchant API **products_v1** (Content API değil): ProductInput dönüşümü (micros, enum'lar, gtins), servis hesabı JWT (RS256), yeniden deneme (429/5xx/timeout, Retry-After), zaman aşımı, google.rpc.Status hata ayrıştırma, idempotency anahtarı. `createMerchantClient` 5 koşul sağlanmadan `MerchantDisabledError` fırlatır. Mock istemci: 401/429/500/timeout senaryoları, dedup, 400/404 |
| `src/lib/merchant/sync.ts` | İş/outbox: SIMULATED (`NOT_SENT`), MOCK (`MOCK_OK/PARTIAL/FAILED`), LIVE (reddedilir). Hash ile idempotency, READY'den düşenlerin silinmesi (geri alma), `MerchantSyncRun` + denetim kaydı. MOCK gerçek eşleme tablosunu işaretlemez |
| `src/lib/merchant/mapping.ts` | Eski item_id CSV/TSV önizlemesi: bağlantı/yönlendirme ve id numarasıyla eşleme, yinelenen ve çakışan kayıtlar. **Yazmaz** |
| `src/lib/cms/settings.ts` | "Google Merchant hedefi" ayar grubu (hesap no, dataSource, ülke, dil, feedLabel). Yalnız süper yönetici doğrularsa geçerli |
| **Admin ekranları** | `/admin/merchant` (pano: 0/40, neden sayıları, ürün bazlı düzeltme bağlantıları, ülke/dil kapsamı), `/admin/merchant/feed` (XML önizleme, şema kontrolü, hariç tutulanlar), `/admin/merchant/eslesme` (CSV önizleme), `/admin/merchant/baglanti` (BAĞLI DEĞİL, eksik koşullar, hedef ayarları, SİMÜLASYON/MOCK, iş geçmişi, salt-okunur keşif planı, GSC/GA4 planı) |
| `src/app/admin/merchant/feed/export/route.ts` | Feed indirme (yalnız `merchant.preview`, `no-store`, noindex). Herkese açık feed URL'si **yok** |
| `src/lib/auth/rbac.ts` | Yeni izinler: `seo.audit`, `seo.export`, `media.audit`, `merchant.preview`, `merchant.simulate` |
| `.env.example` | Yalnız boş yer tutucular: `MERCHANT_API_ENABLED=false`, `MERCHANT_ACCOUNT_ALLOWLIST=`, `GOOGLE_SERVICE_ACCOUNT_EMAIL=`, `GOOGLE_SERVICE_ACCOUNT_KEY_FILE=`, `SECRETS_ROTATION_CONFIRMED=false`, `CATALOG_DATA_VERIFIED=false`, `SEO_LOCALES=tr` |

### 1.4 Belgeler
- `docs/seo/seo-audit.md`
- `docs/seo/image-audit.md`
- `docs/seo/redirect-cutover.md`
- `docs/architecture/merchant-feed-spec.md`
- `docs/next-steps/merchant-connection-checklist.md`
- `docs/next-steps/sprint-10-11-readiness.md`
- `docs/qa/sprint-8-9-test-results.md`
- Güncellenenler: `docs/SPRINTS.md`, `README.md`

### 1.5 Doğru çalışmayan / bilinçli olarak eksik
- **Merchant:** gerçek Merchant API çağrısı, hesap keşfi ve ürün durumu okuma yok (erişim ve onay yok; parola yenilenmedi).
- **Google araçları:** Rich Results Test, Search Console ve GA4 bağlantısı yok (plan var).
- **Arapça performans:** Lighthouse 88 → **83** geriledi (Inter önyüklemesinin yan etkisi; §6).
- **Filigran / yazı / logo tespiti:** otomatik değil. Dosya adı sezgisiyle yalnız "manuel inceleme" işareti konuyor.
- **Tarayıcılar:** Firefox ve Safari test edilmedi (yalnız sistem Chrome).

---

## 2. Veri koruma — önce / sonra (gerçek Neon)

Kanıt dosyaları:

- `docs/data-migration/evidence/s89-before.json`, `s89-after.json`
- `data/qa-logs/s89-before-residue.json`, `s89-pre-migration-residue.json`, `s89-final-residue.json`

| Ölçü | Sprint başı | Sprint sonu |
|---|---:|---:|
| Product (yayında / #208) | 41 (40 / DRAFT + inceleme) | 41 (40 / DRAFT + inceleme) |
| ProductTranslation (TR dışı) | 41 (0) | 41 (0) |
| MediaAsset (yüklenen) / `public/upload` dosyası | 445 (0) / 445 | 445 (0) / 445 |
| Redirect (LEGACY_AUDIT / adres değişikliği) | 125 (125 / 0) | 125 (125 / 0) |
| Price (VERIFIED dışı / yönetici satırı) | 41 (0 / 0) | 41 (0 / 0) |
| 74 eşleşme (karar verilmiş) | 0 | 0 |
| Page / PageTranslation / MenuItem / SiteSetting | 4 / 8 / 8 / 9 | 4 / 8 / 8 / 9 |
| User / Session / QuoteRequest / Order | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| AuditLog | 5 | 5 |
| SeoAuditRun / MerchantSyncRun / MerchantItemMapping | — (tablo yok) / 0 / 0 | 0 / 0 / 0 |

**Karşılaştırma:**

- Sprint başı → sprint sonu: **fark yok**.
- Migration öncesi → sonrası: **fark yok**.

**Hash doğrulaması:**

- `verify-media.mjs`: orijinal ve sunulan kopya 445/445.
- Prodlike E2E'de HTTP üzerinden 445/445 SHA-256 eşleşmesi.
- `image-audit`: 445/445 dosya; gerçek biçim kayıtlı MIME ile aynı.

## 3. Migration — SQL, geri alma, izolasyon kanıtı

`prisma/migrations/20261023090000_sprint8_9_seo_merchant/migration.sql` (additive):

```sql
ALTER TABLE "MerchantSyncRun" ADD COLUMN "createdById" TEXT, ADD COLUMN "status" TEXT;
CREATE TABLE "SeoAuditRun" ("id" TEXT NOT NULL, "mode" TEXT NOT NULL, "baseUrl" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "finishedAt" TIMESTAMP(3),
  "urlCount" INTEGER NOT NULL DEFAULT 0, "errorCount" INTEGER NOT NULL DEFAULT 0, "warningCount" INTEGER NOT NULL DEFAULT 0,
  "results" JSONB, "createdById" TEXT, CONSTRAINT "SeoAuditRun_pkey" PRIMARY KEY ("id"));
CREATE INDEX "SeoAuditRun_startedAt_idx" ON "SeoAuditRun"("startedAt");
```

- **Uygulama sırası:**
  1. Önce yerel `kornne_it` ve `kornne_e2e` veritabanlarında tüm testler yeşil.
  2. Ardından Neon'a `prisma migrate deploy` ile, **doğrudan (pooler olmayan) host** üzerinden uygulandı.
  3. Öncesi ve sonrası sayımlar alındı. Kolonlar `information_schema` ile doğrulandı; `_prisma_migrations` kaydı `finished`.
- **Geri alma** (veri kaybı yok; yeni tablo/kolonlarda bugün 0 satır var):
  ```sql
  DROP TABLE IF EXISTS "SeoAuditRun";
  ALTER TABLE "MerchantSyncRun" DROP COLUMN IF EXISTS "status", DROP COLUMN IF EXISTS "createdById";
  DELETE FROM "_prisma_migrations" WHERE migration_name = '20261023090000_sprint8_9_seo_merchant';
  ```
  Ardından önceki uygulama sürümü kullanılır. İleri yönde aynı migration yeniden `deploy` edilir.
- **İzolasyon kanıtı:**
  - Global setup'lar hedefi doğrular (`kornne_it` / `kornne_e2e`, 127.0.0.1).
  - Playwright sunucuları `DATABASE_URL` = yerel e2e kopyasıyla başlar; `reuseExistingServer:false` ile Neon'a bağlı bir dev sunucusu asla yeniden kullanılmaz.
  - Neon'daki `SeoAuditRun` ve `MerchantSyncRun` = 0, User = 0, AuditLog = 5 (sprint başıyla aynı).
  - **Primary Neon'a yazan test yapılmadı.** Neon'a yapılan tek yazma bu additive migration'dır.

## 4. Teknik SEO denetimi (ayrıntı: `docs/seo/seo-audit.md`)

| | Geliştirme (noindex) | Üretim önizlemesi (localhost:3471) |
|---|---|---|
| URL / hata / uyarı | 263 / **0** / 4 | 263 / **0** / 4 |
| İndekslenebilir | 0 | 53 (TR) |
| robots.txt | `Disallow: /` | Allow; `/admin`, `/api/`, arama ve facet kapalı; kendi sitemap'i |
| sitemap | boş | 46 URL, 116 görsel, gerçek lastmod |
| canonical | self; filtre → temel liste | aynı + origin = SITE_URL |
| hreflang / x-default | — | **Hiçbir sayfada yok:** yalnız TR indekslenebilir; EN/FR/RU/AR onaysız. Politika birim testinde `tr,en` ile doğrulandı: karşılıklı alternatifler + x-default=TR |
| Yönlendirme | 125×301 tek adım + #208 307; zincir/döngü 0 | aynı |
| JSON-LD | Organization, WebSite, BreadcrumbList, CollectionPage, Product. **Offer/Rating/Review yok** | aynı |
| Görsel SEO | 445/445 hash. 6 kırık görsel 404. 9 ana görsel < 500 px. 112 vitrin görselinin editörce alt metni yok. 5 WhatsApp kaynaklı görsel. 1 yetim PNG `.jpeg` uzantılı | — |

**Uyarılar:** EN/FR/RU ana sayfa başlığı 74–84 karakter (noindex sayfalar), admin girişinde meta açıklama yok.

**GEO:** 40 ürün için kanıtlı öneriler var (Admin › SEO › GEO). Örnekler:

- Teknik satırlar doğrulanmış tabloya taşınmamış.
- Şartname dili ("…olacaktır").
- Ürün SSS'si yok.
- Organization ünvanı doğrulanmamış.

İçerik üretilmedi.

## 5. Merchant uygunluğu (gerçek Neon verisi, salt-okunur)

**READY 0 / 40** (#208 incelemede olduğu için aday değil). **Hesap BAĞLI DEĞİL, 0 ürün gönderildi.**

| Neden kodu (engelleyici) | Ürün |
|---|---:|
| `PRICE_UNVERIFIED` · `VAT_UNKNOWN` | 40 · 40 |
| `AVAILABILITY_UNKNOWN` | 40 |
| `IDENTIFIER_MISSING` · `BRAND_UNVERIFIED` | 40 · 40 |
| `TARGET_UNSET` · `LANDING_NOT_INDEXABLE` · `SITE_NOT_LIVE` | 40 · 40 · 40 |
| `CHECKOUT_CLOSED` · `SHIPPING_UNVERIFIED` · `RETURNS_UNVERIFIED` · `BUSINESS_IDENTITY_UNVERIFIED` | 40 her biri |
| `SALE_PRICE_INVALID` (eski fiyat ≤ satış fiyatı) | 5 |

| Uyarı | Ürün |
|---|---:|
| `GOOGLE_CATEGORY_MISSING` / `OFFER_ID_UNMAPPED` | 40 / 40 |
| `DESCRIPTION_SHORT` | 21 |
| `IMAGE_BELOW_2027` (#120, #122, #123, #125, #126, #127, #128, #130, #131) | 9 |
| `IMAGE_REVIEW` (WhatsApp kaynaklı ana görsel) | 3 |

**Örnek:** #82 İkiye Bölme Testeresi → hedef, site, ödeme, kargo, iade, ünvan, indeks, fiyat, KDV, stok, tanımlayıcı ve marka (12 engel).

**Kabul vakası (yalnız izole DB'de, test verisiyle):** şu koşullar sağlandığında ürün READY olur ve feed'e tam olarak doğrulanmış değerlerle girer (`1500.00 TRY`, `in_stock`, GTIN):

- Fiyat VERIFIED, KDV dahil
- Stok IN_STOCK
- Geçerli GTIN
- Doğrulanmış marka
- 1600 px görsel
- Doğrulanmış hedef/kargo/ünvan ayarları
- Onaylı iade metni
- Açık ödeme kapısı

Ödeme kapanınca aynı ürün `CHECKOUT_CLOSED` ile yeniden BLOCKED olur.

**MOCK adaptör sonuçları** (entegrasyon + birim):

| Senaryo | Sonuç |
|---|---|
| İlk gönderim | `MOCK_OK` |
| Aynı veri | 0 gönderim (idempotent) |
| Fiyat değişimi | yeniden gönderim (micros doğru) |
| Stok bilinmez | silme (geri alma) |
| 401 | `MOCK_FAILED`, ürün bazında kayıt, sonraki koşuda yeniden denenir |
| 429 / 500 / timeout | Retry-After ve üstel bekleme ile başarı |
| 4 × 503 | 4 deneme sonrası hata |
| Geçersiz offerId | 400, yeniden denenmez |
| Silinecek kayıt yok | 404, başarı sayılır |
| Aynı idempotency anahtarı | dedup |
| LIVE | `MerchantDisabledError` |
| PII | yükte yalnız katalog alanları |
| JWT | imza doğrulandı, token önbellekte |

**Eski ID eşleme beklentisi:**

- Mevcut hesabın offerId'leri **korunacak** (yeni id yalnız eşleşme yoksa `kornne-<eski no>`).
- Önizleme ekranı hazır; dışa aktarım dosyası müşteriden bekleniyor.
- Eşleşme kaydı ayrı bir onayla yapılacak.

## 6. Testler, Lighthouse, ekran görüntüleri

**Test sonuçları:**

| Kontrol | Sonuç |
|---|---|
| Vitest | **188/188** (121 önceki + 67 yeni) |
| Playwright | **82/82** (63 önceki + 19 yeni; 1 eski test yeni dil politikasına göre güncellendi; 36 ekran görüntüsü üreticisi atlandı) |
| Lint / typecheck | ✅ |
| i18n | ✅ |
| İki production build | ✅ |
| `npm audit --omit=dev` | 0 açık |

Ayrıntı: `docs/qa/sprint-8-9-test-results.md`.

**Lighthouse** (mobil, 3 koşu ortancası; S6/7 → S8+9):

| Sayfa | S6/7 | S8+9 |
|---|---:|---:|
| Ana | 86 | **89** |
| Kategori | 86 | **88** |
| Ürün | 88 | **88** |
| Arama | 77 | **90** |
| Teklif listesi | 89 | **91** |
| Arapça ana | 87 | **83 ⚠** |

- **Tüm sayfalar:** CLS ≤ 0,029; erişilebilirlik 100; en iyi uygulamalar 100.
- **SEO 69:** yalnız `is-crawlable` (bilinçli noindex). Index açılmadı.
- **İyileştirme:** Inter önyüklemesi (LCP öğesi metin oldu). FCP 2,1 → 1,1 sn.
- **Darboğazlar:**
  - Simüle slow-4G'de LCP 3,5–3,9 sn: 14 KB render-blocking CSS (≈ 460 ms) ve 72 KB ilk JS paketi (%39'u kullanılmıyor).
  - Arapça gerilemesi (dile özgü font önyüklemesi dile özgü layout gerektirir).
  - Gerçek ağ ölçümü Hetzner'de (HTTP/2, Brotli) ve CrUX ile yapılmalı.
- **INP:** laboratuvarda ölçülemez; vekil metrik TBT 30–80 ms.

**Ekran görüntüleri:** `docs/qa/screenshots/s89-*` (16 adet):

- SEO QA (1440/375, filtreli)
- Görsel SEO (1440/320)
- GEO
- SEO alanları (karanlık)
- Merchant panosu (1440/768/karanlık 375)
- Feed, eşleme, bağlantı (1440/320)
- RU ana sayfa 320, AR ana sayfa 375

## 7. Kullanıcıdan gereken kararlar

1. **Neon parola rotasyonu (öncelikli):**
   1. Neon Console → Project → Roles → `neondb_owner` → Reset password.
   2. Yeni değeri yalnız yerel `.env` dosyasına (`DATABASE_URL`, `DIRECT_URL`) yazın; yazışmalara veya rapora yazmayın.
   3. Çalışan sunucuları yeniden başlatın (eski bağlantılar kopar; admin oturumları DB'de olduğu için geçerli kalır).
   4. Bundan sonra `SECRETS_ROTATION_CONFIRMED=true`.
   
   Bu doğrulanmadan hiçbir harici servis bağlantısı kurulmayacak.
2. **Firma bilgileri:** ticari unvan, vergi dairesi/no, MERSİS; KDV politikası (dahil, oran).
3. **Fiyatlar:** 41 fiyatın tek tek onayı (öneren ≠ onaylayan); 5 geçersiz indirim; 11 dil-fiyat çelişkisi.
4. **Stok:** gerçek stok / temin / teslim süresi (41/41 bilinmiyor).
5. **Ürün tanımlayıcıları:** marka (KORNNE kendi üretimi mi?), GTIN/MPN veya `identifier_exists=no`.
6. **74 EN/FR eşleşme kararı** ve RU/AR içerik sahibi. Ardından hangi dillerin indeksleneceği (`SEO_LOCALES`).
7. **#208:** yayın / birleştirme / kaldırma; 307 → 301?
8. **Görseller:** 9 ana görselin yüksek çözünürlüklü orijinali; 6 kırık görsel (`belge1–5` sertifika mı?); 5 WhatsApp görselinin kullanım izni.
9. **Belgeler:** PDF teknik föyler, doğrulanmış teknik özellikler, gerçek müşteri soruları (GEO).
10. **Merchant Center:** salt-okunur servis hesabı + mevcut ürün dışa aktarımı; hedef ülke/dil/feedLabel; ayrı API veri kaynağı kararı.
11. **Ödeme modeli:** teklif mi, ödeme sağlayıcısı mı? Merchant'ta fiyatlı ürün ilanı satın alınabilirlik gerektirir.
12. **E-posta sağlayıcısı** (SMTP/API).
13. **Hetzner staging** sunucusu ve alan adı (Basic Auth, noindex).
14. **Hukuki metinler:** KVKK, çerez, mesafeli satış ve iade metinlerinin onayı.
15. **Analitik erişimi:** GSC / GA4 / Ads erişimi ve çerez onay metni.

## 8. Sprint 10 + 11 hazırlık
Ayrıntı: `docs/next-steps/sprint-10-11-readiness.md`.

- **Sprint 10 (GEO + Analytics):** kaynaklı içerik (GEO ekranındaki öneriler), Consent Mode v2 ile GA4/GTM olay planı.
- **Sprint 11 (QA / Security / Go-live):** nonce CSP, OWASP, Firefox/Safari matrisi, Hetzner staging'de denetim ve Lighthouse, `redirect-cutover.md` adımları, Merchant diff, Arapça font önyüklemesi.

**Sprint 10'a geçilmedi; talimatınızı bekliyorum.**
