# KORNNE — 12 Sprint / 6 Faz

Her faz iki sprinti tek görevde yürütür; her sprint kendi kabul kriterlerini korur. Bir sonraki faza **yalnız müşteri talimatıyla** geçilir.

| Faz | Sprintler | Durum |
|---|---|---|
| 1 | S0 Denetim/Envanter + S1 Proje temeli/Design system | **Tamamlandı (22.10.2026)** — bkz. `SPRINT-0-1-REPORT.md` |
| 2 | S2 Veri aktarımı/Medya + S3 Vitrin/Liste/Arama | **Tamamlandı (22.10.2026)** — bkz. `sprints/sprint-2-3-report.md` |
| 3 | S4 Ürün detayları + S5 Teklif/Sepet/Sipariş temeli | **Tamamlandı (22.10.2026)** — bkz. `sprints/sprint-4-5-report.md` (fiyatlı checkout bilinçli olarak kilitli) |
| 4 | S6 Admin (gerçek CRUD, fiyat onayı, teklif CRM, RBAC) + S7 CMS & çok dilli | **Tamamlandı (22.10.2026)** — bkz. `sprints/sprint-6-7-report.md` (ödeme, Merchant, e-posta bilerek kapalı) |
| 5 | S8 SEO + Google Images + GEO + S9 Merchant Center | **Tamamlandı (22.10.2026)** — bkz. `sprints/sprint-8-9-report.md` (test ortamı noindex; Merchant BAĞLI DEĞİL, 0/40 READY, Google'a gönderim yok) |
| 6 | S10 GEO + Analitik + S11 QA/Güvenlik/Canlıya geçiş | **Hazırlık tamamlandı (23.10.2026)** — bkz. `sprints/sprint-10-11-report.md` (analitik/izin hazır ama kapalı; Hetzner dosyaları şablon; canlıya geçiş müşteri onayı + P0 engeller bekliyor; deploy yok) |

## Faz 1

**S0 — Kabul:** tüm erişilebilir sayfa/ürünler kaynak URL'leriyle envanterli (sayılar doğrulanmış/`unverified`); medya checksum'lı; 301 haritası; eksik erişimler listeli; canlıya yazma yok.
**S1 — Kabul:** Next/TS/Tailwind derleniyor; ana/kategori/ürün/kurumsal/iletişim/404 + korumalı admin login/dashboard responsive; 5 dil + AR RTL; veri modeli + yerel/dev migrasyon; SEO temeli; lint/typecheck/test/build/e2e; Hetzner taslağı; commit/deploy yok.

## Faz 2

**S2 — Veri aktarımı/Medya.** Dry-run importer (snapshot + varsa DB dökümü) → `LegacySourceRecord` + Product/Translation/Price/Media; medya depolama kararı (yerel disk / Hetzner Object Storage), WebP/AVIF türevleri, alt metin taslakları; EN/FR eşlemesinin müşteri onayı; kayıp/eksik raporu; Redirect tablosuna 301'ler.
*Kabul:* eski↔yeni birebir ürün eşleşmesi (41 TR); doğrulanmamış alan otomatik doldurulmaz; import idempotent ve geri alınabilir; rapor.

**S3 — Vitrin/Liste/Arama.** `CatalogRepository` Prisma uygulaması; filtre (kategori, fiyat aralığı), sıralama, sayfalama, sunucu taraflı arama (TR katlama), kampanya alanları, mobil UX.
*Kabul:* gerçek DB'den listeleme; parametreli URL'ler canonical/noindex kurallı; erişilebilir navigasyon; e2e yeşil.

## Faz 3

**S4 — Ürün detayları.** Doğrulanmış teknik tablo (ProductSpec), PDF/video, ilgili ürünler, teklif formu (Zod + rate limit + KVKK onayı), gerçek yorum altyapısı (moderasyonlu).
*Kabul:* kaynak ürünle karşılaştırmalı onay; sahte puan yok; mobil/desktop test.

**S5 — Checkout/Sipariş.** Sepet, müşteri hesabı, adres, onaylı ödeme yöntemleri (havale + bildirim; POS sağlayıcı kararıyla), sipariş takibi, bildirim e-postaları, idempotency + webhook imzası.
*Kabul:* uçtan uca test siparişi; hatalı ödeme ve tekrar webhook senaryoları.

## Faz 4

**S6 — Admin ERP-lite.** Ürün/varyant/fiyat (onaylı, geçmişli)/stok/kampanya/sipariş/teklif/medya/SEO/yönlendirme CRUD'u, audit ekranı, kullanıcı/rol yönetimi, MFA.
*Kabul:* yönetici kod değiştirmeden fiyat/ürün/görsel/dil içeriğini düzenler; hatalı girişler engellenir; her değişiklik audit'te.

**S7 — CMS & çok dilli.** Sayfalar/banner/menü/blog/SSS, çeviri iş akışı (durum panosu), yasal metin onayı, e-bülten, iletişim formu.
*Kabul:* dil kırık linki yok; AR RTL; eksik çeviri işaretli; yasal metinler onaylı.

## Faz 5

**S8 — SEO + Google Images.** Metadata/sitemap (görsel dahil)/schema/hreflang/canonical/redirect son hali, Core Web Vitals.
*Kabul:* Rich Results Test, crawler raporu, PageSpeed, eski URL 200/301 doğrulaması.

**S9 — Merchant Center.** Hesap incelemesi → feed veya Merchant API kararı; `offerId` eşlemesi; dry-run diff; diagnostics; admin sync log.
*Kabul:* mevcut hesap ürünleriyle taslak kaynak karşılaştırması; yanlış fiyat/ret raporu; onaylı geçiş.

## Faz 6

**S10 — GEO + Analitik.** Uzman onaylı rehber içerikler, FAQ, GA4/GTM/Ads olayları, Clarity.
*Kabul:* ölçüm doğrulanmış (görüntüleme, sepete ekleme, satın alma, teklif).

**S11 — QA/Güvenlik/Go-live.** Regresyon, erişilebilirlik, OWASP, nonce CSP, rate limit (atomik), yedek/geri dönüş provası, staging→prod, DNS, Merchant diff, 24s/7g/30g izleme.
*Kabul:* cutover checklist, yedekten geri dönüş kanıtı, URL 200/301 doğrulaması, e2e sipariş + admin yeşil.
