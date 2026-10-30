# Açık Sorular ve Eksik Erişimler

## Erişimim olmayan sistemler (kontrol edilmedi)

| Sistem | Neden gerekli | İstenen erişim |
|---|---|---|
| kornne.com yönetim paneli / veritabanı (Hostinger) | Tam ürün/varyant/fiyat/stok verisi, sipariş & müşteri, orijinal görseller, gizli/yayında olmayan ürünler | DB dışa aktarımı (SQL dump) veya admin salt-okunur kullanıcı |
| Hostinger hPanel / dosya yöneticisi | `upload/` klasörünün tam yedeği, PDF'ler, e-posta (MX) ayarları | Yedek arşivi |
| Hetzner VPS | Nginx/PM2/port/disk/RAM denetimi | SSH kullanıcısı + **hangi sunucu** (yerelde iki bilinen host var; hangisinin KORNNE'ye ayrıldığını bilmiyorum, bağlanmadım) |
| Google Merchant Center | offerId, veri kaynağı, ret nedenleri | Salt-okunur kullanıcı + ürün CSV'si |
| Google Search Console | İndeksli URL'ler, sorgular, kapsama | Kullanıcı (kısıtlı) |
| GA4 (`G-9Q6H0QETRF`) / Google Ads | Olay/dönüşüm eşlemesi | Görüntüleyici |
| DNS (alan adı sağlayıcısı) | Geçiş planı, MX/SPF/DKIM korunması | Kayıt listesi ekran görüntüsü |

## Müşteriye sorular

1. **Resmi ticari unvan** hangisi: KORNNE A.Ş., Mezbaha Teknolojileri, KORNNE Mezbaha Teknolojileri? Vergi dairesi/no, MERSİS?
2. Mezbaha Teknolojileri (`mezbahateknolojileri.com.tr`) ile ilişki: grup şirketi mi? Kurumsal metin ve görseller ortak kullanılabilir mi?
3. Geçerli **telefon/e-posta** seti (sitede 7 farklı numara var).
4. Fiyatlar **KDV dahil mi**? Para birimi yalnız TL mi? Büyük makinelerde nakliye/kurulum dahil mi?
5. 11 üründeki **dil bazlı fiyat çelişkisinde** doğru fiyat hangisi? 6 "%0 / negatif indirim" ürünü için eski fiyat ne olmalı?
6. Hangi ürünler **teklif usulü** (sepete eklenmeyen) olmalı?
7. **Stok/teslim süresi** bilgisi var mı?
8. Ödeme: yalnız havale + WhatsApp mı? Sanal POS planı var mı (sağlayıcı)? **Gerçek IBAN'lar**?
9. Ürün **teknik özellikleri / katalog PDF'leri / videolar** için kaynak (üretici föyleri)?
10. EN/FR eşlemesi (`locale-product-mapping.csv`) doğru mu? RU ve AR ürün çevirilerini kim yapacak / onaylayacak?
11. Logo **vektör** dosyası (SVG/AI/PDF) var mı? Kurumsal renk kodları?
12. Kurumsal sayfadaki kırık 5 belge görseli (`belge1–5.jpg`) — sertifika mı? Orijinalleri?
13. Merchant Center'daki mevcut ürün kimlikleri ve veri kaynağı türü?
14. Staging alan adı (ör. `staging.kornne.com`) ve canlı alan adının nihai sahibi/DNS erişimi?
15. Kırmızı (#C62828) marka rengi kullanılacak mı? Logo yalnız lacivert/gümüş; tasarımda kırmızı şimdilik yalnız indirim/uyarı rengi.

## Teknik kararlar için bekleyenler

- Prod medya depolama: Hetzner VPS yerel disk mi, Hetzner Object Storage mı (S2).
- Neon bölgesi `eu-central-1` (Frankfurt); Hetzner sunucusu Falkenstein/Nuremberg ise gecikme kabul edilebilir — veya izole Hetzner PostgreSQL (ADR-001).
- **Güvenlik:** Neon bağlantı dizgesi (şifre dahil) yazışma üzerinden paylaşıldı. Kurulum tamamlanınca Neon panelinden `neondb_owner` şifresinin yenilenmesi ve uygulama için ayrı, yetkisi sınırlı bir rol açılması önerilir.
