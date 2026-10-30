# Veri Kalitesi ve Doğrulama Kuyruğu (Sprint 0)

Kaynak: `product-inventory.csv` → `flags` sütunu, `locale-product-mapping.csv`, `media-inventory.csv`. Hiçbir kayıt düzeltilmedi; her madde müşteri/yetkili veri onayı bekliyor. Yeni sitede bu verilerden hiçbiri **doğrulanmış** sayılmıyor (`verification_status = unverified`, sayfalar `noindex`).

## Ürün bayrakları (41 TR ürün)

| Bayrak | Ürün | Açıklama | Yeni sitedeki davranış |
|---|---:|---|---|
| `jsonld_aggregate_rating_without_reviews` | 41 | Yorum olmadan 5/5 puan | Rating/Review **hiç üretilmiyor** |
| `jsonld_aggregate_offer_mismatch` | 41 | JSON-LD fiyatı sayfadan farklı | Offer yalnız doğrulanmış fiyatla |
| `image_alt_missing` | 41 | Görsel alt metni yok | Geçici alt = ürün adı (+ sıra); S2'de gerçek alt metinler |
| `stock_code_only_in_short_desc` | 41 | Stok kodu (1, 2, 20…) yalnız kısa açıklamada | `stock_code_candidate`; SKU olarak kabul edilmedi |
| `description_thin_or_empty` | 21 | Açıklama < 40 karakter | "Açıklama henüz eklenmedi" mesajı |
| `short_desc_title_mismatch` | 12 | Kısa açıklama başka ürün adı | Kuyrukta (ör. #80 → "Klasik Kesim Hücresi", #137/#209 → "Eurohawk Kanca") |
| `old_price_not_higher_than_price` | 6 | Eski fiyat ≤ satış (−%0 / negatif) | İndirim etiketi **gösterilmiyor** |
| `jsonld_sku_duplicate` | 6 | SKU yinelenmiş (20, 30, 41) | SKU boş bırakıldı |
| `has_variants_price_per_variant_unverified` | 1 | #107 varyant fiyatı AJAX | Seçenekler bilgi amaçlı listeleniyor |

## Fiyat kontrol listesi

Master plandaki örnekler doğrulandı (TR vitrin, 21.10.2026):

| Ürün | Eski | Güncel | Not |
|---|---:|---:|---|
| Dairesel Kesim Hücresi (#78) | 1.903.422,05 | 1.807.479,94 | %5 indirim |
| Kurban Yatırma Kabini (#80) | 1.060.133,80 | 375.865,62 | %64 — olağandışı; **FR kaydında 867.382,20** |
| İkiz Ray Kantar (#121) | 163.597,92 | 67.463,06 | %59; **EN/FR kaydında 137.190,95** |
| Lama ray Kancası Büyük Baş (#136) | 3.662,28 | 4.336,91 | Eski < yeni → indirim değil |
| İkiz Ray Kancası Paslanmaz (#104), Kurban Testeresi (#135), #208, #209, #217 | = | = | "%0" etiketi |

**Dil bazlı fiyat çelişkisi (11 ürün)**: #79 (EN 4.818,79 ↔ TR 1.108.321,70), #80, #100, #103, #104, #105, #115 (FR 887,00 ↔ TR 42.742,67), #121, #135, #136, #137. Yeni sitede **tek fiyat kaynağı TR kaydı**; çelişki çözümü müşteri onayına bağlı.

KDV dahil/haric, para birimi (TL varsayıldı) ve büyük makinelerde kurulum/nakliye bedeli **bilinmiyor**.

## Medya

- 6 kırık görsel (404), TR ürün görsellerinden 16'sı (9 ana görsel) < 500×500, alt metin yok, anlamsız dosya adları (`IMG-2024…`, `WhatsApp Görsel…`).
- EN/FR görselleri yeniden yüklenmiş kopyalar (aynı fotoğraf, farklı dosya adı) — `duplicate_of` sütunu SHA-256 ile tespit eder.

## İçerik / yasal

- Satıcı kimliği üç farklı (Mezbaha Teknolojileri / KORNNE A.Ş. / boş) — yasal metinler **yayın öncesi hukuk onayı** gerektiriyor.
- Mesafeli satış sözleşmesinde vergi dairesi, vergi no, kargo ücreti boş/şablon.
- Banka sayfası sıfır IBAN — **yeni sitede banka bilgisi gösterilmiyor**.
- Kurumsal metin "Mezbaha Teknolojileri"yi anlatıyor; EN/FR/RU/AR kurumsal sayfaların gövdesi boş.
- Açıklamalarda yazım/kodlama sorunları ("pnomatik", "alısmaktadır", "İkiye Bölge").

## URL

- `kategori/x/1` = `kategori/x` (yinelenen) → 301.
- Dil sürümleri oturuma bağlı, canonical'lar var olmayan URL'lere işaret ediyor; FR ve EN "all-products" aynı slug'ı kullanıyor (çakışma: EN'ye yönlendirildi).
- Olmayan ürün URL'leri 200 (soft-404) → yeni sitede gerçek 404.
