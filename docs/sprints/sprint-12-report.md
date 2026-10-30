# Sprint 12 — B2B mağaza yeniden tasarımı + EFT/Havale sipariş akışı

Tarih: 23.10.2026 · Kapsam: müşteri talimatı (yazılı) — "Fiyatları al", "B2B olacak EFT ve Havale ile ödeme olacak",
yeni logo, profesyonel/modern e-ticaret görünümü, eski sitedeki `/siparisim-ne-durumda` ve `/odeme-bildirimi` akışları.
Müşteri kararları: **KDV dahil**, **TL sabit (admin'den güncellenir)**, **eski/üstü çizili fiyat gösterilmez**, **IBAN'ları müşteri admin panelden girer**.

## Yapılanlar

### Vitrin tasarımı
- **Logo:** müşterinin verdiği `robotıc systems & (600 x 160 piksel).webp` → `public/brand/kornne-wordmark.webp` (750×200, bayt bayt kopya) + koyu zemin için beyaz türevi `kornne-wordmark-white.webp`. Header'da masaüstü 48 px, mobil 34–36 px yükseklik; footer'da beyaz sürüm.
- **Header:** koyu B2B şeridi (B2B online mağaza · EFT/Havale · KDV dahil + Siparişim Ne Durumda / Ödeme Bildirimi / Banka Hesapları / telefon), geniş arama, sepet butonu (adet rozeti), alt satırda kategori menüsü.
- **Ana sayfa:** çizgili (grid desenli) koyu hero kaldırıldı. Yerine açık zeminli, gerçek ürün fotoğraflı ve fiyat etiketli vitrin hero'su; güven şeridi; görselli kategori kartları; fiyatlı "Öne çıkan ürünler"; 4 adımlı "Nasıl sipariş verilir?" + çalışılan 6 banka; proje/toplu alım CTA.
- **Ürün kartı:** KDV dahil fiyat + tek tıkla "Sepete ekle"; seçenekli üründe "Bir seçenek seçin".
- **Ürün sayfası:** fiyat + KDV bilgisi, adet, "Sepete ekle", "Hemen sipariş ver", toplu alım için teklif bağlantısı.
- **Tipografi:** başlıklar Inter (sıkı harf aralığı); Roboto Slab yüklemesi kaldırıldı (bir font isteği daha az). Arapçada harf aralığı sıfırlanır.
- Butonlar hap (pill) biçiminde.

### Ticaret akışı (EFT / Havale)
- `/sepetim`: sepet satırları tarayıcıda (yalnız ürün no + adet); **fiyat, KDV ayrımı ve toplam her değişiklikte sunucuda** onaylı fiyatlardan hesaplanır.
- `/odeme`: firma unvanı, vergi dairesi, VKN/TCKN, yetkili, iletişim, fatura/teslimat adresi, not, sözleşme onayı → sipariş `AWAITING_PAYMENT`, numara `KRN-YYAAGG-XXXXX` → başarı ekranında tutar + aktif banka hesapları (IBAN kopyala) + ödeme bildirimi / takip bağlantıları. Kart bilgisi hiçbir yerde istenmez.
- `/odeme-bildirimi` (eski yol korundu): sipariş no + e-posta + gönderen + banka + tutar + tarih.
- `/siparisim-ne-durumda` (eski yol korundu): **sipariş no + e-posta** (eski site yalnız numara istiyordu; numara tek başına bilgi vermez), zaman çizelgesi.
- `/banka-hesaplari` (eski yol korundu): yalnız **aktif ve kontrol hanesi geçerli TR IBAN'lı** hesaplar; yer tutucu numara asla yayınlanmaz.
- Diğer diller için yol karşılıkları eklendi (`/en/order-status`, `/fr/avis-de-paiement` vb.).
- Güvenlik: idempotency anahtarı, honeypot + en az 3 sn doldurma süresi, IP/e-posta başına saatlik sınırlar, sunucu tarafı yeniden fiyatlama, sorgu/bildirimde "bulunamadı" yanıtı aynı.

### Admin
- **Siparişler:** liste (durum filtresi, bekleyen bildirim rozeti, TEST rozeti), detay (kalemler, KDV, bildirimler + tutar uyuşmazlığı uyarısı, durum geçmişi, fatura bilgileri).
- **EFT/Havale onayı:** yalnız Süper Admin/Admin (`order.confirm_payment`), kontrol notu zorunlu, çift tıklama onayı, denetim kaydı.
- **Durum ilerletme:** Hazırlanıyor → Sevk edildi → Teslim edildi / İptal (`order.manage`, Sipariş Operatörü dahil).
- **Banka hesapları** (`/admin/bank-accounts`): 6 banka hazır (pasif, IBAN boş); IBAN doğrulamalı kayıt, "Sitede göster", sıra, şube; denetim kaydında IBAN'ın kendisi değil yalnız "değişti" bilgisi.

## Veri ve ortam durumu (dürüst)
| Konu | Durum |
|---|---|
| 41 fiyat onayı | **Yalnız yerel test kopyasında uygulandı.** Neon'a yazma izin sisteminde reddedildi → müşteri/geliştirici komutu çalıştırmalı (aşağıda). |
| Sprint 12 migration (BankAccount, PaymentNotice, Order.paymentMethod) | Yerel it/e2e veritabanlarında. **Neon'a uygulanmadı.** Ek (additive) migration. |
| IBAN'lar | Ekran görüntüsündeki IBAN'lar yer tutucu (`TR 000…`). Yerel kopyada **sahte ama kontrol hanesi geçerli** IBAN'lar (`…0000 0000 0000 01`) yalnız tasarım/test için. Gerçek IBAN'lar admin panelden girilecek. |
| Online sipariş kapısı | Yerel önizlemede (`:3470`) yerel önizleme ortam değişkenleriyle açık (`tests/local-commerce-env.mjs`). Prod-like (`:3471`) ve production **kapalı** — satıcı unvanı/VKN, sözleşme hukuki onayı, sevkiyat kuralları ve `PAYMENT_PROVIDER=bank_transfer` tanımlanınca açılır. |
| Product JSON-LD `Offer` | Eklenmedi: stok/teslim durumu (availability) doğrulanmış veri değil. Stok bilgisi gelince eklenecek. |
| Sipariş e-postası | Outbox'a `BLOCKED` yazılıyor (SMTP/alıcı tanımlı değil). Başarı ekranı müşteriye numarayı not almasını söyler. |
| Analitik | Sepet olayı mevcut izinli `add_to_quote_list` olayıyla ölçülüyor; `add_to_cart`/`purchase` yasak listesi değişmedi (analitik zaten kapalı). |

## Neon'a uygulanması gereken komutlar (onayınızla, sırayla)
```
npx prisma migrate deploy
npx tsx scripts/pricing/approve-legacy-prices.ts --apply --confirm-db=ep-silent-dew-b9g275pf
```
(İlki DIRECT_URL ile çalışır; ikincisi önce kuru çalıştırma ile 41/41 eşleşmeyi gösterir — `--apply` olmadan.)

## Testler (23.10.2026, yerel izole veritabanı)
- TypeScript strict: 0 hata · ESLint: 0 · i18n: EN/FR/RU/AR eksiksiz
- Vitest: **216/216** (yeni: `tests/integration/b2b-orders.test.ts` — sunucu fiyatlama, idempotency, spam, sorgu, bildirim, admin onayı, IBAN; IBAN birim testi)
- Playwright: **177 geçti / 0 hata** (41 atlanan: çapraz tarayıcı projelerinin kapsamı dışındaki testler, önceki sprintlerle aynı). Yeni: `sprint12.spec.ts` (uçtan uca sipariş → bildirim → takip → admin onayı, axe, 375 px taşma), `commerce-locked.prodlike.spec.ts` (prod-like'ta kapı kapalı).
- Güncellenen eski testler: "fiyat gösterilmez / ödeme kapalı" varsayımları müşteri kararına göre "KDV dahil fiyat gösterilir / kart ödemesi yok / kilitli durum prod-like'ta" olarak değişti.
- Lighthouse (mobil, 3 koşu medyanı, `docs/qa/lighthouse-s12/`): ana sayfa **91** (önce 89), kategori **91** (90), ürün **91** (90), Arapça **89** (89); erişilebilirlik 100, best-practices 100. SEO 69 = yerel önizleme bilerek `noindex`.
- Ekran görüntüleri: `docs/qa/screens-s12/` (masaüstü + mobil: ana sayfa, kategori, ürün, sepet, sipariş, banka hesapları, sipariş takibi).
