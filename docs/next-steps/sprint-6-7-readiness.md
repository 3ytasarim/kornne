# Sprint 6 + 7 hazırlık — onaylar, gereksinimler, ödeme aktivasyonu

> Sprint 6'ya **geçilmedi**. Bu belge, sonraki sprintlerin başlaması ve fiyatlı satışın açılması için gerekenleri listeler.

## A. Müşteriden beklenen onaylar ve bilgiler

| # | Konu | Neden gerekli | Bloke ettiği |
|---|---|---|---|
| 1 | **Neon `neondb_owner` parolasının yenilenmesi** (şu an yazışmada paylaşılan parola hâlâ geçerli: **yenilenmedi**) | Parola düz metin olarak paylaşıldı | Güvenli staging/prod |
| 2 | Şirket tüzel unvanı, vergi dairesi ve no, MERSİS, adres | Mesafeli satış, fatura, `COMMERCE_SELLER_*` | Fiyatlı satış |
| 3 | 41 ürünün **güncel fiyatı**, para birimi, **KDV dahil/hariç** ve oranı | Bugün hepsi `UNVERIFIED`. 11 fiyat çelişkisi ve 6 geçersiz indirim çözülmeli | Fiyat gösterimi, sepet, Merchant |
| 4 | Kargo / nakliye / kurulum kuralları, termin süreleri | Toplam hesabı ve sözleşme metni | Checkout |
| 5 | Hukuken onaylı KVKK aydınlatma metni, çerez politikası, mesafeli satış sözleşmesi, ön bilgilendirme, iade politikası | Mevcut eski metinler onaysız (`kvkk-legacy-unapproved-2026-10`) | Teklif formundaki aydınlatma, checkout |
| 6 | Ödeme sağlayıcısı seçimi (iyzico / PayTR / Param / Stripe…) ve sandbox hesap bilgileri | `PaymentProvider` arayüzünün gerçek uygulaması | Ödeme |
| 7 | E-posta gönderim sağlayıcısı + gönderen alan adı (SPF/DKIM). Teklif bildirimi hangi adrese gitsin? | `QuoteNotifier` şu an noop | Satış ekibine otomatik bildirim |
| 8 | 74 EN/FR eşleşme önerisinin onayı (8'i düşük güvenli) | Onaysız çeviri sayfası açılmıyor | EN/FR ürün sayfaları |
| 9 | #208 (İkizray Kurban Kancası): yayınla / birleştir / kaldır kararı | Şu an DRAFT + 307 | Kalıcı 301 kararı |
| 10 | 6 kırık kaynak görselin yenisi (varsa) | Kaynakta yoklar; 404 kalıyorlar | Galeriler |
| 11 | Teknik özellik tabloları ve PDF dokümanlar (gerçek kaynak) | Bugün doğrulanmış teknik veri 0 | Ürün sayfası teknik bloğu, AI/GEO içeriği |
| 12 | Teklif saklama süresi (varsayılan 730 gün) ve sorumlu kişi | KVKK saklama/imha politikası | Otomatik imha işi |

## B. Sprint 6 — Admin / CMS gereksinimleri

- **Teklif CRM'i:**
  - Durum değiştirme (NEW → IN_REVIEW → RESPONDED → CLOSED/SPAM), atanan kişi, iç not.
  - Her değişiklik `QuoteStatusEvent` + audit.
  - Bugün yalnız salt okunur liste ve detay var.
- **Saklama işi:** `retainUntil` geçen talepleri anonimleştiren zamanlanmış görev (dry-run + audit). Bugün yok.
- **Fiyat onay ekranı:**
  - İki aşamalı onay (giren ≠ onaylayan): `UNVERIFIED → VERIFIED`, KDV modu, geçerlilik tarihi.
  - Değişiklik geçmişi.
  - 11 çelişki ve 6 indirim için karar arayüzü.
- **Ürün CRUD:** açıklama ile doğrulanmış teknik alanlar ayrı; spec tablosu, doküman (PDF) yükleme, varyant yönetimi.
- **İçerik / sayfa CMS:** onaylı hukuki metinler sürümlü; formdaki aydınlatma sürümü otomatik bağlanır.
- **Bildirim adaptörü:** `QuoteNotifier` için e-posta uygulaması. Kişisel veri yalnız alıcıya gider, log'a düşmez.
- **Admin güvenliği:** 2FA, oturum listesi, parola sıfırlama (e-posta sağlayıcısı gerekli).

## C. Sprint 7 — Gerçek ödeme aktivasyonu kontrol listesi

Hepsi işaretlenmeden `ENABLE_PAID_CHECKOUT=true` yapılmaz. Kapı (`commerceGate`) zaten bu koşulları zorunlu tutar.

- [ ] A2–A6 onayları alındı, ortam değişkenleri **sunucu** sırlarında (Git'te değil)
- [ ] En az bir ürün fiyatı iki kişi tarafından `VERIFIED` yapıldı, KDV durumu dolu
- [ ] Gerçek sağlayıcı adaptörü yazıldı. Sandbox'ta: imza doğrulama, 3-D Secure dönüşü, iade, replay, tutar uyuşmazlığı ve eşzamanlılık testleri geçti
- [ ] Webhook uç noktası yalnız sağlayıcı IP/imzasıyla; rate limit; sırlar rotasyonlu
- [ ] Checkout UI: adres, fatura (bireysel/kurumsal), ön bilgilendirme ve sözleşme onay kutuları (onaylı metinler), sipariş özeti sunucu toplamından
- [ ] Sipariş e-postası, fatura/e-arşiv süreci netleşti
- [ ] Müşteri hesabı **veya** misafir sipariş + erişim jetonu kararı. Eski sistemdeki hesaplar/siparişler açık onay olmadan **taşınmaz**
- [ ] Hukuk / KVKK incelemesi, güvenlik denetimi (CSP nonce, OWASP), yük testi
- [ ] Önce staging'de gerçek kartla küçük tutarlı test + iade; sonra prod

## D. Teknik borç / sonraki ölçümler

- **Mobil Lighthouse:** ana, kategori ve ürün sayfaları 86–88. Adaylar:
  - Hetzner + CDN'de Brotli/HTTP2 ölçümü.
  - Hero görsel boyutu.
  - Ortak istemci adalarının küçültülmesi.
- **CSP nonce:** inline JSON-LD ve Next betikleri için. Security sprintinde.
- **Çoklu tarayıcı ve ekran okuyucu testleri:** Safari, Firefox, Samsung; NVDA, VoiceOver.
- **E2E test kayıtları:** Playwright, gerçek `public` şemasına `@kornne.test` kaydı yazıp siliyor. Staging'de ayrı Neon dalı açılınca E2E oraya taşınmalı.
