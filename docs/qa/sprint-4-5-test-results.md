# Sprint 4 + 5 — test sonuçları

Tarih: 2026-10-22. Ortam: Windows 11, Node 24.19, sistem Chrome. Testler yerel `next build && next start` (:3460) üzerinde, Neon `neondb` ve izole `kornne_test` şemasıyla koşuldu. Ham log'lar `data/qa-logs/s45-*` dosyalarında.

## Özet

| Kontrol | Komut | Sonuç |
|---|---|---|
| Lint | `npm run lint` | ✅ 0 hata |
| Typecheck | `npx tsc --noEmit` | ✅ |
| i18n anahtar eşliği (5 dil) | `npm run i18n:check` | ✅ |
| Prisma şema ↔ DB farkı | `prisma migrate diff --from-config-datasource …` | ✅ 0 fark |
| Unit + entegrasyon | `npx vitest run` | ✅ **85/85** (11 dosya; önceki 44 korunuyor) |
| Production build | `npm run build` | ✅ 117/117 sayfa |
| Playwright E2E | `npx playwright test` | ✅ **49/49** (önceki 37 korunuyor + 12 yeni). 32 atlanan test ekran görüntüsü üreticisi, yalnız `QA_SHOTS=1` ile çalışır |
| Ekran görüntüleri | `QA_SHOTS=1 npx playwright test tests/e2e/visual.spec.ts` | ✅ 32/32 |
| Importer idempotency | `npm run import:legacy` (dry-run) | ✅ 0 create / 0 update / 0 conflict |
| Medya bütünlüğü | `node scripts/verify-media.mjs` | ✅ 445/445 hash |
| DB artık kaydı | `node scripts/qa/s45-residue.mjs` | ✅ Product 41, Media 445, Redirect 125, VERIFIED fiyat 0, User/Session/AuditLog/LoginAttempt/QuoteRequest/Cart/Order 0, test şeması 0 |

## Yeni testler

**Unit** (`tests/unit/commerce.test.ts`, `quote-validation.test.ts`, toplam 22):

- Ticari kapı: bayrak tek başına açmaz; her eksik koşul ayrı blocker üretir; mock sağlayıcı prod'da reddedilir.
- Para:
  - KDV dahil/hariç hesap, yarım-yukarı yuvarlama, çok satırlı toplam + kargo.
  - Geçersiz adet: 0, negatif, 1000, kesirli.
- Durum makinesi: geçerli geçişler; müşteri/admin “ödendi” yapamaz; bilinmeyen geçişler reddedilir.
- Mock imza: doğru imza, yanlış anahtar, eski zaman damgası, kurcalanmış gövde.
- Teklif doğrulama:
  - Zorunlu alanlar; e-posta veya telefon şartı.
  - Kontrol karakteri temizliği; adet ve satır sınırları.
  - Geçersiz ürün ref/varyant id biçimi.

**Entegrasyon — izole şema** (`tests/integration/*`, toplam 19):

- Teklif servisi:
  - Kayıt, kalemler, `NEW` olayı, kişisel veri içermeyen audit; **hiçbir kolonda fiyat yok**.
  - HTML/XSS girdisi metin olarak saklanır.
  - Eşzamanlı çift gönderimde tek kayıt.
  - Tekrarlanan satırlar birleşir; adet 999'da kesilir.
  - Yayında olmayan, bilinmeyen veya sahte varyantlı ürün reddedilir.
  - Honeypot ve 2 sn kuralı.
  - IP rate limit 5/saat.
  - Alan hata kodları girdiyi geri yansıtmaz.
- Ödeme akışı: mutlu yol, replay, idempotent ödeme başlatma, sahte imza, tutar uyuşmazlığı, 4 eşzamanlı webhook → tek geçiş, bilinmeyen referans, IDOR, kapalı kapı.

**E2E** (`tests/e2e/sprint45.spec.ts`, 12):

- Ürün detayı:
  - Galeri, bölüm navigasyonu, “Ürün no”, “doğrulanmış teknik tablo henüz yok” notu.
  - Yasak ifadeler yok (stokta, ücretsiz kargo, sepete ekle, satın al, PDF); aynı kategoriden 4 ilgili ürün.
- Varyantlı ürün (#107): seçim yapmadan eklenemez; seçilen varyant listede görünür.
- Lightbox klavyeyle açılır, Esc ile kapanır.
- Mobil yapışkan teklif çubuğu kaydırınca görünür, WhatsApp balonunu gizler; 375 px'de taşma yok.
- Teklif listesi:
  - Boş durum; sayfa `noindex`.
  - **Uçtan uca akış:**
    - 3 ürün eklenir; adet +/−, elle −5 → 1'e kısılır; ürün silinir.
    - İletişim yokken alan hatası verir.
    - Geçerli gönderim → `TKL-…` referansı ve “Teklif talebiniz alındı”.
    - URL'de kişisel veri yok; “sipariş/ödendi” metni yok.
    - **Neon'da kayıt doğrulanır:** doğru kalemler ve adetler; XSS notu metin olarak saklanmış.
    - Liste temizlenir.
    - Admin listesinde kişisel veri yok.
    - Detayda not metin olarak görünür; `quote.viewed` audit yazılmış.
  - Çift tıklama → tek kayıt.
  - Arapça teklif listesi RTL ve 375 px'e sığar.
- Ticaret kilidi:
  - `/sepetim`, `/odeme`, `/en/cart`, `/ar/checkout` → 200 + kilit bildirimi; IBAN, ödeme yöntemi ve “Siparişi tamamla” yok.
  - Webhook POST → 404.
- Yetki:
  - PRODUCT_EDITOR teklif kutusuna erişemez (`?denied=1`).
  - Anonim kullanıcı → 307 `/admin/login`.

Güncellenen eski test: `sprint3.spec.ts` ürün sayfası testi yeni yerleşime uyarlandı (fiyat yok, Offer yok, teklif CTA, WhatsApp/e-posta linki).

## Test sırasında bulunup düzeltilen kusurlar

1. **Mobil yapışkan CTA görünmüyordu.**
   - Neden: IntersectionObserver, panel görünümden tek seferde geçildiğinde (çapa linki, hızlı kaydırma) hiç tetiklenmiyordu.
   - Düzeltme: rAF ile kısılmış pasif `scroll` kontrolüne geçildi.
2. **320 px'de tüm sayfalarda 12 px yatay taşma.**
   - Neden: yeni teklif listesi rozeti başlığa sığmıyordu.
   - Düzeltme: 360 px altında logo, aralık ve harf aralığı küçültüldü. Hiçbir kontrol gizlenmedi.
3. **Teklif formunda WhatsApp balonu mobilde form alanlarını kapatıyordu.** Formun olduğu sayfada mobilde gizleniyor (`html:has([data-quote-form])`).
4. **Admin detayda görüntü kusurları.**
   - Aydınlatma metni sürümü kelime ortasından bölünüyordu.
   - Durum notu İngilizceydi; Türkçeleştirildi.
5. **Şema yorumu var olmayan bir silme betiğini gösteriyordu.** “Planlandı (Sprint 6)” olarak düzeltildi.

## Mobil Lighthouse

**Koşullar:**

- Lighthouse 13.5.0, mobil form faktörü, varsayılan **simüle** throttling (150 ms RTT, ~1,6 Mbps, 4× CPU).
- Yerel `next start`; sayfa başına **3 koşu, medyan** (`scripts/qa/lighthouse.mjs`, `LH_RUNS=3`).
- Ham JSON: `docs/qa/lighthouse/`.

| Sayfa | Sprint 3 | **Sprint 4+5** | LCP (simüle) | TBT | CLS | HTML |
|---|---:|---:|---:|---:|---:|---:|
| Ana sayfa `/` | 83 | **86** (97/86/85) | 3,9 sn | 40 ms | 0 | 23 KiB |
| Kategori `/kategori/tum-urunler` | 82 | **86** | 3,8 sn | 60 ms | 0 | 27 KiB |
| Ürün `/urun/dairesel-kesim-hucresi` | 84 | **87** | 3,7 sn | 30 ms | 0 | 25 KiB |
| Ürün (varyantlı) | — | **87** | 3,7 sn | 30 ms | 0 | 25 KiB |
| Ana sayfa AR `/ar` | 80 | **88** | 3,6 sn | 40 ms | 0 | 24 KiB |
| Arama | 85 | **88** | 3,5 sn | 20 ms | 0 | 19 KiB |
| **Teklif formu** `/teklif-listem` | — | **90** | 3,3 sn | 30 ms | 0 | 16 KiB |
| Sepet (kilitli) | — | **90** | 3,3 sn | 40 ms | 0 | 15 KiB |

- Erişilebilirlik **100** ve Best Practices **100**: tüm sayfalarda.
- **SEO 69**: tek başarısız denetim `is-crawlable`. Neden: staging/önizleme ortamında bilinçli `noindex` (`SITE_INDEXABLE=false`). Üretimde açıldığında bu denetim geçer. Diğer SEO denetimleri geçiyor.
- INP laboratuvarda ölçülemez; TBT 20–60 ms, yani etkileşim maliyeti düşük.
- Sunucu tarafı gerçek TTFB 3–16 ms; sayfalar ISR önbellekten geliyor (`x-nextjs-cache: HIT`). Raporlardaki ~840 ms TTFB simülasyon modelidir.

**Yapılan iyileştirmeler** (her biri ölçülerek tutuldu):

1. **`experimental.inlineCss` kapatıldı.**
   - Sorun: inline CSS, RSC payload'una ikinci kez kopyalanıyordu (HTML 287 KiB ham / 51 KiB sıkıştırılmış).
   - Kapalıyken: HTML 24 KiB, TBT 170–210 → 30–40 ms, sayfa başına +3 puan.
2. **Gövde fontu (Inter) preload kapatıldı.**
   - 4 font dosyası (187 KiB, yüksek öncelik) LCP görseliyle yarışıyordu. Kapatınca +1–2 puan, LCP −0,2 sn.
   - `global-not-found.tsx` içindeki ayrı Inter örneği her sayfaya preload ekliyordu; o da kapatıldı.
   - Sonuç: AR ana sayfa 81 → 88. CLS 0 kaldı (boyut ayarlı yedek font sayesinde).

**90+ hedefi:** teklif formu ve sepet sayfalarında karşılandı. Ana sayfa, kategori ve ürün sayfaları **86–88**, hedefin 2–4 puan altında. Kalan maliyet:

- Ağ simülasyonunda ilk görsel ve CSS turu.
- 4 RTT zinciri: HTML → CSS → görsel.
- Ortak React/Next çalışma zamanı (~70 KiB chunk, ~27 KiB kullanılmayan).

Sonraki adaylar (ölçülmedi, bu sprintte yapılmadı):

- Hetzner'de HTTP/2 + Brotli + CDN; yerel `next start` sıkıştırmasından daha iyi olur.
- Ana sayfa hero görselinin boyut/AVIF ayarı.
- Ortak istemci adalarının (header menü, arama) azaltılması.

Gerçek olmayan 100 skoru raporlanmadı.

## Bilinen sınırlar

- **AR/RU ürün sayfası yok** (karar gereği). Bu yüzden galerinin RTL davranışı ürün sayfasında test edilemedi; RTL yalnız teklif listesi, ana sayfa ve kategoride test edildi. Galeri bileşeni mantıksal (`start/end`) CSS kullanıyor.
- E2E, gerçek Neon `public` şemasında `@kornne.test` kayıtları yazıp siliyor. Teardown kesilirse elle temizlik gerekir: `deleteTestQuotes()`.
- Çoklu tarayıcı matrisi (Safari, Firefox, Samsung) koşulmadı; yalnız Chrome.
- Ekran okuyucu testi (NVDA / VoiceOver) koşulmadı; erişilebilirlik Lighthouse/axe kuralları ve klavye testleriyle doğrulandı.
