# Sprint 10 + 11 hazırlık: GEO + Analytics, QA / Security / Go-live

> Sprint 10'a **geçilmedi**. Bu belge, Sprint 8+9 bittiğinde kalan engelleri ve başlangıç için gereken kararları listeler.

## A. Kesin engeller (müşteri / yetkili aksiyonu)

| # | Engel | Etkisi | Nerede |
|---|---|---|---|
| 1 | **Neon parola rotasyonu** (yazışmada ifşa oldu, hâlâ yenilenmedi) | Yeni harici bağlantı (Merchant API, GA4 sunucu tarafı, SMTP) kurulmaz; `SECRETS_ROTATION_CONFIRMED` kapalı kalır | Neon Console → yeni parola yalnız `.env`'e. Sonra sunucuları yeniden başlat |
| 2 | **41 fiyatın** dört göz onayı (öneren ≠ onaylayan), KDV dahil/oran; 11 dil-fiyat çelişkisi, 6 hatalı indirim | `Offer`, Merchant READY, ödeme | Admin › Fiyatlar (toplu onay yok) |
| 3 | **Gerçek stok / temin / teslim süresi** (41/41 bilinmiyor) | Merchant `availability` | Admin › Stok |
| 4 | **Marka** doğrulaması + GTIN/MPN veya `identifier_exists=no` kararı | Merchant tanımlayıcıları | Ürün › Teknik bilgi |
| 5 | Ticari unvan, vergi dairesi/no, MERSİS; kargo ve kurulum kuralları | Organization ayrıntıları, Merchant işletme kimliği, mesafeli satış | Admin › Ayarlar (süper yönetici doğrular) |
| 6 | Hukuken onaylı KVKK, çerez, mesafeli satış, **iade** metinleri | Yasal sayfaların indekslenmesi, Merchant iade kapısı, çerez onayı (GA4 için şart) | Admin › İçerik › yasal onay |
| 7 | **74 EN/FR eşleşme** kararı; RU/AR içerik sahibi | `SEO_LOCALES` genişletme, hreflang, yerelleştirilmiş Merchant | Admin › Çeviriler |
| 8 | **#208** kararı (yayın / birleştirme / kaldırma; 307 → 301?) | Kalıcı URL | Müşteri |
| 9 | 9 ana görselin yüksek çözünürlüklü orijinali, 6 kırık görsel, 5 WhatsApp kaynaklı görselin izni | Google Görseller, Merchant 31.01.2027 eşiği | Admin › SEO › Görsel SEO iş listesi |
| 10 | Doğrulanmış teknik özellikler, PDF teknik föyler, gerçek müşteri soruları (SSS) | GEO içeriği (Sprint 10'un özü) | Ürün › Teknik bilgi, İçerik › SSS |
| 11 | **Merchant hesap erişimi** (salt-okunur servis hesabı) + mevcut ürün dışa aktarımı | item_id eşleme, Merchant diff | `docs/next-steps/merchant-connection-checklist.md` |
| 12 | **Ödeme modeli**: teklif modeli mi, ödeme sağlayıcısı mı? | Merchant fiyatlı ürün ilanı ancak satın alınabilir sitede | Müşteri kararı |
| 13 | GA4 / GTM / Google Ads / Search Console erişimi; çerez onay metni | Sprint 10 analitik işleri | Müşteri |
| 14 | E-posta sağlayıcısı (SMTP / API) | Teklif bildirimleri, şifre sıfırlama | Müşteri |
| 15 | Hetzner staging sunucusu + staging alan adı (Basic Auth, noindex) | Sprint 11 staging testleri, Lighthouse'un gerçek sunucuda ölçülmesi | Müşteri / DevOps |

## B. Sprint 10 (GEO + Analytics) başlangıç listesi
- **GEO içerik:** Admin › SEO › GEO önerileri ekranındaki ürün bazlı öneriler. Örnekler:
  - Yapılandırılmamış teknik satırlar
  - Şartname dili
  - Ürün SSS'si yok
  
  Kaynak gelmeden metin yazılmaz.
- **Rehber içerikler:** uzman onaylı (kim onaylayacak?). Blog ve SSS altyapısı hazır (Sprint 7).
- **Analytics:**
  - Consent Mode v2 varsayılan "denied".
  - Olay taksonomisi: teklif listesine ekleme, teklif gönderimi, WhatsApp tıklaması, ürün görüntüleme.
  - GA4 ölçüm kimliği ortam değişkeninden okunacak.
  - Sahte veri yok.
- **Search Console:** canlıya geçişten sonra sitemap gönderimi. Doğrulama DNS kaydı cutover günü, müşteri onayıyla.

## C. Sprint 11 (QA / Security / Go-live) başlangıç listesi
- **Güvenlik:**
  - Nonce'lı CSP (inline JSON-LD + Next runtime)
  - Rate limiting gözden geçirme
  - OWASP kontrol listesi
  - `npm audit`
  - Yedek ve geri yükleme kanıtı (Neon branch / PITR)
- **Staging (Hetzner):**
  - `SITE_INDEXABLE=false` + Basic Auth
  - `scripts/seo/audit.ts --mode=dev` → 0 hata
  - Lighthouse gerçek sunucuda (HTTP/2, Brotli)
- **Cutover:**
  - `docs/seo/redirect-cutover.md`: 125 URL canlıda yeniden doğrulanır, DNS TTL planı, rollback.
  - Merchant diff: eski kaynak durdurulmadan yeni API veri kaynağıyla karşılaştırma.
- **İzleme:** 24 saat / 7 gün / 30 gün için GSC kapsam, 404 raporu, Merchant teşhisi ve Ads performansı.

## D. Teknik durum (Sprint 8+9 sonu)

| Konu | Durum |
|---|---|
| SEO denetim motoru | `src/lib/seo/audit.ts` + `inventory.ts`. CLI ve Admin › SEO QA (URL bazlı, CSV dışa aktarım). Dev ve prodlike modlarında 0 hata |
| Dil politikası | `SEO_LOCALES` (varsayılan `tr`). Onaysız dillerde noindex ve hreflang yok |
| Sitemap | Yalnız 200 + indekslenebilir + canonical URL. Gerçek `lastmod`. Görsel öğeleri var. Dev ortamında boş |
| JSON-LD | Organization (ünvan yalnız doğrulanınca), WebSite, BreadcrumbList, CollectionPage (yeni), Product (Offer yok), FAQPage, Article |
| Görsel SEO | 445/445 hash aynı. İş listesi ve Merchant eşikleri hazır. 6 kırık görsel 404 |
| Merchant | Readiness motoru (gerçek veri: **0/40 READY**), feed önizleme (XML/TSV/CSV, admin dry-run), Merchant API products_v1 adaptörü (varsayılan KAPALI), MOCK/SIMULATED işler, item_id eşleme önizlemesi |
| Test izolasyonu | Yerel embedded PostgreSQL (`kornne_it`, `kornne_e2e`). Neon'a yalnız salt-okunur oturum |
| Neon şema | Additive migration `20261023090000_sprint8_9_seo_merchant` uygulandı (bkz. rapor §3) |
