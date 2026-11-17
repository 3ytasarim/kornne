# iyzico kart ödemesi (17.11.2026)

**Yöntem:** iyzico Checkout Form (iyzico'nun barındırdığı ödeme sayfası). Kart bilgisi KORNNE sunucusuna hiç gelmez.

**Kod:**
- `src/lib/commerce/payments/iyzico.ts`: istemci; imzalama ve imza doğrulama.
- `src/lib/commerce/card-payments.ts`: ödemeyi başlatma ve sonuçlandırma.
- `src/app/api/v1/payments/iyzico/callback`: müşterinin iyzico'dan dönüşü.
- `src/app/api/v1/payments/iyzico/webhook`: iyzico bildirimi.

## Akış

1. Müşteri ödeme sayfasında "Kredi / banka kartı" seçer. Sipariş `AWAITING_PAYMENT` ve `paymentMethod=CARD` ile açılır.
2. Sunucu iyzico'ya sepeti gönderir ve müşteriyi iyzico'nun ödeme sayfasına yönlendirir.
   - Gönderilen sepetin toplamı sipariş toplamına eşit olmak zorunda; kargo ayrı bir kalem olarak gider.
   - Taksit kapalıdır (tek çekim).
3. Ödeme sonrası iyzico müşteriyi `/api/v1/payments/iyzico/callback` adresine döndürür. Sunucu sonucu iyzico'dan **kendisi sorgular** ve şunları denetler:
   - imza
   - tutar ve para birimi
   - sepet (sipariş no) ve deneme kimliği

   Sonuç:

   | Durum | Sonuç |
   |---|---|
   | Onaylı (fraudStatus 1) | Sipariş **PAID** olur |
   | İncelemede (0) | Sipariş açık kalır; webhook sonra kesinleştirir |
   | Reddedildi / başarısız | Sipariş açık kalır; müşteri tekrar dener veya havale yapar |
   | Tutar uyuşmazlığı | Sipariş **FAILED** olur, gönderilmez. iyzico panelinden kontrol edilip iade yapılır |
4. Müşteri kendi dilindeki ödeme sayfasına sonuçla döner (`?sonuc=ok|review|fail&no=…`). Başarısızsa e-postasını girip tekrar dener; sipariş başına en çok 5 deneme yapılabilir.

Her sonuç `PaymentWebhookEvent` tablosuna yazılır. Kayıtta iade için gereken `paymentTransactionId` değerleri de bulunur.

## Açmak için (sunucu `.env`)

```
ENABLE_CARD_PAYMENT=true
IYZICO_API_KEY=...
IYZICO_SECRET_KEY=...
IYZICO_BASE_URL=https://sandbox-api.iyzipay.com   # önce sandbox; canlıda https://api.iyzipay.com
```

Kart ödemesinin çalışması için ödeme kapısının da açık olması gerekir (`ENABLE_PAID_CHECKOUT` ve diğerleri, docs/architecture/commerce-modes.md). Değişkenleri girdikten sonra **build + `pm2 restart`** gerekir (footer logoları derleme sırasında üretilir; yalnız restart yetmez).

Footer'daki iyzico / kart logoları **yalnız** kart ödemesi ve ödeme kapısı ikisi birden açıkken görünür. Kabul edilmeyen kartın logosu gösterilmez.

## iyzico panelinde

- **Bildirim URL'si** (Ayarlar › Firma Ayarları › Bildirimler): `https://kornne.com/api/v1/payments/iyzico/webhook`. X-IYZ-SIGNATURE-V3 imzası açılmalı (iyzico entegrasyon desteğinden istenir).
- **USD ile tahsilat:** iyzico hesabında yabancı para birimi açık olmalı. İngilizce ve diğer dillerdeki siparişler USD ödenir. Açık değilse iyzico USD ödemeyi reddeder ve müşteri havaleye yönlendirilir.

## Test (sandbox)

- Kart: 5528790000000008, son kullanma tarihi gelecekte herhangi bir ay/yıl, CVC 123.
- 3D Secure SMS kodu: 123456.

Kontrol edilecekler:
- Başarılı ödemede sipariş PAID olmalı ve admin siparişinde "iyzico ödeme … VISA/MASTER ****" satırı görünmeli.
- Kartla ödenmiş veya incelemedeki siparişte admin havale onayı reddedilir.
