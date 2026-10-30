# Google Merchant Center Hazırlık Raporu

**Durum: Merchant Center hesabına erişimim YOK. Hesap kontrol edilmedi; hiçbir veri okunmadı veya yazılmadı.**

## 1. Korunması gerekenler (müşteri hesabı)

- Merchant hesap ID, bağlı Google Ads hesabı, işletme doğrulaması.
- **Birincil veri kaynağı türü** (otomatik/web taraması, dosya feed'i, eski Content API) ve ek kaynaklar.
- Her ürünün **`offerId`**, `contentLanguage`, `feedLabel`/hedef ülke değerleri — yeni sistemde `MerchantItemMapping` tablosu bu kimlikleri **olduğu gibi** saklar (`@@unique([offerId, contentLanguage, feedLabel])`).
- Kargo, iade ve vergi ayarları; ürün durumları ve ret nedenleri.

Kamuya açık sitede feed URL'si veya `offerId` izine rastlanmadı (robots/sitemap da yok) → mevcut kaynak muhtemelen **otomatik (web taraması)** ya da elle yüklenen dosya. Bu **varsayımdır**; hesapta doğrulanmalı.

## 2. Gereken salt-okunur erişim

1. Merchant Center'da **Standart erişim (salt okunur yeterli)** kullanıcı daveti veya hesap sahibinin ekran paylaşımı.
2. Ürünler → Tüm ürünler: **CSV dışa aktarımı** (id, title, link, price, availability, status, issues).
3. Veri kaynakları sayfasının ekran görüntüsü (tür, hedef ülke/dil, feed label, zamanlama).
4. Kargo ve iade politikaları ekran görüntüsü.
5. (API tercih edilirse) Google Cloud projesi + Merchant API için **salt-okunur** service account; Sprint 9'dan önce yazma yetkisi verilmez.

## 3. Mevcut verinin uygunluğu (vitrin verisine göre)

| Alan | Durum | Engel |
|---|---|---|
| `id` | bilinmiyor | Hesaptan alınmalı |
| `title` / `description` | var / 21 üründe çok zayıf | İçerik zenginleştirme (gerçek kaynakla) |
| `link` | eski URL'ler korunuyor (`/urun/<slug>`) | — |
| `image_link` | var; 9 ürünün ana görseli < 500 px, bazıları WhatsApp fotoğrafı | 31.01.2027 asgari çözünürlük şartı |
| `price` / `sale_price` | var ama 11 üründe dil bazlı çelişki, 6 üründe geçersiz indirim, KDV belirsiz | Fiyat onayı |
| `availability` | **yok** | Stok/temin bilgisi gerekli |
| `brand` | iki yazım, doğrulanmamış | Müşteri onayı |
| `gtin` / `mpn` | yok | Uydurulmayacak; `identifier_exists=no` ancak gerçekten yoksa |
| `condition` | belirtilmemiş (yeni varsayımı) | Onay |
| `shipping` / `return policy` | yasal metin şablon | Gerçek kurallar |

## 4. Mimari karar (Sprint 9'da kesinleşir)

- Eski **Content API for Shopping kullanılmayacak** (kullanımdan kalktı). Yeni entegrasyon gerekiyorsa **Merchant API**.
- Seçenekler: (a) sabit URL'li XML/TSV dosya feed'i `/feeds/google-merchant-tr.xml` (en düşük risk, hesapta yeni kaynak olarak eklenir); (b) Merchant API `productInputs` ile itme. Hesap incelemesinden sonra seçilecek.
- Feed yalnızca **doğrulanmış ve fiyatlı** ürünleri içerir; `QUOTE_ONLY` (teklif usulü) makineler hariç tutulur.
- Fiyat formatı: feed/JSON-LD `1807479.94 TRY`, arayüz `1.807.479,94 TL` — tek kaynak `Price.amountMinor` (kuruş, BigInt). Kod: `src/lib/money.ts`.
- Geçiş: yeni kaynak **eski kaynak silinmeden** test → karşılaştırma (`MerchantSyncRun` dry-run) → aynı `offerId`'lerle devreye alma → 2–4 hafta ret oranı ve Ads izleme.

## 5. Bu sprintte yapılanlar

- `MerchantItemMapping`, `MerchantSyncRun` tabloları (Neon'a migrasyon uygulandı, **boş**).
- Ürün sayfalarında `Product` JSON-LD **Offer'sız** (fiyat doğrulanana kadar); sahte rating kaldırıldı.
- Admin'de "Merchant Center" modül iskeleti (S9).
