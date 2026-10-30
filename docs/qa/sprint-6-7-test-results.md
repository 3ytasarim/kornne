# Sprint 6 + 7 — test sonuçları

**Tarih:** 22.10.2026. **Ortam:** Windows 11, Node 24.19, sistem Chrome.

- Testler yerel `next build && next start` (:3460) üzerinde koşuldu.
- Veritabanı: Neon `neondb` (gerçek geliştirme verisi; yalnız `@kornne.test` ve "E2E" işaretli satırlar yazılıp geri alındı) ve izole `kornne_test` şeması.
- Ham log'lar: `data/qa-logs/s67-*` (gitignore'da).

## Özet

| Kontrol | Komut | Sonuç |
|---|---|---|
| Lint | `npm run lint` | ✅ 0 hata, 0 uyarı |
| Typecheck | `npx tsc --noEmit` | ✅ |
| i18n anahtar eşliği (5 dil) | `npm run i18n:check` | ✅ (yeni `cms` bölümü dahil) |
| Prisma şema ↔ DB | `prisma migrate status` | ✅ 4 migration, güncel |
| Unit + entegrasyon | `npx vitest run` | ✅ **121/121**, 14 dosya. Önceki 85 korunuyor; +17 unit, +14 servis, +5 çeviri akışı |
| Production build | `npm run build` | ✅ |
| Playwright E2E | `npx playwright test` | ✅ **63/63**. Önceki 49 korunuyor (1'i yeni akışa göre yeniden yazıldı), +14 yeni. Atlanan 35 test ekran görüntüsü üreticisidir (`QA_SHOTS=1`); Playwright tam koşu 9,7 dk. |
| Ekran görüntüleri | `QA_SHOTS=1 npx playwright test tests/e2e/visual67.spec.ts` | ✅ 3/3 test, **43 görüntü** (`docs/qa/screenshots/s67-*`) |
| Importer idempotency | `npm run import:legacy` (dry-run) | ✅ 0 create / 0 update / 0 conflict |
| Medya bütünlüğü | `node scripts/verify-media.mjs` | ✅ 445/445 hash; `public/upload` = 445 dosya (test yüklemeleri silindi) |
| DB artık kaydı | `node scripts/qa/s67-residue.mjs` | ✅ Aşağıda |

## Önce / sonra sayımlar (gerçek DB)

Kanıt dosyaları:

- `docs/data-migration/evidence/s67-before.json`
- `s67-after-migration.json`
- `s67-after-cms-seed.json`
- `data/qa-logs/s67-residue.json`

| Tablo | Sprint başı | Sprint sonu |
|---|---:|---:|
| Product (yayında / #208) | 41 (40 / DRAFT+inceleme) | 41 (40 / DRAFT+inceleme) |
| ProductTranslation (TR dışı) | 41 (0) | 41 (0) |
| MediaAsset (yüklenen) | 445 (0) | 445 (0) |
| Redirect (adres değişikliği kaynaklı) | 125 (0) | 125 (0) |
| Price (VERIFIED / yönetici satırı) | 41 (0 / 0) | 41 (0 / 0) |
| LegacyMatchSuggestion karara bağlanan | 0 | 0 |
| QuoteRequest / Cart / Order / User / Session | 0 | 0 |
| Page / PageTranslation / PageRevision | 0 / 0 / 0 | 4 / 8 / 8 (CMS tohumu: mevcut 4 sayfa) |
| MenuItem / SiteSetting | — | 8 / 9 (CMS tohumu: mevcut linkler + iletişim) |
| FaqItem / Banner / NotificationOutbox / QuoteNote / PriceEvent | — | 0 |
| AuditLog | 0 | 5 (CMS tohumu kayıtları) |

## Yeni testler

**Unit (`tests/unit/admin.test.ts`, 17 test):**

- RBAC matrisi: varsayılan ret; onay ve dışa aktarma yalnız üst rollerde; rollerin modül sınırları; kişisel veri işlemleri katalog/SEO rollerine kapalı.
- Fiyat önerisi: TR tutar → kuruş; KDV baz puanı; "eski fiyat ≤ satış" reddi; KDV/kaynak zorunluluğu; tarih aralığı.
- Canlı fiyat seçimi: gelecek ve süresi dolmuş kayıtlar hariç.
- Teklif: durum geçişleri; CSV formül enjeksiyonu; maskeleme; iletişim anahtarı.
- Yükleme: içerikten tür tespiti (SVG, HTML, PHP reddi); güvenli dosya adı (`..` yok).
- Diğer: yönlendirme döngü/zincir tespiti; TR slug; menü/banner bağlantı doğrulaması (`javascript:`, `//`, `http:` reddi); ayar doğrulama; eşleşme risk bayrakları.

**Entegrasyon (`kornne_test`):**

- **`admin-services.test.ts` (14 test):**
  - Fiyat: dört göz kuralı; eşzamanlı çift onayda tek kazanan; önceki fiyatın sona ermesi; geri alma; ret ve geri çekme; eski fiyat satırı onaylanamaz; hiçbir satır silinmez.
  - Teklif CRM:
    - Bildirim kuyruğu `BLOCKED`, kişisel veri yok.
    - Geçersiz geçiş, eski sürüm ve eşzamanlı değişiklikte tek kazanan.
    - RESPONDED notu ve CLOSED sonucu zorunlu.
    - Atama yetkisi; iç not düz metin; not içeriği denetim kaydına yazılmaz.
  - Ürün:
    - Slug değişikliği: tek adım 301; eski yönlendirmeler yeni adrese döner; yönlendirme kaynağı olan adres reddedilir.
    - XSS temizliği; iyimser kilit; değişmeyen eski metin bayt bayt korunur.
    - #208 benzeri ürün: yayın için izin ve gerekçe şart.
    - Seçenek silinmez; özellik doğrulaması kaynak ister; toplu işlem yayınlayamaz; yeni ürün DRAFT/QUOTE_ONLY.
  - CMS:
    - Taslak → yetkisiz yayın reddi → yayın; canlı sürüm yeniden yayınlanana kadar değişmez.
    - Geri yükleme, yayından kaldırma, XSS temizliği.
    - Yeniden yayında eski adresten 301.
    - Banner bitiş tarihi ve güvenli bağlantı; SSS kaynak zorunluluğu; editörün yayın talebi incelemeye düşer.
  - Kullanıcı: davet şifre politikası; tek kullanım (eşzamanlı); rol değişince oturumların silinmesi; kendine işlem yasağı.
  - Yükleme: gerçek PNG; SHA-256 ile tekilleştirme; sahte PNG (PHP) ve SVG reddi; güvenli ad; alt metin zorunlu.
- **`translation-flow.test.ts` (5 test):** onay → yayında olmayan taslak; yayın ve kaldırmada eski URL hedefinin geri dönmesi; düşük güven ve müşteri kararı kuralları; ret ve yeniden açma; yeniden eşleştirme; eşzamanlı onay ve yayında tek kazanan.

**E2E:**

- **`sprint67.spec.ts` (14 test):**
  1. Süper Yönetici SEO başlığını değiştirir → Neon → vitrinde `<title>` → geçmiş → arayüzden geri alır.
  2. #208 incelemede kalır, eski URL 307 döner.
  3. Ürün editörü ve fiyat:
     - Ürün editörü 4 modülde ret alır.
     - Süper Yönetici fiyat önerir; kendi önerisini onaylayamaz.
     - Öneri vitrine ve JSON-LD `Offer`'a sızmaz.
     - Ürün editörünün **sunucuya tekrar gönderdiği** onay isteği reddedilir ve `auth.denied` yazılır.
     - Yabancı origin (CSRF) isteği reddedilir.
     - Sepet kapalı kalır.
  4. Dışa aktarma: anonim yönlendirilir, Sipariş Operatörü 403, Süper Yönetici CSV alır (başlık satırı, `no-store`).
  5. Teklif CRM uçtan uca:
     - Vitrinden gerçek talep gelir; bildirim kuyruğu `BLOCKED`.
     - Operatör inceler; SEO editörünün tekrarlanan isteği reddedilir.
     - Operatör sorumlu atar, iç not ekler (HTML kaçışlı), "teklif hazırlandı" yapar.
     - "Müşteriye iletildi" not olmadan reddedilir, notla kabul edilir.
     - Olay sırası ve 3 denetim kaydı doğru; referans değişmedi; listede kişisel veri yok.
  6. CMS: SEO editörü taslak yazar (XSS temizlenir), yayınlayamaz, incelemeye gönderir; yönetici yayınlar → vitrin 200, betik yok → yayından kaldırır → 404.
  7. SSS yayında → `/sss` 200, `FAQPage` verisi ve menü linki var; taslağa alınca 404 ve link gizlenir.
  8. Duyuru: bitiş tarihi olmadan reddedilir; yayında ana sayfada görünür; EN metni yokken EN'de görünmez; arşivlenince kalkar.
  9. Eski CMS sayfaları DB'den aynı adreslerle açılır; yasal metin "onay sürecinde" ve `noindex`; AR sayfası RTL ve menüsü DB'den; RU/AR ürün sayfası 404.
  10. Medya: sahte PNG reddedilir, gerçek PNG yüklenir ve listelenir (sonra silinir).
  11–14. Yönetim arayüzü 320 / 375 / 768 / 1440 px'de 7 ekranda sayfa düzeyinde yatay taşma yok.
- **`sprint3.spec.ts`:** EN eşleşme testi yeni akışa göre yeniden yazıldı. Sıra: onay (taslak, yayında değil) → yayın (sayfa 200, hreflang, eski URL yeni sayfaya) → kaldırma (404, eski URL eski hedefine) → DB geri alma.

## Testlerin bulduğu ve düzeltilen hatalar

1. **Çeviri yayınında yarış:** ön-hidrasyon tıklaması hem yerel form POST'u hem React'in tekrar oynatmasıyla iki kez çalışıyordu. İkinci çalışma, güncellenmiş yönlendirmeyi "önceki hedef" olarak kaydediyordu; bu yüzden yayından kaldırma eski URL'yi geri getirmiyordu. **Düzeltme:** onay, yayın ve kaldırma durum değişikliğini koşullu güncellemeyle önce sahiplenir; eşzamanlı ikinci istek reddedilir (yarış testi eklendi).
2. **ConfirmSubmit tek tıklamada gönderiyordu:** React aynı `<button>` düğümünü yeniden kullanıp tipini `submit`'e çevirince tarayıcı varsayılan gönderimi yapıyordu. **Düzeltme:** anahtarlı ayrı düğmeler ve `preventDefault`.
3. **Hata sonrası form sıfırlanıyordu:** React 19 `<form action>`, başarısız işlem sonrası da alanları temizliyordu (banner başlığı silindi). **Düzeltme:** ActionForm gönderimi kendisi yapıyor (`onSubmit` + `startTransition`); kullanıcının yazdıkları korunuyor.
4. **Teklif durum formu:** "Sonuç" seçilmediğinde boş değer (`""`) reddediliyordu; operatörler hiçbir durumu değiştiremezdi. **Düzeltme:** şemada boş değer önişleme.
5. **Aynı konumda değişen formlar:** yayınla ve yayından kaldır formları aynı React state'ini paylaşıyordu. **Düzeltme:** farklı `key`.
6. **Gönder düğmeleri:** hidrasyon tamamlanana kadar pasif yapıldı; çift işlem kaynağı ortadan kalktı.
7. **Neon soğuk başlangıcı:** "transaction başlatılamadı" (P2028). **Düzeltme:** Prisma `transactionOptions` (maxWait 10 sn).
8. **Katalog önbelleği:** modül düzeyindeydi; işlemler ve sayfalar arasında paylaşılmayabilirdi. **Düzeltme:** `globalThis`.
9. **Yönetim panelinde 320/375 px yatay taşma:** grid öğeleri ve tablolar `min-w-0` almadığı için. Dosya seçici de taşıyordu. **Düzeltme:** yapıldı.
10. **Test kalıntısı:** zaman aşımında `finally` çalışmadığı için gerçek DB'de bir eşleşme onaylı kaldı. Satır satır geri alındı ve doğrulandı. **Düzeltme:** idempotent temizlik `afterEach` ve global teardown'da çalışıyor; silinmiş test kullanıcılarının kararlarını da tanıyor.

## Mobil Lighthouse

**Koşullar:**

- Lighthouse 13.5.0, mobil, varsayılan **simüle** throttling (150 ms RTT, ~1,6 Mbps, 4× CPU).
- Yerel `next start`; sayfa başına 3 koşu ve medyan.
- Bu makinede Chrome zaman zaman açılamıyor; script başarısız koşuyu sayıp raporluyor.
- Yüksek değişkenlik görülen sayfalar 5 koşuyla yeniden ölçüldü.
- JSON: `docs/qa/lighthouse/`, `data/qa-logs/lh-recheck/`.

| Sayfa | Sprint 4+5 | **Sprint 6+7** (koşular) | LCP | TBT |
|---|---:|---:|---:|---:|
| Ana sayfa | 86 | **85** (5 koşu: 85/85/85/86) | 3,9 sn | 40 ms |
| Kategori | 86 | **84** (5 koşu: 84/78/85/83/86) | 4,1 sn | 90 ms |
| Ürün | 87 | **88** (88/88/88) | 3,7 sn | 30 ms |
| Ürün (varyantlı) | 87 | **87** | 3,7 sn | 30 ms |
| AR ana sayfa | 88 | **87** | 3,7 sn | 80 ms |
| Arama | 88 | **88** (5 koşu: 88/87/88/79) | 3,6 sn | 30 ms |
| Teklif formu | 90 | **89** (86/91/89) | 3,4 sn | 80 ms |
| Sepet (kilitli) | 90 | **88** | 3,4 sn | 110 ms |
| Kurumsal (CMS'ten) | — | **90** | 3,4 sn | 40 ms |
| Admin giriş | — | **84** | 4,2 sn | 80 ms |

- **Erişilebilirlik ve Best Practices 100**; CLS 0.
- **SEO:**
  - Vitrin: **69**. Tek başarısız denetim `is-crawlable`; nedeni ortamın bilinçli `noindex`'i (`SITE_INDEXABLE=false`) ve `X-Robots-Tag`'idir. Diğer SEO denetimleri geçiyor. Bu güvenlik bilerek kaldırılmadı.
  - Admin giriş: **58**. `is-crawlable` (admin her zaman `noindex`) ve `meta-description` (bilinçli olarak yok).
- **Sonuç:**
  - Sprint 6+7, vitrin performansını ölçülebilir biçimde değiştirmedi: fark ±2 puan, değişkenlik içinde.
  - 90+ hedefine yalnız kurumsal sayfa ve teklif formunda yaklaşıldı; ana, kategori ve ürün sayfaları 84–88.
  - Kalan maliyet ağ simülasyonundan geliyor: ilk HTML → CSS → görsel zinciri ve ortak React çalışma zamanı.
  - Hetzner + CDN + Brotli ölçümü Sprint 8'de yapılacak.
- **Ölçülemeyen:** giriş gerektiren admin ekranları için Lighthouse koşulmadı; oturum çerezi enjeksiyonu kurulmadı. Admin için yalnız giriş sayfası ölçüldü. Admin sayfalarının erişilebilirliği e2e rol, etiket ve taşma testleriyle kontrol edildi.

## Bilinen sınırlar

- **Gerçek DB'de e2e:** e2e gerçek geliştirme veritabanına `@kornne.test` ve "E2E" işaretli geçici satırlar yazıp siliyor. Staging için ayrı Neon dalı önerilir.
- **Kapsanmayan testler:** çoklu tarayıcı (Safari, Firefox, Samsung) ve ekran okuyucu (NVDA, VoiceOver) testleri yapılmadı.
- **Yönetim işlem süresi:** her yazma işlemi Neon'a (AB) birkaç gidiş-dönüş ve sayfa yenilemesi içerdiği için 2–6 sn sürebiliyor. Kullanıcı bekleme göstergesini görüyor.
- **Zengin metin editörü:** bağımlılıksız ve basit (`execCommand`). Tablo düzenlemesi yalnız HTML görünümünden yapılabiliyor.
