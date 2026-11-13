# KORNNE — Merchant hazırlık raporu (13.11.2026)

**Kaynak:** canlı verinin salt-okunur kopyası (41 ürün) ve canlı site (kornne.com) taraması. Merchant Center: 5464948768.

**Sonuç:** READY 0, BLOCKED 41. Kod değişikliklerinden sonra da READY 0'dır, çünkü kalan engellerin hepsi gerçek iş verisi (stok, marka, MPN) veya yetkili onayı istiyor. Bu bilgiler uydurulmadı. Google'a hiçbir şey gönderilmedi. `MERCHANT_API_ENABLED` ve `SECRETS_ROTATION_CONFIRMED` değiştirilmedi.

Sunucuda aynı raporu üretmek için:

```bash
npx tsx --conditions=react-server scripts/merchant/readiness-report.ts --db=neon
npx tsx --conditions=react-server scripts/merchant/readiness-report.ts --db=neon --assume-target=US,en,US   # simülasyon
npx tsx --conditions=react-server scripts/merchant/readiness-report.ts --db=neon --export=feed-ready.xml      # yalnız READY ürünler
```

Betik veritabanına salt-okunur bağlanır (`default_transaction_read_only=on`).

## 1. Engeller

### Global (tüm ürünleri durdurur)

| Kod | Ürün | Tür | Neden | Kim / nerede |
|---|---|---|---|---|
| TARGET_UNSET | 41 | iç kural | `merchant.targetCountry/contentLanguage/feedLabel` ayarları hiç girilmemiş | Admin › Ayarlar: US / en / US gir + Doğrulandı |
| CHECKOUT_CLOSED | 41 | Google | Canlıda "Online cart and payment are currently closed". Google, fiyatı gösterilen ürünün satın alınabilir olmasını ister | Sunucu .env: aşağıdaki "Ödeme" maddesi |
| SHIPPING_UNVERIFIED | 41 | Google + iç onay | `commerce.shippingPolicy` ayarı yok | Admin › Ayarlar: Shipping Policy özeti + Doğrulandı |
| RETURNS_UNVERIFIED | 41 | Google + iç onay | İade sayfası hukuki onaysız (5 yasal sayfanın hiçbiri onaylı değil) | Admin › İçerik: yasal onay |
| BUSINESS_IDENTITY_UNVERIFIED | 41 | Google + iç onay | `company.legalName` ayarı yok | Admin › Ayarlar: ticari unvan + Doğrulandı |

### Ürüne özel (hedef US/en varsayımıyla, simülasyon)

| Kod | Ürün | Tür | Açıklama |
|---|---|---|---|
| AVAILABILITY_UNKNOWN | 41 | Google (engel) | Stok durumu hiçbir üründe girilmemiş (hepsi UNKNOWN). Admin'de girilebilecek ekran yoktu; artık var |
| BRAND_UNVERIFIED | 41 | Google (engel) | Veritabanında marka kaydı yok |
| IDENTIFIER_MISSING | 41 | Google (engel) | GTIN, MPN ve identifier_exists=no yok |
| PRICE_FX_CONVERTED | 41 | iç kural (uyarı) | 41 fiyatın hepsi onaylı ama TL. ABD feed'inde TCMB kuruyla USD'ye çevriliyor |
| DESCRIPTION_SHORT | 21 | iç kural (uyarı) | İngilizce açıklama yalnız ürün adı (8–32 karakter): #105 #109–#114 #118–#131 #217. Bilgi müşteriden gelmeli |
| IMAGE_BELOW_2027 | 9 | Google (uyarı) | Ana görsel 500 px altı; 31.01.2027'den itibaren engel olur |
| IMAGE_REVIEW | 3 | iç kural (uyarı) | WhatsApp veya ekran görüntüsü olabilir; manuel kontrol |
| GOOGLE_CATEGORY_MISSING | 41 | isteğe bağlı | Google kendisi atar |
| OFFER_ID_UNMAPPED | 41 | iç kural (uyarı) | Eski hesaptaki item_id eşlemesi yüklenmemiş (Admin › Merchant › Eski item_id eşleme) |

Ürün sayfası, çeviri, başlık, görsel biçimi ve fiyat onayı açısından engel **yok**. İngilizce çevirilerin 41'i de yayında ve 41 fiyatın hepsi onaylı.

### Google zorunluluğu ve KORNNE iç kuralı ayrımı

Kod: `GOOGLE_REQUIRED` ve `RULE_SOURCE` (src/lib/merchant/readiness.ts).

- **Google zorunluluğu:** ürün verisi spesifikasyonu, açılış sayfası, fiyat/stok eşleşmesi, kargo, iade ve işletme bilgisi.
- **KORNNE iç kuralı:**
  - fiyatın yetkili onayı (PRICE_UNVERIFIED)
  - hedef ayarlarının süper yönetici teyidi (TARGET_UNSET)
  - kurla çevrilen fiyat uyarısı
  - eski item_id eşlemesi
  - görsel manuel kontrolü
  - kısa açıklama uyarısı

Admin panosunda her engelin yanında "Google" veya "iç kural" etiketi görünür.

## 2. Noindex incelemesi

- Canlı sitemap'teki 282 adres (6 dil × 47) 200 döner ve hepsi `index, follow`. Yanlışlıkla noindex verilmiş ürün sayfası **yok**.
- "41 ürün noindex" görüntüsü motorun yanlış alarmıydı. Hedef dil teyit edilmediğinde `LANDING_NOT_INDEXABLE` her ürüne yazılıyordu. Düzeltildi: dil yokken bu kontrol yapılmaz, çünkü TARGET_UNSET zaten raporlanıyor.
- Bilerek noindex olanlar:
  - Onaysız yasal sayfalar (iade, shipping, privacy, mesafeli satış, KVKK). Hukuki onay verilince indekslenir ve sitemap'e girer.
  - Sepet, ödeme ve arama sayfaları.

## 3. Politika doğrulaması

| Konu | Durum | Bulgu |
|---|---|---|
| Fiyat | ⚠ | Onaylı TL fiyat, sayfada ve feed'de aynı TCMB kuruyla USD'ye çevriliyor; ikisi tutarlı. Kur günlük değiştiği için Google taraması ile feed arasında fark olabilir. **Öneri:** ürünlere doğrudan USD fiyat girin. |
| Kargo | ✓ kod / ✗ onay | Sabit 100 USD; sepette, siparişte, feed'de (`g:shipping`), JSON-LD'de ve Shipping Policy sayfasında aynı. Merchant Center'daki kargo hizmeti de 100 USD olmalı. İşlem süresi gerçek değerle girilmeli. |
| İade | ✓ metin / ✗ onay | 15 gün, posta ile, iade kargosu alıcıya ait; 5 dilde sayfa var. Hukuki onay bekliyor; onaysızken sayfada uyarı var ve sayfa noindex. |
| Ödeme | ✗ | Canlıda online sipariş kapalı. Açılması için sunucu .env'de: `ENABLE_PAID_CHECKOUT=true`, `PAYMENT_PROVIDER=bank_transfer`, `COMMERCE_SELLER_LEGAL_NAME`, `COMMERCE_SELLER_TAX_ID` (**vergi numarası eksik**), `COMMERCE_VAT_MODE=included` + `COMMERCE_VAT_RATE_BP=2000`, `COMMERCE_SHIPPING_APPROVED=true`, `COMMERCE_LEGAL_APPROVED=true`. Ayrıca **aktif USD banka hesabı yok**: 6 hesabın 6'sı TRY ve pasif. Google yalnız havaleyi "geleneksel ödeme" sayıp saymadığını yazılı belirtmiyor; kart ödemesi riski kaldırır. |
| İşletme kimliği | ✗ tutarsız | 1) **Telefon:** sitede görünen numara +90 535 406 80 02, yapısal veride (Organization) ve WhatsApp'ta +90 505 500 24 96. Google işletme bilgisi sitedekiyle birebir aynı olmalı; hangisinin doğru olduğuna müşteri karar vermeli (Ayarlar › İletişim). 2) **Unvan:** sayfalarda "Mezbaha Teknolojileri", banka hesabı varsayılanında "Mezbaha Teknolojileri A.Ş.". Vergi levhasındaki tam unvan her yerde aynı yazılmalı. |
| Siparişe üretim | ✓ (yeni kural) | MADE_TO_ORDER artık yalnız gerçek temin süresi girilmişse `in_stock` + `max_handling_time` olarak gider. Temin süresi yoksa LEAD_TIME_UNKNOWN engeli çıkar; feed ve ürün sayfası Offer'ı reddeder. |

## 4. Koddaki değişiklikler

- **Admin › Merchant › Toplu inceleme ve onay** (`/admin/merchant/onay`):
  - Tüm ürünler tek tabloda: fiyat, stok/temin, marka, MPN ve engeller.
  - Satırları seçip stok durumu, temin süresi, marka, "tanımlayıcı yok" ve satır bazında MPN girilir.
  - Kaynak notu ve "bilgiler gerçektir" onayı zorunlu.
  - Yetki: `merchant.approve` (Süper Yönetici veya Yönetici).
  - Her ürün için önceki/sonraki değer ve not denetim kaydına yazılır.
  - Boş alan hiçbir şeyi değiştirmez. GTIN üretilmez.
- **Yeni engel kodları:** LEAD_TIME_UNKNOWN (siparişe üretim + temin süresi yok) ve DESCRIPTION_MISSING (açıklama boş; Google zorunlu).
- **Feed:** `max_handling_time` alanı eklendi; temin süresi olmayan siparişe üretim ürünü reddedilir.
- **Ürün sayfası:** Offer, temin süresi olmayan siparişe üretim ürününde yazılmaz.
- **Yanlış alarm düzeltildi:** LANDING_NOT_INDEXABLE.
- **Düzeltme bağlantıları:** stok, marka ve MPN engellerinin "düzelt" bağlantıları yeni ekrana gider.
- **Rapor betiği:** `scripts/merchant/readiness-report.ts` (salt-okunur, simülasyon, READY dışa aktarımı).
- **Testler:** birim ve entegrasyon testleri (yerel test veritabanında).

## 5. Sıradaki adımlar

1. **Ayarlar:** hedef US/en/US, ticari unvan ve kargo kuralı girilip "Doğrulandı" işaretlenir. Telefon tutarsızlığı düzeltilir.
2. **İçerik:** İade, Shipping ve Privacy sayfalarına yasal onay.
3. **Banka hesapları:** aktif bir USD hesabı.
4. **Sunucu .env:** ödeme kapısı değişkenleri (vergi no gerekli), ardından build ve PM2 restart.
5. **Toplu onay:** 41 ürünün gerçek stok/temin süresi, marka (kendi üretimiyse KORNNE) ve MPN'si (yoksa "tanımlayıcı yok").
6. **Önerilen:** ürünlere doğrudan USD fiyat.
7. Raporu tekrar çalıştırın. READY > 0 olunca `--export` ile XML alıp Merchant Center'a **elle** yükleyin.
