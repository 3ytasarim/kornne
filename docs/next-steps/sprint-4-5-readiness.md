# Sprint 4+5 (Ürün detayları + Checkout) Hazırlık Durumu

**Genel durum:** Teknik temel hazır. **Ticari engeller müşteri onayı bekliyor.** Fiyat ve KDV doğrulanmadan checkout, sepet ve Merchant açılmayacak.

## Teknik olarak hazır

- Neon'da 41 ürün, fiyat (UNVERIFIED), stok (UNKNOWN), varyant, medya, köken ve yönlendirme verisi. Import idempotent ve geri alınabilir.
- `Price.status` kapısı: VERIFIED olunca vitrin, `Offer` ve sepet aynı tek kaynaktan çalışır (kuruş, BigInt).
- Ürün detay şablonu: galeri/zoom, teklif kutusu, varyant listesi, ilgili ürünler. `ProductSpec` modeli doğrulanmış teknik tablo için hazır.
- Admin RBAC, audit log, Katalog QA (eşleşme onayı).

## Müşteriden gereken onaylar / erişimler (bloklayıcı)

| # | Konu | Neden gerekli | Durum |
|---|---|---|---|
| 1 | **Resmi şirket unvanı** (KORNNE A.Ş.? Mezbaha Teknolojileri?), vergi dairesi/no, MERSİS | Mesafeli satış, fatura, JSON-LD Organization, yasal sayfalar | Bekliyor |
| 2 | **KDV** — fiyatlar KDV dahil mi, oran | Fiyatı VERIFIED yapmanın ön şartı | Bekliyor |
| 3 | **Aktif satış fiyatları** — 41 ürün; 11 dil çelişkisi; 6 hatalı eski fiyat | Vitrin fiyatı, Offer, sepet | Bekliyor |
| 4 | **Teklif usulü ürünler** (büyük makineler) | `saleMode = QUOTE_ONLY` | Bekliyor |
| 5 | **Ödeme yöntemleri** — havale (gerçek IBAN'lar), sanal POS sağlayıcı ve sözleşmesi | Sprint 5 checkout | Bekliyor (eski sitede IBAN'lar sıfır) |
| 6 | Kargo/kurulum kuralları, stok/teslim süresi | Checkout, `availability` | Bekliyor |
| 7 | **EN/FR dil eşleşmelerinin onayı** (74 öneri; 8 düşük güvenli) | EN/FR ürün sayfaları ve hreflang | Admin › Katalog QA'da bekliyor |
| 8 | RU/AR ürün çevirileri (kim yazacak, kim onaylayacak?) | RU/AR ürün sayfaları | Bekliyor |
| 9 | **Hostinger admin / DB export** (gizli ürün, varyant fiyatı, sipariş/müşteri) | Tam veri; varyant #107 fiyatı | Erişim yok |
| 10 | **Staging alan adı + hangi Hetzner VPS** | Staging deploy (Basic Auth + noindex) | Bekliyor |
| 11 | Teknik föyler / PDF / sertifikalar (kırık `belge1–5.jpg`) | Teknik tablo (S4), kurumsal | Bekliyor |
| 12 | #208 İkizray Kurban Kancası yayın kararı | Görünürlük | Bekliyor |
| 13 | **Neon `neondb_owner` şifresinin yenilenmesi** (yazışmada paylaşıldı) + uygulama için yetkisi sınırlı rol | Güvenlik | **Önerildi, yapılmadı** (bizim erişimimiz yok) |
| 14 | Merchant Center salt-okunur erişim / ürün CSV | `offerId` koruması (S9) | Erişim yok |

## Sprint 4+5 öncesi teknik öneriler

- İlk commit ve özel uzak depo, ardından CI (lint/typecheck/test/build).
- Neon'da `production` branch ile geliştirme branch'ini ayırmak (Neon konsolu / API anahtarı gerekiyor).
- Performans: header istemci JS'ini azaltmak (mobil 90+ hedefi).
