# GO / NO-GO karar matrisi (Sprint 11)

> Karar **müşterinindir**. Teknik ekip kendi başına canlıya geçmez. Bugünkü durum: **her iki mod için NO-GO** (engeller aşağıda).
>
> Durum etiketleri:
>
> - `DONE`: hazır ve test edildi.
> - `READY`: araç hazır, uygulanacak.
> - `BLOCKED`: müşteri kararı veya erişimi gerekiyor.

## Mod A — Teklif odaklı kurumsal katalog
Fiyatlı satış **kapalı**, Merchant feed **kapalı**. Ziyaretçi ürünleri inceler, teklif listesi gönderir, WhatsApp/telefonla iletişime geçer.

| # | Koşul | Sorumlu | Durum |
|---|---|---|---|
| A1 | Neon parola rotasyonu + sırların yalnız sunucu `.env` dosyasında olması | Müşteri + teknik | **BLOCKED (P0)** |
| A2 | Hetzner VPS seçimi, salt-okunur denetim, preflight 0 engel | Müşteri + teknik | BLOCKED (sunucu belli değil) |
| A3 | Staging kurulumu + staging smoke/E2E yeşil | Teknik | READY |
| A4 | Teklif formu: kayıt, idempotency, oran sınırı, admin CRM | — | DONE (testli) |
| A5 | Teklif bildirimleri: e-posta sağlayıcısı + alıcı **veya** onaylı manuel takip prosedürü (admin'de günlük kontrol, sorumlu kişi) | Müşteri | **BLOCKED (P0)** |
| A6 | KVKK aydınlatma, çerez metni, teklif verisi saklama süresi (`operations.quoteRetentionDays` taslak 730 gün) hukuki onayı | Müşteri / hukuk | **BLOCKED (P0)** |
| A7 | Ticari unvan, vergi bilgileri (Organization ve iletişim sayfası) | Müşteri | BLOCKED |
| A8 | Admin erişimi: gerçek yöneticilerin davet edilmesi, ilk süper yönetici | Müşteri + teknik | READY |
| A9 | Medya: 445 orijinal kalıcı dizinde, 445/445 hash | Teknik | READY (yerelde DONE) |
| A10 | SEO: 263 URL 0 hata, 125 yönlendirme, TR index, diğer diller noindex, sitemap | — | DONE (prodlike) |
| A11 | Yedek: günlük DB + medya, geri yükleme provası | Teknik | READY (prova DONE) |
| A12 | DNS: TTL düşürme, **MX/SPF/DKIM/DMARC korunur**, Hostinger tam yedeği | Müşteri | BLOCKED (erişim) |
| A13 | Geri dönüş planı (uygulama / veri / DNS) | — | DONE (`release-and-rollback-runbook.md`) |
| A14 | Analitik ve çerez: ya kapalı ya da onaylı metin + GA4 erişimi | Müşteri | Kapalı yayın mümkün (analitik isteğe bağlı) |
| A15 | #208 kararı (yayın / kaldırma) | Müşteri | Yayını engellemez (307 korunur); karar bekliyor |
| A16 | EN/FR/RU/AR içerikleri | Müşteri | Yayını engellemez (noindex); indeks için onay gerekli |

**Mod A için GO şartı:** A1, A2, A3, A5, A6, A12 tamamlanmalı ve geri kalanlar READY/DONE olmalı. Hepsi müşteri tarafında: **bugün NO-GO.**

## Mod B — Fiyatlı e-ticaret + Google Merchant
Mod A'nın tamamı **+**:

| # | Koşul | Sorumlu | Durum |
|---|---|---|---|
| B1 | 41 fiyatın tek tek onayı (dört göz), KDV dahil/oran; geçersiz indirimlerin düzeltilmesi | Müşteri | **BLOCKED** (41/41 UNVERIFIED) |
| B2 | Gerçek stok / temin / teslim süresi | Müşteri | BLOCKED (41/41 bilinmiyor) |
| B3 | Şirket/vergi bilgileri, mesafeli satış sözleşmesi, iade, kargo/kurulum kuralları (hukuki onay) | Müşteri / hukuk | BLOCKED |
| B4 | Ödeme sağlayıcısı (sözleşme + sandbox) ve **başarılı sandbox mutabakatı** (imzalı webhook, iade, iptal) | Müşteri + teknik | BLOCKED (sağlayıcı yok) |
| B5 | `ENABLE_PAID_CHECKOUT` ve ticari kapı ön koşulları | Teknik (onayla) | Kapalı (kodda zorunlu) |
| B6 | Marka, GTIN/MPN veya `identifier_exists=no` kararı | Müşteri | BLOCKED |
| B7 | Merchant hesap erişimi, eski item_id dışa aktarımı ve eşleme onayı | Müşteri | BLOCKED |
| B8 | Görseller: 9 küçük ana görsel (31.01.2027 eşiği), WhatsApp görselleri | Müşteri | BLOCKED |
| B9 | Merchant politikaları (kargo, iade, işletme kimliği, web sitesi doğrulama) | Müşteri | BLOCKED |
| B10 | Merchant uygunluk motoru ≥ 1 READY, feed önizlemesi temiz, MOCK senkron yeşil | — | Motor DONE; bugün **0/40 READY** |
| B11 | Müşterinin açık "fiyatlı satış + Merchant" onayı | Müşteri | BLOCKED |

**Mod B için GO şartı:** Mod A GO + B1–B11. **Bugün NO-GO.**

## Karar kaydı
| Tarih | Mod | Karar | Onaylayan | Not |
|---|---|---|---|---|
| — | A | NO-GO | — | P0 engeller: Neon rotasyonu, sunucu seçimi, bildirim süreci, hukuki metinler, DNS erişimi |
| — | B | NO-GO | — | A + fiyat/stok/ödeme/Merchant |
