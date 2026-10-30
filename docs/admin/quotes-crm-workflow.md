# Teklif CRM süreci (Sprint 6)

Sprint 5'te gelen gerçek teklif kayıtlarının üzerine kuruldu. Değişmeyenler:

- `TKL-…` referansları
- Ürün ve adet snapshot'ları
- Fiyatsızlık kuralı
- Idempotency
- Listede kişisel veri göstermeme

## Durum makinesi (`src/lib/admin/quotes.ts`)

| Mevcut durum | Geçilebilecek durumlar |
|---|---|
| Yeni (NEW) | İnceleniyor, Spam |
| İnceleniyor (IN_REVIEW) | Teklif hazırlandı, Sonuçlandı, Spam |
| Teklif hazırlandı (QUOTE_PREPARED) | Müşteriye iletildi, İnceleniyor, Sonuçlandı |
| Müşteriye iletildi (RESPONDED) | Sonuçlandı, İnceleniyor |
| Sonuçlandı (CLOSED) | İnceleniyor (yeniden açma) |
| Spam (SPAM) | İnceleniyor |

- **"Müşteriye iletildi":** panel e-posta göndermez. Operatör teklifin nasıl iletildiğini **yazmak zorundadır** (örn. "e-posta ile gönderildi 22.10"). Panel hiçbir zaman "gönderildi" iddiasında bulunmaz.
- **"Sonuçlandı":** sonuç seçimi zorunludur (kazanıldı, kaybedildi, yanıt gelmedi, mükerrer).
- **Kayıt:** her geçiş `QuoteStatusEvent` (önceki → yeni durum, yapan kişi, not) ve kişisel veri içermeyen bir denetim satırı (`quote.status_changed`) yazar.
- **Eşzamanlılık:** her yazma `QuoteRequest.version` ile iyimser kilitlenir. İki operatör aynı anda değiştirirse yalnız biri başarılı olur; diğeri "başka biri güncelledi" uyarısı alır. Entegrasyon testinde doğrulandı.

## Ekranlar

**Liste** (`/admin/quotes`):

- Göstergeler: bugün gelen, yeni, işlemde, takibi geçmiş, sonuçlanan.
- Filtreler: referans veya ürün adı, durum (açık dahil), sorumlu (bana atanan, atanmamış, kişi), kaynak; sıralama: yeni, eski, takip tarihi.
- 25'lik sayfalama.
- **Kişisel veri gösterilmez.**

**Detay** (`/admin/quotes/[id]`):

- İletişim bilgileri: yetkili rol görür; her görüntüleme `quote.viewed` olarak kaydedilir.
- Durum değiştirme, sorumlu atama, takip tarihi.
- İç notlar: düz metin, ekranda kaçışlanır, müşteri görmez; denetim kaydına not içeriği yazılmaz.
- Talep edilen ürünler (ürüne bağlantı), durum geçmişi, bildirim kuyruğu durumu.

**Diğer:**

- **Dışa aktarma:** `/admin/quotes/export`, yalnız Süper Yönetici ve Yönetici. UTF-8 BOM, `;` ayraçlı. Formül enjeksiyonuna karşı `= + - @` ile başlayan hücrelerin başına `'` eklenir. Yanıt `no-store`; satır sayısı denetim kaydına yazılır.
- **Müşteriler** (`/admin/customers`):
  - Teklif gönderenler e-posta veya telefona göre gruplanır; kişisel veri ikinci kez kopyalanmaz.
  - Liste maskelidir; URL'de kişisel veri değil, geri döndürülemez bir anahtar vardır.
  - Detay görüntülemeleri kayıt altına alınır.

## Yetkiler

| İşlem | Kimler |
|---|---|
| Liste ve detay görüntüleme (`quote.view`, `quote.view_pii`) | Süper Yönetici, Yönetici, Sipariş Operatörü |
| Durum değiştirme, atama, not, takip (`quote.manage`) | Süper Yönetici, Yönetici, Sipariş Operatörü |
| CSV dışa aktarma (`quote.export`) | Süper Yönetici, Yönetici |

- Atama yalnız `quote.manage` yetkisi olan **aktif** kullanıcılara yapılabilir.
- SEO editörünün sunucuya doğrudan gönderdiği durum değişikliği reddedilir (e2e testli).

## Bildirimler: bloke

- **Kuyruk:** yeni teklif kaydıyla **aynı veritabanı işleminde** `NotificationOutbox` tablosuna bir satır yazılır (transactional outbox). Satırda yalnız referans ve ürün satırı sayısı bulunur; kişisel veri yoktur.
- **Durum:** sağlayıcı ve alıcı tanımlı olmadığı için satır **`BLOCKED` ("Bekliyor — sağlayıcı yok")** kalır. Gönderen bir işlem yoktur; arayüz hiçbir zaman "gönderildi" göstermez.
- **Gerekenler:** e-posta veya SMS sağlayıcısı, gönderen alan adı (SPF/DKIM), alıcı adresi (`Ayarlar › Operasyon`) ve sağlayıcı adaptörü. Kuyruk yapısı buna hazırdır.

## Saklama ve silme: bloke

- Her talepte `retainUntil` alanı var: taslak süre **730 gün**.
- **Hukuki saklama süresi onaylanmadı.** Bu yüzden otomatik silme veya anonimleştirme işi **çalışmaz** ve panelde böyle bir düğme yoktur.
- `Ayarlar › Teklif saklama politikası` ekranı taslak süreyi ve süresi dolan kayıt sayısını gösterir.
- Onaydan sonra planlanan işlem:
  - Ad, firma, e-posta, telefon ve not alanları silinir.
  - Referans, tarih, ürün satırları ve durum geçmişi istatistik için kalır.
  - İşlem önce kuru çalıştırma (dry-run) olarak denenir ve denetim kaydına yazılır.
