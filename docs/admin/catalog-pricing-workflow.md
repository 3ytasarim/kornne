# Katalog, çeviri ve fiyat onay süreçleri (Sprint 6)

## Ürün düzenleme

**Ekran:** `/admin/products`. Liste özellikleri:

- Türkçe karakter duyarlı arama ("dos acma" yazınca "Döş Açma" bulunur).
- Filtreler: kategori, yayın durumu, veri kalitesi (dil-fiyat çelişkisi, hatalı indirim, bekleyen veya onaylı fiyat, görselsiz), dil sürümü.
- Sıralama ve sayfalama (25 ürün).
- Erişilebilir toplu seçim.

**Ürün ekranının sekmeleri** (`/admin/products/[id]`):

| Sekme | Yapılabilenler | Kural |
|---|---|---|
| İçerik ve durum | Türkçe ad, adres (slug), kısa açıklama, zengin metin açıklama, SEO başlığı ve açıklaması; yayın durumu, SKU, sıra | Adres değişince eski adres **tek adımda 301** ile yeni adrese gider; eski yönlendirmeler de yeni adrese çevrilir. Adres bir yönlendirmenin kaynağıysa kabul edilmez. HTML sunucuda izin listesiyle temizlenir. |
| Diller | EN/FR/RU/AR metinleri ve SEO alanları; dil başına yayınla veya yayından kaldır | Dil sürümü yalnız eşleşme onayıyla (EN/FR) ya da editörün gerçek çevirisiyle taslak olarak oluşur. Yayın ayrı bir adımdır. |
| Kategori ve ilişkiler | Kategoriler ve birincil kategori; en fazla 8 ilgili ürün | "Tüm Ürünler" sanal listedir, seçilemez. İlgili ürün seçilmezse vitrinde aynı kategoriden ürünler gösterilir. |
| Seçenekler | Seçenek adları (5 dil), aktif/pasif, sıra, yeni seçenek | Mevcut seçenek **silinmez**, çünkü teklifler ona bağlıdır. #107'de seçim zorunluluğu korunur. |
| Görseller | Sıra, ana görsel, kütüphaneden bağlama, ayırma, yükleme | Ayırma yalnız ürün bağlantısını kaldırır; dosya ve eski `/upload` adresi kalır. |
| Teknik bilgi ve doküman | Özellik ekle/düzenle; kaynakla doğrula; PDF yükle ve doğrula | Vitrinde yalnız **doğrulanmış** özellik ve doküman görünür. Değeri değişen özellik yeniden doğrulanmalıdır. |
| Geçmiş | Ürün ve fiyat denetim kayıtları (önce/sonra, kim, ne zaman) | Kişisel veri ve gizli bilgi yazılmaz. |

**Diğer kurallar:**

- **Silme:** ürün fiziksel olarak silinmez; "Taslak" veya "Arşiv" yapılır. Toplu işlem yalnız taslağa alma ve arşivleme içindir; toplu yayınlama bilerek yoktur. Taslak veya arşivdeki ürünün adresi geçici **307** ile kategorisine gider; kalıcı yönlendirme kararı ayrıca verilir.
- **İncelemedeki ürün (#208):** yayına çıkması için "İncelemeyi tamamla" onayı (`product.review_clear`: yalnız Süper Yönetici veya Yönetici) ve yazılı gerekçe gerekir. #208 bu sprintte **değiştirilmedi**: hâlâ DRAFT ve `needsReview`, eski URL 307 ile yönleniyor.
- **İçe aktarma çakışması:** importer, editörün değiştirdiği satırın checksum'ı tutmadığı için onu atlar (`skippedEdited`). Editör fiyat girmişse eski fiyat satırları yeniden eklenmez. Değişmemiş metni tekrar kaydetmek "düzenlendi" sayılmaz; aynı metin bayt bayt korunur.
- **Önbellek:** kayıttan sonra yalnız etkilenen rota desenleri yenilenir (ürün, kategori, arama, ana sayfa); tüm site yeniden üretilmez. Yenileme başarısız olursa editör uyarılır ve değişiklik en geç ISR süresi (5 dk) sonunda görünür.
- **Önizleme:** `/admin/products/[id]/preview` taslak, inceleme ve arşiv ürünlerini vitrin bileşenleriyle gösterir. Yalnız yöneticiler görebilir ve sayfa indekslenmez.

## Fiyat merkezi

**Ekranlar:** `/admin/pricing` (liste, filtreler) ve `/admin/pricing/[productId]` (geçmiş, öneri, karar).

1. **Ham kayıt:** eski siteden gelen 41 fiyat `UNVERIFIED` ve `LEGACY_IMPORT` olarak kalır. Bu kayıtlar değiştirilmez ve **doğrudan onaylanamaz**, çünkü KDV durumu bilinmiyor.
2. **Öneri** (`price.propose`: Süper Yönetici, Yönetici, Ürün Editörü). Girilen bilgiler:
   - Satış fiyatı (TR biçimi, kuruş olarak BigInt saklanır).
   - Eski fiyat: yalnız satış fiyatından **yüksekse**; aksi hâlde reddedilir, negatif veya sahte indirim olmaz.
   - KDV dahil/hariç, KDV oranı, para birimi (yalnız TRY), geçerlilik tarihleri.
   - **Fiyatın kaynağı** (zorunlu).
3. **Onay** (`price.approve`: Süper Yönetici, Yönetici):
   - **Dört göz kuralı:** öneren kişi kendi önerisini onaylayamaz.
   - Aynı anda iki onay gelirse yalnız biri geçer.
   - Onaylanan fiyat önceki onaylı fiyatın geçerliliğini o an sona erdirir; eski kayıt silinmez.
4. **Ret, geri çekme, geri alma:**
   - Öneri gerekçeyle reddedilir; öneren kişi kendi önerisini geri çekebilir.
   - Onaylı fiyat gerekçeyle geri alınır. Vitrin yeniden "Fiyat için teklif alın" gösterir; kayıt kalır.
5. **Geçmiş:** her kayıt ve olay kalıcıdır. Öneri, onay, ret, geri çekme, geri alma ve sona erme `PriceEvent` ve denetim kaydına yazılır.
6. **Toplu onay yoktur:** ne ekranda ne API'de.
7. **Online satış ayrı bir karardır.** Onaylı fiyat yalnız vitrindeki **gösterimi** değiştirir. Sepet ve ödeme `commerceGate` ile sunucu tarafında kapalı kalır. Kapının açılması için şunların tamamı gerekir: satıcı unvanı ve vergi no, KDV modu, kargo onayı, yasal metin onayı, ödeme sağlayıcısı. Panelde bu kapıyı açan bir ayar yoktur.
8. **Dil-fiyat çelişkileri:** EN/FR kaydındaki farklı fiyatlar listede ve detayda gösterilir. Sistem bunları tek bir fiyata **otomatik dönüştürmez**.

### 41 fiyatın durumu (22.10.2026, sprint sonu)

| | Adet |
|---|---:|
| Toplam ürün fiyatı (ham) | 41 |
| `VERIFIED` | **0** |
| Yönetici önerisi | 0 (testlerin oluşturduğu öneriler temizlendi) |
| Dil-fiyat çelişkili ürün | 11 |
| Hatalı indirim (eski fiyat ≤ satış) | 6 |

Vitrinde 41 ürünün hiçbirinde fiyat görünmez ve JSON-LD'de `Offer` üretilmez. E2E testi bunu öneri girildikten sonra da doğruluyor.

## Kategoriler, medya

- **Kategoriler** (`/admin/categories`): 5 dilde ad, adres, açıklama, SEO alanları ve sıra. Adres değişince eski adres 301 ile yönlenir.
- **Medya** (`/admin/media`):
  - Listedeki filtreler: kullanım, alt metin durumu, kaynak.
  - 445 orijinal salt-okunur dosyadır; alt metin ve açıklama 5 dilde düzenlenir.
  - Yükleme:
    - Dosya türü **içerikten** belirlenir.
    - Görsel çözümlenebilmeli ve biçimi uyumlu olmalı; SVG reddedilir.
    - Görsel en fazla 10 MB / 40 MP, PDF en fazla 20 MB.
    - Dosya adı güvenli biçimde üretilir; mevcut dosyanın üzerine yazılmaz.
    - Aynı dosya (aynı SHA-256) ikinci kez saklanmaz.
  - Kaynakta kırık 6 görsel raporlanır, "onarılmaz" ve 404 döner.
