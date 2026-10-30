# Ticari modlar — teklif usulü ve fiyatlı e-ticaret (Sprint 4 + 5)

KORNNE'de iki ayrı ticari mod var. Sınırları kod düzeyinde ayrıdır; bir modun verisi diğerine karışmaz.

| | **1. Teklif usulü** | **2. Fiyatlı e-ticaret** |
|---|---|---|
| Durum | **Açık, canlı DB ile çalışıyor** | **Kilitli** (`ENABLE_PAID_CHECKOUT=false` + 5 ek kapı) |
| Ürün koşulu | Yayında (PUBLISHED, `needsReview=false`) her ürün | Yalnız `Price.status=VERIFIED` **ve** KDV durumu bilinen ürün |
| Fiyat | Hiçbir yerde yok (ekranda, listede, DB snapshot'ında) | DB'deki doğrulanmış fiyattan **sunucuda** hesaplanır |
| Çıktı | `QuoteRequest` + `QuoteItem` + `QuoteStatusEvent` (CRM iş kaydı) | `Cart` → `Order` → `PaymentAttempt` → webhook |
| Müşteriye mesaj | “Teklif talebiniz alındı” + referans (TKL-…) | Kilitliyken sayfa yalnız kilit bildirimi gösterir |
| Test | Gerçek Neon `public` şeması (test kayıtları `@kornne.test`, teardown siler) | Yalnız izole `kornne_test` şeması + mock sağlayıcı |

## 1. Teklif usulü (veri akışı)

```
Ürün sayfası ──(Teklif listesine ekle / Bu ürün için teklif iste)──► localStorage "kornne-quote-list-v1"
   (ürün no, varyant id+etiketi, adet, başlık, görsel; KİŞİSEL VERİ VE FİYAT YOK)
         │
/teklif-listem  ─ adet +/−/elle (1–999), sil, boş durum, mobil, RTL
         │  form: ad*, firma, e-posta | telefon (en az biri), not; honeypot "website"; idempotency UUID
         ▼
Server Action submitQuoteAction  (Next Server Action → Origin kontrolü = CSRF koruması)
   1. Zod doğrulama (kontrol karakterleri temizlenir, alan uzunlukları, e-posta/telefon biçimi)
   2. Bot: honeypot dolu / form < 2 sn / form > 24 sa → "spam" (sebep açıklanmaz)
   3. Rate limit: IP hash başına 5/saat, e-posta başına 3/saat (DB sayımı)
   4. Idempotency: aynı anahtar → ilk kaydın referansı döner (yarış durumunda P2002 yakalanır)
   5. Ürünler DB'den yeniden doğrulanır: yayında olmayan / bilinmeyen / sahte varyant → reddedilir
   6. Tek transaction: QuoteRequest + QuoteItem (başlık snapshot'ı, kaynak anahtarı, varyant etiketi) +
      QuoteStatusEvent(NEW) + AuditLog("quote.created", KİŞİSEL VERİ YOK)
   7. Bildirim arayüzü (QuoteNotifier) — şu an noop; gerçek e-posta/SMS yok
         ▼
"Teklif talebiniz alındı" + TKL-YYYYMMDD-XXXXXX; liste temizlenir; URL'de kişisel veri yok
         ▼
/admin/quotes  (quotes modülü: SUPER_ADMIN, ADMIN, ORDER_OPERATOR)
   liste: referans, tarih, durum, kalem sayısı — kişisel veri YOK
   detay: iletişim + kalemler + durum geçmişi; her açılış AuditLog("quote.viewed")
```

- **Gizlilik metni:** form, mevcut `/sayfa/kisisel-verilenin-korunmasi-kanunu` sayfasına gerçek link verir. Metin hukuken onaylı olmadığı için “onay alındı” denmez; kayda yalnız gösterilen metin sürümü yazılır: `kvkk-legacy-unapproved-2026-10`.
- **Saklama:** her talebe `retainUntil = oluşturma + 730 gün` (`QUOTE_RETENTION_DAYS`) yazılır. Otomatik silme işi **henüz yok** (Sprint 6).
- **Loglama:** kişisel veri log'a, URL'ye, analytics'e veya audit kaydına yazılmaz. IP yalnız hash olarak tutulur.

## 2. Fiyatlı e-ticaret kapısı

`src/lib/commerce/gate.ts` → `commerceGate(env)`. **Bayrak tek başına yetmez.** Kapı ancak aşağıdakilerin hepsi sağlanınca açılır:

| Koşul | Ortam değişkeni | Bugünkü durum |
|---|---|---|
| Özellik bayrağı | `ENABLE_PAID_CHECKOUT=true` | false |
| Satıcı tüzel kimliği | `COMMERCE_SELLER_LEGAL_NAME`, `COMMERCE_SELLER_TAX_ID` | yok (müşteri onayı bekleniyor) |
| KDV modu ve oranı | `COMMERCE_VAT_MODE=included\|excluded`, `COMMERCE_VAT_RATE_BP` | yok |
| Kargo / kurulum kuralları | `COMMERCE_SHIPPING_APPROVED=true` | yok |
| Mesafeli satış / iade / gizlilik metinleri | `COMMERCE_LEGAL_APPROVED=true` | yok |
| Ödeme sağlayıcısı | `PAYMENT_PROVIDER` | seçilmedi |
| Mock sağlayıcı | `PAYMENT_PROVIDER=mock` yalnız `NODE_ENV=test` | — |

Kapı açılsa bile her servis çağrısı ürün başına yeniden kontrol eder:

- `UNVERIFIED` fiyat **sepete giremez**.
- KDV durumu bilinmeyen fiyat sepete giremez.
- Adet 1–999 tam sayı olmalı.
- Toplamlar istemciden alınmaz; DB'deki doğrulanmış fiyattan hesaplanır.

Kilitliyken uçların davranışı:

- `/sepetim`, `/odeme` ve dil karşılıkları kilit bildirimi gösterir: “Online sepet ve ödeme şu an kapalı”. Ödeme yöntemi, IBAN veya “Siparişi tamamla” yoktur.
- Kapı açıldığında bu sayfalar `notFound` verir. Gerçek checkout UI, onaylar gelince yazılacak.
- `POST /api/v1/payments/webhook/[provider]` → **404**.

## Fiyat doğrulama kuralları

- Bugün 41 fiyatın tamamı `UNVERIFIED`. Hiçbir sprint otomatik `VERIFIED` yazmaz.
- `PriceStatusBlock` fiyatı yalnız şu üç koşul birlikte sağlanınca gösterir: `VERIFIED`, tutar var ve `vatIncluded` biliniyor. Aksi hâlde “Fiyat için teklif alın” gösterilir.
- JSON-LD `Offer` / `AggregateRating` / `Review` üretilmez (`offer: null`).
- 11 fiyat çelişkisi ve 6 geçersiz indirim Katalog QA'da kararı bekliyor. Bu kayıtlar teklif akışını etkilemez.
