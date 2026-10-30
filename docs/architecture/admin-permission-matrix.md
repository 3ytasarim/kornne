# Admin yetki matrisi (Sprint 6)

Kaynak kod: `src/lib/auth/rbac.ts`. Aşağıdaki tablolar bu dosyadan **otomatik üretildi**; kod değişirse tablo da yeniden üretilmelidir.

## İki katman, ikisi de sunucuda

1. **Modül erişimi (ekran):** Her admin sayfası ilk satırda `requireAdmin(modül)` çağırır. Oturum yoksa `/admin/login`'e, yetki yoksa `/admin?denied=1`'e yönlendirir.
2. **İşlem izni:** Her Server Action ve Route Handler ilk satırda `requirePermission(işlem)` çağırır.
   - **Varsayılan ret:** tabloda olmayan işlem kimseye açık değildir.
   - Reddedilen her deneme `auth.denied` olarak denetim kaydına yazılır: kim, hangi işlem; içerik kaydedilmez.

Menüde bir öğenin gizlenmesi yalnız kullanım kolaylığıdır, güvenlik kontrolü değildir. Bu, e2e testlerle kanıtlandı: düşük yetkili kullanıcı, yöneticinin form alanlarını doğrudan sunucuya gönderdiğinde işlem reddediliyor ve veritabanı değişmiyor.

| Modül (ekran) | SA | A | ÜE | SO | SEO |
|---|:-:|:-:|:-:|:-:|:-:|
| dashboard | ✓ | ✓ | ✓ | ✓ | ✓ |
| products | ✓ | ✓ | ✓ | — | — |
| pricing | ✓ | ✓ | ✓ | — | — |
| inventory | ✓ | ✓ | ✓ | — | — |
| media | ✓ | ✓ | ✓ | — | ✓ |
| orders | ✓ | ✓ | — | ✓ | — |
| quotes | ✓ | ✓ | — | ✓ | — |
| customers | ✓ | ✓ | — | ✓ | — |
| content | ✓ | ✓ | — | — | ✓ |
| translations | ✓ | ✓ | ✓ | — | ✓ |
| seo | ✓ | ✓ | — | — | ✓ |
| redirects | ✓ | ✓ | — | — | ✓ |
| merchant | ✓ | ✓ | — | — | — |
| settings | ✓ | ✓ | — | — | — |
| users | ✓ | — | — | — | — |
| audit | ✓ | ✓ | — | — | — |

| İşlem (sunucu) | SA | A | ÜE | SO | SEO |
|---|:-:|:-:|:-:|:-:|:-:|
| `product.edit` | ✓ | ✓ | ✓ | — | — |
| `product.publish` | ✓ | ✓ | ✓ | — | — |
| `product.review_clear` | ✓ | ✓ | — | — | — |
| `product.archive` | ✓ | ✓ | ✓ | — | — |
| `category.edit` | ✓ | ✓ | ✓ | — | — |
| `spec.verify` | ✓ | ✓ | ✓ | — | — |
| `document.manage` | ✓ | ✓ | ✓ | — | — |
| `price.propose` | ✓ | ✓ | ✓ | — | — |
| `price.approve` | ✓ | ✓ | — | — | — |
| `media.edit` | ✓ | ✓ | ✓ | — | ✓ |
| `media.upload` | ✓ | ✓ | ✓ | — | ✓ |
| `quote.view` | ✓ | ✓ | — | ✓ | — |
| `quote.view_pii` | ✓ | ✓ | — | ✓ | — |
| `quote.manage` | ✓ | ✓ | — | ✓ | — |
| `quote.export` | ✓ | ✓ | — | — | — |
| `customer.view_pii` | ✓ | ✓ | — | ✓ | — |
| `content.edit` | ✓ | ✓ | — | — | ✓ |
| `content.publish` | ✓ | ✓ | — | — | — |
| `menu.edit` | ✓ | ✓ | — | — | ✓ |
| `banner.edit` | ✓ | ✓ | — | — | ✓ |
| `faq.edit` | ✓ | ✓ | — | — | ✓ |
| `translation.decide` | ✓ | ✓ | ✓ | — | — |
| `translation.publish` | ✓ | ✓ | — | — | ✓ |
| `seo.edit` | ✓ | ✓ | — | — | ✓ |
| `redirect.view` | ✓ | ✓ | — | — | ✓ |
| `settings.view` | ✓ | ✓ | — | — | — |
| `settings.edit` | ✓ | ✓ | — | — | — |
| `settings.verify` | ✓ | — | — | — | — |
| `user.manage` | ✓ | — | — | — | — |
| `audit.view` | ✓ | ✓ | — | — | — |
| `orders.view` | ✓ | ✓ | — | ✓ | — |
| `merchant.view` | ✓ | ✓ | — | — | — |

Kısaltmalar: SA = Süper Yönetici · A = Yönetici · ÜE = Ürün Editörü · SO = Sipariş Operatörü · SEO = SEO / İçerik Editörü


## Veri alanı ve kişisel veri (PII) kuralları

| Veri | Liste ekranı | Detay ekranı | Dışa aktarma | Denetim |
|---|---|---|---|---|
| Teklif iletişim bilgisi (ad, firma, e-posta, telefon, not) | **Gösterilmez** (referans, tarih, durum, ürün, sorumlu) | `quote.view_pii`: SA, A, SO | `quote.export`: yalnız SA, A; CSV formül enjeksiyonuna karşı korumalı | Her görüntüleme `quote.viewed`; her dışa aktarma `quote.exported` (satır sayısı) |
| Müşteri (teklif kişisi) | Maskeli (`a***@k***.com`, `*** *** 02`); URL'de e-posta yok, 24 haneli geri döndürülemez anahtar var | `customer.view_pii`: SA, A, SO | — | `customer.viewed` |
| İç notlar | — | Yalnız teklif yetkilileri | — | `quote.note_added`: not metni kaydedilmez, yalnız not kimliği ve uzunluğu |
| Banka hesabı / bildirim alıcısı (ayarlar) | — | `settings.view`: SA, A | — | Değer yerine `[gizli]` yazılır |
| Parola, oturum, davet | Asla gösterilmez | Asla | Asla | Denetim kaydı `redact()` ile parola, hash ve token alanlarını kaldırır |

## Oturum ve kimlik doğrulama

- **Oturum:** veritabanında tutulur, 8 saat geçerlidir. Çerez `httpOnly`, `SameSite=strict`, üretimde `secure`. Veritabanında yalnız token'ın SHA-256'sı saklanır.
- **Giriş kilidi:** 15 dakikada 5 hatalı deneme; hem e-posta hem IP hash'i bazında. Davet sayfası da aynı tabloyla hız sınırlıdır.
- **Rol değişikliği veya pasifleştirme:** kullanıcının açık oturumları anında silinir; kullanıcı yeni rolüyle yeniden giriş yapar.
- **Korumalar:** kişi kendi rolünü değiştiremez, kendini pasif yapamaz; son aktif Süper Yönetici düşürülemez.
- **Davet ve şifre sıfırlama:** tek kullanımlık, 48 saat geçerli bağlantı. Sunucuda yalnız SHA-256'sı saklanır; iki eşzamanlı kullanımda yalnız biri başarılı olur.
- **MFA:** `User.mfaSecretEnc` alanı hazır ama etkin değil. Hiçbir ekran MFA varmış gibi göstermez.

## CSRF, origin ve tekrar gönderim

- **Server Actions:** Next.js `Origin` ile `Host` başlıklarını karşılaştırır. Yabancı origin'den gelen istek "Invalid Server Actions request" ile reddedilir (e2e testli).
- **Dışa aktarma:** GET isteğidir ve `SameSite=strict` çerez gerektirir; başka siteden tetiklenemez. Yanıt `no-store`.
- **Çift gönderim:** gönder düğmeleri sayfa etkileşime hazır olana kadar pasiftir. Kritik işlemler veritabanında koşullu güncellemeyle atomiktir: fiyat onayı, eşleşme kararı, çeviri yayını, teklif durumu (`version`), davet kullanımı. Eşzamanlı iki istekten yalnız biri başarılı olur.
- **Çakışan düzenleme:** ürün (`updatedAt`) ve içerik formları iyimser kilit kullanır. Başkası kaydettiyse kullanıcı uyarılır, sessiz üzerine yazma olmaz.

## Testler

- `tests/unit/admin.test.ts`: matris ve varsayılan ret.
- `tests/integration/admin-services.test.ts`: dört göz kuralı, eşzamanlılık, IDOR korumalı servisler.
- `tests/e2e/sprint67.spec.ts`:
  - Ürün editörü: kullanıcılar, teklifler, içerik ve ayarlar ekranlarında ret alır.
  - Ürün editörünün tekrarladığı fiyat onayı reddedilir ve `auth.denied` yazılır.
  - SEO editörünün tekrarladığı teklif durum değişikliği reddedilir.
  - Yabancı origin isteği reddedilir.
  - Dışa aktarma: anonim kullanıcı yönlendirilir, Sipariş Operatörü 403 alır, Süper Yönetici CSV alır.
