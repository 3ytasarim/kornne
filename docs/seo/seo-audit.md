# Teknik SEO denetimi (Sprint 8)

**Kapsam ve yöntem:**

- **Ne denetlendi:** uygulamanın gerçek HTTP yanıtları, URL bazında.
- **Envanter:** `src/lib/seo/inventory.ts` (veritabanından türetilir).
- **Analiz:** `src/lib/seo/audit.ts`.
- **İki ayrı ortam:**

| Ortam | Adres | Build | Ayarlar |
|---|---|---|---|
| **dev** (bugünkü geliştirme/staging davranışı) | `localhost:3470` | `.next` | `SITE_INDEXABLE=false` |
| **prodlike** (çevrimdışı üretim önizlemesi) | `localhost:3471` | `.next-prodlike` | `SITE_INDEXABLE=true`, `CATALOG_DATA_VERIFIED=true`, `SITE_URL=http://localhost:3471`, `SEO_LOCALES=tr` |

- **Veri:** iki sunucu da Neon'un yerel, salt-okunur kopyasını (`kornne_e2e`) kullanır.
- **Dış erişim:** sahte alan adı kullanılmadı, hiçbir şey yayımlanmadı, Google'a hiçbir şey gönderilmedi.

**Komutlar:**

```bash
npx tsx scripts/seo/audit.ts --base=http://localhost:3470 --mode=dev
npx tsx scripts/seo/audit.ts --base=http://localhost:3471 --mode=prodlike
```

Ham sonuçlar: `data/qa-logs/seo-audit-{dev,prodlike}.json`. Aynı denetim Admin › SEO › SEO QA ekranından da çalışır ve CSV olarak dışa aktarılır (kişisel veri içermez).

## 1. Sonuç özeti (son koşu, 22–23.10.2026)

| | dev | prodlike |
|---|---|---|
| Denetlenen URL | 263 | 263 |
| **Hata** | **0** | **0** |
| Uyarı | 4 | 4 |
| HTTP dağılımı | 118×200, 125×301, 1×307, 19×404 | aynı |
| İndekslenebilir 200 | **0** (bilinçli) | 53 (ana 1, kategori 4 + sayfa-2 3, filtreli 4 → canonical temel listeye, ürün 40, kurumsal 1) |
| robots.txt | `Disallow: /` | `Allow: /`; `/admin`, `/api/`, arama ve filtre parametreleri kapalı; `Sitemap: http://localhost:3471/sitemap.xml` |
| sitemap.xml | boş | **46 URL / 116 görsel** (ana 1 + kategori 4 + ürün 40 + kurumsal 1). `lastmod` gerçek `updatedAt`/`publishedAt` |
| `X-Robots-Tag` | sayfalar, görseller, admin: noindex | yalnız admin |

**4 uyarı (her iki ortamda):**

- `/en`, `/fr`, `/ru` ana sayfa başlıkları 74–84 karakter. Bunlar sözlük metni ve sayfalar zaten noindex.
- `/admin/login` için meta açıklama yok. Admin her zaman noindex.

## 2. Envanter (rota aileleri × 5 dil)

| Tür | Adet | Beklenen |
|---|---:|---|
| Ana sayfa | 5 | 200; prodlike'ta yalnız TR index |
| Kategori + sayfalama + filtreli | 20 + 15 + 4 | 200; onaysız (IN_REVIEW) kategori adlarında noindex ve hreflang yok; filtreli → canonical temel liste |
| Ürün (TR) | 40 | 200, self-canonical; prodlike'ta index |
| Çevirisiz ürün URL'si (EN/FR/RU/AR) | 4 | **404** (sahte dil sayfası yok) |
| CMS (kurumsal), TR yedekli dil sürümleri, yasal (onaysız) | 1 + 4 + 3 | 200; yedek ve yasal noindex |
| SSS / blog | 5 + 5 | 404 (yayında içerik yok, boş sayfa üretilmez) |
| Arama, iletişim, teklif listesi, sepet, ödeme | 25 | 200, **her ortamda noindex** |
| 404 testi | 5 | gerçek 404 (dil başlık/altlığıyla) |
| Eski URL'ler | 125 | 301, tek adım, hedef 200 |
| İncelemedeki ürün (#208) | 1 | **307** → birincil kategori |
| Admin girişi | 1 | 200, noindex |

## 3. Örnek vakalar (prodlike)

| URL | HTTP | Durum | Canonical | JSON-LD |
|---|---|---|---|---|
| `/` | 200 | index | `/` | Organization, WebSite |
| `/urun/ayak-ve-boynuz-testeresi` | 200 | index | self | Organization, WebSite, BreadcrumbList, Product (**Offer yok**) |
| `/kategori/kurban-ekipmanlari?siralama=ad-artan` | 200 | (robots.txt ile taranmaz) | `/kategori/kurban-ekipmanlari` | CollectionPage + ItemList |
| `/en/category/slaughterhouse-equipments` | 200 | **noindex** (kategori adı çevirisi onaysız), hreflang yok | self | CollectionPage |
| `/ar/product/dairesel-kesim-hucresi` | **404** | — | — | — |
| `/ar/page/about-us` | 200 | noindex (metin TR'den yedek) | self | BreadcrumbList |
| `/sayfa/iade-ve-geri-odeme-politikalari` | 200 | noindex (hukuki onay yok) | self | BreadcrumbList |
| `/ar/search?q=kesim` | 200 | noindex | `/ar/search` | — |
| `/kategori/all-products` (eski EN) | 301 | → `/en/category/all-products` (200) | — | — |
| `/urun/ikizray-kurban-kancasi` (#208) | **307** | → `/kategori/kurban-ekipmanlari` | — | — |

## 4. Uygulanan düzeltmeler (Sprint 8)
1. **Dil politikası:** `seoLocales()` (`SEO_LOCALES`, varsayılan `tr`) eklendi.
   - EN/FR/RU/AR'de yalnız arayüz çevirisi var; katalog ve CMS metinleri onaylı değil (74 eşleşme bekliyor).
   - Bu dillerdeki sayfalar noindex. hreflang yalnız indekslenebilir sürümler arasında ve en az 2 sürüm varsa üretilir; x-default TR'dir.
   - Önceden ana sayfa ve statik sayfalar 5 dilde index + hreflang alıyordu.
2. **Kategori hreflang:** IN_REVIEW kategori adları artık alternatif sayılmıyor ve bu sayfalar noindex. `CatalogCategory.translatedLocales` eklendi.
3. **Sitemap:**
   - Gerçek `lastmod` (ürün/çeviri `updatedAt`, kategori ve üye ürünlerin en yenisi, CMS `publishedAt`). Bilinmiyorsa alan yazılmaz; "şimdi" asla yazılmaz.
   - Her dil kendi URL'siyle listelenir; yalnız SEO dilleri girer.
   - SSS ve blog yalnız içerik varsa eklenir.
4. **CollectionPage JSON-LD:** kategori sayfalarında yalnız görünen ürünlerin ItemList'i var; fiyat, teklif ve puan yok.
5. **Meta açıklama:** 160 karakterde, kelime sınırında kesilir (`clampDescription`). Önceki 23 uzun açıklama uyarısı giderildi.
6. **Denetim motoru:** sayfa, sitemap ve robots kuralları; hreflang karşılıklılığı ve kırık alternatifler; yinelenen başlık (yalnız self-canonical sayfalar arasında); yönlendirme zinciri/döngüsü; Offer/AggregateRating/Review/priceSpecification yasağı; JSON-LD ayrıştırma.
7. **Admin SEO QA:**
   - Her URL için durum, bulgu, öneri ve düzenleme bağlantısı (ürün, kategori, sayfa, yönlendirme).
   - Filtreler ve CSV dışa aktarım (`seo.export`).
   - Denetimler `SeoAuditRun` ve denetim kaydına yazılır.
   - Hedef adres sunucu tarafında belirlenir (SSRF korumalı).

## 5. Yapılandırılmış veri kuralları
- **Organization:** ad, URL, logo ve kornne.com'da zaten yayımlı iletişim bilgileri. `legalName` yalnız süper yönetici doğrulayınca eklenir (bugün yok).
- **WebSite:** SearchAction içerir. **BreadcrumbList** tüm içerik sayfalarında var. **CollectionPage** kategorilerde. **Product:** ad, açıklama, görsel, URL.
- **Offer, AggregateRating ve Review üretilmez.** Fiyatların hepsi onaysız ve gerçek yorum yok. Testler: birim, prodlike E2E ve denetim kuralı `ld-commercial`/`ld-forbidden`.
- **Kaçış:** `serializeJsonLd`, `<`, `>`, `&` ve U+2028/2029 karakterlerini kaçışlar. `</script>` ile dışarı kırılma testi var.

## 6. Açık riskler
- Rich Results Test ve Search Console doğrulaması **yapılmadı** (canlı alan adı ve erişim yok). Product verisi Offer içermediği için ürün zengin sonuçlarına uygunluk **iddia edilmiyor**.
- EN/FR/RU/AR sayfaları onaylı içerik gelene kadar noindex. Eski EN/FR adreslerinin yeni hedefleri noindex sayfalar; bu bilinçli bir karar.
- Sayfalama sayfaları (`/kategori/x/2`) self-canonical ve indekslenebilir; sitemap'te yok. Google'ın önerisiyle uyumlu.
