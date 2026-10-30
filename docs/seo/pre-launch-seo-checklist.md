# Yayın öncesi SEO kontrol listesi (Sprint 10)

Komutlar ve ham çıktılar `docs/qa/sprint-10-11-test-results.md` içindedir. Durum etiketleri:

- `DONE`: yerelde, testle doğrulandı.
- `READY`: araç hazır; canlı ortamda çalıştırılacak.
- `BLOCKED`: müşteri kararı gerekiyor.

## A. Ortam ayrımı (kanıtlı)

| Kontrol | Staging / geliştirme | Production (çevrimdışı prod-like :3471) | Durum |
|---|---|---|---|
| `SITE_INDEXABLE` | `false` | `true` yalnız go-live anında | DONE |
| meta robots + `X-Robots-Tag` | noindex (sayfa + görsel + admin) | TR katalog index; arama/sepet/ödeme/teklif/iletişim/admin noindex | DONE |
| robots.txt | `Disallow: /` | Allow; `/admin`, `/api/`, arama ve facet parametreleri kapalı; kendi Sitemap satırı | DONE |
| sitemap.xml | boş | 46 URL, 116 görsel, gerçek lastmod; admin/arama yok | DONE |
| canonical origin | `SITE_URL` (staging host) | `SITE_URL=https://kornne.com` | DONE: staging ve prod ayrı `.env` ve ayrı build ile karışmaz |
| Basic Auth | Nginx `auth_basic` + uygulama katmanı | yok | READY (şablon) |
| Search Console doğrulama etiketi | yok | `GOOGLE_SITE_VERIFICATION` varsa | DONE (test kimliğiyle) |

## B. URL kapsamı

| Kontrol | Sonuç | Durum |
|---|---|---|
| 263 URL denetimi (dev + prodlike) | 0 hata, 4 uyarı (EN/FR/RU ana sayfa başlığı uzun; admin login açıklaması yok) | DONE |
| 125 eski yönlendirme | 301, tek adım, hedef 200. `scripts/release/smoke.mjs` canlıda tekrar çalıştırılacak | DONE / READY |
| #208 | 307 → birincil kategori, değiştirilmedi | DONE (karar: BLOCKED) |
| Gerçek 404 | Bilinmeyen yol ve çevirisiz ürün adresi 404 | DONE |
| Filtre/sıralama | canonical temel listeye; robots.txt facet'leri kapatır | DONE |
| Sayfalama | self-canonical, indekslenebilir, sitemap dışı | DONE |

## C. Çoklu dil
- **TR:** indekslenebilir; hreflang yok (tek SEO dili).
- **EN/FR/RU/AR:** arayüz çevrilmiş, ürün ve kategori içerikleri onaysız (74 eşleşme bekliyor). Bu dillerin sayfaları **noindex**, hreflang yok. `SEO_LOCALES` yalnız çeviriler onaylanınca genişletilir — **BLOCKED** (müşteri).
- **lang/dir:** 5 dil × 4 motorda (Chrome, Chromium, Firefox, WebKit) test edildi; AR `dir=rtl`. **DONE**

## D. Yapılandırılmış veri
- **Mevcut türler:** Organization (ünvan yalnız doğrulanınca), WebSite, BreadcrumbList, CollectionPage, Product.
- **Yasak türler:** Offer, AggregateRating, Review yok. **DONE** (test).
- **Rich Results Test:** canlı URL gerektirir → go-live sonrası **READY**. Offer olmadığı için ürün zengin sonucu iddia edilmez.

## E. Google Görsel SEO — aksiyon listesi

| # | İş | Kimde | Durum |
|---|---|---|---|
| 1 | 9 ana görsel 500×500 altında (#120, #122, #123, #125, #126, #127, #128, #130, #131) → ≥ 1500 px **gerçek** fotoğraf. Yapay büyütme yapılmaz | Müşteri | BLOCKED |
| 2 | 6 kaynakta kırık görsel (`belge1–5.jpg`, `Kornne-Klasik-Kesim-Hucre-61.jpg`) — 404 kalır; orijinal varsa yüklenir | Müşteri | BLOCKED |
| 3 | 112 vitrin görseline editör alt metni (ana görseller öncelikli; dekoratif görseller `alt=""` olabilir) | Editör | Araç hazır (Admin › SEO › Görsel SEO) |
| 4 | 1 yetim dosya: PNG içerik, `.jpeg` uzantı (`1644837286-620a39a65e3f2.jpeg`) — vitrinde kullanılmıyor; eski URL korunur | Bilgi | Raporlandı |
| 5 | 5 WhatsApp kaynaklı görsel — filigran/yazı manuel kontrolü ve kullanım izni | Müşteri | BLOCKED |
| 6 | 445 orijinal SHA-256 bütünlüğü | — | DONE (445/445, HTTP üzerinden) |
| 7 | Görsel sitemap öğeleri (yalnız erişilebilir gerçek görseller) | — | DONE (prodlike) |

## F. GEO / içerik
- **Öneriler hazır:** Admin › SEO › GEO önerileri (yapılandırılmamış teknik satırlar, şartname dili, SSS eksikliği). İçerik üretilmez. Uzman onaylı rehber içerik ve SSS → **BLOCKED** (kaynak + onay).
- **Organization ünvanı:** doğrulanmadı → **BLOCKED** (müşteri).

## G. Performans (mobil Lighthouse, 3 koşu ortancası) — bkz. test sonuçları
Ana, kategori, ürün ≥ 90 hedefi ve Arapça iyileştirmesi; ayrıntı rapordadır. CLS 0, erişilebilirlik 100.

## H. Go-live günü (sıra)
1. `SITE_INDEXABLE=true`, `CATALOG_DATA_VERIFIED=true` (yalnız onaylarla), `SITE_URL=https://kornne.com` ile **production build** alınır.
2. `node scripts/release/smoke.mjs --base=https://kornne.com --mode=production` çalıştırılır (125 yönlendirme, robots, sitemap, canonical, başlıklar, TLS).
3. `npx tsx scripts/seo/audit.ts`: canlı alan adı yerel betiğe kapalıdır. Canlıda yalnız smoke kullanılır; audit staging kopyasında tekrarlanır.
4. Search Console:
   - Domain doğrulaması
   - Sitemap gönderimi
   - URL Denetimi (ana sayfa, 2 kategori, 3 ürün)
5. 24 saat / 7 gün / 30 gün: kapsam raporu, 404 raporu, eski URL trafiği, Core Web Vitals (CrUX).
