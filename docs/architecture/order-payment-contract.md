# Sipariş / ödeme sözleşmesi (Sprint 5 — altyapı, kilitli)

> Bu altyapı yalnız izole `kornne_test` şemasında, mock sağlayıcıyla çalıştırıldı. Gerçek ödeme, gerçek sipariş e-postası/SMS ve canlı API çağrısı **yok**. Sağlayıcı **seçilmedi**.

## Para modeli

- Tutarlar **kuruş cinsinden `BigInt`** (`amountMinor`). Bu, Decimal ile eşdeğer kesinliktedir ve ondalık kayan nokta hatası yoktur. Para birimi `TRY`.
- KDV oranı baz puan olarak tutulur (`vatRateBp`; 2000 = %20). KDV **satır bazında**, yarım-yukarı yuvarlanır (`divRoundHalfUp`).
  - KDV dahil fiyatlarda `net = brüt − KDV`.
  - KDV hariç fiyatlarda `brüt = net + KDV`.
- `computeTotals(lines, shippingMinor)` = Σ net, Σ KDV, kargo, toplam. Unit testler yuvarlama sınırlarını kapsar.

## Sipariş durum makinesi (`src/lib/commerce/order-state.ts`)

| Geçiş | İzinli aktörler |
|---|---|
| DRAFT → AWAITING_PAYMENT | customer, system |
| DRAFT → CANCELLED | customer, admin, system |
| AWAITING_PAYMENT → **PAID** | **yalnız provider** (doğrulanmış webhook) |
| AWAITING_PAYMENT → FAILED | provider, system |
| AWAITING_PAYMENT → CANCELLED | customer, admin, system |
| FAILED → AWAITING_PAYMENT (yeniden deneme) | customer |
| FAILED → CANCELLED | customer, admin, system |
| PAID → PROCESSING / REFUNDED | admin |
| PROCESSING → SHIPPED | admin |
| SHIPPED → DELIVERED | admin, system |

Tabloda olmayan her geçiş reddedilir.

- Her geçişte `assertTransition(from, to, actor)` çağrılır. Geçersiz geçiş veya yanlış aktör `TransitionError` fırlatır.
- **Yalnız `provider` aktörü** `AWAITING_PAYMENT → PAID` yapabilir; müşteri ve admin “ödendi” işaretleyemez.
- Geçişler iyimser kilitle yazılır: `updateMany where {id, status: from}`. Etkilenen satır 0 ise başka bir istek önce geçmiştir ve işlem tekrarlanmaz.
- Her geçiş `OrderStatusEvent` olarak kaydedilir.
- `DRAFT` ve `FAILED` teknik durumlardır; müşteriye “sipariş verildi” olarak gösterilmez.

## Sağlayıcı arayüzü (`src/lib/commerce/payments/provider.ts`)

```ts
interface PaymentProvider {
  readonly name: string;
  // sağlayıcıda ödeme oluşturur; referans + (3-D Secure için) yönlendirme adresi döner
  createPayment(input: { attemptId: string; amountMinor: bigint; currency: string; returnUrl: string }): Promise<{ providerRef: string; redirectUrl: string | null }>;
  // ham gövde + başlıkları sabit zamanlı doğrular, eski zaman damgalarını reddeder
  verifyWebhook(rawBody: string, headers: Headers, now?: Date): VerifyResult;
}
```

Idempotency, sağlayıcıya bırakılmaz; `startPayment` içinde `PaymentAttempt.idempotencyKey` ile uygulanır.

- **MockProvider** (yalnız test) şu kurallarla çalışır:
  - HMAC-SHA256 imza başlığı: `x-mock-signature: t=<unix>,v1=<hex>`.
  - Gizli anahtar en az 32 karakter.
  - Zaman toleransı 300 sn.
  - İmza karşılaştırması `timingSafeEqual` ile yapılır.
  - İmza **ham gövde** üzerinden doğrulanır.
- Gerçek sağlayıcı (iyzico / PayTR / Stripe vb.) aynı arayüzü uygulayacak. Seçim müşteri kararı.

## Ödeme başlatma — idempotency

`startPayment(db, gate, provider, orderId, idempotencyKey)`:

- Aynı anahtar her zaman aynı `PaymentAttempt` kaydını döndürür; ikinci bir sağlayıcı çağrısı yapılmaz.
- Sipariş `PAID` ise reddedilir (`invalid_state`).
- Tutar, siparişin sunucuda hesaplanmış toplamıdır.

## Webhook işleme sırası (`processWebhook`)

1. **Kapı:** kapalıysa `checkout_disabled`. Route ayrıca 404 döner.
2. **İmza:** geçersizse **401** `rejected_signature`. Hiçbir durum değişmez, kurcalanmış gövde de reddedilir.
3. **Tekrar (replay):** `PaymentWebhookEvent (provider, eventId)` benzersiz. Aynı olay ikinci kez gelirse **200 `duplicate`** döner, geçiş yapılmaz.
4. **Deneme:** `providerRef` bilinmiyorsa **404 `unknown_payment`**.
5. **Tutar / para birimi:** uyuşmazsa **400 `amount_mismatch`**. Deneme `FAILED` olur (`failureReason=amount_or_currency_mismatch`), sipariş `FAILED` olur ve asla `PAID` olmaz.
6. **Geçiş:** iyimser kilitle `AWAITING_PAYMENT → PAID` yapılır.
   - Eşzamanlı farklı “ödendi” olaylarından tam **bir** tanesi geçer; diğerleri `ignored_state` alır.
7. Her geri çağrı (geçersiz olanlar dahil) kayıt altına alınır.

## Erişim (IDOR)

- `getOrderForViewer(db, orderId, {accessToken?, customerId?})` yalnız iki durumda sipariş döndürür:
  - Siparişin erişim jetonunu (yalnız **hash**'i saklanır) bilen kişiye.
  - Siparişin sahibi olan müşteriye.
- Yanlış jeton, başka müşteri veya kimliksiz istek `null` alır.

## Test kapsamı (`tests/integration/commerce-flow.test.ts`, izole şema)

- Kapalı kapı: sepet ve webhook reddedilir.
- `UNVERIFIED` fiyat sepete giremez; geçersiz adetler (0, −1, 1000, 1.5) reddedilir.
- Mutlu yol: sepet → toplam → taslak sipariş → ödeme → imzalı webhook → `PAID`. Ardından replay → `duplicate`.
- `startPayment` idempotent; ödenmiş sipariş için yeniden ödeme reddedilir.
- Sahte veya kurcalanmış imza → 401, durum değişmez.
- Tutar uyuşmazlığı → `FAILED`.
- Eşzamanlı 4 “ödendi” olayı → tek geçiş.
- Bilinmeyen referans → 404.
- IDOR: yalnız jeton sahibi okur.
