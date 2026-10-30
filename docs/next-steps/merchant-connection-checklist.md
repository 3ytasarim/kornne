# Merchant Center bağlantı kontrol listesi (canlıya geçiş öncesi)

> Bu listedeki **hiçbir adım Sprint 9'da yapılmadı.** Her adım müşteri erişimi ve açık onay gerektirir. Mevcut Merchant hesabı, feed ve kampanyalar yeni sistem doğrulanana kadar olduğu gibi çalışmaya devam eder.

## 0. Ön koşul — güvenlik
- [ ] Yazışmada ifşa olan **Neon parolası yenilendi** (Neon Console → Roles → Reset password). Ardından:
  - [ ] Yerel `.env` dosyasında `DATABASE_URL` ve `DIRECT_URL` güncellendi (değer rapora veya yazışmalara yazılmaz).
  - [ ] Çalışan geliştirme sunucuları yeniden başlatıldı. Eski parolalı bağlantılar kopar; açık admin oturumları DB'de kaldığı için geçerli kalır.
  - [ ] `SECRETS_ROTATION_CONFIRMED=true` **yalnız** bu doğrulamadan sonra girildi.

## 1. Erişim ve salt-okunur keşif
- [ ] Müşteri, Merchant Center'a ayrı bir **servis hesabı** ekledi. İlk aşamada yalnız okuma yetkisi var; yazma yetkisi ancak 5. adımda verilecek.
- [ ] Anahtar dosyası sunucuda erişimi kısıtlı bir yolda duruyor (`GOOGLE_SERVICE_ACCOUNT_KEY_FILE`). Git'e girmiyor.
- [ ] Salt-okunur keşifte şunlar kaydedildi (Admin › Ayarlar › Google Merchant hedefi, süper yönetici doğrulaması):
  - hesap no
  - veri kaynakları ve türleri (otomatik tarama / dosya / API)
  - hedef ülke ve dil
  - feedLabel
  - para birimi
  - Google Ads bağlantısı
- [ ] Mevcut ürün listesi dışa aktarıldı (id, title, link, language, feed label).

## 2. Eski feed ve id eşleme
- [ ] Dışa aktarım Admin › Merchant › Eski item_id eşleme ekranında önizlendi.
- [ ] Eşleşmeyen, yinelenen ve çakışan satırlar müşteriyle tek tek karara bağlandı.
- [ ] Onaylı eşlemeler `MerchantItemMapping` tablosuna yazıldı (Sprint 10+ işi, ayrı onay). **Eski offerId'ler korunur.**
- [ ] **Geri dönüş planı:** yeni API veri kaynağı devre dışı bırakılır, eski feed hiç durdurulmadığı için ürünler eski kaynaktan beslenmeye devam eder.

## 3. Ürün verisi onayları (her biri READY için zorunlu)
- [ ] **Fiyat:** 41 fiyat tek tek yetkili onayıyla doğrulandı (dört göz kuralı: öneren ≠ onaylayan). KDV dahil, oranı belli. Toplu onay yok.
- [ ] **Stok:** her ürün için gerçek `availability` girildi (in_stock / out_of_stock / preorder / backorder). Preorder ve backorder için gerçek teslim tarihi var.
- [ ] **Tanımlayıcılar:** üretici GTIN'i varsa girildi; yoksa MPN + marka; o da yoksa müşteri teyidiyle `identifier_exists=no`. Barkod üretilmez.
- [ ] **Marka:** KORNNE markası (kendi üretim mi?) doğrulandı.
- [ ] **Görseller:** 500 px altı 9 ana görselin orijinali alındı (≥ 1500 px önerilir). 6 kırık görselin durumu kararlaştırıldı. WhatsApp ve ekran görüntüsü kaynaklı görseller filigran/yazı açısından incelendi.
- [ ] **Açıklamalar:** politika ihlali (telefon, URL, promosyon) yok.
- [ ] **Çeviriler:** hedef dil TR değilse 74 EN/FR eşleşmesi karara bağlandı ve çeviriler yayımlandı.

## 4. İşletme ve politika
- [ ] Ticari unvan, vergi dairesi ve vergi no doğrulandı. Kaynak sitede üç farklı satıcı kimliği vardı.
- [ ] İade politikası hukuken onaylandı (`legalApprovedAt`). Mesafeli satış sözleşmesi ve KVKK metinleri de onaylandı.
- [ ] Kargo / nakliye kuralları doğrulandı ve Merchant hesabında kargo ayarı yapıldı.
- [ ] **Ödeme:** Merchant'ta fiyatlı ürün ilanı, sitede satın alınabilirlik gerektirir. `ENABLE_PAID_CHECKOUT` + ödeme sağlayıcısı + hukuki onay müşteri kararıdır. Teklif modeli sürecekse ürünler feed'e **girmez**.
- [ ] **Web sitesi doğrulama:** yeni alan adı veya sunucu Merchant'ta "verified & claimed" durumda. DNS ve meta doğrulaması cutover adımında, müşteri onayıyla yapılır.

## 5. Bağlantı ve kademeli geçiş
- [ ] Staging'de (Hetzner, Basic Auth) `MERCHANT_API_ENABLED=true` açıldı ve hesap `MERCHANT_ACCOUNT_ALLOWLIST` listesine eklendi. **Ayrı bir API veri kaynağı** ile 1 ürün test edildi; eski kaynak silinmedi.
- [ ] MOCK sonuçları ile gerçek sonuçlar karşılaştırıldı. `MerchantSyncRun` ve denetim kaydı incelendi.
- [ ] Aynı offerId'lerle kademeli genişleme yapıldı. 2–4 hafta ret oranı, Ads performansı ve teşhis ekranı izlendi.
- [ ] Hatalar ve reddedilen ürünler Admin › Merchant'a raporlandı (Sprint 10+: ürün durumu okuma).

## 6. Search Console / GA4 (yalnız plan)
- [ ] GSC mülkü (Domain property) için DNS TXT doğrulaması cutover adımında, müşteri onayıyla yapılacak. Sitemap gönderimi canlıya geçişten sonra.
- [ ] GA4: çerez onayı (KVKK) olmadan etiket yüklenmeyecek. Consent Mode v2 varsayılanları "denied" olacak. Ölçüm kimliği yalnız ortam değişkeninden okunacak. Sahte veri üretilmeyecek.
