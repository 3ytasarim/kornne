# KORNNE — Sprint 4 + 5 raporu

**Tarih:** 22 Ekim 2026 · **Çalışma alanı:** `D:\Projects\kornne` · **Commit / push / deploy yok** · **Canlı kornne.com, Hostinger, DNS, Merchant, Ads, GSC, GA4 değişmedi** · **Sprint 6'ya geçilmedi.**

## 1. Gerçek sayfa ve özellik listesi

### Sprint 4 — Premium ürün detayı (`/urun/[slug]`, 40 yayındaki TR ürün)

- **Galeri:**
  - Yapışkan geniş görsel, en/boy oranı korunur, thumbnail şeridi, önceki/sonraki düğmeleri, mobilde kaydırma.
  - Klavyeyle açılan lightbox; Esc ile kapanır, odak tuzağı var.
  - `prefers-reduced-motion` desteklenir; RTL'de mantıksal (`start/end`) yerleşim.
- **Başlık bloğu:** kategori rozeti, “Ürün no {legacy ID}”, H1, breadcrumb.
- **Fiyat durumu (`PriceStatusBlock`):**
  - `UNVERIFIED` → “Fiyat için teklif alın” + kısa açıklama.
  - `VERIFIED` + KDV durumu biliniyorsa fiyat ve KDV etiketi gösterilir. Bileşen hazır, bugün hiçbir üründe tetiklenmiyor.
- **Teklif CTA:**
  - Adet seçici; gerçek varyant varsa seçim zorunlu (#107 Küçük Baş Stoklama Kancası). “Teklif listesine ekle” sonrası bildirim çıkar.
  - “Bu ürün için teklif iste” ekleyip teklif listesine götürür.
  - Bilgi notları: termin ve KDV teklifte yazılı bildirilir.
- **Doğrudan iletişim:** WhatsApp, telefon ve e-posta (kaynak envanterde doğrulanmış bilgiler). Mesajda yalnız ürün adı ve ürün no var; kişisel veri yok.
- **Bölüm navigasyonu:** Açıklama / Ürün bilgileri / Aynı kategorideki ürünler.
- **Açıklama ve doğrulanmış teknik alanlar ayrı:**
  - Ham açıklama korunur.
  - Teknik tablo yalnız `ProductSpec.status = VERIFIED` satırlarından üretilir. Bugün 0 satır, bu yüzden “Doğrulanmış teknik tablo henüz yayınlanmadı” notu görünür.
  - PDF/doküman bloğu yalnız gerçek doküman varsa çıkar (bugün yok).
- **İlgili ürünler:** aynı birincil kategoriden gerçek ürünler; sahte cross-sell yok.
- **Mobil yapışkan “Teklif al” çubuğu:**
  - Ana panel görünümden çıkınca belirir ve panele geri kaydırır.
  - Kendi yüksekliğini rezerve eder; içerik, menü ve çerez alanını kapatmaz.
  - Görünürken WhatsApp balonu gizlenir.
- **JSON-LD:** `Product` var; `Offer`, `AggregateRating` ve `Review` yok.
- **Yasak içerik yok:** stok, “kargoya hazır”, “ücretsiz kargo”, puan/yorum, sertifika, sahte PDF.

### Sprint 5 — Teklif, sepet ve sipariş temeli

- **Teklif listesi** (`/teklif-listem`; EN `/en/quote-list`, FR `/fr/liste-de-devis`, RU `/ru/spisok-zaprosa`, AR `/ar/quote-list`, RTL):
  - Çoklu ürün; adet +/−/elle (1–999); sil; boş, yükleniyor, hata ve başarı durumları.
  - Başlıkta adet rozeti. Sayfa `noindex`.
  - Liste localStorage'da tutulur; kişisel veri ve fiyat içermez.
- **Teklif formu:**
  - Alanlar: ad, firma (isteğe bağlı), e-posta veya telefon (en az biri), not.
  - Mevcut KVKK sayfasına **gerçek link**. Metin onaysız olduğu için “onay alındı” iddiası yok.
  - Ön yüz ve sunucu doğrulaması; honeypot; 2 sn kuralı; rate limit; idempotency.
- **Başarı ekranı:** “Teklif talebiniz alındı” + referans `TKL-YYYYMMDD-XXXXXX`. “Sipariş/ödendi” dili yok.
- **Neon'da gerçek kayıt:** `QuoteRequest`, `QuoteItem` (ürün, kaynak ID, gerçek varyant, adet, başlık snapshot'ı, **fiyat yok**), `QuoteStatusEvent`, kişisel veri içermeyen `AuditLog`.
- **Admin `/admin/quotes`:**
  - Erişim: `quotes` modülü → SUPER_ADMIN, ADMIN, ORDER_OPERATOR.
  - Liste: referans, tarih, durum, kalem sayısı; kişisel veri yok.
  - Detay: iletişim, kalemler, durum geçmişi; salt okunur; her görüntüleme audit'lenir.
  - Durum değiştirme ve CRM Sprint 6'ya bırakıldı; bitmiş gibi gösterilmiyor.
- **Sepet / ödeme:** `/sepetim`, `/odeme` ve 4 dil karşılığı kilit bildirimi gösterir: “Online sepet ve ödeme şu an kapalı”. Teklif listesine yönlendirir; ödeme yöntemi, IBAN ve “Siparişi tamamla” yok.
- **Fiyatlı e-ticaret altyapısı** (kilitli, yalnız izole testte çalıştı):
  - `Cart`, `CartItem`, `Order` + durum makinesi, `OrderStatusEvent`, `PaymentAttempt`, `PaymentWebhookEvent`.
  - Kuruş bazlı BigInt para hesabı; satır bazında KDV.
  - Sağlayıcı arayüzü + HMAC imzalı mock.
  - Webhook: replay, tutar ve eşzamanlılık korumaları; IDOR korumalı sipariş okuma.
  - Webhook route kilitliyken 404.

## 2. Canlı teklif akışının E2E testi

`tests/e2e/sprint45.spec.ts`, gerçek Neon `public` şemasında çalışıyor:

1. 3 ürün eklenir.
2. Adet artırılır, eksi değer 1'e kısılır, bir ürün silinir.
3. İletişimsiz gönderim alan hatası verir.
4. Geçerli gönderim referans döndürür.
5. **DB'de kayıt bulunur:** doğru kalem ve adetler; HTML/XSS notu metin olarak saklanmış.
6. Liste temizlenir.
7. Admin listesinde referans görünür, kişisel veri görünmez.
8. Detayda iletişim ve not metin olarak görünür; `quote.viewed` audit kaydı doğrulanır.

Ayrıca:

- Çift tıklama tek kayıt üretir.
- AR RTL 375 px'e sığar.
- PRODUCT_EDITOR reddedilir; anonim kullanıcı login'e yönlenir.
- Test kayıtları (`@kornne.test`) teardown'da silinir. Sprint sonu `QuoteRequest = 0`.

## 3. Checkout neden kapalı, açılması için ne gerekiyor?

**Bayrak tek başına açmaz.** `commerceGate`, aşağıdakilerin hepsini zorunlu tutar:

- `ENABLE_PAID_CHECKOUT=true`
- Satıcı tüzel unvanı ve vergi no
- KDV modu ve oranı
- Onaylı kargo/kurulum kuralları
- Onaylı mesafeli satış / iade / KVKK metinleri
- Gerçek ödeme sağlayıcısı (mock yalnız test ortamında)

Kapı açılsa bile `UNVERIFIED` fiyatlı ürün sepete giremez; bugün 41 ürünün 41'i `UNVERIFIED`.

Müşteriden beklenenler: `docs/next-steps/sprint-6-7-readiness.md` §A (12 madde) ve §C (aktivasyon kontrol listesi).

## 4. DB tabloları ve migration etkisi

- Tek migration: `20261022010000_sprint5_quotes_commerce`.
- **Yalnız ekleme:** 8 yeni tablo, 4 yeni enum, `OrderStatus`'a 2 değer, boş `Order` tablosuna 2 kolon.
- Yıkıcı ifade 0. Mevcut tablolarda yalnız `_prisma_migrations` değişti.
- Önce/sonra sayımları aynı: 41 ürün, 445 medya, 125 yönlendirme, 41 UNVERIFIED fiyat, 594 köken kaydı, 74 eşleşme önerisi.
- Test için aynı DB'de ayrı **`kornne_test`** şeması kullanıldı (38 tablo).
- Ayrıntı ve geri dönüş planı: `docs/data-migration/commerce-schema-changes.md`.

## 5. Test adetleri ve performans

| | Önce (Sprint 3) | Şimdi |
|---|---:|---:|
| Vitest (unit + entegrasyon) | 44 | **85/85** |
| Playwright E2E | 37 | **49/49** |
| Lint / typecheck / i18n / build | ✅ | ✅ |
| Importer dry-run | 0 değişiklik | 0 değişiklik |
| Medya hash | 445/445 | 445/445 |

**Mobil Lighthouse** (simüle throttling, 3 koşu medyanı):

| Sayfa | Sprint 3 | Sprint 4+5 |
|---|---:|---:|
| Ana sayfa | 83 | 86 |
| Kategori | 82 | 86 |
| Ürün | 84 | 87 |
| AR ana sayfa | 80 | 88 |
| Arama | 85 | 88 |
| Teklif formu | — | 90 |
| Sepet (kilitli) | — | 90 |

- Erişilebilirlik ve Best Practices **100**; CLS **0**; TBT 20–60 ms.
- SEO 69, staging'deki bilinçli `noindex` yüzünden (tek başarısız denetim `is-crawlable`).
- İyileştirmeler:
  - `inlineCss` kapatıldı: HTML 51 → 24 KiB.
  - Font preload'ları kaldırıldı.
- **90+ hedefi** teklif formu ve sepette karşılandı; ana, kategori ve ürün sayfaları 86–88.
- Ayrıntı: `docs/qa/sprint-4-5-test-results.md`.

Test sırasında bulunup düzeltilenler:

- Mobil yapışkan CTA hızlı kaydırmada çıkmıyordu.
- 320 px'de 12 px taşma vardı.
- WhatsApp balonu teklif formunu kapatıyordu.
- Admin detayda İngilizce not vardı.

## 6. Açık konuların son durumu

| Konu | Durum |
|---|---|
| **#208** İkizray Kurban Kancası | DRAFT + `needsReview`. Eski URL **307** ile kategorisine gidiyor; listelerde, aramada ve teklifte yok. 301'e **çevrilmedi**, müşteri kararı bekliyor |
| **125 eski URL** | Hepsi tek adımda 301 → 200 (E2E ile doğrulandı) |
| **EN/FR** | 74 öneri (36 EN, 38 FR; 8 düşük güven), **0 onaylı**. Onaysız çeviri sayfası ve hreflang yok. RU/AR ürün sayfası yok |
| **6 kırık görsel** | Kaynakta yok; medya olarak aktarılmadılar, galerilerde görünmüyorlar. Eski URL'leri dürüstçe **404** (sahte 200 yok) |
| **11 fiyat çelişkisi + 6 geçersiz indirim** | Katalog QA'da bekliyor. Tüm fiyatlar UNVERIFIED; hiçbiri müşteriye gösterilmiyor |
| **445 görsel** | Byte düzeyinde aynı (SHA-256 445/445) |

## 7. Bekleyen parola ve entegrasyon onayları

- **Neon `neondb_owner` parolası yenilenmedi.** Yazışmada düz metin paylaşılan parola hâlâ geçerli. Yenilenmesi önerilir. Yenilendikten sonra yalnız `.env` güncellenir; parola hiçbir dosyaya veya log'a yazılmadı.
- Ödeme sağlayıcısı seçimi ve sandbox anahtarları.
- E-posta sağlayıcısı ve teklif bildirim adresi: `QuoteNotifier` şu an noop, gerçek gönderim yok.
- Satıcı tüzel bilgileri, KDV, kargo/kurulum kuralları, hukuken onaylı KVKK / mesafeli satış / iade metinleri.
- 41 fiyatın doğrulanması; EN/FR eşleşme onayları; #208 kararı; teknik özellik ve PDF kaynakları.
- Liste: `docs/next-steps/sprint-6-7-readiness.md`.

## 8. Dosya yolları ve ekran görüntüleri

**Belgeler:**

- `docs/sprints/sprint-4-5-report.md` (bu dosya)
- `docs/architecture/commerce-modes.md`
- `docs/architecture/order-payment-contract.md`
- `docs/data-migration/commerce-schema-changes.md` + `evidence/s45-*.json`
- `docs/qa/sprint-4-5-test-results.md` + `docs/qa/lighthouse/*.json`
- `docs/next-steps/sprint-6-7-readiness.md`
- Ham log'lar: `data/qa-logs/s45-*` (gitignore'da)

**Kod (başlıcaları):**

- Ürün sayfası:
  - `src/app/[locale]/urun/[slug]/page.tsx`
  - `src/components/catalog/PriceStatusBlock.tsx`
  - `src/components/quote/{AddToQuote,QuantityStepper,StickyQuoteBar,QuoteListLink,QuoteListView,CommerceLocked}.tsx`
- Teklif:
  - `src/lib/quote/{store,validation,service,status-labels}.ts`
  - `src/app/[locale]/teklif-listem/{page,actions}.ts(x)`
  - `src/app/admin/(panel)/quotes/…`
- Ticaret:
  - `src/lib/commerce/{gate,totals,order-state,service}.ts`
  - `src/lib/commerce/payments/provider.ts`
  - `src/app/api/v1/payments/webhook/[provider]/route.ts`
  - `src/app/[locale]/{sepetim,odeme}/page.tsx`
- Şema: `prisma/schema.prisma`, `prisma/migrations/20261022010000_sprint5_quotes_commerce/`
- Testler:
  - `tests/unit/{commerce,quote-validation}.test.ts`
  - `tests/integration/*`
  - `tests/e2e/sprint45.spec.ts`
  - `tests/e2e/visual.spec.ts` (s45 çekimleri)
- Araçlar:
  - `scripts/test-db/deploy.mjs`
  - `scripts/qa/s45-residue.mjs`
  - `scripts/qa/lighthouse.mjs` (medyan)

**Ekran görüntüleri** (`docs/qa/screenshots/s45-*.png`, 16 adet):

| Görüntü | Ekran |
|---|---|
| `s45-product-1440` | Ürün sayfası (masaüstü) |
| `s45-product-dark-1440` | Ürün sayfası, koyu tema |
| `s45-product-variant-1024` | Varyantlı ürün |
| `s45-variant-error-1024` | Varyant seçilmeden ekleme hatası |
| `s45-product-375` | Ürün sayfası (mobil) |
| `s45-sticky-bar-375` | Mobil yapışkan teklif çubuğu |
| `s45-quote-list-1440` | Teklif listesi (masaüstü) |
| `s45-quote-list-375` | Teklif listesi (mobil) |
| `s45-quote-list-ar-375` | Arapça teklif listesi (RTL) |
| `s45-quote-empty-375` | Boş teklif listesi |
| `s45-quote-errors-1440` | Form hataları |
| `s45-quote-success-1440` | Başarı ekranı |
| `s45-admin-quotes-1440` | Admin teklif listesi |
| `s45-admin-quote-detail-1440` | Admin teklif detayı |
| `s45-cart-locked-1440` | Kilitli sepet |
| `s45-checkout-locked-375` | Kilitli ödeme (mobil) |

## Bilinen eksikler (dürüst liste)

- Teklif durum yönetimi (CRM) ve saklama süresi dolan talepleri anonimleştiren iş **yok** (Sprint 6).
- Gerçek e-posta/SMS bildirimi yok; arayüz hazır.
- Müşteri hesabı / misafir checkout UI yazılmadı. Eski hesap ve siparişler taşınmadı; onay gerekiyor.
- Çoklu tarayıcı (Safari, Firefox, Samsung) ve ekran okuyucu testleri koşulmadı.
- AR ürün sayfası olmadığı için galerinin RTL davranışı ürün sayfasında doğrulanamadı.
- E2E, gerçek `public` şemasına geçici `@kornne.test` kayıtları yazıp siliyor. Staging için ayrı Neon dalı önerilir.
- Ana, kategori ve ürün sayfalarında mobil Lighthouse 86–88 (hedef 90).
