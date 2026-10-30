# Yönlendirme, site taşıma ve geri dönüş kontrol listesi (Sprint 8)

> Bu belge **plandır**. Sprint 8'de DNS, Nginx, Hostinger, Hetzner, Search Console ve Merchant tarafında hiçbir değişiklik yapılmadı. Canlı kornne.com olduğu gibi çalışmaya devam ediyor.

## 1. Bugünkü yönlendirme envanteri (doğrulandı, değiştirilmedi)

| Grup | Adet | Davranış |
|---|---|---|
| Eski kategori sayfalama (`/kategori/x/1..n`) → kategori | 7 | 301, tek adım |
| Dil kök adresleri (`/lang-eng/`, `/lang-fr/`, `/lang-ru/`, `/lang-arabic/`) → `/en`, `/fr`, `/ru`, `/ar` | 4 | 301 |
| Eski EN/FR/RU/AR kategori adresleri → yerelleştirilmiş kategori | 36 | 301 |
| Eski EN/FR ürün adresleri (`/urun/<en-fr-slug>`) → ilgili dil sayfası | 74 | 301 (74 eşleşme onaylanınca hedefler Katalog QA tarafından güncellenir) |
| Eski dil kurumsal sayfaları → yerelleştirilmiş sayfa | 4 | 301 |
| **Toplam `LEGACY_AUDIT`** | **125** | **301, tek adım, hedef 200** |
| #208 (incelemede) | 1 ürün | **307** (geçici) → birincil kategori. Müşteri kararı olmadan değişmez |
| Sondaki `/`, `/tr/...` öneki, Türkçe segmentli yabancı URL | — | 308 → kanonik adres, tek adım |

Kanıt (otomatik testler):

- `tests/e2e/seo.prodlike.spec.ts` "all 125 legacy redirects": 125/125 için tek 301 adımı → 200, ayrıca #208 için 307.
- `scripts/seo/audit.ts`: dev ve prodlike modlarında 263 URL, `redirect-chain` bulgusu 0.
- `tests/unit/seo-audit.test.ts`: zincir ve döngü tespiti.

## 2. Korunan eski URL'ler
- **Ürün ve kategori (TR):** eski kornne.com yolları (`/urun/<slug>`, `/kategori/<slug>`) aynı kaldı (200).
- **Görseller:** 445 orijinal `/upload/<eski dosya adı>` yolunda bayt-bayt aynı (SHA-256) sunuluyor. Prodlike testi 445/445 hash eşleşmesi buldu.
- **Kırık görseller:** kaynakta da 404 olan 6 görsel (`belge1–5.jpg`, `Kornne-Klasik-Kesim-Hucre-61.jpg`) **404** döner. Placeholder veya sahte 200 yok.
- **Arama ve filtre:** `?siralama=`, `?kategori=`, `?q=` ve `?sayfa=` parametreli adresler robots.txt ile taranmaz. Filtreli liste canonical olarak temel listeyi gösterir. Arama sayfası noindex.

## 3. Canlıya geçiş (cutover) adımları — müşteri onayıyla, Sprint 10+ sonrası
1. **Hazırlık:**
   - Staging'de (Hetzner, Basic Auth, noindex) son veri ile `scripts/seo/audit.ts --mode=dev` çalıştır; 0 hata görülmeli.
   - Prodlike önizleme (localhost:3471) ile `--mode=prodlike` çalıştır; 0 hata görülmeli.
2. **Ön kontrol listesi:**
   - [ ] `CATALOG_DATA_VERIFIED=true` yalnız fiyat, katalog ve hukuk onaylarından sonra açılır.
   - [ ] `SEO_LOCALES` yalnız onaylı diller için açılır (bugün yalnız `tr`).
   - [ ] `SITE_URL=https://kornne.com` (veya karar verilen alan adı).
   - [ ] `SITE_INDEXABLE=true` **yalnız üretim** ortamında açılır; staging her zaman `false` kalır.
   - [ ] 125 yönlendirme DB'de etkin; `src/data/redirects.json` statik yedek olarak duruyor.
   - [ ] `/upload` dizini 445 dosyayla eşleşiyor (`node scripts/verify-media.mjs`).
3. **Geçiş anı:**
   - DNS TTL'i 24 saat önceden 300 sn'ye düşür.
   - A/AAAA kayıtlarını Hetzner'e çevir. MX kayıtlarına **dokunma**.
   - TLS'i doğrula.
   - Hostinger sitesini geri dönüş için 30 gün kapatmadan beklet.
4. **Geçiş sonrası ilk 1 saat:**
   - 125 eski URL'yi canlıda tekrar test et (aynı test, `BASE=https://kornne.com`).
   - robots.txt ve sitemap.xml'i kontrol et.
   - Search Console'da sitemap gönder (müşteri hesabı).
   - URL Denetimi ile 5 örnek sayfayı kontrol et.
5. **İzleme (2–6 hafta):** GSC Kapsam ve Sayfa deneyimi raporları, 404 raporu, Merchant teşhisi, Ads performansı.

## 4. Geri dönüş (rollback)
- **DNS:** A kaydını Hostinger IP'sine geri al (TTL 300 sn → yaklaşık 5–10 dk).
- **Yeni sitede indeksleme kapat:** `SITE_INDEXABLE=false` → tüm sayfalar noindex olur, robots.txt kapanır, sitemap boşalır. Kod değişikliği gerekmez.
- **Merchant:** eski feed hiç durdurulmadığı için ek işlem gerekmez. Yeni API veri kaynağı devre dışı bırakılır.
- **Veri:** additive migration'lar geri dönüşe engel değildir (bkz. rapor §3).

## 5. Açık riskler
- **74 EN/FR ürün eşleşmesi karara bağlanmadı.** Eski EN/FR ürün adresleri, ilgili dilin ana sayfası veya kategori sayfasına gidiyor. Çeviriler onaylanınca hedefler ürün sayfasına güncellenmeli. Katalog QA bunu yapar; tek adım kuralı korunur.
- **Dil sayfaları (EN/FR/RU/AR):** yalnız arayüz çevirisi var. Bu yüzden bugün noindex ve hreflang dışı. Arama motorları eski EN/FR sayfaları için bir süre yeni noindex sayfaları görecek; bu bilinçli bir karardır (sahte çeviri yok).
- **#208:** 307 geçicidir. Uzun süre kalırsa Google bunu kalıcı gibi değerlendirebilir. Müşteri kararı gerekiyor.
- **Görseller:** 6 kırık görselin orijinali yok. Kurumsal sayfadaki belge görselleri (`belge1–5`) sertifika olabilir; kaynaksız yeniden üretilmez.
