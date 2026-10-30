# Sprint 8 + 9 hazırlık: SEO, Image SEO, Google Merchant

> Sprint 8'e **geçilmedi**. Bu belge, geçiş için gereken kesin engelleri ve hesap erişimlerini listeler.

## A. Kesin engeller (müşteri aksiyonu)

| # | Engel | Neden | Kimde |
|---|---|---|---|
| 1 | **Neon parola rotasyonu** (`neondb_owner`; yazışmada paylaşıldı, hâlâ yenilenmedi) | Güvenlik; staging/prod öncesi şart | Müşteri, Neon panelinden. Yeni parola yalnız `.env`'e girilir; yazışmalara veya rapora yazılmaz. |
| 2 | 41 ürünün **doğrulanmış fiyatı**, KDV dahil/hariç ve oranı; 11 dil-fiyat çelişkisi ve 6 hatalı indirim kararı | Fiyat yoksa `Offer`, Merchant feed ve indirim etiketi olmaz | Müşteri. Panel: Fiyat merkezi (öneri ve onay iki ayrı kişi) |
| 3 | Ticari unvan, vergi dairesi ve no, MERSİS; kargo ve kurulum politikası | Organization / LocalBusiness verisi, Merchant hesap bilgisi, mesafeli satış | Müşteri. Panel: Ayarlar › doğrula (Süper Yönetici) |
| 4 | Hukuken onaylı KVKK, çerez, mesafeli satış ve iade metinleri | Bu metinler bugün indekslenmiyor ve "onay sürecinde" uyarısı taşıyor | Avukat / müşteri. Panel: İçerik › yasal onay |
| 5 | 74 EN/FR eşleşme kararı (özellikle 8 düşük güvenli ve 2 Kurban Yatırma Kabini); RU/AR içerik sahibi | hreflang ve çok dilli sitemap ancak yayımlanmış çevirilerle dolar | Müşteri / çevirmen. Panel: Çeviriler |
| 6 | #208 kararı (yayın / birleştirme / kaldırma) ve 307 → 301 kararı | Kalıcı URL kararı SEO için gerekli | Müşteri |
| 7 | Doğrulanmış teknik özellikler ve PDF teknik föyler | GEO (AI asistanları), ürün yapılandırılmış verisi, zengin sonuçlar | Müşteri. Panel: Ürün › Teknik bilgi |
| 8 | Stok, temin ve teslim süresi gerçek verisi | Merchant'ta `availability` zorunlu; bugün 41/41 "bilinmiyor" | Müşteri |
| 9 | Marka doğrulaması (eski JSON-LD'de iki farklı yazım), GTIN/MPN veya `identifier_exists=false` kararı | Merchant ürün tanımlayıcıları | Müşteri |
| 10 | 500 px altındaki ana görseller (9 ürün), 6 kırık görselin orijinalleri | Google Images ve Merchant görsel kalitesi | Müşteri |

## B. Hesap erişimleri (Sprint 8+9 başlamadan)

- **Google Search Console:**
  - Mevcut `kornne.com` mülküne kullanıcı erişimi.
  - Indexing ve kapsama raporu, eski URL'lerin performans dökümü.
  - Taşıma günü için site adresi değişikliği gerekmiyor (aynı alan adı).
- **Google Merchant Center:**
  - Hesaba **salt-okunur** ürün dışa aktarımı veya kullanıcı erişimi.
  - Mevcut `offerId`'ler `MerchantItemMapping` tablosuna aynen taşınacak.
  - Feed mi Merchant API mi kararı.
- **Google Analytics 4 ve Google Ads:** dönüşüm ve olay planı için mevcut hesaplara erişim.
- **Hetzner VPS ve staging alan adı / DNS:** staging'de gerçek `robots` ve sitemap testi (bugün `noindex`).
- **E-posta sağlayıcısı:** teklif bildirimleri; Search Console doğrulama e-postaları değil.

## C. Teknik hazırlık durumu

| Konu | Durum |
|---|---|
| Metadata | Ürün, kategori ve CMS sayfası için dil bazlı SEO başlığı ve açıklaması: panelden düzenlenebilir ve vitrine bağlı |
| Canonical / hreflang | Yalnız **yayımlanmış** çevirilerle eşleşir; fallback (çevirisiz) sayfalar ve yasal metinler hreflang dışı ve `noindex`. SEO ekranı her sayfa için hreflang listesini gösterir. |
| Sitemap | Kod hazır: ürün (görseller dahil), kategori, CMS sayfası ve blog, hreflang alternatifleriyle. Ortam `noindex` ve `CATALOG_DATA_VERIFIED=false` olduğu için **bilerek boş**. |
| robots | Staging/dev'de `noindex` korunuyor (`SITE_INDEXABLE`). Bu ayar bu sprintte kaldırılmadı. |
| JSON-LD | Product (Offer **yok**), Breadcrumb, Organization (ayarlardan; ticari unvan yalnız doğrulanınca), WebSite, Article (blog), FAQPage (yalnız yayındaki ve kaynağı belli SSS). AggregateRating ve Review **yok**. |
| Yönlendirmeler | 125 eski URL tek adım (e2e testli); slug değişiklikleri otomatik 301; döngü/zincir kontrolü ekranda (0 sorun). #208 için 307. |
| Merchant hazırlık ekranı | Ürün başına 9 koşul. Sonuç: **0/40 feed'e hazır**; başlıca neden onaylı fiyat ve stok bilgisinin olmaması. |
| Core Web Vitals | Lab ölçümü (mobil simülasyon): ürün 87–88, ana sayfa 85–86, kategori 84–86, teklif 89, kurumsal 90. Gerçek kullanıcı (CrUX) verisi canlıya geçmeden yok. |

## D. Sprint 8+9'da yapılacaklar (öneri)

1. Fiyat ve KDV onayları geldikçe ürün bazında `Offer` (yalnız VERIFIED fiyat) ve sitemap'in açılması (`CATALOG_DATA_VERIFIED` kararı).
2. Search Console verisiyle eski URL → yeni URL doğrulaması (200/301) ve indeks takibi.
3. Görsel sitemap ve görsel SEO; alt metinlerin editör onayı (114 otomatik taslak).
4. Merchant: offerId eşleşmesi, dry-run diff, sonra onaylı geçiş. **Canlı feed müşteri onayı olmadan yayımlanmaz.**
5. Lighthouse 90+ için hedefler:
   - Hetzner üzerinde HTTP/2 + Brotli + CDN ölçümü.
   - Hero görsel boyutu.
   - Ortak istemci JS'inin azaltılması.
