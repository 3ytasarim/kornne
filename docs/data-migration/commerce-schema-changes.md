# Ticari şema değişiklikleri — Sprint 5

**Migration:** `prisma/migrations/20261022010000_sprint5_quotes_commerce/migration.sql`
**Hedef:** Neon `neondb` (proje `solitary-surf-70416930`, dal `br-red-water-b9p4hqhg`, endpoint `ep-silent-dew-b9g275pf`, PostgreSQL 18.6)
**Uygulama:** `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` ile SQL üretildi ve satır satır incelendi. Ardından `prisma migrate deploy` ile uygulandı. `migrate reset`, `db push`, DROP, TRUNCATE veya DELETE **kullanılmadı**.

## Yalnız eklemeli değişiklikler

| Tür | Değişiklik |
|---|---|
| Yeni enum | `QuoteStatus` (NEW, IN_REVIEW, RESPONDED, CLOSED, SPAM), `QuoteSource` (PRODUCT_PAGE, QUOTE_LIST), `CartStatus`, `PaymentAttemptStatus` |
| Enum'a değer ekleme | `OrderStatus` + `DRAFT`, `FAILED` |
| Mevcut tabloya kolon | `Order.accessTokenHash` (nullable, unique), `Order.isTest` (default false) — `Order` tablosu boştu (0 satır) |
| Yeni tablo (8) | `QuoteRequest`, `QuoteItem`, `QuoteStatusEvent`, `Cart`, `CartItem`, `OrderStatusEvent`, `PaymentAttempt`, `PaymentWebhookEvent` |
| Kısıtlar | `QuoteRequest.reference`/`idempotencyKey` unique; `CartItem (cartId, productId, variantKey)` unique; `PaymentWebhookEvent (provider, eventId)` unique (replay koruması); yeni tablolara FK |

- **`QuoteItem` tablosunda fiyat, tutar veya toplam kolonu yok.** Bu tasarım gereğidir; onaysız fiyat snapshot'a bile yazılmaz.
- SQL'de yıkıcı ifade sayımı: `DROP`, `TRUNCATE`, `DELETE`, `ALTER … DROP`, `SET NOT NULL` (mevcut kolon) → **0**.

## Kayıt sayımları (kanıt: `evidence/s45-before-migration.json`, `evidence/s45-after-migration.json`)

| Tablo | Önce | Sonra | Sprint sonu (tüm testlerden sonra) |
|---|---:|---:|---:|
| Product | 41 | 41 | 41 |
| MediaAsset | 445 | 445 | 445 |
| Redirect | 125 | 125 | 125 |
| Price (hepsi UNVERIFIED) | 41 | 41 | 41 (VERIFIED: 0) |
| LegacyMatchSuggestion (hepsi SUGGESTED) | 74 | 74 | 74 (onaylanan: 0) |
| LegacySourceRecord | 594 | 594 | 594 |
| User / Session / AuditLog / LoginAttempt | 0 | 0 | 0 |
| QuoteRequest / QuoteItem / Cart / Order / PaymentAttempt | — | 0 | 0 |

- Mevcut tablolardan yalnız `_prisma_migrations` değişti (1 satır eklendi).
- Sprint sonu sayımları `data/qa-logs/s45-residue.json` dosyasında (`scripts/qa/s45-residue.mjs`, salt okunur).
- Importer dry-run sıfır değişiklik verdi: `data/qa-logs/s45-import-dryrun.log`.
- 445 medya hash'i eşleşti: `data/qa-logs/s45-verify-media.log`.

## İzole test şeması

- Aynı veritabanında ayrı bir **`kornne_test`** şeması kullanılıyor (38 tablo). `npm run db:test:deploy` aynı migration'ları `?schema=kornne_test` ile uygular.
  - Neon API erişimi olmadığı için ayrı dal açılamadı; şema izolasyonu bu yüzden seçildi.
- Entegrasyon testleri yalnız bu şemaya bağlanır (`PrismaPg(..., { schema: "kornne_test" })`).
  - Fixture ürünler `kornne.com:99xxxxx` aralığında üretilir, test sonunda silinir.
  - Bu kayıtlar `public` kataloguna, mağazaya ve admin'e görünmez.
- Playwright testleri gerçek akışı `public` şemasında çalıştırır. Bu testler yalnız `@kornne.test` e-postalı teklif kayıtları oluşturur. `global-teardown` bunları ve audit satırlarını siler. Sprint sonu sayımı: `QuoteRequest = 0`.

## Geri dönüş planı

Migration yalnız ekleme yaptığı için mevcut veriye dokunmadan geri alınabilir. **Uygulanmadı**; yalnız gerektiğinde, yedek alındıktan sonra ve onayla uygulanır:

1. Neon konsolundan dalın anlık görüntüsünü / point-in-time restore noktasını not al.
2. Uygulama kodunu Sprint 3 sürümüne döndür; yeni tablolar okunmaz hale gelir.
3. Gerekirse sırayla şunları kaldır:
   - FK'ler.
   - 8 yeni tablo.
   - `Order.accessTokenHash` ve `Order.isTest`.
   - 4 yeni enum.
4. `OrderStatus` enum'undaki `DRAFT`/`FAILED` değerleri PostgreSQL'de doğrudan silinemez. Kullanılmadıkları sürece zararsızdır.
5. `_prisma_migrations` içindeki ilgili satırı `prisma migrate resolve --rolled-back` ile işaretle.
