# Merchant feed ve API spesifikasyonu (Sprint 9)

> Durum: **BAĞLI DEĞİL · GÖNDERİLMEDİ.** Bu belge, Google Merchant Center'a ürün verisi üretecek altyapıyı tanımlar. Sprint 9 kapsamında Google'a hiçbir istek atılmadı. Müşterinin mevcut Merchant hesabı, feed'i ve kampanyaları değiştirilmedi.

## 1. Tek doğruluk kaynağı

Tüm feed alanları Prisma/Neon'dan, vitrinin kullandığı kayıtlardan üretilir. Üretimi yapan dosyalar:

- `src/lib/merchant/facts.ts`: gerçek verileri toplar (salt-okunur sorgular).
- `src/lib/merchant/readiness.ts`: uygunluk motoru (saf fonksiyon).
- `src/lib/merchant/feed.ts`: feed üreticisi (XML, TSV ve CSV).
- `src/lib/merchant/api/*`: Merchant API (products_v1) adaptörü.
- `src/lib/merchant/sync.ts`: iş/outbox; her çalışma bir `MerchantSyncRun` kaydı olarak tutulur.

Fiyat, açılış sayfası, görsel ve stok aynı sorgudan gelir. Vitrindeki fiyat `pagePriceMinor` ile feed fiyatı aynı değilse `PRICE_NOT_ON_PAGE` gönderimi durdurur.

| Feed alanı | Kaynak | Kural |
|---|---|---|
| `id` (offerId) | `MerchantItemMapping.offerId` (mevcut hesaptan) → yoksa `kornne-<eski ürün no>` | Mevcut id **asla** yeniden üretilmez; değişirse Merchant'ta yeni ürün oluşur |
| `title` | `ProductTranslation.title` (hedef dil, LEGACY_SOURCE/APPROVED) | ≤ 150 karakter |
| `description` | `ProductTranslation.descriptionHtml` → düz metin | ≤ 5000; telefon/URL/promosyon ifadesi varsa engel |
| `link` | `SITE_URL` + yerelleştirilmiş `/urun/<slug>` | Yalnız yayımlanmış çeviri; indekslenebilir sayfa |
| `image_link` / `additional_image_link` | `ProductMedia` (isPrimary → sortOrder), `/upload/...` orijinal yolu | Orijinal dosya, hash değişmez; ≤ 10 ek görsel |
| `availability` | `Inventory.availability` | UNKNOWN veya kayıt yok → **engel**; varsayılan değer yok |
| `price` / `sale_price` | Geçerli `Price` (VERIFIED, `validFrom ≤ now < validTo`) | > 0, TRY, KDV dahil; indirim yalnız eski fiyat > satış fiyatı ise |
| `brand` | `Brand.name` (yalnız VERIFIED) | Doğrulanmamış marka yazılmaz |
| `gtin` / `mpn` / `identifier_exists` | `Product.gtin` (GS1 kontrol hanesi) / `mpn` / `identifierExists=false` | Barkod **üretilmez** |
| `condition` | `Product.condition` | NEW / USED / REFURBISHED |
| `google_product_category` | `Product.googleProductCategory` | Yalnız güvenilir eşleme; yoksa uyarı |
| `product_type` | `Product.productType` | İsteğe bağlı |
| `content_language` / `target_country` / `feed_label` | Admin › Ayarlar › Google Merchant hedefi (**VERIFIED** olmalı) | Teyitsizse `TARGET_UNSET` |
| kargo / iade | `commerce.shippingPolicy` (VERIFIED) + iade sayfası hukuki onayı | Feed'e kargo değeri yazılmaz; ayar Merchant hesabında yapılır (müşteri kararı) |

## 2. Uygunluk kapıları (fail-closed)

Ürünün durumu `READY` ya da `BLOCKED` olur. Engelleyici (blocking) tek bir neden ürünü feed dışında bırakır. Uyarılar feed'i durdurmaz.

| Kod | Tür | Anlamı |
|---|---|---|
| `TARGET_UNSET` | genel | Hedef ülke, dil veya feedLabel doğrulanmadı |
| `SITE_NOT_LIVE` | genel | `SITE_INDEXABLE` veya `CATALOG_DATA_VERIFIED` kapalı (cutover yapılmadı) |
| `CHECKOUT_CLOSED` | genel | Ödeme kapısı kapalı (teklif modeli) |
| `SHIPPING_UNVERIFIED` / `RETURNS_UNVERIFIED` / `BUSINESS_IDENTITY_UNVERIFIED` | genel | Kargo, iade veya ticari unvan onayı yok |
| `PRODUCT_NOT_PUBLIC` | ürün | Taslak veya incelemede (#208) |
| `SALE_MODE_QUOTE_ONLY` | ürün | Yalnız teklif ile satılıyor |
| `LANGUAGE_NOT_PUBLISHED` / `LANDING_NOT_INDEXABLE` | ürün | Hedef dilde sayfa yok veya noindex |
| `PRICE_MISSING` / `PRICE_UNVERIFIED` / `PRICE_ZERO` / `CURRENCY_MISMATCH` / `VAT_UNKNOWN` / `SALE_PRICE_INVALID` / `PRICE_NOT_ON_PAGE` | fiyat | Fiyat onayı ve tutarlılığı |
| `AVAILABILITY_UNKNOWN` | stok | Gerçek stok yok |
| `IDENTIFIER_MISSING` / `BRAND_UNVERIFIED` | ürün | Tanımlayıcı ve marka |
| `IMAGE_MISSING` / `IMAGE_TOO_SMALL` (< 100 px) / `IMAGE_FORMAT` | görsel | Engel |
| `IMAGE_BELOW_2027` | görsel | 31.01.2027'ye kadar uyarı, o tarihten sonra engel (< 500 px) |
| `TITLE_MISSING` / `TITLE_TOO_LONG` / `DESCRIPTION_POLICY` | içerik | Engel |
| `DESCRIPTION_SHORT` / `IMAGE_REVIEW` / `GOOGLE_CATEGORY_MISSING` / `OFFER_ID_UNMAPPED` | uyarı | Feed'i durdurmaz |

Feed üreticisi (`toFeedItem`) READY olmayan, fiyatı doğrulanmamış veya stoğu bilinmeyen öğeyi **yeniden** reddeder (`FeedRefusal`). Readiness motoru atlansa bile sahte veri çıkışa ulaşamaz.

## 3. Biçimler

- **XML:** RSS 2.0 + `xmlns:g="http://base.google.com/ns/1.0"`, `<g:price>1500.00 TRY</g:price>`; açıklama satırı "GÖNDERİLMEDİ" der.
- **TSV ve CSV:** başlık satırı Merchant öznitelik adlarıdır. Formül enjeksiyonuna karşı `=+-@` ile başlayan hücrelere `'` öneki eklenir.
- **Erişim:** yalnız `/admin/merchant/feed/export?format=xml|tsv|csv` adresinden, oturum + `merchant.preview` yetkisiyle (SUPER_ADMIN / ADMIN). Yanıt `no-store` ve `noindex` olarak döner. Herkese açık feed URL'si **yoktur**.

## 4. Merchant API stratejisi (products_v1)

- **Kullanılan uç noktalar:**
  - Yazma: `POST https://merchantapi.googleapis.com/products/v1/accounts/{account}/productInputs:insert?dataSource=accounts/{account}/dataSources/{ds}`
  - Silme: `DELETE …/productInputs/{contentLanguage~feedLabel~offerId}?dataSource=…`
  - Salt-okunur keşif: `GET /datasources/v1/accounts/{account}/dataSources`
- **Kullanılmayan API:** Content API for Shopping. 18 Ağustos 2026'da kapatıldı.
- **Dönüşüm:** `ProductAttributes` (camelCase) kullanılır.
  - `availability` değerleri: IN_STOCK / OUT_OF_STOCK / PREORDER / BACKORDER.
  - `condition` değerleri: NEW / USED / REFURBISHED.
  - `price` alanı `{ amountMicros, currencyCode }` biçimindedir; tam sayı aritmetiğiyle hesaplanır.
  - `gtins` bir dizi, `identifierExists` bir boolean'dır.
  - Alan adları 2026-10'da resmi `ProductAttributes` referansından doğrulandı.
- **Kimlik doğrulama:** servis hesabı JWT (RS256) kullanılır; scope `https://www.googleapis.com/auth/content`. Token bellekte önbelleğe alınır. Anahtar yalnız **dosya yolu** olarak verilir (`GOOGLE_SERVICE_ACCOUNT_KEY_FILE`).
- **Dayanıklılık:**
  - 408, 429 ve 5xx yanıtları ile zaman aşımları üstel bekleme + jitter ile en fazla 4 deneme yapılır. `Retry-After` başlığına uyulur.
  - 4xx yanıtlar yeniden denenmez.
  - İstek zaman aşımı 15 sn'dir.
  - Hatalar `google.rpc.Status` biçiminden ayrıştırılır (ilk 300 karakter); yanıt gövdesi loglanmaz.
- **Idempotency:** her öğe için kanonik JSON'un SHA-256'sı alınır. Aynı moddaki son başarılı çalışmayla aynı olan öğe gönderilmez. İstek anahtarı `x-goog-request-id = runId:offerId:hash` biçimindedir.
- **Geri alma:** READY'den düşen öğe (fiyat onayı kalkması, stok bilinmez olması, yayından kaldırılma) sonraki çalışmada silinir. 404 yanıtı başarı sayılır.
- **Açma koşulları (hepsi zorunlu, `merchantApiStatus`):**
  - `MERCHANT_API_ENABLED=true`
  - Hesap `MERCHANT_ACCOUNT_ALLOWLIST` içinde
  - Servis hesabı tanımlı
  - `SECRETS_ROTATION_CONFIRMED=true` (Neon parolası yenilendi)
  - Test ortamı değil
  
  Bugün hiçbiri sağlanmıyor. `createMerchantClient` `MerchantDisabledError` fırlatır; LIVE modu reddedilir.
- **Modlar:**
  - `SIMULATED`: yalnız plan çıkarır; durum `NOT_SENT` olur.
  - `MOCK`: bellek içi sahte istemci kullanılır; durum `MOCK_OK`, `MOCK_PARTIAL` veya `MOCK_FAILED` olur.
  - `LIVE`: kapalı.
  
  MOCK çalışma gerçek eşleme tablosunu "senkronlandı" diye **işaretlemez**.
- **PII izolasyonu:** dönüşüm yalnız katalog alanlarını okur. Müşteri, teklif, sipariş ve kullanıcı verisi yük içine giremez (birim testi anahtar listesini doğrular).

## 5. Eski item_id eşlemesi

- **Girdi:** mevcut Merchant hesabından **salt-okunur** dışa aktarılan CSV veya TSV. Beklenen sütunlar: `id`/`item_id`/`offer id`, `title`, `link`, `language`, `feed label`.
- **Eşleme kanıtı (güçlüden zayıfa):**
  1. `link` → 125 eski yönlendirme veya güncel slug
  2. id içindeki eski ürün numarası (`urun-80`, `80_tr`)
- **Rapor:**
  - Eşleşenler
  - Eşleşmeyenler (nedenleriyle)
  - Yinelenen id'ler (aynı id + dil + feedLabel)
  - Çakışmalar (bağlantı ile id numarası farklı ürünü gösteriyor; bir ürüne aynı dil/feedLabel'da birden fazla id düşüyor)
- **Yazma:** önizleme hiçbir `MerchantItemMapping` satırı yazmaz. Sonuç `MerchantSyncRun(mode=MAPPING_PREVIEW)` olarak saklanır. Onaylı eşleme kaydı Sprint 10+ işidir ve ayrı bir karar gerektirir.

## 6. Bugünkü gerçek durum (Neon, salt-okunur)

- **READY:** 40 vitrin ürününden 0 READY. #208 incelemede olduğu için aday değil.
- **Her üründe ortak engeller:**
  - `PRICE_UNVERIFIED` (40)
  - `AVAILABILITY_UNKNOWN` (40)
  - `IDENTIFIER_MISSING`
  - `BRAND_UNVERIFIED`
  - Genel kapılar: hedef teyitsiz, site canlı değil, ödeme kapalı, kargo/iade/ünvan onaysız
- **Görsel:** 9 üründe ana görsel 500 px altında. Bu bugün uyarı, 31.01.2027'den itibaren engel olacak.

Ayrıntılar `docs/sprints/sprint-8-9-report.md` ve Admin › Merchant ekranındadır.
