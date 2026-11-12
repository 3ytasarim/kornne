# KORNNE — Google Shopping ABD hazırlık listesi

Müşteri kararları (12.11.2026):
- Hedef ülke **US**, içerik dili **en**, feed etiketi **US**, para birimi **USD** (TR hariç tüm dillerde USD, KDV yok).
- Ticari unvan: **Mezbaha Teknolojileri**. İnternette resmi sicil kaydı bulunamadı; vergi no ve MERSİS eksik.
- Nakliye: yurt dışı her siparişe **sabit 100 USD**. Tutar sepette, ödemede ve siparişte görünür. Gümrük ve ithalat vergileri alıcıya ait.
- İade: teslimden itibaren 15 gün, önceden yazılı onayla. İade kargosu alıcıya ait; satıcı hatasında satıcıya ait.

Kaynak: Google Merchant Center yardım sayfaları (business info 14286818, misrepresentation 6150127, shipping 6324484, returns 14011730, product data 7052112, identifiers, landing page 4752265, merchant listing structured data). Kontrol tarihi 12.11.2026.

---

## A. Kodda hazır olanlar (deploy ile gelir)

- Yurt dışı siparişlere sabit 100 USD nakliye. Sepette "Shipping (flat rate)" satırı olarak görünür, sipariş toplamına girer ve admin sipariş ekranında da gösterilir.
- Merchant feed:
  - Para birimi hedef ülkeden gelir (US için USD).
  - Her ürüne `shipping` (US, 100.00 USD) eklenir.
  - KDV şartı yalnız TR hedefinde aranır.
  - TL girilmiş fiyat TCMB kuruyla çevrilir; admin'de "doğrudan USD girin" uyarısı çıkar.
  - Siparişe üretilen ürünler `in_stock` olarak gönderilir; temin süresi Merchant'taki işlem süresi alanına yazılır.
- Ürün sayfası yapısal verisi: Product + Offer (fiyat, USD, stok, yeni ürün), `shippingDetails` (US, 100 USD), `hasMerchantReturnPolicy` (US, 15 gün, posta ile iade, iade kargosu müşteriye ait), marka/MPN/GTIN (yalnız doğrulanmış olanlar). Offer yalnız doğrulanmış fiyat ve bilinen stok durumu varsa yazılır.
- Yeni İngilizce sayfalar, çeviri içe aktarımıyla oluşturulur ve footer'a eklenir:
  - **Shipping Policy:** `/page/shipping-policy`
  - **Privacy Policy:** `/page/privacy-policy`
  - **Return & Refund Policy:** EN `/page/return-and-refund-policy`, ayrıca DE/FR/RU/AR çevirileri
- Bilinmeyen bir sayfa adresi 500 yerine 404 döner. Sebep TCMB kur isteğinin önbelleksiz yapılmasıydı.
- İngilizce ve diğer dillerdeki "EFT / Havale" ifadeleri kaldırıldı.

## B. Sunucu

1. Kodu çekip derleyin.
2. Çeviri içe aktarımını çalıştırın; yeni sayfalar da bu adımda oluşur:
   - Önce deneme: `npx tsx scripts/i18n/import-translations.ts --db=neon`
   - Sonra uygulama: `npx tsx scripts/i18n/import-translations.ts --apply --confirm-db=<endpoint>`
3. `.env` dosyasında:
   - `SITE_INDEXABLE=true` ve `CATALOG_DATA_VERIFIED=true` ekleyin.
   - `GOOGLE_SITE_VERIFICATION=<kod>` ekleyin.
   - `SEO_LOCALES` satırını silin.
   - Ardından yeniden derleyin.
4. Cloudflare veya başka bir bot koruması varsa Googlebot, Googlebot-Image ve Storebot-Google engellenmemeli.

## C. Admin paneli (zorunlu, sırayla)

1. **Ayarlar** (her alanı girip "Doğrulandı" işaretleyin):
   - Ticari unvan: `Mezbaha Teknolojileri`
   - Merchant hedef ülke `US`, içerik dili `en`, feedLabel `US`
   - Kargo kuralları alanına Shipping Policy sayfasının özeti
2. **İçerik:** İade, Shipping ve Privacy sayfalarını okuyup **yasal onay** verin. Onay verilmeden sayfada "hukuki onay sürecinde" uyarısı görünür.
3. **Banka hesapları:** Para birimi USD olan aktif bir hesap ekleyin. Yoksa yabancı müşteri sipariş veremez.
4. **Her ürün için:**
   - **USD fiyat** girip onaylayın (VERIFIED).
   - **Stok durumu:** Stokta veya Siparişe üretilir. "Bilinmiyor" kalan ürün Google'a gönderilmez.
   - **Marka:** KORNNE markasını doğrulayın; Google yeni ürünlerde marka ister.
   - **MPN:** Model veya üretici kodu girin. Kod yoksa "tanımlayıcı yok" (identifier_exists=no) seçin. Barkod uydurulmaz.
5. Admin › Merchant ekranında "READY" sayısını kontrol edin.

## D. Merchant Center (Google tarafı)

1. **İşletme bilgisi:**
   - Unvan: Mezbaha Teknolojileri.
   - Adres: S.S. İstanbul Mermerciler Sanayi Sitesi 22. Sokak No: 15, Köseler Mah., Dilovası/Kocaeli, Türkiye.
   - Telefon: +90 535 406 80 02. E-posta: info@kornne.com.
   - Bu bilgiler sitedekiyle birebir aynı olmalı. Google isterse vergi levhası ve kimlik belgesi yüklenecek; fotokopi veya ekran görüntüsü kabul edilmez.
2. **Web sitesi:** `https://kornne.com` doğrulanıp hak talebi yapılmalı (HTML etiketi).
3. **Kargo:**
   - ABD için bir kargo hizmeti tanımlayın: sabit **100 USD**.
   - İşlem süresi (gün) ve taşıma süresi (gün) gerçek değerlerle girilmeli; tahmin yazılmamalı.
4. **İade politikası:**
   - Ülke US, iade kabul ediliyor, **15 gün**, posta ile, iade kargosu müşteriye ait.
   - Politika URL'si: `https://kornne.com/page/return-and-refund-policy`.
   - Google'ın incelemesi 10 iş gününe kadar sürebilir.
5. **Vergi:** ABD satış vergisi alanı boş bırakılır (1 Temmuz 2025'ten beri zorunlu değil).
6. **Ürünler:** Ürünler iki yoldan gelebilir:
   - Feed dosyası. Şu an yalnız admin'den indirilebilen önizleme var; Google'a otomatik gönderim (Merchant API) bağlı değil.
   - Google'ın ürün sayfalarındaki yapısal veriyi taraması ("otomatik ürünler").
   İlk aşamada en hızlısı: Admin › Merchant › Feed'den XML'i indirip Merchant Center'a dosya olarak yüklemek, ya da otomatik ürünleri açmak.
7. **Shopping reklamları için ayrıca:** Google Ads hesabını Merchant Center'a bağlayıp Shopping veya Performance Max kampanyası açmak gerekir. Ücretsiz listelemeler varsayılan olarak açıktır.

## E. Riskler

- **Ödeme:** Google "en az bir geleneksel ödeme yöntemi" ister. Sitede gerçek sipariş akışı var: banka bilgisi ve sipariş numarası veriliyor, yani faturayla ödeme. Google'ın yalnız havaleyi kabul edip etmediği resmi olarak yazılı değil. Kart ödemesi eklemek riski kaldırır.
- **Şeffaflık:** Türkiye'den gönderim, gümrük vergileri ve iade kargosu Shipping ve Return sayfalarında açıkça yazıyor. Gizlenirse "misrepresentation" nedeniyle hesap askıya alınabilir.
- **Ürün metinleri:** Testere ve bıçak açıklamalarında silah çağrışımı yapan ifade olmamalı; mevcut metinler endüstriyel.
- **Fiyat uyumu:** TL girilmiş fiyatlar günlük kurla değişir. Kesin uyum için ürünlere USD fiyat girin.
