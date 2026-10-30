# Veri Modeli (Sprint 1 taslağı)

Şema: `prisma/schema.prisma` · Migrasyon: `prisma/migrations/20261021212815_init` · **Uygulandı:** KORNNE Neon veritabanına (`prisma migrate deploy`, 22.10.2026). Tablolar boş; içe aktarma Sprint 2.

## İlkeler

1. **Para = tam sayı kuruş** (`BigInt amountMinor`), float yok. Görüntüleme `src/lib/money.ts`.
2. **Fiyat satırları eklemeli** (append-only): değişiklik yeni `Price` satırıdır → fiyat geçmişi kendiliğinden; `approvedById/approvedAt` onay izi.
3. **İndirim etiketi** yalnız `compareAtMinor > amountMinor` ise.
4. **Doğrulanmamış hiçbir değer uydurulmaz**: `sku`, `gtin`, `mpn`, `brand`, `weightGrams`, spesifikasyonlar boş kalır; `verificationStatus` alanları.
5. **Köken izi**: her eski kayıt `LegacySourceRecord` (entityType, legacyId, locale, sourceUrl, capturedAt, pageSha256, ham payload, targetId, migrationStatus).
6. **Çeviri tabloları** (`*Translation`, `@@unique([locale, slug])`) + `TranslationStatus` (MISSING → MACHINE_DRAFT → DRAFT → IN_REVIEW → APPROVED). Sadece APPROVED/kaynak içerik hreflang'e girer.
7. **Merchant kimlikleri korunur**: `MerchantItemMapping.offerId` canlı hesaptan kopyalanır, iç ID'den bağımsızdır.

## Varlıklar

| Model | Amaç | Not |
|---|---|---|
| `User`, `Session`, `LoginAttempt` | Admin kimlik, DB oturumu (token SHA-256), kilitleme | Rol: SUPER_ADMIN, ADMIN, PRODUCT_EDITOR, ORDER_OPERATOR, SEO_EDITOR; `mfaSecretEnc` (S6) |
| `AuditLog` | Tüm admin işlemleri | Snapshot'lar redakte edilir (`src/lib/audit-log.ts`) |
| `Brand` | Marka | `status` UNVERIFIED (iki farklı yazım) |
| `Category`, `CategoryTranslation` | Ağaç + çeviri | `isAllProducts` (eski "Tüm Ürünler") |
| `Product`, `ProductTranslation` | Ürün + çeviri | `saleMode` CART / QUOTE_ONLY / CART_AND_QUOTE |
| `ProductCategory` | Çoktan çoğa, `isPrimary` | Eski sitede ürün 2–4 kategoride |
| `ProductVariant` | Varyant (`labels` dil bazlı JSON) | Yalnız #107'de var |
| `ProductSpec` | Teknik özellik (anahtar + dil bazlı etiket/değer + birim) | `status` VERIFIED olmadan yayınlanmaz |
| `ProductRelation` | İlgili ürünler | |
| `Price` | Satış/eski fiyat, KDV, geçerlilik, kaynak, onay | `vatIncluded` **[VARSAYIM]** |
| `Inventory` | `availability` + adet + teslim süresi | Eski sitede bilgi yok → UNKNOWN |
| `MediaAsset`, `MediaTranslation`, `ProductMedia` | Orijinal dosya (storageKey, sha256, boyut) + dil bazlı alt | `publicPath` eski `/upload/<ad>` yolunu korur |
| `Customer` | Müşteri | `passwordHash` null — eski hash'ler taşınmaz, sıfırlama akışı |
| `Order`, `OrderItem` | Sipariş + kalem snapshot'ları | `idempotencyKey`, `channel` (WEB/WHATSAPP/PHONE/QUOTE) — **[VARSAYIM]**: ödeme akışı S5'te netleşecek |
| `Page`, `PageTranslation` | Kurumsal/yasal sayfalar | `legalApprovedAt` olmadan yasal metin yayınlanmaz |
| `Redirect` | 301/308 | `source` LEGACY_AUDIT / ADMIN / SLUG_CHANGE, isabet sayacı |
| `MerchantItemMapping`, `MerchantSyncRun` | Merchant eşleme ve senkron geçmişi | `@@unique([offerId, contentLanguage, feedLabel])` |
| `LegacySourceRecord` | Eski veri kökeni | |

## Ticari varsayımlar (onay bekliyor)

| Alan | Varsayım | Kaynak soru |
|---|---|---|
| Para birimi | TRY | open-questions #4 |
| KDV | bilinmiyor (`vatIncluded` null) | #4 |
| Satış modu | Varsayılan CART_AND_QUOTE; büyük makineler QUOTE_ONLY olabilir | #6 |
| Ödeme | Havale + WhatsApp; POS yok | #8 |
| Kargo ağırlığı | yok | #4, #7 |

## Master plandaki tablolarla eşleşme

`product_variants`, `product_specs`/`spec_values` → `ProductVariant`, `ProductSpec`; `price_history` → `Price` (append-only); `campaigns` → `PriceSource.CAMPAIGN` + geçerlilik tarihleri (ayrı tablo S6'da gerekirse); `accounts` → `Customer`; `payments`, `shipments`, `quotes`, `posts`, `seo_metadata`, `merchant_sync_errors` → ilgili sprintte eklenecek (S5/S7/S8/S9) — şema bilinçli olarak bugünün kesin ihtiyacıyla sınırlı tutuldu.
