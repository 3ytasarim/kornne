# KORNNE — ABD (Merchant Center) için politika metinleri

Kaynak: canlı sitedeki mevcut iade metni (TR) ve müşteri kararları (12.11.2026):
- Hedef ülke **US**, içerik dili **en**, feed etiketi **US**, para birimi **USD** (TR hariç tüm dillerde USD).
- Ticari unvan: **Mezbaha Teknolojileri** (müşteri teyidi).
- Nakliye: **alıcıya ait**. Alıcı kendi nakliyecisini/forwarder'ını bildirir, ürün fabrikada teslim edilir (EXW).
- Yurt dışı satışta KDV yok.

İnternette resmi sicil kaydı bulunamadı. Vergi dairesi, vergi no ve MERSİS sonradan Admin › Ayarlar › Firma bölümüne girilmeli.

---

## 1. Admin › Ayarlar (değerleri girip "Doğrulandı" işaretleyin)

| Anahtar | Değer |
|---|---|
| Firma › Ticari unvan (`company.legalName`) | `Mezbaha Teknolojileri` |
| Google Merchant › Hedef ülke | `US` |
| Google Merchant › İçerik dili | `en` |
| Google Merchant › feedLabel | `US` |
| Ticaret › Kargo / nakliye kuralları (`commerce.shippingPolicy`) | Aşağıdaki "Shipping policy" metni |

## 2. Shipping policy (EN): Kargo / nakliye kuralları alanına

```
Shipping & Delivery

Prices on kornne.com are ex-works (EXW, Incoterms 2020) at our factory in Dilovası, Kocaeli, Türkiye, and do not include freight, insurance, customs duties or import taxes.

Freight is arranged and paid by the buyer. After your order is confirmed, tell us your freight forwarder or carrier and the delivery address; we prepare the goods, export packaging and commercial documents (commercial invoice, packing list) and hand them over to your carrier at our factory.

Lead time: we confirm the ready-for-pickup date in writing with your order confirmation. Made-to-order equipment is prepared after payment is received.

Customs duties, import taxes and destination charges are the buyer's responsibility.

Questions: info@kornne.com · +90 535 406 80 02
```

## 3. Return & refund policy (EN): Admin › İçerik › "İade ve Geri Ödeme Politikaları" sayfasının EN çevirisi

Mevcut TR metinden uyarlandı. Euro tutarı kaldırıldı; değer yerine "yüksek değerli / 1 m³ üzeri" ifadesi kullanıldı. Kurallar TR metinle aynı.

```
Return & Refund Policy

Mezbaha Teknolojileri accepts returns of products purchased on www.kornne.com with its prior written approval, under the conditions below.

Return window
Return requests must be made within 15 days of receiving the order.

Eligible items
Items must be unused, in their original packaging, in resalable condition and returned with the invoice issued by Mezbaha Teknolojileri. Used, tested, washed or custom-made (made-to-order) products cannot be returned.

Return shipping
If the return is caused by our error, we arrange collection and cover the return freight, provided the return was notified to and approved by us in advance. Otherwise the return freight is paid by the buyer. Cash-on-delivery returns are not accepted. For items larger than 1 m³ or of high value, return freight is assessed case by case before approval.

Transport damage
Claims for damage in transit are accepted only if reported within 24 hours of delivery together with the carrier's damage report.

Refunds
After the returned item arrives and is inspected, the refund is made to the original payment account (bank transfer, in the currency paid). Deductions may apply if the item or its original packaging is damaged.

Warranty
The warranty covers manufacturing defects only; it does not cover misuse or modification by the user.

Return address
Mezbaha Teknolojileri, S.S. İstanbul Mermerciler Sanayi Sitesi 22. Sokak No: 15, Köseler Mahallesi, Dilovası / Kocaeli, Türkiye
Contact: info@kornne.com · +90 535 406 80 02
```

Metni kaydettikten sonra sayfanın **yasal onayını** verin. Merchant kontrolü bunu "hukuken onaylı" olarak sayar. Onayı veren kişi metnin firmanın gerçek iade uygulamasıyla aynı olduğundan emin olmalı.

## 4. Merchant Center (Google tarafı)

- **Kargo ayarı:** ABD için bir kargo hizmeti tanımlanmalı. Google her ürün için bir nakliye bedeli ister. "Alıcı öder / nakliye ayrıca" seçeneği yoktur. Nakliye alıcıya ait olduğunda Google'ın kabul ettiği iki yol var:
  1. Kargo **0 USD** girilir ve ilan "EXW, freight arranged by buyer" açıklamasıyla verilir. Google bunu "ücretsiz kargo" olarak gösterebilir. Bu, sitedeki metinle çeliştiği için ret riski taşır.
  2. Ortalama bir ABD nakliye bedeli (ör. ürün grubu başına sabit USD) belirlenip hem sitede hem Merchant'ta aynı tutar kullanılır.
  Karar müşteriye ait. Netleşene kadar ürünler "kargo eksik" uyarısı alabilir.
- **İade politikası:** Merchant Center › İade politikası alanına 15 gün ve "alıcı öder" bilgileri girilir; iade sayfasının EN adresi verilir.
- **Vergi:** ABD satış vergisi ayarı yok (ihracat).
