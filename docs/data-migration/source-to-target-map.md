# Kaynak → Hedef Veri Eşlemesi (Sprint 2)

Kaynak: Sprint 0 salt-okunur kornne.com taraması (`src/data/source-snapshot/*`, `docs/audit/*.csv`). Hedef: KORNNE Neon veritabanı (proje `solitary-surf-70416930`, branch `br-red-water-b9p4hqhg`, endpoint `ep-silent-dew-b9g275pf`, veritabanı `neondb`). Kod: `scripts/import/lib/plan.ts` (saf eşleme), `scripts/import/legacy-import.ts` (yazma).

## Envanter mutabakatı

| Kaynak | Sayı | Hedef |
|---|---:|---|
| TR ürün kaydı (`urun-id` 78–217) | **41** | 41 `Product` (`sourceKey = kornne.com:<id>`) + 41 `ProductTranslation(tr)` + 41 `LegacySourceRecord(product, tr)` |
| EN ürün kaydı (id 140–176, ayrı kayıt) | **36** | 36 `LegacySourceRecord(product, en)` + 36 `LegacyMatchSuggestion` — **ürüne birleştirilmedi** |
| FR ürün kaydı (id 177–216, ayrı kayıt) | **38** | 38 `LegacySourceRecord(product, fr)` + 38 `LegacyMatchSuggestion` |
| RU / AR ürün kaydı | **0** | Kaynakta yok → ürün çevirisi ve ürün sayfası **yok** |
| Kategori (4 × 5 dil) | 20 sayfa | 4 `Category` (`key`) + 20 `CategoryTranslation` (TR `LEGACY_SOURCE`, diğer diller `IN_REVIEW`) + 20 köken kaydı |
| Kurumsal/yasal sayfa | 8 | 8 `LegacySourceRecord(page)` (CMS tablolarına aktarım Sprint 7) |
| Medya URL'si | 451 | **445** `MediaAsset` (bayt-bayt orijinal) + 451 `LegacySourceRecord(media)` (6'sı `missing_at_source`) |
| Ürün–görsel bağı | 119 | 118 `ProductMedia` (1 görsel kaynakta 404) |
| Ürün–kategori bağı | 79 | 79 `ProductCategory` (+ `isPrimary`) |
| Varyant | 2 (#107) | 2 `ProductVariant` (`sourceKey = kornne.com:107:905/906`) |
| Fiyat | 41 | 41 `Price` — **hepsi `UNVERIFIED`** |
| Stok | yok | 41 `Inventory(availability = UNKNOWN)` |
| Eski URL 301 | 125 | 125 `Redirect(source = LEGACY_AUDIT)` |
| **Toplam köken kaydı** | | **594** `LegacySourceRecord` |

Vitrin "Tüm Ürünler: 40" diyordu; 41. kayıt **#208 İkizray Kurban Kancası** yalnız Kurban kategorisinin 2. sayfasında ve kendi URL'sinde görünüyordu. Sprint 2 dokümanı onu "vitrine çıkmayan" olarak tanımlıyor; tarama kanıtı kısmen görünür olduğunu gösteriyor (çelişki kaydedildi). Karar: **`status = DRAFT`, `needsReview = true`** — vitrinde yok, sayılara girmiyor, eski URL'si **307 (geçici)** ile Kurban kategorisine gidiyor; silinmedi.

## Kimlik anahtarları (tekrar çalıştırmada çift kayıt engeli)

| Varlık | Doğal anahtar |
|---|---|
| Product | `sourceKey` = `kornne.com:<urun-id>` (unique) |
| ProductTranslation | `(productId, locale)` + `(locale, slug)` unique |
| Category | `key` = eski TR slug (unique) |
| MediaAsset | `storageKey` = `originals/<orijinal dosya adı>` + `publicPath` = `/upload/<ad>` (unique) |
| ProductMedia / ProductCategory | bileşik birincil anahtar |
| ProductVariant | `sourceKey` = `kornne.com:<urun-id>:<varyant-id>` |
| LegacySourceRecord | `(entityType, legacyId, locale)` |
| LegacyMatchSuggestion | `(sourceLocale, sourceLegacyId)` |
| Redirect | `fromPath` |

## Ham veri politikası (sessiz değişiklik yok)

- Her kaynak kaydın **tam ham hali** `LegacySourceRecord.payload` içinde: başlık, slug, ham fiyat metni (`"1.807.479,94 TL"`), eski fiyat, indirim etiketi, stok kodu adayı, JSON-LD sku/marka/lowPrice, kısa açıklama, ham açıklama HTML'i, görsel URL'leri, varyantlar, görüntülenme sayısı, WhatsApp linki, bayraklar, kaynak URL, tarama zamanı, sayfa SHA-256.
- `ProductTranslation.descriptionHtml` = ham HTML'in **sanitize edilmiş kopyası** (script/style/olay öznitelikleri yok, ikinci `<h1>` → `<h2>`); ham orijinal köken kaydında.
- `Price`: `amountMinor` / `compareAtMinor` (kuruş, BigInt) + `rawAmount` / `rawCompareAt` (orijinal metin) + `sourceLocale = tr` + `status = UNVERIFIED` + `reviewReasons` (`vat_unknown`, `currency_unconfirmed`, gerekiyorsa `invalid_discount_compare_at_not_higher`). Eski fiyatı satıştan düşük olan kayıtlar **olduğu gibi** saklandı; düzeltilmedi.
- Para birimi `TRY` (sitedeki "TL"); KDV durumu bilinmiyor (`vatIncluded = null`).
- SKU: doğrulanmadığı için `Product.sku = null`; stok kodu adayı yalnız köken kaydında.
- Marka: iki farklı yazım olduğundan `Brand` oluşturulmadı.

## Fiyat ve vitrin kuralı

Müşteriye gösterilen fiyat, `Offer` JSON-LD, sepet ve Merchant feed **yalnızca `Price.status = VERIFIED`** iken mümkün. Bugün 0/41 doğrulanmış → tüm ürünler **Teklif Al** akışında (WhatsApp / e-posta / telefon). Ham fiyatlar yalnız admin'de "doğrulanmamış" etiketiyle görünür.

## EN/FR eşleşme önerileri

Ayrı dil kayıtları **otomatik birleştirilmedi**. Her biri için güven puanı ve kanıt (`LegacyMatchSuggestion.evidence`):

| Sinyal | Puan |
|---|---:|
| Kayıt sırası (EN/FR kayıtları TR ile aynı sırada açılmış) | 20 |
| En az bir **aynı fotoğraf dosyası** (SHA-256 eşit) | 45 |
| Aynı satış fiyatı | 25 |
| Aynı eski fiyat | 10 |

Sonuç: 74 öneri → **51 yüksek (≥85), 15 orta (60–84), 8 düşük (<60)**. Fiyatı TR'den farklı olan 11 ürün (data-quality-issues.md) orta/düşük gruptadır. Onay **Admin › Katalog QA**'da insan tarafından verilir; onay: eski kaydın başlık/açıklamasını `LEGACY_SOURCE` çevirisi olarak ekler, o dilde alt metin taslakları üretir, eski URL'nin yönlendirmesini yeni ürün sayfasına çevirir, audit log yazar. **Fiyat eski EN/FR kaydından alınmaz.**

## Dil ve URL davranışı (Sprint 3 vitrini)

| Durum | Davranış |
|---|---|
| TR | 40 ürün sayfası, eski `/urun/<slug>` aynen |
| EN/FR (onay yok) | Ürün sayfası **yok**; listelerde TR içerik + "TR" rozeti, kart TR sayfasına (`hreflang=tr`) bağlanır; eski EN/FR ürün URL'si → o dilin "tüm ürünler" listesine 301 |
| EN/FR (onaylı) | `/en/product/<legacy-slug>` üretilir, hreflang'e eklenir, eski URL bu sayfaya 301 |
| RU/AR | Ürün sayfası üretilmez (404), listeler TR'ye fallback; kategori adları kaynaktaki RU/AR adlar |

## Örnek uçtan uca eşleme (#78)

| Alan | Eski (kornne.com) | Yeni |
|---|---|---|
| URL | `/urun/dairesel-kesim-hucresi` | `/urun/dairesel-kesim-hucresi` (aynı, 200) |
| EN URL | `/urun/circular-cutting-cell` (oturumla) | 301 → `/en/category/all-products` (öneri #140 güven 100, onay bekliyor) |
| Görsel | `/upload/Kornne-Dairesel-Hucre-63.jpg` | aynı yol, SHA-256 aynı; `MediaAsset` + `ProductMedia(isPrimary)` |
| Kategori | breadcrumb "Mezbaha Ekipmanları" | `ProductCategory(mezbaha-ekipmanlari, isPrimary)` + robotik + tüm ürünler listesi |
| Fiyat | 1.807.479,94 TL (eski 1.903.422,05) | `Price` UNVERIFIED, ham metinler saklı; vitrinde "Fiyat teklif ile verilir" |
| Dil | TR | `<html lang="tr">`, `LEGACY_SOURCE` |

Bu karşılaştırma `tests/e2e/sprint3.spec.ts` → "end-to-end: one real product…" testinde otomatik doğrulanır.
